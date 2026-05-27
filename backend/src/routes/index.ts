import { Router } from 'express';
import { logger } from '@/lib/logger';

const router = Router();

router.get('/health', (_req, res) => {
  logger.info('Health check endpoint hit');
  res.status(200).json({ status: 'OK', message: 'Backend is running successfully!' });
});

export default router;
