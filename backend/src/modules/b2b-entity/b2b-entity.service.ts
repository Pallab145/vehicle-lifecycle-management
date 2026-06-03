import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Wallet, Interface, type InterfaceAbi } from 'ethers';
import createError from 'http-errors';
import { MemberRole, EntityType, TxActionType } from '@/generated/prisma/client';
import { b2bEntityRepository } from './b2b-entity.repository';
import { encryptAES256GCM } from '@/lib/crypto';
import { emailService } from '../email/email.service';
import type { CreateB2BEntityInput, ListB2BEntityInput, ToggleB2BEntityInput } from './b2b-entity.schema';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { sanitizeResponseData } from '@/utils/sanitizer';
import { adminService } from '@/modules/admin/admin.service';
import { env } from '@/config/env';

// Import ABIs for calldata encoding
import DvpAbi from '@/abi/DigitalVehiclePassport.json';
import OwnershipAbi from '@/abi/OwnershipToken.json';
import ChallanAbi from '@/abi/ChallanContract.json';
import InsuranceAbi from '@/abi/InsuranceToken.json';
import PucAbi from '@/abi/PUCToken.json';
import LoanAbi from '@/abi/LoanContract.json';

// ─────────────────────────────────────────────────────────────────────────────
// Contract configuration: maps EntityType → { targetContractAddress, abi,
//   registerFn, toggleFn }.
//
// This is the ONLY place where function names and contract addresses are kept.
// All encoding is done via ethers Interface to guarantee ABI-correctness.
// ─────────────────────────────────────────────────────────────────────────────

interface GovContractConfig {
    /** On-chain address of the target contract (e.g. OwnershipToken for RTO) */
    address: string;
    abi: InterfaceAbi;
    /**
     * Solidity function signature for registration.
     * All reg functions take (string code, address auth).
     */
    registerFn: string;
    /**
     * Solidity function signature for toggle.
     * All toggle functions take (string code).
     */
    toggleFn: string;
}

const GOV_CONTRACT_MAP: Partial<Record<EntityType, GovContractConfig>> = {
    [EntityType.RTO]: {
        address: env.CONTRACT_OWNERSHIP_ADDRESS,
        abi: OwnershipAbi as InterfaceAbi,
        registerFn: 'regRTO',
        toggleFn:   'toggleRTOStatus',
    },
    [EntityType.MANUFACTURER]: {
        address: env.CONTRACT_DVP_ADDRESS,
        abi: DvpAbi as InterfaceAbi,
        registerFn: 'regMfg',
        toggleFn:   'toggleMfg',
    },
    [EntityType.SCRAP_CENTER]: {
        address: env.CONTRACT_DVP_ADDRESS,
        abi: DvpAbi as InterfaceAbi,
        registerFn: 'regScrap',
        toggleFn:   'toggleScrap',
    },
    [EntityType.POLICE]: {
        address: env.CONTRACT_CHALLAN_ADDRESS,
        abi: ChallanAbi as InterfaceAbi,
        registerFn: 'regPolice',
        toggleFn:   'togglePoliceStatus',
    },
    [EntityType.INSURANCE]: {
        address: env.CONTRACT_INSURANCE_ADDRESS,
        abi: InsuranceAbi as InterfaceAbi,
        registerFn: 'regIns',
        toggleFn:   'toggleInsurerStatus',
    },
    [EntityType.PUC_CENTER]: {
        address: env.CONTRACT_PUC_ADDRESS,
        abi: PucAbi as InterfaceAbi,
        registerFn: 'regCenter',
        toggleFn:   'toggleCenterStatus',
    },
    [EntityType.BANK]: {
        address: env.CONTRACT_LOAN_ADDRESS,
        abi: LoanAbi as InterfaceAbi,
        registerFn: 'regBank',
        toggleFn:   'toggleBankStatus',
    },
};

/**
 * ABI-encodes the registration calldata for the given entity type.
 *  regXxx(string code, address auth)
 */
function encodeRegisterCalldata(config: GovContractConfig, code: string, walletAddress: string): string {
    const iface = new Interface(config.abi);
    return iface.encodeFunctionData(config.registerFn, [code, walletAddress]);
}

/**
 * ABI-encodes the toggle calldata for the given entity type.
 *  toggleXxx(string code)
 */
function encodeToggleCalldata(config: GovContractConfig, code: string): string {
    const iface = new Interface(config.abi);
    return iface.encodeFunctionData(config.toggleFn, [code]);
}

// ─────────────────────────────────────────────────────────────────────────────

export const b2bEntityService = {
    /**
     * Business logic for dynamically creating a new institutional B2B Entity.
     *
     * Flow (Gnosis Safe Multisig):
     *   1. Validate uniqueness constraints.
     *   2. Generate an institutional Ethereum wallet and encrypt its private key.
     *   3. Atomically persist B2BEntity + SigningKey + admin B2BMember to DB.
     *   4. Encode regXxx(code, walletAddress) as Safe calldata.
     *   5. Create a SafeProposal — GOVERNMENT owners must now sign via their
     *      Ledger/MetaMask in the admin dashboard.
     *   6. Return entity + proposal details so the caller knows what to sign.
     *
     * The entity lives in DB but is NOT yet on-chain until the proposal is
     * signed by ≥ threshold owners and the BullMQ worker submits execTransaction.
     * The indexer then catches MfgReg / RTOReg / etc. and writes back onChainId.
     */
    async createEntity(input: CreateB2BEntityInput, creatorId: string) {
        // ── 1. Uniqueness checks ───────────────────────────────────────────────
        const existingCode = await b2bEntityRepository.findByCode(input.code);
        if (existingCode) {
            throw createError(409, `A B2B Entity with code "${input.code}" already exists`);
        }

        const existingEmail = await b2bEntityRepository.findMemberByEmail(input.adminMember.email);
        if (existingEmail) {
            throw createError(409, `An administrative member with email "${input.adminMember.email}" is already registered`);
        }

        // Zod schema already rejects GOVERNMENT via refine() — this guard is a defence-in-depth belt-and-suspenders.
        const config = GOV_CONTRACT_MAP[input.type as EntityType];
        if (!config) {
            throw createError(400, `Entity type "${input.type}" is not supported for on-chain registration`);
        }

        // ── 2. Generate institutional wallet ──────────────────────────────────
        logger.info({ type: input.type, code: input.code }, 'Generating secure Ethereum wallet for new B2B Entity...');
        const wallet = Wallet.createRandom();

        // 3. Encrypt the private key securely using its dedicated role-based Master Key
        const encryptedPrivateKey = encryptAES256GCM(wallet.privateKey, input.type);

        // ── 4. Generate temporary password ────────────────────────────────────
        const tempPassword = 'password123'; // crypto.randomBytes(6).toString('hex'); // 12 hex chars
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        // ── 5. Persist entity + signing key + admin member atomically ─────────
        const result = await b2bEntityRepository.createEntityWithAdmin({
            entity: {
                type:                 input.type,
                code:                 input.code,
                name:                 input.name,
                walletAddress:        wallet.address,
                registeredByMemberId: creatorId,
            },
            signingKey: {
                encryptedPrivateKey,
                publicKey:   wallet.publicKey,
                createdById: creatorId,
            },
            adminMember: {
                name:         input.adminMember.name,
                email:        input.adminMember.email,
                passwordHash,
                role:         MemberRole.OWNER,
            }
        });

        // ── 6. Encode calldata & create Gnosis Safe proposal ──────────────────
        //   regXxx(string code, address auth)
        //   e.g. regBank("HDFC-001", "0xAbC...") on LoanContract
        const calldata = encodeRegisterCalldata(config, input.code, wallet.address);

        let proposal: Awaited<ReturnType<typeof adminService.createProposal>>;
        try {
            proposal = await adminService.createProposal({
                to:           config.address,
                calldata,
                value:        '0',
                description:  `Register ${input.type} entity "${input.name}" (${input.code}) on-chain via Gnosis Safe`,
                actionType:   TxActionType.B2B_ENTITY_REGISTER,
                proposedById: creatorId,
                targetEntityId: result.entity.id,
            });
        } catch (proposalError: unknown) {
            // Saga rollback — delete the DB entity so the admin can fix and retry.
            logger.error({ err: proposalError, code: input.code }, 'Failed to create SafeProposal. Rolling back B2BEntity creation...');
            await prisma.b2BEntity.delete({ where: { id: result.entity.id } }).catch(() => {});
            throw createError(502, `Failed to create governance proposal: ${proposalError instanceof Error ? proposalError.message : String(proposalError)}`);
        }

        logger.info({ proposalId: proposal.id, safeTxHash: proposal.safeTxHash, entityId: result.entity.id },
            'SafeProposal created for B2B entity registration. Awaiting owner signatures.');

        // ── 7. Send welcome email (best-effort, non-blocking) ─────────────────
        emailService.sendWelcomeInstitutionalEmail(
            result.adminMember.email,
            result.adminMember.name,
            result.entity.name,
            result.adminMember.role,
            tempPassword,
        ).catch((err) => {
            logger.error({ err, email: result.adminMember.email }, 'Failed to send B2B welcome email (non-fatal)');
        });

        // ── 8. Return entity + proposal details ───────────────────────────────
        return sanitizeResponseData({
            entity: {
                id:           result.entity.id,
                type:         result.entity.type,
                code:         result.entity.code,
                name:         result.entity.name,
                walletAddress: result.entity.walletAddress,
                onChainId:    result.entity.onChainId, // null until Safe executes
                isActive:     result.entity.isActive,
                createdAt:    result.entity.createdAt,
            },
            adminMember: {
                id:       result.adminMember.id,
                name:     result.adminMember.name,
                email:    result.adminMember.email,
                role:     result.adminMember.role,
                isActive: result.adminMember.isActive,
            },
            proposal: {
                id:          proposal.id,
                safeTxHash:  proposal.safeTxHash,
                status:      proposal.status,
                threshold:   proposal.threshold,
                description: proposal.description,
                message:     `Entity created in DB. Awaiting ${proposal.threshold} owner signature(s) in the governance dashboard to register on-chain.`,
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
     * Retrieves the details of a single B2B Entity.
     */
    async getEntityById(id: string) {
        const entity = await b2bEntityRepository.findById(id);
        if (!entity) throw createError(404, 'B2B Entity not found');
        return sanitizeResponseData(entity);
    },

    /**
     * Toggles the active status of a B2B Entity via Gnosis Safe multisig.
     *
     * Flow:
     *   1. Validate entity exists, is not GOVERNMENT, and has a valid onChainId.
     *   2. Skip if no actual change.
     *   3. Encode toggleXxx(code) calldata.
     *   4. Create a SafeProposal for GOVERNMENT owners to sign.
     *
     * The toggle is NOT applied to the DB immediately — it is applied by the
     * indexer when it catches the MfgToggled / RTOStatusToggled / etc. event.
     */
    async toggleEntityStatus(id: string, input: ToggleB2BEntityInput, requesterId: string) {
        // ── 1. Fetch & validate entity ────────────────────────────────────────
        const entity = await prisma.b2BEntity.findUnique({ where: { id } });
        if (!entity) throw createError(404, 'B2B Entity not found');

        if (entity.type === EntityType.GOVERNMENT) {
            throw createError(403, 'Cannot toggle the root Government entity');
        }

        if (entity.onChainId === null) {
            throw createError(409, 'Entity is not yet registered on-chain. Its registration proposal must be executed first.');
        }

        // ── 2. Skip if no change ──────────────────────────────────────────────
        if (entity.isActive === input.isActive) {
            return sanitizeResponseData({
                entityId:  entity.id,
                isActive:  entity.isActive,
                message:   `Entity is already ${entity.isActive ? 'active' : 'inactive'}. No action taken.`,
            });
        }

        const config = GOV_CONTRACT_MAP[entity.type];
        if (!config) {
            throw createError(400, `Entity type "${entity.type}" is not supported for on-chain toggle`);
        }

        // ── 3. Encode calldata: toggleXxx(string code) ───────────────────────
        const calldata = encodeToggleCalldata(config, entity.code);
        const action   = input.isActive ? 'activate' : 'deactivate';

        // ── 4. Create SafeProposal ────────────────────────────────────────────
        let proposal: Awaited<ReturnType<typeof adminService.createProposal>>;
        try {
            proposal = await adminService.createProposal({
                to:           config.address,
                calldata,
                value:        '0',
                description:  `${action.charAt(0).toUpperCase() + action.slice(1)} ${entity.type} entity "${entity.name}" (${entity.code}) via Gnosis Safe`,
                actionType:   TxActionType.B2B_ENTITY_TOGGLE,
                proposedById: requesterId,
                targetEntityId: entity.id,
            });
        } catch (proposalError: unknown) {
            logger.error({ err: proposalError, code: entity.code }, 'Failed to create toggle SafeProposal.');
            throw createError(502, `Failed to create governance proposal: ${proposalError instanceof Error ? proposalError.message : String(proposalError)}`);
        }

        logger.info({ proposalId: proposal.id, safeTxHash: proposal.safeTxHash, entityId: id, action },
            'SafeProposal created for B2B entity toggle. Awaiting owner signatures.');

        return {
            entityId:        entity.id,
            requestedStatus: input.isActive,
            proposal: {
                id:          proposal.id,
                safeTxHash:  proposal.safeTxHash,
                status:      proposal.status,
                threshold:   proposal.threshold,
                description: proposal.description,
            },
            message: `Toggle proposal created. Awaiting ${proposal.threshold} owner signature(s) in the governance dashboard.`,
        };
    },

    /**
     * Retries on-chain registration for an entity whose previous proposal was
     * CANCELLED or EXECUTION_FAILED, by creating a fresh SafeProposal.
     *
     * Precondition: the entity must NOT have a non-null onChainId (i.e. it was
     * never successfully registered on-chain).
     */
    async retryEntityRegistration(id: string, requesterId: string) {
        const entity = await prisma.b2BEntity.findUnique({ where: { id } });
        if (!entity) throw createError(404, 'B2B Entity not found');

        if (entity.onChainId !== null) {
            throw createError(400, 'Cannot retry registration for an entity that is already registered on-chain.');
        }

        if (entity.type === EntityType.GOVERNMENT) {
            throw createError(403, 'Cannot retry registration of the root Government entity');
        }

        const config = GOV_CONTRACT_MAP[entity.type];
        if (!config) {
            throw createError(400, `Entity type "${entity.type}" is not supported for on-chain registration`);
        }

        // Guard: check there's no already-active PENDING or THRESHOLD_MET proposal
        const activeProposal = await prisma.safeProposal.findFirst({
            where: {
                targetEntityId: id,
                actionType:     TxActionType.B2B_ENTITY_REGISTER,
                status:         { in: ['PENDING', 'THRESHOLD_MET'] },
            }
        });

        if (activeProposal) {
            throw createError(409, `An active registration proposal (${activeProposal.id}) already exists for this entity. Cancel it first or wait for execution.`);
        }

        // Encode calldata: regXxx(string code, address auth)
        const calldata = encodeRegisterCalldata(config, entity.code, entity.walletAddress);

        let proposal: Awaited<ReturnType<typeof adminService.createProposal>>;
        try {
            proposal = await adminService.createProposal({
                to:           config.address,
                calldata,
                value:        '0',
                description:  `[RETRY] Register ${entity.type} entity "${entity.name}" (${entity.code}) on-chain via Gnosis Safe`,
                actionType:   TxActionType.B2B_ENTITY_REGISTER,
                proposedById: requesterId,
                targetEntityId: entity.id,
            });
        } catch (proposalError: unknown) {
            logger.error({ err: proposalError, code: entity.code }, 'Failed to create retry SafeProposal.');
            throw createError(502, `Failed to create retry governance proposal: ${proposalError instanceof Error ? proposalError.message : String(proposalError)}`);
        }

        logger.info({ proposalId: proposal.id, safeTxHash: proposal.safeTxHash, entityId: id },
            'Retry SafeProposal created. Awaiting owner signatures.');

        return sanitizeResponseData({
            message:  'Retry proposal created successfully. Awaiting owner signatures in the governance dashboard.',
            proposal: {
                id:          proposal.id,
                safeTxHash:  proposal.safeTxHash,
                status:      proposal.status,
                threshold:   proposal.threshold,
                description: proposal.description,
            },
            entity: {
                id:           entity.id,
                code:         entity.code,
                name:         entity.name,
                type:         entity.type,
                walletAddress: entity.walletAddress,
                onChainId:    entity.onChainId,
            },
        });
    },
};
