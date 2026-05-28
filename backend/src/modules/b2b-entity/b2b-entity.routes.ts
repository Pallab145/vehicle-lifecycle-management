import { Router } from 'express';
import { requireAuth } from '@/middlewares/requireAuth';
import { requireEntityType, requireRole } from '@/middlewares/rbac';
import { createServiceRateLimit } from '@/middlewares/rate-limit';
import { EntityType, MemberRole } from '@/generated/prisma/client';
import { b2bEntityController } from './b2b-entity.controller';

const router = Router();
const b2bRateLimit = createServiceRateLimit('b2b-entities');

/**
 * @route   POST /api/institutions
 * @desc    Create a new B2B Entity (RTO, Manufacturer, Police, etc.)
 * @access  Private (GOVERNMENT Entity / OWNER or ADMIN role)
 */
router.post(
    '/',
    b2bRateLimit,
    requireAuth,
    requireEntityType([EntityType.GOVERNMENT]),
    requireRole([MemberRole.OWNER, MemberRole.ADMIN]),
    b2bEntityController.create
);

/**
 * @route   GET /api/institutions
 * @desc    Get paginated and filtered list of B2B Entities
 * @access  Private (GOVERNMENT Entity / OWNER, ADMIN, or VIEWER role)
 */
router.get(
    '/',
    b2bRateLimit,
    requireAuth,
    requireEntityType([EntityType.GOVERNMENT]),
    requireRole([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER]),
    b2bEntityController.list
);

/**
 * @route   PATCH /api/institutions/:id/toggle
 * @desc    Toggle the active status of a B2B Entity (Suspension/Activation)
 * @access  Private (GOVERNMENT Entity / OWNER or ADMIN role)
 */
router.patch(
    '/:id/toggle',
    b2bRateLimit,
    requireAuth,
    requireEntityType([EntityType.GOVERNMENT]),
    requireRole([MemberRole.OWNER, MemberRole.ADMIN]),
    b2bEntityController.toggle
);

/**
 * @route   GET /api/institutions/:id
 * @desc    Get details of a specific B2B Entity
 * @access  Private (GOVERNMENT Entity / OWNER, ADMIN, or VIEWER role)
 */
router.get(
    '/:id',
    b2bRateLimit,
    requireAuth,
    requireEntityType([EntityType.GOVERNMENT]),
    requireRole([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER]),
    b2bEntityController.getById
);

/**
 * @route   POST /api/institutions/:id/retry
 * @desc    Retry a FAILED blockchain registration
 * @access  Private (GOVERNMENT Entity / OWNER or ADMIN role)
 */
router.post(
    '/:id/retry',
    b2bRateLimit,
    requireAuth,
    requireEntityType([EntityType.GOVERNMENT]),
    requireRole([MemberRole.OWNER, MemberRole.ADMIN]),
    b2bEntityController.retryRegistration
);

export default router;
