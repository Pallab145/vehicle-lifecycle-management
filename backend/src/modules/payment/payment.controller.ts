import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { paymentService } from './payment.service';
import { initiateChallanPaymentSchema, challanPaymentWebhookSchema, listCitizenChallansSchema } from './payment.schema';
import { sanitizeResponseData } from '@/utils/sanitizer';
import createError from 'http-errors';

export const paymentController = {
    /**
     * @route   POST /api/payment/challans/:challanId/initiate
     * @desc    Citizen initiates a payment for their challan.
     *          Returns a mock payment order (orderId + dev webhook payload for testing).
     * @access  Private (Citizen - requireCitizenAuth)
     */
    initiateChallanPayment: asyncHandler(async (req: Request, res: Response) => {
        const { challanId } = req.params;
        if (!challanId) throw createError(400, 'challanId param is required');

        const input = initiateChallanPaymentSchema.parse(req.body);

        // Citizen identity is provided by requireCitizenAuth middleware
        const citizenUserId = req.caller!.sub;

        const result = await paymentService.initiateChallanPayment(challanId as string, input, citizenUserId);

        res.status(201).json({
            success: true,
            message: 'Payment order created. Use _devWebhookPayload in development to simulate payment confirmation.',
            paymentOrder: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   GET /api/payment/challans
     * @desc    List all active/past challans for the logged-in citizen
     * @access  Private (Citizen)
     */
    listCitizenChallans: asyncHandler(async (req: Request, res: Response) => {
        const input = listCitizenChallansSchema.parse(req.query);
        const citizenUserId = req.caller!.sub;

        const result = await paymentService.listCitizenChallans(citizenUserId, input);

        res.status(200).json({
            success: true,
            data: sanitizeResponseData(result)
        });
    }),

    /**
     * @route   POST /api/payment/webhook/challan
     * @desc    Mock payment gateway webhook callback.
     *          On SUCCESS: submits payChallan() on-chain using the Police entity wallet.
     * @access  Public (no user auth — HMAC signature validated instead)
     */
    handleChallanPaymentWebhook: asyncHandler(async (req: Request, res: Response) => {
        const input = challanPaymentWebhookSchema.parse(req.body);

        const result = await paymentService.handleChallanPaymentWebhook(input);

        // Always respond 200 to the gateway — even for non-SUCCESS events
        res.status(200).json({
            success: true,
            webhookDetails: sanitizeResponseData(result)
        });
    })
};
