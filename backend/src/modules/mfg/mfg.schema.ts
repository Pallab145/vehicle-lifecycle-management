import { z } from 'zod';
import { VehicleStatus } from '@/generated/prisma/client';

export const ManufactureVehicleSchema = z.object({
    body: z.object({
        vin: z.string().min(1, 'VIN is required').max(17, 'VIN must be at most 17 characters'),
        make: z.string().min(1, 'Make is required'),
        model: z.string().min(1, 'Model is required'),
        color: z.string().min(1, 'Color is required'),
        engineNo: z.string().min(1, 'Engine Number is required'),
        chassisNo: z.string().min(1, 'Chassis Number is required'),
    })
});

export const AssignToDealerSchema = z.object({
    body: z.object({
        dealerWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum wallet address')
    }),
    params: z.object({
        tokenId: z.string().regex(/^\d+$/, 'Token ID must be a numeric string')
    })
});

export const ListMfgVehiclesSchema = z.object({
    query: z.object({
        page: z.string().regex(/^\d+$/).optional().default('1'),
        limit: z.string().regex(/^\d+$/).optional().default('10'),
        status: z.nativeEnum(VehicleStatus).optional()
    })
});

export type ManufactureVehicleInput = z.infer<typeof ManufactureVehicleSchema>['body'];
export type AssignToDealerInput = z.infer<typeof AssignToDealerSchema>['body'];
export type AssignToDealerParams = z.infer<typeof AssignToDealerSchema>['params'];
export type ListMfgVehiclesQuery = z.infer<typeof ListMfgVehiclesSchema>['query'];
