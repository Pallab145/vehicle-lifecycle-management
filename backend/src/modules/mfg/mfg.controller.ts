import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { mfgService } from './mfg.service';
import { ManufactureVehicleSchema, AssignToDealerSchema, ListMfgVehiclesSchema } from './mfg.schema';
import { sanitizeResponseData } from '@/utils/sanitizer';

export const mfgController = {
    /**
     * @route   POST /api/mfg/vehicles/manufacture
     * @desc    Mint a new Vehicle Passport
     * @access  Private (Manufacturer Entity)
     */
    manufactureVehicle: asyncHandler(async (req: Request, res: Response) => {
        const input = ManufactureVehicleSchema.parse({ body: req.body }).body;
        
        // B2B Entity user details attached by the requireAuth + requireEntityType middlewares
        const b2bEntityId = req.caller!.entityId!;
        const memberId = req.caller!.sub;

        const result = await mfgService.manufactureVehicle(input, b2bEntityId, memberId);
        
        res.status(202).json({
            success: true,
            message: result.message,
            manufactureDetails: result
        });
    }),

    /**
     * @route   POST /api/mfg/vehicles/:tokenId/assign
     * @desc    Assign a NOT_REG vehicle to a specific dealer
     * @access  Private (Manufacturer Entity)
     */
    assignToDealer: asyncHandler(async (req: Request, res: Response) => {
        const parsed = AssignToDealerSchema.parse({ body: req.body, params: req.params });
        
        const b2bEntityId = req.caller!.entityId!;
        const memberId = req.caller!.sub;

        const result = await mfgService.assignToDealer(parsed.params, parsed.body, b2bEntityId, memberId);

        res.status(202).json({
            success: true,
            message: result.message,
            assignmentDetails: result
        });
    }),

    /**
     * @route   GET /api/mfg/vehicles
     * @desc    List all vehicles manufactured by this entity
     * @access  Private (Manufacturer Entity)
     */
    listVehicles: asyncHandler(async (req: Request, res: Response) => {
        const query = ListMfgVehiclesSchema.parse({ query: req.query }).query;
        const b2bEntityId = req.caller!.entityId!;

        const result = await mfgService.listVehicles(b2bEntityId, query);

        res.status(200).json({
            success: true,
            vehicles: sanitizeResponseData(result.items),
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages
        });
    })
};
