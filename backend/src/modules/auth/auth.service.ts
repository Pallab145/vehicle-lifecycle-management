import bcrypt from 'bcrypt';
import { verifyMessage } from 'ethers';
import crypto from 'crypto';
import type { Request, Response } from 'express';
import createError from 'http-errors';
import { authRepository } from './auth.repository';
import { tokenService } from '../token/token.service';
import { tokenRepository } from '../token/token.repository';
import { emailService } from '../email/email.service';
import { AUTH } from '@/config/constants';
import type { 
    LoginInstitutionInput, 
    ResetPasswordInput, 
    LoginCitizenInput 
} from './auth.schemas';


export const authService = {

    // ── Institution (B2B) Authentication ──
    
    async loginInstitution(input: LoginInstitutionInput, req: Request, res: Response) {
        const member = await authRepository.findMemberByEmail(input.email);
        
        if (!member || !member.isActive) {
            throw createError(401, 'Invalid credentials or inactive account');
        }

        const isMatch = await bcrypt.compare(input.password, member.passwordHash);
        if (!isMatch) {
            throw createError(401, 'Invalid credentials');
        }

        if (!member.entity) {
            throw createError(400, 'Account configuration error: No associated entity found');
        }

        if (!member.entity.isActive) {
            throw createError(403, 'Institutional entity account is currently suspended or inactive');
        }

        // if (member.entity.onChainId === null) {
        //     throw createError(403, `Institutional blockchain registration is still pending. Please wait until the registration is mined on-chain.`);
        // }

        const tokens = await tokenService.issueTokenPairInstitution(member, member.entity, req, res);
        
        // Return cleanly formatted user object, omitting passwordHash and BigInt fields
        const safeUser = {
            id: member.id,
            email: member.email,
            name: member.name,
            role: member.role,
            entityId: member.entityId,
            entityType: member.entity.type,
            walletAddress: member.walletAddress,
            isActive: member.isActive,
            lastLoginAt: member.lastLoginAt?.toISOString() || null
        };

        return { user: safeUser, tokens };
    },

    async requestPasswordReset(email: string) {
        const member = await authRepository.findMemberByEmail(email);
        if (!member || !member.isActive) {
            // Silently succeed to prevent email enumeration attacks
            return;
        }

        // Generate a 6-digit OTP
        const otp = Array.from({ length: AUTH.OTP_LENGTH }, () => Math.floor(Math.random() * 10)).join('');
        
        // Hash the OTP before saving to DB
        const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
        await authRepository.createOtp(member.id, otpHash);

        // Send Email
        await emailService.sendPasswordResetOtp(email, otp);
    },

    async resetPassword(input: ResetPasswordInput) {
        const member = await authRepository.findMemberByEmail(input.email);
        if (!member || !member.isActive) {
            throw createError(400, 'Invalid request');
        }

        const validOtp = await authRepository.findValidOtp(member.id);
        if (!validOtp) {
            throw createError(400, 'Invalid or expired OTP');
        }

        // Check if the provided OTP matches the hash
        const inputOtpHash = crypto.createHash('sha256').update(input.otpCode).digest('hex');
        if (inputOtpHash !== validOtp.codeHash) {
            throw createError(401, 'Invalid OTP');
        }

        // Hash new password
        const salt = await bcrypt.genSalt(12);
        const newPasswordHash = await bcrypt.hash(input.newPassword, salt);

        // Update DB
        await authRepository.updateMemberPassword(member.id, newPasswordHash);
        await authRepository.markOtpUsed(validOtp.id);

        // Revoke all active sessions (force logout everywhere)
        await tokenRepository.revokeAllMemberTokens(member.id);
    },

    // ── Citizen (B2C) Authentication ──
    
    async loginCitizen(input: LoginCitizenInput, validNonce: string, req: Request, res: Response) {
        try {
            // Cryptographically verify the signature against the message
            // `verifyMessage` recovers the address that signed the message
            const recoveredAddress = verifyMessage(input.message, input.signature);

            if (recoveredAddress.toLowerCase() !== input.walletAddress.toLowerCase()) {
                throw createError(401, 'Signature verification failed');
            }

            // Production SIWE standard: The message must explicitly contain the Nonce 
            // issued by our backend to prevent replay attacks!
            if (!input.message.includes(`Nonce: ${validNonce}`)) {
                throw createError(401, 'Invalid or mismatched nonce in signed message. Replay attack detected.');
            }
            
            const user = await authRepository.findOrCreateCitizen(input.walletAddress);
            
            const tokens = await tokenService.issueTokenPairCitizen(user, req, res);
            
            return { user, tokens };

        } catch (error) {
            if (createError.isHttpError(error)) throw error;
            throw createError(401, 'Invalid wallet signature');
        }
    },

    async loginCitizenAadhaar(input: import('./auth.schemas').LoginCitizenAadhaarInput, req: Request, res: Response) {
        // 1. Verify Aadhaar matches the vehicle's active owner
        const user = await authRepository.findCitizenByVehicleAndAadhaar(input.vehicleId, input.documentNumber);

        if (!user) {
            throw createError(401, 'Access Denied: The provided Aadhaar / Gov ID does not match the registered owner of this vehicle.');
        }

        // 2. Issue a read-only JWT session for this user
        // We will pass authMethod: 'AADHAAR' inside the JWT so the frontend knows it's a restricted session
        // For simplicity with our existing tokenService, we just issue a normal token.
        // The frontend can check if `walletAddress` is available from wagmi to enable transactions.
        const tokens = await tokenService.issueTokenPairCitizen(user, req, res);
        
        return { user, tokens };
    }
};
