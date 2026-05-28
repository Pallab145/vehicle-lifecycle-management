import type { Request, Response, NextFunction } from 'express';
import createError from 'http-errors';
import { EntityType, MemberRole } from '@/generated/prisma/client';
import { logger } from '@/lib/logger';
import { asyncHandler } from '@/utils/asyncHandler';

/**
 * Restricts access to B2B callers belonging to specific institutional entity types.
 */
export function requireEntityType(allowedTypes: EntityType[]) {
    return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
        const caller = req.caller;
        
        if (!caller) {
            throw createError(401, 'Authentication required');
        }

        if (!caller.entityType || !allowedTypes.includes(caller.entityType)) {
            logger.warn(
                { callerId: caller.sub, actualType: caller.entityType, allowedTypes },
                'Forbidden entity type access attempt'
            );
            throw createError(403, 'Access denied: insufficient organization privileges');
        }

        next();
    });
}

/**
 * Restricts access to B2B callers holding specific administrative or operational roles.
 */
export function requireRole(allowedRoles: MemberRole[]) {
    return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
        const caller = req.caller;

        if (!caller) {
            throw createError(401, 'Authentication required');
        }

        if (!caller.role || !allowedRoles.includes(caller.role)) {
            logger.warn(
                { callerId: caller.sub, actualRole: caller.role, allowedRoles },
                'Forbidden role access attempt'
            );
            throw createError(403, 'Access denied: insufficient member role privileges');
        }

        next();
    });
}
