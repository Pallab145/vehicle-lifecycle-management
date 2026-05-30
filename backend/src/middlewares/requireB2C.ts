import type { Request, Response, NextFunction } from 'express';
import createError from 'http-errors';
import { logger } from '@/lib/logger';
import { AuthType } from '@/types';
import { asyncHandler } from '@/utils/asyncHandler';

/**
 * Restricts access to B2C citizens only.
 * Ensures the caller is a B2C user (type === 'B2C') and has a wallet address.
 * Prevents B2B institutional members from calling citizen-only endpoints.
 */
export const requireB2C = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const caller = req.caller;

    if (!caller) {
        throw createError(401, 'Authentication required');
    }

    if (caller.type !== AuthType.B2C || !caller.wallet) {
        logger.warn(
            { callerId: caller.sub, callerType: caller.type },
            'Forbidden access attempt: Caller is not a B2C citizen'
        );
        throw createError(403, 'Access denied: This endpoint is restricted to citizen accounts only');
    }

    next();
});
