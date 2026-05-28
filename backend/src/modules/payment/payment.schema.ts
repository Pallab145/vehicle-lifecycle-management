import { z } from 'zod';
import { ChallanStatus } from '@/generated/prisma/client';

// ─────────────────────────────────────────────────────────────
// Citizen: Initiate payment for a challan
// POST /api/payment/challans/:challanId/initiate
// ─────────────────────────────────────────────────────────────
export const initiateChallanPaymentSchema = z.object({
    // Optional: citizen can specify preferred payment method
    paymentMethod: z.enum(['UPI', 'CARD', 'NET_BANKING', 'WALLET']).default('UPI')
});

export type InitiateChallanPaymentInput = z.infer<typeof initiateChallanPaymentSchema>;

export const listCitizenChallansSchema = z.object({
    page: z.string().regex(/^\d+$/).transform(Number).default(1),
    limit: z.string().regex(/^\d+$/).transform(Number).default(10),
    status: z.nativeEnum(ChallanStatus).optional()
});

export type ListCitizenChallansInput = z.infer<typeof listCitizenChallansSchema>;

// ─────────────────────────────────────────────────────────────
// Mock Webhook: payment gateway callback
// POST /api/payment/webhook/challan
// ─────────────────────────────────────────────────────────────
export const challanPaymentWebhookSchema = z.object({
    // The order ID we created during initiation (our primary key for lookup)
    orderId: z.string().min(1, 'orderId is required'),
    // Gateway-assigned unique payment transaction ID
    paymentId: z.string().min(1, 'paymentId is required'),
    // Payment status — we only process SUCCESS
    status: z.enum(['SUCCESS', 'FAILED', 'PENDING']),
    // Amount paid in Wei (must match challan amount exactly)
    amountPaid: z.string().refine((val) => {
        try { BigInt(val); return true; } catch { return false; }
    }, { message: 'amountPaid must be a numeric string (Wei)' }),
    // HMAC-SHA256 signature for webhook authenticity (hex string)
    signature: z.string().min(64, 'Invalid HMAC signature')
});

export type ChallanPaymentWebhookInput = z.infer<typeof challanPaymentWebhookSchema>;
