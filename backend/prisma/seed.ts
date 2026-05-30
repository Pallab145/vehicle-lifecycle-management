import 'dotenv/config';
import { EntityType, MemberRole, Prisma } from '../src/generated/prisma/client';
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
    const govAdminPrivateKey = process.env.GOV_ADMIN_PRIVATE_KEY; // Used for the relayer/MORTH-HQ signing key
    const govAdminWallet = process.env.GOV_ADMIN_WALLET_ADDRESS;
    const masterAdminKey = process.env.MASTER_ADMIN_KEY; // Must match the one in env.ts
    const chainId = process.env.CHAIN_ID;
    const admin1Wallet = process.env.MORTH_ADMIN_1_WALLET;
    const admin2Wallet = process.env.MORTH_ADMIN_2_WALLET;
    const admin3Wallet = process.env.MORTH_ADMIN_3_WALLET;
    const admin1Email = process.env.MORTH_ADMIN_1_EMAIL;
    const admin2Email = process.env.MORTH_ADMIN_2_EMAIL;
    const admin3Email = process.env.MORTH_ADMIN_3_EMAIL;

    if (!govAdminPrivateKey || !govAdminWallet || !masterAdminKey || !chainId || !admin1Wallet || !admin2Wallet || !admin3Wallet || !admin1Email || !admin2Email || !admin3Email) {
        console.error('❌ ERROR: Missing required environment variables for seeding.');
        console.error('Please ensure the following are set in your environment (e.g., .env file):');
        console.error('  - GOV_ADMIN_PRIVATE_KEY');
        console.error('  - GOV_ADMIN_WALLET_ADDRESS');
        console.error('  - MASTER_ADMIN_KEY');
        console.error('  - CHAIN_ID');
        console.error('  - MORTH_ADMIN_1_WALLET');
        console.error('  - MORTH_ADMIN_2_WALLET');
        console.error('  - MORTH_ADMIN_3_WALLET');
        console.error('  - MORTH_ADMIN_1_EMAIL');
        console.error('  - MORTH_ADMIN_2_EMAIL');
        console.error('  - MORTH_ADMIN_3_EMAIL');
        process.exit(1);
    }

    if (govAdminPrivateKey.length !== 66 || !govAdminPrivateKey.startsWith('0x')) {
        console.error('❌ ERROR: GOV_ADMIN_PRIVATE_KEY must be a valid 66-character Ethereum private key (starting with 0x).');
        process.exit(1);
    }
    
    if (govAdminWallet.length !== 42 || !govAdminWallet.startsWith('0x')) {
        console.error('❌ ERROR: GOV_ADMIN_WALLET_ADDRESS must be a valid 42-character Ethereum address (starting with 0x).');
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
                    walletAddress: govAdminWallet, // The EOA wallet that pays gas/submits txs (Relayer)
                    onChainId: 0,
                }
            });

            console.log(`👤 Creating 3 Gnosis Safe Admin Owners...`);
            
            // The 3 owners of the deployed Gnosis Safe
            const safeOwners = [
                { email: admin1Email, name: 'MoRTH Admin 1', walletAddress: admin1Wallet, password: '' },
                { email: admin2Email, name: 'MoRTH Admin 2', walletAddress: admin2Wallet, password: '' },
                { email: admin3Email, name: 'MoRTH Admin 3', walletAddress: admin3Wallet, password: '' },
            ];

            const createdAdmins = [];
            for (const owner of safeOwners) {
                // Generate a unique password for each admin
                owner.password = crypto.randomBytes(8).toString('hex');
                const passwordHash = await bcrypt.hash(owner.password, 10);

                const admin = await tx.b2BMember.create({
                    data: {
                        entityId: rootEntity.id,
                        email: owner.email,
                        name: owner.name,
                        passwordHash: passwordHash,
                        role: MemberRole.OWNER,
                        isActive: true,
                        walletAddress: owner.walletAddress,
                    }
                });
                createdAdmins.push(admin);
                console.log(`   ✅ Created ${owner.name} (${owner.email}) - ${owner.walletAddress}`);
            }

            console.log('🔐 Encrypting and Storing Root Relayer Signing Key...');
            // This is the relayer key used to submit the execTransaction
            const encryptedPrivateKey = encryptAES256GCM(govAdminPrivateKey, masterAdminKey);
            await tx.entitySigningKey.create({
                data: {
                    entityId: rootEntity.id,
                    encryptedPrivateKey: encryptedPrivateKey,
                    publicKey: govAdminWallet, // Use the provided gov admin wallet instead of "RELAYER_KEY"
                    algorithm: 'AES-256-GCM',
                    createdById: createdAdmins[0].id,
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
                const safeAddr = process.env.MORTH_GNOSIS_SAFE_ADDRESS;

                if (!dvpAddr || !ownershipAddr || !challanAddr || !insuranceAddr || !pucAddr || !loanAddr || !safeAddr) {
                    throw new Error('Missing contract address env variables (CONTRACT_DVP_ADDRESS, MORTH_GNOSIS_SAFE_ADDRESS, etc.) required for IndexerState seeding.');
                }

                const contracts = [
                    { name: 'DigitalVehiclePassport', address: dvpAddr },
                    { name: 'OwnershipToken', address: ownershipAddr },
                    { name: 'ChallanContract', address: challanAddr },
                    { name: 'InsuranceToken', address: insuranceAddr },
                    { name: 'PUCToken', address: pucAddr },
                    { name: 'LoanContract', address: loanAddr },
                    // GnosisSafe — tracked for ExecutionSuccess / ExecutionFailure events
                    { name: 'GnosisSafe', address: safeAddr }
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
            console.log(`Entity Type : ${rootEntity.type}`);
            console.log(`Safe Address: ${rootEntity.walletAddress}`);
            console.log(`Chain ID    : ${chainId}`);
            console.log('Admins      :');
            createdAdmins.forEach((a, i) => {
                console.log(`  ${i+1}. ${a.email} (${a.walletAddress})`);
                console.log(`     🔑 Password: ${safeOwners[i].password}`);
            });
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
