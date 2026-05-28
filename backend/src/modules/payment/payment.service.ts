import crypto from 'crypto';
import { randomUUID } from 'crypto';
import createError from 'http-errors';
import { paymentRepository } from './payment.repository';
import { policeRepository } from '@/modules/police/police.repository';
import { BlockchainManager } from '@/lib/blockchain.manager';
import { ChallanStatus, EntityType, TxSource } from '@/generated/prisma/client';
import type { InitiateChallanPaymentInput, ChallanPaymentWebhookInput } from './payment.schema';
import { logger } from '@/lib/logger';
import { env } from '@/config/env';
import { parseEthersError } from '@/utils/blockchainErrorHandler';

// ─── Mock Webhook Secret ──────────────────────────────────────
const WEBHOOK_SECRET = env.PAYMENT_WEBHOOK_SECRET;

export const paymentService = {
    // ─────────────────────────────────────────────────────────────
    // CITIZEN: Initiate payment for a challan
    // ─────────────────────────────────────────────────────────────
    async initiateChallanPayment(
        challanIdRaw: string,
        input: InitiateChallanPaymentInput,
        citizenUserId: string
    ) {
        const challanId = BigInt(challanIdRaw);

        // 1. Verify challan exists
        const challan = await paymentRepository.findPayableChallan(challanId);
        if (!challan) {
            throw createError(404, 'Challan not found.');
        }

        // 2. State checks
        if (challan.status === ChallanStatus.PAID) {
            throw createError(400, 'This challan has already been paid.');
        }
        if (challan.status === ChallanStatus.CANCELLED) {
            throw createError(400, 'This challan has been cancelled and cannot be paid.');
        }

        // 3. Citizen ownership check — only the violator (or vehicle owner) can initiate
        if (challan.violatorUserId !== citizenUserId) {
            throw createError(403, 'You are not the owner of this challan.');
        }

        // 4. Idempotency check — if an order already exists, return it
        if (challan.paymentOrderId) {
            throw createError(409, `A payment order already exists for this challan. Order ID: ${challan.paymentOrderId}`);
        }

        // 5. Verify the police entity issuing this challan is still active
        if (!challan.policeEntity?.isActive) {
            throw createError(422, 'The issuing Police Station is currently inactive.');
        }

        // 6. Mock: Generate a payment order (replace with Razorpay SDK in production)
        const orderId = `order_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
        const amountInPaise = challan.amount.toString(); // Wei in our case, Paise for Razorpay

        // 7. Store the order ID on the Challan so the webhook can look it up
        await paymentRepository.setPaymentOrderId(challan.id, orderId);

        logger.info({ challanId: challanIdRaw, orderId, citizenUserId }, 'Payment order created for challan');

        return {
            orderId,
            challanId: challanIdRaw,
            amountWei: amountInPaise,
            paymentMethod: input.paymentMethod,
            // Mock: In production this would be the Razorpay checkout URL or key
            mockCheckoutUrl: `https://mock-payment.example.com/pay?order=${orderId}`,
            // For testing: provide the webhook signature the mock gateway would send
            _devWebhookPayload: generateMockWebhookPayload(orderId, amountInPaise)
        };
    },

    // ─────────────────────────────────────────────────────────────
    // WEBHOOK: Confirm payment + submit on-chain payChallan()
    // ─────────────────────────────────────────────────────────────
    async handleChallanPaymentWebhook(input: ChallanPaymentWebhookInput) {
        // 1. Verify HMAC signature (prevents spoofed webhooks)
        const expectedSig = computeWebhookSignature(input.orderId, input.paymentId, input.amountPaid);
        if (!crypto.timingSafeEqual(Buffer.from(expectedSig, 'hex'), Buffer.from(input.signature, 'hex'))) {
            throw createError(401, 'Invalid webhook signature.');
        }

        // 2. Only process SUCCESS payments
        if (input.status !== 'SUCCESS') {
            logger.warn({ orderId: input.orderId, status: input.status }, 'Webhook received non-SUCCESS payment status');
            return { acknowledged: true, processed: false, reason: `Status ${input.status} — no action taken` };
        }

        // 3. Find the challan by orderId
        const challan = await paymentRepository.findChallanByOrderId(input.orderId);
        if (!challan) {
            throw createError(404, `No challan found for orderId: ${input.orderId}`);
        }

        // 4. Idempotency — prevent double-processing
        if (challan.status === ChallanStatus.PAID) {
            logger.warn({ orderId: input.orderId }, 'Webhook received for already-paid challan (idempotent skip)');
            return { acknowledged: true, processed: false, reason: 'Challan already PAID' };
        }

        if (challan.status === ChallanStatus.CANCELLED) {
            throw createError(409, 'Challan is cancelled. Cannot process payment.');
        }

        // 5. Amount validation — gateway must send exactly the right amount
        if (input.amountPaid !== challan.amount.toString()) {
            throw createError(400,
                `Payment amount mismatch. Expected: ${challan.amount.toString()} Wei, Received: ${input.amountPaid} Wei`
            );
        }

        // 6. Ensure ownTid is available for the blockchain call
        if (!challan.ownTid || !challan.challanId) {
            throw createError(422, 'Challan is missing on-chain data (ownTid/challanId). Cannot confirm on-chain yet.');
        }

        // 7. Police entity sanity check
        if (!challan.policeEntity?.isActive) {
            throw createError(422, 'The issuing Police Station is inactive.');
        }

        // 8. Store the payment reference from the gateway
        await paymentRepository.setPaymentRef(challan.id, input.paymentId);

        // 9. Submit payChallan() on-chain using the POLICE entity wallet
        //    No human member involved — this is fully automated via webhook
        let txHash: string;
        try {
            txHash = await BlockchainManager.submitEntityTx(
                challan.policeEntityId,
                EntityType.POLICE,
                'payChallan',
                [challan.ownTid, challan.challanId]
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error({ err: parsedError, orderId: input.orderId }, 'Blockchain payChallan via webhook failed');
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // 10. Track the blockchain tx with txSource: WEBHOOK + null memberId
        await policeRepository.createPayChallanTx({
            challanId: challan.id,
            policeEntityId: challan.policeEntityId,
            memberId: null,             // No human officer — automated by webhook
            txSource: TxSource.WEBHOOK, // Audit trail discriminator
            txHash
        });

        logger.info({ orderId: input.orderId, txHash, challanDbId: challan.id }, 'Challan payment webhook processed');

        return {
            acknowledged: true,
            processed: true,
            txHash,
            message: 'Payment confirmed. Blockchain confirmation pending.'
        };
    },

    // ─────────────────────────────────────────────────────────────
    // CITIZEN: List active/past challans
    // ─────────────────────────────────────────────────────────────
    async listCitizenChallans(citizenUserId: string, filters: { status?: ChallanStatus, page: number, limit: number }) {
        return paymentRepository.listCitizenChallans(citizenUserId, filters);
    }
};

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Computes HMAC-SHA256 signature for the webhook payload.
 * The gateway signs: orderId + "|" + paymentId + "|" + amountPaid
 */
function computeWebhookSignature(orderId: string, paymentId: string, amountPaid: string): string {
    const payload = `${orderId}|${paymentId}|${amountPaid}`;
    return crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');
}

/**
 * For development/testing only — generates a valid mock webhook payload
 * that the frontend or Postman can use to simulate a successful payment.
 */
function generateMockWebhookPayload(orderId: string, amountPaid: string) {
    const paymentId = `pay_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const signature = computeWebhookSignature(orderId, paymentId, amountPaid);
    return {
        orderId,
        paymentId,
        amountPaid,
        status: 'SUCCESS',
        signature
    };
}
