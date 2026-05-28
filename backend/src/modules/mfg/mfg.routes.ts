import { Router } from 'express';
import { mfgController } from './mfg.controller';
import { requireAuth } from '@/middlewares/requireAuth';
import { requireEntityType, requireRole } from '@/middlewares/rbac';
import { EntityType, MemberRole } from '@/generated/prisma/client';

const router = Router();

// Middleware to ensure all routes in this file are strictly for MANUFACTURER entities
router.use(requireAuth);
router.use(requireEntityType([EntityType.MANUFACTURER]));

// GET /api/mfg/vehicles
// List vehicles manufactured by this entity
router.get(
    '/vehicles',
    requireRole([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.OPERATOR, MemberRole.VIEWER]),
    mfgController.listVehicles
);

// POST /api/mfg/vehicles/manufacture
// Only MFG owners or admins can mint vehicles
router.post(
    '/vehicles/manufacture',
    requireRole([MemberRole.OWNER, MemberRole.ADMIN]),
    mfgController.manufactureVehicle
);

// POST /api/mfg/vehicles/:tokenId/assign
// Only MFG owners or admins can assign vehicles to dealers
router.post(
    '/vehicles/:tokenId/assign',
    requireRole([MemberRole.OWNER, MemberRole.ADMIN]),
    mfgController.assignToDealer
);

export default router;
