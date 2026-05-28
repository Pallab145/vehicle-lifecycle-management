import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { Request, Response } from 'express';
import { env } from '@/config/env';
import { COOKIE } from '@/config/constants';
import { tokenRepository } from './token.repository';
import { AuthType, type CallerIdentity } from '@/types';
import type { User, B2BMember, B2BEntity } from '@/generated/prisma/client';

export const tokenService = {
    /**
     * Generate a short-lived signed JWT for stateless SIWE nonces.
     */
    generateNonceToken(nonce: string): string {
        return jwt.sign({ nonce }, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
    },

    /**
     * Verify a SIWE nonce JWT and return the raw nonce if valid.
     */
    verifyNonceToken(token: string): string | null {
        try {
            const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as { nonce: string };
            return decoded.nonce;
        } catch {
            return null;
        }
    },

    /**
     * Set cookies on the response object securely.
     */
    setCookies(res: Response, accessToken: string, refreshToken: string) {
        const domain = env.NODE_ENV === 'production' && env.APP_DOMAIN !== 'localhost' 
            ? `.${env.APP_DOMAIN}` 
            : undefined;

        res.cookie(COOKIE.ACCESS_TOKEN, accessToken, {
            httpOnly: true,
            secure: env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: env.JWT_ACCESS_TTL * 1000,
            domain
        });

        res.cookie(COOKIE.REFRESH_TOKEN, refreshToken, {
            httpOnly: true,
            secure: env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: env.JWT_REFRESH_TTL * 1000,
            domain
        });
    },

    /**
     * Clear authentication cookies (e.g., on logout).
     */
    clearCookies(res: Response) {
        const domain = env.NODE_ENV === 'production' && env.APP_DOMAIN !== 'localhost' 
            ? `.${env.APP_DOMAIN}` 
            : undefined;

        res.clearCookie(COOKIE.ACCESS_TOKEN, { domain });
        res.clearCookie(COOKIE.REFRESH_TOKEN, { domain });
    },

    /**
     * Issues an access token and a refresh token for an Institution (B2B).
     */
    async issueTokenPairInstitution(member: B2BMember, entity: B2BEntity, req: Request, res: Response) {
        const now = Math.floor(Date.now() / 1000);
        
        // 1. Generate Access Token (JWT)
        const payload: Partial<CallerIdentity> = {
            sub: member.id,
            type: AuthType.B2B,
            email: member.email,
            entityId: member.entityId,
            entityType: entity.type,
            role: member.role,
            iat: now,
            exp: now + env.JWT_ACCESS_TTL,
        };

        // 2. Generate Refresh Token (Raw String for Client)
        const rawRefreshToken = crypto.randomBytes(32).toString('hex');
        
        // 3. Hash the token to use as the JTI in the database and Access Token
        // This ensures that a compromised database cannot be used to forge session cookies.
        const hashedJti = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
        
        const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL * 1000);

        await tokenRepository.createRefreshToken({
            jti: hashedJti, // Store only the secure hash
            memberId: member.id,
            expiresAt,
            issuedIp: req.context?.realIP || req.ip || 'unknown',
            deviceId: req.context?.deviceId || 'unknown',
        });

        // 4. Link Access Token to the hashed JTI
        payload.jti = hashedJti; 
        const linkedAccessToken = jwt.sign(payload, env.JWT_SECRET, { algorithm: 'HS256' });

        // 5. Set Cookie with the RAW token (the client needs the unhashed version)
        this.setCookies(res, linkedAccessToken, rawRefreshToken);

        return { accessToken: linkedAccessToken, refreshToken: rawRefreshToken };
    },

    /**
     * Issues an access token and a refresh token for a Citizen (B2C).
     */
    async issueTokenPairCitizen(user: User, req: Request, res: Response) {
        const now = Math.floor(Date.now() / 1000);
        
        // Generate Refresh Token (Raw String for Client)
        const rawRefreshToken = crypto.randomBytes(32).toString('hex');
        
        // Hash the token for database storage
        const hashedJti = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

        // 1. Generate Access Token (JWT)
        const payload: CallerIdentity = {
            sub: user.id,
            type: AuthType.B2C,
            wallet: user.walletAddress,
            jti: hashedJti,
            iat: now,
            exp: now + env.JWT_ACCESS_TTL,
        };

        const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL * 1000);

        await tokenRepository.createRefreshToken({
            jti: hashedJti, 
            userId: user.id,
            expiresAt,
            issuedIp: req.context?.realIP || req.ip || 'unknown',
            deviceId: req.context?.deviceId || 'unknown',
        });

        const accessToken = jwt.sign(payload, env.JWT_SECRET, { algorithm: 'HS256' });

        // 2. Set Cookie with the RAW token
        this.setCookies(res, accessToken, rawRefreshToken); 

        return { accessToken, refreshToken: rawRefreshToken };
    },

    /**
     * Re-issue a new access token from a valid refresh token (RAW from cookie).
     */
    async refreshAccessToken(rawRefreshToken: string) {
        // Hash the incoming cookie token to find it in the database
        const hashedJti = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

        const session = await tokenRepository.findValidToken(hashedJti);
        if (!session) {
            return null; // Invalid, revoked, or expired
        }

        const now = Math.floor(Date.now() / 1000);
        let payload: CallerIdentity;

        if (session.member && session.member.entity) {
            payload = {
                sub: session.member.id,
                type: AuthType.B2B,
                email: session.member.email,
                entityId: session.member.entityId,
                entityType: session.member.entity.type,
                role: session.member.role,
                jti: session.jti,
                iat: now,
                exp: now + env.JWT_ACCESS_TTL,
            };
        } else if (session.user) {
            payload = {
                sub: session.user.id,
                type: AuthType.B2C,
                wallet: session.user.walletAddress,
                jti: session.jti,
                iat: now,
                exp: now + env.JWT_ACCESS_TTL,
            };
        } else {
            return null; // Corrupted session
        }

        return jwt.sign(payload, env.JWT_SECRET, { algorithm: 'HS256' });
    }
};
