import { Wallet, JsonRpcProvider, Contract, type InterfaceAbi } from 'ethers';
import { EntityType } from '@/generated/prisma/client';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { decryptAES256GCM } from '@/lib/crypto';

// Import ABIs
import DvpAbi from '@/abi/DigitalVehiclePassport.json';
import OwnershipAbi from '@/abi/OwnershipToken.json';
import ChallanAbi from '@/abi/ChallanContract.json';
import InsuranceAbi from '@/abi/InsuranceToken.json';
import PucAbi from '@/abi/PUCToken.json';
import LoanAbi from '@/abi/LoanContract.json';

export type GovAction = 'REGISTER' | 'TOGGLE' | 'ADMIN_CANCEL_CHALLAN';

export type EntityAction =
    // DVP (Manufacturer & Scrap Center)
    | 'manufacture'
    | 'assignToDealer'
    | 'scrapVehicle'
    // Ownership (Dealer & RTO)
    | 'register'
    | 'initTransfer'
    | 'cancelTransfer'
    | 'acceptTransfer'
    | 'approveTransfer'
    | 'issueTradeCert'
    | 'revokeTradeCert'
    // Challan (Police & Citizen/Dealer)
    | 'issueChallan'
    | 'payChallan'
    | 'cancelChallan'
    // Insurance (Insurance Co)
    | 'issuePolicy'
    | 'markExpired'
    | 'fileClaim'
    // PUC (PUC Center)
    | 'issuePUC'
    // Loan (Bank)
    | 'registerLoan'
    | 'issueNOC';

interface ContractConfig {
    address: string;
    abi: InterfaceAbi;
    functions: Partial<Record<GovAction, string>>;
}

const ContractMap: Partial<Record<EntityType, ContractConfig>> = {
    [EntityType.RTO]: {
        address: env.CONTRACT_OWNERSHIP_ADDRESS,
        abi: OwnershipAbi as InterfaceAbi,
        functions: { REGISTER: 'regRTO', TOGGLE: 'toggleRTOStatus' }
    },
    [EntityType.MANUFACTURER]: {
        address: env.CONTRACT_DVP_ADDRESS,
        abi: DvpAbi as InterfaceAbi,
        functions: { REGISTER: 'regMfg', TOGGLE: 'toggleMfg' }
    },
    [EntityType.POLICE]: {
        address: env.CONTRACT_CHALLAN_ADDRESS,
        abi: ChallanAbi as InterfaceAbi,
        functions: { REGISTER: 'regPolice', TOGGLE: 'togglePoliceStatus', ADMIN_CANCEL_CHALLAN: 'adminCancelChallan' }
    },
    [EntityType.INSURANCE]: {
        address: env.CONTRACT_INSURANCE_ADDRESS,
        abi: InsuranceAbi as InterfaceAbi,
        functions: { REGISTER: 'regIns', TOGGLE: 'toggleInsurerStatus' }
    },
    [EntityType.PUC_CENTER]: {
        address: env.CONTRACT_PUC_ADDRESS,
        abi: PucAbi as InterfaceAbi,
        functions: { REGISTER: 'regCenter', TOGGLE: 'toggleCenterStatus' }
    },
    [EntityType.SCRAP_CENTER]: {
        address: env.CONTRACT_DVP_ADDRESS,
        abi: DvpAbi as InterfaceAbi,
        functions: { REGISTER: 'regScrap', TOGGLE: 'toggleScrap' }
    },
    [EntityType.BANK]: {
        address: env.CONTRACT_LOAN_ADDRESS,
        abi: LoanAbi as InterfaceAbi,
        functions: { REGISTER: 'regBank', TOGGLE: 'toggleBankStatus' }
    }
};

export class BlockchainManager {
    /**
     * Dynamically submits an administrative transaction to the blockchain.
     * Handles key decryption, ABI mapping, and contract execution automatically.
     */
    static async submitGovTx(
        targetEntityType: EntityType,
        action: GovAction,
        args: unknown[]
    ): Promise<string> {
        if (targetEntityType === EntityType.GOVERNMENT) {
            throw new Error('Cannot perform this blockchain action on the root Government entity');
        }

        const config = ContractMap[targetEntityType];
        if (!config) {
            throw new Error(`Unsupported B2B entity type for on-chain action: ${targetEntityType}`);
        }

        const functionName = config.functions[action];
        if (!functionName) {
            throw new Error(`Action '${action}' is not supported for entity type '${targetEntityType}'`);
        }

        logger.info({ action, targetEntityType, functionName }, 'Fetching Government Admin key for on-chain execution...');

        // Always execute B2B registration/toggle using the Government Master Key
        const govEntity = await prisma.b2BEntity.findUnique({
            where: { code: 'MORTH-HQ' },
            include: { signingKey: true }
        });

        if (!govEntity || !govEntity.signingKey) {
            throw new Error('Root Government Entity (MORTH-HQ) signing key not found in database.');
        }

        const govPrivateKey = decryptAES256GCM(govEntity.signingKey.encryptedPrivateKey, EntityType.GOVERNMENT);
        const provider = new JsonRpcProvider(env.RPC_URL);
        const govWallet = new Wallet(govPrivateKey, provider);

        logger.info({ functionName, contractAddress: config.address }, 'Invoking contract method...');

        const contract = new Contract(config.address, config.abi, govWallet);

        // Execute the smart contract function dynamically
        const tx = await contract[functionName](...args);

        logger.info({ txHash: tx.hash, action, targetEntityType }, `Transaction successfully submitted to mempool.`);
        return tx.hash;
    }

    /**
     * Dynamically submits a transaction on behalf of a specific B2B Entity (e.g. MFG, DEALER, POLICE).
     * Automatically retrieves and decrypts their unique generated wallet to sign the transaction.
     */
    static async submitEntityTx(
        entityId: string,
        targetEntityType: EntityType, // The contract we want to target (e.g. MANUFACTURER maps to DVP)
        action: EntityAction,
        args: unknown[]
    ): Promise<string> {
        // 1. Fetch the executing Entity and its private key
        const entity = await prisma.b2BEntity.findUnique({
            where: { id: entityId },
            include: { signingKey: true }
        });

        if (!entity || !entity.signingKey) {
            throw new Error(`Entity ${entityId} or its signing key not found. Cannot execute transaction.`);
        }
        if (!entity.isActive) {
            throw new Error(`Entity ${entityId} is inactive. Transaction blocked.`);
        }
        if (entity.onChainId === null) {
            throw new Error(`Entity ${entityId} is not yet mined on-chain (onChainId is null).`);
        }

        // 2. Fetch the contract config
        const config = ContractMap[targetEntityType];
        if (!config) {
            throw new Error(`Unsupported contract target: ${targetEntityType}`);
        }

        // 3. Decrypt the wallet
        logger.info({ entityId, action, targetEntityType }, 'Decrypting entity key for on-chain execution...');
        const privateKey = decryptAES256GCM(entity.signingKey.encryptedPrivateKey, entity.type);
        const provider = new JsonRpcProvider(env.RPC_URL);
        const wallet = new Wallet(privateKey, provider);

        // 4. Instantiate Contract and Execute
        const contract = new Contract(config.address, config.abi, wallet);

        logger.info({ functionName: action, contractAddress: config.address, executingWallet: wallet.address }, 'Invoking contract method...');

        // Ensure action is a valid function on the contract
        if (typeof contract[action] !== 'function') {
            throw new Error(`Function ${action} does not exist on the target contract.`);
        }

        const tx = await contract[action](...args);

        logger.info({ txHash: tx.hash, action, entityId }, `Entity transaction successfully submitted to mempool.`);
        return tx.hash;
    }
}
