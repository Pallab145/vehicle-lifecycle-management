import { Router } from 'express';
import { paymentController } from './payment.controller';
import { requireAuth } from '@/middlewares/requireAuth';
import { createServiceRateLimit } from '@/middlewares/rate-limit';

const router = Router();

// Rate limit for payment initiation (prevent flooding)
const paymentRateLimit = createServiceRateLimit('payment-initiation');

// ─────────────────────────────────────────────────────────────
// CITIZEN: Authenticated routes (citizen must be logged in)
// ─────────────────────────────────────────────────────────────
router.use('/challans', requireAuth);

/**
 * @route   POST /api/payment/challans/:challanId/initiate
 * @desc    Citizen initiates payment for a challan.
 *          Returns a mock payment order with a dev webhook payload for testing.
 * @access  Private (Citizen)
 */
router.post(
    '/challans/:challanId/initiate',
    paymentRateLimit,
    paymentController.initiateChallanPayment
);

/**
 * @route   GET /api/payment/challans
 * @desc    List active/past challans for the logged-in citizen
 * @access  Private (Citizen)
 */
router.get(
    '/challans',
    paymentController.listCitizenChallans
);

// ─────────────────────────────────────────────────────────────
// WEBHOOK: No user auth — HMAC signature verified in service
// ─────────────────────────────────────────────────────────────

/**
 * @route   POST /api/payment/webhook/challan
 * @desc    Mock payment gateway callback.
 *          Validates HMAC, then submits payChallan() via Police entity wallet.
 * @access  Public (HMAC-protected — do NOT add requireAuth here)
 */
router.post('/webhook/challan', paymentController.handleChallanPaymentWebhook);

export default router;
