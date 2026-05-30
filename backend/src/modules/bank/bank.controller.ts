import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { bankService } from './bank.service';
import {
    registerLoanSchema,
    cancelPendingLoanParamsSchema,
    refinanceLoanBodySchema,
    listLoansSchema,
} from './bank.schema';
import { sanitizeResponseData } from '@/utils/sanitizer';
import createError from 'http-errors';

export const bankController = {

    /**
     * @route   POST /api/bank/loans
     * @desc    Register a new loan / hypothecation on a vehicle
     * @access  Private (B2B - BANK, roles: ADMIN | OPERATOR)
     */
    registerLoan: asyncHandler(async (req: Request, res: Response) => {
        const input        = registerLoanSchema.parse(req.body);
        const bankEntityId = req.caller!.entityId!;
        const memberId     = req.caller!.sub;

        const result = await bankService.registerLoan(input, bankEntityId, memberId);

        res.status(202).json({
            success: true,
            message: 'Loan registration submitted to blockchain.',
            loanDetails: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   POST /api/bank/loans/:loanId/noc
     * @desc    Issue NOC (No Objection Certificate) — clears the vehicle's lien
     * @access  Private (B2B - BANK, roles: ADMIN | OPERATOR)
     */
    issueNoc: asyncHandler(async (req: Request, res: Response) => {
        const { loanId } = req.params;
        if (!loanId) throw createError(400, 'loanId route parameter is required.');

        const bankEntityId = req.caller!.entityId!;
        const memberId     = req.caller!.sub;

        const result = await bankService.issueNoc(loanId as string, bankEntityId, memberId);

        res.status(202).json({
            success: true,
            message: 'NOC issuance submitted to blockchain.',
            nocDetails: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   DELETE /api/bank/loans/pending/:dvpId
     * @desc    Cancel a pending used-car transfer loan (detaches from active transfer)
     * @access  Private (B2B - BANK, roles: ADMIN | OPERATOR)
     */
    cancelPendingLoan: asyncHandler(async (req: Request, res: Response) => {
        const { dvpId } = cancelPendingLoanParamsSchema.parse(req.params);

        const bankEntityId = req.caller!.entityId!;
        const memberId     = req.caller!.sub;

        const result = await bankService.cancelPendingLoan(dvpId as string, bankEntityId, memberId);

        res.status(202).json({
            success: true,
            message: 'Pending loan cancellation submitted to blockchain.',
            cancellationDetails: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   POST /api/bank/loans/:loanId/refinance
     * @desc    Refinance an existing active loan with new amount and tenure
     * @access  Private (B2B - BANK, roles: ADMIN | OPERATOR)
     */
    refinanceLoan: asyncHandler(async (req: Request, res: Response) => {
        const { loanId } = req.params;
        if (!loanId) throw createError(400, 'loanId route parameter is required.');

        const input        = refinanceLoanBodySchema.parse(req.body);
        const bankEntityId = req.caller!.entityId!;
        const memberId     = req.caller!.sub;

        const result = await bankService.refinanceLoan(loanId as string, input, bankEntityId, memberId);

        res.status(202).json({
            success: true,
            message: 'Loan refinance submitted to blockchain.',
            refinanceDetails: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   GET /api/bank/loans
     * @desc    List loans disbursed by this bank (paginated, filterable)
     * @access  Private (B2B - BANK, roles: ADMIN | OPERATOR | VIEWER)
     */
    listLoans: asyncHandler(async (req: Request, res: Response) => {
        const input        = listLoansSchema.parse(req.query);
        const bankEntityId = req.caller!.entityId!;

        const result = await bankService.listLoans(input, bankEntityId);

        res.status(200).json({
            success: true,
            loans:   sanitizeResponseData(result)
        });
    }),

    /**
     * @route   GET /api/bank/loans/:loanId
     * @desc    Get full details of a specific loan
     * @access  Private (B2B - BANK, roles: ADMIN | OPERATOR | VIEWER)
     */
    getLoanDetails: asyncHandler(async (req: Request, res: Response) => {
        const { loanId } = req.params;
        if (!loanId) throw createError(400, 'loanId route parameter is required.');

        const bankEntityId = req.caller!.entityId!;

        const result = await bankService.getLoanDetails(loanId as string, bankEntityId);

        res.status(200).json({
            success: true,
            loanDetails: sanitizeResponseData(result)
        });
    }),
};
