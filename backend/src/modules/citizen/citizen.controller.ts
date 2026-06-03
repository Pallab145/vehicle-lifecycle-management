import type { Request, Response } from 'express';
import createError from 'http-errors';
import { asyncHandler } from '@/utils/asyncHandler';
import { VerifyKycSchema, dvpIdParamSchema, ownTidParamSchema, listVehiclesQuerySchema } from './citizen.schema';
import { citizenService } from './citizen.service';
import { citizenRepository } from './citizen.repository';

export const citizenController = {
    /**
     * POST /api/citizens/kyc
     * Submits KYC details for verification.
     */
    verifyKyc: asyncHandler(async (req: Request, res: Response) => {
        // 1. Zod input validation
        const parsedData = VerifyKycSchema.parse(req.body);

        // 2. Caller identification safety check
        const callerId = req.caller?.sub;
        if (!callerId) {
            throw createError(401, 'Unauthorized: No caller context found');
        }

        // 3. Delegate to Service Layer
        const result = await citizenService.verifyKyc(parsedData, callerId);

        res.status(200).json({
            success: true,
            message: 'KYC Verification successful',
            profile: {
                ...result,
                isKycVerified: result.isVerified
            }
        });
    }),
    
    /**
     * GET /api/citizens/me
     * Returns the full profile of the authenticated citizen.
     */
    getMe: asyncHandler(async (req: Request, res: Response) => {
        const callerId = req.caller?.sub;
        if (!callerId) {
            throw createError(401, 'Unauthorized: No caller context found');
        }

        const user = await citizenRepository.findById(callerId);
        
        if (!user) {
            throw createError(404, 'Citizen account not found');
        }

        res.status(200).json({
            success: true,
            profile: {
                ...user,
                isKycVerified: user.isVerified
            }
        });
    }),

    /**
     * GET /api/citizens/rtos
     * Public endpoint — returns list of all active RTOs for the selection dropdown.
     */
    listRtos: asyncHandler(async (_req: Request, res: Response) => {
        const rtos = await citizenService.listActiveRtos();
        res.status(200).json({
            success: true,
            rtos
        });
    }),

    /**
     * GET /api/citizens/scrap-centers
     * Public/Citizen endpoint — returns list of active scrap centers.
     */
    listScrapCenters: asyncHandler(async (req: Request, res: Response) => {
        const { query } = listVehiclesQuerySchema.parse({ query: req.query });
        const [scrapCenters, total] = await citizenService.listScrapCenters(query.page, query.limit);
        res.status(200).json({
            success: true,
            total,
            page: query.page,
            limit: query.limit,
            scrapCenters
        });
    }),

    /**
     * GET /api/citizens/vehicles
     * Returns all vehicles owned by the authenticated citizen.
     */
    getMyVehicles: asyncHandler(async (req: Request, res: Response) => {
        const caller = req.caller!; // requireB2C guarantees caller + wallet

        const { query } = listVehiclesQuerySchema.parse({ query: req.query });
        const result = await citizenService.getMyVehicles(
            caller.sub ?? null,
            caller.wallet!,
            query.page,
            query.limit
        );
        
        res.status(200).json({
            success: true,
            vehicles: result.vehicles,
            total: result.total
        });
    }),

    /**
     * GET /api/citizens/vehicles/:ownTid
     * Returns full details for a single vehicle.
     */
    getVehicleDetail: asyncHandler(async (req: Request, res: Response) => {
        const caller = req.caller!;

        const { params } = ownTidParamSchema.parse({ params: req.params });
        const vehicle = await citizenService.getVehicleDetail(
            BigInt(params.ownTid),
            caller.sub ?? null,
            caller.wallet!
        );

        res.status(200).json({
            success: true,
            vehicleDetails: vehicle
        });
    }),

    /**
     * GET /api/citizens/vehicles/:dvpId/scrap/eligibility
     * Pre-flight check for scrapping a vehicle.
     */
    checkScrapEligibility: asyncHandler(async (req: Request, res: Response) => {
        const caller = req.caller!;

        const { params } = dvpIdParamSchema.parse({ params: req.params });
        const eligibility = await citizenService.checkScrapEligibility(
            BigInt(params.dvpId),
            caller.sub ?? null,
            caller.wallet!
        );

        res.status(200).json({
            success: true,
            eligibility
        });
    }),

    /**
     * GET /api/citizens/vehicles/:ownTid/transfer/eligibility
     * Pre-flight check for transferring a vehicle.
     */
    checkTransferEligibility: asyncHandler(async (req: Request, res: Response) => {
        const caller = req.caller!;

        const { params } = ownTidParamSchema.parse({ params: req.params });
        const eligibility = await citizenService.checkTransferEligibility(
            BigInt(params.ownTid),
            caller.sub ?? null,
            caller.wallet!
        );

        res.status(200).json({
            success: true,
            eligibility
        });
    }),

    /**
     * GET /api/citizens/vehicles/:ownTid/transfer/status
     * Returns the pending transfer request for a vehicle (for both seller and buyer).
     */
    getTransferStatus: asyncHandler(async (req: Request, res: Response) => {
        const caller = req.caller!;

        const { params } = ownTidParamSchema.parse({ params: req.params });
        const transfer = await citizenService.getTransferStatus(
            BigInt(params.ownTid),
            caller.sub ?? null,
            caller.wallet!
        );

        res.status(200).json({
            success: true,
            transfer
        });
    }),

    /**
     * GET /api/citizens/transfers/incoming
     * Returns all incoming transfers for the citizen (buyer side)
     */
    getIncomingTransfers: asyncHandler(async (req: Request, res: Response) => {
        const caller = req.caller!;
        
        const transfers = await citizenRepository.getIncomingTransfers(
            caller.sub ?? null,
            caller.wallet!
        );

        res.status(200).json({
            success: true,
            transfers
        });
    }),

    /**
     * GET /api/citizens/vehicles/:ownTid/timeline
     * Returns the full lifecycle history of the vehicle.
     */
    getVehicleTimeline: asyncHandler(async (req: Request, res: Response) => {
        const caller = req.caller!;

        const { params } = ownTidParamSchema.parse({ params: req.params });
        const events = await citizenService.getVehicleTimeline(
            BigInt(params.ownTid),
            caller.sub ?? null,
            caller.wallet!
        );

        res.status(200).json({
            success: true,
            timeline: events
        });
    })
};
