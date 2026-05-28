import prisma from '@/lib/prisma';
import { OtpPurpose } from '@/generated/prisma/client';
import { AUTH } from '@/config/constants';

export const authRepository = {
    // ── Institution (B2B) ──
    async findMemberByEmail(email: string) {
        return prisma.b2BMember.findUnique({
            where: { email },
            include: { entity: true } // Include entity to get the entity type
        });
    },

    async updateMemberPassword(memberId: string, passwordHash: string) {
        return prisma.b2BMember.update({
            where: { id: memberId },
            data: { passwordHash }
        });
    },

    // ── OTP Management ──
    async createOtp(memberId: string, otpHash: string) {
        const expiresAt = new Date(Date.now() + AUTH.OTP_EXPIRY_MINUTES * 60 * 1000);
        return prisma.otpCode.create({
            data: {
                memberId,
                codeHash: otpHash,
                expiresAt,
                purpose: OtpPurpose.PASSWORD_RESET,
            }
        });
    },

    async findValidOtp(memberId: string) {
        return prisma.otpCode.findFirst({
            where: {
                memberId,
                usedAt: null,
                purpose: OtpPurpose.PASSWORD_RESET,
                expiresAt: { gt: new Date() }
            },
            orderBy: { createdAt: 'desc' }
        });
    },

    async markOtpUsed(otpId: string) {
        return prisma.otpCode.update({
            where: { id: otpId },
            data: { usedAt: new Date() }
        });
    },

    // ── Citizen (B2C) ──
    async findOrCreateCitizen(walletAddress: string) {
        // Ethereum addresses should be stored uniformly (lowercase)
        const normalizedWallet = walletAddress.toLowerCase();
        
        return prisma.user.upsert({
            where: { walletAddress: normalizedWallet },
            update: {}, // No fields to update if user already exists
            create: {
                walletAddress: normalizedWallet,
            }
        });
    }
};
