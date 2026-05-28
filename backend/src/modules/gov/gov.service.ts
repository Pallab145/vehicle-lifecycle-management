import createError from 'http-errors';
import { govRepository } from './gov.repository';
import type { ListGlobalChallansQuery } from './gov.schema';
import { BlockchainManager } from '@/lib/blockchain.manager';
import { EntityType, ChallanStatus } from '@/generated/prisma/client';
import { parseEthersError } from '@/utils/blockchainErrorHandler';
import { logger } from '@/lib/logger';

export const govService = {
    /**
     * Admin overrides and cancels a challan.
     */
    async adminCancelChallan(
        challanIdRaw: string,
        govEntityId: string,
        memberId: string
    ) {
        const challanId = BigInt(challanIdRaw);

        // 1. Find Challan
        const challan = await govRepository.findChallanByOnChainId(challanId);
        if (!challan) {
            throw createError(404, 'Challan not found.');
        }

        // 2. State Checks
        if (challan.status === ChallanStatus.PAID) {
            throw createError(400, 'Cannot cancel a challan that has already been paid.');
        }

        if (challan.status === ChallanStatus.CANCELLED) {
            throw createError(400, 'Challan is already cancelled.');
        }

        if (!challan.ownTid) {
            throw createError(400, 'Challan record is incomplete (missing ownTid).');
        }

        // 3. Submit to Blockchain
        let txHash: string;
        try {
            txHash = await BlockchainManager.submitGovTx(
                EntityType.POLICE, // Target the ChallanContract for admin override
                'ADMIN_CANCEL_CHALLAN',
                [challan.ownTid, challanId]
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error({ err: parsedError, challanId: challanIdRaw }, 'Blockchain adminCancelChallan failed');
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // 4. Create pending transaction
        await govRepository.createAdminCancelChallanTx({
            challanId: challan.id,
            govEntityId,
            memberId,
            txHash
        });

        return { txHash, status: 'PENDING' };
    },

    /**
     * Lists ALL challans across the entire system.
     */
    async listGlobalChallans(query: ListGlobalChallansQuery) {
        return govRepository.listGlobalChallans({
            page: query.page,
            limit: query.limit,
            status: query.status,
            policeEntityId: query.policeEntityId,
            violatorUserId: query.violatorUserId,
            ownTid: query.ownTid ? BigInt(query.ownTid) : undefined,
            challanId: query.challanId ? BigInt(query.challanId) : undefined
        });
    }
};
