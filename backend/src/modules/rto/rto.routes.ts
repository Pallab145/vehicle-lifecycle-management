import { Router } from 'express';
import { rtoController } from './rto.controller';
import { requireAuth } from '@/middlewares/requireAuth';
import { requireEntityType, requireRole } from '@/middlewares/rbac';
import { EntityType, MemberRole } from '@/generated/prisma/client';

const router = Router();

// Apply B2B Auth + Require RTO Entity Type
router.use(requireAuth);
router.use(requireEntityType([EntityType.RTO]));

// ==========================================
// Write Operations (Requires OPERATOR+)
// ==========================================
const writeAccess = requireRole([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.OPERATOR]);

/**
 * @route   POST /api/rto/trade-certs/issue
 * @desc    Issue a trade certificate to a dealer
 * @access  Private (RTO - Operator+)
 */
router.post('/trade-certs/issue', writeAccess, rtoController.issueTradeCert);

/**
 * @route   POST /api/rto/trade-certs/revoke/:dealerWallet
 * @desc    Revoke a trade certificate from a dealer
 * @access  Private (RTO - Operator+)
 */
router.post('/trade-certs/revoke/:dealerWallet', writeAccess, rtoController.revokeTradeCert);

/**
 * @route   POST /api/rto/vehicles/register
 * @desc    Register a new vehicle
 * @access  Private (RTO - Operator+)
 */
router.post('/vehicles/register', writeAccess, rtoController.registerVehicle);

/**
 * @route   POST /api/rto/transfers/:ownTid/approve
 * @desc    Approve an ownership transfer
 * @access  Private (RTO - Operator+)
 */
router.post('/transfers/:ownTid/approve', writeAccess, rtoController.approveTransfer);

// ==========================================
// Read Operations (Allows VIEWER+)
// ==========================================
const readAccess = requireRole([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.OPERATOR, MemberRole.VIEWER]);

/**
 * @route   GET /api/rto/trade-certs
 * @desc    List trade certificates issued by this RTO
 * @access  Private (RTO - Viewer+)
 */
router.get('/trade-certs', readAccess, rtoController.listTradeCerts);

/**
 * @route   GET /api/rto/vehicles/registrations
 * @desc    List vehicle registrations for this RTO
 * @access  Private (RTO - Viewer+)
 */
router.get('/vehicles/registrations', readAccess, rtoController.listRegistrations);

/**
 * @route   GET /api/rto/transfers
 * @desc    List transfer requests where the buyer belongs to this RTO
 * @access  Private (RTO - Viewer+)
 */
router.get('/transfers', readAccess, rtoController.listTransfers);

export default router;
