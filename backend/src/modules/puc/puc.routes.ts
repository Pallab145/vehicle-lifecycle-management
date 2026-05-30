import { Router } from 'express';
import { pucController } from './puc.controller';
import { requireAuth } from '@/middlewares/requireAuth';
import { requireB2B } from '@/middlewares/requireB2B';
import { requireEntityType, requireRole } from '@/middlewares/rbac';
import { EntityType, MemberRole } from '@/generated/prisma/client';

const router = Router();

// ============================================================================
// PUC MODULE ROUTES
// Base Path:  /api/puc
// Auth Chain: requireAuth → requireB2B → requireEntityType(PUC_CENTER) → requireRole
// ============================================================================

router.use(requireAuth);
router.use(requireB2B);
router.use(requireEntityType([EntityType.PUC_CENTER]));

router.post(
    '/certificates',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR]),
    pucController.issuePuc
);

router.post(
    '/certificates/:certId/expire',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR]),
    pucController.markExpired
);

router.get(
    '/certificates',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR, MemberRole.VIEWER]),
    pucController.listCertificates
);

router.get(
    '/vehicle/:ownTid/certificate',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR, MemberRole.VIEWER]),
    pucController.getVehicleCertificate
);

router.get(
    '/certificates/:certId',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR, MemberRole.VIEWER]),
    pucController.getCertificateDetails
);

export const pucRoutes = router;
