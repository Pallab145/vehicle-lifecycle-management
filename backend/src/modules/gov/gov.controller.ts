import type { Request, Response } from 'express';
import { govService } from './gov.service';
import { AdminCancelChallanSchema, ListGlobalChallansSchema } from './gov.schema';
import { asyncHandler } from '@/utils/asyncHandler';

export const govController = {
    /**
     * Admin overrides and cancels a challan.
     */
    adminCancelChallan: asyncHandler(async (req: Request, res: Response) => {
        const { params } = AdminCancelChallanSchema.parse({ params: req.params });
        const govEntityId = req.caller!.entityId!;
        const memberId = req.caller!.sub;

        const result = await govService.adminCancelChallan(params.challanId, govEntityId, memberId);

        res.status(200).json({
            success: true,
            message: 'Administrative challan cancellation transaction submitted.',
            data: result
        });
    }),

    /**
     * Lists ALL challans across the entire system.
     */
    listGlobalChallans: asyncHandler(async (req: Request, res: Response) => {
        const { query } = ListGlobalChallansSchema.parse({ query: req.query });
        const result = await govService.listGlobalChallans(query);

        res.status(200).json({
            success: true,
            data: result
        });
    })
};
