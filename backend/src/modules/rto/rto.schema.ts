import { z } from 'zod';
import { RegistrationStatus, TransferStatus } from '@/generated/prisma/client';

export const IssueTradeCertSchema = z.object({
    body: z.object({
        dealerWallet: z.string().min(42, 'Invalid wallet address format.').max(42),
        validTill: z.number().int().positive('Validity timestamp must be in the future.')
    })
});

export const RevokeTradeCertSchema = z.object({
    params: z.object({
        dealerWallet: z.string().min(42, 'Invalid wallet address format.').max(42)
    })
});

export const RegisterVehicleSchema = z.object({
    body: z.object({
        dvpId: z.number().or(z.string().regex(/^\d+$/, "Must be a valid numeric string or number")),
        buyerWallet: z.string().min(42, 'Invalid wallet address format.').max(42),
        dealerWallet: z.string().min(42, 'Invalid wallet address format.').max(42)
    })
});

export const ApproveTransferSchema = z.object({
    params: z.object({
        ownTid: z.string().regex(/^\d+$/, "Must be a valid numeric string")
    })
});

export const ListTradeCertsQuerySchema = z.object({
    query: z.object({
        page: z.string().regex(/^\d+$/).default('1'),
        limit: z.string().regex(/^\d+$/).default('10'),
        isActive: z.enum(['true', 'false']).optional()
    })
});

export const ListRegistrationsQuerySchema = z.object({
    query: z.object({
        page: z.string().regex(/^\d+$/).default('1'),
        limit: z.string().regex(/^\d+$/).default('10'),
        status: z.nativeEnum(RegistrationStatus).optional()
    })
});

export const ListTransfersQuerySchema = z.object({
    query: z.object({
        page: z.string().regex(/^\d+$/).default('1'),
        limit: z.string().regex(/^\d+$/).default('10'),
        status: z.nativeEnum(TransferStatus).optional()
    })
});

export type IssueTradeCertInput = z.infer<typeof IssueTradeCertSchema>['body'];
export type RegisterVehicleInput = z.infer<typeof RegisterVehicleSchema>['body'];