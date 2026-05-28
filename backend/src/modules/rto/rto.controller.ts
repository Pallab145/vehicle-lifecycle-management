import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { rtoService } from './rto.service';
import {
    IssueTradeCertSchema,
    RevokeTradeCertSchema,
    RegisterVehicleSchema,
    ApproveTransferSchema
} from './rto.schema';
import { sanitizeResponseData } from '@/utils/sanitizer';

export const rtoController = {
    /**
     * @route   POST /api/rto/trade-certs/issue
     * @desc    Issue a trade certificate to a dealer
     * @access  Private (B2B - RTO)
     */
    issueTradeCert: asyncHandler(async (req: Request, res: Response) => {
        const input = IssueTradeCertSchema.parse({ body: req.body }).body;
        const rtoEntityId = req.caller!.entityId!;
        const memberId = req.caller!.sub;

        const result = await rtoService.issueTradeCert(input, rtoEntityId, memberId);

        res.status(202).json({
            success: true,
            message: 'Trade certificate issuance transaction submitted.',
            tradeCert: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   POST /api/rto/trade-certs/revoke/:dealerWallet
     * @desc    Revoke a trade certificate from a dealer
     * @access  Private (B2B - RTO)
     */
    revokeTradeCert: asyncHandler(async (req: Request, res: Response) => {
        const input = RevokeTradeCertSchema.parse({ params: req.params }).params;
        const rtoEntityId = req.caller!.entityId!;
        const memberId = req.caller!.sub;

        const result = await rtoService.revokeTradeCert(input.dealerWallet, rtoEntityId, memberId);

        res.status(202).json({
            success: true,
            message: 'Trade certificate revocation transaction submitted.',
            transaction: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   POST /api/rto/vehicles/register
     * @desc    Register a new vehicle
     * @access  Private (B2B - RTO)
     */
    registerVehicle: asyncHandler(async (req: Request, res: Response) => {
        const input = RegisterVehicleSchema.parse({ body: req.body }).body;
        const rtoEntityId = req.caller!.entityId!;
        const memberId = req.caller!.sub;

        const result = await rtoService.registerVehicle(input, rtoEntityId, memberId);

        res.status(202).json({
            success: true,
            message: 'Vehicle registration transaction submitted.',
            transaction: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   POST /api/rto/transfers/:ownTid/approve
     * @desc    Approve an ownership transfer
     * @access  Private (B2B - RTO)
     */
    approveTransfer: asyncHandler(async (req: Request, res: Response) => {
        const input = ApproveTransferSchema.parse({ params: req.params }).params;
        const rtoEntityId = req.caller!.entityId!;
        const memberId = req.caller!.sub;

        const result = await rtoService.approveTransfer(input.ownTid, rtoEntityId, memberId);

        res.status(202).json({
            success: true,
            message: 'Ownership transfer approval transaction submitted.',
            transaction: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   GET /api/rto/trade-certs
     * @desc    List trade certificates issued by this RTO
     * @access  Private (B2B - RTO)
     */
    listTradeCerts: asyncHandler(async (req: Request, res: Response) => {
        const { query: { page, limit, isActive } } = require('./rto.schema').ListTradeCertsQuerySchema.parse({ query: req.query });
        const rtoEntityId = req.caller!.entityId!;

        const result = await rtoService.listTradeCerts(rtoEntityId, {
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            isActive: isActive === 'true' ? true : (isActive === 'false' ? false : undefined)
        });

        res.status(200).json({
            success: true,
            data: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   GET /api/rto/vehicles/registrations
     * @desc    List vehicle registrations for this RTO
     * @access  Private (B2B - RTO)
     */
    listRegistrations: asyncHandler(async (req: Request, res: Response) => {
        const { query: { page, limit, status } } = require('./rto.schema').ListRegistrationsQuerySchema.parse({ query: req.query });
        const rtoEntityId = req.caller!.entityId!;

        const result = await rtoService.listRegistrations(rtoEntityId, {
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            status
        });

        res.status(200).json({
            success: true,
            data: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   GET /api/rto/transfers
     * @desc    List transfer requests where the buyer belongs to this RTO
     * @access  Private (B2B - RTO)
     */
    listTransfers: asyncHandler(async (req: Request, res: Response) => {
        const { query: { page, limit, status } } = require('./rto.schema').ListTransfersQuerySchema.parse({ query: req.query });
        const rtoEntityId = req.caller!.entityId!;

        const result = await rtoService.listTransfers(rtoEntityId, {
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            status
        });

        res.status(200).json({
            success: true,
            data: sanitizeResponseData(result)
        });
    })
};
