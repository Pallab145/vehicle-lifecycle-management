import 'dotenv/config';
import { EntityType, MemberRole, Prisma, SyncStatus } from '../src/generated/prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../src/lib/prisma';

// AES-256-GCM Settings
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Derives a strict 32-byte key from the environment master key using SHA-256.
 */
function derive32ByteKey(masterKeyString: string): Buffer {
    return crypto.createHash('sha256').update(masterKeyString).digest();
}

/**
 * Encrypts a plaintext string (e.g., Ethereum private key) using AES-256-GCM.
 */
function encryptAES256GCM(plaintext: string, masterKeyString: string): string {
    const key = derive32ByteKey(masterKeyString);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

async function main() {
    console.log('🌱 Starting database seed for Vehicle Lifecycle Management System...\n');

    // 1. Validate required environment variables directly from process.env
    const adminEmail = process.env.SEED_ADMIN_EMAIL;
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    const adminWalletAddress = process.env.SEED_ADMIN_WALLET_ADDRESS;
    const adminPrivateKey = process.env.SEED_ADMIN_PRIVATE_KEY;
    const masterAdminKey = process.env.MASTER_ADMIN_KEY; // Must match the one in env.ts
    const chainId = process.env.CHAIN_ID;

    if (!adminEmail || !adminPassword || !adminWalletAddress || !adminPrivateKey || !masterAdminKey || !chainId) {
        console.error('❌ ERROR: Missing required environment variables for seeding.');
        console.error('Please ensure the following are set in your environment (e.g., .env file):');
        console.error('  - SEED_ADMIN_EMAIL');
        console.error('  - SEED_ADMIN_PASSWORD');
        console.error('  - SEED_ADMIN_WALLET_ADDRESS');
        console.error('  - SEED_ADMIN_PRIVATE_KEY');
        console.error('  - MASTER_ADMIN_KEY');
        console.error('  - CHAIN_ID');
        process.exit(1);
    }

    // Basic format validation
    if (adminWalletAddress.length !== 42 || !adminWalletAddress.startsWith('0x')) {
        console.error('❌ ERROR: SEED_ADMIN_WALLET_ADDRESS must be a valid 42-character Ethereum address (starting with 0x).');
        process.exit(1);
    }
    if (adminPrivateKey.length !== 66 || !adminPrivateKey.startsWith('0x')) {
        console.error('❌ ERROR: SEED_ADMIN_PRIVATE_KEY must be a valid 66-character Ethereum private key (starting with 0x).');
        process.exit(1);
    }

    try {
        // Run everything in a transaction to ensure atomic seeding
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {

            // Check if the root entity already exists to prevent duplicate seeding
            const existingRoot = await tx.b2BEntity.findUnique({
                where: { code: 'MORTH-HQ' }
            });

            if (existingRoot) {
                console.log('⚠️ Root Government Entity (MORTH-HQ) already exists. Skipping seed.');
                return;
            }

            console.log('🏛️ Creating Root Government Entity (MORTH-HQ)...');
            const rootEntity = await tx.b2BEntity.create({
                data: {
                    type: EntityType.GOVERNMENT,
                    code: 'MORTH-HQ',
                    name: 'Ministry of Road Transport and Highways',
                    walletAddress: adminWalletAddress,
                    onChainId: 0,
                }
            });

            console.log(`👤 Creating Super Admin User (${adminEmail})...`);
            const passwordHash = await bcrypt.hash(adminPassword, 10);
            const superAdmin = await tx.b2BMember.create({
                data: {
                    entityId: rootEntity.id,
                    email: adminEmail,
                    name: 'System Administrator',
                    passwordHash: passwordHash,
                    role: MemberRole.OWNER,
                    isActive: true,
                }
            });

            console.log('🔐 Encrypting and Storing Root Signing Key...');
            const encryptedPrivateKey = encryptAES256GCM(adminPrivateKey, masterAdminKey);
            await tx.entitySigningKey.create({
                data: {
                    entityId: rootEntity.id,
                    encryptedPrivateKey: encryptedPrivateKey,
                    publicKey: adminWalletAddress,
                    algorithm: 'AES-256-GCM',
                    createdById: superAdmin.id,
                }
            });

            // --- Seed Initial Indexer State ---
            const deploymentBlock = process.env.DEPLOYMENT_BLOCK;
            if (deploymentBlock) {
                console.log('\n📡 Seeding Initial Indexer State...');
                const blockNum = BigInt(deploymentBlock);

                const dvpAddr = process.env.CONTRACT_DVP_ADDRESS;
                const ownershipAddr = process.env.CONTRACT_OWNERSHIP_ADDRESS;
                const challanAddr = process.env.CONTRACT_CHALLAN_ADDRESS;
                const insuranceAddr = process.env.CONTRACT_INSURANCE_ADDRESS;
                const pucAddr = process.env.CONTRACT_PUC_ADDRESS;
                const loanAddr = process.env.CONTRACT_LOAN_ADDRESS;

                if (!dvpAddr || !ownershipAddr || !challanAddr || !insuranceAddr || !pucAddr || !loanAddr) {
                    throw new Error('Missing contract address env variables (CONTRACT_DVP_ADDRESS, CONTRACT_OWNERSHIP_ADDRESS, etc.) required for IndexerState seeding.');
                }

                const contracts = [
                    { name: 'DigitalVehiclePassport', address: dvpAddr },
                    { name: 'OwnershipToken', address: ownershipAddr },
                    { name: 'ChallanContract', address: challanAddr },
                    { name: 'InsuranceToken', address: insuranceAddr },
                    { name: 'PUCToken', address: pucAddr },
                    { name: 'LoanContract', address: loanAddr }
                ];

                for (const contract of contracts) {
                    await tx.indexerState.upsert({
                        where: { contractName: contract.name },
                        update: {}, // Keep existing config if already set
                        create: {
                            contractName: contract.name,
                            contractAddress: contract.address,
                            lastBlock: blockNum
                        }
                    });
                }
                console.log('✅ Indexer State Initialized.');
            } else {
                console.log('\n⚠️ Skipping Indexer State seeding. (DEPLOYMENT_BLOCK not provided in env)');
            }

            console.log('\n✅ Seed completed successfully!');
            console.log('----------------------------------------------------');
            console.log(`Entity Code : ${rootEntity.code}`);
            console.log(`Admin Email : ${superAdmin.email}`);
            console.log(`Wallet      : ${rootEntity.walletAddress}`);
            console.log(`Chain ID    : ${chainId}`);
            console.log('----------------------------------------------------');
        });
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
