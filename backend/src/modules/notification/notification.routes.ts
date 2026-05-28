import { Router } from 'express';
import { notificationController } from './notification.controller';
import { requireAuth } from '@/middlewares/requireAuth';
import { createServiceRateLimit } from '@/middlewares/rate-limit';

const router = Router();

// Strict rate limit for opening SSE connections to prevent Socket exhaustion attacks.
const sseRateLimit = createServiceRateLimit('sse-connections');

// All SSE connections must be authenticated via JWT
router.use(requireAuth);

/**
 * @route   GET /api/notifications/stream
 * @desc    Establish a long-lived Server-Sent Events stream for real-time Web3 updates.
 * @access  Private (B2B Member or B2C Citizen)
 */
router.get('/stream', sseRateLimit, notificationController.stream);

export { router as notificationRoutes };
