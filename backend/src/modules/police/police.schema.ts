import { z } from 'zod';
import { ChallanStatus } from '@/generated/prisma/client';

export const issueChallanSchema = z.object({
    ownTid: z.string().refine((val) => {
        try {
            BigInt(val);
            return true;
        } catch {
            return false;
        }
    }, { message: 'Invalid Ownership Token ID (must be numeric string)' }),
    amount: z.string().refine((val) => {
        try {
            const num = BigInt(val);
            return num > 0n;
        } catch {
            return false;
        }
    }, { message: 'Amount must be a positive numeric string (Wei)' })
});

export type IssueChallanInput = z.infer<typeof issueChallanSchema>;

export const payChallanSchema = z.object({
    amountPaid: z.string().refine((val) => {
        try {
            const num = BigInt(val);
            return num > 0n;
        } catch {
            return false;
        }
    }, { message: 'Amount paid must be a positive numeric string (Wei)' }),
    paymentMethod: z.enum(['CASH', 'CREDIT_CARD', 'UPI', 'BANK_TRANSFER']).default('CASH'),
    paymentRef: z.string().optional()
});

export type PayChallanInput = z.infer<typeof payChallanSchema>;

export const listChallansSchema = z.object({
    page: z.string().regex(/^\d+$/).transform(Number).default(1),
    limit: z.string().regex(/^\d+$/).transform(Number).default(10),
    status: z.nativeEnum(ChallanStatus).optional()
});
