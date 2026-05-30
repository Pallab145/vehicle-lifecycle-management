import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { insuranceService } from './insurance.service';
import {
    issuePolicySchema,
    markExpiredParamsSchema,
    fileClaimParamsSchema,
    listPoliciesSchema,
} from './insurance.schema';
import { sanitizeResponseData } from '@/utils/sanitizer';
import createError from 'http-errors';

export const insuranceController = {

    /**
     * @route   POST /api/insurance/policies
     * @desc    Issue a new vehicle insurance policy
     * @access  Private (B2B - INSURANCE, roles: ADMIN | OPERATOR)
     */
    issuePolicy: asyncHandler(async (req: Request, res: Response) => {
        const input       = issuePolicySchema.parse(req.body);
        const insEntityId = req.caller!.entityId!;
        const memberId    = req.caller!.sub;

        const result = await insuranceService.issuePolicy(input, insEntityId, memberId);

        res.status(202).json({
            success: true,
            message: 'Insurance policy issuance submitted to blockchain.',
            policyDetails: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   POST /api/insurance/policies/:polId/expire
     * @desc    Mark an expired policy as inactive
     * @access  Private (B2B - INSURANCE, roles: ADMIN | OPERATOR)
     */
    markExpired: asyncHandler(async (req: Request, res: Response) => {
        const { polId }   = markExpiredParamsSchema.parse(req.params);
        const insEntityId = req.caller!.entityId!;
        const memberId    = req.caller!.sub;

        const result = await insuranceService.markExpired(polId, insEntityId, memberId);

        res.status(202).json({
            success: true,
            message: 'Policy expiration submitted to blockchain.',
            expirationDetails: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   POST /api/insurance/policies/:polId/claims
     * @desc    File a claim on an active policy
     * @access  Private (B2B - INSURANCE, roles: ADMIN | OPERATOR)
     */
    fileClaim: asyncHandler(async (req: Request, res: Response) => {
        const { polId }   = fileClaimParamsSchema.parse(req.params);
        const insEntityId = req.caller!.entityId!;
        const memberId    = req.caller!.sub;

        const result = await insuranceService.fileClaim(polId, insEntityId, memberId);

        res.status(202).json({
            success: true,
            message: 'Claim filing submitted to blockchain.',
            claimDetails: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   GET /api/insurance/policies
     * @desc    List all policies issued by this company (paginated, filterable)
     * @access  Private (B2B - INSURANCE, roles: ADMIN | OPERATOR | VIEWER)
     */
    listPolicies: asyncHandler(async (req: Request, res: Response) => {
        const input       = listPoliciesSchema.parse(req.query);
        const insEntityId = req.caller!.entityId!;

        const result = await insuranceService.listPolicies(input, insEntityId);

        res.status(200).json({
            success: true,
            policies: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   GET /api/insurance/policies/:polId
     * @desc    Get full details of a specific policy
     * @access  Private (B2B - INSURANCE, roles: ADMIN | OPERATOR | VIEWER)
     */
    getPolicyDetails: asyncHandler(async (req: Request, res: Response) => {
        const { polId } = req.params;
        if (!polId) throw createError(400, 'polId route parameter is required.');

        const insEntityId = req.caller!.entityId!;

        const result = await insuranceService.getPolicyDetails(polId as string, insEntityId);

        res.status(200).json({
            success: true,
            policyDetails: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   GET /api/insurance/vehicle/:ownTid/policy
     * @desc    Get current active policy for a specific vehicle
     * @access  Private (B2B - INSURANCE, roles: ADMIN | OPERATOR | VIEWER)
     */
    getVehiclePolicy: asyncHandler(async (req: Request, res: Response) => {
        const { ownTid } = req.params;
        if (!ownTid) throw createError(400, 'ownTid route parameter is required.');

        const result = await insuranceService.getVehiclePolicy(ownTid as string);

        res.status(200).json({
            success: true,
            policyDetails: sanitizeResponseData(result)
        });
    })
};
