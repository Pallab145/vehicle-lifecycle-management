import createError from 'http-errors';
import { citizenRepository } from './citizen.repository';
import type { VerifyKycInput } from './citizen.schema';
import { VehicleStatus } from '@/generated/prisma/client';

export const citizenService = {
    /**
     * Simulates a mock KYC verification process against a 3rd-party identity provider (e.g., Aadhaar API, SumSub).
     * If valid, updates the user's profile, sets isVerified = true, and optionally assigns their RTO.
     */
    async verifyKyc(input: VerifyKycInput, userId: string) {
        const user = await citizenRepository.findById(userId);

        if (!user) {
            throw createError(404, 'Citizen account not found');
        }

        if (user.isVerified) {
            throw createError(409, 'Citizen account is already verified');
        }

        // If an RTO was selected, validate it exists and is active
        if (input.rtoEntityId) {
            const rto = await citizenRepository.findActiveRtoById(input.rtoEntityId);
            if (!rto) {
                throw createError(400, 'The selected RTO does not exist or is not currently active.');
            }
        }

        // --- MOCK 3RD PARTY API DELAY ---
        // In real production: await axios.post('https://api.sumsub.com/verify', input);
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Reject specific test document for mock failure simulation
        if (input.documentNumber === '00000') {
            throw createError(400, 'KYC Verification Failed: Invalid document detected by authority');
        }

        // Successfully update the database
        const updatedUser = await citizenRepository.verifyCitizenProfile(userId, input);

        return updatedUser;
    },

    /**
     * Returns the list of all active RTOs for the citizen selection dropdown.
     */
    async listActiveRtos() {
        return citizenRepository.listActiveRtos();
    },

    /**
     * Lists all active scrap centers for the citizen to choose from.
     */
    async listScrapCenters(page: number, limit: number): Promise<[Awaited<ReturnType<typeof citizenRepository.getScrapCenters>>, number]> {
        const [data, total] = await Promise.all([
            citizenRepository.getScrapCenters(page, limit),
            citizenRepository.countScrapCenters()
        ]);
        return [data, total];
    },

    /**
     * Pre-flight check for authorizeScrap.
     * Verifies the citizen owns the vehicle and there are no blockers (loans, challans, etc).
     */
    async checkScrapEligibility(dvpId: bigint, ownerUserId: string | null, ownerWallet: string) {
        const vehicle = await citizenRepository.getVehicleByDvpId(dvpId);

        if (!vehicle) {
            throw createError(404, 'Vehicle not found');
        }

        // --- OWNERSHIP CHECK FIRST (security: must own the vehicle before seeing eligibility) ---
        const ownership = vehicle.ownership;
        const callerOwnsVehicle = ownership &&
            ownership.isActive &&
            (
                ownership.ownerWallet.toLowerCase() === ownerWallet.toLowerCase() ||
                (ownerUserId && ownership.ownerUserId === ownerUserId)
            );

        if (!callerOwnsVehicle) {
            // 403, not 404 — don't reveal that the vehicle exists to non-owners
            throw createError(403, 'Access denied: you are not the active owner of this vehicle');
        }

        const reasons: string[] = [];
        let isEligible = true;

        // Status check
        if (vehicle.status !== VehicleStatus.ACTIVE) {
            isEligible = false;
            reasons.push(`Vehicle status is ${vehicle.status}, must be ACTIVE to scrap`);
        }

        // Check loans (on the passport side, not ownership)
        const activeLoans = vehicle.loanRecords;
        if (activeLoans && activeLoans.length > 0) {
            isEligible = false;
            reasons.push('Active bank loan exists. Must be cleared before scrapping.');
        }

        // Check challans (on ownership side)
        const pendingChallans = ownership.challans;
        if (pendingChallans && pendingChallans.length > 0) {
            isEligible = false;
            reasons.push(`Has ${pendingChallans.length} unpaid challan(s). Must be paid before scrapping.`);
        }

        // Check pending transfers
        const pendingTransfers = ownership.transferRequests;
        if (pendingTransfers && pendingTransfers.length > 0) {
            isEligible = false;
            reasons.push('A pending transfer request exists. Must be cancelled or completed first.');
        }

        return {
            isEligible,
            reasons,
            vehicleDetails: {
                vinHash: vehicle.vinHash,
                mfgDate: vehicle.mfgDate,
                authorizedScrapCenterId: vehicle.authorizedScrapCenterId
            }
        };
    },

    /**
     * Pre-flight check for initTransfer.
     * Checks if citizen owns it, is ACTIVE, and warns about challans/loans.
     */
    async checkTransferEligibility(ownTid: bigint, ownerUserId: string | null, ownerWallet: string) {
        const ownership = await citizenRepository.getVehicleByOwnTid(ownTid, ownerUserId, ownerWallet);

        if (!ownership || !ownership.passport) {
            throw createError(404, 'Vehicle ownership not found or you are not the active owner');
        }

        const passport = ownership.passport;
        const reasons: string[] = [];
        const warnings: string[] = [];
        let isEligible = true;

        if (passport.status !== VehicleStatus.ACTIVE) {
            isEligible = false;
            reasons.push(`Vehicle status is ${passport.status}, must be ACTIVE to transfer`);
        }

        // Check pending transfers — hard block
        const pendingTransfers = ownership.transferRequests;
        let currentTransfer = null;
        if (pendingTransfers && pendingTransfers.length > 0) {
            isEligible = false;
            currentTransfer = pendingTransfers[0];
            reasons.push('A pending transfer request already exists.');
        }

        // Check loans — warning (seller's bank can clear it before RTO approval)
        // Note: loanRecords is on passport
        const activeLoans = passport.loanRecords;
        if (activeLoans && activeLoans.length > 0) {
            warnings.push('Active bank loan exists. RTO will not approve transfer until the loan is cleared by the bank.');
        }

        // Check challans — warning
        const pendingChallans = ownership.challans;
        if (pendingChallans && pendingChallans.length > 0) {
            warnings.push(`Has ${pendingChallans.length} unpaid challan(s). RTO will reject transfer unless paid.`);
        }

        return {
            isEligible,
            reasons,
            warnings,
            currentTransfer,
            vehicleDetails: {
                vinHash: passport.vinHash,
                rtoEntityId: ownership.rtoEntityId
            }
        };
    },

    /**
     * Retrieves all vehicles owned by the citizen.
     */
    async getMyVehicles(ownerUserId: string | null, ownerWallet: string, page: number, limit: number) {
        return citizenRepository.getOwnedVehicles(ownerUserId, ownerWallet, page, limit);
    },

    /**
     * Retrieves full details for a single vehicle owned by the citizen.
     */
    async getVehicleDetail(ownTid: bigint, ownerUserId: string | null, ownerWallet: string) {
        const vehicle = await citizenRepository.getVehicleByOwnTid(ownTid, ownerUserId, ownerWallet);
        if (!vehicle) {
            throw createError(404, 'Vehicle not found or you are not the active owner');
        }
        return vehicle;
    },

    /**
     * Returns the pending transfer request for a vehicle, visible to both the seller and buyer.
     * This is the buyer's primary "I have a pending offer" data source.
     */
    async getTransferStatus(ownTid: bigint, callerUserId: string | null, callerWallet: string) {
        const transfer = await citizenRepository.getTransferStatusByOwnTid(ownTid, callerUserId, callerWallet);
        if (!transfer) {
            throw createError(404, 'No pending transfer found for this vehicle associated with your account');
        }
        return transfer;
    }
};
