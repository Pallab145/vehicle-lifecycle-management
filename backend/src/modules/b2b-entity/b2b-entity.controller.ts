import type { Request, Response } from 'express';
import createError from 'http-errors';
import { CreateB2BEntitySchema, ListB2BEntitySchema, ToggleB2BEntitySchema } from './b2b-entity.schema';
import { b2bEntityService } from './b2b-entity.service';
import { asyncHandler } from '@/utils/asyncHandler';

export const b2bEntityController = {
    /**
     * POST /api/institutions
     * Creates a new B2B Entity along with its first admin member and its encrypted signing key.
     */
    create: asyncHandler(async (req: Request, res: Response) => {
        // 1. Zod input validation (Throws ZodError which is natively caught by global errorHandler)
        const parsedData = CreateB2BEntitySchema.parse(req.body);

        // 2. Caller identification safety check
        const creatorId = req.caller?.sub;
        if (!creatorId) {
            throw createError(401, 'Unauthorized: No caller context found');
        }

        // 3. Delegate to Service Layer
        const result = await b2bEntityService.createEntity(parsedData, creatorId);

        res.status(201).json({
            success: true,
            message: 'B2B Entity created successfully',
            entity: result
        });
    }),

    /**
     * GET /api/institutions
     * Retrieves a paginated list of B2B Entities.
     */
    list: asyncHandler(async (req: Request, res: Response) => {
        // 1. Zod query parameters validation
        const parsedQuery = ListB2BEntitySchema.parse(req.query);

        // 2. Delegate to Service Layer
        const result = await b2bEntityService.listEntities(parsedQuery);

        res.status(200).json({
            success: true,
            entities: result
        });
    }),

    /**
     * PATCH /api/institutions/:id/toggle
     * Toggles the active status of a B2B Entity on-chain and off-chain.
     */
    toggle: asyncHandler(async (req: Request, res: Response) => {
        const id = req.params.id as string;
        if (!id) {
            throw createError(400, 'Entity ID is required');
        }

        const requesterId = req.caller?.sub;
        if (!requesterId) throw createError(401, 'Unauthorized: No caller context found');

        // 1. Validate payload
        const parsedData = ToggleB2BEntitySchema.parse(req.body);

        // 2. Delegate to Service Layer (creates a SafeProposal)
        const result = await b2bEntityService.toggleEntityStatus(id, parsedData, requesterId);

        res.status(202).json({
            success: true,
            message: 'Toggle governance proposal created. Entity status will change once required owner(s) sign and the Safe executes.',
            toggleDetails: result
        });
    }),

    /**
     * GET /api/institutions/:id
     * Retrieves the details of a specific B2B Entity by its ID.
     */
    getById: asyncHandler(async (req: Request, res: Response) => {
        const id = req.params.id as string;
        if (!id) {
            throw createError(400, 'Entity ID is required');
        }

        const result = await b2bEntityService.getEntityById(id);

        res.status(200).json({
            success: true,
            entity: result
        });
    }),

    /**
     * POST /api/institutions/:id/retry
     * Retries a FAILED blockchain registration.
     */
    retryRegistration: asyncHandler(async (req: Request, res: Response) => {
        const id = req.params.id as string;
        if (!id) {
            throw createError(400, 'Entity ID is required');
        }

        const requesterId = req.caller?.sub;
        if (!requesterId) throw createError(401, 'Unauthorized: No caller context found');

        const result = await b2bEntityService.retryEntityRegistration(id, requesterId);

        res.status(202).json({
            success: true,
            retryDetails: result
        });
    })
};
