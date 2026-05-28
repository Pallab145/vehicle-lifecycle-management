import prisma from '@/lib/prisma';

export const tokenRepository = {
    /**
     * Create a new refresh token session in the database.
     */
    async createRefreshToken(data: {
        jti: string;
        userId?: string;
        memberId?: string;
        expiresAt: Date;
        issuedIp: string;
        deviceId: string;
    }) {
        return prisma.refreshToken.create({
            data: {
                jti: data.jti,
                userId: data.userId,
                memberId: data.memberId,
                expiresAt: data.expiresAt,
                issuedIp: data.issuedIp,
                deviceId: data.deviceId,
            }
        });
    },

    /**
     * Find a valid refresh token by its JTI.
     */
    async findValidToken(jti: string) {
        return prisma.refreshToken.findFirst({
            where: {
                jti,
                revokedAt: null,
                expiresAt: { gt: new Date() } // Must not be expired
            },
            include: {
                user: true,
                member: {
                    include: { entity: true }
                }
            }
        });
    },

    /**
     * Revoke a specific token by JTI.
     */
    async revokeToken(jti: string) {
        return prisma.refreshToken.updateMany({
            where: { jti, revokedAt: null },
            data: { revokedAt: new Date() }
        });
    },

    /**
     * Revoke all active tokens for a specific B2B member.
     */
    async revokeAllMemberTokens(memberId: string) {
        return prisma.refreshToken.updateMany({
            where: { memberId, revokedAt: null },
            data: { revokedAt: new Date() }
        });
    },

    /**
     * Revoke all active tokens for a specific Citizen user.
     */
    async revokeAllUserTokens(userId: string) {
        return prisma.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() }
        });
    }
};
