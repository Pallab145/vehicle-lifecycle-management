import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { adminService } from './admin.service';
import {
    ListProposalsQuerySchema,
    ProposalIdParamSchema,
    SignProposalSchema
} from './admin.schema';
import { sanitizeResponseData } from '@/utils/sanitizer';

export const adminController = {
    /**
     * @route   GET /api/admin/safe/info
     * @desc    Get Safe configuration from the blockchain
     * @access  Private (B2B - GOVERNMENT)
     */
    getSafeInfo: asyncHandler(async (_req: Request, res: Response) => {
        const info = await adminService.getSafeInfo();
        res.status(200).json({
            success: true,
            safeInfo: sanitizeResponseData(info)
        });
    }),

    /**
     * @route   GET /api/admin/proposals
     * @desc    List all Gnosis Safe proposals
     * @access  Private (B2B - GOVERNMENT)
     */
    listProposals: asyncHandler(async (req: Request, res: Response) => {
        const { query } = ListProposalsQuerySchema.parse({ query: req.query });
        const result = await adminService.listProposals({
            page: parseInt(query.page, 10),
            limit: parseInt(query.limit, 10),
            status: query.status
        });

        res.status(200).json({
            success: true,
            proposals: sanitizeResponseData(result.proposals),
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                totalPages: Math.ceil(result.total / result.limit)
            }
        });
    }),

    /**
     * @route   GET /api/admin/proposals/:id
     * @desc    Get details of a specific proposal
     * @access  Private (B2B - GOVERNMENT)
     */
    getProposal: asyncHandler(async (req: Request, res: Response) => {
        const { params } = ProposalIdParamSchema.parse({ params: req.params });
        const result = await adminService.getProposal(params.id);

        res.status(200).json({
            success: true,
            proposal: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   DELETE /api/admin/proposals/:id
     * @desc    Cancel a pending proposal
     * @access  Private (B2B - GOVERNMENT OWNER)
     */
    cancelProposal: asyncHandler(async (req: Request, res: Response) => {
        const { params } = ProposalIdParamSchema.parse({ params: req.params });
        const result = await adminService.cancelProposal(params.id);

        res.status(200).json({
            success: true,
            message: 'Proposal cancelled successfully',
            proposal: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   POST /api/admin/proposals/:id/sign
     * @desc    Submit EIP-712 signature for a proposal
     * @access  Private (B2B - GOVERNMENT OWNER)
     */
    signProposal: asyncHandler(async (req: Request, res: Response) => {
        const { params, body } = SignProposalSchema.parse({ params: req.params, body: req.body });
        const memberId = req.caller!.sub;
        const memberWallet = req.caller!.wallet;

        if (!memberWallet) {
            res.status(403).json({ success: false, message: 'Your account does not have an associated wallet address' });
            return;
        }

        const result = await adminService.signProposal(params.id, body.signature, memberId, memberWallet);

        res.status(200).json({
            success: true,
            message: result.message,
            signature: sanitizeResponseData(result.signature)
        });
    }),

    /**
     * @route   POST /api/admin/proposals/:id/execute
     * @desc    Manually trigger execution fallback
     * @access  Private (B2B - GOVERNMENT OWNER)
     */
    executeProposalFallback: asyncHandler(async (req: Request, res: Response) => {
        const { params } = ProposalIdParamSchema.parse({ params: req.params });
        const result = await adminService.executeProposalFallback(params.id);

        res.status(202).json({
            success: true,
            message: result.message
        });
    }),
};
