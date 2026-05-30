/**
 * notification.types.ts
 * 
 * Strictly typed definitions for all Server-Sent Events (SSE) payloads.
 * These perfectly mirror the Hyperledger Besu Smart Contract events and enable
 * robust Discriminated Unions on the frontend.
 */

// Shared base interface for all events
export interface BaseNotificationEvent {
    id: string; // Unique UUID for the event (useful for Last-Event-ID recovery)
    timestamp: number; // Unix epoch
}

// ─── Entity Registration & Toggling Events ────────────────────────────────

export interface MfgRegEvent extends BaseNotificationEvent {
    type: 'MFG_REG';
    data: { mfgId: string; code: string; authWallet: string; txHash: string };
}
export interface MfgToggledEvent extends BaseNotificationEvent {
    type: 'MFG_TOGGLED';
    data: { mfgId: string; active: boolean; txHash: string };
}

export interface ScrapRegEvent extends BaseNotificationEvent {
    type: 'SCRAP_REG';
    data: { scrapId: string; code: string; authWallet: string; txHash: string };
}
export interface ScrapToggledEvent extends BaseNotificationEvent {
    type: 'SCRAP_TOGGLED';
    data: { scrapId: string; active: boolean; txHash: string };
}

export interface RtoRegEvent extends BaseNotificationEvent {
    type: 'RTO_REG';
    data: { rtoId: string; code: string; authWallet: string; txHash: string };
}
export interface RtoToggledEvent extends BaseNotificationEvent {
    type: 'RTO_TOGGLED';
    data: { rtoId: string; active: boolean; txHash: string };
}

export interface PoliceRegEvent extends BaseNotificationEvent {
    type: 'POLICE_REG';
    data: { policeId: string; code: string; authWallet: string; txHash: string };
}
export interface PoliceToggledEvent extends BaseNotificationEvent {
    type: 'POLICE_TOGGLED';
    data: { policeId: string; active: boolean; txHash: string };
}

export interface InsRegEvent extends BaseNotificationEvent {
    type: 'INS_REG';
    data: { insId: string; code: string; authWallet: string; txHash: string };
}
export interface InsToggledEvent extends BaseNotificationEvent {
    type: 'INS_TOGGLED';
    data: { insId: string; active: boolean; txHash: string };
}

export interface PucCenterRegEvent extends BaseNotificationEvent {
    type: 'PUC_CENTER_REG';
    data: { centerId: string; code: string; authWallet: string; txHash: string };
}
export interface PucCenterToggledEvent extends BaseNotificationEvent {
    type: 'PUC_CENTER_TOGGLED';
    data: { centerId: string; active: boolean; txHash: string };
}

export interface BankRegEvent extends BaseNotificationEvent {
    type: 'BANK_REG';
    data: { bankId: string; code: string; authWallet: string; txHash: string };
}
export interface BankToggledEvent extends BaseNotificationEvent {
    type: 'BANK_TOGGLED';
    data: { bankId: string; active: boolean; txHash: string };
}

// ─── Digital Vehicle Passport (DVP) Events ────────────────────────────────

export interface VehicleMfgEvent extends BaseNotificationEvent {
    type: 'VEHICLE_MFG';
    data: { dvpId: string; vinHash: string; mfgId: string; txHash: string; blockNumber: number };
}

export interface StatusChangeEvent extends BaseNotificationEvent {
    type: 'STATUS_CHANGE';
    data: { dvpId: string; oldStatus: string; newStatus: string; txHash: string };
}

export interface VehicleScrappedEvent extends BaseNotificationEvent {
    type: 'VEHICLE_SCRAPPED';
    data: { dvpId: string; scrapId: string; scrapDate: number; txHash: string };
}

/// Emitted when vehicle owner pre-authorizes a scrap center via authorizeScrap()
export interface ScrapAuthorizedEvent extends BaseNotificationEvent {
    type: 'SCRAP_AUTHORIZED';
    data: { dvpId: string; scrapId: string; ownerWallet: string; txHash: string };
}

export interface VehicleAssignedToDealerEvent extends BaseNotificationEvent {
    type: 'VEHICLE_ASSIGNED_TO_DEALER';
    data: { dvpId: string; dealerWallet: string; txHash: string };
}

// ─── Ownership Token Events ───────────────────────────────────────────────

export interface VehicleRegEvent extends BaseNotificationEvent {
    type: 'VEHICLE_REG';
    data: { ownTid: string; ownerWallet: string; rtoId: string; dvpId: string; txHash: string };
}

export interface XferInitEvent extends BaseNotificationEvent {
    type: 'XFER_INIT';
    data: { reqId: string; ownTid: string; sellerWallet: string; buyerWallet: string; txHash: string };
}

export interface XferCancelledEvent extends BaseNotificationEvent {
    type: 'XFER_CANCELLED';
    data: { reqId: string; ownTid: string; txHash: string };
}

export interface XferApprovedEvent extends BaseNotificationEvent {
    type: 'XFER_APPROVED';
    data: { reqId: string; approver: number; txHash: string };
}

export interface XferDoneEvent extends BaseNotificationEvent {
    type: 'XFER_DONE';
    data: { reqId: string; ownTid: string; newOwnerWallet: string; txHash: string };
}

// ─── Trade Certificate Events ───────────────────────────────────────────────

export interface TradeCertIssuedEvent extends BaseNotificationEvent {
    type: 'TRADE_CERT_ISSUED';
    data: { dealerWallet: string; rtoId: string; validTill: number; txHash: string };
}

export interface TradeCertRevokedEvent extends BaseNotificationEvent {
    type: 'TRADE_CERT_REVOKED';
    data: { dealerWallet: string; rtoId: string; txHash: string };
}

// ─── Challan Events ───────────────────────────────────────────────────────

export interface ChallanIssuedEvent extends BaseNotificationEvent {
    type: 'CHALLAN_ISSUED';
    data: { challanId: string; ownTid: string; policeId: string; amount: string; txHash: string };
}

export interface ChallanPaidEvent extends BaseNotificationEvent {
    type: 'CHALLAN_PAID';
    data: { challanId: string; ownTid: string; txHash: string };
}

export interface ChallanCancelledEvent extends BaseNotificationEvent {
    type: 'CHALLAN_CANCELLED';
    data: { challanId: string; ownTid: string; isAdminCancel: boolean; txHash: string };
}

// ─── Insurance Events ─────────────────────────────────────────────────────

export interface PolicyIssuedEvent extends BaseNotificationEvent {
    type: 'POLICY_ISSUED';
    data: { polId: string; ownTid: string; compId: string; expiryDate: number; txHash: string };
}

export interface PolicyExpiredEvent extends BaseNotificationEvent {
    type: 'POLICY_EXPIRED';
    data: { polId: string; txHash: string };
}

export interface ClaimFiledEvent extends BaseNotificationEvent {
    type: 'CLAIM_FILED';
    data: { polId: string; claimNum: number; txHash: string };
}

export interface PolicyTerminatedEvent extends BaseNotificationEvent {
    type: 'POLICY_TERMINATED';
    data: { polId: string; ownTid: string; txHash: string };
}

// ─── PUC Events ───────────────────────────────────────────────────────────

export interface PucIssuedEvent extends BaseNotificationEvent {
    type: 'PUC_ISSUED';
    data: { certId: string; ownTid: string; passed: boolean; expiryDate: number; txHash: string };
}

export interface PucExpiredEvent extends BaseNotificationEvent {
    type: 'PUC_EXPIRED';
    data: { certId: string; txHash: string };
}

export interface PucTerminatedEvent extends BaseNotificationEvent {
    type: 'PUC_TERMINATED';
    data: { certId: string; ownTid: string; txHash: string };
}

// ─── Loan Events ──────────────────────────────────────────────────────────

export interface LoanRegEvent extends BaseNotificationEvent {
    type: 'LOAN_REG';
    data: { loanId: string; dvpId: string; bankId: string; amount: string; txHash: string };
}

export interface LoanRefinancedEvent extends BaseNotificationEvent {
    type: 'LOAN_REFINANCED';
    data: { oldLoanId: string; newLoanId: string; dvpId: string; txHash: string };
}

export interface PendingLoanAttachedEvent extends BaseNotificationEvent {
    type: 'PENDING_LOAN_ATTACHED';
    data: { dvpId: string; bankId: string; borrower: string; amount: string; txHash: string };
}

export interface PendingLoanCancelledEvent extends BaseNotificationEvent {
    type: 'PENDING_LOAN_CANCELLED';
    data: { dvpId: string; bankId: string; txHash: string };
}

export interface NocIssuedEvent extends BaseNotificationEvent {
    type: 'NOC_ISSUED';
    // owner wallet only present if NOCMinted also fired (registered vehicle)
    data: { loanId: string; dvpId?: string; ownerWallet?: string; txHash: string };
}

// ─── Generic Transaction Status Event ───────────────────────────────────────

export interface TxStatusChangeEvent extends BaseNotificationEvent {
    type: 'TX_STATUS_CHANGE';
    data: {
        txHash: string;
        actionType: string;
        status: 'MINED' | 'FAILED';
    };
}

// ─── The Discriminated Union ──────────────────────────────────────────────

export type NotificationEvent = 
    | MfgRegEvent
    | MfgToggledEvent
    | ScrapRegEvent
    | ScrapToggledEvent
    | RtoRegEvent
    | RtoToggledEvent
    | PoliceRegEvent
    | PoliceToggledEvent
    | InsRegEvent
    | InsToggledEvent
    | PucCenterRegEvent
    | PucCenterToggledEvent
    | BankRegEvent
    | BankToggledEvent
    | VehicleMfgEvent
    | StatusChangeEvent
    | VehicleScrappedEvent
    | ScrapAuthorizedEvent
    | VehicleAssignedToDealerEvent
    | VehicleRegEvent
    | XferInitEvent
    | XferCancelledEvent
    | XferApprovedEvent
    | XferDoneEvent
    | TradeCertIssuedEvent
    | TradeCertRevokedEvent
    | ChallanIssuedEvent
    | ChallanPaidEvent
    | ChallanCancelledEvent
    | PolicyIssuedEvent
    | ClaimFiledEvent
    | PolicyExpiredEvent
    | PolicyTerminatedEvent
    | PucIssuedEvent
    | PucExpiredEvent
    | PucTerminatedEvent
    | LoanRegEvent
    | NocIssuedEvent
    | LoanRefinancedEvent
    | PendingLoanAttachedEvent
    | PendingLoanCancelledEvent
    | TxStatusChangeEvent;