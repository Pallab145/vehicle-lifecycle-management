import { Router } from 'express';
import { scrapController } from './scrap.controller';
import { requireAuth } from '@/middlewares/requireAuth';
import { requireB2B } from '@/middlewares/requireB2B';
import { requireEntityType, requireRole } from '@/middlewares/rbac';
import { EntityType, MemberRole } from '@/generated/prisma/client';

const router = Router();

// ============================================================================
// SCRAP CENTER MODULE ROUTES
// Base Path:  /api/scrap
// Auth Chain: requireAuth → requireB2B → requireEntityType(SCRAP_CENTER) → requireRole
// ============================================================================

router.use(requireAuth);
router.use(requireB2B);
router.use(requireEntityType([EntityType.SCRAP_CENTER]));

// ─── WRITE OPERATIONS (ADMIN / OPERATOR only) ────────────────────────────────

router.post(
    '/vehicles/:dvpId/scrap',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR]),
    scrapController.scrapVehicle
);

// ─── READ OPERATIONS (All authenticated scrap center members) ───────────────────

router.get(
    '/vehicles/:dvpId/eligibility',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR, MemberRole.VIEWER]),
    scrapController.checkEligibility
);

router.get(
    '/vehicles',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR, MemberRole.VIEWER]),
    scrapController.listScrappedVehicles
);

router.get(
    '/vehicles/:dvpId',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR, MemberRole.VIEWER]),
    scrapController.getVehicleDetails
);

export default router;
