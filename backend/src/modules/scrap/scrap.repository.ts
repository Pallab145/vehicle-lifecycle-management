import prisma from '@/lib/prisma';
import { SyncStatus, TxActionType, TxSource, VehicleStatus, ChallanStatus, LoanStatus, TransferStatus } from '@/generated/prisma/client';

export const scrapRepository = {
    async createPendingScrapTx(dvpId: bigint, scrapEntityId: string, memberId: string, txHash: string) {
        return prisma.$transaction(async (db) => {
            const passport = await db.vehiclePassport.findUniqueOrThrow({ where: { dvpId } });

            // Create pending transaction record
            const tx = await db.blockchainTransaction.create({
                data: {
                    txHash,
                    actionType: TxActionType.VEHICLE_SCRAP,
                    txSource: TxSource.MEMBER,
                    status: SyncStatus.PENDING,
                    initiatorMemberId: memberId,
                    b2bEntityId: scrapEntityId,
                    passportId: passport.id
                }
            });

            return { passport, tx };
        });
    },

    async listScrappedVehicles(scrapEntityId: string, page: number, limit: number, vinHash?: string) {
        const skip = (page - 1) * limit;
        const where: any = { 
            scrapEntityId,
            status: VehicleStatus.SCRAPPED
        };

        if (vinHash) {
            where.vinHash = vinHash;
        }

        const [total, vehicles] = await Promise.all([
            prisma.vehiclePassport.count({ where }),
            prisma.vehiclePassport.findMany({
                where,
                skip,
                take: limit,
                orderBy: { scrapDate: 'desc' },
                include: {
                    manufacturer: true,
                    ownership: { include: { ownerUser: true } }
                }
            })
        ]);

        return { total, pages: Math.ceil(total / limit), vehicles };
    },

    async getVehicleEligibilityDetails(dvpId: bigint) {
        return prisma.vehiclePassport.findUnique({
            where: { dvpId },
            include: {
                ownership: {
                    include: {
                        challans: { where: { status: ChallanStatus.PENDING } },
                        transferRequests: { where: { status: TransferStatus.PENDING } }
                    }
                },
                loanRecords: { where: { status: LoanStatus.ACTIVE } },
                manufacturer: true
            }
        });
    },

    async getVehicleDetails(dvpId: bigint, scrapEntityId?: string) {
        const where: any = { dvpId };
        if (scrapEntityId) {
            where.scrapEntityId = scrapEntityId;
        }

        return prisma.vehiclePassport.findFirst({
            where,
            include: {
                manufacturer: true,
                ownership: { include: { ownerUser: true } }
            }
        });
    }
};
