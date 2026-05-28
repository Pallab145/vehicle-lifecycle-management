import { WebSocketProvider, Contract, type EventLog } from 'ethers';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { SyncStatus, TxActionType } from '@/generated/prisma/client';
import Redis from 'ioredis';
import crypto from 'crypto';

import DvpAbi from '@/abi/DigitalVehiclePassport.json';
import OwnershipAbi from '@/abi/OwnershipToken.json';
import ChallanAbi from '@/abi/ChallanContract.json';
import InsuranceAbi from '@/abi/InsuranceToken.json';
import PucAbi from '@/abi/PUCToken.json';
import LoanAbi from '@/abi/LoanContract.json';
import type { NotificationEvent } from '../notification/notification.types';
import { RedisKeys } from '@/config/redis.keys';

export class IndexerService {
    private provider: WebSocketProvider;
    private redisPublisher: Redis;
    private isRunning = false;
    private reconnectTimeout: NodeJS.Timeout | null = null;

    constructor() {
        this.redisPublisher = new Redis(env.REDIS_URL, {
            enableReadyCheck: false,
            maxRetriesPerRequest: null
        });
        this.provider = this.createProvider();
    }

    private createProvider(): WebSocketProvider {
        logger.info({ url: env.WS_RPC_URL }, 'Initializing Blockchain Indexer WebSocket connection...');
        const provider = new WebSocketProvider(env.WS_RPC_URL);

        provider.on('error', (err: Error) => {
            logger.error({ err }, 'Indexer WebSocket error. Attempting to reconnect...');
            this.handleReconnect();
        });

        return provider;
    }

    private handleReconnect() {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(async () => {
            try {
                this.provider = this.createProvider();
                await this.start();
                logger.info('Indexer successfully reconnected');
            } catch (err) {
                logger.error('Indexer reconnection failed. Retrying in 5 seconds...');
                this.handleReconnect();
            }
        }, 5000);
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;

        const dvpContract = new Contract(env.CONTRACT_DVP_ADDRESS, DvpAbi, this.provider);
        const ownershipContract = new Contract(env.CONTRACT_OWNERSHIP_ADDRESS, OwnershipAbi, this.provider);
        const challanContract = new Contract(env.CONTRACT_CHALLAN_ADDRESS, ChallanAbi, this.provider);
        const insuranceContract = new Contract(env.CONTRACT_INSURANCE_ADDRESS, InsuranceAbi, this.provider);
        const pucContract = new Contract(env.CONTRACT_PUC_ADDRESS, PucAbi, this.provider);
        const loanContract = new Contract(env.CONTRACT_LOAN_ADDRESS, LoanAbi, this.provider);

        // Define event registries for clean scalability
        const REGISTRATION_EVENTS = [
            { contract: dvpContract, event: 'MfgReg', type: 'MFG_REG' },
            { contract: dvpContract, event: 'ScrapReg', type: 'SCRAP_REG' },
            { contract: ownershipContract, event: 'RTOReg', type: 'RTO_REG' },
            { contract: challanContract, event: 'PoliceReg', type: 'POLICE_REG' },
            { contract: insuranceContract, event: 'InsReg', type: 'INS_REG' },
            { contract: pucContract, event: 'CenterReg', type: 'PUC_CENTER_REG' },
            { contract: loanContract, event: 'BankReg', type: 'BANK_REG' }
        ] as const;

        const TOGGLE_EVENTS = [
            { contract: dvpContract, event: 'MfgToggled', type: 'MFG_TOGGLED' },
            { contract: dvpContract, event: 'ScrapToggled', type: 'SCRAP_TOGGLED' },
            { contract: ownershipContract, event: 'RTOStatusToggled', type: 'RTO_TOGGLED' },
            { contract: challanContract, event: 'PoliceStatusToggled', type: 'POLICE_TOGGLED' },
            { contract: insuranceContract, event: 'InsStatusToggled', type: 'INS_TOGGLED' },
            { contract: pucContract, event: 'CenterStatusToggled', type: 'PUC_CENTER_TOGGLED' },
            { contract: loanContract, event: 'BankStatusToggled', type: 'BANK_TOGGLED' }
        ] as const;

        // Automatically bind all registration events
        REGISTRATION_EVENTS.forEach(({ contract, event, type }) => {
            contract.on(event, (id, code, _auth, ev) => this.handleRegistration(type, id, code, ev));
        });

        // Automatically bind all toggle events
        TOGGLE_EVENTS.forEach(({ contract, event, type }) => {
            contract.on(event, (id, active, ev) => this.handleToggle(type, id, active, ev));
        });

        logger.info('Blockchain Indexer is now listening for events');
    }

    private async handleRegistration(type: string, onChainId: bigint, code: string, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ type, code, txHash, onChainId: Number(onChainId) }, 'Indexer detected registration event');

            // Find entity by code
            const entity = await prisma.b2BEntity.findUnique({
                where: { code },
                select: { id: true, walletAddress: true }
            });

            if (!entity) {
                logger.warn({ code }, 'Entity registered on-chain but not found in local DB');
                return;
            }

            // Update entity to set onChainId
            await prisma.b2BEntity.update({
                where: { id: entity.id },
                data: {
                    onChainId: Number(onChainId)
                }
            });

            // Outbox Pattern: Update or create the transaction record
            await prisma.blockchainTransaction.upsert({
                where: { txHash },
                create: {
                    txHash,
                    actionType: TxActionType.B2B_ENTITY_REGISTER,
                    b2bEntityId: entity.id,
                    status: SyncStatus.MINED,
                    blockNumber: event.blockNumber
                },
                update: {
                    status: SyncStatus.MINED,
                    blockNumber: event.blockNumber
                }
            });

            // Prepare notification payload
            const dynamicKey = `${type.split('_')[0].toLowerCase()}Id`;
            const notification = {
                type: type as NotificationEvent['type'],
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                data: {
                    [dynamicKey]: String(onChainId),
                    code,
                    authWallet: entity.walletAddress,
                    txHash
                }
            } as unknown as NotificationEvent;

            this.broadcastToStakeholders(entity.id, notification);

        } catch (err) {
            logger.error({ err, type, code }, 'Indexer failed to process registration event');
        }
    }

    private async handleToggle(type: string, onChainId: bigint, active: boolean, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ type, onChainId: Number(onChainId), active, txHash }, 'Indexer detected toggle event');

            // Find entity by onChainId
            const entity = await prisma.b2BEntity.findFirst({
                where: { onChainId: Number(onChainId) },
                select: { id: true }
            });

            if (!entity) {
                logger.warn({ onChainId: Number(onChainId) }, 'Entity toggled on-chain but not found in local DB');
                return;
            }

            // Update active status locally
            await prisma.b2BEntity.update({
                where: { id: entity.id },
                data: { isActive: active }
            });

            // Outbox Pattern: Update or create the transaction record
            await prisma.blockchainTransaction.upsert({
                where: { txHash },
                create: {
                    txHash,
                    actionType: TxActionType.B2B_ENTITY_TOGGLE,
                    b2bEntityId: entity.id,
                    status: SyncStatus.MINED,
                    blockNumber: event.blockNumber
                },
                update: {
                    status: SyncStatus.MINED,
                    blockNumber: event.blockNumber
                }
            });

            // Prepare notification payload
            const dynamicKey = `${type.split('_')[0].toLowerCase()}Id`;
            const notification = {
                type: type as NotificationEvent['type'],
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                data: {
                    [dynamicKey]: String(onChainId),
                    active,
                    txHash
                }
            } as unknown as NotificationEvent;

            this.broadcastToStakeholders(entity.id, notification);

        } catch (err) {
            logger.error({ err, type }, 'Indexer failed to process toggle event');
        }
    }

    private broadcastToStakeholders(entityId: string, notification: NotificationEvent) {
        const payloadStr = JSON.stringify(notification);
        
        // Broadcast a single message to the Institution's global channel
        // O(1) complexity - Reaches all connected staff members effortlessly
        this.redisPublisher.publish(RedisKeys.NOTIFICATION_CHANNEL('entity', entityId), payloadStr);
    }
}

// Export singleton instance
export const indexerService = new IndexerService();
