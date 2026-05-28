import { Router } from 'express';
import { logger } from '@/lib/logger';

import authRoutes from '@/modules/auth/auth.routes';
import b2bEntityRoutes from '@/modules/b2b-entity/b2b-entity.routes';
import { citizenRoutes } from '@/modules/citizen/citizen.routes';
import { notificationRoutes } from '@/modules/notification/notification.routes';
import b2bMemberRoutes from '@/modules/b2b-member/b2b-member.routes';

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

export default router;
