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
    | 'issueNOC'
    | 'cancelPendingLoan'
    | 'refinanceLoan';

interface ContractConfig {
    address: string;
    abi: InterfaceAbi;
}

const ContractMap: Partial<Record<EntityType, ContractConfig>> = {
    [EntityType.RTO]: {
        address: env.CONTRACT_OWNERSHIP_ADDRESS,
        abi: OwnershipAbi as InterfaceAbi
    },
    [EntityType.MANUFACTURER]: {
        address: env.CONTRACT_DVP_ADDRESS,
        abi: DvpAbi as InterfaceAbi
    },
    [EntityType.POLICE]: {
        address: env.CONTRACT_CHALLAN_ADDRESS,
        abi: ChallanAbi as InterfaceAbi
    },
    [EntityType.INSURANCE]: {
        address: env.CONTRACT_INSURANCE_ADDRESS,
        abi: InsuranceAbi as InterfaceAbi
    },
    [EntityType.PUC_CENTER]: {
        address: env.CONTRACT_PUC_ADDRESS,
        abi: PucAbi as InterfaceAbi
    },
    [EntityType.SCRAP_CENTER]: {
        address: env.CONTRACT_DVP_ADDRESS,
        abi: DvpAbi as InterfaceAbi
    },
    [EntityType.BANK]: {
        address: env.CONTRACT_LOAN_ADDRESS,
        abi: LoanAbi as InterfaceAbi
    }
};

export class BlockchainManager {
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
