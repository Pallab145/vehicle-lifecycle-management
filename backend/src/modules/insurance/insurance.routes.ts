import { Router } from 'express';
import { insuranceController } from './insurance.controller';
import { requireAuth } from '@/middlewares/requireAuth';
import { requireEntityType, requireRole } from '@/middlewares/rbac';
import { requireB2B } from '@/middlewares/requireB2B';
import { EntityType, MemberRole } from '@/generated/prisma/client';

const router = Router();

// ============================================================================
// INSURANCE MODULE ROUTES
// Base Path:  /api/insurance
// Purpose:    Insurance operations (Issue Policy, File Claim, Mark Expired)
// Auth Chain: requireAuth → requireB2B → requireEntityType(INSURANCE) → requireRole
// ============================================================================

// Global guards — every insurance route requires authentication + INSURANCE entity membership
router.use(requireAuth);
router.use(requireB2B);
router.use(requireEntityType([EntityType.INSURANCE]));

// ─── WRITE OPERATIONS (ADMIN / OPERATOR only) ────────────────────────────────

/**
 * POST /api/insurance/policies
 * Issue a new vehicle insurance policy.
 */
router.post(
    '/policies',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR]),
    insuranceController.issuePolicy
);

/**
 * POST /api/insurance/policies/:polId/expire
 * Mark an expired policy as inactive.
 */
router.post(
    '/policies/:polId/expire',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR]),
    insuranceController.markExpired
);

/**
 * POST /api/insurance/policies/:polId/claims
 * File a claim on an active policy.
 */
router.post(
    '/policies/:polId/claims',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR]),
    insuranceController.fileClaim
);

// ─── READ OPERATIONS (All authenticated insurance members) ───────────────────

/**
 * GET /api/insurance/policies
 * List all policies issued by this company (paginated, filterable).
 */
router.get(
    '/policies',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR, MemberRole.VIEWER]),
    insuranceController.listPolicies
);

/**
 * GET /api/insurance/vehicle/:ownTid/policy
 * Get current active policy for a specific vehicle.
 * IMPORTANT: Route is placed BEFORE /:polId routes to avoid Express param collision.
 */
router.get(
    '/vehicle/:ownTid/policy',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR, MemberRole.VIEWER]),
    insuranceController.getVehiclePolicy
);

/**
 * GET /api/insurance/policies/:polId
 * Get full details of a specific policy.
 */
router.get(
    '/policies/:polId',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR, MemberRole.VIEWER]),
    insuranceController.getPolicyDetails
);

export default router;
