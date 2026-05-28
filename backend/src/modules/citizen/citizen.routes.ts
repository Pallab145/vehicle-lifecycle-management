import { Router } from 'express';
import { citizenController } from './citizen.controller';
import { requireAuth } from '@/middlewares/requireAuth';
import { createServiceRateLimit } from '@/middlewares/rate-limit';

const router = Router();

// Apply a strict rate limit for KYC verification endpoints to prevent API abuse/spamming
const kycRateLimit = createServiceRateLimit('kyc-verification');

/**
 * @route   GET /api/citizens/rtos
 * @desc    List all active RTOs for the citizen selection dropdown
 * @access  Public (no auth required — needed before login to choose RTO)
 */
router.get('/rtos', citizenController.listRtos);

// All citizen routes below require a valid JWT (User must be logged in)
router.use(requireAuth);

/**
 * @route   POST /api/citizens/kyc
 * @desc    Submit mock KYC verification data
 * @access  Private (Citizen)
 */
router.post('/kyc', kycRateLimit, citizenController.verifyKyc);

/**
 * @route   GET /api/citizens/me
 * @desc    Get the current citizen's profile
 * @access  Private (Citizen)
 */
router.get('/me', citizenController.getMe);

export { router as citizenRoutes };
