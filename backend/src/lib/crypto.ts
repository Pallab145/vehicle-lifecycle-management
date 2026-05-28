import crypto from 'crypto';
import { env } from '@/config/env';
import { EntityType } from '@/generated/prisma/client';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Derives a strict 32-byte key from the environment master key using SHA-256.
 * This guarantees the key is the exact length required for AES-256, regardless
 * of the length of the string provided in the .env file.
 */
function derive32ByteKey(masterKeyString: string): Buffer {
    return crypto.createHash('sha256').update(masterKeyString).digest();
}

export function getMasterKeyForEntity(entityType: EntityType): string {
    switch (entityType) {
        case EntityType.GOVERNMENT:
            return env.MASTER_ADMIN_KEY;
        case EntityType.RTO:
            return env.RTO_MASTER_KEY;
        case EntityType.MANUFACTURER:
            return env.MANUFACTURER_MASTER_KEY;
        case EntityType.POLICE:
            return env.POLICE_MASTER_KEY;
        case EntityType.INSURANCE:
            return env.INSURANCE_MASTER_KEY;
        case EntityType.PUC_CENTER:
            return env.PUC_MASTER_KEY;
        case EntityType.SCRAP_CENTER:
            return env.SCRAP_MASTER_KEY;
        case EntityType.BANK:
            return env.BANK_MASTER_KEY;
        default:
            throw new Error(`No cryptographic master key configured for entity type: ${entityType}`);
    }
}

/**
 * Encrypts a plaintext string (e.g., Ethereum private key) using AES-256-GCM.
 * The output format is: `base64(iv):base64(authTag):base64(ciphertext)`
 * 
 * @param plaintext The string to encrypt.
 * @param entityType The entity type to determine which master key to use.
 * @returns The structured encrypted string payload.
 */
export function encryptAES256GCM(plaintext: string, entityType: EntityType): string {
    const masterKeyString = getMasterKeyForEntity(entityType);
    const key = derive32ByteKey(masterKeyString);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypts a structured AES-256-GCM encrypted string.
 * Expects the format: `base64(iv):base64(authTag):base64(ciphertext)`
 * 
 * @param encryptedPayload The encrypted string structure.
 * @param entityType The entity type to determine which master key to use.
 * @returns The decrypted plaintext string.
 */
export function decryptAES256GCM(encryptedPayload: string, entityType: EntityType): string {
    const masterKeyString = getMasterKeyForEntity(entityType);
    const key = derive32ByteKey(masterKeyString);
    
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted payload format. Expected iv:authTag:ciphertext');
    }

    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const ciphertext = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
