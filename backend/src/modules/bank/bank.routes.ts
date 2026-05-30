import { Router } from 'express';
import { bankController } from './bank.controller';
import { requireAuth } from '@/middlewares/requireAuth';
import { requireEntityType, requireRole } from '@/middlewares/rbac';
import { requireB2B } from '@/middlewares/requireB2B';
import { EntityType, MemberRole } from '@/generated/prisma/client';

const router = Router();

// ============================================================================
// BANK MODULE ROUTES
// Base Path:  /api/bank
// Purpose:    Financial Institution operations (Hypothecation, NOC, Refinance)
// Auth Chain: requireAuth → requireB2B → requireEntityType(BANK) → requireRole
// ============================================================================

// Global guards — every bank route requires authentication + BANK entity membership
router.use(requireAuth);
router.use(requireB2B);
router.use(requireEntityType([EntityType.BANK]));

// ─── WRITE OPERATIONS (ADMIN / OPERATOR only) ────────────────────────────────

/**
 * POST /api/bank/loans
 * Register a new loan (hypothecation) on a vehicle.
 * Handles: brand-new car loans, used-car transfer loans, and title loans.
 */
router.post(
    '/loans',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR]),
    bankController.registerLoan
);

/**
 * POST /api/bank/loans/:loanId/noc
 * Issue a No Objection Certificate — clears the vehicle lien.
 * Optionally mints an NFT NOC to the current vehicle owner if registered.
 */
router.post(
    '/loans/:loanId/noc',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR]),
    bankController.issueNoc
);

/**
 * DELETE /api/bank/loans/pending/:dvpId
 * Cancel a pending used-car transfer loan (loan attached but transfer not yet RTO-approved).
 * Calls LoanContract.cancelPendingLoan(dvpId) which detaches it from the OwnershipToken transfer.
 * IMPORTANT: Route is placed BEFORE /:loanId routes to avoid Express param collision.
 */
router.delete(
    '/loans/pending/:dvpId',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR]),
    bankController.cancelPendingLoan
);

/**
 * POST /api/bank/loans/:loanId/refinance
 * Refinance an existing ACTIVE loan with updated amount and/or tenure.
 * Closes old loan on-chain and creates a new one atomically.
 */
router.post(
    '/loans/:loanId/refinance',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR]),
    bankController.refinanceLoan
);

// ─── READ OPERATIONS (All authenticated bank members) ────────────────────────

/**
 * GET /api/bank/loans
 * List all loans disbursed by this bank with pagination and optional filters
 * (status, nocIssued, ownTid).
 */
router.get(
    '/loans',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR, MemberRole.VIEWER]),
    bankController.listLoans
);

/**
 * GET /api/bank/loans/:loanId
 * Get full details of a single loan record.
 */
router.get(
    '/loans/:loanId',
    requireRole([MemberRole.ADMIN, MemberRole.OPERATOR, MemberRole.VIEWER]),
    bankController.getLoanDetails
);

export default router;
