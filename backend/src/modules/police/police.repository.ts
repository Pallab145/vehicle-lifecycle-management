import prisma from '@/lib/prisma';
import { SyncStatus, TxActionType, ChallanStatus, TxSource, Prisma } from '@/generated/prisma/client';

export const policeRepository = {
    /**
     * Resolves an ownership record by its token ID.
     */
    async findOwnershipByOwnTid(ownTid: bigint) {
        return prisma.vehicleOwnership.findUnique({
            where: { ownTid }
        });
    },

    /**
     * Creates a pending Challan record and tracking transaction atomically.
     */
    async createChallanTx(data: {
        ownershipId: string;
        ownTid: bigint;
        policeEntityId: string;
        amount: string;
        memberId: string;
        txHash: string;
        violatorUserId?: string | null;
    }) {
        return prisma.$transaction(async (tx) => {
            const challan = await tx.challan.create({
                data: {
                    ownershipId: data.ownershipId,
                    ownTid: data.ownTid,
                    policeEntityId: data.policeEntityId,
                    amount: data.amount,
                    status: ChallanStatus.PENDING,
                    issuedAt: new Date(),
                    createdByMemberId: data.memberId,
                    violatorUserId: data.violatorUserId
                }
            });

            const blockchainTx = await tx.blockchainTransaction.create({
                data: {
                    txHash: data.txHash,
                    actionType: TxActionType.CHALLAN_ISSUE,
                    challanId: challan.id,
                    b2bEntityId: data.policeEntityId,
                    initiatorMemberId: data.memberId,
                    status: SyncStatus.PENDING
                }
            });

            return { challan, blockchainTx };
        });
    },

    /**
     * Retrieves a challan by its on-chain ID.
     */
    async findChallanByOnChainId(challanId: bigint) {
        return prisma.challan.findUnique({
            where: { challanId }
        });
    },

    /**
     * Tracks a cancellation transaction.
     */
    async createCancelChallanTx(data: {
        challanId: string;
        policeEntityId: string;
        memberId: string | null;  // null when triggered by WEBHOOK/SYSTEM
        txSource: TxSource;
        txHash: string;
    }) {
        return prisma.blockchainTransaction.create({
            data: {
                txHash: data.txHash,
                actionType: TxActionType.CHALLAN_CANCEL,
                challanId: data.challanId,
                b2bEntityId: data.policeEntityId,
                initiatorMemberId: data.memberId,
                txSource: data.txSource,
                status: SyncStatus.PENDING
            }
        });
    },

    /**
     * Tracks a payment transaction.
     * memberId is null when triggered by a payment webhook (no human officer).
     */
    async createPayChallanTx(data: {
        challanId: string;
        policeEntityId: string;
        memberId: string | null;  // null when triggered by WEBHOOK/SYSTEM
        txSource: TxSource;
        txHash: string;
    }) {
        return prisma.blockchainTransaction.create({
            data: {
                txHash: data.txHash,
                actionType: TxActionType.CHALLAN_PAY,
                challanId: data.challanId,
                b2bEntityId: data.policeEntityId,
                initiatorMemberId: data.memberId,
                txSource: data.txSource,
                status: SyncStatus.PENDING
            }
        });
    },

    /**
     * Lists challans issued by a specific police station.
     */
    async listChallans(
        policeEntityId: string,
        params: { page: number; limit: number; status?: ChallanStatus }
    ) {
        const { page, limit, status } = params;
        const skip = (page - 1) * limit;

        const where: Prisma.ChallanWhereInput = {
            policeEntityId,
            ...(status && { status })
        };

        const [total, items] = await Promise.all([
            prisma.challan.count({ where }),
            prisma.challan.findMany({
                where,
                skip,
                take: limit,
                orderBy: { issuedAt: 'desc' },
                include: {
                    ownership: {
                        select: {
                            ownerWallet: true,
                            passport: { select: { vinHash: true } }
                        }
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
