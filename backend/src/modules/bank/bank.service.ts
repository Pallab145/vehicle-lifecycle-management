import createError from 'http-errors';
import { bankRepository } from './bank.repository';
import type {
    RegisterLoanBody,
    RefinanceLoanBody,
    ListLoansQuery,
} from './bank.schema';
import { BlockchainManager } from '@/lib/blockchain.manager';
import { EntityType, LoanStatus, TransferStatus, VehicleStatus } from '@/generated/prisma/client';
import { parseEthersError } from '@/utils/blockchainErrorHandler';
import { logger } from '@/lib/logger';
import { parseUnits } from 'ethers';
import prisma from '@/lib/prisma';

export const bankService = {

    // ─── REGISTER LOAN (Hypothecation) ───────────────────────────────────────

    /**
     * Registers a new loan (hypothecation) on a vehicle.
     *
     * The LoanContract.registerLoan() handles THREE scenarios:
     *  1. Brand-New Car (NOT_REG)   → Loan activates immediately on LoanReg event.
     *  2. Used-Car Transfer         → Loan attaches as PENDING until RTO approves transfer.
     *  3. Title Loan (ACTIVE owner) → Loan activates immediately on LoanReg event.
     *
     * We cannot distinguish cases 2 vs. 3 in the service — the contract decides.
     * Both result in a LoanReg event (case 3) or silent pending (case 2 — no event yet).
     */
    async registerLoan(
        data: RegisterLoanBody,
        bankEntityId: string,
        memberId: string
    ) {
        const dvpIdBig = BigInt(data.dvpId);

        // 1. Resolve the vehicle passport (dvpId)
        const passport = await prisma.vehiclePassport.findUnique({
            where: { dvpId: dvpIdBig }
        });
        
        if (!passport) {
            throw createError(404, 'Vehicle passport not found for the given dvpId.');
        }

        if (passport.status === VehicleStatus.SCRAPPED) {
            throw createError(400, 'Cannot register loan on a scrapped vehicle.');
        }

        const dvpId = dvpIdBig;

        // 2. Guard against double-hypothecation, respecting Used Car Transfer flows
        const activeTransfer = await prisma.transferRequest.findFirst({
            where: {
                ownership: { passport: { dvpId } },
                status: TransferStatus.PENDING
            }
        });

        if (activeTransfer) {
            // Used Car Transfer Flow:
            // Seller may have an ACTIVE loan. That's OK! Buyer's bank can attach a PENDING loan.
            // We only block if another bank has ALREADY attached a PENDING loan.
            const existingPendingLoan = await prisma.loanRecord.findFirst({
                where: { passport: { dvpId }, status: LoanStatus.PENDING }
            });
            if (existingPendingLoan) {
                throw createError(409, 'This vehicle transfer already has a pending loan attached.');
            }
        } else {
            // Title Loan / New Car Flow:
            // No transfer is happening. The vehicle cannot have ANY active or pending loan.
            const existingLoan = await bankRepository.findActiveOrPendingLoanByDvpId(dvpId);
            if (existingLoan) {
                throw createError(409, 'Vehicle already has an active or pending loan hypothecation.');
            }

            // Title Loan extra check: borrowerWallet MUST be the current registered owner.
            // Contract enforces: if (owner != buyer) revert Unauthorized();
            // We mirror this to give the bank a clear pre-flight error (saves gas).
            if (passport.status === VehicleStatus.ACTIVE) {
                const ownership = await prisma.vehicleOwnership.findFirst({
                    where: { passportId: passport.id, isActive: true },
                    select: { ownerWallet: true }
                });
                if (ownership && ownership.ownerWallet.toLowerCase() !== data.borrowerWallet.toLowerCase()) {
                    throw createError(400, 'For a title loan, borrowerWallet must be the current registered owner of the vehicle.');
                }
            }
        }

        // 3. Parse the amount (uint128 in contract — integer representation, 0 decimals)
        let amountWei: bigint;
        try {
            amountWei = parseUnits(data.amount, 0);
        } catch {
            throw createError(400, 'Invalid loan amount format.');
        }

        // 4. Submit to Blockchain
        //    registerLoan(dvpId, buyer, amount, tenure) — 4 args
        let txHash: string;
        try {
            txHash = await BlockchainManager.submitEntityTx(
                bankEntityId,
                EntityType.BANK,
                'registerLoan',
                [dvpId, data.borrowerWallet, amountWei, BigInt(data.tenure)]
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error(
                { err: parsedError, dvpId: dvpId.toString() },
                'Blockchain registerLoan failed'
            );
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // 5. Create a PENDING loan record and the tracking BlockchainTransaction atomically.
        //    Status is PENDING — it becomes ACTIVE only after the Indexer catches LoanReg event.
        const loan = await bankRepository.createPendingLoanTx({
            amount:         data.amount,
            tenure:         data.tenure,
            lenderEntityId: bankEntityId,
            memberId,
            borrowerWallet: data.borrowerWallet.toLowerCase(),
            txHash,
            passportId:     passport.id,
        });

        return {
            txHash,
            loanId:  loan.id,
            dvpId:   dvpId.toString(),
            status:  'PENDING',
            message: 'Loan registration transaction submitted to the mempool.'
        };
    },

    // ─── ISSUE NOC (Lien Clearance) ──────────────────────────────────────────

    /**
     * Issues a No Objection Certificate, clearing the vehicle's lien.
     *
     * For registered vehicles, the contract also mints a NOC NFT to the current owner.
     * The Indexer handles NOCIssued (status update) + NOCMinted (recipient wallet).
     */
    async issueNoc(
        loanDbId: string,
        bankEntityId: string,
        memberId: string
    ) {
        // 1. Fetch loan with passport context
        const loan = await bankRepository.getLoanById(loanDbId);
        if (!loan) {
            throw createError(404, 'Loan not found.');
        }

        // 2. Authorization
        if (loan.lenderEntityId !== bankEntityId) {
            throw createError(403, 'Unauthorized: this loan belongs to a different bank.');
        }

        // 3. State validation
        if (loan.status !== LoanStatus.ACTIVE) {
            throw createError(400, `Cannot issue NOC: loan status is '${loan.status}', expected ACTIVE.`);
        }
        if (loan.nocIssued) {
            throw createError(409, 'NOC has already been issued for this loan.');
        }

        // 4. Resolve dvpId — the contract uses dvpId, not ownTid or our DB id
        const dvpId = loan.passport?.dvpId;
        if (!dvpId) {
            throw createError(400, 'Loan is missing linked DVP token ID. Cannot issue NOC.');
        }

        // 5. Submit to Blockchain
        //    issueNOC(dvpId) — 1 arg only; contract resolves owner internally
        let txHash: string;
        try {
            txHash = await BlockchainManager.submitEntityTx(
                bankEntityId,
                EntityType.BANK,
                'issueNOC',
                [dvpId]
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error({ err: parsedError, loanId: loanDbId, dvpId: dvpId.toString() }, 'Blockchain issueNOC failed');
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // 6. Track the pending transaction
        await bankRepository.createPendingNocTx({
            loanId:         loanDbId,
            lenderEntityId: bankEntityId,
            memberId,
            txHash,
        });

        return { txHash, status: 'PENDING', message: 'NOC issuance submitted to blockchain.' };
    },

    // ─── CANCEL PENDING LOAN ─────────────────────────────────────────────────

    /**
     * Cancels a pending loan that was attached to a used-car transfer.
     *
     * Use case: Bank finances a used-car purchase → loan is attached as PENDING
     * on the OwnershipToken transfer. If the bank withdraws financing before the
     * RTO approves, they call cancelPendingLoan to detach it.
     *
     * The contract (LoanContract.cancelPendingLoan) calls OwnershipToken.detachPendingLoan.
     * No event is emitted — after the tx confirms, we delete the pending DB record.
     */
    async cancelPendingLoan(
        dvpIdRaw: string,
        bankEntityId: string,
        memberId: string
    ) {
        const dvpId = BigInt(dvpIdRaw);

        // 1. Find the pending loan for this vehicle and bank
        const loan = await bankRepository.findPendingLoanByDvpIdAndBank(dvpId, bankEntityId);
        if (!loan) {
            throw createError(404, 'No pending loan found for this vehicle under your bank.');
        }

        // 3. Submit to Blockchain
        //    cancelPendingLoan(dvpId) — 1 arg
        let txHash: string;
        try {
            txHash = await BlockchainManager.submitEntityTx(
                bankEntityId,
                EntityType.BANK,
                'cancelPendingLoan',
                [dvpId]
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error({ err: parsedError, dvpId: dvpIdRaw }, 'Blockchain cancelPendingLoan failed');
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // 4. Track the tx. The reconciliation worker confirms it on-chain and then
        //    deletes the loan DB record (no event emitted by contract).
        await bankRepository.createCancelPendingLoanTx({
            loanId:         loan.id,
            lenderEntityId: bankEntityId,
            memberId,
            txHash,
        });

        return {
            txHash,
            status:  'PENDING',
            message: 'Pending loan cancellation submitted to blockchain. The loan record will be removed after confirmation.'
        };
    },

    // ─── REFINANCE LOAN ──────────────────────────────────────────────────────

    /**
     * Refinances an existing active loan with new terms (same bank, same owner).
     *
     * The contract closes the old loan and creates a new one atomically.
     * Emits: LoanRefinanced(oldLoanId, newLoanId, dvpId)
     * The Indexer handles: closing old DB record + activating new one.
     */
    async refinanceLoan(
        loanDbId: string,
        input: RefinanceLoanBody,
        bankEntityId: string,
        memberId: string
    ) {
        // 1. Fetch the existing loan
        const loan = await bankRepository.getLoanById(loanDbId);
        if (!loan) {
            throw createError(404, 'Loan not found.');
        }

        // 2. Authorization
        if (loan.lenderEntityId !== bankEntityId) {
            throw createError(403, 'Unauthorized: this loan belongs to a different bank.');
        }

        // 3. State validation — can only refinance an ACTIVE loan
        if (loan.status !== LoanStatus.ACTIVE) {
            throw createError(
                400,
                `Cannot refinance: loan status is '${loan.status}', expected ACTIVE.`
            );
        }
        if (loan.nocIssued) {
            throw createError(400, 'Cannot refinance: NOC has already been issued (loan is cleared).');
        }

        // 4. Resolve dvpId
        const dvpId = loan.passport?.dvpId;
        if (!dvpId) {
            throw createError(400, 'Loan is missing linked DVP token ID. Cannot refinance.');
        }

        // 5. Parse new amount
        let newAmountWei: bigint;
        try {
            newAmountWei = parseUnits(input.newAmount, 0);
        } catch {
            throw createError(400, 'Invalid newAmount format.');
        }

        // 6. Submit to Blockchain
        //    refinanceLoan(dvpId, newAmount, newTenure) — 3 args
        let txHash: string;
        try {
            txHash = await BlockchainManager.submitEntityTx(
                bankEntityId,
                EntityType.BANK,
                'refinanceLoan',
                [dvpId, newAmountWei, BigInt(input.newTenure)]
            );
        } catch (error: unknown) {
            const parsedError = parseEthersError(error);
            logger.error({ err: parsedError, loanId: loanDbId, dvpId: dvpId.toString() }, 'Blockchain refinanceLoan failed');
            throw createError(400, `Blockchain Error: ${parsedError}`);
        }

        // 7. Track the pending refinance tx against the OLD loan record.
        //    The Indexer creates a NEW loan record when LoanRefinanced fires.
        await bankRepository.createRefinanceTx({
            loanId:         loanDbId,
            lenderEntityId: bankEntityId,
            memberId,
            txHash,
        });

        return {
            txHash,
            oldLoanId: loanDbId,
            status:    'PENDING',
            message:   'Loan refinance submitted to blockchain. New loan will be created after confirmation.'
        };
    },

    // ─── LIST LOANS ──────────────────────────────────────────────────────────

    async listLoans(query: ListLoansQuery, bankEntityId: string) {
        return bankRepository.listLoans({
            lenderEntityId: bankEntityId,
            page:           query.page,
            limit:          query.limit,
            status:         query.status,
            nocIssued:      query.nocIssued,
            dvpId:          query.dvpId ? BigInt(query.dvpId) : undefined,
        });
    },

    // ─── GET LOAN DETAILS ────────────────────────────────────────────────────

    async getLoanDetails(loanDbId: string, bankEntityId: string) {
        const loan = await bankRepository.getLoanById(loanDbId);
        if (!loan) {
            throw createError(404, 'Loan not found.');
        }
        if (loan.lenderEntityId !== bankEntityId) {
            throw createError(403, 'Unauthorized: this loan belongs to a different bank.');
        }
        return loan;
    },
};
