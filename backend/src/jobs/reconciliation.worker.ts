import { Worker, type ConnectionOptions } from 'bullmq';
import { JsonRpcProvider, Interface, type TransactionReceipt } from 'ethers';
import { getRedisClient } from '@/lib/redis';
import prisma from '@/lib/prisma';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import crypto from 'crypto';
import { 
    SyncStatus, 
    TxActionType, 
    EntityType, 
    VehicleStatus, 
    TransferStatus, 
    ChallanStatus, 
    InsuranceStatus, 
    PucStatus, 
    LoanStatus,
    type BlockchainTransaction, 
    type B2BEntity 
} from '@/generated/prisma/client';
import { RECONCILIATION_QUEUE_NAME } from './reconciliation.queue';
import { RedisKeys } from '@/config/redis.keys';
import type { NotificationEvent } from '@/modules/notification/notification.types';
import { workerManager } from '@/lib/worker-manager';

// Import ABIs for event parsing
import DvpAbi from '@/abi/DigitalVehiclePassport.json';
import OwnershipAbi from '@/abi/OwnershipToken.json';
import ChallanAbi from '@/abi/ChallanContract.json';
import InsuranceAbi from '@/abi/InsuranceToken.json';
import PucAbi from '@/abi/PUCToken.json';
import LoanAbi from '@/abi/LoanContract.json';

const provider = new JsonRpcProvider(env.RPC_URL);

// Prepare Interfaces for fast log parsing
const interfaces = {
    dvp: new Interface(DvpAbi),
    ownership: new Interface(OwnershipAbi),
    challan: new Interface(ChallanAbi),
    insurance: new Interface(InsuranceAbi),
    puc: new Interface(PucAbi),
    loan: new Interface(LoanAbi),
};

export const reconciliationWorker = new Worker(RECONCILIATION_QUEUE_NAME, async (job) => {
    logger.info({ jobId: job.id }, 'Starting global blockchain reconciliation sweep...');

    await reconcileTransactions();
    
    logger.info('Global blockchain reconciliation sweep completed.');
}, {
    connection: getRedisClient() as unknown as ConnectionOptions,
    concurrency: 1
});

workerManager.add(reconciliationWorker);

async function reconcileTransactions() {
    // Find transactions pending for more than 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const BATCH_SIZE = 50;
    let cursor: string | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
        const stuckTxs: BlockchainTransaction[] = await prisma.blockchainTransaction.findMany({
            where: {
                status: SyncStatus.PENDING,
                createdAt: { lt: fiveMinutesAgo }
            },
            take: BATCH_SIZE,
            skip: cursor ? 1 : 0,
            cursor: cursor ? { id: cursor } : undefined,
            orderBy: { id: 'asc' }, // Required for stable cursor pagination
        });

        if (stuckTxs.length === 0) {
            hasMore = false;
            break;
        }

        logger.info({ count: stuckTxs.length }, 'Processing batch of stuck blockchain transactions for reconciliation');

        for (const tx of stuckTxs) {
            try {
                const receipt = await provider.getTransactionReceipt(tx.txHash);

                if (!receipt) {
                    // Transaction still pending in mempool or dropped. Wait for next sweep.
                    logger.debug({ id: tx.id, txHash: tx.txHash }, 'Transaction still pending or dropped on-chain');
                    continue;
                }

                if (receipt.status === 0) {
                    // Transaction Reverted! 
                    logger.warn({ id: tx.id, txHash: tx.txHash }, 'Transaction reverted on-chain. Marking FAILED and running Saga rollbacks.');
                    
                    await prisma.blockchainTransaction.update({
                        where: { id: tx.id },
                        data: { status: SyncStatus.FAILED, blockNumber: receipt.blockNumber }
                    });

                    // Run explicit rollback saga
                    await handleRevertedRollback(tx);
                    continue;
                }

                if (receipt.status === 1) {
                    // Transaction Succeeded! The Indexer missed the event.
                    logger.info({ id: tx.id, txHash: tx.txHash, action: tx.actionType }, 'Transaction succeeded but was missed by Indexer. Reconciling manually.');
                    
                    await handleSuccessfulReconciliation(tx, receipt);
                }

            } catch (err) {
                logger.error({ err, txId: tx.id }, 'Error during transaction reconciliation');
            }
        }
        
        // Update cursor to the last processed item for the next iteration
        cursor = stuckTxs[stuckTxs.length - 1].id;
    }
}

// Returns a Map<eventName, LogDescription> containing the first occurrence of each event.
function parseReceiptEvents(receipt: TransactionReceipt): Map<string, ReturnType<Interface['parseLog']>> {
    const eventMap = new Map<string, ReturnType<Interface['parseLog']>>();
    const allInterfaces = Object.values(interfaces);
    for (const log of receipt.logs) {
        for (const iface of allInterfaces) {
            try {
                const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
                if (parsed && !eventMap.has(parsed.name)) {
                    eventMap.set(parsed.name, parsed);
                }
            } catch { /* skip unparseable logs */ }
        }
    }
    return eventMap;
}

// Lazy block timestamp — only fetched when needed (e.g. CHALLAN_PAY/CANCEL).
async function getBlockTimestamp(blockNumber: number): Promise<Date> {
    const block = await provider.getBlock(Number(blockNumber));
    return block ? new Date(block.timestamp * 1000) : new Date();
}

async function handleSuccessfulReconciliation(tx: BlockchainTransaction, receipt: TransactionReceipt) {
    let postCommitFn: (() => void) | null = null;
    // Pre-parse all events from the receipt once — avoids redundant log iteration per handler.
    const events = parseReceiptEvents(receipt);

    await prisma.$transaction(async (db) => {
        // Mark the transaction as MINED
        await db.blockchainTransaction.update({
            where: { id: tx.id },
            data: { status: SyncStatus.MINED, blockNumber: receipt.blockNumber }
        });

        if (tx.actionType === TxActionType.B2B_ENTITY_REGISTER && tx.b2bEntityId) {
            const entity = await db.b2BEntity.findUnique({ where: { id: tx.b2bEntityId } });
            if (!entity) return;

            const onChainId = extractEntityIdFromReceipt(entity, receipt);
            if (onChainId === null) {
                throw new Error('Failed to parse onChainId from receipt logs during B2B_ENTITY_REGISTER reconciliation');
            }

            await db.b2BEntity.update({
                where: { id: entity.id },
                data: { onChainId: Number(onChainId) }
            });

            postCommitFn = () => broadcastEntityMined(entity, onChainId, tx.txHash);
        } 
        else if (tx.actionType === TxActionType.B2B_ENTITY_TOGGLE && tx.b2bEntityId) {
            const entity = await db.b2BEntity.findUnique({ where: { id: tx.b2bEntityId } });
            if (!entity) return;

            // Parse toggle log depending on the entity type
            // All toggle events are pre-parsed in the events map; just look up by eventName.

            let eventName = '';
            switch (entity.type) {
                case EntityType.MANUFACTURER: eventName = 'MfgToggled'; break;
                case EntityType.SCRAP_CENTER: eventName = 'ScrapToggled'; break;
                case EntityType.RTO:          eventName = 'RTOStatusToggled'; break;
                case EntityType.POLICE:       eventName = 'PoliceStatusToggled'; break;
                case EntityType.INSURANCE:    eventName = 'InsStatusToggled'; break;
                case EntityType.PUC_CENTER:   eventName = 'CenterStatusToggled'; break;
                case EntityType.BANK:         eventName = 'BankStatusToggled'; break;
                default:
                    return;
            }

            const event = events.get(eventName);
            if (event) {
                const active = event.args[1] as boolean;
                await db.b2BEntity.update({
                    where: { id: entity.id },
                    data: { isActive: active }
                });
            }
        }
        else if (tx.actionType === TxActionType.VEHICLE_MINT && tx.passportId) {
            const event = events.get('VehicleMfg');
            if (event) {
                const tokenId = event.args[0];
                await db.vehiclePassport.update({
                    where: { id: tx.passportId },
                    data: {
                        dvpId: Number(tokenId),
                        status: VehicleStatus.NOT_REG
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.VEHICLE_SCRAP && tx.passportId) {
            const event = events.get('VehicleScrapped');
            if (event) {
                const scrapDate = event.args[2];
                await db.vehiclePassport.update({
                    where: { id: tx.passportId },
                    data: {
                        status: VehicleStatus.SCRAPPED,
                        scrapDate: new Date(Number(scrapDate) * 1000)
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.VEHICLE_ASSIGN_DEALER && tx.passportId) {
            const event = events.get('VehicleAssignedToDealer');
            if (event) {
                const dealer = event.args[2] as string;
                const dealerUser = await db.user.findUnique({
                    where: { walletAddress: dealer }
                });
                await db.vehiclePassport.update({
                    where: { id: tx.passportId },
                    data: {
                        dealerWallet: dealer,
                        dealerUserId: dealerUser?.id || null
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.VEHICLE_REGISTER_RTO && tx.ownershipId) {
            const event = events.get('VehicleReg');
            if (event) {
                const ownTid = event.args[0];
                const owner = event.args[1] as string;
                const dvpId = event.args[3];
                const ownerUser = await db.user.findUnique({
                    where: { walletAddress: owner }
                });
                
                const updatedOwnership = await db.vehicleOwnership.update({
                    where: { id: tx.ownershipId },
                    data: {
                        ownTid: Number(ownTid),
                        dvpId: Number(dvpId),
                        isActive: true,
                        ownerUserId: ownerUser?.id || null
                    }
                });

                await db.vehiclePassport.update({
                    where: { id: updatedOwnership.passportId },
                    data: {
                        status: VehicleStatus.ACTIVE
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.TRANSFER_INIT && tx.transferReqId) {
            const event = events.get('XferInit');
            if (event) {
                const reqId = event.args[0];
                const ownTid = event.args[1];
                const seller = event.args[2] as string;
                const buyer = event.args[3] as string;

                const sellerUser = await db.user.findUnique({ where: { walletAddress: seller } });
                const buyerUser = await db.user.findUnique({ where: { walletAddress: buyer } });

                await db.transferRequest.update({
                    where: { id: tx.transferReqId },
                    data: {
                        reqId: Number(reqId),
                        ownTid: Number(ownTid),
                        sellerOK: true,
                        status: TransferStatus.PENDING,
                        sellerUserId: sellerUser?.id || null,
                        buyerUserId: buyerUser?.id || null
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.TRANSFER_APPROVE_BUYER && tx.transferReqId) {
            const appEvent = events.get('XferApproved');
            const doneEvent = events.get('XferDone');

            if (doneEvent) {
                const newOwner = doneEvent.args[2] as string;
                const ownerUser = await db.user.findUnique({ where: { walletAddress: newOwner } });

                const updatedReq = await db.transferRequest.update({
                    where: { id: tx.transferReqId },
                    data: {
                        buyerOK: true,
                        status: TransferStatus.RTO_APPROVED,
                        completedDate: new Date()
                    }
                });

                await db.vehicleOwnership.update({
                    where: { id: updatedReq.ownershipId },
                    data: {
                        ownerWallet: newOwner,
                        ownerUserId: ownerUser?.id || null,
                        transferCount: { increment: 1 }
                    }
                });
            } else if (appEvent) {
                await db.transferRequest.update({
                    where: { id: tx.transferReqId },
                    data: {
                        buyerOK: true,
                        status: TransferStatus.BUYER_ACCEPTED
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.TRANSFER_APPROVE_RTO && tx.transferReqId) {
            const doneEvent = events.get('XferDone');
            if (doneEvent) {
                const newOwner = doneEvent.args[2] as string;
                const ownerUser = await db.user.findUnique({ where: { walletAddress: newOwner } });

                const updatedReq = await db.transferRequest.update({
                    where: { id: tx.transferReqId },
                    data: {
                        rtoOK: true,
                        status: TransferStatus.RTO_APPROVED,
                        completedDate: new Date()
                    }
                });

                await db.vehicleOwnership.update({
                    where: { id: updatedReq.ownershipId },
                    data: {
                        ownerWallet: newOwner,
                        ownerUserId: ownerUser?.id || null,
                        transferCount: { increment: 1 }
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.TRANSFER_CANCEL && tx.transferReqId) {
            await db.transferRequest.update({
                where: { id: tx.transferReqId },
                data: {
                    status: TransferStatus.CANCELLED
                }
            });
        }
        else if (tx.actionType === TxActionType.TRADE_CERT_ISSUE && tx.tradeCertId) {
            // FIX #4: Resolve dealerUserId from dealer wallet (args[0]) — missed in original.
            const event = events.get('TradeCertIssued');
            if (event) {
                const dealer = event.args[0] as string;
                const validTill = event.args[2];
                const dealerUser = await db.user.findUnique({ where: { walletAddress: dealer } });
                await db.tradeCert.update({
                    where: { id: tx.tradeCertId },
                    data: {
                        isActive: true,
                        validTill: new Date(Number(validTill) * 1000),
                        dealerUserId: dealerUser?.id || null
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.TRADE_CERT_REVOKE && tx.tradeCertId) {
            await db.tradeCert.update({
                where: { id: tx.tradeCertId },
                data: { isActive: false }
            });
        }
        else if (tx.actionType === TxActionType.CHALLAN_ISSUE && tx.challanId) {
            // FIX #1: Write ownTid from args[1] — ChallanIssued(challanId, ownTid, policeId, amount)
            const event = events.get('ChallanIssued');
            if (event) {
                await db.challan.update({
                    where: { id: tx.challanId },
                    data: {
                        challanId: BigInt(event.args[0]),
                        ownTid: BigInt(event.args[1]),
                        status: ChallanStatus.PENDING
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.CHALLAN_PAY && tx.challanId) {
            // FIX #10: Use on-chain block timestamp, not server wall-clock time.
            const paidAt = await getBlockTimestamp(receipt.blockNumber);
            await db.challan.update({
                where: { id: tx.challanId },
                data: { status: ChallanStatus.PAID, paidAt }
            });
        }
        else if (tx.actionType === TxActionType.CHALLAN_CANCEL && tx.challanId) {
            // FIX #2: Write isAdminCancel from args[2] — ChallanCancelled(challanId, ownTid, isAdminCancel)
            // FIX #10: Use on-chain block timestamp.
            const cancelledAt = await getBlockTimestamp(receipt.blockNumber);
            const event = events.get('ChallanCancelled');
            await db.challan.update({
                where: { id: tx.challanId },
                data: {
                    status: ChallanStatus.CANCELLED,
                    cancelledAt,
                    isAdminCancel: event ? (event.args[2] as boolean) : false
                }
            });
        }
        else if (tx.actionType === TxActionType.INSURANCE_ISSUE && tx.insuranceId) {
            // PolicyIssued(polId, ownTid, compId, expiry)
            const event = events.get('PolicyIssued');
            if (event) {
                await db.insurancePolicy.update({
                    where: { id: tx.insuranceId },
                    data: {
                        polId: Number(event.args[0]),
                        status: InsuranceStatus.ACTIVE
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.INSURANCE_CLAIM && tx.insuranceId) {
            // FIX #6: Handle ClaimFiled(polId, claimNum) — increment claimCount.
            const event = events.get('ClaimFiled');
            if (event) {
                await db.insurancePolicy.update({
                    where: { id: tx.insuranceId },
                    data: { claimCount: { increment: 1 } }
                });
            }
        }
        else if (tx.actionType === TxActionType.INSURANCE_EXPIRE && tx.insuranceId) {
            // FIX #7: Handle PolicyExpired(polId) — mark policy EXPIRED.
            await db.insurancePolicy.update({
                where: { id: tx.insuranceId },
                data: { status: InsuranceStatus.EXPIRED }
            });
        }
        else if (tx.actionType === TxActionType.PUC_ISSUE && tx.pucId) {
            // FIX #3 & #5: PUCIssued(certId, ownTid, passed, expiry) — write all fields.
            const event = events.get('PUCIssued');
            if (event) {
                const passed = event.args[2] as boolean;
                const expiry = event.args[3];
                await db.pucCertificate.update({
                    where: { id: tx.pucId },
                    data: {
                        certId: BigInt(event.args[0]),
                        ownTid: BigInt(event.args[1]),
                        passed,
                        // A cert issued with passed=false should be VALID (recorded) but not pass-status
                        status: PucStatus.VALID,
                        expiryDate: new Date(Number(expiry) * 1000)
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.PUC_EXPIRE && tx.pucId) {
            // FIX #8: Handle PUCExpired(certId) — mark certificate EXPIRED.
            await db.pucCertificate.update({
                where: { id: tx.pucId },
                data: { status: PucStatus.EXPIRED }
            });
        }
        else if (tx.actionType === TxActionType.LOAN_DISBURSE && tx.loanId) {
            const event = events.get('LoanReg');
            if (event) {
                const loanId = event.args[0];
                await db.loanRecord.update({
                    where: { id: tx.loanId },
                    data: {
                        loanId: Number(loanId),
                        status: LoanStatus.ACTIVE
                    }
                });
            }
        }
        else if (tx.actionType === TxActionType.LOAN_CLEAR && tx.loanId) {
            const event = events.get('NOCIssued');
            if (event) {
                const owner = event.args[2] as string;
                const ownerUser = await db.user.findUnique({ where: { walletAddress: owner } });

                await db.loanRecord.update({
                    where: { id: tx.loanId },
                    data: {
                        status: LoanStatus.CLEARED,
                        nocIssued: true,
                        nocDate: new Date(),
                        nocRecipientWallet: owner,
                        nocRecipientUserId: ownerUser?.id || null
                    }
                });
            }
        }
    });

    if (postCommitFn) {
        try { (postCommitFn as () => void)(); }
        catch (err) { logger.error({ err }, 'Error broadcasting notification after transaction commit'); }
    }
}

// FIX: Rollback operations are independent compensating actions.
// Wrapping them in a single $transaction was wrong — if one step failed,
// the whole transaction rolled back, preventing subsequent compensations from running.
async function handleRevertedRollback(tx: BlockchainTransaction) {
    const db = prisma; // Use global client; each operation is independent best-effort.
        if (tx.actionType === TxActionType.B2B_ENTITY_REGISTER && tx.b2bEntityId) {
            logger.warn({ b2bEntityId: tx.b2bEntityId }, 'Saga Rollback: Deleting local B2BEntity as registration failed.');
            await db.b2BEntity.delete({ where: { id: tx.b2bEntityId } }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.VEHICLE_MINT && tx.passportId) {
            logger.warn({ passportId: tx.passportId }, 'Saga Rollback: Deleting local VehiclePassport as mint failed.');
            await db.vehiclePassport.delete({ where: { id: tx.passportId } }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.VEHICLE_SCRAP && tx.passportId) {
            logger.warn({ passportId: tx.passportId }, 'Saga Rollback: Reverting VehiclePassport status to ACTIVE.');
            await db.vehiclePassport.update({
                where: { id: tx.passportId },
                data: { status: VehicleStatus.ACTIVE }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.VEHICLE_ASSIGN_DEALER && tx.passportId) {
            logger.warn({ passportId: tx.passportId }, 'Saga Rollback: Clearing assigned dealer.');
            await db.vehiclePassport.update({
                where: { id: tx.passportId },
                data: { dealerWallet: null, dealerUserId: null }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.VEHICLE_REGISTER_RTO && tx.ownershipId) {
            logger.warn({ ownershipId: tx.ownershipId }, 'Saga Rollback: Deleting local VehicleOwnership.');
            const ownership = await db.vehicleOwnership.delete({ where: { id: tx.ownershipId } }).catch(() => null);
            if (ownership) {
                await db.vehiclePassport.update({
                    where: { id: ownership.passportId },
                    data: { status: VehicleStatus.NOT_REG }
                }).catch(() => {});
            }
        }
        else if (tx.actionType === TxActionType.TRANSFER_INIT && tx.transferReqId) {
            logger.warn({ transferReqId: tx.transferReqId }, 'Saga Rollback: Deleting local TransferRequest.');
            await db.transferRequest.delete({ where: { id: tx.transferReqId } }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.TRANSFER_APPROVE_BUYER && tx.transferReqId) {
            logger.warn({ transferReqId: tx.transferReqId }, 'Saga Rollback: Reverting buyer approval.');
            await db.transferRequest.update({
                where: { id: tx.transferReqId },
                data: { buyerOK: false, status: TransferStatus.PENDING }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.TRANSFER_APPROVE_RTO && tx.transferReqId) {
            logger.warn({ transferReqId: tx.transferReqId }, 'Saga Rollback: Reverting RTO approval.');
            await db.transferRequest.update({
                where: { id: tx.transferReqId },
                data: { rtoOK: false, status: TransferStatus.BUYER_ACCEPTED }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.TRANSFER_CANCEL && tx.transferReqId) {
            logger.warn({ transferReqId: tx.transferReqId }, 'Saga Rollback: Reverting cancellation.');
            await db.transferRequest.update({
                where: { id: tx.transferReqId },
                data: { status: TransferStatus.PENDING }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.TRADE_CERT_ISSUE && tx.tradeCertId) {
            logger.warn({ tradeCertId: tx.tradeCertId }, 'Saga Rollback: Deleting TradeCert.');
            await db.tradeCert.delete({ where: { id: tx.tradeCertId } }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.TRADE_CERT_REVOKE && tx.tradeCertId) {
            logger.warn({ tradeCertId: tx.tradeCertId }, 'Saga Rollback: Reverting TradeCert revocation.');
            await db.tradeCert.update({
                where: { id: tx.tradeCertId },
                data: { isActive: true }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.CHALLAN_ISSUE && tx.challanId) {
            logger.warn({ challanId: tx.challanId }, 'Saga Rollback: Deleting Challan.');
            await db.challan.delete({ where: { id: tx.challanId } }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.CHALLAN_PAY && tx.challanId) {
            logger.warn({ challanId: tx.challanId }, 'Saga Rollback: Reverting Challan payment.');
            await db.challan.update({
                where: { id: tx.challanId },
                data: { status: ChallanStatus.PENDING, paidAt: null }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.CHALLAN_CANCEL && tx.challanId) {
            logger.warn({ challanId: tx.challanId }, 'Saga Rollback: Reverting Challan cancellation.');
            await db.challan.update({
                where: { id: tx.challanId },
                data: { status: ChallanStatus.PENDING, cancelledAt: null }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.INSURANCE_ISSUE && tx.insuranceId) {
            logger.warn({ insuranceId: tx.insuranceId }, 'Saga Rollback: Deleting InsurancePolicy.');
            await db.insurancePolicy.delete({ where: { id: tx.insuranceId } }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.PUC_ISSUE && tx.pucId) {
            logger.warn({ pucId: tx.pucId }, 'Saga Rollback: Deleting PucCertificate.');
            await db.pucCertificate.delete({ where: { id: tx.pucId } }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.LOAN_DISBURSE && tx.loanId) {
            logger.warn({ loanId: tx.loanId }, 'Saga Rollback: Deleting LoanRecord.');
            await db.loanRecord.delete({ where: { id: tx.loanId } }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.LOAN_CLEAR && tx.loanId) {
            logger.warn({ loanId: tx.loanId }, 'Saga Rollback: Reverting Loan clearance.');
            await db.loanRecord.update({
                where: { id: tx.loanId },
                data: {
                    status: LoanStatus.ACTIVE,
                    nocIssued: false,
                    nocDate: null,
                    nocRecipientWallet: null,
                    nocRecipientUserId: null
                }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.INSURANCE_CLAIM && tx.insuranceId) {
            logger.warn({ insuranceId: tx.insuranceId }, 'Saga Rollback: Reverting insurance claim count.');
            await db.insurancePolicy.update({
                where: { id: tx.insuranceId },
                data: { claimCount: { decrement: 1 } }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.INSURANCE_EXPIRE && tx.insuranceId) {
            logger.warn({ insuranceId: tx.insuranceId }, 'Saga Rollback: Reverting insurance expiry.');
            await db.insurancePolicy.update({
                where: { id: tx.insuranceId },
                data: { status: InsuranceStatus.ACTIVE }
            }).catch(() => {});
        }
        else if (tx.actionType === TxActionType.PUC_EXPIRE && tx.pucId) {
            logger.warn({ pucId: tx.pucId }, 'Saga Rollback: Reverting PUC expiry.');
            await db.pucCertificate.update({
                where: { id: tx.pucId },
                data: { status: PucStatus.VALID }
            }).catch(() => {});
        }
}

// FIX #9: Must filter by SPECIFIC event name per entity type.
// Previous bug: returned args[0] of the first parseable DVP log which could be a VehicleMfg tokenId,
// not the mfgId — causing garbage onChainId to be written.
const ENTITY_REG_EVENT: Partial<Record<EntityType, { eventName: string; iface: Interface }>> = {
    [EntityType.MANUFACTURER]:  { eventName: 'MfgReg',            iface: interfaces.dvp },
    [EntityType.SCRAP_CENTER]:  { eventName: 'ScrapReg',          iface: interfaces.dvp },
    [EntityType.RTO]:           { eventName: 'RTOReg',            iface: interfaces.ownership },
    [EntityType.POLICE]:        { eventName: 'PoliceReg',         iface: interfaces.challan },
    [EntityType.INSURANCE]:     { eventName: 'InsReg',            iface: interfaces.insurance },
    [EntityType.PUC_CENTER]:    { eventName: 'CenterReg',         iface: interfaces.puc },
    [EntityType.BANK]:          { eventName: 'BankReg',           iface: interfaces.loan },
};

function extractEntityIdFromReceipt(entity: B2BEntity, receipt: TransactionReceipt): bigint | null {
    const meta = ENTITY_REG_EVENT[entity.type];
    if (!meta) return null;

    for (const log of receipt.logs) {
        try {
            const parsed = meta.iface.parseLog({ topics: log.topics as string[], data: log.data });
            // Only accept the registration event — reject tokenId logs from same contract.
            if (parsed && parsed.name === meta.eventName && parsed.args[0] !== undefined) {
                return BigInt(parsed.args[0]);
            }
        } catch { continue; }
    }
    return null;
}

function broadcastEntityMined(entity: B2BEntity, onChainId: bigint, txHash: string) {
    const redisPublisher = getRedisClient();
    
    // Determine the event type based on entity type to match Indexer
    let typeStr = '';
    switch (entity.type) {
        case EntityType.MANUFACTURER: typeStr = 'MFG_REG'; break;
        case EntityType.SCRAP_CENTER: typeStr = 'SCRAP_REG'; break;
        case EntityType.RTO: typeStr = 'RTO_REG'; break;
        case EntityType.POLICE: typeStr = 'POLICE_REG'; break;
        case EntityType.INSURANCE: typeStr = 'INS_REG'; break;
        case EntityType.PUC_CENTER: typeStr = 'PUC_CENTER_REG'; break;
        case EntityType.BANK: typeStr = 'BANK_REG'; break;
        default: return;
    }

    const dynamicKey = `${typeStr.split('_')[0].toLowerCase()}Id`;
    const notification = {
        type: typeStr as NotificationEvent['type'],
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        data: {
            [dynamicKey]: String(onChainId),
            code: entity.code,
            authWallet: entity.walletAddress,
            txHash
        }
    } as unknown as NotificationEvent;

    redisPublisher.publish(RedisKeys.NOTIFICATION_CHANNEL('entity', entity.id), JSON.stringify(notification));
}
