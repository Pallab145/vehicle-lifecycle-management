import prisma from '@/lib/prisma';
import { SyncStatus, TxActionType, TxSource, Prisma, ChallanStatus } from '@/generated/prisma/client';

export const govRepository = {
    /**
     * Retrieves a challan by its on-chain ID.
     */
    async findChallanByOnChainId(challanId: bigint) {
        return prisma.challan.findUnique({
            where: { challanId }
        });
    },

    /**
     * Tracks an administrative cancellation transaction.
     */
    async createAdminCancelChallanTx(data: {
        challanId: string;
        govEntityId: string;
        memberId: string;
        txHash: string;
    }) {
        return prisma.blockchainTransaction.create({
            data: {
                txHash: data.txHash,
                actionType: TxActionType.CHALLAN_CANCEL, // Handled correctly by reconciler & indexer
                challanId: data.challanId,
                b2bEntityId: data.govEntityId,
                initiatorMemberId: data.memberId,
                txSource: TxSource.MEMBER,
                status: SyncStatus.PENDING
            }
        });
    },

    /**
     * Lists ALL challans globally across the system, with advanced filtering for the Government.
     */
    async listGlobalChallans(params: {
        page: number;
        limit: number;
        status?: ChallanStatus;
        policeEntityId?: string;
        violatorUserId?: string;
        ownTid?: bigint;
        challanId?: bigint;
    }) {
        const { page, limit, status, policeEntityId, violatorUserId, ownTid, challanId } = params;
        const skip = (page - 1) * limit;

        const where: Prisma.ChallanWhereInput = {
            ...(status && { status }),
            ...(policeEntityId && { policeEntityId }),
            ...(violatorUserId && { violatorUserId }),
            ...(ownTid !== undefined && { ownTid }),
            ...(challanId !== undefined && { challanId })
        };

        const [total, items] = await Promise.all([
            prisma.challan.count({ where }),
            prisma.challan.findMany({
                where,
                skip,
                take: limit,
                orderBy: { issuedAt: 'desc' },
                include: {
                    policeEntity: { select: { name: true, code: true } },
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
