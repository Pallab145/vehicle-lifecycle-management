import type { Request, Response, NextFunction } from 'express';
import createError from 'http-errors';
import { logger } from '@/lib/logger';
import { asyncHandler } from '@/utils/asyncHandler';
import { citizenRepository } from '@/modules/citizen/citizen.repository';

/**
 * Strict middleware to enforce that a citizen has completed KYC verification.
 * MUST be applied AFTER `requireAuth` and `requireB2C`.
 */
export const requireKyc = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const caller = req.caller;

    if (!caller || !caller.sub) {
        throw createError(401, 'Authentication required');
    }

    // Query the database to ensure we have the most up-to-date verification status,
    // rather than relying on stale JWT claims (if any).
    const user = await citizenRepository.findById(caller.sub);

    if (!user) {
        throw createError(404, 'Citizen account not found');
    }

    if (!user.isVerified) {
        logger.warn(
            { callerId: caller.sub, wallet: caller.wallet },
            'Forbidden access attempt: Citizen has not completed KYC verification'
        );
        throw createError(403, 'Access denied: You must complete your KYC verification to perform this action or access this data.');
    }

    next();
});
