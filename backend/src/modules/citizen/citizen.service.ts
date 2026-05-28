import createError from 'http-errors';
import { citizenRepository } from './citizen.repository';
import type { VerifyKycInput } from './citizen.schema';

export const citizenService = {
    /**
     * Simulates a mock KYC verification process against a 3rd-party identity provider (e.g., Aadhaar API, SumSub).
     * If valid, updates the user's profile and sets isVerified = true.
     */
    async verifyKyc(input: VerifyKycInput, userId: string) {
        const user = await citizenRepository.findById(userId);
        
        if (!user) {
            throw createError(404, 'Citizen account not found');
        }

        if (user.isVerified) {
            throw createError(409, 'Citizen account is already verified');
        }

        // --- MOCK 3RD PARTY API DELAY ---
        // In a real production system, you would hit an external API here:
        // const response = await axios.post('https://api.sumsub.com/verify', input);
        await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate 1.5s network latency

        // Simulate a rejection for specific test cases if needed (e.g., if documentNumber is '00000')
        if (input.documentNumber === '00000') {
            throw createError(400, 'KYC Verification Failed: Invalid document detected by authority');
        }

        // Successfully update the database
        const updatedUser = await citizenRepository.verifyCitizenProfile(userId, input);

        return updatedUser;
    }
};
