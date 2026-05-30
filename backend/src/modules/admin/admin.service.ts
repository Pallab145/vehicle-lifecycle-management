import prisma from '@/lib/prisma';
import createHttpError from 'http-errors';
import { ethers, type TransactionResponse } from 'ethers';
import { env } from '@/config/env';
import { SafeProposalStatus, SyncStatus, TxActionType } from '@/generated/prisma/client';
import { safeExecutionQueue } from '@/jobs/safe-execution.queue';
import { logger } from '@/lib/logger';
import { getSafeKit } from '@/lib/safe-kit';

export const adminService = {
    /**
     * Gets current Safe configuration from the blockchain
     */
    getSafeInfo: async () => {
        const safeKit = await getSafeKit();
        const owners = await safeKit.getOwners();
        const threshold = await safeKit.getThreshold();
        const nonce = await safeKit.getNonce();

        return {
            safeAddress: env.MORTH_GNOSIS_SAFE_ADDRESS,
            owners,
            threshold,
            nonce,
        };
    },

    /**
     * Internal function to create a new proposal. Not exposed via REST API.
     */
    createProposal: async (data: {
        to: string;
        calldata: string;
        value?: string;
        description: string;
        actionType: TxActionType;
        proposedById: string;
        targetEntityId?: string;
    }) => {
        const safeKit = await getSafeKit();
        const nonce = await safeKit.getNonce();

        const safeTransactionData = {
            to: data.to,
            data: data.calldata,
            value: data.value || '0',
            nonce,
        };

        const safeTransaction = await safeKit.createTransaction({ transactions: [safeTransactionData] });
        const safeTxHash = await safeKit.getTransactionHash(safeTransaction);
        const threshold = await safeKit.getThreshold();

        const proposal = await prisma.safeProposal.create({
            data: {
                id: safeTxHash,
                safeTxHash: safeTxHash,
                safeAddress: env.MORTH_GNOSIS_SAFE_ADDRESS,
                to: data.to,
                calldata: data.calldata,
                value: data.value || '0',
                safeNonce: BigInt(nonce),
                description: data.description,
                actionType: data.actionType,
                status: SafeProposalStatus.PENDING,
                threshold,
                proposedById: data.proposedById,
                targetEntityId: data.targetEntityId,
            }
        });

        return proposal;
    },

    listProposals: async (filters: { page: number; limit: number; status?: SafeProposalStatus }) => {
        const skip = (filters.page - 1) * filters.limit;

        const where = filters.status ? { status: filters.status } : {};

        const [total, proposals] = await Promise.all([
            prisma.safeProposal.count({ where }),
            prisma.safeProposal.findMany({
                where,
                include: {
                    _count: { select: { signatures: true } },
                    proposedBy: { select: { email: true, name: true, walletAddress: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: filters.limit
            })
        ]);

        return {
            total,
            page: filters.page,
            limit: filters.limit,
            proposals
        };
    },

    getProposal: async (id: string) => {
        const proposal = await prisma.safeProposal.findUnique({
            where: { id },
            include: {
                signatures: {
                    include: {
                        member: { select: { email: true, name: true } }
                    }
                },
                proposedBy: { select: { email: true, name: true, walletAddress: true } },
                targetEntity: { select: { name: true, code: true, type: true } }
            }
        });

        if (!proposal) throw createHttpError(404, 'Proposal not found');
        return proposal;
    },

    cancelProposal: async (id: string) => {
        const proposal = await prisma.safeProposal.findUnique({ where: { id } });
        if (!proposal) throw createHttpError(404, 'Proposal not found');
        if (proposal.status === SafeProposalStatus.EXECUTED) {
            throw createHttpError(400, 'Cannot cancel an already executed proposal');
        }

        return await prisma.safeProposal.update({
            where: { id },
            data: { status: SafeProposalStatus.CANCELLED, cancelledAt: new Date() }
        });
    },

    signProposal: async (id: string, signature: string, memberId: string, memberWallet: string) => {
        const proposal = await prisma.safeProposal.findUnique({
            where: { id },
            include: { signatures: true }
        });

        if (!proposal) throw createHttpError(404, 'Proposal not found');
        if (proposal.status !== SafeProposalStatus.PENDING) {
            throw createHttpError(400, `Proposal is no longer pending (current status: ${proposal.status})`);
        }

        if (proposal.signatures.some((s: { signerWallet: string }) => s.signerWallet.toLowerCase() === memberWallet.toLowerCase())) {
            throw createHttpError(400, 'You have already signed this proposal');
        }

        // Recover signer from signature using ethers
        // We assume frontend signs the safeTxHash using EIP-712 or eth_sign
        let recoveredWallet: string;
        try {
            // In EIP-712, the hash is the digest. 
            recoveredWallet = ethers.recoverAddress(id, signature);
        } catch (e) {
            throw createHttpError(400, 'Invalid signature format');
        }

        if (recoveredWallet.toLowerCase() !== memberWallet.toLowerCase()) {
            // Check if they used eth_sign (adds prefix)
            try {
                const ethSignRecovered = ethers.verifyMessage(ethers.getBytes(id), signature);
                if (ethSignRecovered.toLowerCase() !== memberWallet.toLowerCase()) {
                    throw createHttpError(401, 'Signature does not match your assigned wallet address');
                }
            } catch (e) {
                throw createHttpError(401, 'Signature does not match your assigned wallet address');
            }
        }

        // Check if signer is an actual Safe owner
        const safeKit = await getSafeKit();
        const owners = await safeKit.getOwners();
        if (!owners.map((o: string) => o.toLowerCase()).includes(memberWallet.toLowerCase())) {
            throw createHttpError(403, 'Your wallet is not an owner of the MoRTH Safe');
        }

        const newSignature = await prisma.safeSignature.create({
            data: {
                proposalId: id,
                signerWallet: memberWallet,
                signature: signature,
                memberId: memberId
            }
        });

        const totalSignatures = proposal.signatures.length + 1;

        if (totalSignatures >= proposal.threshold) {
            // Update status and enqueue job
            await prisma.safeProposal.update({
                where: { id },
                data: { status: SafeProposalStatus.THRESHOLD_MET }
            });

            await safeExecutionQueue.add('executeSafeTx', { proposalId: id });
            return {
                success: true,
                message: 'Signature accepted. Threshold met. Execution queued.',
                signature: newSignature
            };
        }

        return {
            success: true,
            message: 'Signature accepted.',
            signature: newSignature
        };
    },

    executeProposalFallback: async (id: string) => {
        const proposal = await prisma.safeProposal.findUnique({ where: { id } });
        if (!proposal) throw createHttpError(404, 'Proposal not found');

        if (proposal.status !== SafeProposalStatus.EXECUTION_FAILED && proposal.status !== SafeProposalStatus.THRESHOLD_MET) {
            throw createHttpError(400, `Cannot manually execute proposal with status: ${proposal.status}`);
        }

        await safeExecutionQueue.add('executeSafeTx', { proposalId: id });
        return { success: true, message: 'Execution manually re-queued.' };
    },

    // ── Worker Functions ──

    markProposalAsFailed: async (id: string) => {
        await prisma.safeProposal.update({
            where: { id },
            data: { status: SafeProposalStatus.EXECUTION_FAILED }
        });
    },

    /**
     * Core execution function called by the BullMQ safe-execution worker.
     *
     * Production-grade 3-layer safety architecture:
     *
     *   Layer 1 (Immediate) — Store SAFE_EXEC BlockchainTransaction with the
     *     Ethereum txHash RIGHT AFTER executeTransaction() returns — BEFORE .wait().
     *     If the server crashes before .wait() resolves, the reconciliation worker
     *     finds this PENDING record on its next sweep and checks the receipt itself.
     *
     *   Layer 2 (Receipt) — .wait() confirms mining synchronously. On success, both
     *     the BlockchainTransaction and SafeProposal are updated atomically in a
     *     single Prisma $transaction.
     *
     *   Layer 3 (Event) — The indexer's ExecutionSuccess handler is an idempotent
     *     secondary guard. If the server crashes after .wait() but before the DB
     *     write completes, the indexer catches the on-chain event and marks the
     *     proposal EXECUTED on the next block delivery.
     */
    executeSafeTxInternal: async (id: string) => {
        const proposal = await prisma.safeProposal.findUnique({
            where: { id },
            include: { signatures: true }
        });

        if (!proposal) throw new Error('Proposal not found');
        if (proposal.status === SafeProposalStatus.EXECUTED) {
            logger.info({ proposalId: id }, 'Proposal already EXECUTED — skipping (idempotent).');
            return;
        }

        const safeKit = await getSafeKit();

        const safeTransactionData = {
            to: proposal.to,
            data: proposal.calldata,
            value: proposal.value,
            nonce: Number(proposal.safeNonce),
        };

        const safeTransaction = await safeKit.createTransaction({ transactions: [safeTransactionData] });

        // Gnosis Safe REQUIRES signatures sorted by signer address (ascending).
        // Each owner's signature must be added individually — Safe verifies each sig
        // against its corresponding owner address.
        const sortedSignatures = proposal.signatures
            .slice()
            .sort((a: { signerWallet: string }, b: { signerWallet: string }) =>
                a.signerWallet.toLowerCase().localeCompare(b.signerWallet.toLowerCase())
            );

        for (const sig of sortedSignatures) {
            // For a standard EOA (MetaMask/Ledger) ECDSA signature:
            //   staticPart()  → the raw 65-byte hex (without 0x) appended to the Safe calldata
            //   dynamicPart() → '' (only non-empty for EIP-1271 contract signatures)
            const sigData = sig.signature;
            safeTransaction.addSignature({
                signer: sig.signerWallet,
                data: sigData,
                isContractSignature: false,
                staticPart: () => sigData.startsWith('0x') ? sigData.slice(2) : sigData,
                dynamicPart: () => ''
            });
        }

        logger.info({ proposalId: id, sigCount: sortedSignatures.length }, 'Submitting Safe execTransaction to Besu...');
        const executeTxResponse = await safeKit.executeTransaction(safeTransaction);

        // `transactionResponse` is typed as `{}` in protocol-kit but is actually
        // an ethers v6 TransactionResponse which exposes `.hash` and `.wait()`.
        const txResponse = executeTxResponse.transactionResponse as TransactionResponse | undefined;
        const ethTxHash = txResponse?.hash;

        // ── LAYER 1: Persist txHash BEFORE .wait() ───────────────────────────
        // This is the critical production safety net. Even if the process dies
        // immediately after this line, the reconciliation worker will find the
        // PENDING record and poll the receipt autonomously on the next sweep.
        if (ethTxHash) {
            await prisma.blockchainTransaction.create({
                data: {
                    txHash:         ethTxHash,
                    actionType:     TxActionType.SAFE_EXEC,
                    status:         SyncStatus.PENDING,
                    safeProposalId: id,
                }
            }).catch((_err: unknown) => {
                // Unique constraint violation → this is a retry of a previous attempt.
                // The PENDING record already exists. Safe to continue.
                logger.warn({ proposalId: id, ethTxHash }, 'SAFE_EXEC BlockchainTransaction already exists — previous attempt detected, continuing.');
            });
        } else {
            logger.warn({ proposalId: id }, 'executeTransaction returned no transactionResponse — cannot store txHash. Proceeding anyway.');
        }

        // ── LAYER 2: Wait for receipt ─────────────────────────────────────────
        const receipt = await txResponse?.wait();

        if (receipt && receipt.status === 1) {
            // Atomically update both SafeProposal and BlockchainTransaction.
            // If this write fails, Layer 3 (indexer ExecutionSuccess event) will
            // catch the on-chain event and update SafeProposal as a fallback.
            await prisma.$transaction([
                prisma.safeProposal.update({
                    where: { id },
                    data: { status: SafeProposalStatus.EXECUTED, executedAt: new Date() }
                }),
                ...(ethTxHash ? [
                    prisma.blockchainTransaction.update({
                        where: { txHash: ethTxHash },
                        data: { status: SyncStatus.MINED, blockNumber: receipt.blockNumber }
                    })
                ] : [])
            ]);

            logger.info({ proposalId: id, ethTxHash, blockNumber: receipt.blockNumber },
                'Safe proposal EXECUTED successfully on-chain.');
        } else {
            // Transaction reverted — mark FAILED so the reconciliation worker does
            // not keep polling a known-bad txHash.
            if (ethTxHash) {
                await prisma.blockchainTransaction.update({
                    where: { txHash: ethTxHash },
                    data: { status: SyncStatus.FAILED }
                }).catch(() => {});
            }

            throw new Error(
                `Safe execTransaction reverted on-chain (proposalId: ${id}, txHash: ${ethTxHash ?? 'unknown'})`
            );
        }
    }
};
