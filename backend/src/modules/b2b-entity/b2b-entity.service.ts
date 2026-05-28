import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Wallet } from 'ethers';
import createError from 'http-errors';
import { MemberRole, EntityType, SyncStatus, TxActionType } from '@/generated/prisma/client';
import { b2bEntityRepository } from './b2b-entity.repository';
import { encryptAES256GCM } from '@/lib/crypto';
import { emailService } from '../email/email.service';
import type { CreateB2BEntityInput, ListB2BEntityInput, ToggleB2BEntityInput } from './b2b-entity.schema';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { sanitizeResponseData } from '@/utils/sanitizer';
import { BlockchainManager } from '@/lib/blockchain.manager';
import { parseEthersError } from '@/utils/blockchainErrorHandler';


export const b2bEntityService = {
    /**
     * Business logic for dynamically creating a new institutional B2B Entity.
     */
    async createEntity(input: CreateB2BEntityInput, creatorId: string) {
        // 1. Enforce unique constraints
        const existingCode = await b2bEntityRepository.findByCode(input.code);
        if (existingCode) {
            throw createError(409, `A B2B Entity with code "${input.code}" already exists`);
        }

        const existingEmail = await b2bEntityRepository.findMemberByEmail(input.adminMember.email);
        if (existingEmail) {
            throw createError(409, `An administrative member with email "${input.adminMember.email}" is already registered`);
        }

        // 2. Generate institutional Ethereum wallet
        logger.info({ type: input.type, code: input.code }, 'Generating secure Ethereum wallet for new B2B Entity...');
        const wallet = Wallet.createRandom();
        
        // 3. Encrypt the private key securely using its dedicated role-based Master Key
        const encryptedPrivateKey = encryptAES256GCM(wallet.privateKey, input.type);

        // 4. Generate user-friendly temporary password
        const tempPassword = crypto.randomBytes(6).toString('hex'); // 12 characters alphanumeric
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        // 5. Persist everything atomically inside a database transaction
        const result = await b2bEntityRepository.createEntityWithAdmin({
            entity: {
                type: input.type,
                code: input.code,
                name: input.name,
                walletAddress: wallet.address,
                registeredByMemberId: creatorId,
            },
            signingKey: {
                encryptedPrivateKey,
                publicKey: wallet.publicKey,
                createdById: creatorId, // Super admin who triggered this API
            },
            adminMember: {
                name: input.adminMember.name,
                email: input.adminMember.email,
                passwordHash,
                role: MemberRole.OWNER,
            }
        });

        // 6. Submit registration to the blockchain using Government Admin credentials
        let txHashStr: string | null = null;
        try {
            txHashStr = await BlockchainManager.submitAdminTx(input.type, 'REGISTER', [input.code, wallet.address]);
            
            // Outbox Pattern: Create BlockchainTransaction
            await prisma.blockchainTransaction.create({
                data: {
                    txHash: txHashStr,
                    actionType: TxActionType.B2B_ENTITY_REGISTER,
                    b2bEntityId: result.entity.id,
                    status: SyncStatus.PENDING
                }
            });

        } catch (blockchainError: unknown) {
            const parsedError = parseEthersError(blockchainError);
            logger.error({ err: parsedError, code: input.code }, 'Blockchain registration simulation failed. Rolling back database transaction...');
            
            // Saga Pattern: Roll back the local database transaction because the blockchain rejected it synchronously.
            // This prevents "Email already exists" errors when the admin tries to fix their input and resubmit.
            await prisma.b2BEntity.delete({ 
                where: { id: result.entity.id } 
            });

            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // 7. Asynchronously send welcome email to the new institutional member
        try {
            await emailService.sendWelcomeInstitutionalEmail(
                result.adminMember.email,
                result.adminMember.name,
                result.entity.name,
                result.adminMember.role,
                tempPassword
            );
            logger.info({ email: result.adminMember.email }, 'Asynchronously enqueued B2B welcome email');
        } catch (err) {
            // Log warning but don't fail transaction as entity was successfully created
            logger.error({ err, email: result.adminMember.email }, 'Failed to enqueue B2B welcome email');
        }

        // 8. Format clean response (Strictly omitting sensitive database IDs or hashes)
        return sanitizeResponseData({
            entity: {
                id: result.entity.id,
                type: result.entity.type,
                code: result.entity.code,
                name: result.entity.name,
                walletAddress: result.entity.walletAddress,
                onChainId: result.entity.onChainId,
                syncStatus: SyncStatus.PENDING,
                txHash: txHashStr,
                isActive: result.entity.isActive,
                createdAt: result.entity.createdAt,
            },
            adminMember: {
                id: result.adminMember.id,
                name: result.adminMember.name,
                email: result.adminMember.email,
                role: result.adminMember.role,
                isActive: result.adminMember.isActive,
            }
        });
    },

    /**
     * Lists paginated B2B Entities.
     */
    async listEntities(input: ListB2BEntityInput) {
        const result = await b2bEntityRepository.listEntities(input);
        return sanitizeResponseData(result);
    },

    /**
     * Toggles the active status of a B2B Entity both on-chain and off-chain.
     */
    async toggleEntityStatus(id: string, input: ToggleB2BEntityInput) {
        // 1. Fetch entity
        const entity = await prisma.b2BEntity.findUnique({ where: { id } });
        if (!entity) throw createError(404, 'B2B Entity not found');

        // 2. Optimization: skip if no change
        if (entity.isActive === input.isActive) {
            return sanitizeResponseData(entity);
        }

        if (entity.type === EntityType.GOVERNMENT) {
            throw createError(403, 'Cannot toggle the root Government entity');
        }

        // 3. Submit toggle to blockchain using Government Admin credentials
        try {
            const txHash = await BlockchainManager.submitAdminTx(entity.type, 'TOGGLE', [entity.code]);

            // 4. Outbox Pattern: Track the toggle transaction
            await prisma.blockchainTransaction.create({
                data: {
                    txHash,
                    actionType: TxActionType.B2B_ENTITY_TOGGLE,
                    b2bEntityId: entity.id,
                    status: SyncStatus.PENDING
                }
            });

            return {
                entityId: entity.id,
                requestedStatus: input.isActive,
                txHash,
                message: 'Toggle transaction submitted to mempool. Status will update once mined by the indexer.'
            };

        } catch (blockchainError: unknown) {
            const parsedError = parseEthersError(blockchainError);
            logger.error({ err: parsedError, code: entity.code }, 'Blockchain toggle failed.');
            throw createError(400, `On-chain toggle failed: ${parsedError}`);
        }
    },

    /**
     * Retrieves the details of a single B2B Entity.
     */
    async getEntityById(id: string) {
        const entity = await b2bEntityRepository.findById(id);
        if (!entity) {
            throw createError(404, 'B2B Entity not found');
        }
        return sanitizeResponseData(entity);
    },

    /**
     * Retries the blockchain registration for an entity whose syncStatus is FAILED.
     */
    async retryEntityRegistration(id: string) {
        const entity = await prisma.b2BEntity.findUnique({
            where: { id },
            include: {
                transactions: {
                    where: { actionType: TxActionType.B2B_ENTITY_REGISTER },
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        });
        
        if (!entity) {
            throw createError(404, 'B2B Entity not found');
        }

        const lastRegTx = entity.transactions[0];
        if (!lastRegTx || lastRegTx.status !== SyncStatus.FAILED) {
            throw createError(400, `Cannot retry registration. Current sync status is ${lastRegTx?.status || 'UNKNOWN'}. Only FAILED entities can be retried.`);
        }

        try {
            const txHash = await BlockchainManager.submitAdminTx(entity.type, 'REGISTER', [entity.code, entity.walletAddress]);

            await prisma.blockchainTransaction.create({
                data: {
                    txHash,
                    actionType: TxActionType.B2B_ENTITY_REGISTER,
                    b2bEntityId: id,
                    status: SyncStatus.PENDING
                }
            });

            return sanitizeResponseData({
                txHash,
                message: 'Registration retry transaction submitted to mempool successfully.',
                entity: {
                    ...entity,
                    syncStatus: SyncStatus.PENDING
                }
            });

        } catch (blockchainError: unknown) {
            const parsedError = parseEthersError(blockchainError);
            logger.error({ err: parsedError, code: entity.code }, 'Blockchain registration retry failed.');
            throw createError(400, `On-chain registration retry failed: ${parsedError}`);
        }
    }
};
