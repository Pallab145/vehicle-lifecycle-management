import { Router } from 'express';
import { adminController } from './admin.controller';
import { requireAuth } from '@/middlewares/requireAuth';
import { requireEntityType, requireRole } from '@/middlewares/rbac';
import { requireB2B } from '@/middlewares/requireB2B';
import { EntityType, MemberRole } from '@/generated/prisma/client';

const router = Router();

// ============================================================================
// ADMIN (SAFE GOVERNANCE) ROUTES
// Base Path: /api/admin
// Purpose: Multi-sig governance over the MoRTH Gnosis Safe
// ============================================================================

// All routes require authentication, Government entity membership, and the strict OWNER role
router.use(requireAuth);
router.use(requireB2B);
router.use(requireEntityType([EntityType.GOVERNMENT]));
router.use(requireRole([MemberRole.OWNER]));

/**
 * GET /api/admin/safe/info
 * View Safe config (threshold, owners, nonce).
 * Accessible to Government OWNER members only.
 */
router.get('/safe/info', adminController.getSafeInfo);

/**
 * GET /api/admin/proposals
 * List all governance proposals.
 * Accessible to Government OWNER members only.
 */
router.get('/proposals', adminController.listProposals);

/**
 * GET /api/admin/proposals/:id
 * View specific proposal details and signatures.
 * Accessible to Government OWNER members only.
 */
router.get('/proposals/:id', adminController.getProposal);


/**
 * DELETE /api/admin/proposals/:id
 * Cancel a pending proposal.
 */
router.delete('/proposals/:id', adminController.cancelProposal);

/**
 * POST /api/admin/proposals/:id/sign
 * Submit an EIP-712 signature for the proposal.
 */
router.post('/proposals/:id/sign', adminController.signProposal);

/**
 * POST /api/admin/proposals/:id/execute
 * Manually trigger fallback execution for a failed/stuck proposal.
 */
router.post('/proposals/:id/execute', adminController.executeProposalFallback);

export default router;
