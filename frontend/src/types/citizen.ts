export interface B2BEntity {
    id: string;
    name: string;
    code: string;
    walletAddress?: string | null;
    onChainId?: string | null;
}

export interface CitizenProfile {
    id: string;
    walletAddress: string;
    name?: string | null;
    isKycVerified: boolean;
}

export interface VehicleOwnership {
    ownTid: string;
    ownerWallet: string;
    ownerUserId?: string | null;
    status: 'ACTIVE' | 'PENDING_TRANSFER' | 'HISTORY';
    passport: {
        dvpId: string;
        vinHash: string;
        registrationNumber: string;
        make: string;
        model: string;
        color: string;
        status: 'ACTIVE' | 'SCRAPPED';
    };
    challans?: Challan[];
    insurancePolicies?: InsurancePolicy[];
    pucCertificates?: PucCertificate[];
    loanRecords?: LoanRecord[];
    transferRequests?: TransferRequest[];
}

export interface Challan {
    id: string;
    challanId?: string | null;
    amount: string; // Serialized Decimal
    status: 'PENDING' | 'PAID' | 'CANCELLED';
    issuedAt: string;
    paidAt?: string | null;
    cancelledAt?: string | null;
    policeEntityId: string;
}

export interface InsurancePolicy {
    id: string;
    polId?: string | null;
    coverage: string; // Serialized Decimal
    premium: string; // Serialized Decimal
    claimCount: number;
    status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
    issueDate: string;
    expiryDate: string;
    insEntityId: string;
}

export interface PucCertificate {
    id: string;
    certId?: string | null;
    co: number;
    hc: number;
    smoke: number;
    passed: boolean;
    status: 'VALID' | 'EXPIRED' | 'REVOKED';
    issueDate: string;
    expiryDate: string;
    pucEntityId: string;
}

export interface LoanRecord {
    id: string;
    loanId?: string | null;
    amount: string; // Serialized Decimal
    tenure: number;
    status: 'PENDING' | 'ACTIVE' | 'CLEARED' | 'DEFAULTED';
    disbursedAt: string;
    clearedAt?: string | null;
    nocIssued: boolean;
    nocDate?: string | null;
    lenderEntityId: string;
}

export interface ScrapEligibilityResult {
    isEligible: boolean;
    reasons: string[];
    authorizedScrapCenterId?: string | null;
}

export interface TransferEligibilityResult {
    isEligible: boolean;
    reasons: string[];
    currentTransfer?: TransferRequest | null;
}

export interface TransferRequest {
    id: string;
    reqId?: string | null;
    ownershipId: string;
    ownTid?: string | null;
    sellerWallet: string;
    buyerWallet: string;
    rtoEntityId?: string | null;
    status: 'PENDING' | 'BUYER_ACCEPTED' | 'RTO_APPROVED' | 'CANCELLED';
    reqDate: string;
    completedDate?: string | null;
    sellerOK: boolean;
    buyerOK: boolean;
    rtoOK: boolean;
    sellerUserId?: string | null;
    buyerUserId?: string | null;
    rtoApproverMemberId?: string | null;
}
