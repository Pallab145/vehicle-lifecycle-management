import { z } from 'zod';
import { InsuranceStatus } from '@/generated/prisma/client';

export const issuePolicySchema = z.object({
    ownTid: z.string().regex(/^\d+$/, 'ownTid must be a numeric string'),
    expiryDate: z.number().int().positive('expiryDate must be a positive integer (unix timestamp)'),
    coverage: z.string().regex(/^\d+$/, 'coverage must be a numeric string (uint128)'),
    premium: z.string().regex(/^\d+$/, 'premium must be a numeric string (uint128)'),
});

export const markExpiredParamsSchema = z.object({
    polId: z.string().regex(/^\d+$/, 'polId must be a numeric string'),
});

export const fileClaimParamsSchema = z.object({
    polId: z.string().regex(/^\d+$/, 'polId must be a numeric string'),
});

export const listPoliciesSchema = z.object({
    page: z.preprocess((val) => Number(val), z.number().int().positive()).optional().default(1),
    limit: z.preprocess((val) => Number(val), z.number().int().positive().max(100)).optional().default(10),
    status: z.nativeEnum(InsuranceStatus).optional(),
    ownTid: z.string().regex(/^\d+$/, 'ownTid must be a numeric string').optional(),
});
