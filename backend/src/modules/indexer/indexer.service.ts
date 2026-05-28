import { WebSocketProvider, Contract, type EventLog } from 'ethers';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { SyncStatus, TxActionType, VehicleStatus, TransferStatus, ChallanStatus, InsuranceStatus, PucStatus, LoanStatus, RegistrationStatus } from '@/generated/prisma/client';
import crypto from 'crypto';
import { dispatcher } from '../notification/notification.dispatcher';

import DvpAbi from '@/abi/DigitalVehiclePassport.json';
import OwnershipAbi from '@/abi/OwnershipToken.json';
import ChallanAbi from '@/abi/ChallanContract.json';
import InsuranceAbi from '@/abi/InsuranceToken.json';
import PucAbi from '@/abi/PUCToken.json';
import LoanAbi from '@/abi/LoanContract.json';
import type { NotificationEvent } from '../notification/notification.types';
export class IndexerService {
    private provider: WebSocketProvider;
    private isRunning = false;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private reconnectAttempts = 0;
    private cursorTracker = new Map<string, number>();

    constructor() {
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
        const delay = Math.min(1000 * (2 ** this.reconnectAttempts), 30000); // Exponential backoff max 30s
        this.reconnectTimeout = setTimeout(async () => {
            try {
                this.reconnectAttempts++;
                this.provider = this.createProvider();
                await this.start();
                this.reconnectAttempts = 0;
                logger.info('Indexer successfully reconnected and caught up on historical events');
            } catch (err) {
                logger.error({ delay }, 'Indexer reconnection failed. Retrying...');
                this.handleReconnect();
            }
        }, delay);
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

        // --- CATCH UP PHASE ---
        try {
            logger.info('Starting Catch-Up Phase for historical blocks...');
            const latestBlock = await this.provider.getBlockNumber();
            
            await this.catchUpContract(dvpContract, 'DigitalVehiclePassport', latestBlock);
            await this.catchUpContract(ownershipContract, 'OwnershipToken', latestBlock);
            await this.catchUpContract(challanContract, 'ChallanContract', latestBlock);
            await this.catchUpContract(insuranceContract, 'InsuranceToken', latestBlock);
            await this.catchUpContract(pucContract, 'PUCToken', latestBlock);
            await this.catchUpContract(loanContract, 'LoanContract', latestBlock);
            
            logger.info('Catch-Up Phase Complete. Binding live WebSocket listeners...');
        } catch (err) {
            logger.error({ err }, 'Failed during Catch-Up Phase. Will retry...');
            this.isRunning = false;
            this.handleReconnect();
            return;
        }
        // --- END CATCH UP ---

        // Define event registries for clean scalability
        const REGISTRATION_EVENTS = [
            { contract: dvpContract, contractName: 'DigitalVehiclePassport', event: 'MfgReg', type: 'MFG_REG' },
            { contract: dvpContract, contractName: 'DigitalVehiclePassport', event: 'ScrapReg', type: 'SCRAP_REG' },
            { contract: ownershipContract, contractName: 'OwnershipToken', event: 'RTOReg', type: 'RTO_REG' },
            { contract: challanContract, contractName: 'ChallanContract', event: 'PoliceReg', type: 'POLICE_REG' },
            { contract: insuranceContract, contractName: 'InsuranceToken', event: 'InsReg', type: 'INS_REG' },
            { contract: pucContract, contractName: 'PUCToken', event: 'CenterReg', type: 'PUC_CENTER_REG' },
            { contract: loanContract, contractName: 'LoanContract', event: 'BankReg', type: 'BANK_REG' }
        ] as const;

        const TOGGLE_EVENTS = [
            { contract: dvpContract, contractName: 'DigitalVehiclePassport', event: 'MfgToggled', type: 'MFG_TOGGLED' },
            { contract: dvpContract, contractName: 'DigitalVehiclePassport', event: 'ScrapToggled', type: 'SCRAP_TOGGLED' },
            { contract: ownershipContract, contractName: 'OwnershipToken', event: 'RTOStatusToggled', type: 'RTO_TOGGLED' },
            { contract: challanContract, contractName: 'ChallanContract', event: 'PoliceStatusToggled', type: 'POLICE_TOGGLED' },
            { contract: insuranceContract, contractName: 'InsuranceToken', event: 'InsStatusToggled', type: 'INS_TOGGLED' },
            { contract: pucContract, contractName: 'PUCToken', event: 'CenterStatusToggled', type: 'PUC_CENTER_TOGGLED' },
            { contract: loanContract, contractName: 'LoanContract', event: 'BankStatusToggled', type: 'BANK_TOGGLED' }
        ] as const;

        // Automatically bind all registration events
        REGISTRATION_EVENTS.forEach(({ contract, contractName, event, type }) => {
            contract.on(event, async (id, code, _auth, ev) => {
                await this.handleRegistration(type, id, code, ev);
                await this.advanceCursor(contractName, ev.blockNumber);
            });
        });

        // Automatically bind all toggle events
        TOGGLE_EVENTS.forEach(({ contract, contractName, event, type }) => {
            contract.on(event, async (id, active, ev) => {
                await this.handleToggle(type, id, active, ev);
                await this.advanceCursor(contractName, ev.blockNumber);
            });
        });

        // ─── DVP OPERATIONAL EVENTS ───
        dvpContract.on('VehicleMfg', async (tokenId, vinHash, mfgId, ev) => { await this.handleVehicleMfg(tokenId, vinHash, mfgId, ev); await this.advanceCursor('DigitalVehiclePassport', ev.blockNumber); });
        dvpContract.on('StatusChange', async (tokenId, oldStatus, newStatus, ev) => { await this.handleStatusChange(tokenId, oldStatus, newStatus, ev); await this.advanceCursor('DigitalVehiclePassport', ev.blockNumber); });
        dvpContract.on('VehicleScrapped', async (tokenId, scrapId, scrapDate, ev) => { await this.handleVehicleScrapped(tokenId, scrapId, scrapDate, ev); await this.advanceCursor('DigitalVehiclePassport', ev.blockNumber); });
        dvpContract.on('VehicleAssignedToDealer', async (tokenId, mfgId, dealer, assignedDate, ev) => { await this.handleVehicleAssignedToDealer(tokenId, mfgId, dealer, assignedDate, ev); await this.advanceCursor('DigitalVehiclePassport', ev.blockNumber); });

        // ─── OWNERSHIP OPERATIONAL EVENTS ───
        ownershipContract.on('VehicleReg', async (ownTid, owner, rtoId, dvpId, ev) => { await this.handleVehicleReg(ownTid, owner, rtoId, dvpId, ev); await this.advanceCursor('OwnershipToken', ev.blockNumber); });
        ownershipContract.on('XferInit', async (reqId, ownTid, seller, buyer, ev) => { await this.handleXferInit(reqId, ownTid, seller, buyer, ev); await this.advanceCursor('OwnershipToken', ev.blockNumber); });
        ownershipContract.on('XferCancelled', async (reqId, ownTid, ev) => { await this.handleXferCancelled(reqId, ownTid, ev); await this.advanceCursor('OwnershipToken', ev.blockNumber); });
        ownershipContract.on('XferApproved', async (reqId, approver, ev) => { await this.handleXferApproved(reqId, approver, ev); await this.advanceCursor('OwnershipToken', ev.blockNumber); });
        ownershipContract.on('XferDone', async (reqId, ownTid, newOwner, ev) => { await this.handleXferDone(reqId, ownTid, newOwner, ev); await this.advanceCursor('OwnershipToken', ev.blockNumber); });
        ownershipContract.on('TradeCertIssued', async (dealer, rtoId, validTill, ev) => { await this.handleTradeCertIssued(dealer, rtoId, validTill, ev); await this.advanceCursor('OwnershipToken', ev.blockNumber); });
        ownershipContract.on('TradeCertRevoked', async (dealer, rtoId, ev) => { await this.handleTradeCertRevoked(dealer, rtoId, ev); await this.advanceCursor('OwnershipToken', ev.blockNumber); });

        // ─── CHALLAN OPERATIONAL EVENTS ───
        challanContract.on('ChallanIssued', async (challanId, ownTid, policeId, amount, ev) => { await this.handleChallanIssued(challanId, ownTid, policeId, amount, ev); await this.advanceCursor('ChallanContract', ev.blockNumber); });
        challanContract.on('ChallanPaid', async (challanId, ownTid, ev) => { await this.handleChallanPaid(challanId, ownTid, ev); await this.advanceCursor('ChallanContract', ev.blockNumber); });
        challanContract.on('ChallanCancelled', async (challanId, ownTid, isAdminCancel, ev) => { await this.handleChallanCancelled(challanId, ownTid, isAdminCancel, ev); await this.advanceCursor('ChallanContract', ev.blockNumber); });

        // ─── INSURANCE OPERATIONAL EVENTS ───
        insuranceContract.on('PolicyIssued', async (polId, ownTid, compId, expiry, ev) => { await this.handlePolicyIssued(polId, ownTid, compId, expiry, ev); await this.advanceCursor('InsuranceToken', ev.blockNumber); });
        insuranceContract.on('PolicyExpired', async (polId, ev) => { await this.handlePolicyExpired(polId, ev); await this.advanceCursor('InsuranceToken', ev.blockNumber); });
        insuranceContract.on('ClaimFiled', async (polId, claimNum, ev) => { await this.handleClaimFiled(polId, claimNum, ev); await this.advanceCursor('InsuranceToken', ev.blockNumber); });

        // ─── PUC OPERATIONAL EVENTS ───
        pucContract.on('PUCIssued', async (certId, ownTid, passed, expiry, ev) => { await this.handlePucIssued(certId, ownTid, passed, expiry, ev); await this.advanceCursor('PUCToken', ev.blockNumber); });
        pucContract.on('PUCExpired', async (certId, ev) => { await this.handlePucExpired(certId, ev); await this.advanceCursor('PUCToken', ev.blockNumber); });

        // ─── LOAN OPERATIONAL EVENTS ───
        loanContract.on('LoanReg', async (loanId, ownTid, bankId, amount, ev) => { await this.handleLoanReg(loanId, ownTid, bankId, amount, ev); await this.advanceCursor('LoanContract', ev.blockNumber); });
        loanContract.on('NOCIssued', async (loanId, ownTid, owner, ev) => { await this.handleNocIssued(loanId, ownTid, owner, ev); await this.advanceCursor('LoanContract', ev.blockNumber); });

        logger.info('Blockchain Indexer is now listening for events');
    }

    private getContractAddress(contractName: string): string {
        switch (contractName) {
            case 'DigitalVehiclePassport': return env.CONTRACT_DVP_ADDRESS;
            case 'OwnershipToken': return env.CONTRACT_OWNERSHIP_ADDRESS;
            case 'ChallanContract': return env.CONTRACT_CHALLAN_ADDRESS;
            case 'InsuranceToken': return env.CONTRACT_INSURANCE_ADDRESS;
            case 'PUCToken': return env.CONTRACT_PUC_ADDRESS;
            case 'LoanContract': return env.CONTRACT_LOAN_ADDRESS;
            default: return '0x0000000000000000000000000000000000000000';
        }
    }

    private async advanceCursor(contractName: string, blockNumber: number) {
        const currentTracker = this.cursorTracker.get(contractName) || 0;
        if (blockNumber > currentTracker) {
            this.cursorTracker.set(contractName, blockNumber);
            const address = this.getContractAddress(contractName);
            await prisma.indexerState.upsert({
                where: { contractName },
                create: { contractName, contractAddress: address, lastBlock: blockNumber },
                update: { lastBlock: blockNumber }
            });
        }
    }

    private async catchUpContract(contract: Contract, contractName: string, latestBlock: number) {
        const state = await prisma.indexerState.findUnique({ where: { contractName } });
        const lastBlock = state ? Number(state.lastBlock) : Math.max(0, latestBlock - 5000);
        this.cursorTracker.set(contractName, lastBlock);

        if (lastBlock >= latestBlock) return;

        logger.info({ contractName, fromBlock: lastBlock + 1, toBlock: latestBlock }, 'Fetching historical chunks');

        const CHUNK_SIZE = 2000;
        for (let fromBlock = lastBlock + 1; fromBlock <= latestBlock; fromBlock += CHUNK_SIZE) {
            const toBlock = Math.min(fromBlock + CHUNK_SIZE - 1, latestBlock);
            const logs = await contract.queryFilter('*', fromBlock, toBlock);

            for (const log of logs) {
                if ('eventName' in log) {
                    await this.processLog(log as EventLog);
                }
            }
            
            await this.advanceCursor(contractName, toBlock);
        }
    }

    private async processLog(log: EventLog) {
        if (!log.eventName) return;
        const ev = log;
        const args = log.args;

        switch (log.eventName) {
            case 'MfgReg': return this.handleRegistration('MFG_REG', args[0], args[1], ev);
            case 'ScrapReg': return this.handleRegistration('SCRAP_REG', args[0], args[1], ev);
            case 'RTOReg': return this.handleRegistration('RTO_REG', args[0], args[1], ev);
            case 'PoliceReg': return this.handleRegistration('POLICE_REG', args[0], args[1], ev);
            case 'InsReg': return this.handleRegistration('INS_REG', args[0], args[1], ev);
            case 'CenterReg': return this.handleRegistration('PUC_CENTER_REG', args[0], args[1], ev);
            case 'BankReg': return this.handleRegistration('BANK_REG', args[0], args[1], ev);
            
            case 'MfgToggled': return this.handleToggle('MFG_TOGGLED', args[0], args[1], ev);
            case 'ScrapToggled': return this.handleToggle('SCRAP_TOGGLED', args[0], args[1], ev);
            case 'RTOStatusToggled': return this.handleToggle('RTO_TOGGLED', args[0], args[1], ev);
            case 'PoliceStatusToggled': return this.handleToggle('POLICE_TOGGLED', args[0], args[1], ev);
            case 'InsStatusToggled': return this.handleToggle('INS_TOGGLED', args[0], args[1], ev);
            case 'CenterStatusToggled': return this.handleToggle('PUC_CENTER_TOGGLED', args[0], args[1], ev);
            case 'BankStatusToggled': return this.handleToggle('BANK_TOGGLED', args[0], args[1], ev);

            case 'VehicleMfg': return this.handleVehicleMfg(args[0], args[1], args[2], ev);
            case 'StatusChange': return this.handleStatusChange(args[0], args[1], args[2], ev);
            case 'VehicleScrapped': return this.handleVehicleScrapped(args[0], args[1], args[2], ev);
            case 'VehicleAssignedToDealer': return this.handleVehicleAssignedToDealer(args[0], args[1], args[2], args[3], ev);
            
            case 'VehicleReg': return this.handleVehicleReg(args[0], args[1], args[2], args[3], ev);
            case 'XferInit': return this.handleXferInit(args[0], args[1], args[2], args[3], ev);
            case 'XferCancelled': return this.handleXferCancelled(args[0], args[1], ev);
            case 'XferApproved': return this.handleXferApproved(args[0], args[1], ev);
            case 'XferDone': return this.handleXferDone(args[0], args[1], args[2], ev);
            case 'TradeCertIssued': return this.handleTradeCertIssued(args[0], args[1], args[2], ev);
            case 'TradeCertRevoked': return this.handleTradeCertRevoked(args[0], args[1], ev);
            
            case 'ChallanIssued': return this.handleChallanIssued(args[0], args[1], args[2], args[3], ev);
            case 'ChallanPaid': return this.handleChallanPaid(args[0], args[1], ev);
            case 'ChallanCancelled': return this.handleChallanCancelled(args[0], args[1], args[2], ev);
            
            case 'PolicyIssued': return this.handlePolicyIssued(args[0], args[1], args[2], args[3], ev);
            case 'PolicyExpired': return this.handlePolicyExpired(args[0], ev);
            case 'ClaimFiled': return this.handleClaimFiled(args[0], args[1], ev);
            
            case 'PUCIssued': return this.handlePucIssued(args[0], args[1], args[2], args[3], ev);
            case 'PUCExpired': return this.handlePucExpired(args[0], ev);
            
            case 'LoanReg': return this.handleLoanReg(args[0], args[1], args[2], args[3], ev);
            case 'NOCIssued': return this.handleNocIssued(args[0], args[1], args[2], ev);
        }
    }

    // ─── HELPER: FINALIZE TRANSACTION ───
    private async finalizeTx(txHash: string, defaultAction: TxActionType, blockNumber: number = 0) {
        const tx = await prisma.blockchainTransaction.upsert({
            where: { txHash },
            create: {
                txHash,
                actionType: defaultAction,
                status: SyncStatus.MINED,
                blockNumber
            },
            update: {
                status: SyncStatus.MINED,
                blockNumber
            }
        });

        // Broadcast a global TX status update to whoever initiated it
        await dispatcher.dispatchTxResult(
            txHash,
            tx.actionType,
            'MINED',
            tx.initiatorMemberId,
            tx.initiatorUserId
        );
        return tx;
    }

    // ─── CONFIGURATION EVENT HANDLERS (Registration & Toggle) ───
    
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

            await this.finalizeTx(txHash, TxActionType.B2B_ENTITY_REGISTER, event.blockNumber);

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

            dispatcher.notifyEntity(entity.id, notification);

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

            await this.finalizeTx(txHash, TxActionType.B2B_ENTITY_TOGGLE, event.blockNumber);

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

            dispatcher.notifyEntity(entity.id, notification);

        } catch (err) {
            logger.error({ err, type }, 'Indexer failed to process toggle event');
        }
    }

    // ─── DVP EVENT HANDLERS ───

    private async handleVehicleMfg(tokenId: bigint, vinHash: string, mfgId: bigint, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ tokenId: Number(tokenId), vinHash, txHash }, 'DVP: VehicleMfg event');

            const mfgEntity = await prisma.b2BEntity.findFirst({ where: { onChainId: Number(mfgId) } });
            if (!mfgEntity) return logger.warn({ mfgId: Number(mfgId) }, 'Mfg Entity not found for VehicleMfg');

            // Ensure the passport exists and is updated with the on-chain ID
            const tx = await prisma.blockchainTransaction.findUnique({ where: { txHash } });
            
            await prisma.vehiclePassport.upsert({
                where: { vinHash },
                create: {
                    dvpId: tokenId,
                    vinHash,
                    engineHash: '0x0',
                    chassisHash: '0x0',
                    specsHash: '0x0',
                    mfgEntityId: mfgEntity.id,
                    mfgDate: new Date(),
                    createdByMemberId: tx?.initiatorMemberId || null
                },
                update: {
                    dvpId: tokenId
                }
            });

            await this.finalizeTx(txHash, TxActionType.VEHICLE_MINT, event.blockNumber);

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'VEHICLE_MFG',
                timestamp: Date.now(),
                data: { dvpId: String(tokenId), vinHash, mfgId: String(mfgId), txHash, blockNumber: event.blockNumber }
            };
            dispatcher.notifyEntity(mfgEntity.id, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle VehicleMfg');
        }
    }

    private async handleStatusChange(tokenId: bigint, oldStatus: number, newStatus: number, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ tokenId: Number(tokenId), newStatus, txHash }, 'DVP: StatusChange event');

            const statusMap: Record<number, VehicleStatus> = {
                0: VehicleStatus.NOT_REG,
                1: VehicleStatus.ACTIVE,
                2: VehicleStatus.SCRAPPED
            };
            const statusNum = Number(newStatus);

            const vehicle = await prisma.vehiclePassport.findUnique({ where: { dvpId: tokenId } });
            if (!vehicle) return logger.warn({ tokenId: Number(tokenId) }, 'Vehicle not found for StatusChange');

            await prisma.vehiclePassport.update({
                where: { id: vehicle.id },
                data: { status: statusMap[statusNum] }
            });

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'STATUS_CHANGE',
                timestamp: Date.now(),
                data: { dvpId: String(tokenId), oldStatus: String(oldStatus), newStatus: String(newStatus), txHash }
            };
            dispatcher.notifyEntity(vehicle.mfgEntityId, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle StatusChange');
        }
    }

    private async handleVehicleScrapped(tokenId: bigint, scrapId: bigint, scrapDate: bigint, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ tokenId: Number(tokenId), scrapId: Number(scrapId), txHash }, 'DVP: VehicleScrapped event');

            const [scrapEntity, vehicle] = await Promise.all([
                prisma.b2BEntity.findFirst({ where: { onChainId: Number(scrapId) } }),
                prisma.vehiclePassport.findUnique({ where: { dvpId: tokenId } })
            ]);

            if (vehicle && scrapEntity) {
                await prisma.vehiclePassport.update({
                    where: { id: vehicle.id },
                    data: { 
                        scrapEntityId: scrapEntity.id, 
                        scrapDate: new Date(Number(scrapDate) * 1000) 
                    }
                });
            }

            await this.finalizeTx(txHash, TxActionType.VEHICLE_SCRAP, event.blockNumber);

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'VEHICLE_SCRAPPED',
                timestamp: Date.now(),
                data: { dvpId: String(tokenId), scrapId: String(scrapId), scrapDate: Number(scrapDate), txHash }
            };
            if (scrapEntity) {
                dispatcher.notifyEntity(scrapEntity.id, payload);
            }
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle VehicleScrapped');
        }
    }

    private async handleVehicleAssignedToDealer(tokenId: bigint, mfgId: bigint, dealer: string, _assignedDate: bigint, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ tokenId: Number(tokenId), dealer, txHash }, 'DVP: VehicleAssignedToDealer event');

            const [vehicle, user] = await Promise.all([
                prisma.vehiclePassport.findUnique({ where: { dvpId: tokenId } }),
                prisma.user.findUnique({ where: { walletAddress: dealer.toLowerCase() } })
            ]);

            if (vehicle) {
                await prisma.vehiclePassport.update({
                    where: { id: vehicle.id },
                    data: { 
                        dealerWallet: dealer.toLowerCase(),
                        dealerUserId: user?.id || null
                    }
                });
            }

            await this.finalizeTx(txHash, TxActionType.VEHICLE_ASSIGN_DEALER, event.blockNumber);

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'VEHICLE_ASSIGNED_TO_DEALER',
                timestamp: Date.now(),
                data: { dvpId: String(tokenId), dealerWallet: dealer, txHash }
            };
            
            const mfgEntity = await prisma.b2BEntity.findFirst({ where: { onChainId: Number(mfgId) } });
            if (mfgEntity) {
                dispatcher.notifyEntity(mfgEntity.id, payload);
            }
            if (user) {
                dispatcher.notifyUser(user.id, payload);
            }
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle VehicleAssignedToDealer');
        }
    }

    // ─── OWNERSHIP EVENT HANDLERS ───

    private async handleVehicleReg(ownTid: bigint, owner: string, rtoId: bigint, dvpId: bigint, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ ownTid: Number(ownTid), owner, txHash }, 'Ownership: VehicleReg event');

            const [rtoEntity, user, passport] = await Promise.all([
                prisma.b2BEntity.findFirst({ where: { onChainId: Number(rtoId) } }),
                prisma.user.findUnique({ where: { walletAddress: owner.toLowerCase() } }),
                prisma.vehiclePassport.findUnique({ where: { dvpId } })
            ]);

            if (passport) {
                const tx = await prisma.blockchainTransaction.findUnique({ where: { txHash } });
                
                await prisma.vehicleOwnership.upsert({
                    where: { ownTid },
                    create: {
                        ownTid,
                        passportId: passport.id,
                        rtoEntityId: rtoEntity?.id || '',
                        ownerWallet: owner.toLowerCase(),
                        ownerUserId: user?.id,
                        regDate: new Date(),
                        rtoMemberId: tx?.initiatorMemberId || null
                    },
                    update: {
                        ownerWallet: owner.toLowerCase(),
                        ownerUserId: user?.id
                    }
                });

                await prisma.vehiclePassport.update({
                    where: { id: passport.id },
                    data: { status: VehicleStatus.ACTIVE }
                });

                // Update RegistrationRequest to APPROVED
                if (rtoEntity) {
                    const regReq = await prisma.registrationRequest.findFirst({
                        where: { dvpId, rtoEntityId: rtoEntity.id, status: RegistrationStatus.PENDING }
                    });
                    if (regReq) {
                        await prisma.registrationRequest.update({
                            where: { id: regReq.id },
                            data: { status: RegistrationStatus.APPROVED }
                        });
                    }
                }
            }

            await this.finalizeTx(txHash, TxActionType.VEHICLE_REGISTER_RTO, event.blockNumber);

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'VEHICLE_REG',
                timestamp: Date.now(),
                data: { ownTid: String(ownTid), ownerWallet: owner, rtoId: String(rtoId), dvpId: String(dvpId), txHash }
            };

            if (rtoEntity) dispatcher.notifyEntity(rtoEntity.id, payload);
            if (user) dispatcher.notifyUser(user.id, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle VehicleReg');
        }
    }

    private async handleXferInit(reqId: bigint, ownTid: bigint, seller: string, buyer: string, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ reqId: Number(reqId), seller, buyer, txHash }, 'Ownership: XferInit event');

            const [ownership, sellerUser, buyerUser] = await Promise.all([
                prisma.vehicleOwnership.findUnique({ where: { ownTid } }),
                prisma.user.findUnique({ where: { walletAddress: seller.toLowerCase() } }),
                prisma.user.findUnique({ where: { walletAddress: buyer.toLowerCase() } })
            ]);

            if (ownership) {
                await prisma.transferRequest.upsert({
                    where: { reqId },
                    create: {
                        reqId,
                        ownershipId: ownership.id,
                        sellerWallet: seller.toLowerCase(),
                        sellerUserId: sellerUser?.id,
                        buyerWallet: buyer.toLowerCase(),
                        buyerUserId: buyerUser?.id,
                        status: TransferStatus.PENDING,
                        reqDate: new Date()
                    },
                    update: { status: TransferStatus.PENDING }
                });
            }

            await this.finalizeTx(txHash, TxActionType.TRANSFER_INIT, event.blockNumber);

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'XFER_INIT',
                timestamp: Date.now(),
                data: { reqId: String(reqId), ownTid: String(ownTid), sellerWallet: seller, buyerWallet: buyer, txHash }
            };

            if (sellerUser) dispatcher.notifyUser(sellerUser.id, payload);
            if (buyerUser) dispatcher.notifyUser(buyerUser.id, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle XferInit');
        }
    }

    private async handleXferCancelled(reqId: bigint, ownTid: bigint, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ reqId: Number(reqId), txHash }, 'Ownership: XferCancelled event');

            const req = await prisma.transferRequest.findUnique({ where: { reqId } });
            if (req) {
                await prisma.transferRequest.update({
                    where: { reqId },
                    data: { status: TransferStatus.CANCELLED }
                });
            }

            await this.finalizeTx(txHash, TxActionType.TRANSFER_CANCEL, event.blockNumber);

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'XFER_CANCELLED',
                timestamp: Date.now(),
                data: { reqId: String(reqId), ownTid: String(ownTid), txHash }
            };

            if (req?.sellerUserId) dispatcher.notifyUser(req.sellerUserId, payload);
            if (req?.buyerUserId) dispatcher.notifyUser(req.buyerUserId, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle XferCancelled');
        }
    }

    private async handleXferApproved(reqId: bigint, approver: number, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ reqId: Number(reqId), approver, txHash }, 'Ownership: XferApproved event');

            const req = await prisma.transferRequest.findUnique({ where: { reqId } });
            
            const approverNum = Number(approver);
            let newStatus: TransferStatus = TransferStatus.PENDING;
            let actionType: TxActionType = TxActionType.TRANSFER_APPROVE_BUYER;
            if (approverNum === 1) newStatus = TransferStatus.BUYER_ACCEPTED;
            if (approverNum === 2) {
                newStatus = TransferStatus.RTO_APPROVED;
                actionType = TxActionType.TRANSFER_APPROVE_RTO;
            }

            if (req) {
                const tx = await prisma.blockchainTransaction.findUnique({ where: { txHash } });

                await prisma.transferRequest.update({
                    where: { reqId },
                    data: { 
                        status: newStatus,
                        ...(approverNum === 2 && tx?.initiatorMemberId ? { rtoApproverMemberId: tx.initiatorMemberId } : {})
                    }
                });
            }

            await this.finalizeTx(txHash, actionType, event.blockNumber);

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'XFER_APPROVED',
                timestamp: Date.now(),
                data: { reqId: String(reqId), approver: Number(approver), txHash }
            };

            if (req?.sellerUserId) dispatcher.notifyUser(req.sellerUserId, payload);
            if (req?.buyerUserId) dispatcher.notifyUser(req.buyerUserId, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle XferApproved');
        }
    }

    private async handleXferDone(reqId: bigint, ownTid: bigint, newOwner: string, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ reqId: Number(reqId), newOwner, txHash }, 'Ownership: XferDone event');

            const [req, ownership, user] = await Promise.all([
                prisma.transferRequest.findUnique({ where: { reqId } }),
                prisma.vehicleOwnership.findUnique({ where: { ownTid } }),
                prisma.user.findUnique({ where: { walletAddress: newOwner.toLowerCase() } })
            ]);

            if (ownership) {
                await prisma.vehicleOwnership.update({
                    where: { ownTid },
                    data: {
                        ownerWallet: newOwner.toLowerCase(),
                        ownerUserId: user?.id || null
                    }
                });
            }

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'XFER_DONE',
                timestamp: Date.now(),
                data: { reqId: String(reqId), ownTid: String(ownTid), newOwnerWallet: newOwner, txHash }
            };

            if (req?.sellerUserId) dispatcher.notifyUser(req.sellerUserId, payload);
            if (user) dispatcher.notifyUser(user.id, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle XferDone');
        }
    }

    private async handleTradeCertIssued(dealer: string, rtoId: bigint, validTill: bigint, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ dealer, rtoId: Number(rtoId), txHash }, 'Ownership: TradeCertIssued event');

            const [rtoEntity, user, tx] = await Promise.all([
                prisma.b2BEntity.findFirst({ where: { onChainId: Number(rtoId) } }),
                prisma.user.findUnique({ where: { walletAddress: dealer.toLowerCase() } }),
                prisma.blockchainTransaction.findUnique({ where: { txHash } })
            ]);

            const existing = await prisma.tradeCert.findFirst({
                where: { dealerWallet: dealer.toLowerCase(), rtoEntityId: rtoEntity?.id || '' }
            });

            const data = {
                dealerWallet: dealer.toLowerCase(),
                dealerUserId: user?.id,
                rtoEntityId: rtoEntity?.id || '',
                issuedAt: new Date(),
                validTill: new Date(Number(validTill) * 1000),
                isActive: true,
                createdByMemberId: tx?.initiatorMemberId || null
            };

            if (existing) {
                await prisma.tradeCert.update({ where: { id: existing.id }, data });
            } else {
                await prisma.tradeCert.create({ data });
            }

            await this.finalizeTx(txHash, TxActionType.TRADE_CERT_ISSUE, event.blockNumber);
            
            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'TRADE_CERT_ISSUED',
                timestamp: Date.now(),
                data: { dealerWallet: dealer, rtoId: String(rtoId), validTill: Number(validTill), txHash }
            };
            
            if (user) dispatcher.notifyUser(user.id, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle TradeCertIssued');
        }
    }

    private async handleTradeCertRevoked(dealer: string, rtoId: bigint, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ dealer, rtoId: Number(rtoId), txHash }, 'Ownership: TradeCertRevoked event');

            const [rtoEntity, user] = await Promise.all([
                prisma.b2BEntity.findFirst({ where: { onChainId: Number(rtoId) } }),
                prisma.user.findUnique({ where: { walletAddress: dealer.toLowerCase() } })
            ]);
            
            const existing = await prisma.tradeCert.findFirst({
                where: { dealerWallet: dealer.toLowerCase(), rtoEntityId: rtoEntity?.id || '', isActive: true }
            });

            if (existing) {
                await prisma.tradeCert.update({
                    where: { id: existing.id },
                    data: { isActive: false }
                });
            }

            await this.finalizeTx(txHash, TxActionType.TRADE_CERT_REVOKE, event.blockNumber);
            
            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'TRADE_CERT_REVOKED',
                timestamp: Date.now(),
                data: { dealerWallet: dealer, rtoId: String(rtoId), txHash }
            };
            
            
            if (user) dispatcher.notifyUser(user.id, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle TradeCertRevoked');
        }
    }

    // ─── CHALLAN EVENT HANDLERS ───

    private async handleChallanIssued(challanId: bigint, ownTid: bigint, policeId: bigint, amount: bigint, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ challanId: Number(challanId), txHash }, 'Challan: Issued event');

            const [policeEntity, ownership, tx] = await Promise.all([
                prisma.b2BEntity.findFirst({ where: { onChainId: Number(policeId) } }),
                prisma.vehicleOwnership.findUnique({ where: { ownTid } }),
                prisma.blockchainTransaction.findUnique({ where: { txHash } })
            ]);

            if (ownership && policeEntity) {
                // FIX: The service pre-creates a Challan with challanId=null before submitting the tx.
                // The BlockchainTransaction FK (tx.challanId) points to that pre-created record.
                // We must UPDATE it rather than upsert-create a duplicate with a new DB row.
                const preCreatedChallan = tx?.challanId
                    ? await prisma.challan.findUnique({ where: { id: tx.challanId } })
                    : null;

                if (preCreatedChallan) {
                    // Update the pre-created record with the on-chain IDs
                    await prisma.challan.update({
                        where: { id: preCreatedChallan.id },
                        data: {
                            challanId,
                            ownTid,
                            status: ChallanStatus.PENDING
                        }
                    });
                } else {
                    // Fallback: catch-up phase or orphaned tx — safe to upsert
                    await prisma.challan.upsert({
                        where: { challanId },
                        create: {
                            challanId,
                            ownershipId: ownership.id,
                            policeEntityId: policeEntity.id,
                            ownTid,
                            amount: amount.toString(),
                            status: ChallanStatus.PENDING,
                            issuedAt: new Date(),
                            violatorUserId: ownership.ownerUserId,
                            createdByMemberId: tx?.initiatorMemberId || null
                        },
                        update: {
                            challanId,
                            ownTid,
                            status: ChallanStatus.PENDING
                        }
                    });
                }
            }

            await this.finalizeTx(txHash, TxActionType.CHALLAN_ISSUE, event.blockNumber);

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'CHALLAN_ISSUED',
                timestamp: Date.now(),
                data: { challanId: String(challanId), ownTid: String(ownTid), policeId: String(policeId), amount: String(amount), txHash }
            };

            if (policeEntity) dispatcher.notifyEntity(policeEntity.id, payload);
            if (ownership?.ownerUserId) dispatcher.notifyUser(ownership.ownerUserId, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle ChallanIssued');
        }
    }

    private async handleChallanPaid(challanId: bigint, ownTid: bigint, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ challanId: Number(challanId), txHash }, 'Challan: Paid event');

            const challan = await prisma.challan.findUnique({ where: { challanId } });

            if (challan) {
                await prisma.challan.update({
                    where: { challanId },
                    data: {
                        status: ChallanStatus.PAID,
                        paidAt: new Date()
                    }
                });
            }

            await this.finalizeTx(txHash, TxActionType.CHALLAN_PAY, event.blockNumber);

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'CHALLAN_PAID',
                timestamp: Date.now(),
                data: { challanId: String(challanId), ownTid: String(ownTid), txHash }
            };

            if (challan?.violatorUserId) dispatcher.notifyUser(challan.violatorUserId, payload);
            if (challan?.policeEntityId) dispatcher.notifyEntity(challan.policeEntityId, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle ChallanPaid');
        }
    }

    private async handleChallanCancelled(challanId: bigint, ownTid: bigint, isAdminCancel: boolean, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ challanId: Number(challanId), txHash }, 'Challan: Cancelled event');

            const challan = await prisma.challan.findUnique({ where: { challanId } });

            if (challan) {
                const tx = await prisma.blockchainTransaction.findUnique({ where: { txHash } });
                
                await prisma.challan.update({
                    where: { challanId },
                    data: {
                        status: ChallanStatus.CANCELLED,
                        cancelledAt: new Date(),
                        cancelledByMemberId: tx?.initiatorMemberId || null,
                        isAdminCancel: isAdminCancel
                    }
                });
            }

            await this.finalizeTx(txHash, TxActionType.CHALLAN_CANCEL, event.blockNumber);

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'CHALLAN_CANCELLED',
                timestamp: Date.now(),
                data: { challanId: String(challanId), ownTid: String(ownTid), isAdminCancel, txHash }
            };

            if (challan?.violatorUserId) dispatcher.notifyUser(challan.violatorUserId, payload);
            if (challan?.policeEntityId) dispatcher.notifyEntity(challan.policeEntityId, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle ChallanCancelled');
        }
    }

    // ─── INSURANCE EVENT HANDLERS ───

    private async handlePolicyIssued(polId: bigint, ownTid: bigint, compId: bigint, expiry: bigint, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ polId: Number(polId), txHash }, 'Insurance: Issued event');

            const [compEntity, ownership] = await Promise.all([
                prisma.b2BEntity.findFirst({ where: { onChainId: Number(compId) } }),
                prisma.vehicleOwnership.findUnique({ where: { ownTid } })
            ]);

            if (ownership && compEntity) {
                const tx = await prisma.blockchainTransaction.findUnique({ where: { txHash } });
                
                await prisma.insurancePolicy.upsert({
                    where: { polId },
                    create: {
                        polId,
                        ownershipId: ownership.id,
                        insEntityId: compEntity.id,
                        expiryDate: new Date(Number(expiry) * 1000),
                        status: InsuranceStatus.ACTIVE,
                        issueDate: new Date(),
                        ownerUserId: ownership.ownerUserId,
                        ownerWallet: ownership.ownerWallet,
                        coverage: 0, // Fallback for blockchain events
                        premium: 0, // Fallback for blockchain events
                        createdByMemberId: tx?.initiatorMemberId || null
                    },
                    update: {
                        status: InsuranceStatus.ACTIVE
                    }
                });
            }

            await this.finalizeTx(txHash, TxActionType.INSURANCE_ISSUE, event.blockNumber);

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'POLICY_ISSUED',
                timestamp: Date.now(),
                data: { polId: String(polId), ownTid: String(ownTid), compId: String(compId), expiryDate: Number(expiry), txHash }
            };

            if (compEntity) dispatcher.notifyEntity(compEntity.id, payload);
            if (ownership?.ownerUserId) dispatcher.notifyUser(ownership.ownerUserId, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle PolicyIssued');
        }
    }

    private async handlePolicyExpired(polId: bigint, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ polId: Number(polId), txHash }, 'Insurance: Expired event');

            const policy = await prisma.insurancePolicy.findUnique({ where: { polId } });

            if (policy) {
                await prisma.insurancePolicy.update({
                    where: { polId },
                    data: { status: InsuranceStatus.EXPIRED }
                });
            }

            await this.finalizeTx(txHash, TxActionType.INSURANCE_EXPIRE, event.blockNumber);

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'POLICY_EXPIRED',
                timestamp: Date.now(),
                data: { polId: String(polId), txHash }
            };

            if (policy?.ownerUserId) dispatcher.notifyUser(policy.ownerUserId, payload);
            if (policy?.insEntityId) dispatcher.notifyEntity(policy.insEntityId, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle PolicyExpired');
        }
    }

    private async handleClaimFiled(polId: bigint, claimNum: number, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ polId: Number(polId), claimNum, txHash }, 'Insurance: ClaimFiled event');

            const policy = await prisma.insurancePolicy.findUnique({ where: { polId } });

            if (policy) {
                await prisma.insurancePolicy.update({
                    where: { polId },
                    data: { claimCount: Number(claimNum) }
                });
            }

            await this.finalizeTx(txHash, TxActionType.INSURANCE_CLAIM, event.blockNumber);

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'CLAIM_FILED',
                timestamp: Date.now(),
                data: { polId: String(polId), claimNum: Number(claimNum), txHash }
            };

            if (policy?.ownerUserId) dispatcher.notifyUser(policy.ownerUserId, payload);
            if (policy?.insEntityId) dispatcher.notifyEntity(policy.insEntityId, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle ClaimFiled');
        }
    }

    // ─── PUC EVENT HANDLERS ───

    private async handlePucIssued(certId: bigint, ownTid: bigint, passed: boolean, expiry: bigint, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ certId: Number(certId), txHash }, 'PUC: Issued event');

            const tx = await prisma.blockchainTransaction.findUnique({ where: { txHash }, include: { b2bEntity: true } });
            const ownership = await prisma.vehicleOwnership.findUnique({ where: { ownTid } });

            if (ownership && tx?.b2bEntityId) {
                await prisma.pucCertificate.upsert({
                    where: { certId },
                    create: {
                        certId,
                        ownershipId: ownership.id,
                        pucEntityId: tx.b2bEntityId,
                        expiryDate: new Date(Number(expiry) * 1000),
                        status: PucStatus.VALID,
                        issueDate: new Date(),
                        passed: passed,
                        ownerUserId: ownership.ownerUserId,
                        ownerWallet: ownership.ownerWallet,
                        co: 0, // Fallback
                        hc: 0, // Fallback
                        smoke: 0, // Fallback
                        createdByMemberId: tx.initiatorMemberId || null
                    },
                    update: {
                        status: PucStatus.VALID
                    }
                });
            }

            await this.finalizeTx(txHash, TxActionType.PUC_ISSUE, event.blockNumber);

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'PUC_ISSUED',
                timestamp: Date.now(),
                data: { certId: String(certId), ownTid: String(ownTid), passed, expiryDate: Number(expiry), txHash }
            };

            if (tx?.b2bEntityId) dispatcher.notifyEntity(tx.b2bEntityId, payload);
            if (ownership?.ownerUserId) dispatcher.notifyUser(ownership.ownerUserId, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle PucIssued');
        }
    }

    private async handlePucExpired(certId: bigint, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ certId: Number(certId), txHash }, 'PUC: Expired event');

            const puc = await prisma.pucCertificate.findUnique({ where: { certId } });

            if (puc) {
                await prisma.pucCertificate.update({
                    where: { certId },
                    data: { status: PucStatus.EXPIRED }
                });
            }

            await this.finalizeTx(txHash, TxActionType.PUC_EXPIRE, event.blockNumber);

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'PUC_EXPIRED',
                timestamp: Date.now(),
                data: { certId: String(certId), txHash }
            };

            if (puc?.ownerUserId) dispatcher.notifyUser(puc.ownerUserId, payload);
            if (puc?.pucEntityId) dispatcher.notifyEntity(puc.pucEntityId, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle PucExpired');
        }
    }

    // ─── LOAN EVENT HANDLERS ───

    private async handleLoanReg(loanId: bigint, ownTid: bigint, bankId: bigint, amount: bigint, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ loanId: Number(loanId), txHash }, 'Loan: Reg event');

            const [bankEntity, ownership] = await Promise.all([
                prisma.b2BEntity.findFirst({ where: { onChainId: Number(bankId) } }),
                prisma.vehicleOwnership.findUnique({ where: { ownTid } })
            ]);

            if (ownership && bankEntity) {
                const tx = await prisma.blockchainTransaction.findUnique({ where: { txHash } });
                
                await prisma.loanRecord.upsert({
                    where: { loanId },
                    create: {
                        loanId,
                        ownershipId: ownership.id,
                        ownTid,
                        lenderEntityId: bankEntity.id,
                        borrowerWallet: ownership.ownerWallet,
                        amount: amount.toString(),
                        status: LoanStatus.ACTIVE,
                        disbursedAt: new Date(),
                        borrowerUserId: ownership.ownerUserId,
                        createdByMemberId: tx?.initiatorMemberId || null
                    },
                    update: {
                        status: LoanStatus.ACTIVE
                    }
                });
            }

            await this.finalizeTx(txHash, TxActionType.LOAN_DISBURSE, event.blockNumber);

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'LOAN_REG',
                timestamp: Date.now(),
                data: { loanId: String(loanId), ownTid: String(ownTid), bankId: String(bankId), amount: String(amount), txHash }
            };

            if (bankEntity) dispatcher.notifyEntity(bankEntity.id, payload);
            if (ownership?.ownerUserId) dispatcher.notifyUser(ownership.ownerUserId, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle LoanReg');
        }
    }

    private async handleNocIssued(loanId: bigint, ownTid: bigint, owner: string, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ loanId: Number(loanId), txHash }, 'Loan: NOC Issued event');

            const [loan, ownerUser] = await Promise.all([
                prisma.loanRecord.findUnique({ where: { loanId } }),
                prisma.user.findUnique({ where: { walletAddress: owner.toLowerCase() } })
            ]);

            if (loan) {
                await prisma.loanRecord.update({
                    where: { loanId },
                    data: {
                        status: LoanStatus.CLEARED,
                        clearedAt: new Date(),
                        nocIssued: true,
                        nocDate: new Date(),
                        nocRecipientWallet: owner.toLowerCase(),
                        nocRecipientUserId: ownerUser?.id || null
                    }
                });
            }

            await this.finalizeTx(txHash, TxActionType.LOAN_CLEAR, event.blockNumber);

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'NOC_ISSUED',
                timestamp: Date.now(),
                data: { loanId: String(loanId), ownTid: String(ownTid), ownerWallet: owner, txHash }
            };

            if (ownerUser) dispatcher.notifyUser(ownerUser.id, payload);
            if (loan?.lenderEntityId) dispatcher.notifyEntity(loan.lenderEntityId, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle NocIssued');
        }
    }
}

// Export singleton instance
export const indexerService = new IndexerService();
