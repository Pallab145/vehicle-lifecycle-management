import type { Request, Response } from 'express';
import createError from 'http-errors';
import { asyncHandler } from '@/utils/asyncHandler';
import { VerifyKycSchema } from './citizen.schema';
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
            citizen: result
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
            citizen: user
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
    })
};
