import { z } from 'zod';
import { ChallanStatus } from '@/generated/prisma/client';

export const AdminCancelChallanSchema = z.object({
    params: z.object({
        challanId: z.string().regex(/^\d+$/, 'Challan ID must be a numeric string')
    })
});

export const ListGlobalChallansSchema = z.object({
    query: z.object({
        page: z.string().optional().transform(val => (val ? parseInt(val, 10) : 1)),
        limit: z.string().optional().transform(val => (val ? parseInt(val, 10) : 20)),
        status: z.nativeEnum(ChallanStatus).optional(),
        policeEntityId: z.string().optional(),
        violatorUserId: z.string().optional(),
        ownTid: z.string().regex(/^\d+$/, 'ownTid must be numeric').optional(),
        challanId: z.string().regex(/^\d+$/, 'challanId must be numeric').optional()
    })
});

export type AdminCancelChallanInput = z.infer<typeof AdminCancelChallanSchema>;
export type ListGlobalChallansQuery = z.infer<typeof ListGlobalChallansSchema>['query'];
