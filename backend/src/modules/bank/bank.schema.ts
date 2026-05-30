import { z } from 'zod';
import { LoanStatus } from '@/generated/prisma/client';

// ─── Register Loan ────────────────────────────────────────────────────────────

export const registerLoanSchema = z.object({
    /**
     * On-chain Digital Vehicle Passport ID (dvpId) of the vehicle being financed.
     * The service resolves the ownership context before calling the contract.
     */
    dvpId: z.string().min(1, 'DVP Token ID (dvpId) is required'),

    /**
     * Borrower's Ethereum wallet address (the vehicle buyer).
     * For new cars: the buyer who will own the vehicle.
     * For used-car transfers: the buyer in the active transfer request.
     * For title loans: must match the current vehicle owner.
     */
    borrowerWallet: z
        .string()
        .regex(/^0x[0-9a-fA-F]{40}$/, 'borrowerWallet must be a valid Ethereum address'),

    /**
     * Loan amount in the smallest unit (e.g., paise for INR).
     * Stored as a string to prevent precision loss for large uint128 values.
     */
    amount: z
        .string()
        .regex(/^\d+$/, 'Amount must be a non-negative integer string (e.g. "500000")'),

    /**
     * Loan tenure in months. Solidity type: uint16 → max 65535 months.
     * Practical limit capped at 360 months (30 years).
     */
    tenure: z
        .number()
        .int('Tenure must be a whole number')
        .positive('Tenure must be positive')
        .max(360, 'Tenure cannot exceed 360 months (30 years)'),
});

// ─── Issue NOC ────────────────────────────────────────────────────────────────

// No body required for issueNoc — loanId comes from the route param.

// ─── Cancel Pending Loan ──────────────────────────────────────────────────────

/**
 * Route param for cancelling a pending (used-car transfer) loan.
 * Uses dvpId directly because the contract indexes loans by dvpId.
 */
export const cancelPendingLoanParamsSchema = z.object({
    dvpId: z
        .string()
        .min(1, 'dvpId is required')
        .regex(/^\d+$/, 'dvpId must be a numeric string'),
});

// ─── Refinance Loan ───────────────────────────────────────────────────────────

export const refinanceLoanBodySchema = z.object({
    /**
     * New loan amount in smallest unit (uint128 in Solidity).
     */
    newAmount: z
        .string()
        .regex(/^\d+$/, 'newAmount must be a non-negative integer string'),

    /**
     * New tenure in months (uint16 in Solidity, max 65535).
     */
    newTenure: z
        .number()
        .int('newTenure must be a whole number')
        .positive('newTenure must be positive')
        .max(360, 'newTenure cannot exceed 360 months'),
});

// ─── List Loans ───────────────────────────────────────────────────────────────

export const listLoansSchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z.nativeEnum(LoanStatus).optional(),
    nocIssued: z.coerce.boolean().optional(),
    /** Filter by DVP token ID */
    dvpId: z.string().optional(),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type RegisterLoanBody      = z.infer<typeof registerLoanSchema>;
export type CancelPendingLoanParams = z.infer<typeof cancelPendingLoanParamsSchema>;
export type RefinanceLoanBody     = z.infer<typeof refinanceLoanBodySchema>;
export type ListLoansQuery        = z.infer<typeof listLoansSchema>;