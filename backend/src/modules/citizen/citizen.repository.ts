import prisma from '@/lib/prisma';
import type { VerifyKycInput } from './citizen.schema';
import { EntityType } from '@/generated/prisma/enums';

export const citizenRepository = {
    /**
     * Finds a citizen user by their ID.
     */
    async findById(userId: string) {
        return prisma.user.findUnique({
            where: { id: userId },
            include: {
                rto: {
                    select: { name: true, code: true }
                }
            }
        });
    },

    /**
     * Updates the citizen's profile with KYC data, marks them as verified,
     * and optionally assigns them to their chosen RTO.
     */
    async verifyCitizenProfile(userId: string, data: VerifyKycInput) {
        return prisma.user.update({
            where: { id: userId },
            data: {
                name: data.name,
                phone: data.phone,
                email: data.email,
                isVerified: true,
                ...(data.rtoEntityId && { rtoEntityId: data.rtoEntityId })
            },
            select: {
                walletAddress: true,
                name: true,
                email: true,
                phone: true,
                isVerified: true,
                rto: {
                    select: { name: true, code: true }
                }
            }
        });
    },

    /**
     * Looks up an active RTO entity by its ID to validate the citizen's choice.
     */
    async findActiveRtoById(rtoEntityId: string) {
        return prisma.b2BEntity.findFirst({
            where: {
                id: rtoEntityId,
                type: EntityType.RTO,
                isActive: true
            },
            select: { id: true, name: true, code: true }
        });
    },

    /**
     * Lists all active RTO entities for the public selection dropdown.
     */
    async listActiveRtos() {
        return prisma.b2BEntity.findMany({
            where: { type: EntityType.RTO, isActive: true },
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' }
        });
    },

    /**
     * Lists active scrap centers for the pre-authorization dropdown.
     */
    async getScrapCenters(page: number, limit: number) {
        const skip = (page - 1) * limit;
        return prisma.b2BEntity.findMany({
            where: {
                type: EntityType.SCRAP_CENTER,
                isActive: true,
                onChainId: { not: null }
            },
            select: { id: true, name: true, code: true, walletAddress: true, onChainId: true },
            orderBy: { name: 'asc' },
            skip,
            take: limit
        });
    },

    /**
     * Returns total count of active on-chain scrap centers for pagination metadata.
     */
    async countScrapCenters() {
        return prisma.b2BEntity.count({
            where: {
                type: EntityType.SCRAP_CENTER,
                isActive: true,
                onChainId: { not: null }
            }
        });
    },

    /**
     * Gets all vehicles currently owned by the citizen.
     * Checks both ownerUserId and ownerWallet as the wallet is the ground truth.
     */
    async getOwnedVehicles(ownerUserId: string | null, ownerWallet: string, page: number, limit: number) {
        const skip = (page - 1) * limit;
        return prisma.vehicleOwnership.findMany({
            where: {
                isActive: true,
                OR: [
                    { ownerWallet: ownerWallet.toLowerCase() },
                    ...(ownerUserId ? [{ ownerUserId }] : [])
                ]
            },
            include: {
                passport: {
                    select: {
                        vinHash: true,
                        engineHash: true,
                        chassisHash: true,
                        status: true,
                        mfgDate: true,
                        manufacturer: { select: { name: true, code: true } }
                    }
                },
                rtoEntity: { select: { name: true, code: true } }
            },
            orderBy: { regDate: 'desc' },
            skip,
            take: limit
        });
    },

    /**
     * Gets full details of a specific vehicle owned by the citizen.
     */
    async getVehicleByOwnTid(ownTid: bigint, ownerUserId: string | null, ownerWallet: string) {
        return prisma.vehicleOwnership.findFirst({
            where: {
                ownTid,
                OR: [
                    { ownerWallet: ownerWallet.toLowerCase() },
                    ...(ownerUserId ? [{ ownerUserId }] : [])
                ]
            },
            include: {
                passport: {
                    include: {
                        manufacturer: { select: { name: true, code: true } },
                        authorizedScrapCenter: { select: { name: true, code: true } },
                        loanRecords: {
                            where: { status: 'ACTIVE' },
                            orderBy: { disbursedAt: 'desc' },
                            take: 1,
                            include: { lenderEntity: { select: { name: true, code: true } } }
                        }
                    }
                },
                rtoEntity: { select: { name: true, code: true } },
                challans: {
                    orderBy: { issuedAt: 'desc' },
                    include: { policeEntity: { select: { name: true, code: true } } }
                },
                insurancePolicies: {
                    where: { status: 'ACTIVE' },
                    orderBy: { issueDate: 'desc' },
                    take: 1,
                    include: { insEntity: { select: { name: true, code: true } } }
                },
                pucCertificates: {
                    where: { status: 'VALID' },
                    orderBy: { issueDate: 'desc' },
                    take: 1,
                    include: { pucEntity: { select: { name: true, code: true } } }
                },
                transferRequests: {
                    where: { status: 'PENDING' },
                    orderBy: { reqDate: 'desc' },
                    take: 1
                }
            }
        });
    },

    /**
     * Looks up a vehicle by DVP ID and verifies ownership.
     * Used for scrap eligibility pre-flight (since authorizeScrap takes DVP ID).
     */
    async getVehicleByDvpId(dvpId: bigint) {
        return prisma.vehiclePassport.findUnique({
            where: { dvpId },
            include: {
                ownership: {
                    include: {
                        challans: { where: { status: 'PENDING' } },
                        transferRequests: { where: { status: 'PENDING' } }
                    }
                },
                loanRecords: { where: { status: 'ACTIVE' } }
            }
        });
    },

    /**
     * Gets the pending transfer request for a specific vehicle.
     * Used by both seller (checking own transfer) and buyer (checking if a transfer is awaiting their acceptance).
     * Checks by buyerWallet/buyerUserId OR sellerWallet/sellerUserId to serve both sides.
     */
    async getTransferStatusByOwnTid(ownTid: bigint, callerUserId: string | null, callerWallet: string) {
        return prisma.transferRequest.findFirst({
            where: {
                ownTid,
                status: 'PENDING',
                OR: [
                    { sellerWallet: callerWallet.toLowerCase() },
                    { buyerWallet: callerWallet.toLowerCase() },
                    ...(callerUserId ? [{ sellerUserId: callerUserId }, { buyerUserId: callerUserId }] : [])
                ]
            },
            include: {
                ownership: {
                    select: {
                        ownTid: true,
                        passport: {
                            select: { vinHash: true, status: true }
                        }
                    }
                }
            }
        });
    }
};
