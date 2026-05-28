import prisma from '@/lib/prisma';
import { VehicleStatus, RegistrationStatus } from '@/generated/prisma/client';

export const dealerRepository = {
    /**
     * Fetch active Trade Certificates for a specific dealer wallet
     */
    async getActiveTradeCerts(dealerWallet: string) {
        return prisma.tradeCert.findMany({
            where: {
                dealerWallet: dealerWallet.toLowerCase(),
                isActive: true,
                validTill: {
                    gt: new Date()
                }
            },
            select: {
                dealerWallet: true,
                issuedAt: true,
                validTill: true,
                isActive: true,
                rtoEntityId: true,
                rtoEntity: {
                    select: { name: true, code: true }
                }
            }
        });
    },

    /**
     * Checks if a wallet corresponds to a verified User
     */
    async getVerifiedUser(wallet: string) {
        return prisma.user.findFirst({
            where: {
                walletAddress: wallet.toLowerCase(),
                isVerified: true
            },
            select: {
                id: true,
                walletAddress: true,
                rtoEntityId: true
            }
        });
    },

    /**
     * Fetches a vehicle from the dealer's inventory
     */
    async getVehicleInInventory(dvpId: bigint, dealerWallet: string) {
        return prisma.vehiclePassport.findFirst({
            where: {
                dvpId,
                dealerWallet: dealerWallet.toLowerCase(),
                status: VehicleStatus.NOT_REG
            }
        });
    },

    /**
     * Create a Registration Request (Sale Request)
     */
    async createRegistrationRequest(data: {
        dvpId: bigint;
        passportId: string;
        buyerWallet: string;
        dealerWallet: string;
        buyerUserId: string;
        dealerUserId: string;
        rtoEntityId: string;
    }) {
        return prisma.registrationRequest.create({
            data: {
                dvpId: data.dvpId,
                passportId: data.passportId,
                buyerWallet: data.buyerWallet.toLowerCase(),
                dealerWallet: data.dealerWallet.toLowerCase(),
                buyerUserId: data.buyerUserId,
                dealerUserId: data.dealerUserId,
                rtoEntityId: data.rtoEntityId,
                status: RegistrationStatus.PENDING
            },
            select: {
                dvpId: true,
                buyerWallet: true,
                dealerWallet: true,
                status: true,
                createdAt: true,
                rto: {
                    select: { name: true, code: true }
                }
            }
        });
    },

    /**
     * List vehicles assigned to this dealer that have not been registered yet
     */
    async listInventory(dealerWallet: string, page: number, limit: number) {
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            prisma.vehiclePassport.findMany({
                where: {
                    dealerWallet: dealerWallet.toLowerCase(),
                    status: VehicleStatus.NOT_REG
                },
                select: {
                    dvpId: true,
                    vinHash: true,
                    engineHash: true,
                    chassisHash: true,
                    specsHash: true,
                    status: true,
                    mfgDate: true,
                    manufacturer: {
                        select: { name: true, code: true }
                    }
                },
                skip,
                take: limit,
                orderBy: { mfgDate: 'desc' }
            }),
            prisma.vehiclePassport.count({
                where: {
                    dealerWallet: dealerWallet.toLowerCase(),
                    status: VehicleStatus.NOT_REG
                }
            })
        ]);

        return {
            items,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    }
};
