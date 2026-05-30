import { Router } from 'express';
import { citizenController } from './citizen.controller';
import { requireAuth } from '@/middlewares/requireAuth';
import { requireB2C } from '@/middlewares/requireB2C';
import { requireKyc } from '@/middlewares/requireKyc';
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

/**
 * @route   GET /api/citizens/scrap-centers
 * @desc    List all active Scrap Centers for the citizen selection dropdown
 * @access  Public (no auth required)
 */
router.get('/scrap-centers', citizenController.listScrapCenters);

// All citizen routes below require a valid JWT AND must be a B2C citizen account
router.use(requireAuth, requireB2C);

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

/**
 * @route   GET /api/citizens/vehicles
 * @desc    Get all vehicles owned by the authenticated citizen
 * @access  Private (Citizen, KYC Required)
 */
router.get('/vehicles', requireKyc, citizenController.getMyVehicles);

/**
 * @route   GET /api/citizens/vehicles/:ownTid
 * @desc    Get full details for a single vehicle owned by the citizen
 * @access  Private (Citizen, KYC Required)
 */
router.get('/vehicles/:ownTid', requireKyc, citizenController.getVehicleDetail);

/**
 * @route   GET /api/citizens/vehicles/by-dvp/:dvpId/scrap/eligibility
 * @desc    Pre-flight check for scrapping a vehicle (keyed by DVP token ID)
 * @access  Private (Citizen, KYC Required)
 *
 * IMPORTANT: Uses 'by-dvp' prefix to avoid Express route conflict with /vehicles/:ownTid.
 * authorizeScrap(tokenId, scrapCenterCode) in the DVP contract takes the DVP token ID.
 */
router.get('/vehicles/by-dvp/:dvpId/scrap/eligibility', requireKyc, citizenController.checkScrapEligibility);

/**
 * @route   GET /api/citizens/vehicles/:ownTid/transfer/eligibility
 * @desc    Pre-flight check for transferring a vehicle
 * @access  Private (Citizen, KYC Required)
 */
router.get('/vehicles/:ownTid/transfer/eligibility', requireKyc, citizenController.checkTransferEligibility);

/**
 * @route   GET /api/citizens/vehicles/:ownTid/transfer/status
 * @desc    Get the status of a pending transfer for a specific vehicle (for buyer/seller)
 * @access  Private (Citizen, KYC Required)
 */
router.get('/vehicles/:ownTid/transfer/status', requireKyc, citizenController.getTransferStatus);

export { router as citizenRoutes };
