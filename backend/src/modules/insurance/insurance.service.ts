import { z } from 'zod';
import createError from 'http-errors';
import { insuranceRepository } from './insurance.repository';
import { BlockchainManager } from '@/lib/blockchain.manager';
import { InsuranceStatus, EntityType } from '@/generated/prisma/client';
import { parseEthersError } from '@/utils/blockchainErrorHandler';
import { logger } from '@/lib/logger';
import {
    issuePolicySchema,
    listPoliciesSchema
} from './insurance.schema';

const MAX_POLICY_DURATION = 3 * 365 * 24 * 60 * 60; // 3 years in seconds
const MAX_CLAIMS = 50;

export const insuranceService = {

    /**
     * Issue an insurance policy for a vehicle.
     * Mirrors the validation of InsuranceToken.issuePolicy().
     */
    async issuePolicy(
        input: z.infer<typeof issuePolicySchema>,
        insEntityId: string,
        memberId: string
    ) {
        const { ownTid, expiryDate, coverage, premium } = input;
        const ownTidBigInt = BigInt(ownTid);

        // 1. Resolve vehicle ownership
        const ownership = await insuranceRepository.findOwnershipByOwnTid(ownTidBigInt);
        if (!ownership) {
            throw createError(404, 'Vehicle ownership record not found for the given ownTid.');
        }

        // 2. Guard: VehicleOwnership.isActive must be true (VehicleNotActive)
        if (!ownership.isActive) {
            throw createError(400, 'Vehicle ownership is not active (e.g. transfer pending or scrapped).');
        }

        // 3. Guard: Expiry Date Validation
        const nowUnix = Math.floor(Date.now() / 1000);
        if (expiryDate <= nowUnix) {
            throw createError(400, 'Expiry date must be in the future (ExpiryInPast).');
        }
        if (expiryDate > nowUnix + MAX_POLICY_DURATION) {
            throw createError(400, `Expiry date exceeds maximum policy duration of 3 years (ExpiryTooFar).`);
        }

        // 4. Guard: No active, unexpired policy already exists (PolicyExists)
        const existingPolicy = await insuranceRepository.findActivePolicyByOwnTid(ownTidBigInt);
        if (existingPolicy) {
            throw createError(409, 'Vehicle already has a valid active policy (PolicyExists).');
        }

        // 5. Submit to Blockchain
        // issuePolicy(uint256 ownTid, uint32 expiryDate, uint128 coverage, uint128 premium)
        const args = [
            ownTidBigInt.toString(),
            expiryDate,
            coverage,
            premium
        ];

        let txHash: string;
        try {
            txHash = await BlockchainManager.submitEntityTx(
                insEntityId,
                EntityType.INSURANCE,
                'issuePolicy',
                args
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error(
                { err: parsedError, ownTid: ownTid.toString() },
                'Blockchain issuePolicy failed'
            );
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // 6. Track PENDING transaction
        return insuranceRepository.createPendingPolicyTx({
            ownershipId: ownership.id,
            ownTid: ownTidBigInt,
            insEntityId,
            ownerWallet: ownership.ownerWallet,
            coverage,
            premium,
            expiryDate: new Date(expiryDate * 1000),
            memberId,
            txHash
        });
    },

    /**
     * Mark an expired policy as inactive.
     * Mirrors the validation of InsuranceToken.markExpired().
     */
    async markExpired(
        policyId: string,
        insEntityId: string,
        memberId: string
    ) {
        // 1. Fetch policy
        const policy = await insuranceRepository.getPolicyById(policyId);
        if (!policy) {
            throw createError(404, 'Policy not found.');
        }

        // 2. Authorization: only the issuing company can mark it expired
        if (policy.insEntityId !== insEntityId) {
            throw createError(403, 'Unauthorized: Your entity did not issue this policy.');
        }

        // 3. State: policy.status must NOT already be EXPIRED
        if (policy.status === InsuranceStatus.EXPIRED) {
            throw createError(400, 'Policy is already marked as expired.');
        }

        // 4. Date: policy.expiryDate must be < now (NotExpired)
        if (policy.expiryDate.getTime() >= Date.now()) {
            throw createError(400, 'Policy has not expired yet (NotExpired).');
        }
        
        if (!policy.polId) {
            throw createError(400, 'Policy is still pending on-chain.');
        }

        // 5. Submit to Blockchain
        let txHash: string;
        try {
            txHash = await BlockchainManager.submitEntityTx(
                insEntityId,
                EntityType.INSURANCE,
                'markExpired',
                [policy.polId.toString()]
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error(
                { err: parsedError, polId: policy.polId.toString() },
                'Blockchain markExpired failed'
            );
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // 6. Track PENDING transaction
        return insuranceRepository.createExpireTx({
            policyId,
            insEntityId,
            memberId,
            txHash
        });
    },

    /**
     * File a claim on an active policy.
     * Mirrors the validation of InsuranceToken.fileClaim().
     */
    async fileClaim(
        policyId: string,
        insEntityId: string,
        memberId: string
    ) {
        // 1. Fetch policy
        const policy = await insuranceRepository.getPolicyById(policyId);
        if (!policy) {
            throw createError(404, 'Policy not found.');
        }

        // 2. Authorization: only the issuing company can file claims (Unauthorized)
        if (policy.insEntityId !== insEntityId) {
            throw createError(403, 'Unauthorized: Only the issuing company can file claims.');
        }

        // 3. State: policy.status must be ACTIVE (PolicyNotActive)
        if (policy.status !== InsuranceStatus.ACTIVE) {
            throw createError(400, 'Policy is not active (PolicyNotActive).');
        }

        // 4. Date: policy.expiryDate must be >= now (PolicyNotActive)
        if (policy.expiryDate.getTime() < Date.now()) {
            throw createError(400, 'Policy has expired (PolicyNotActive).');
        }

        // 5. Guard: claimCount < MAX_CLAIMS (ClaimLimitReached)
        if (policy.claimCount >= MAX_CLAIMS) {
            throw createError(400, `Claim limit reached. Max claims allowed: ${MAX_CLAIMS} (ClaimLimitReached).`);
        }
        
        if (!policy.polId) {
            throw createError(400, 'Policy is still pending on-chain.');
        }

        // 6. Submit to Blockchain
        let txHash: string;
        try {
            txHash = await BlockchainManager.submitEntityTx(
                insEntityId,
                EntityType.INSURANCE,
                'fileClaim',
                [policy.polId.toString()]
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error(
                { err: parsedError, polId: policy.polId.toString() },
                'Blockchain fileClaim failed'
            );
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // 7. Track PENDING transaction
        return insuranceRepository.createClaimTx({
            policyId,
            insEntityId,
            memberId,
            txHash
        });
    },

    // ─── READ OPERATIONS ─────────────────────────────────────────────────────

    async listPolicies(
        query: z.infer<typeof listPoliciesSchema>,
        insEntityId: string
    ) {
        const ownTidBigInt = query.ownTid ? BigInt(query.ownTid) : undefined;
        return insuranceRepository.listPolicies({ ...query, insEntityId, ownTid: ownTidBigInt });
    },

    async getPolicyDetails(policyId: string, insEntityId: string) {
        const policy = await insuranceRepository.getPolicyById(policyId);
        if (!policy) {
            throw createError(404, 'Policy not found.');
        }
        // Authorization - Optional: restrict details to the issuing entity if needed
        // But typically Read logic might be more relaxed for viewers
        if (policy.insEntityId !== insEntityId) {
             throw createError(403, 'Unauthorized: Your entity did not issue this policy.');
        }
        return policy;
    },

    async getVehiclePolicy(ownTid: string) {
        const ownTidBigInt = BigInt(ownTid);
        const policy = await insuranceRepository.findActivePolicyByOwnTid(ownTidBigInt);
        if (!policy) {
            throw createError(404, 'No active policy found for this vehicle.');
        }
        return policy;
    }
};
