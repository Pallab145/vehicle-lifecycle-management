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

export type BlockchainAction = 'REGISTER' | 'TOGGLE';

interface ContractConfig {
    address: string;
    abi: InterfaceAbi;
    functions: Record<BlockchainAction, string>;
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
        functions: { REGISTER: 'regPolice', TOGGLE: 'togglePoliceStatus' }
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
    static async submitAdminTx(
        entityType: EntityType,
        action: BlockchainAction,
        args: any[]
    ): Promise<string> {
        if (entityType === EntityType.GOVERNMENT) {
            throw new Error('Cannot perform this blockchain action on the root Government entity');
        }

        const config = ContractMap[entityType];
        if (!config) {
            throw new Error(`Unsupported B2B entity type for on-chain action: ${entityType}`);
        }

        const functionName = config.functions[action];
        if (!functionName) {
            throw new Error(`Action ${action} is not supported for ${entityType}`);
        }

        logger.info({ action, entityType, functionName }, 'Fetching Government Admin key for on-chain execution...');
        
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
        
        logger.info({ txHash: tx.hash, action, entityType }, `Transaction successfully submitted to mempool.`);
        return tx.hash;
    }
}
