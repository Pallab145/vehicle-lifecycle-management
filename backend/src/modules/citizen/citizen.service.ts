import createError from 'http-errors';
import { citizenRepository } from './citizen.repository';
import type { VerifyKycInput } from './citizen.schema';

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
    }
};
