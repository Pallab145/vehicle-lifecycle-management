import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { scrapService } from './scrap.service';
import { scrapVehicleParamsSchema, listScrappedSchema } from './scrap.schema';
import { sanitizeResponseData } from '@/utils/sanitizer';
import createError from 'http-errors';

export const scrapController = {
    checkEligibility: asyncHandler(async (req: Request, res: Response) => {
        const { dvpId } = req.params;
        if (!dvpId) throw createError(400, 'dvpId route parameter is required.');

        const scrapEntityId = req.caller!.entityId!;
        const result = await scrapService.checkEligibility(scrapEntityId, dvpId as string);

        res.status(200).json({
            success: true,
            message: 'Vehicle eligibility check completed',
            eligibilityDetails: sanitizeResponseData(result)
        });
    }),

    scrapVehicle: asyncHandler(async (req: Request, res: Response) => {
        const input = scrapVehicleParamsSchema.parse(req);
        const { dvpId } = input.params;
        const scrapEntityId = req.caller!.entityId!;
        const memberId = req.caller!.sub;

        const result = await scrapService.scrapVehicle(scrapEntityId, memberId, dvpId);

        res.status(202).json({
            success: true,
            message: 'Vehicle scrap transaction submitted successfully. Pending blockchain confirmation.',
            scrapDetails: sanitizeResponseData(result)
        });
    }),

    listScrappedVehicles: asyncHandler(async (req: Request, res: Response) => {
        const input = listScrappedSchema.parse(req);
        const query = input.query;
        const scrapEntityId = req.caller!.entityId!;

        const result = await scrapService.listScrappedVehicles(scrapEntityId, query);

        res.status(200).json({
            success: true,
            message: 'Scrapped vehicles retrieved successfully',
            vehicles: sanitizeResponseData(result)
        });
    }),

    getVehicleDetails: asyncHandler(async (req: Request, res: Response) => {
        const { dvpId } = req.params;
        if (!dvpId) throw createError(400, 'dvpId route parameter is required.');

        const scrapEntityId = req.caller!.entityId!;
        const result = await scrapService.getVehicleDetails(scrapEntityId, dvpId as string);

        res.status(200).json({
            success: true,
            message: 'Scrapped vehicle details retrieved successfully',
            vehicleDetails: sanitizeResponseData(result)
        });
    })
};
