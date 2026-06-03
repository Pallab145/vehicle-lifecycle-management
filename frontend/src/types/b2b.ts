// ============================================================
// B2B Types — All institutional module data structures
// Derived from: Prisma schema + backend Zod schemas + controller response shapes
// ============================================================

// ── Shared / Pagination ──

export interface PaginatedResponse<T> {
    items: T[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

// ── Enums (mirror Prisma enums used across modules) ──

export type EntityType =
    | 'GOVERNMENT'
    | 'RTO'
    | 'MANUFACTURER'
    | 'POLICE'
    | 'INSURANCE'
    | 'PUC_CENTER'
    | 'SCRAP_CENTER'
    | 'BANK';

export type MemberRole = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER';

export type VehicleStatus = 'NOT_REG' | 'ACTIVE' | 'SCRAPPED';

export type TransferStatus = 'PENDING' | 'BUYER_ACCEPTED' | 'RTO_APPROVED' | 'CANCELLED';

export type RegistrationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type ChallanStatus = 'PENDING' | 'PAID' | 'CANCELLED';

export type InsuranceStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

export type PucStatus = 'VALID' | 'EXPIRED' | 'REVOKED';

export type LoanStatus = 'PENDING' | 'ACTIVE' | 'CLEARED' | 'DEFAULTED';

export type SyncStatus = 'PENDING' | 'MINED' | 'FAILED';

export type SafeProposalStatus =
    | 'PENDING'
    | 'THRESHOLD_MET'
    | 'EXECUTED'
    | 'EXECUTION_FAILED'
    | 'CANCELLED';

export type TxActionType =
    | 'B2B_ENTITY_REGISTER'
    | 'B2B_ENTITY_TOGGLE'
    | 'VEHICLE_MINT'
    | 'VEHICLE_SCRAP'
    | 'VEHICLE_ASSIGN_DEALER'
    | 'VEHICLE_REGISTER_RTO'
    | 'TRANSFER_INIT'
    | 'TRANSFER_APPROVE_BUYER'
    | 'TRANSFER_APPROVE_RTO'
    | 'TRANSFER_CANCEL'
    | 'TRADE_CERT_ISSUE'
    | 'TRADE_CERT_REVOKE'
    | 'CHALLAN_ISSUE'
    | 'CHALLAN_PAY'
    | 'CHALLAN_CANCEL'
    | 'INSURANCE_ISSUE'
    | 'INSURANCE_CLAIM'
    | 'INSURANCE_EXPIRE'
    | 'PUC_ISSUE'
    | 'PUC_EXPIRE'
    | 'LOAN_REG'
    | 'LOAN_CLEAR'
    | 'LOAN_REFINANCE'
    | 'LOAN_CANCEL_PENDING'
    | 'SAFE_EXEC';

// ── B2B Entity (Institution) ──

export interface B2BEntityDetail {
    id: string;
    type: EntityType;
    code: string;
    name: string;
    walletAddress: string;
    onChainId?: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    registeredByMemberId?: string | null;
    _count?: {
        members?: number;
        manufacturedVehicles?: number;
        registeredVehicles?: number;
        issuedChallans?: number;
        issuedPolicies?: number;
        issuedPucCerts?: number;
        grantedLoans?: number;
        scrappedVehicles?: number;
    };
}

export interface CreateB2BEntityPayload {
    type: Exclude<EntityType, 'GOVERNMENT'>;
    code: string;
    name: string;
    adminMember: {
        name: string;
        email: string;
    };
}

// ── B2B Member (Staff) ──

export interface B2BMember {
    id: string;
    entityId: string;
    email: string;
    name: string;
    role: MemberRole;
    isActive: boolean;
    lastLoginAt?: string | null;
    walletAddress?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CreateMemberPayload {
    name: string;
    email: string;
    role?: MemberRole;
}

// ── Manufacturer ──

export interface MfgVehicle {
    id: string;
    dvpId?: string | null;
    vinHash: string;
    engineHash: string;
    chassisHash: string;
    specsHash: string;
    status: VehicleStatus;
    mfgEntityId: string;
    mfgDate: string;
    dealerWallet?: string | null;
    dealerUserId?: string | null;
    scrapEntityId?: string | null;
    scrapDate?: string | null;
    createdByMemberId?: string | null;
    // Off-chain enrichment fields
    make?: string;
    model?: string;
    color?: string;
    registrationNumber?: string;
}

export interface ManufactureVehiclePayload {
    vin: string;
    make: string;
    model: string;
    color: string;
    engineNo: string;
    chassisNo: string;
}

export interface AssignToDealerPayload {
    dealerWallet: string;
}

// ── RTO ──

export interface RtoRegistration {
    id: string;
    dvpId: string;
    passportId: string;
    buyerWallet: string;
    dealerWallet: string;
    buyerUserId?: string | null;
    dealerUserId?: string | null;
    rtoEntityId: string;
    status: RegistrationStatus;
    createdAt: string;
    updatedAt: string;
    passport?: MfgVehicle;
    buyerUser?: { walletAddress: string; name?: string | null };
    dealerUser?: { walletAddress: string; name?: string | null };
}

export interface RtoTransfer {
    id: string;
    reqId?: string | null;
    ownershipId: string;
    ownTid?: string | null;
    sellerWallet: string;
    buyerWallet: string;
    rtoEntityId?: string | null;
    status: TransferStatus;
    reqDate: string;
    completedDate?: string | null;
    sellerOK: boolean;
    buyerOK: boolean;
    rtoOK: boolean;
    sellerUserId?: string | null;
    buyerUserId?: string | null;
    rtoApproverMemberId?: string | null;
    ownership?: {
        passport?: MfgVehicle;
    };
}

export interface RtoTradeCert {
    id: string;
    dealerWallet: string;
    dealerUserId?: string | null;
    rtoEntityId: string;
    issuedAt: string;
    validTill: string;
    isActive: boolean;
    createdByMemberId?: string | null;
    dealerUser?: { walletAddress: string; name?: string | null };
}

export interface IssueTradeCertPayload {
    dealerWallet: string;
    validTill: number; // Unix timestamp
}

export interface RegisterVehiclePayload {
    dvpId: string | number;
    buyerWallet: string;
    dealerWallet: string;
}

// ── Police ──

export interface PoliceChallan {
    id: string;
    challanId?: string | null;
    ownershipId: string;
    ownTid?: string | null;
    policeEntityId: string;
    amount: string; // Serialized Decimal
    status: ChallanStatus;
    isAdminCancel: boolean;
    issuedAt: string;
    paidAt?: string | null;
    cancelledAt?: string | null;
    paidByWallet?: string | null;
    createdByMemberId?: string | null;
    cancelledByMemberId?: string | null;
    violatorUserId?: string | null;
    paymentOrderId?: string | null;
    paymentRef?: string | null;
    ownership?: {
        ownTid?: string | null;
        ownerWallet: string;
        passport?: MfgVehicle;
    };
}

export interface IssueChallanPayload {
    ownTid: string;
    amount: string;
}

// ── Insurance ──

export interface InsurancePolicyRecord {
    id: string;
    polId?: string | null;
    ownershipId: string;
    ownTid?: string | null;
    insEntityId: string;
    coverage: string; // Serialized Decimal
    premium: string;
    claimCount: number;
    status: InsuranceStatus;
    issueDate: string;
    expiryDate: string;
    ownerWallet: string;
    createdByMemberId?: string | null;
    ownerUserId?: string | null;
    ownership?: {
        ownTid?: string | null;
        ownerWallet: string;
        passport?: MfgVehicle;
    };
}

export interface IssuePolicyPayload {
    ownTid: string;
    expiryDate: number; // Unix timestamp
    coverage: string;
    premium: string;
}

// ── PUC ──

export interface PucCertificateRecord {
    id: string;
    certId?: string | null;
    ownershipId: string;
    ownTid?: string | null;
    pucEntityId: string;
    co: number;
    hc: number;
    smoke: number;
    passed: boolean;
    status: PucStatus;
    issueDate: string;
    expiryDate: string;
    ownerWallet?: string | null;
    createdByMemberId?: string | null;
    ownerUserId?: string | null;
    ownership?: {
        ownTid?: string | null;
        ownerWallet: string;
        passport?: MfgVehicle;
    };
}

export interface IssuePucPayload {
    ownTid: string;
    expiryDate: number; // Unix timestamp
    co: number;
    hc: number;
    smoke: number;
    passed: boolean;
}

// ── Bank / Loan ──

export interface BankLoanRecord {
    id: string;
    loanId?: string | null;
    passportId: string;
    lenderEntityId: string;
    borrowerWallet: string;
    amount: string; // Serialized Decimal
    tenure: number;
    status: LoanStatus;
    disbursedAt: string;
    clearedAt?: string | null;
    nocIssued: boolean;
    nocDate?: string | null;
    nocRecipientWallet?: string | null;
    createdByMemberId?: string | null;
    borrowerUserId?: string | null;
    nocRecipientUserId?: string | null;
    passport?: MfgVehicle;
    loanBorrower?: { walletAddress: string; name?: string | null };
}

export interface RegisterLoanPayload {
    dvpId: string;
    borrowerWallet: string;
    amount: string;
    tenure: number;
}

export interface RefinanceLoanPayload {
    newAmount: string;
    newTenure: number;
}

// ── Scrap ──

export interface ScrapVehicleRecord {
    id: string;
    dvpId?: string | null;
    vinHash: string;
    status: VehicleStatus;
    mfgDate: string;
    scrapDate?: string | null;
    scrapEntityId?: string | null;
    dealerWallet?: string | null;
    ownership?: {
        ownTid?: string | null;
        ownerWallet: string;
    };
}

export interface ScrapEligibility {
    eligible: boolean;
    reasons: string[];
    dvpId: string;
    status: VehicleStatus;
}

// ── Government ──

export interface GlobalChallan extends PoliceChallan {
    policeEntity?: { name: string; code: string };
}

// ── Admin / Safe Governance ──

export interface SafeInfo {
    address: string;
    threshold: number;
    owners: string[];
    nonce: number;
}

export interface SafeProposal {
    id: string;
    status: SafeProposalStatus;
    actionType: TxActionType;
    description?: string | null;
    targetEntityId?: string | null;
    targetEntity?: B2BEntityDetail | null;
    safeTxHash?: string | null;
    nonce?: number | null;
    createdAt: string;
    updatedAt: string;
    proposedByMemberId?: string | null;
    proposedByMember?: { name: string; email: string; walletAddress?: string | null };
    signatures?: SafeSignature[];
    _count?: { signatures?: number };
}

export interface SafeSignature {
    id: string;
    proposalId: string;
    memberId: string;
    signerWallet: string;
    signature: string;
    createdAt: string;
    member?: { name: string; email: string };
}

// ── Dealer ──

export interface DealerInventoryItem {
    id: string;
    dvpId?: string | null;
    vinHash: string;
    status: VehicleStatus;
    mfgDate: string;
    make?: string;
    model?: string;
    color?: string;
    manufacturer?: { name: string; code: string };
    registrationRequest?: {
        id: string;
        status: RegistrationStatus;
    } | null;
}

export interface DealerTradeCert {
    id: string;
    rtoEntityId: string;
    issuedAt: string;
    validTill: string;
    isActive: boolean;
    rtoEntity?: { name: string; code: string };
}

export interface CreateSaleRequestPayload {
    dvpId: string | number;
    buyerWallet: string;
    rtoEntityId: string;
}

// ── Payment ──

export interface PaymentOrder {
    orderId: string;
    challanId: string;
    amount: string;
    status: 'CREATED' | 'PAID' | 'FAILED';
    paymentMethod: 'UPI' | 'CARD' | 'NET_BANKING' | 'WALLET';
    // Dev webhook payload for testing
    webhookPayload?: {
        orderId: string;
        paymentId: string;
        status: 'SUCCESS';
        amountPaid: string;
        signature: string;
    };
}

export interface CitizenChallanForPayment {
    id: string;
    challanId?: string | null;
    amount: string;
    status: ChallanStatus;
    issuedAt: string;
    paidAt?: string | null;
    policeEntity?: { name: string; code: string };
    ownership?: {
        ownTid?: string | null;
        passport?: {
            make?: string;
            model?: string;
            registrationNumber?: string;
        };
    };
}

// ── Blockchain Transaction (for logs) ──

export interface BlockchainTransaction {
    id: string;
    txHash: string;
    actionType: TxActionType;
    status: SyncStatus;
    blockNumber?: string | null;
    blockTimestamp?: string | null;
    createdAt: string;
    updatedAt: string;
    b2bEntityId?: string | null;
    passportId?: string | null;
    ownershipId?: string | null;
}

// ── System Analytics (Gov) ──
export interface SystemAnalytics {
    vehicles: {
        manufactured: number;
        active: number;
        scrapped: number;
        total: number;
    };
    fines: {
        collectedWei: string;
        pendingWei: string;
    };
    institutions: Array<{
        type: EntityType;
        count: number;
    }>;
    recentActivity: {
        transfersLast30Days: number;
    };
}
