import createError from 'http-errors';
import { dealerRepository } from './dealer.repository';
import type { CreateSaleRequestInput } from './dealer.schema';
import { logger } from '@/lib/logger';

export const dealerService = {
    /**
     * List un-registered vehicles assigned to this dealer.
     */
    async listInventory(dealerWallet: string, query: { page: string; limit: string }) {
        const page = parseInt(query.page, 10);
        const limit = parseInt(query.limit, 10);

        return dealerRepository.listInventory(dealerWallet, page, limit);
    },

    /**
     * List active trade certificates held by this dealer.
     */
    async listTradeCerts(dealerWallet: string) {
        return dealerRepository.getActiveTradeCerts(dealerWallet);
    },

    /**
     * Submit an off-chain Sale Request (Registration Request) to the RTO.
     */
    async createSaleRequest(input: CreateSaleRequestInput, dealerWallet: string, dealerUserId: string) {
        // 1. Validate Dealer KYC + read their assigned RTO
        const verifiedDealer = await dealerRepository.getVerifiedUser(dealerWallet);
        if (!verifiedDealer) {
            throw createError(403, 'Your dealer account must be verified (KYC) to perform this action.');
        }

        // RTO is assigned at KYC time — no need for the client to supply it
        const rtoEntityId = verifiedDealer.rtoEntityId;
        if (!rtoEntityId) {
            throw createError(403, 'Your account has not been assigned to an RTO. Please complete KYC with RTO selection first.');
        }

        // 2. Validate Dealer Trade Certificate is issued by their assigned RTO
        const tradeCerts = await dealerRepository.getActiveTradeCerts(dealerWallet);
        const hasValidTradeCert = tradeCerts.some(tc => tc.rtoEntityId === rtoEntityId);

        if (!hasValidTradeCert) {
            throw createError(403, 'You do not have a valid, active Trade Certificate from your assigned RTO.');
        }

        // 3. Validate Vehicle
        const passport = await dealerRepository.getVehicleInInventory(BigInt(input.dvpId), dealerWallet);
        if (!passport) {
            throw createError(404, 'Vehicle not found in your inventory or is already registered.');
        }

        // 4. Validate Buyer KYC
        const buyerUser = await dealerRepository.getVerifiedUser(input.buyerWallet);
        if (!buyerUser) {
            throw createError(400, 'Buyer wallet does not belong to a registered citizen with verified KYC.');
        }

        // 5. Create Registration Request — RTO is auto-assigned from dealer's profile
        const request = await dealerRepository.createRegistrationRequest({
            dvpId: BigInt(input.dvpId),
            passportId: passport.id,
            buyerWallet: input.buyerWallet,
            dealerWallet,
            buyerUserId: buyerUser.id,
            dealerUserId,
            rtoEntityId
        });

        logger.info({ dvpId: request.dvpId.toString(), dealerWallet, buyerWallet: input.buyerWallet }, 'Dealer submitted sale request');

        return request;
    }
};
