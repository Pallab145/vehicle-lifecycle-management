import prisma from '@/lib/prisma';
import { SyncStatus, TxActionType, TxSource, Prisma, LoanStatus } from '@/generated/prisma/client';

export const bankRepository = {

    // ─── VEHICLE / OWNERSHIP LOOKUPS ─────────────────────────────────────────

    /**
     * Resolves a VehiclePassport by Ownership Token ID.
     * Used to get the dvpId before calling the LoanContract (which indexes by dvpId).
     */
    async findPassportByOwnTid(ownTid: bigint) {
        return prisma.vehicleOwnership.findUnique({
            where: { ownTid },
            include: {
                passport: {
                    select: { id: true, dvpId: true, mfgEntityId: true }
                }
            }
        });
    },

    // ─── LOAN LOOKUPS ────────────────────────────────────────────────────────

    /**
     * Get a single loan record by its DB ID, with linked ownership context.
     */
    async getLoanById(loanId: string) {
        return prisma.loanRecord.findUnique({
            where: { id: loanId },
            include: {
                passport: {
                    select: { dvpId: true, vinHash: true }
                }
            }
        });
    },

    /**
     * Checks for an existing ACTIVE loan on a vehicle using dvpId.
     * The LoanContract maps loans by dvpId — this must match.
     */
    async findActiveOrPendingLoanByDvpId(dvpId: bigint) {
        return prisma.loanRecord.findFirst({
            where: {
                passport: { dvpId },
                status: { in: [LoanStatus.ACTIVE, LoanStatus.PENDING] },
                nocIssued: false,
            }
        });
    },

    /**
     * Finds a PENDING loan on a vehicle using its dvpId for a specific bank.
     */
    async findPendingLoanByDvpIdAndBank(dvpId: bigint, bankEntityId: string) {
        return prisma.loanRecord.findFirst({
            where: {
                passport: { dvpId },
                lenderEntityId: bankEntityId,
                status: LoanStatus.PENDING,
                nocIssued: false,
            },
            include: {
                passport: {
                    select: { dvpId: true, vinHash: true }
                }
            }
        });
    },

    // ─── LOAN CREATION TRANSACTIONS ──────────────────────────────────────────

    /**
     * Atomically creates a PENDING LoanRecord and its BlockchainTransaction tracker.
     * Status is PENDING — the Indexer's LoanReg event handler sets it to ACTIVE.
     */
    async createPendingLoanTx(data: {
        amount: string;
        tenure: number;
        lenderEntityId: string;
        memberId: string;
        borrowerWallet: string;
        txHash: string;
        passportId: string;
    }) {
        return prisma.$transaction(async (tx) => {
            const loan = await tx.loanRecord.create({
                data: {
                    passportId:       data.passportId,
                    lenderEntityId:   data.lenderEntityId,
                    borrowerWallet:   data.borrowerWallet,
                    amount:           data.amount,
                    tenure:           data.tenure,
                    // PENDING — NOT active. The indexer sets this to ACTIVE on LoanReg event.
                    status:           LoanStatus.PENDING,
                    disbursedAt:      new Date(),
                    nocIssued:        false,
                    createdByMemberId: data.memberId
                }
            });

            await tx.blockchainTransaction.create({
                data: {
                    txHash:           data.txHash,
                    actionType:       TxActionType.LOAN_REG,
                    loanId:           loan.id,
                    b2bEntityId:      data.lenderEntityId,
                    initiatorMemberId: data.memberId,
                    txSource:         TxSource.MEMBER,
                    status:           SyncStatus.PENDING
                }
            });

            return loan;
        });
    },

    /**
     * Deletes a pending loan record — used as rollback when cancelPendingLoan
     * succeeds on-chain (contract emits no event; we just clean up the DB row).
     */
    async deletePendingLoanRecord(loanDbId: string) {
        return prisma.loanRecord.delete({
            where: { id: loanDbId }
        });
    },

    // ─── NOC TRANSACTION ─────────────────────────────────────────────────────

    /**
     * Tracks a pending NOC issuance transaction.
     * The Indexer's NOCIssued + NOCMinted handlers finalize the loan record.
     */
    async createPendingNocTx(data: {
        loanId: string;
        lenderEntityId: string;
        memberId: string;
        txHash: string;
    }) {
        return prisma.blockchainTransaction.create({
            data: {
                txHash:           data.txHash,
                actionType:       TxActionType.LOAN_CLEAR,
                loanId:           data.loanId,
                b2bEntityId:      data.lenderEntityId,
                initiatorMemberId: data.memberId,
                txSource:         TxSource.MEMBER,
                status:           SyncStatus.PENDING
            }
        });
    },

    // ─── CANCEL PENDING LOAN ─────────────────────────────────────────────────

    /**
     * Tracks a pending cancelPendingLoan transaction.
     * Because the contract emits NO event for this call, the reconciliation
     * worker polls for CONFIRMED status and deletes the DB row.
     */
    async createCancelPendingLoanTx(data: {
        loanId: string;
        lenderEntityId: string;
        memberId: string;
        txHash: string;
    }) {
        return prisma.blockchainTransaction.create({
            data: {
                txHash:           data.txHash,
                actionType:       TxActionType.LOAN_CANCEL_PENDING,
                loanId:           data.loanId,
                b2bEntityId:      data.lenderEntityId,
                initiatorMemberId: data.memberId,
                txSource:         TxSource.MEMBER,
                status:           SyncStatus.PENDING
            }
        });
    },

    // ─── REFINANCE LOAN ──────────────────────────────────────────────────────

    /**
     * Tracks a pending refinanceLoan transaction.
     * The Indexer's LoanRefinanced handler closes the old loan and creates/links the new one.
     */
    async createRefinanceTx(data: {
        loanId: string;       // DB ID of the OLD loan being refinanced
        lenderEntityId: string;
        memberId: string;
        txHash: string;
    }) {
        return prisma.blockchainTransaction.create({
            data: {
                txHash:           data.txHash,
                actionType:       TxActionType.LOAN_REFINANCE,
                loanId:           data.loanId,
                b2bEntityId:      data.lenderEntityId,
                initiatorMemberId: data.memberId,
                txSource:         TxSource.MEMBER,
                status:           SyncStatus.PENDING
            }
        });
    },

    // ─── LIST LOANS ──────────────────────────────────────────────────────────

    async listLoans(params: {
        lenderEntityId: string;
        page: number;
        limit: number;
        status?: LoanStatus;
        nocIssued?: boolean;
        dvpId?: bigint;
    }) {
        const { lenderEntityId, page, limit, status, nocIssued, dvpId } = params;
        const skip = (page - 1) * limit;

        const where: Prisma.LoanRecordWhereInput = {
            lenderEntityId,
            ...(status    !== undefined && { status }),
            ...(nocIssued !== undefined && { nocIssued }),
            ...(dvpId     !== undefined && { passport: { dvpId } }),
        };

        const [total, items] = await Promise.all([
            prisma.loanRecord.count({ where }),
            prisma.loanRecord.findMany({
                where,
                skip,
                take: limit,
                orderBy: { disbursedAt: 'desc' },
                include: {
                    passport: {
                        select: {
                            dvpId: true,
                            vinHash: true
                        }
                    }
                }
            })
        ]);

        return {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            data: items
        };
    }
};
