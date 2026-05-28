import { Router } from 'express';
import { policeController } from './police.controller';
import { requireAuth } from '@/middlewares/requireAuth';
import { requireEntityType, requireRole } from '@/middlewares/rbac';
import { EntityType, MemberRole } from '@/generated/prisma/client';

const router = Router();

// All routes require authentication and POLICE entity type
router.use(requireAuth);
router.use(requireEntityType([EntityType.POLICE]));

// 1. Issue a Challan
// Only ADMIN and OPERATOR can issue challans.
router.post(
    '/challans/issue',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR]),
    policeController.issueChallan
);

// 2. Cancel a Challan
// Only ADMIN can cancel a challan.
router.post(
    '/challans/:challanId/cancel',
    requireRole([MemberRole.ADMIN]),
    policeController.cancelChallan
);

// 3. Mark a Challan as Paid
// Only ADMIN and OPERATOR can process offline payments.
router.post(
    '/challans/:challanId/mark-paid',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR]),
    policeController.payChallan
);

// 4. List Challans
// Any police member (ADMIN, OPERATOR, VIEWER) can list.
router.get(
    '/challans',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR, MemberRole.VIEWER]),
    policeController.listChallans
);

export default router;
