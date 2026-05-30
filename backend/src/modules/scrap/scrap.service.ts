import createError from 'http-errors';
import { scrapRepository } from './scrap.repository';
import { BlockchainManager } from '@/lib/blockchain.manager';
import { EntityType, VehicleStatus } from '@/generated/prisma/client';
import { parseEthersError } from '@/utils/blockchainErrorHandler';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import type { ListScrappedQuery } from './scrap.schema';
import { JsonRpcProvider, Contract } from 'ethers';
import { env } from '@/config/env';
import DvpAbi from '@/abi/DigitalVehiclePassport.json';

export const scrapService = {
    async checkEligibility(scrapEntityId: string, dvpIdStr: string) {
        const dvpId = BigInt(dvpIdStr);

        // 1. Fetch vehicle and relations
        const vehicle = await scrapRepository.getVehicleEligibilityDetails(dvpId);
        if (!vehicle) {
            throw createError(404, 'Vehicle not found.');
        }

        if (vehicle.status !== VehicleStatus.ACTIVE) {
            throw createError(400, `Vehicle is not active (current status: ${vehicle.status}).`);
        }

        // 2. Compliance Checks
        const reasons: string[] = [];

        if (vehicle.loanRecords && vehicle.loanRecords.length > 0) {
            reasons.push('Active bank loan exists on the vehicle.');
        }

        if (vehicle.ownership) {
            if (vehicle.ownership.challans && vehicle.ownership.challans.length > 0) {
                reasons.push('Unpaid traffic challans exist on the vehicle.');
            }
            if (vehicle.ownership.transferRequests.length > 0) {
                reasons.push('A pending ownership transfer request exists.');
            }
        } else {
            reasons.push('Vehicle ownership record is missing.');
        }

        // 3. Authorization Check
        // We need to query the DigitalVehiclePassport contract to see if this scrap center is authorized.
        try {
            const provider = new JsonRpcProvider(env.RPC_URL);
            const dvpContract = new Contract(env.CONTRACT_DVP_ADDRESS, DvpAbi, provider);
            
            const scrapCenter = await prisma.b2BEntity.findUnique({ where: { id: scrapEntityId } });
            
            if (scrapCenter && scrapCenter.onChainId) {
                const authorizedScrapId = await dvpContract.authorizedScrapCenter(dvpId.toString());
                if (BigInt(authorizedScrapId) !== BigInt(scrapCenter.onChainId)) {
                    reasons.push('This Scrap Center has not been authorized by the vehicle owner.');
                }
            } else {
                reasons.push('Scrap Center is not fully registered on-chain.');
            }
        } catch (error) {
            logger.error({ err: error, dvpId: dvpIdStr }, 'Failed to check on-chain scrap authorization');
            reasons.push('Failed to verify on-chain authorization. Please try again.');
        }

        const isEligible = reasons.length === 0;

        return {
            isEligible,
            vehicleDetails: {
                dvpId: vehicle.dvpId?.toString(),
                vinHash: vehicle.vinHash,
                manufacturer: vehicle.manufacturer?.name,
                ownerWallet: vehicle.ownership?.ownerWallet,
                regDate: vehicle.ownership?.regDate
            },
            reasons
        };
    },

    async scrapVehicle(scrapEntityId: string, memberId: string, dvpIdStr: string) {
        const dvpId = BigInt(dvpIdStr);

        // 1. Verify Entity is Active
        const scrapEntity = await prisma.b2BEntity.findUnique({ where: { id: scrapEntityId } });
        if (!scrapEntity || !scrapEntity.isActive) {
            throw createError(403, 'Scrap center is inactive. Contact the Government Administrator.');
        }

        // 2. Strict Eligibility Check
        const eligibility = await this.checkEligibility(scrapEntityId, dvpIdStr);
        if (!eligibility.isEligible) {
            throw createError(400, `Vehicle cannot be scrapped. Reasons: ${eligibility.reasons.join(' | ')}`);
        }

        // 3. Submit to Blockchain
        let txHash: string;
        try {
            txHash = await BlockchainManager.submitEntityTx(
                scrapEntityId,
                EntityType.SCRAP_CENTER,
                'scrapVehicle',
                [dvpIdStr]
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error(
                { err: parsedError, dvpId: dvpIdStr },
                'Blockchain scrapVehicle failed'
            );
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // 4. Track PENDING transaction
        return scrapRepository.createPendingScrapTx(dvpId, scrapEntityId, memberId, txHash);
    },

    async listScrappedVehicles(scrapEntityId: string, query: ListScrappedQuery) {
        return scrapRepository.listScrappedVehicles(
            scrapEntityId,
            query.page,
            query.limit,
            query.vinHash
        );
    },

    async getVehicleDetails(scrapEntityId: string, dvpIdStr: string) {
        const dvpId = BigInt(dvpIdStr);
        const vehicle = await scrapRepository.getVehicleDetails(dvpId, scrapEntityId);
        
        if (!vehicle) {
            throw createError(404, 'Scrapped vehicle not found or not scrapped by this center.');
        }

        return vehicle;
    }
};
