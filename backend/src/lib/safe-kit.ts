import Safe from '@safe-global/protocol-kit';
import { env } from '@/config/env';
import prisma from '@/lib/prisma';
import { EntityType } from '@/generated/prisma/client';
import { decryptAES256GCM } from '@/lib/crypto';
import createHttpError from 'http-errors';

let safeKitInstance: Safe | null = null;

/**
 * Initializes and returns a singleton instance of the Safe Protocol Kit.
 * Fetches the encrypted Government Relayer Private Key from the database,
 * decrypts it securely, and connects to the Safe.
 */
export const getSafeKit = async (): Promise<Safe> => {
    if (safeKitInstance) return safeKitInstance;

    // Fetch the Government Entity and its Signing Key
    const morthEntity = await prisma.b2BEntity.findFirst({
        where: { type: EntityType.GOVERNMENT },
        include: { signingKey: true }
    });

    if (!morthEntity || !morthEntity.signingKey) {
        throw createHttpError(500, 'Critical System Error: MORTH-HQ entity or its signing key not found in the database');
    }

    // Decrypt the private key using the MASTER_ADMIN_KEY
    const decryptedPrivateKey = decryptAES256GCM(morthEntity.signingKey.encryptedPrivateKey, EntityType.GOVERNMENT);

    // Initialize the Safe Protocol Kit
    safeKitInstance = await Safe.init({
        provider: env.RPC_URL,
        signer: decryptedPrivateKey,
        safeAddress: env.MORTH_GNOSIS_SAFE_ADDRESS,
    });

    return safeKitInstance;
};
