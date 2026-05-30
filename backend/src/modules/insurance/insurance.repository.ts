import prisma from '@/lib/prisma';
import { SyncStatus, TxActionType, TxSource, Prisma, InsuranceStatus } from '@/generated/prisma/client';

export const insuranceRepository = {

    // ─── VEHICLE / OWNERSHIP LOOKUPS ─────────────────────────────────────────

    /**
     * Resolves VehicleOwnership by ownTid.
     * Needed because InsurancePolicy is linked via ownershipId, but contract keys by ownTid.
     */
    async findOwnershipByOwnTid(ownTid: bigint) {
        return prisma.vehicleOwnership.findUnique({
            where: { ownTid },
            include: {
                passport: {
                    select: { dvpId: true, vinHash: true }
                }
            }
        });
    },

    // ─── POLICY LOOKUPS ──────────────────────────────────────────────────────

    /**
     * Finds an active policy for a specific vehicle by ownTid.
     * Mirrors the contract's double-policy guard.
     */
    async findActivePolicyByOwnTid(ownTid: bigint) {
        return prisma.insurancePolicy.findFirst({
            where: {
                ownTid,
                status: InsuranceStatus.ACTIVE,
                expiryDate: { gte: new Date() } // Not expired
            }
        });
    },

    /**
     * Get a single policy by its DB ID.
     */
    async getPolicyById(policyId: string) {
        return prisma.insurancePolicy.findUnique({
            where: { id: policyId },
            include: {
                ownership: {
                    select: { ownTid: true, ownerWallet: true }
                },
                insEntity: {
                    select: { onChainId: true, name: true }
                }
            }
        });
    },

    // ─── TRANSACTIONS ────────────────────────────────────────────────────────

    /**
     * Atomically creates a PENDING InsurancePolicy and its BlockchainTransaction tracker.
     */
    async createPendingPolicyTx(data: {
        ownershipId: string;
        ownTid: bigint;
        insEntityId: string;
        ownerWallet: string;
        coverage: string;
        premium: string;
        expiryDate: Date;
        memberId: string;
        txHash: string;
    }) {
        return prisma.$transaction(async (tx) => {
            const policy = await tx.insurancePolicy.create({
                data: {
                    ownershipId:       data.ownershipId,
                    ownTid:            data.ownTid,
                    insEntityId:       data.insEntityId,
                    ownerWallet:       data.ownerWallet,
                    coverage:          data.coverage,
                    premium:           data.premium,
                    issueDate:         new Date(), // Will be updated by Indexer
                    expiryDate:        data.expiryDate,
                    status:            InsuranceStatus.ACTIVE, // PENDING on-chain conceptually, indexer will add polId
                    createdByMemberId: data.memberId
                }
            });

            await tx.blockchainTransaction.create({
                data: {
                    txHash:           data.txHash,
                    actionType:       TxActionType.INSURANCE_ISSUE,
                    insuranceId:      policy.id,
                    b2bEntityId:      data.insEntityId,
                    initiatorMemberId: data.memberId,
                    txSource:         TxSource.MEMBER,
                    status:           SyncStatus.PENDING
                }
            });

            return policy;
        });
    },

    /**
     * Tracks a pending markExpired transaction.
     */
    async createExpireTx(data: {
        policyId: string;
        insEntityId: string;
        memberId: string;
        txHash: string;
    }) {
        return prisma.blockchainTransaction.create({
            data: {
                txHash:           data.txHash,
                actionType:       TxActionType.INSURANCE_EXPIRE,
                insuranceId:      data.policyId,
                b2bEntityId:      data.insEntityId,
                initiatorMemberId: data.memberId,
                txSource:         TxSource.MEMBER,
                status:           SyncStatus.PENDING
            }
        });
    },

    /**
     * Tracks a pending fileClaim transaction.
     */
    async createClaimTx(data: {
        policyId: string;
        insEntityId: string;
        memberId: string;
        txHash: string;
    }) {
        return prisma.blockchainTransaction.create({
            data: {
                txHash:           data.txHash,
                actionType:       TxActionType.INSURANCE_CLAIM,
                insuranceId:      data.policyId,
                b2bEntityId:      data.insEntityId,
                initiatorMemberId: data.memberId,
                txSource:         TxSource.MEMBER,
                status:           SyncStatus.PENDING
            }
        });
    },

    // ─── LIST POLICIES ───────────────────────────────────────────────────────

    async listPolicies(params: {
        insEntityId: string;
        page: number;
        limit: number;
        status?: InsuranceStatus;
        ownTid?: bigint;
    }) {
        const { insEntityId, page, limit, status, ownTid } = params;
        const skip = (page - 1) * limit;

        const where: Prisma.InsurancePolicyWhereInput = {
            insEntityId,
            ...(status !== undefined && { status }),
            ...(ownTid !== undefined && { ownTid }),
        };

        const [total, items] = await Promise.all([
            prisma.insurancePolicy.count({ where }),
            prisma.insurancePolicy.findMany({
                where,
                skip,
                take: limit,
                orderBy: { issueDate: 'desc' },
                include: {
                    ownership: {
                        select: { ownTid: true }
                    }
                }
            })
        ]);

        return {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            data: items
        };
    }
};
