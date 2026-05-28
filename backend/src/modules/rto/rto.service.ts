import createError from 'http-errors';
import { rtoRepository } from './rto.repository';
import type { IssueTradeCertInput, RegisterVehicleInput } from './rto.schema';
import { BlockchainManager } from '@/lib/blockchain.manager';
import { EntityType, VehicleStatus, TransferStatus, RegistrationStatus } from '@/generated/prisma/client';
import { parseEthersError } from '@/utils/blockchainErrorHandler';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';

export const rtoService = {
    /**
     * Issues a Trade Certificate to a dealer on-chain.
     */
    async issueTradeCert(
        input: IssueTradeCertInput,
        rtoEntityId: string,
        memberId: string
    ) {
        // Resolve dealer user
        const dealerUser = await rtoRepository.findUserByWallet(input.dealerWallet);

        if (!dealerUser) {
            throw createError(404, 'Dealer wallet is not registered as a citizen user in the system.');
        }

        if (!dealerUser.isVerified) {
            throw createError(400, 'Dealer must complete KYC verification before receiving a Trade Certificate.');
        }

        if (dealerUser.rtoEntityId !== rtoEntityId) {
            throw createError(403, 'This dealer is assigned to a different RTO jurisdiction. You can only issue certificates to dealers under your RTO.');
        }

        // Prevent issuing multiple active trade certificates
        const existingCert = await rtoRepository.findTradeCertByWallet(input.dealerWallet);
        if (existingCert && existingCert.isActive) {
            throw createError(409, 'Dealer already has an active Trade Certificate. Revoke it before issuing a new one.');
        }

        // Submit to blockchain
        let txHash: string;
        try {
            txHash = await BlockchainManager.submitEntityTx(
                rtoEntityId,
                EntityType.RTO,
                'issueTradeCert',
                [input.dealerWallet, input.validTill]
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error({ err: parsedError, dealerWallet: input.dealerWallet }, 'Blockchain issueTradeCert failed');
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // Store off-chain and create pending tx
        const result = await rtoRepository.createTradeCertTx({
            dealerWallet: input.dealerWallet,
            dealerUserId: dealerUser?.id,
            rtoEntityId,
            validTill: new Date(input.validTill * 1000),
            memberId,
            txHash
        });

        return result.tradeCert;
    },

    /**
     * Revokes a Trade Certificate from a dealer on-chain.
     */
    async revokeTradeCert(dealerWallet: string, rtoEntityId: string, memberId: string) {
        const tradeCert = await rtoRepository.findTradeCertByWallet(dealerWallet);
        if (!tradeCert || !tradeCert.isActive) {
            throw createError(404, 'Active Trade Certificate not found for this dealer.');
        }
        if (tradeCert.rtoEntityId !== rtoEntityId) {
            throw createError(403, 'This Trade Certificate was issued by a different RTO.');
        }

        // Submit to blockchain
        let txHash: string;
        try {
            txHash = await BlockchainManager.submitEntityTx(
                rtoEntityId,
                EntityType.RTO,
                'revokeTradeCert',
                [dealerWallet]
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error({ err: parsedError, dealerWallet }, 'Blockchain revokeTradeCert failed');
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // Track pending tx
        await rtoRepository.createRevokeTradeCertTx({
            tradeCertId: tradeCert.id,
            rtoEntityId,
            memberId,
            txHash
        });

        return { txHash, status: 'PENDING' };
    },

    /**
     * Registers a new vehicle on-chain (OwnershipToken.register).
     */
    async registerVehicle(
        input: RegisterVehicleInput,
        rtoEntityId: string,
        memberId: string
    ) {
        const dvpId = BigInt(input.dvpId);

        // 1. Verify passport exists and is NOT_REG
        const passport = await rtoRepository.findVehicleByDvpId(dvpId);
        if (!passport) {
            throw createError(404, 'Vehicle Passport not found.');
        }
        if (passport.status !== VehicleStatus.NOT_REG) {
            throw createError(400, 'Vehicle is already registered or scrapped.');
        }

        // 2. Verify dealer has an active TradeCert from this specific RTO
        const tradeCert = await rtoRepository.findTradeCertByWallet(input.dealerWallet);
        if (!tradeCert || !tradeCert.isActive || tradeCert.validTill < new Date()) {
            throw createError(400, 'Dealer does not have a valid Trade Certificate.');
        }
        if (tradeCert.rtoEntityId !== rtoEntityId) {
            throw createError(403, 'Dealer trade certificate was not issued by your RTO.');
        }

        // 3. Find the pending RegistrationRequest for this specific RTO
        const regRequest = await prisma.registrationRequest.findFirst({
            where: { dvpId, status: RegistrationStatus.PENDING, rtoEntityId }
        });

        if (!regRequest) {
            throw createError(404, 'No pending registration request found for this vehicle in your RTO jurisdiction.');
        }

        if (regRequest.buyerWallet.toLowerCase() !== input.buyerWallet.toLowerCase() || 
            regRequest.dealerWallet.toLowerCase() !== input.dealerWallet.toLowerCase()) {
            throw createError(400, 'Provided wallet addresses do not match the original registration request.');
        }

        // 4. Submit to blockchain
        let txHash: string;
        try {
            txHash = await BlockchainManager.submitEntityTx(
                rtoEntityId,
                EntityType.RTO,
                'register',
                [dvpId, input.buyerWallet, input.dealerWallet]
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error({ err: parsedError, dvpId: input.dvpId }, 'Blockchain register failed');
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // Note: We DO NOT mark regRequest as APPROVED here. 
        // We rely on the Background Indexer to listen for the 'VehicleRegistered' event 
        // and update the status off-chain to ensure 100% consistency with the smart contract.

        // 5. Track pending tx
        await rtoRepository.createVehicleRegTx({
            passportId: passport.id,
            rtoEntityId,
            memberId,
            txHash
        });

        return { txHash, status: 'PENDING' };
    },

    /**
     * Approves an ownership transfer on-chain (OwnershipToken.approveTransfer).
     */
    async approveTransfer(ownTidRaw: string, rtoEntityId: string, memberId: string) {
        const ownTid = BigInt(ownTidRaw);

        const ownership = await rtoRepository.findOwnershipByOwnTid(ownTid);
        if (!ownership) {
            throw createError(404, 'Ownership record not found.');
        }

        // Buyer and Seller must have already accepted, and buyer must belong to THIS RTO
        const pendingXfer = await prisma.transferRequest.findFirst({
            where: {
                ownTid,
                status: TransferStatus.PENDING,
                sellerOK: true,
                buyerOK: true,
                buyerUser: {
                    rtoEntityId
                }
            }
        });

        if (!pendingXfer) {
            throw createError(400, 'No pending transfer request found that is ready for your RTO to approve. Ensure the buyer has accepted and belongs to your jurisdiction.');
        }

        // Submit to blockchain
        let txHash: string;
        try {
            txHash = await BlockchainManager.submitEntityTx(
                rtoEntityId,
                EntityType.RTO,
                'approveTransfer',
                [ownTid]
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error({ err: parsedError, ownTid: ownTidRaw }, 'Blockchain approveTransfer failed');
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // Track pending tx
        await rtoRepository.createApproveTransferTx({
            ownershipId: ownership.id,
            transferReqId: pendingXfer.id,
            rtoEntityId,
            memberId,
            txHash
        });

        return { txHash, status: 'PENDING' };
    },

    /**
     * Lists Trade Certificates issued by this RTO.
     */
    async listTradeCerts(rtoEntityId: string, params: { page: number; limit: number; isActive?: boolean }) {
        return rtoRepository.listTradeCerts(rtoEntityId, params);
    },

    /**
     * Lists pending/completed vehicle registrations submitted to this RTO.
     */
    async listRegistrations(rtoEntityId: string, params: { page: number; limit: number; status?: RegistrationStatus }) {
        return rtoRepository.listRegistrationRequests(rtoEntityId, params);
    },

    /**
     * Lists pending/completed transfers where the buyer belongs to this RTO.
     */
    async listTransfers(rtoEntityId: string, params: { page: number; limit: number; status?: TransferStatus }) {
        return rtoRepository.listTransferRequests(rtoEntityId, params);
    }
};
