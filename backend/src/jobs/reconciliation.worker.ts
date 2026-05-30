import { Worker, type ConnectionOptions } from 'bullmq';
import { JsonRpcProvider, Interface, type TransactionReceipt } from 'ethers';
import { getRedisClient } from '@/lib/redis';
import prisma from '@/lib/prisma';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import {
    SyncStatus, 
    TxActionType, 
    SafeProposalStatus,
    VehicleStatus, 
    TransferStatus, 
    ChallanStatus, 
    InsuranceStatus, 
    PucStatus, 
    LoanStatus,
    RegistrationStatus,
    type BlockchainTransaction
} from '@/generated/prisma/client';
import { RECONCILIATION_QUEUE_NAME } from './reconciliation.queue';
import { safeExecutionQueue } from './safe-execution.queue';
import { workerManager } from '@/lib/worker-manager';

// Import ABIs for event parsing
import DvpAbi from '@/abi/DigitalVehiclePassport.json';
import OwnershipAbi from '@/abi/OwnershipToken.json';
import ChallanAbi from '@/abi/ChallanContract.json';
import InsuranceAbi from '@/abi/InsuranceToken.json';
import PucAbi from '@/abi/PUCToken.json';
import LoanAbi from '@/abi/LoanContract.json';

const provider = new JsonRpcProvider(env.RPC_URL);

// Prepare Interfaces for fast log parsing
const interfaces = {
    dvp: new Interface(DvpAbi),
    ownership: new Interface(OwnershipAbi),
    challan: new Interface(ChallanAbi),
    insurance: new Interface(InsuranceAbi),
    puc: new Interface(PucAbi),
    loan: new Interface(LoanAbi),
};

export const reconciliationWorker = new Worker(RECONCILIATION_QUEUE_NAME, async (job) => {
    logger.info({ jobId: job.id }, 'Starting global blockchain reconciliation sweep...');

    await reconcileTransactions();
    
    logger.info('Global blockchain reconciliation sweep completed.');
}, {
    connection: getRedisClient() as unknown as ConnectionOptions,
    concurrency: 1
});

workerManager.add(reconciliationWorker);

async function reconcileTransactions() {
    // Find transactions pending for more than 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const BATCH_SIZE = 50;
    let cursor: string | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
        const stuckTxs: BlockchainTransaction[] = await prisma.blockchainTransaction.findMany({
            where: {
                status: SyncStatus.PENDING,
                createdAt: { lt: fiveMinutesAgo }
            },
            take: BATCH_SIZE,
            skip: cursor ? 1 : 0,
            cursor: cursor ? { id: cursor } : undefined,
            orderBy: { id: 'asc' }, // Required for stable cursor pagination
        });

        if (stuckTxs.length === 0) {
            hasMore = false;
            break;
        }

        logger.info({ count: stuckTxs.length }, 'Processing batch of stuck blockchain transactions for reconciliation');

        for (const tx of stuckTxs) {
            try {
                const receipt = await provider.getTransactionReceipt(tx.txHash);

                if (!receipt) {
                    // Transaction still pending in mempool or dropped. Wait for next sweep.
                    logger.debug({ id: tx.id, txHash: tx.txHash }, 'Transaction still pending or dropped on-chain');
                    continue;
                }

                if (receipt.status === 0) {
                    // Transaction Reverted! 
                    logger.warn({ id: tx.id, txHash: tx.txHash }, 'Transaction reverted on-chain. Marking FAILED and running Saga rollbacks.');
                    
                    await prisma.blockchainTransaction.update({
                        where: { id: tx.id },
                        data: { status: SyncStatus.FAILED, blockNumber: receipt.blockNumber }
                    });

                    // Run explicit rollback saga
                    await handleRevertedRollback(tx);
                    continue;
                }

                if (receipt.status === 1) {
                    // Transaction Succeeded! The Indexer missed the event.
                    logger.info({ id: tx.id, txHash: tx.txHash, action: tx.actionType }, 'Transaction succeeded but was missed by Indexer. Reconciling manually.');
                    await handleSuccessfulReconciliation(tx, receipt);
                }

            } catch (err) {
                logger.error({ err, txId: tx.id }, 'Error during transaction reconciliation');
            }
        }
        
        // Update cursor to the last processed item for the next iteration
        cursor = stuckTxs[stuckTxs.length - 1].id;
    }

    // ── FIX 3: Stuck THRESHOLD_MET proposals sweep ────────────────────────────
    // If the BullMQ job was lost (Redis restart, failed delivery), a proposal
    // can reach THRESHOLD_MET but never have execTransaction() called on it.
    // There will be NO BlockchainTransaction record (executionTx === null).
    // We auto-recover by re-queuing the job.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const stuckProposals = await prisma.safeProposal.findMany({
        where: {
            status: SafeProposalStatus.THRESHOLD_MET,
            updatedAt: { lt: tenMinutesAgo },
            executionTx: null   // No BlockchainTransaction → job never ran
        },
        take: 10,
        orderBy: { updatedAt: 'asc' }
    });

    if (stuckProposals.length > 0) {
        logger.warn({ count: stuckProposals.length }, 'Reconciler: Found stuck THRESHOLD_MET proposals — re-queueing execution jobs');
        for (const p of stuckProposals) {
            logger.warn({ proposalId: p.id, stuckSince: p.updatedAt }, 'Reconciler: Re-queueing stuck proposal');
            await safeExecutionQueue.add('executeSafeTx', { proposalId: p.id });
        }
    }
}

// Returns a Map<eventName, LogDescription> containing the first occurrence of each event.
function parseReceiptEvents(receipt: TransactionReceipt): Map<string, ReturnType<Interface['parseLog']>> {
    const eventMap = new Map<string, ReturnType<Interface['parseLog']>>();
    const allInterfaces = Object.values(interfaces);
    for (const log of receipt.logs) {
        for (const iface of allInterfaces) {
            try {
                const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
                if (parsed && !eventMap.has(parsed.name)) {
                    eventMap.set(parsed.name, parsed);
                }
            } catch { /* skip unparseable logs */ }
        }
    }
    return eventMap;
}

// Lazy block timestamp — only fetched when needed (e.g. CHALLAN_PAY/CANCEL).
async function getBlockTimestamp(blockNumber: number): Promise<Date> {
    const block = await provider.getBlock(Number(blockNumber));
    return block ? new Date(block.timestamp * 1000) : new Date();
}

async function handleSuccessfulReconciliation(tx: BlockchainTransaction, receipt: TransactionReceipt) {
    // Pre-parse all events from the receipt once — avoids redundant log iteration per handler.
    const events = parseReceiptEvents(receipt);

    await prisma.$transaction(async (db) => {
        // Mark the transaction as MINED
        await db.blockchainTransaction.update({
            where: { id: tx.id },
            data: { status: SyncStatus.MINED, blockNumber: receipt.blockNumber }
        });

        // ── SAFE_EXEC: Gnosis Safe execTransaction succeeded ──────────────────
        // Primary job: mark the SafeProposal EXECUTED.
        //
        // Secondary job: replay any business-level side-effect the indexer missed.
        //   - Registration:  the entity's onChainId is set by the indexer when it
        //     catches RTOReg / MfgReg / etc.  If the indexer missed the event,
        //     onChainId stays null — the entity can never be used on-chain.
        //     We back-fill it here by parsing the first *Reg event in the receipt.
        //   - Toggle:  same logic — isActive must match the on-chain state.
        //   - CHALLAN_CANCEL via adminCancelChallan: the ChallanCancelled event is
        //     emitted inside the Safe execTransaction. If the indexer missed it we
        //     must update challan.status here, otherwise the challan stays PENDING
        //     forever even though the Safe proposal is EXECUTED.
        if (tx.actionType === TxActionType.SAFE_EXEC && tx.safeProposalId) {
            const proposal = await db.safeProposal.findUnique({ where: { id: tx.safeProposalId } });
            if (proposal && proposal.status !== SafeProposalStatus.EXECUTED) {
                await db.safeProposal.update({
                    where: { id: tx.safeProposalId },
                    data: { status: SafeProposalStatus.EXECUTED, executedAt: new Date() }
                });
                logger.info({ proposalId: tx.safeProposalId, txHash: tx.txHash },
                    'Reconciler: Marked SafeProposal EXECUTED (indexer missed ExecutionSuccess event)');
            }

            // ── Side-effect replay: entity registration ───────────────────────
            // All entity-type registration events share the same arg structure:
            //   args[0] = onChainId (uint64)   args[1] = code (string)
            // We use proposal.targetEntityId directly instead of looking up by code.
            if (proposal?.actionType === TxActionType.B2B_ENTITY_REGISTER && proposal.targetEntityId) {
                const REG_EVENTS = ['RTOReg', 'MfgReg', 'PoliceReg', 'InsReg', 'CenterReg', 'BankReg', 'ScrapReg'];
                for (const evName of REG_EVENTS) {
                    const regEvent = events.get(evName);
                    if (regEvent) {
                        const onChainId = Number(regEvent.args[0]);
                        // updateMany with onChainId:null guard makes this idempotent
                        const updated = await db.b2BEntity.updateMany({
                            where: { id: proposal.targetEntityId, onChainId: null },
                            data: { onChainId }
                        });
                        if (updated.count > 0) {
                            logger.info({ entityId: proposal.targetEntityId, onChainId, evName },
                                'Reconciler: Entity onChainId back-filled (indexer missed registration event)');
                        }
                        break; // Only one Reg event can be in a single Safe execTransaction
                    }
                }
            }

            // ── Side-effect replay: entity toggle ─────────────────────────────
            // All toggle events share: args[0] = onChainId, args[1] = active (bool)
            if (proposal?.actionType === TxActionType.B2B_ENTITY_TOGGLE && proposal.targetEntityId) {
                const TOGGLE_EVENTS = ['RTOStatusToggled', 'MfgToggled', 'PoliceStatusToggled',
                                       'InsStatusToggled', 'CenterStatusToggled', 'BankStatusToggled', 'ScrapToggled'];
                for (const evName of TOGGLE_EVENTS) {
                    const toggleEvent = events.get(evName);
                    if (toggleEvent) {
                        const isActive = toggleEvent.args[1] as boolean;
                        await db.b2BEntity.update({
                            where: { id: proposal.targetEntityId },
                            data: { isActive }
                        });
                        logger.info({ entityId: proposal.targetEntityId, isActive, evName },
                            'Reconciler: Entity isActive back-filled (indexer missed toggle event)');
                        break;
                    }
                }
            }

            // ── Side-effect replay: admin challan cancel ──────────────────────
            // All three args of ChallanCancelled:
            //   args[0] = challanId (uint64 indexed)
            //   args[1] = ownTid   (uint256 indexed)
            //   args[2] = isAdminCancel (bool)
            if (proposal?.actionType === TxActionType.CHALLAN_CANCEL) {
                const cancelEvent = events.get('ChallanCancelled');
                if (cancelEvent) {
                    const challanId = cancelEvent.args[0] as bigint;
                    const isAdminCancel = cancelEvent.args[2] as boolean;
                    const challan = await db.challan.findUnique({ where: { challanId } });
                    if (challan && challan.status !== ChallanStatus.CANCELLED) {
                        const cancelledAt = await getBlockTimestamp(receipt.blockNumber);
                        await db.challan.update({
                            where: { challanId },
                            data: { status: ChallanStatus.CANCELLED, cancelledAt, isAdminCancel }
                        });
                        logger.info({ challanId: String(challanId) },
                            'Reconciler: Admin challan cancellation back-filled (indexer missed ChallanCancelled event)');
                    }
                }
            }
        }
        else if (tx.actionType === TxActionType.VEHICLE_MINT && tx.passportId) {
            const event = events.get('VehicleMfg');
            if (event) {
                const tokenId = event.args[0];
                await db.vehiclePassport.update({
                    where: { id: tx.passportId },
                    data: {
                        dvpId: Number(tokenId),
                        status: VehicleStatus.NOT_REG
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.VEHICLE_SCRAP && tx.passportId) {
            const event = events.get('VehicleScrapped');
            if (event) {
                // event: VehicleScrapped(uint256 tokenId, uint64 scrapId, uint32 scrapDate)
                const scrapId   = event.args[1];
                const scrapDate = event.args[2];
                // FIX #5: resolve scrapEntityId from on-chain scrapId
                const scrapEntity = await db.b2BEntity.findFirst({ where: { onChainId: Number(scrapId) } });
                await db.vehiclePassport.update({
                    where: { id: tx.passportId },
                    data: {
                        status: VehicleStatus.SCRAPPED,
                        scrapDate: new Date(Number(scrapDate) * 1000),
                        scrapEntityId: scrapEntity?.id || null
                    }
                });
                // Also deactivate ownership — mirrors what handleVehicleScrapped does
                await db.vehicleOwnership.updateMany({
                    where: { passportId: tx.passportId },
                    data: { isActive: false }
                });
            }
        }
        else if (tx.actionType === TxActionType.VEHICLE_ASSIGN_DEALER && tx.passportId) {
            const event = events.get('VehicleAssignedToDealer');
            if (event) {
                const dealer = event.args[2] as string;
                const dealerUser = await db.user.findUnique({
                    where: { walletAddress: dealer }
                });
                await db.vehiclePassport.update({
                    where: { id: tx.passportId },
                    data: {
                        dealerWallet: dealer,
                        dealerUserId: dealerUser?.id || null
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.VEHICLE_REGISTER_RTO && tx.passportId) {
            const event = events.get('VehicleReg');
            if (event) {
                const ownTid = event.args[0];
                const owner = event.args[1] as string;
                const dvpId = event.args[3];
                const ownerUser = await db.user.findUnique({
                    where: { walletAddress: owner }
                });
                
                // 1. Create the initial VehicleOwnership record
                await db.vehicleOwnership.create({
                    data: {
                        ownTid: Number(ownTid),
                        dvpId: Number(dvpId),
                        passportId: tx.passportId,
                        ownerWallet: owner,
                        ownerUserId: ownerUser?.id || null,
                        rtoEntityId: tx.b2bEntityId!,
                        regDate: new Date(),
                        isActive: true
                    }
                });

                // 2. Mark the passport as ACTIVE
                await db.vehiclePassport.update({
                    where: { id: tx.passportId },
                    data: {
                        status: VehicleStatus.ACTIVE
                    }
                });

                // 3. Mark the RegistrationRequest as APPROVED off-chain
                if (tx.b2bEntityId) {
                    const regReq = await db.registrationRequest.findFirst({
                        where: { 
                            dvpId: Number(dvpId), 
                            rtoEntityId: tx.b2bEntityId, 
                            status: RegistrationStatus.PENDING 
                        }
                    });
                    if (regReq) {
                        await db.registrationRequest.update({
                            where: { id: regReq.id },
                            data: { status: RegistrationStatus.APPROVED }
                        });
                    }
                }
            }
        }
        else if (tx.actionType === TxActionType.TRANSFER_INIT && tx.transferReqId) {
            const event = events.get('XferInit');
            if (event) {
                const reqId = event.args[0];
                const ownTid = event.args[1];
                const seller = event.args[2] as string;
                const buyer = event.args[3] as string;

                const sellerUser = await db.user.findUnique({ where: { walletAddress: seller } });
                const buyerUser = await db.user.findUnique({ where: { walletAddress: buyer } });

                await db.transferRequest.update({
                    where: { id: tx.transferReqId },
                    data: {
                        reqId: Number(reqId),
                        ownTid: Number(ownTid),
                        sellerOK: true,
                        status: TransferStatus.PENDING,
                        sellerUserId: sellerUser?.id || null,
                        buyerUserId: buyerUser?.id || null
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.TRANSFER_APPROVE_BUYER && tx.transferReqId) {
            const appEvent = events.get('XferApproved');
            const doneEvent = events.get('XferDone');

            if (doneEvent) {
                const newOwner = doneEvent.args[2] as string;
                const ownerUser = await db.user.findUnique({ where: { walletAddress: newOwner } });

                const updatedReq = await db.transferRequest.update({
                    where: { id: tx.transferReqId },
                    data: {
                        buyerOK: true,
                        status: TransferStatus.RTO_APPROVED,
                        completedDate: new Date()
                    }
                });

                await db.vehicleOwnership.update({
                    where: { id: updatedReq.ownershipId },
                    data: {
                        ownerWallet: newOwner,
                        ownerUserId: ownerUser?.id || null,
                        transferCount: { increment: 1 }
                    }
                });
            } else if (appEvent) {
                await db.transferRequest.update({
                    where: { id: tx.transferReqId },
                    data: {
                        buyerOK: true,
                        status: TransferStatus.BUYER_ACCEPTED
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.TRANSFER_APPROVE_RTO && tx.transferReqId) {
            const doneEvent = events.get('XferDone');
            if (doneEvent) {
                const newOwner = doneEvent.args[2] as string;
                const ownerUser = await db.user.findUnique({ where: { walletAddress: newOwner } });

                const updatedReq = await db.transferRequest.update({
                    where: { id: tx.transferReqId },
                    data: {
                        rtoOK: true,
                        status: TransferStatus.RTO_APPROVED,
                        completedDate: new Date()
                    }
                });

                await db.vehicleOwnership.update({
                    where: { id: updatedReq.ownershipId },
                    data: {
                        ownerWallet: newOwner,
                        ownerUserId: ownerUser?.id || null,
                        transferCount: { increment: 1 }
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.TRANSFER_CANCEL && tx.transferReqId) {
            await db.transferRequest.update({
                where: { id: tx.transferReqId },
                data: {
                    status: TransferStatus.CANCELLED
                }
            });
        }
        else if (tx.actionType === TxActionType.TRADE_CERT_ISSUE && tx.tradeCertId) {
            // FIX #4: Resolve dealerUserId from dealer wallet (args[0]) — missed in original.
            const event = events.get('TradeCertIssued');
            if (event) {
                const dealer = event.args[0] as string;
                const validTill = event.args[2];
                const dealerUser = await db.user.findUnique({ where: { walletAddress: dealer } });
                await db.tradeCert.update({
                    where: { id: tx.tradeCertId },
                    data: {
                        isActive: true,
                        validTill: new Date(Number(validTill) * 1000),
                        dealerUserId: dealerUser?.id || null
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.TRADE_CERT_REVOKE && tx.tradeCertId) {
            await db.tradeCert.update({
                where: { id: tx.tradeCertId },
                data: { isActive: false }
            });
        }
        else if (tx.actionType === TxActionType.CHALLAN_ISSUE && tx.challanId) {
            // FIX #1: Write ownTid from args[1] — ChallanIssued(challanId, ownTid, policeId, amount)
            const event = events.get('ChallanIssued');
            if (event) {
                await db.challan.update({
                    where: { id: tx.challanId },
                    data: {
                        challanId: BigInt(event.args[0]),
                        ownTid: BigInt(event.args[1]),
                        status: ChallanStatus.PENDING
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.CHALLAN_PAY && tx.challanId) {
            // FIX #10: Use on-chain block timestamp, not server wall-clock time.
            const paidAt = await getBlockTimestamp(receipt.blockNumber);
            await db.challan.update({
                where: { id: tx.challanId },
                data: { status: ChallanStatus.PAID, paidAt }
            });
        }
        else if (tx.actionType === TxActionType.CHALLAN_CANCEL && tx.challanId) {
            // FIX #2: Write isAdminCancel from args[2] — ChallanCancelled(challanId, ownTid, isAdminCancel)
            // FIX #10: Use on-chain block timestamp.
            const cancelledAt = await getBlockTimestamp(receipt.blockNumber);
            const event = events.get('ChallanCancelled');
            await db.challan.update({
                where: { id: tx.challanId },
                data: {
                    status: ChallanStatus.CANCELLED,
                    cancelledAt,
                    isAdminCancel: event ? (event.args[2] as boolean) : false
                }
            });
        }
        else if (tx.actionType === TxActionType.INSURANCE_ISSUE && tx.insuranceId) {
            // PolicyIssued(polId, ownTid, compId, expiry)
            const event = events.get('PolicyIssued');
            if (event) {
                await db.insurancePolicy.update({
                    where: { id: tx.insuranceId },
                    data: {
                        polId: BigInt(event.args[0]),  // Must be BigInt — not Number() to avoid precision loss
                        status: InsuranceStatus.ACTIVE
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.INSURANCE_CLAIM && tx.insuranceId) {
            // ClaimFiled(polId, claimNum) — claimNum is the new ABSOLUTE total, not a delta.
            // Use absolute value to stay consistent with the indexer.
            const event = events.get('ClaimFiled');
            if (event) {
                await db.insurancePolicy.update({
                    where: { id: tx.insuranceId },
                    data: { claimCount: Number(event.args[1]) } // Absolute count from chain
                });
            }
        }
        else if (tx.actionType === TxActionType.INSURANCE_EXPIRE && tx.insuranceId) {
            // FIX #7: Handle PolicyExpired(polId) — mark policy EXPIRED.
            await db.insurancePolicy.update({
                where: { id: tx.insuranceId },
                data: { status: InsuranceStatus.EXPIRED }
            });
        }
        else if (tx.actionType === TxActionType.PUC_ISSUE && tx.pucId) {
            // FIX #3 & #5: PUCIssued(certId, ownTid, passed, expiry) — write all fields.
            const event = events.get('PUCIssued');
            if (event) {
                const passed = event.args[2] as boolean;
                const expiry = event.args[3];
                await db.pucCertificate.update({
                    where: { id: tx.pucId },
                    data: {
                        certId: BigInt(event.args[0]),
                        ownTid: BigInt(event.args[1]),
                        passed,
                        // A cert issued with passed=false should be VALID (recorded) but not pass-status
                        status: PucStatus.VALID,
                        expiryDate: new Date(Number(expiry) * 1000)
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.PUC_EXPIRE && tx.pucId) {
            // FIX #8: Handle PUCExpired(certId) — mark certificate EXPIRED.
            await db.pucCertificate.update({
                where: { id: tx.pucId },
                data: { status: PucStatus.EXPIRED }
            });
        }
        else if (tx.actionType === TxActionType.LOAN_REG && tx.loanId) {
            // LoanReg(uint64 loanId, uint256 dvpId, uint64 bankId, address borrower, uint128 amount)
            // args[0] = loanId — must be stored as BigInt to match the Prisma unique field type
            const event = events.get('LoanReg');
            if (event) {
                const loanId = BigInt(event.args[0]);
                const borrower = event.args[3] as string;
                const borrowerUser = await db.user.findUnique({ where: { walletAddress: borrower.toLowerCase() } });
                await db.loanRecord.update({
                    where: { id: tx.loanId },
                    data: {
                        loanId,
                        status:         LoanStatus.ACTIVE,
                        borrowerUserId: borrowerUser?.id || null,
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.LOAN_CLEAR && tx.loanId) {
            // NOCIssued(uint64 loanId, uint256 dvpId) — only 2 params, owner comes from NOCMinted
            // NOCMinted(uint64 loanId, address owner) — minted only for registered vehicles
            const nocIssuedEvent = events.get('NOCIssued');
            if (nocIssuedEvent) {
                await db.loanRecord.update({
                    where: { id: tx.loanId },
                    data: {
                        status:    LoanStatus.CLEARED,
                        clearedAt: new Date(),
                        nocIssued: true,
                        nocDate:   new Date(),
                    }
                });
            }
            // NOCMinted is optional (only for registered vehicles) — update recipient if present
            const nocMintedEvent = events.get('NOCMinted');
            if (nocMintedEvent) {
                const owner = nocMintedEvent.args[1] as string; // args[1] = owner in NOCMinted(loanId, owner)
                const ownerUser = await db.user.findUnique({ where: { walletAddress: owner.toLowerCase() } });
                await db.loanRecord.update({
                    where: { id: tx.loanId },
                    data: {
                        nocRecipientWallet: owner.toLowerCase(),
                        nocRecipientUserId: ownerUser?.id || null,
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.LOAN_CANCEL_PENDING && tx.loanId) {
            // PendingLoanCancelled(uint256 dvpId, uint64 bankId)
            // The indexer's handlePendingLoanCancelled deletes the record.
            // As a fallback, if the worker processes the receipt first or indexer missed it:
            logger.info({ loanId: tx.loanId }, 'Reconciler: LOAN_CANCEL_PENDING confirmed — deleting pending loan record.');
            await db.loanRecord.delete({ where: { id: tx.loanId } }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.LOAN_REFINANCE && tx.loanId) {
            // LoanRefinanced(uint64 oldLoanId, uint64 newLoanId, uint256 dvpId)
            // The indexer's handleLoanRefinanced already closed the old loan when it fired.
            // Here we just ensure the old loan is CLEARED in case the indexer missed it.
            const event = events.get('LoanRefinanced');
            if (event) {
                await db.loanRecord.update({
                    where: { id: tx.loanId },
                    data: {
                        status:    LoanStatus.CLEARED,
                        clearedAt: new Date(),
                        nocIssued: true,
                        nocDate:   new Date(),
                    }
                });

                // As a fallback, also process the LoanReg event emitted in the same tx to create the new loan
                const regEvent = events.get('LoanReg');
                if (regEvent) {
                    const newLoanId = BigInt(regEvent.args[0]);
                    const dvpId = BigInt(regEvent.args[1]);
                    const bankId = BigInt(regEvent.args[2]);
                    const borrower = regEvent.args[3] as string;
                    const amount = BigInt(regEvent.args[4]);
                    const tenure = Number(regEvent.args[5]);

                    const [bankEntity, passport, borrowerUser] = await Promise.all([
                        db.b2BEntity.findFirst({ where: { onChainId: Number(bankId) } }),
                        db.vehiclePassport.findUnique({ where: { dvpId } }),
                        db.user.findUnique({ where: { walletAddress: borrower.toLowerCase() } })
                    ]);

                    if (passport && bankEntity) {
                        await db.loanRecord.upsert({
                            where: { loanId: newLoanId },
                            create: {
                                loanId:            newLoanId,
                                passportId:        passport.id,
                                lenderEntityId:    bankEntity.id,
                                borrowerWallet:    borrower.toLowerCase(),
                                borrowerUserId:    borrowerUser?.id || null,
                                amount:            amount.toString(),
                                tenure:            tenure,
                                status:            LoanStatus.ACTIVE,
                                disbursedAt:       new Date(),
                                nocIssued:         false,
                                createdByMemberId: tx.initiatorMemberId || null
                            },
                            update: {
                                loanId:         newLoanId,
                                status:         LoanStatus.ACTIVE,
                                borrowerUserId: borrowerUser?.id || null,
                            }
                        });
                    }
                }
            }
        }
    });
}

// FIX: Rollback operations are independent compensating actions.
// Wrapping them in a single $transaction was wrong — if one step failed,
// the whole transaction rolled back, preventing subsequent compensations from running.
async function handleRevertedRollback(tx: BlockchainTransaction) {
    const db = prisma; // Use global client; each operation is independent best-effort.
        // ── SAFE_EXEC: Gnosis Safe execTransaction reverted ──────────────────
        // The inner Safe transaction reverted (bad calldata, contract rejected it).
        // Mark the proposal EXECUTION_FAILED so the admin can retry via the
        // governance dashboard (POST /admin/proposals/:id/execute).
        if (tx.actionType === TxActionType.SAFE_EXEC && tx.safeProposalId) {
            logger.warn({ safeProposalId: tx.safeProposalId, txHash: tx.txHash },
                'Saga Rollback: SAFE_EXEC reverted — marking SafeProposal EXECUTION_FAILED');
            await db.safeProposal.update({
                where: { id: tx.safeProposalId },
                data: { status: SafeProposalStatus.EXECUTION_FAILED }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.VEHICLE_MINT && tx.passportId) {
            logger.warn({ passportId: tx.passportId }, 'Saga Rollback: Deleting local VehiclePassport as mint failed.');
            await db.vehiclePassport.delete({ where: { id: tx.passportId } }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.VEHICLE_SCRAP && tx.passportId) {
            logger.warn({ passportId: tx.passportId }, 'Saga Rollback: Reverting VehiclePassport status to ACTIVE.');
            await db.vehiclePassport.update({
                where: { id: tx.passportId },
                data: { status: VehicleStatus.ACTIVE }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.VEHICLE_ASSIGN_DEALER && tx.passportId) {
            logger.warn({ passportId: tx.passportId }, 'Saga Rollback: Clearing assigned dealer.');
            await db.vehiclePassport.update({
                where: { id: tx.passportId },
                data: { dealerWallet: null, dealerUserId: null }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.VEHICLE_REGISTER_RTO && tx.ownershipId) {
            logger.warn({ ownershipId: tx.ownershipId }, 'Saga Rollback: Deleting local VehicleOwnership.');
            const ownership = await db.vehicleOwnership.delete({ where: { id: tx.ownershipId } }).catch(() => null);
            if (ownership) {
                await db.vehiclePassport.update({
                    where: { id: ownership.passportId },
                    data: { status: VehicleStatus.NOT_REG }
                }).catch(() => {});
            }
        }
        else if (tx.actionType === TxActionType.TRANSFER_INIT && tx.transferReqId) {
            logger.warn({ transferReqId: tx.transferReqId }, 'Saga Rollback: Deleting local TransferRequest.');
            await db.transferRequest.delete({ where: { id: tx.transferReqId } }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.TRANSFER_APPROVE_BUYER && tx.transferReqId) {
            logger.warn({ transferReqId: tx.transferReqId }, 'Saga Rollback: Reverting buyer approval.');
            await db.transferRequest.update({
                where: { id: tx.transferReqId },
                data: { buyerOK: false, status: TransferStatus.PENDING }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.TRANSFER_APPROVE_RTO && tx.transferReqId) {
            logger.warn({ transferReqId: tx.transferReqId }, 'Saga Rollback: Reverting RTO approval.');
            await db.transferRequest.update({
                where: { id: tx.transferReqId },
                data: { rtoOK: false, status: TransferStatus.BUYER_ACCEPTED }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.TRANSFER_CANCEL && tx.transferReqId) {
            logger.warn({ transferReqId: tx.transferReqId }, 'Saga Rollback: Reverting cancellation.');
            await db.transferRequest.update({
                where: { id: tx.transferReqId },
                data: { status: TransferStatus.PENDING }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.TRADE_CERT_ISSUE && tx.tradeCertId) {
            logger.warn({ tradeCertId: tx.tradeCertId }, 'Saga Rollback: Deactivating TradeCert.');
            await db.tradeCert.update({ 
                where: { id: tx.tradeCertId },
                data: { isActive: false } 
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.TRADE_CERT_REVOKE && tx.tradeCertId) {
            logger.warn({ tradeCertId: tx.tradeCertId }, 'Saga Rollback: Reverting TradeCert revocation.');
            await db.tradeCert.update({
                where: { id: tx.tradeCertId },
                data: { isActive: true }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.CHALLAN_ISSUE && tx.challanId) {
            logger.warn({ challanId: tx.challanId }, 'Saga Rollback: Deleting Challan.');
            await db.challan.delete({ where: { id: tx.challanId } }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.CHALLAN_PAY && tx.challanId) {
            logger.warn({ challanId: tx.challanId }, 'Saga Rollback: Reverting Challan payment.');

            // Fetch challan to check if payment was already collected (web2 gateway)
            const challan = await db.challan.findUnique({ where: { id: tx.challanId } }).catch(() => null);
            if (challan?.paymentRef) {
                // CRITICAL: The citizen's money was collected (web2 payment confirmed, paymentRef is set)
                // but the blockchain tx reverted. Manual investigation required!
                // paymentRef is intentionally NOT cleared — it is evidence of the received payment.
                logger.error({
                    challanId: tx.challanId,
                    txHash: tx.txHash,
                    txSource: tx.txSource,
                    paymentRef: challan.paymentRef,
                    paymentOrderId: challan.paymentOrderId
                }, 'SAGA ALERT: CHALLAN_PAY reverted on-chain but web2 payment was already collected. ' +
                   'paymentRef preserved. MANUAL INTERVENTION REQUIRED to refund the citizen.');
            }

            await db.challan.update({
                where: { id: tx.challanId },
                data: { status: ChallanStatus.PENDING, paidAt: null }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.CHALLAN_CANCEL && tx.challanId) {
            logger.warn({ challanId: tx.challanId }, 'Saga Rollback: Reverting Challan cancellation.');
            await db.challan.update({
                where: { id: tx.challanId },
                data: { status: ChallanStatus.PENDING, cancelledAt: null }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.INSURANCE_ISSUE && tx.insuranceId) {
            logger.warn({ insuranceId: tx.insuranceId }, 'Saga Rollback: Deleting InsurancePolicy.');
            await db.insurancePolicy.delete({ where: { id: tx.insuranceId } }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.INSURANCE_CLAIM && tx.insuranceId) {
            logger.warn({ insuranceId: tx.insuranceId }, 'Saga Rollback: Reverting Insurance Claim (decrement claimCount).');
            await db.insurancePolicy.update({ 
                where: { id: tx.insuranceId },
                data: { claimCount: { decrement: 1 } }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.INSURANCE_EXPIRE && tx.insuranceId) {
            logger.warn({ insuranceId: tx.insuranceId }, 'Saga Rollback: Reverting Insurance Expiration (restoring ACTIVE).');
            await db.insurancePolicy.update({ 
                where: { id: tx.insuranceId },
                data: { status: InsuranceStatus.ACTIVE }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.PUC_ISSUE && tx.pucId) {
            logger.warn({ pucId: tx.pucId }, 'Saga Rollback: Deleting PucCertificate.');
            await db.pucCertificate.delete({ where: { id: tx.pucId } }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.PUC_EXPIRE && tx.pucId) {
            logger.warn({ pucId: tx.pucId }, 'Saga Rollback: Reverting Puc Expiration (restoring VALID).');
            await db.pucCertificate.update({ 
                where: { id: tx.pucId },
                data: { status: PucStatus.VALID }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.LOAN_REG && tx.loanId) {
            // registerLoan reverted — delete the pre-created PENDING LoanRecord
            logger.warn({ loanId: tx.loanId }, 'Saga Rollback: Deleting PENDING LoanRecord (registerLoan reverted).');
            await db.loanRecord.delete({ where: { id: tx.loanId } }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.LOAN_CLEAR && tx.loanId) {
            // issueNOC reverted — undo the status change (loan stays ACTIVE)
            logger.warn({ loanId: tx.loanId }, 'Saga Rollback: Reverting NOC issuance (issueNOC reverted).');
            await db.loanRecord.update({
                where: { id: tx.loanId },
                data: {
                    status:             LoanStatus.ACTIVE,
                    clearedAt:          null,
                    nocIssued:          false,
                    nocDate:            null,
                    nocRecipientWallet: null,
                    nocRecipientUserId: null,
                }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.LOAN_CANCEL_PENDING && tx.loanId) {
            // cancelPendingLoan reverted — keep the PENDING loan record alive so the bank can retry
            logger.warn({ loanId: tx.loanId }, 'Saga Rollback: cancelPendingLoan reverted — loan record remains PENDING.');
            // No DB update needed — the loan record was never modified by the service before submission
        }
        else if (tx.actionType === TxActionType.LOAN_REFINANCE && tx.loanId) {
            // refinanceLoan reverted — the old loan should remain ACTIVE (it was never modified in DB before tx)
            logger.warn({ loanId: tx.loanId }, 'Saga Rollback: refinanceLoan reverted — old loan remains ACTIVE.');
            // No DB update needed — the service never touched the old loan record before submitting the tx
        }
        else if (tx.actionType === TxActionType.INSURANCE_CLAIM && tx.insuranceId) {
            logger.warn({ insuranceId: tx.insuranceId }, 'Saga Rollback: Reverting insurance claim count.');
            await db.insurancePolicy.update({
                where: { id: tx.insuranceId },
                data: { claimCount: { decrement: 1 } }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.INSURANCE_EXPIRE && tx.insuranceId) {
            logger.warn({ insuranceId: tx.insuranceId }, 'Saga Rollback: Reverting insurance expiry.');
            await db.insurancePolicy.update({
                where: { id: tx.insuranceId },
                data: { status: InsuranceStatus.ACTIVE }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.PUC_EXPIRE && tx.pucId) {
            logger.warn({ pucId: tx.pucId }, 'Saga Rollback: Reverting PUC expiry.');
            await db.pucCertificate.update({
                where: { id: tx.pucId },
                data: { status: PucStatus.VALID }
            }).catch(() => {});
        }
}


