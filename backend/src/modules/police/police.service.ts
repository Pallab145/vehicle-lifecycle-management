import createError from 'http-errors';
import { policeRepository } from './police.repository';
import type { IssueChallanInput, PayChallanInput } from './police.schema';
import { BlockchainManager } from '@/lib/blockchain.manager';
import { EntityType, ChallanStatus, TxSource } from '@/generated/prisma/client';
import { parseEthersError } from '@/utils/blockchainErrorHandler';
import { logger } from '@/lib/logger';

export const policeService = {
    /**
     * Issues a new challan to a vehicle.
     */
    async issueChallan(
        input: IssueChallanInput,
        policeEntityId: string,
        memberId: string
    ) {
        const ownTid = BigInt(input.ownTid);

        // 1. Verify Ownership Record
        const ownership = await policeRepository.findOwnershipByOwnTid(ownTid);
        if (!ownership) {
            throw createError(404, 'Vehicle ownership record not found.');
        }

        // 2. Submit to Blockchain
        let txHash: string;
        try {
            txHash = await BlockchainManager.submitEntityTx(
                policeEntityId,
                EntityType.POLICE,
                'issueChallan',
                [ownTid, input.amount] // amount is a string representing Wei
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error({ err: parsedError, ownTid: input.ownTid }, 'Blockchain issueChallan failed');
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // 3. Create off-chain record
        const { challan } = await policeRepository.createChallanTx({
            ownershipId: ownership.id,
            ownTid: ownTid,
            policeEntityId: policeEntityId,
            amount: input.amount,
            memberId: memberId,
            txHash: txHash,
            violatorUserId: ownership.ownerUserId
        });

        return {
            id: challan.id,
            txHash,
            status: 'PENDING',
            message: 'Challan issuance transaction submitted to the mempool.'
        };
    },

    /**
     * Cancels an existing challan.
     */
    async cancelChallan(
        challanIdRaw: string,
        policeEntityId: string,
        memberId: string
    ) {
        const challanId = BigInt(challanIdRaw);

        // 1. Find Challan
        const challan = await policeRepository.findChallanByOnChainId(challanId);
        if (!challan) {
            throw createError(404, 'Challan not found.');
        }

        // 2. Authorization and State Checks
        if (challan.policeEntityId !== policeEntityId) {
            throw createError(403, 'Unauthorized. This challan was issued by a different Police Station.');
        }

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
            txHash = await BlockchainManager.submitEntityTx(
                policeEntityId,
                EntityType.POLICE,
                'cancelChallan',
                [challan.ownTid, challanId]
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error({ err: parsedError, challanId: challanIdRaw }, 'Blockchain cancelChallan failed');
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // 4. Create pending transaction
        await policeRepository.createCancelChallanTx({
            challanId: challan.id,
            policeEntityId,
            memberId,                   // officer's memberId — always present here
            txSource: TxSource.MEMBER,  // human-triggered via API
            txHash
        });

        return { txHash, status: 'PENDING' };
    },

    /**
     * Pays an existing challan (e.g. offline cash payment collected by Police).
     */
    async payChallan(
        challanIdRaw: string,
        input: PayChallanInput,
        policeEntityId: string,
        memberId: string
    ) {
        const challanId = BigInt(challanIdRaw);

        // 1. Find Challan
        const challan = await policeRepository.findChallanByOnChainId(challanId);
        if (!challan) {
            throw createError(404, 'Challan not found.');
        }

        // 2. Authorization and State Checks
        if (challan.policeEntityId !== policeEntityId) {
            throw createError(403, 'Unauthorized. This challan belongs to a different Police Station.');
        }

        if (challan.status === ChallanStatus.PAID) {
            throw createError(400, 'Challan is already paid.');
        }

        if (challan.status === ChallanStatus.CANCELLED) {
            throw createError(400, 'Cannot pay a cancelled challan.');
        }

        if (!challan.ownTid) {
            throw createError(400, 'Challan record is incomplete (missing ownTid).');
        }

        // 3. Amount Validation
        if (input.amountPaid !== challan.amount.toString()) {
            throw createError(400, `Payment amount mismatch. Expected: ${challan.amount.toString()} Wei, Received: ${input.amountPaid} Wei`);
        }

        // 4. Submit to Blockchain
        let txHash: string;
        try {
            txHash = await BlockchainManager.submitEntityTx(
                policeEntityId,
                EntityType.POLICE,
                'payChallan',
                [challan.ownTid, challanId]
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error({ err: parsedError, challanId: challanIdRaw }, 'Blockchain payChallan failed');
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // 5. Create pending transaction
        await policeRepository.createPayChallanTx({
            challanId: challan.id,
            policeEntityId,
            memberId,                   // officer's memberId — always present here
            txSource: TxSource.MEMBER,  // human-triggered via API
            txHash
        });

        // NOTE: For webhook-triggered payments (citizen online pay), call
        // createPayChallanTx with { memberId: null, txSource: TxSource.WEBHOOK }
        // The blockchain still uses the Police entity wallet either way.

        return { txHash, status: 'PENDING', message: 'Challan payment initiated' };
    },

    /**
     * Lists challans issued by this Police Station.
     */
    async listChallans(
        policeEntityId: string,
        params: { page: number; limit: number; status?: ChallanStatus }
    ) {
        return policeRepository.listChallans(policeEntityId, params);
    }
};
