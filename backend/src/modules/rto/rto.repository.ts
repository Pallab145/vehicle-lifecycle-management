import prisma from '@/lib/prisma';
import { SyncStatus, TxActionType, Prisma, RegistrationStatus, TransferStatus } from '@/generated/prisma/client';

export const rtoRepository = {
    /**
     * Resolves a user's database record from their wallet address.
     */
    async findUserByWallet(wallet: string) {
        return prisma.user.findUnique({
            where: { walletAddress: wallet.toLowerCase() }
        });
    },

    /**
     * Creates a Trade Certificate record and the corresponding pending blockchain transaction.
     */
    async createTradeCertTx(data: {
        dealerWallet: string;
        dealerUserId?: string;
        rtoEntityId: string;
        validTill: Date;
        memberId: string;
        txHash: string;
    }) {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // 1. Upsert TradeCert off-chain record
            let tradeCert = await tx.tradeCert.findFirst({
                where: { dealerWallet: data.dealerWallet.toLowerCase() }
            });

            if (tradeCert) {
                tradeCert = await tx.tradeCert.update({
                    where: { id: tradeCert.id },
                    data: {
                        validTill: data.validTill,
                        isActive: false, // Wait for blockchain confirmation
                        createdByMemberId: data.memberId,
                        rtoEntityId: data.rtoEntityId,
                        issuedAt: new Date()
                    }
                });
            } else {
                tradeCert = await tx.tradeCert.create({
                    data: {
                        dealerWallet: data.dealerWallet.toLowerCase(),
                        dealerUserId: data.dealerUserId,
                        rtoEntityId: data.rtoEntityId,
                        issuedAt: new Date(),
                        validTill: data.validTill,
                        isActive: false, // Wait for blockchain confirmation
                        createdByMemberId: data.memberId
                    }
                });
            }

            // 2. Track the pending transaction
            await tx.blockchainTransaction.create({
                data: {
                    txHash: data.txHash,
                    actionType: TxActionType.TRADE_CERT_ISSUE,
                    tradeCertId: tradeCert.id,
                    b2bEntityId: data.rtoEntityId,
                    initiatorMemberId: data.memberId,
                    status: SyncStatus.PENDING
                }
            });

            return { tradeCert };
        });
    },

    /**
     * Retrieves an existing TradeCert by dealer wallet.
     */
    async findTradeCertByWallet(dealerWallet: string) {
        return prisma.tradeCert.findFirst({
            where: { dealerWallet: dealerWallet.toLowerCase() }
        });
    },

    /**
     * Tracks a pending revocation transaction.
     */
    async createRevokeTradeCertTx(data: {
        tradeCertId: string;
        rtoEntityId: string;
        memberId: string;
        txHash: string;
    }) {
        return prisma.blockchainTransaction.create({
            data: {
                txHash: data.txHash,
                actionType: TxActionType.TRADE_CERT_REVOKE,
                tradeCertId: data.tradeCertId,
                b2bEntityId: data.rtoEntityId,
                initiatorMemberId: data.memberId,
                status: SyncStatus.PENDING
            }
        });
    },

    /**
     * Finds a vehicle passport by its DVP ID.
     */
    async findVehicleByDvpId(dvpId: bigint) {
        return prisma.vehiclePassport.findUnique({
            where: { dvpId }
        });
    },

    /**
     * Tracks a pending vehicle registration transaction.
     */
    async createVehicleRegTx(data: {
        passportId: string;
        rtoEntityId: string;
        memberId: string;
        txHash: string;
    }) {
        return prisma.blockchainTransaction.create({
            data: {
                txHash: data.txHash,
                actionType: TxActionType.VEHICLE_REGISTER_RTO,
                passportId: data.passportId,
                b2bEntityId: data.rtoEntityId,
                initiatorMemberId: data.memberId,
                status: SyncStatus.PENDING
            }
        });
    },

    /**
     * Finds a vehicle ownership record by its Ownership Token ID.
     */
    async findOwnershipByOwnTid(ownTid: bigint) {
        return prisma.vehicleOwnership.findUnique({
            where: { ownTid }
        });
    },

    /**
     * Tracks a pending transfer approval transaction.
     */
    async createApproveTransferTx(data: {
        ownershipId: string;
        transferReqId: string;
        rtoEntityId: string;
        memberId: string;
        txHash: string;
    }) {
        return prisma.blockchainTransaction.create({
            data: {
                txHash: data.txHash,
                actionType: TxActionType.TRANSFER_APPROVE_RTO,
                ownershipId: data.ownershipId,
                transferReqId: data.transferReqId,
                b2bEntityId: data.rtoEntityId,
                initiatorMemberId: data.memberId,
                status: SyncStatus.PENDING
            }
        });
    },

    /**
     * Lists Trade Certificates issued by this RTO
     */
    async listTradeCerts(
        rtoEntityId: string,
        params: { page: number; limit: number; isActive?: boolean }
    ) {
        const { page, limit, isActive } = params;
        const skip = (page - 1) * limit;

        const where: Prisma.TradeCertWhereInput = {
            rtoEntityId,
            ...(isActive !== undefined && { isActive })
        };

        const [total, items] = await Promise.all([
            prisma.tradeCert.count({ where }),
            prisma.tradeCert.findMany({
                where,
                skip,
                take: limit,
                orderBy: { issuedAt: 'desc' },
                include: {
                    dealerUser: { select: { name: true, phone: true } }
                }
            })
        ]);

        return {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            items
        };
    },

    /**
     * Lists Registration Requests for this RTO
     */
    async listRegistrationRequests(
        rtoEntityId: string,
        params: { page: number; limit: number; status?: RegistrationStatus }
    ) {
        const { page, limit, status } = params;
        const skip = (page - 1) * limit;

        const where: Prisma.RegistrationRequestWhereInput = {
            rtoEntityId,
            ...(status && { status })
        };

        const [total, items] = await Promise.all([
            prisma.registrationRequest.count({ where }),
            prisma.registrationRequest.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    passport: { select: { vinHash: true, engineHash: true, chassisHash: true, mfgDate: true } },
                    buyerUser: { select: { name: true, phone: true } },
                    dealerUser: { select: { name: true, phone: true } }
                }
            })
        ]);

        return {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            items
        };
    },

    /**
     * Lists Transfer Requests where the buyer belongs to this RTO
     */
    async listTransferRequests(
        rtoEntityId: string,
        params: { page: number; limit: number; status?: TransferStatus }
    ) {
        const { page, limit, status } = params;
        const skip = (page - 1) * limit;

        const where: Prisma.TransferRequestWhereInput = {
            buyerUser: {
                rtoEntityId
            },
            ...(status && { status })
        };

        const [total, items] = await Promise.all([
            prisma.transferRequest.count({ where }),
            prisma.transferRequest.findMany({
                where,
                skip,
                take: limit,
                orderBy: { reqDate: 'desc' },
                include: {
                    buyerUser: { select: { name: true, phone: true } },
                    sellerUser: { select: { name: true, phone: true } }
                }
            })
        ]);

        return {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            items
        };
    }
};
