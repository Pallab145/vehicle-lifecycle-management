import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { dealerService } from './dealer.service';
import { CreateSaleRequestSchema, ListInventorySchema } from './dealer.schema';
import createError from 'http-errors';
import { sanitizeResponseData } from '@/utils/sanitizer';

export const dealerController = {
    /**
     * @route   GET /api/dealer/inventory
     * @desc    List all vehicles assigned to this dealer that are NOT_REG
     * @access  Private (Citizen - Dealer)
     */
    listInventory: asyncHandler(async (req: Request, res: Response) => {
        const query = ListInventorySchema.parse({ query: req.query }).query;
        
        if (req.caller?.type !== 'B2C') {
            throw createError(403, 'Only citizens can act as dealers.');
        }

        const dealerWallet = req.caller.wallet!;
        const result = await dealerService.listInventory(dealerWallet, query);

        res.status(200).json({
            success: true,
            inventory: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   GET /api/dealer/trade-certs
     * @desc    List all active trade certificates held by this dealer
     * @access  Private (Citizen - Dealer)
     */
    listTradeCerts: asyncHandler(async (req: Request, res: Response) => {
        if (req.caller?.type !== 'B2C') {
            throw createError(403, 'Only citizens can act as dealers.');
        }

        const dealerWallet = req.caller.wallet!;
        const result = await dealerService.listTradeCerts(dealerWallet);

        res.status(200).json({
            success: true,
            tradeCerts: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   POST /api/dealer/sale-requests
     * @desc    Submit a request to register a vehicle to a buyer
     * @access  Private (Citizen - Dealer)
     */
    createSaleRequest: asyncHandler(async (req: Request, res: Response) => {
        const input = CreateSaleRequestSchema.parse({ body: req.body }).body;
        
        if (req.caller?.type !== 'B2C') {
            throw createError(403, 'Only citizens can act as dealers.');
        }

        const dealerWallet = req.caller.wallet!;
        const dealerUserId = req.caller.sub;

        const result = await dealerService.createSaleRequest(input, dealerWallet, dealerUserId);

        res.status(201).json({
            success: true,
            message: 'Sale request successfully submitted to RTO for approval.',
            requestDetails: sanitizeResponseData(result)
        });
    })
};
