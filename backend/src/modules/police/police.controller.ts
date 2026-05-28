import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { policeService } from './police.service';
import { issueChallanSchema, listChallansSchema, payChallanSchema } from './police.schema';
import { sanitizeResponseData } from '@/utils/sanitizer';
import createError from 'http-errors';

export const policeController = {
    /**
     * @route   POST /api/police/challans/issue
     * @desc    Issue a challan to a vehicle
     * @access  Private (B2B - POLICE)
     */
    issueChallan: asyncHandler(async (req: Request, res: Response) => {
        const input = issueChallanSchema.parse(req.body);
        
        const b2bEntityId = req.caller!.entityId!;
        const memberId = req.caller!.sub;

        const result = await policeService.issueChallan(input, b2bEntityId, memberId);

        res.status(202).json({
            success: true,
            message: result.message,
            challanDetails: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   POST /api/police/challans/:challanId/cancel
     * @desc    Cancel an issued challan
     * @access  Private (B2B - POLICE)
     */
    cancelChallan: asyncHandler(async (req: Request, res: Response) => {
        const { challanId } = req.params;
        if (!challanId) {
            throw createError(400, 'challanId is required');
        }

        const b2bEntityId = req.caller!.entityId!;
        const memberId = req.caller!.sub;

        const result = await policeService.cancelChallan(challanId as string, b2bEntityId, memberId);

        res.status(202).json({
            success: true,
            message: 'Challan cancellation initiated',
            cancelDetails: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   POST /api/police/challans/:challanId/pay
     * @desc    Pay an issued challan (e.g. offline payment collected)
     * @access  Private (B2B - POLICE)
     */
    payChallan: asyncHandler(async (req: Request, res: Response) => {
        const { challanId } = req.params;
        if (!challanId) {
            throw createError(400, 'challanId is required');
        }

        const input = payChallanSchema.parse(req.body);

        const b2bEntityId = req.caller!.entityId!;
        const memberId = req.caller!.sub;

        const result = await policeService.payChallan(challanId as string, input, b2bEntityId, memberId);

        res.status(202).json({
            success: true,
            message: result.message,
            payDetails: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   GET /api/police/challans
     * @desc    List challans issued by this Police Station
     * @access  Private (B2B - POLICE)
     */
    listChallans: asyncHandler(async (req: Request, res: Response) => {
        const input = listChallansSchema.parse(req.query);
        
        const b2bEntityId = req.caller!.entityId!;

        const result = await policeService.listChallans(b2bEntityId, input);

        res.status(200).json({
            success: true,
            data: sanitizeResponseData(result)
        });
    })
};
