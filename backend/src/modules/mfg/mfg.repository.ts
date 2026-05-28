import prisma from '@/lib/prisma';
import { SyncStatus, TxActionType, VehicleStatus } from '@/generated/prisma/client';

export const mfgRepository = {
    /**
     * Checks if a vehicle with the same VIN hash already exists.
     */
    async findVehicleByVinHash(vinHash: string) {
        return prisma.vehiclePassport.findUnique({
            where: { vinHash }
        });
    },

    /**
     * Creates a draft Vehicle Passport (NOT_REG) along with its pending BlockchainTransaction
     * atomically in a single database transaction.
     */
    async createDraftVehicleWithTx(data: {
        vinHash: string;
        engineHash: string;
        chassisHash: string;
        specsHash: string;
        mfgEntityId: string;
        memberId: string;
        txHash: string;
    }) {
        return prisma.$transaction(async (tx) => {
            const draftPassport = await tx.vehiclePassport.create({
                data: {
                    vinHash: data.vinHash,
                    engineHash: data.engineHash,
                    chassisHash: data.chassisHash,
                    specsHash: data.specsHash,
                    mfgEntityId: data.mfgEntityId,
                    createdByMemberId: data.memberId,
                    mfgDate: new Date(),
                    status: VehicleStatus.NOT_REG
                }
            });

            const blockchainTx = await tx.blockchainTransaction.create({
                data: {
                    txHash: data.txHash,
                    actionType: TxActionType.VEHICLE_MINT,
                    passportId: draftPassport.id,
                    b2bEntityId: data.mfgEntityId,
                    initiatorMemberId: data.memberId,
                    status: SyncStatus.PENDING
                }
            });

            return { draftPassport, blockchainTx };
        });
    },

    /**
     * Deletes a vehicle draft. Used for rollback if the initial blockchain simulation fails.
     */
    async deleteDraftVehicle(id: string) {
        return prisma.vehiclePassport.delete({
            where: { id }
        });
    },

    /**
     * Finds a specific vehicle owned by the manufacturer by its on-chain Token ID.
     */
    async findVehicleByDvpIdAndMfg(dvpId: bigint, mfgEntityId: string) {
        return prisma.vehiclePassport.findFirst({
            where: {
                dvpId,
                mfgEntityId
            }
        });
    },

    /**
     * Creates a pending BlockchainTransaction for a vehicle assignment.
     */
    async createAssignmentTx(data: {
        txHash: string;
        passportId: string;
        mfgEntityId: string;
        memberId: string;
    }) {
        return prisma.blockchainTransaction.create({
            data: {
                txHash: data.txHash,
                actionType: TxActionType.VEHICLE_ASSIGN_DEALER,
                passportId: data.passportId,
                b2bEntityId: data.mfgEntityId,
                initiatorMemberId: data.memberId,
                status: SyncStatus.PENDING
            }
        });
    },

    /**
     * Lists vehicles belonging to a specific manufacturer with pagination and optional filters.
     */
    async listVehicles(
        mfgEntityId: string,
        params: { page: number; limit: number; status?: VehicleStatus }
    ) {
        const { page, limit, status } = params;
        const skip = (page - 1) * limit;

        const where = {
            mfgEntityId,
            ...(status && { status })
        };

        const [total, items] = await Promise.all([
            prisma.vehiclePassport.count({ where }),
            prisma.vehiclePassport.findMany({
                where,
                skip,
                take: limit,
                orderBy: { mfgDate: 'desc' },
                include: {
                    transactions: {
                        orderBy: { createdAt: 'desc' },
                        take: 1
                    }
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
     * Checks if a dealer wallet belongs to a verified (KYC) User.
     */
    async findVerifiedDealer(dealerWallet: string) {
        return prisma.user.findFirst({
            where: {
                walletAddress: dealerWallet.toLowerCase(),
                isVerified: true
            },
            select: { id: true, walletAddress: true }
        });
    },

    /**
     * Checks if a dealer wallet holds an active, non-expired Trade Certificate.
     */
    async findActiveTradeCert(dealerWallet: string) {
        return prisma.tradeCert.findFirst({
            where: {
                dealerWallet: dealerWallet.toLowerCase(),
                isActive: true,
                validTill: { gt: new Date() }
            },
            select: {
                dealerWallet: true,
                validTill: true,
                rtoEntity: { select: { name: true, code: true } }
            }
        });
    },

    /**
     * Checks if there is a pending assignment transaction for a vehicle.
     */
    async findPendingAssignmentTx(passportId: string) {
        return prisma.blockchainTransaction.findFirst({
            where: {
                passportId,
                actionType: TxActionType.VEHICLE_ASSIGN_DEALER,
                status: SyncStatus.PENDING
            }
        });
    }
};
