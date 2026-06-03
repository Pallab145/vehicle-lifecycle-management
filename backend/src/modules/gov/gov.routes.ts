import { Router } from 'express';
import { govController } from './gov.controller';
import { requireAuth } from '@/middlewares/requireAuth';
import { requireEntityType, requireRole } from '@/middlewares/rbac';
import { requireB2B } from '@/middlewares/requireB2B';
import { EntityType, MemberRole } from '@/generated/prisma/client';

const router = Router();

// ============================================================================
// GOVERNMENT MODULE ROUTES
// Base Path: /api/gov
// Purpose: Super-admin capabilities and system-wide oversight
// ============================================================================

// All routes require authentication and Government entity membership
router.use(requireAuth);
router.use(requireB2B);
router.use(requireEntityType([EntityType.GOVERNMENT]));

// ----------------------------------------------------------------------------
// SYSTEM ANALYTICS
// ----------------------------------------------------------------------------

/**
 * GET /api/gov/analytics
 * Retrieve system-wide analytics (vehicles, fines, institutions).
 */
router.get(
    '/analytics',
    govController.getSystemAnalytics
);

/**
 * GET /api/gov/audit-logs
 * Retrieve system-wide aggregated audit logs.
 */
router.get(
    '/audit-logs',
    govController.getGlobalAuditLogs
);

// ----------------------------------------------------------------------------
// GLOBAL CHALLAN MANAGEMENT
// ----------------------------------------------------------------------------

/**
 * GET /api/gov/challans
 * List all challans globally across the entire system.
 * Accessible to any Government member.
 */
router.get(
    '/challans',
    govController.listGlobalChallans
);

/**
 * POST /api/gov/challans/:challanId/cancel
 * Administrative cancellation of a challan (adminCancelChallan).
 * Requires OWNER or MANAGER role within the Government entity.
 */
router.post(
    '/challans/:challanId/cancel',
    requireRole([MemberRole.OWNER, MemberRole.ADMIN]),
    govController.adminCancelChallan
);

export default router;
