import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { pucService } from './puc.service';
import { issuePucSchema, markPucExpiredSchema, listPucSchema } from './puc.schema';
import { sanitizeResponseData } from '@/utils/sanitizer';
import createError from 'http-errors';

export const pucController = {
    issuePuc: asyncHandler(async (req: Request, res: Response) => {
        const input = issuePucSchema.parse(req); // since it has body inside
        const data = input.body;
        const pucEntityId = req.caller!.entityId!;
        const memberId = req.caller!.sub;

        const result = await pucService.issuePuc(pucEntityId, memberId, data);
        res.status(202).json({
            success: true,
            message: 'PUC issuance transaction submitted successfully. Pending blockchain confirmation.',
            pucDetails: sanitizeResponseData(result)
        });
    }),

    markExpired: asyncHandler(async (req: Request, res: Response) => {
        const input = markPucExpiredSchema.parse(req);
        const { certId } = input.params;
        const pucEntityId = req.caller!.entityId!;
        const memberId = req.caller!.sub;

        const result = await pucService.markExpired(pucEntityId, memberId, certId);
        res.status(202).json({
            success: true,
            message: 'PUC expiration transaction submitted successfully. Pending blockchain confirmation.',
            expirationDetails: sanitizeResponseData(result)
        });
    }),

    listCertificates: asyncHandler(async (req: Request, res: Response) => {
        const input = listPucSchema.parse(req);
        const query = input.query;
        const pucEntityId = req.caller!.entityId!;

        const result = await pucService.listCertificates(pucEntityId, query);
        res.status(200).json({
            success: true,
            message: 'Certificates retrieved successfully',
            certificates: sanitizeResponseData(result)
        });
    }),

    getCertificateDetails: asyncHandler(async (req: Request, res: Response) => {
        const { certId } = req.params;
        if (!certId) throw createError(400, 'certId route parameter is required.');

        const result = await pucService.getCertificateDetails(certId as string);
        res.status(200).json({
            success: true,
            message: 'Certificate details retrieved successfully',
            certificateDetails: sanitizeResponseData(result)
        });
    }),

    getVehicleCertificate: asyncHandler(async (req: Request, res: Response) => {
        const { ownTid } = req.params;
        if (!ownTid) throw createError(400, 'ownTid route parameter is required.');

        const result = await pucService.getVehicleCertificate(ownTid as string);
        res.status(200).json({
            success: true,
            message: 'Vehicle current PUC retrieved successfully',
            certificateDetails: sanitizeResponseData(result)
        });
    })
};
