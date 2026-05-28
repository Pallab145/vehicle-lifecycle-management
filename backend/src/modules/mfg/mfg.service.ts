import { ethers } from 'ethers';
import createError from 'http-errors';
import { mfgRepository } from './mfg.repository';
import { BlockchainManager } from '@/lib/blockchain.manager';
import { EntityType, SyncStatus, VehicleStatus } from '@/generated/prisma/client';
import type { ManufactureVehicleInput, AssignToDealerInput, AssignToDealerParams } from './mfg.schema';
import { parseEthersError } from '@/utils/blockchainErrorHandler';
import { logger } from '@/lib/logger';

export const mfgService = {
    /**
     * Mint a new Vehicle Passport.
     * Computes the required hashes off-chain and submits to the DVP contract.
     */
    async manufactureVehicle(input: ManufactureVehicleInput, mfgEntityId: string, memberId: string) {
        // 1. Compute Hashes (Privacy-preserving)
        const vinHash = ethers.keccak256(ethers.toUtf8Bytes(input.vin));
        const engineHash = ethers.keccak256(ethers.toUtf8Bytes(input.engineNo));
        const chassisHash = ethers.keccak256(ethers.toUtf8Bytes(input.chassisNo));
        const specsString = `${input.make}|${input.model}|${input.color}`;
        const specsHash = ethers.keccak256(ethers.toUtf8Bytes(specsString));

        // 2. Ensure it doesn't already exist (Prevent duplicate VIN)
        const existing = await mfgRepository.findVehicleByVinHash(vinHash);
        if (existing) {
            throw createError(409, 'Vehicle with this VIN already exists (Hash collision or duplicate)');
        }

        // 3. Submit to Blockchain via Relayer (We do this BEFORE DB write to avoid dirty state if simulation fails)
        let txHash: string;
        try {
            txHash = await BlockchainManager.submitEntityTx(
                mfgEntityId,
                EntityType.MANUFACTURER,
                'manufacture',
                [vinHash, specsHash, engineHash, chassisHash]
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error({ err: parsedError, vinHash }, 'Blockchain manufacture failed');
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // 4. Create Draft Record and Pending Tx Atomically
        const { draftPassport } = await mfgRepository.createDraftVehicleWithTx({
            vinHash,
            engineHash,
            chassisHash,
            specsHash,
            mfgEntityId,
            memberId,
            txHash
        });

        return {
            id: draftPassport.id,
            vinHash,
            txHash,
            status: SyncStatus.PENDING,
            message: 'Vehicle manufacturing transaction submitted to the mempool.'
        };
    },

    /**
     * Assigns a manufactured vehicle (NOT_REG) to a Dealer.
     */
    async assignToDealer(params: AssignToDealerParams, input: AssignToDealerInput, mfgEntityId: string, memberId: string) {
        // 1. Verify Ownership & State
        const passport = await mfgRepository.findVehicleByDvpIdAndMfg(BigInt(params.tokenId), mfgEntityId);

        if (!passport) {
            throw createError(404, 'Vehicle not found or does not belong to your manufacturing entity.');
        }

        if (passport.status !== 'NOT_REG') {
            throw createError(400, 'Cannot assign vehicle: Status is not NOT_REG.');
        }

        // 2. Verify Dealer KYC
        const verifiedDealer = await mfgRepository.findVerifiedDealer(input.dealerWallet);
        if (!verifiedDealer) {
            throw createError(400, 'Target dealer wallet is not registered or has not completed KYC verification.');
        }

        // 3. Verify Dealer Trade Certificate
        const tradeCert = await mfgRepository.findActiveTradeCert(input.dealerWallet);
        if (!tradeCert) {
            throw createError(400, 'Target dealer does not hold an active Trade Certificate. Assignment rejected.');
        }

        // 4. Check for pending assignment transaction
        const pendingTx = await mfgRepository.findPendingAssignmentTx(passport.id);
        if (pendingTx) {
            throw createError(409, 'An assignment transaction is already pending in the mempool for this vehicle.');
        }

        // 5. Submit to Blockchain
        try {
            const txHash = await BlockchainManager.submitEntityTx(
                mfgEntityId,
                EntityType.MANUFACTURER,
                'assignToDealer',
                [params.tokenId, input.dealerWallet]
            );

            // 4. Create Pending Transaction Record
            await mfgRepository.createAssignmentTx({
                txHash,
                passportId: passport.id,
                mfgEntityId,
                memberId
            });

            return {
                tokenId: params.tokenId,
                dealerWallet: input.dealerWallet,
                txHash,
                status: SyncStatus.PENDING,
                message: 'Vehicle assignment transaction submitted to the mempool.'
            };
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error({ err: parsedError, tokenId: params.tokenId }, 'Blockchain assignment failed');
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }
    },

    /**
     * Lists vehicles belonging to this manufacturer.
     */
    async listVehicles(mfgEntityId: string, query: { page: string; limit: string; status?: string }) {
        const page = parseInt(query.page, 10);
        const limit = parseInt(query.limit, 10);
        
        // The repository takes the native enum type for status, which is already validated by Zod
        const status = query.status as VehicleStatus | undefined; 

        return mfgRepository.listVehicles(mfgEntityId, { page, limit, status });
    }
};
