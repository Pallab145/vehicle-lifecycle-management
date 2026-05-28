import prisma from '@/lib/prisma';
import type { VerifyKycInput } from './citizen.schema';

export const citizenRepository = {
    /**
     * Finds a citizen user by their ID.
     */
    async findById(userId: string) {
        return prisma.user.findUnique({
            where: { id: userId }
        });
    },

    /**
     * Updates the citizen's profile with KYC data and marks them as verified.
     */
    async verifyCitizenProfile(userId: string, data: VerifyKycInput) {
        return prisma.user.update({
            where: { id: userId },
            data: {
                name: data.name,
                phone: data.phone,
                email: data.email,
                isVerified: true
            }
        });
    }
};
