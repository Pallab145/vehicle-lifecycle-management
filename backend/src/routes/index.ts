import { Router } from 'express';
import { logger } from '@/lib/logger';

import authRoutes from '@/modules/auth/auth.routes';
import b2bEntityRoutes from '@/modules/b2b-entity/b2b-entity.routes';
import { citizenRoutes } from '@/modules/citizen/citizen.routes';
import { notificationRoutes } from '@/modules/notification/notification.routes';
import b2bMemberRoutes from '@/modules/b2b-member/b2b-member.routes';
import mfgRoutes from '@/modules/mfg/mfg.routes';
import rtoRoutes from '@/modules/rto/rto.routes';
import { dealerRoutes } from '@/modules/dealer/dealer.routes';
import policeRoutes from '@/modules/police/police.routes';
import paymentRoutes from '@/modules/payment/payment.routes';
import govRoutes from '@/modules/gov/gov.routes';

const router = Router();

router.get('/health', (_req, res) => {
  logger.info('Health check endpoint hit');
  res.status(200).json({ status: 'OK', message: 'Backend is running successfully!' });
});

// ── Register Modules ──
router.use('/auth', authRoutes);
router.use('/institutions', b2bEntityRoutes);
router.use('/staff', b2bMemberRoutes);
router.use('/citizens', citizenRoutes);
router.use('/notifications', notificationRoutes);
router.use('/mfg', mfgRoutes);
router.use('/rto', rtoRoutes);
router.use('/dealer', dealerRoutes);
router.use('/police', policeRoutes);
router.use('/payment', paymentRoutes);
router.use('/gov', govRoutes);

export default router;
