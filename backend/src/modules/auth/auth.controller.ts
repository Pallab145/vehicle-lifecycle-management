import crypto from 'crypto';
import type { Request, Response } from 'express';
import { env } from '@/config/env';
import { authService } from './auth.service';
import { tokenService } from '../token/token.service';
import { tokenRepository } from '../token/token.repository';
import { COOKIE } from '@/config/constants';
import { asyncHandler } from '@/utils/asyncHandler';
import { 
    LoginInstitutionSchema, 
    ForgotPasswordSchema, 
    ResetPasswordSchema, 
    LoginCitizenSchema 
} from './auth.schemas';
import createError from 'http-errors';

export const authController = {

    // ── Institution (B2B) Endpoints ──

    loginInstitution: asyncHandler(async (req: Request, res: Response) => {
        const input = LoginInstitutionSchema.parse(req.body);
        const result = await authService.loginInstitution(input, req, res);

        res.status(200).json({
            success: true,
            user: result.user,
            accessToken: result.tokens.accessToken,
        });
    }),

    forgotPassword: asyncHandler(async (req: Request, res: Response) => {
        const input = ForgotPasswordSchema.parse(req.body);
        await authService.requestPasswordReset(input.email);

        res.status(200).json({
            success: true,
            message: 'If that email exists, an OTP has been sent.',
        });
    }),

    resetPassword: asyncHandler(async (req: Request, res: Response) => {
        const input = ResetPasswordSchema.parse(req.body);
        await authService.resetPassword(input);

        res.status(200).json({
            success: true,
            message: 'Password successfully reset. Please log in again.',
        });
    }),

    // ── Citizen (B2C) Endpoints ──

    getNonce: asyncHandler(async (_req: Request, res: Response) => {
        // Generate a cryptographically secure random alphanumeric string
        const nonce = crypto.randomBytes(16).toString('hex');

        // Create a short-lived (5 min) JWT containing the nonce
        const nonceToken = tokenService.generateNonceToken(nonce);

        // Set the token securely in a cookie
        const domain = env.NODE_ENV === 'production' && env.APP_DOMAIN !== 'localhost' 
            ? `.${env.APP_DOMAIN}` 
            : undefined;

        res.cookie(COOKIE.SIWE_NONCE, nonceToken, {
            httpOnly: true,
            secure: env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 5 * 60 * 1000, // 5 minutes
            domain
        });

        // Return the raw nonce to the client for signing
        res.status(200).json({ success: true, nonce });
    }),

    loginCitizen: asyncHandler(async (req: Request, res: Response) => {
        const input = LoginCitizenSchema.parse(req.body);
        
        // 1. Retrieve the secure nonce cookie
        const nonceToken = req.cookies[COOKIE.SIWE_NONCE];
        if (!nonceToken) {
            throw createError(401, 'Nonce missing or expired. Please request a new nonce.');
        }

        // 2. Verify the stateless nonce JWT
        const validNonce = tokenService.verifyNonceToken(nonceToken);
        if (!validNonce) {
            throw createError(401, 'Invalid or expired nonce signature.');
        }

        // 3. Clear the nonce cookie (it must be one-time use!)
        const domain = env.NODE_ENV === 'production' && env.APP_DOMAIN !== 'localhost' 
            ? `.${env.APP_DOMAIN}` 
            : undefined;
        res.clearCookie(COOKIE.SIWE_NONCE, { domain });

        // 4. Pass the verified nonce down to the service for SIWE message comparison
        const result = await authService.loginCitizen(input, validNonce, req, res);

        res.status(200).json({
            success: true,
            user: result.user,
            accessToken: result.tokens.accessToken,
        });
    }),

    // ── Shared Endpoints ──

    refresh: asyncHandler(async (req: Request, res: Response) => {
        const refreshToken = req.cookies[COOKIE.REFRESH_TOKEN];
        if (!refreshToken) {
            throw createError(401, 'No refresh token provided');
        }

        const accessToken = await tokenService.refreshAccessToken(refreshToken);
        if (!accessToken) {
            // Token is invalid/revoked. Clear the bad cookie.
            tokenService.clearCookies(res);
            throw createError(401, 'Invalid or expired refresh token');
        }

        // Update the access token cookie along with the response
        tokenService.setCookies(res, accessToken, refreshToken);

        res.status(200).json({
            success: true,
            accessToken,
        });
    }),

    logout: asyncHandler(async (req: Request, res: Response) => {
        const rawRefreshToken = req.cookies[COOKIE.REFRESH_TOKEN];
        
        if (rawRefreshToken) {
            const hashedJti = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
            await tokenRepository.revokeToken(hashedJti);
            tokenService.clearCookies(res);
        }

        res.status(200).json({ success: true, message: 'Logged out successfully' });
    }),

    getMe: asyncHandler(async (req: Request, res: Response) => {
        // req.caller is populated by requireAuth middleware
        const caller = req.caller;
        if (!caller) {
            throw createError(401, 'Unauthorized');
        }

        res.status(200).json({
            success: true,
            caller,
        });
    })
};
