import { WebSocketProvider, Contract, type EventLog } from 'ethers';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { SyncStatus, TxActionType, VehicleStatus, TransferStatus, ChallanStatus, InsuranceStatus, PucStatus, LoanStatus, RegistrationStatus, SafeProposalStatus } from '@/generated/prisma/client';
import crypto from 'crypto';
import { dispatcher } from '../notification/notification.dispatcher';

import DvpAbi from '@/abi/DigitalVehiclePassport.json';
import OwnershipAbi from '@/abi/OwnershipToken.json';
import ChallanAbi from '@/abi/ChallanContract.json';
import InsuranceAbi from '@/abi/InsuranceToken.json';
import PucAbi from '@/abi/PUCToken.json';
import LoanAbi from '@/abi/LoanContract.json';
import SafeAbi from '@/abi/Safe.json';
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
        // Gnosis Safe — only ExecutionSuccess / ExecutionFailure events are relevant
        const safeContract = new Contract(env.MORTH_GNOSIS_SAFE_ADDRESS, SafeAbi, this.provider);

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
            await this.catchUpContract(safeContract, 'GnosisSafe', latestBlock);

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
        dvpContract.on('ScrapAuthorized', async (tokenId, scrapId, owner, ev) => { await this.handleScrapAuthorized(tokenId, scrapId, owner, ev); await this.advanceCursor('DigitalVehiclePassport', ev.blockNumber); });

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
        insuranceContract.on('PolicyTerminated', async (polId, ownTid, ev) => { await this.handlePolicyTerminated(polId, ownTid, ev); await this.advanceCursor('InsuranceToken', ev.blockNumber); });

        // ─── PUC OPERATIONAL EVENTS ───
        pucContract.on('PUCIssued', async (certId, ownTid, passed, expiry, ev) => { await this.handlePucIssued(certId, ownTid, passed, expiry, ev); await this.advanceCursor('PUCToken', ev.blockNumber); });
        pucContract.on('PUCExpired', async (certId, ev) => { await this.handlePucExpired(certId, ev); await this.advanceCursor('PUCToken', ev.blockNumber); });
        pucContract.on('PUCTerminated', async (certId, ownTid, ev) => { await this.handlePucTerminated(certId, ownTid, ev); await this.advanceCursor('PUCToken', ev.blockNumber); });

        // ─── LOAN OPERATIONAL EVENTS ───
        // ABI: LoanReg(uint64 loanId, uint256 dvpId, uint64 bankId, address borrower, uint128 amount)
        loanContract.on('LoanReg', async (loanId, dvpId, bankId, borrower, amount, ev) => { await this.handleLoanReg(loanId, dvpId, bankId, borrower, amount, ev); await this.advanceCursor('LoanContract', ev.blockNumber); });
        // ABI: NOCIssued(uint64 loanId, uint256 dvpId)  — only 2 params; owner comes from NOCMinted
        loanContract.on('NOCIssued', async (loanId, dvpId, ev) => { await this.handleNocIssued(loanId, dvpId, ev); await this.advanceCursor('LoanContract', ev.blockNumber); });
        // ABI: NOCMinted(uint64 loanId, address owner)  — minted only for registered vehicles
        loanContract.on('NOCMinted', async (loanId, owner, ev) => { await this.handleNocMinted(loanId, owner, ev); await this.advanceCursor('LoanContract', ev.blockNumber); });
        // ABI: LoanRefinanced(uint64 oldLoanId, uint64 newLoanId, uint256 dvpId)
        loanContract.on('LoanRefinanced', async (oldLoanId, newLoanId, dvpId, ev) => { await this.handleLoanRefinanced(oldLoanId, newLoanId, dvpId, ev); await this.advanceCursor('LoanContract', ev.blockNumber); });
        // ABI: PendingLoanAttached(uint256 dvpId, uint64 bankId, address borrower, uint128 amount)
        loanContract.on('PendingLoanAttached', async (dvpId, bankId, borrower, amount, ev) => { await this.handlePendingLoanAttached(dvpId, bankId, borrower, amount, ev); await this.advanceCursor('LoanContract', ev.blockNumber); });
        // ABI: PendingLoanCancelled(uint256 dvpId, uint64 bankId)
        loanContract.on('PendingLoanCancelled', async (dvpId, bankId, ev) => { await this.handlePendingLoanCancelled(dvpId, bankId, ev); await this.advanceCursor('LoanContract', ev.blockNumber); });

        // ─── GNOSIS SAFE GOVERNANCE EVENTS ───
        // ExecutionSuccess(bytes32 txHash, uint256 payment)
        // The safeTxHash emitted is the EIP-712 Safe tx hash — maps 1:1 to SafeProposal.safeTxHash.
        safeContract.on('ExecutionSuccess', async (safeTxHash: string, _payment: bigint, ev: EventLog) => {
            await this.handleSafeExecutionSuccess(safeTxHash, ev);
            await this.advanceCursor('GnosisSafe', ev.blockNumber);
        });
        safeContract.on('ExecutionFailure', async (safeTxHash: string, _payment: bigint, ev: EventLog) => {
            await this.handleSafeExecutionFailure(safeTxHash, ev);
            await this.advanceCursor('GnosisSafe', ev.blockNumber);
        });

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
            case 'GnosisSafe': return env.MORTH_GNOSIS_SAFE_ADDRESS;
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
            case 'ScrapAuthorized': return this.handleScrapAuthorized(args[0], args[1], args[2] as string, ev);
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
            case 'PolicyTerminated': return this.handlePolicyTerminated(args[0], args[1], ev);
            
            case 'PUCIssued': return this.handlePucIssued(args[0], args[1], args[2], args[3], ev);
            case 'PUCExpired': return this.handlePucExpired(args[0], ev);
            case 'PUCTerminated': return this.handlePucTerminated(args[0], args[1], ev);
            
            case 'LoanReg':    return this.handleLoanReg(args[0], args[1], args[2], args[3] as string, args[4], ev);
            case 'NOCIssued':  return this.handleNocIssued(args[0], args[1], ev);
            case 'NOCMinted':  return this.handleNocMinted(args[0], args[1] as string, ev);
            case 'LoanRefinanced': return this.handleLoanRefinanced(args[0], args[1], args[2], ev);
            case 'PendingLoanAttached': return this.handlePendingLoanAttached(args[0], args[1], args[2] as string, args[3], ev);
            case 'PendingLoanCancelled': return this.handlePendingLoanCancelled(args[0], args[1], ev);

            // Gnosis Safe governance
            case 'ExecutionSuccess': return this.handleSafeExecutionSuccess(args[0] as string, ev);
            case 'ExecutionFailure': return this.handleSafeExecutionFailure(args[0] as string, ev);
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
            logger.info({ type, code, txHash, onChainId: Number(onChainId) }, 'Indexer: Entity registration event — updating onChainId');

            // Find entity by its unique code (set at creation time in b2b-entity.service)
            const entity = await prisma.b2BEntity.findUnique({
                where: { code },
                select: { id: true, walletAddress: true }
            });

            if (!entity) {
                logger.warn({ code }, 'Entity registered on-chain but not found in local DB — may have been created externally');
                return;
            }

            // Update the entity's on-chain ID — this is the definitive link between
            // our DB record and the on-chain entity ID.
            // No BlockchainTransaction row is created here: the SafeProposal tracks the
            // governance lifecycle and the SAFE_EXEC BlockchainTransaction handles crash recovery.
            await prisma.b2BEntity.update({
                where: { id: entity.id },
                data: { onChainId: Number(onChainId) }
            });

            const dynamicKey = `${type.split('_')[0].toLowerCase()}Id`;
            const notification = {
                type: type as NotificationEvent['type'],
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                data: { [dynamicKey]: String(onChainId), code, authWallet: entity.walletAddress, txHash }
            } as unknown as NotificationEvent;

            dispatcher.notifyEntity(entity.id, notification);

        } catch (err) {
            logger.error({ err, type, code }, 'Indexer failed to process registration event');
        }
    }

    private async handleToggle(type: string, onChainId: bigint, active: boolean, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ type, onChainId: Number(onChainId), active, txHash }, 'Indexer: Entity toggle event — updating isActive');

            // Find entity by onChainId (always set after registration)
            const entity = await prisma.b2BEntity.findFirst({
                where: { onChainId: Number(onChainId) },
                select: { id: true }
            });

            if (!entity) {
                logger.warn({ onChainId: Number(onChainId) }, 'Entity toggled on-chain but not found in local DB');
                return;
            }

            // Directly update the active status — no BlockchainTransaction row needed.
            // The SafeProposal and its SAFE_EXEC BlockchainTransaction already track
            // the governance lifecycle of this toggle action.
            await prisma.b2BEntity.update({
                where: { id: entity.id },
                data: { isActive: active }
            });

            const dynamicKey = `${type.split('_')[0].toLowerCase()}Id`;
            const notification = {
                type: type as NotificationEvent['type'],
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                data: { [dynamicKey]: String(onChainId), active, txHash }
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
                // FIX #4: Set status:SCRAPPED atomically with scrapEntityId + scrapDate
                // Clear authorizedScrapCenterId — contract does `delete authorizedScrapCenter[tokenId]`
                await prisma.vehiclePassport.update({
                    where: { id: vehicle.id },
                    data: {
                        status: VehicleStatus.SCRAPPED,
                        scrapEntityId: scrapEntity.id,
                        scrapDate: new Date(Number(scrapDate) * 1000),
                        authorizedScrapCenterId: null
                    }
                });

                // FIX #2: Deactivate VehicleOwnership — contract burns the ownership NFT during scrap
                await prisma.vehicleOwnership.updateMany({
                    where: { passportId: vehicle.id },
                    data: { isActive: false }
                });
            } else if (vehicle && !scrapEntity) {
                // Scrap center not in DB yet — still record status and date
                logger.warn({ scrapId: Number(scrapId) }, 'Scrap entity not found in DB for VehicleScrapped — scrapEntityId not set');
                await prisma.vehiclePassport.update({
                    where: { id: vehicle.id },
                    data: {
                        status: VehicleStatus.SCRAPPED,
                        scrapDate: new Date(Number(scrapDate) * 1000),
                        authorizedScrapCenterId: null
                    }
                });
                await prisma.vehicleOwnership.updateMany({
                    where: { passportId: vehicle.id },
                    data: { isActive: false }
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

    /**
     * ScrapAuthorized(uint256 indexed tokenId, uint64 indexed scrapId, address indexed owner)
     * Emitted when the vehicle owner calls authorizeScrap().
     * Mirrors on-chain: authorizedScrapCenter[tokenId] = scrapId
     * Cleared to null in handleVehicleScrapped (contract does `delete authorizedScrapCenter[tokenId]`).
     */
    private async handleScrapAuthorized(tokenId: bigint, scrapId: bigint, owner: string, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ tokenId: Number(tokenId), scrapId: Number(scrapId), owner, txHash }, 'DVP: ScrapAuthorized event');

            const [vehicle, scrapEntity, ownerUser] = await Promise.all([
                prisma.vehiclePassport.findUnique({ where: { dvpId: tokenId } }),
                prisma.b2BEntity.findFirst({ where: { onChainId: Number(scrapId) } }),
                prisma.user.findUnique({ where: { walletAddress: owner.toLowerCase() } })
            ]);

            if (!vehicle) {
                return logger.warn({ tokenId: Number(tokenId) }, 'Vehicle not found for ScrapAuthorized');
            }

            // Record who the owner has authorized to scrap this vehicle
            await prisma.vehiclePassport.update({
                where: { id: vehicle.id },
                data: { authorizedScrapCenterId: scrapEntity?.id || null }
            });

            // Notify the scrap center that they have been authorized
            if (scrapEntity) {
                const payload: NotificationEvent = {
                    id: crypto.randomUUID(),
                    type: 'SCRAP_AUTHORIZED',
                    timestamp: Date.now(),
                    data: {
                        dvpId: String(tokenId),
                        scrapId: String(scrapId),
                        ownerWallet: owner,
                        txHash
                    }
                };
                dispatcher.notifyEntity(scrapEntity.id, payload);
                // Also notify the citizen owner for audit trail
                if (ownerUser) {
                    dispatcher.notifyUser(ownerUser.id, payload);
                }
            }
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle ScrapAuthorized');
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
                // Fetch block timestamp once — issueDate must match what the contract set (block.timestamp)
                const block = await event.getBlock();
                const issueDate = new Date(Number(block.timestamp) * 1000);
                
                if (tx?.insuranceId && tx.actionType === TxActionType.INSURANCE_ISSUE) {
                    await prisma.insurancePolicy.update({
                        where: { id: tx.insuranceId },
                        data: {
                            polId,
                            status: InsuranceStatus.ACTIVE,
                            ownerUserId: ownership.ownerUserId,
                            issueDate   // Accurate block timestamp
                        }
                    });
                } else {
                    // Catchup / orphan path — no pre-created DB row
                    await prisma.insurancePolicy.upsert({
                        where: { polId },
                        create: {
                            polId,
                            ownershipId: ownership.id,
                            insEntityId: compEntity.id,
                            expiryDate: new Date(Number(expiry) * 1000),
                            status: InsuranceStatus.ACTIVE,
                            issueDate,  // Accurate block timestamp
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

    private async handlePolicyTerminated(polId: bigint, ownTid: bigint, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ polId: Number(polId), ownTid: Number(ownTid), txHash }, 'Insurance: PolicyTerminated event');

            // Attempt to find by polId first
            let policy = await prisma.insurancePolicy.findUnique({ where: { polId } });

            // If not found by polId (e.g., race condition where PolicyIssued hasn't synced polId yet), 
            // fallback to finding the active policy by ownTid
            if (!policy) {
                policy = await prisma.insurancePolicy.findFirst({
                    where: { 
                        ownTid,
                        status: InsuranceStatus.ACTIVE
                    }
                });
            }

            if (policy) {
                await prisma.insurancePolicy.update({
                    where: { id: policy.id },
                    data: { 
                        polId, // Ensure polId is saved if we found it by ownTid
                        status: InsuranceStatus.CANCELLED 
                    } // Terminated mapped to CANCELLED in DB
                });
            }

            // Note: PolicyTerminated is called via SYSTEM_ROLE during scrapVehicle. 
            // There is no pre-created BlockchainTransaction for this specific action.
            // So we don't call finalizeTx for it.

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'POLICY_TERMINATED',
                timestamp: Date.now(),
                data: { polId: String(polId), ownTid: String(ownTid), txHash }
            };

            if (policy?.ownerUserId) dispatcher.notifyUser(policy.ownerUserId, payload);
            if (policy?.insEntityId) dispatcher.notifyEntity(policy.insEntityId, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle PolicyTerminated');
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
                const block = await event.getBlock();
                const issueDate = new Date(Number(block.timestamp) * 1000);

                if (tx?.pucId && tx.actionType === TxActionType.PUC_ISSUE) {
                    await prisma.pucCertificate.update({
                        where: { id: tx.pucId },
                        data: {
                            certId,
                            status: PucStatus.VALID,
                            ownerUserId: ownership.ownerUserId,
                            issueDate // Accurate block timestamp
                        }
                    });
                } else {
                    // Catchup / orphan path
                    await prisma.pucCertificate.upsert({
                        where: { certId },
                        create: {
                            certId,
                            ownershipId: ownership.id,
                            pucEntityId: tx.b2bEntityId,
                            expiryDate: new Date(Number(expiry) * 1000),
                            status: PucStatus.VALID,
                            issueDate, // Accurate block timestamp
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

    private async handlePucTerminated(certId: bigint, ownTid: bigint, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ certId: Number(certId), ownTid: Number(ownTid), txHash }, 'PUC: PUCTerminated event');

            // Attempt to find by certId first
            let puc = await prisma.pucCertificate.findUnique({ where: { certId } });

            // Fallback to finding the active passed PUC by ownTid (race condition mitigation)
            if (!puc) {
                puc = await prisma.pucCertificate.findFirst({
                    where: { 
                        ownTid,
                        passed: true,
                        status: PucStatus.VALID
                    }
                });
            }

            if (puc) {
                await prisma.pucCertificate.update({
                    where: { id: puc.id },
                    data: { 
                        certId, 
                        status: PucStatus.EXPIRED // Terminated mapped to EXPIRED for certificates
                    }
                });
            }

            // No finalizedTx call needed since it's triggered by scrapVehicle SYSTEM_ROLE

            const payload: NotificationEvent = {
                id: crypto.randomUUID(),
                type: 'PUC_TERMINATED',
                timestamp: Date.now(),
                data: { certId: String(certId), ownTid: String(ownTid), txHash }
            };

            if (puc?.ownerUserId) dispatcher.notifyUser(puc.ownerUserId, payload);
            if (puc?.pucEntityId) dispatcher.notifyEntity(puc.pucEntityId, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle PucTerminated');
        }
    }

    // ─── LOAN EVENT HANDLERS ───

    /**
     * LoanReg(uint64 loanId, uint256 dvpId, uint64 bankId, address borrower, uint128 amount)
     *
     * Fired when a loan is activated on-chain. The bank.service pre-creates a PENDING
     * LoanRecord row (with no loanId) before submitting the tx. We find that pending row
     * and promote it to ACTIVE, injecting the on-chain loanId and borrowerUserId.
     */
    private async handleLoanReg(loanId: bigint, dvpId: bigint, bankId: bigint, borrower: string, amount: bigint, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ loanId: Number(loanId), dvpId: Number(dvpId), txHash }, 'Loan: LoanReg event');

            const [bankEntity, passport, borrowerUser, tx] = await Promise.all([
                prisma.b2BEntity.findFirst({ where: { onChainId: Number(bankId) } }),
                // LoanContract indexes by dvpId — look up the passport
                prisma.vehiclePassport.findUnique({
                    where: { dvpId }
                }),
                prisma.user.findUnique({ where: { walletAddress: borrower.toLowerCase() } }),
                prisma.blockchainTransaction.findUnique({ where: { txHash } })
            ]);

            if (passport && bankEntity) {
                if (tx?.loanId && tx.actionType === TxActionType.LOAN_REG) {
                    // Promote the pre-created PENDING record (bank API pre-created it before mempool)
                    await prisma.loanRecord.update({
                        where: { id: tx.loanId },
                        data: {
                            loanId,
                            status:         LoanStatus.ACTIVE,
                            borrowerUserId: borrowerUser?.id || null,
                        }
                    });
                } else {
                    // Catch-up / orphaned event — upsert a complete record
                    await prisma.loanRecord.upsert({
                        where: { loanId },
                        create: {
                            loanId,
                            passportId:       passport.id,
                            lenderEntityId:   bankEntity.id,
                            borrowerWallet:   borrower.toLowerCase(),
                            borrowerUserId:   borrowerUser?.id || null,
                            amount:           amount.toString(),
                            status:           LoanStatus.ACTIVE,
                            disbursedAt:      new Date(),
                            nocIssued:        false,
                            createdByMemberId: tx?.initiatorMemberId || null
                        },
                        update: {
                            loanId,
                            status:         LoanStatus.ACTIVE,
                            borrowerUserId: borrowerUser?.id || null,
                        }
                    });
                }
            }

            // Finalize the TX with the correct actionType.
            // For a direct registerLoan the actionType is LOAN_REG.
            // For a refinanceLoan the secondary LoanReg fires after handleLoanRefinanced already
            // finalized the tx with LOAN_REFINANCE — skip finalizing to avoid double-write.
            if (!tx?.actionType || tx.actionType === TxActionType.LOAN_REG) {
                await this.finalizeTx(txHash, TxActionType.LOAN_REG, event.blockNumber);
            }

            const payload: NotificationEvent = {
                id:        crypto.randomUUID(),
                type:      'LOAN_REG',
                timestamp: Date.now(),
                data:      { loanId: String(loanId), dvpId: String(dvpId), bankId: String(bankId), amount: String(amount), txHash }
            };
            if (bankEntity) dispatcher.notifyEntity(bankEntity.id, payload);
            if (borrowerUser) dispatcher.notifyUser(borrowerUser.id, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle LoanReg');
        }
    }

    /**
     * NOCIssued(uint64 loanId, uint256 dvpId)
     *
     * Fired when the bank calls issueNOC(). Marks the loan as CLEARED.
     * NOTE: The owner address is NOT in this event — it comes separately from NOCMinted.
     * For unregistered vehicles, NOCMinted may not be emitted, so only NOCIssued fires.
     */
    private async handleNocIssued(loanId: bigint, dvpId: bigint, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ loanId: Number(loanId), dvpId: Number(dvpId), txHash }, 'Loan: NOCIssued event');

            const loan = await prisma.loanRecord.findUnique({ where: { loanId } });

            if (loan) {
                const block = await event.getBlock();
                const nocDate = new Date(Number(block.timestamp) * 1000);
                await prisma.loanRecord.update({
                    where: { loanId },
                    data: {
                        status:    LoanStatus.CLEARED,
                        clearedAt: nocDate,
                        nocIssued: true,
                        nocDate,
                    }
                });
            }

            await this.finalizeTx(txHash, TxActionType.LOAN_CLEAR, event.blockNumber);

            const payload: NotificationEvent = {
                id:        crypto.randomUUID(),
                type:      'NOC_ISSUED',
                timestamp: Date.now(),
                data:      { loanId: String(loanId), dvpId: String(dvpId), txHash }
            };
            if (loan?.lenderEntityId) dispatcher.notifyEntity(loan.lenderEntityId, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle NocIssued');
        }
    }

    /**
     * NOCMinted(uint64 loanId, address owner)
     *
     * Fired immediately after NOCIssued when the vehicle is registered.
     * The contract mints an ERC721 NOC NFT to the current owner.
     * We store the recipient wallet + resolved userId on the LoanRecord.
     */
    private async handleNocMinted(loanId: bigint, owner: string, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ loanId: Number(loanId), owner, txHash }, 'Loan: NOCMinted event');

            const [loan, ownerUser] = await Promise.all([
                prisma.loanRecord.findUnique({ where: { loanId } }),
                prisma.user.findUnique({ where: { walletAddress: owner.toLowerCase() } })
            ]);

            if (loan) {
                await prisma.loanRecord.update({
                    where: { loanId },
                    data: {
                        nocRecipientWallet: owner.toLowerCase(),
                        nocRecipientUserId: ownerUser?.id || null
                    }
                });
            }

            const payload: NotificationEvent = {
                id:        crypto.randomUUID(),
                type:      'NOC_ISSUED',
                timestamp: Date.now(),
                data:      { loanId: String(loanId), ownerWallet: owner, txHash }
            };
            if (ownerUser) dispatcher.notifyUser(ownerUser.id, payload);
            if (loan?.lenderEntityId) dispatcher.notifyEntity(loan.lenderEntityId, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle NocMinted');
        }
    }

    /**
     * LoanRefinanced(uint64 oldLoanId, uint64 newLoanId, uint256 dvpId)
     *
     * Fired when refinanceLoan() is called. The contract closes the old loan atomically
     * and creates a new one, also firing a new LoanReg event for the new loan.
     * We handle the "close old loan" side here; handleLoanReg handles the new loan activation.
     */
    private async handleLoanRefinanced(oldLoanId: bigint, newLoanId: bigint, dvpId: bigint, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ oldLoanId: Number(oldLoanId), newLoanId: Number(newLoanId), dvpId: Number(dvpId), txHash }, 'Loan: LoanRefinanced event');

            const oldLoan = await prisma.loanRecord.findUnique({ where: { loanId: oldLoanId } });

            if (oldLoan) {
                // Mark old loan as CLEARED (refinanced = effectively closed)
                await prisma.loanRecord.update({
                    where: { loanId: oldLoanId },
                    data: {
                        status:    LoanStatus.CLEARED,
                        clearedAt: new Date(),
                        nocIssued: true,   // Mirroring Solidity: loans[oldLoanId].nocIssued = true
                        nocDate:   new Date(),
                    }
                });
            }

            await this.finalizeTx(txHash, TxActionType.LOAN_REFINANCE, event.blockNumber);

            const payload: NotificationEvent = {
                id:        crypto.randomUUID(),
                type:      'LOAN_REFINANCED',
                timestamp: Date.now(),
                data:      { oldLoanId: String(oldLoanId), newLoanId: String(newLoanId), dvpId: String(dvpId), txHash }
            };
            if (oldLoan?.lenderEntityId) dispatcher.notifyEntity(oldLoan.lenderEntityId, payload);
        } catch (err) {
            logger.error({ err, txHash: event.transactionHash }, 'Failed to handle LoanRefinanced');
        }
    }

    private async handlePendingLoanAttached(dvpId: bigint, bankId: bigint, borrower: string, amount: bigint, event: EventLog) {
        const txHash = event.transactionHash;
        logger.info({ txHash, dvpId: dvpId.toString() }, `[INDEXER] PendingLoanAttached => Bank ${bankId}`);

        try {
            await this.finalizeTx(txHash, TxActionType.LOAN_REG, event.blockNumber);

            const [loan, bankEntity] = await Promise.all([
                prisma.loanRecord.findFirst({
                    where: {
                        passport: { dvpId: dvpId },
                        lenderEntity: { onChainId: Number(bankId) },
                        status: LoanStatus.PENDING
                    }
                }),
                prisma.b2BEntity.findFirst({ where: { onChainId: Number(bankId) } })
            ]);

            const payload: NotificationEvent = {
                id:        crypto.randomUUID(),
                type:      'PENDING_LOAN_ATTACHED',
                timestamp: Date.now(),
                data:      { dvpId: String(dvpId), bankId: String(bankId), borrower, amount: amount.toString(), txHash }
            };

            const targetEntityId = loan?.lenderEntityId || bankEntity?.id;
            if (targetEntityId) {
                dispatcher.notifyEntity(targetEntityId, payload);
            }
        } catch (err) {
            logger.error({ err, txHash }, 'Failed to handle PendingLoanAttached');
        }
    }

    private async handlePendingLoanCancelled(dvpId: bigint, bankId: bigint, event: EventLog) {
        const txHash = event.transactionHash;
        logger.info({ txHash, dvpId: dvpId.toString() }, `[INDEXER] PendingLoanCancelled => Bank ${bankId}`);

        try {
            // Resolve the bank entity and delete the pending loan in parallel
            const [_, bankEntity] = await Promise.all([
                prisma.loanRecord.deleteMany({
                    where: {
                        passport: { dvpId: dvpId },
                        lenderEntity: { onChainId: Number(bankId) },
                        status: LoanStatus.PENDING
                    }
                }),
                prisma.b2BEntity.findFirst({ where: { onChainId: Number(bankId) } })
            ]);

            await this.finalizeTx(txHash, TxActionType.LOAN_CANCEL_PENDING, event.blockNumber);

            const payload: NotificationEvent = {
                id:        crypto.randomUUID(),
                type:      'PENDING_LOAN_CANCELLED',
                timestamp: Date.now(),
                data:      { dvpId: String(dvpId), bankId: String(bankId), txHash }
            };

            if (bankEntity) {
                dispatcher.notifyEntity(bankEntity.id, payload);
            }
        } catch (err) {
            logger.error({ err, txHash }, 'Failed to handle PendingLoanCancelled');
        }
    }

    // ─── GNOSIS SAFE GOVERNANCE HANDLERS ───


    /**
     * Handles ExecutionSuccess(bytes32 txHash, uint256 payment) from the MoRTH Gnosis Safe.
     *
     * This is the crash-recovery safety net: if the BullMQ worker submitted the
     * execTransaction to the Besu mempool but the server crashed before
     * transactionResponse.wait() resolved, the proposal would be stuck as THRESHOLD_MET.
     * This handler ensures the on-chain event is the definitive source of truth.
     *
     * It is also idempotent — if the worker already marked it EXECUTED, this is a no-op.
     */
    private async handleSafeExecutionSuccess(safeTxHash: string, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.info({ safeTxHash, txHash }, 'GnosisSafe: ExecutionSuccess — marking SafeProposal EXECUTED');

            const proposal = await prisma.safeProposal.findUnique({
                where: { safeTxHash }
            });

            if (!proposal) {
                // Could be a tx from a different tool (Ledger Live, Safe UI) — not our proposal
                logger.warn({ safeTxHash }, 'ExecutionSuccess received but no matching SafeProposal in DB — ignoring');
                return;
            }

            // Group updates in a single transaction
            await prisma.$transaction(async (db) => {
                if (proposal.status !== SafeProposalStatus.EXECUTED) {
                    await db.safeProposal.update({
                        where: { id: proposal.id },
                        data: { status: SafeProposalStatus.EXECUTED, executedAt: new Date() }
                    });
                    logger.info({ proposalId: proposal.id, safeTxHash, txHash }, 'SafeProposal marked EXECUTED by indexer (crash-recovery path)');
                }

                await db.blockchainTransaction.upsert({
                    where: { txHash },
                    update: { status: SyncStatus.MINED, blockNumber: event.blockNumber },
                    create: {
                        txHash,
                        actionType: TxActionType.SAFE_EXEC,
                        status:     SyncStatus.MINED,
                        blockNumber: event.blockNumber,
                        safeProposalId: proposal.id,
                    }
                });
            });

        } catch (err) {
            logger.error({ err, safeTxHash, txHash: event.transactionHash }, 'Indexer failed to handle ExecutionSuccess');
        }
    }

    /**
     * Handles ExecutionFailure(bytes32 txHash, uint256 payment) from the MoRTH Gnosis Safe.
     *
     * The Safe emits ExecutionFailure when execTransaction() is called but the inner
     * transaction (the one Safe is proxying) reverts on-chain. The outer tx still
     * succeeds (gas is consumed), but the governance action itself did not execute.
     * This marks the proposal EXECUTION_FAILED so manual fallback can be triggered.
     */
    private async handleSafeExecutionFailure(safeTxHash: string, event: EventLog) {
        try {
            const txHash = event.transactionHash;
            logger.warn({ safeTxHash, txHash }, 'GnosisSafe: ExecutionFailure — inner tx reverted, marking SafeProposal EXECUTION_FAILED');

            const proposal = await prisma.safeProposal.findUnique({
                where: { safeTxHash }
            });

            if (!proposal) {
                logger.warn({ safeTxHash }, 'ExecutionFailure received but no matching SafeProposal in DB — ignoring');
                return;
            }

            if (proposal.status === SafeProposalStatus.EXECUTED) {
                logger.error({ safeTxHash, proposalId: proposal.id }, 'Received ExecutionFailure for an already EXECUTED proposal — ignoring');
                return;
            }

            await prisma.$transaction(async (db) => {
                // Mark the SafeProposal as EXECUTION_FAILED
                await db.safeProposal.update({
                    where: { id: proposal.id },
                    data: { status: SafeProposalStatus.EXECUTION_FAILED }
                });

                // Mark the SAFE_EXEC BlockchainTransaction as FAILED.
                // ExecutionFailure means execTransaction() itself succeeded on-chain
                // (gas consumed), but the inner call reverted — so the tx IS mined but FAILED.
                await db.blockchainTransaction.upsert({
                    where: { txHash },
                    update: { status: SyncStatus.FAILED, blockNumber: event.blockNumber },
                    create: {
                        txHash,
                        actionType:    TxActionType.SAFE_EXEC,
                        status:        SyncStatus.FAILED,
                        blockNumber:   event.blockNumber,
                        safeProposalId: proposal.id,
                    }
                });
            });

            logger.warn({ proposalId: proposal.id, safeTxHash, txHash }, 'SafeProposal marked EXECUTION_FAILED by indexer — retry via POST /admin/proposals/:id/execute');
        } catch (err) {
            logger.error({ err, safeTxHash, txHash: event.transactionHash }, 'Indexer failed to handle ExecutionFailure');
        }
    }
}

// Export singleton instance
export const indexerService = new IndexerService();
