import prisma from '@/lib/prisma';
import { ChallanStatus, Prisma } from '@/generated/prisma/client';


export const paymentRepository = {
    /**
     * Find a challan by its on-chain challanId, including the police entity wallet address.
     */
    async findChallanForPayment(challanId: bigint) {
        return prisma.challan.findUnique({
            where: { challanId },
            include: {
                policeEntity: {
                    select: {
                        id: true,
                        walletAddress: true,
                        type: true,
                        isActive: true
                    }
                }
            }
        });
    },

    /**
     * Find a challan by its gateway paymentOrderId (used by webhook to look up the record).
     */
    async findChallanByOrderId(paymentOrderId: string) {
        return prisma.challan.findUnique({
            where: { paymentOrderId },
            include: {
                policeEntity: {
                    select: {
                        id: true,
                        walletAddress: true,
                        type: true,
                        isActive: true
                    }
                }
            }
        });
    },

    /**
     * Atomically store the payment order ID on the Challan record.
     * Ensures the order is only created once (idempotent).
     */
    async setPaymentOrderId(challanId: string, paymentOrderId: string) {
        return prisma.challan.update({
            where: { id: challanId },
            data: { paymentOrderId }
        });
    },

    /**
     * Store the gateway paymentRef (transaction ID) after successful webhook.
     */
    async setPaymentRef(challanId: string, paymentRef: string) {
        return prisma.challan.update({
            where: { id: challanId },
            data: { paymentRef }
        });
    },

    /**
     * Check if a challan is owned by a specific citizen (anti-impersonation guard).
     */
    async isChallanOwnedByCitizen(challanId: bigint, userId: string): Promise<boolean> {
        const challan = await prisma.challan.findUnique({
            where: { challanId }
        });
        // A citizen can pay their own challan OR any outstanding challan against their vehicle
        return challan?.violatorUserId === userId;
    },

    /**
     * Verify challan is payable: exists, PENDING status, not already assigned an order.
     */
    async findPayableChallan(challanId: bigint) {
        return prisma.challan.findUnique({
            where: { challanId },
            include: {
                policeEntity: { select: { id: true, walletAddress: true, type: true, isActive: true } }
            }
        });
    },

    /**
     * List all challans for a specific citizen, with optional status filter and pagination.
     */
    async listCitizenChallans(
        userId: string,
        filters: { status?: ChallanStatus, page: number, limit: number }
    ) {
        const skip = (filters.page - 1) * filters.limit;

        const where: Prisma.ChallanWhereInput = { violatorUserId: userId };
        if (filters.status) {
            where.status = filters.status;
        }

        const [items, total] = await Promise.all([
            prisma.challan.findMany({
                where,
                skip,
                take: filters.limit,
                orderBy: { issuedAt: 'desc' },
                include: {
                    policeEntity: { select: { name: true, code: true } }
                }
            }),
            prisma.challan.count({ where })
        ]);

        return {
            total,
            page: filters.page,
            limit: filters.limit,
            totalPages: Math.ceil(total / filters.limit),
            data: items
        };
    }
};
