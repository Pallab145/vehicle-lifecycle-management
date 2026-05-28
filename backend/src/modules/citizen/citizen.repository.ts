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
    }
};
