import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { AuthUser } from '@/types/auth';
import type {
    B2BEntityDetail, CreateB2BEntityPayload,
    B2BMember, CreateMemberPayload, MemberRole,
    MfgVehicle, ManufactureVehiclePayload, AssignToDealerPayload,
    RtoRegistration, RtoTransfer, RtoTradeCert,
    IssueTradeCertPayload, RegisterVehiclePayload,
    PoliceChallan, IssueChallanPayload,
    InsurancePolicyRecord, IssuePolicyPayload,
    PucCertificateRecord, IssuePucPayload,
    BankLoanRecord, RegisterLoanPayload, RefinanceLoanPayload,
    ScrapVehicleRecord, ScrapEligibility,
    GlobalChallan,
    SafeInfo, SafeProposal, SafeSignature,
    DealerInventoryItem, DealerTradeCert, CreateSaleRequestPayload,
    PaymentOrder, CitizenChallanForPayment,
    BlockchainTransaction,
    EntityType, VehicleStatus, TransferStatus, RegistrationStatus,
    ChallanStatus, InsuranceStatus, LoanStatus, PucStatus, SafeProposalStatus,
    SystemAnalytics
} from '@/types/b2b';
import type { 
    B2BEntity, 
    CitizenProfile,
    VehicleOwnership, 
    ScrapEligibilityResult, 
    TransferEligibilityResult,
    TransferRequest,
    TimelineEvent
} from '@/types/citizen';

// ── Custom Error Class ──
export class ApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly code?: string,
        public readonly data?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

export function getErrorMessage(err: unknown): string {
    if (err instanceof ApiError) {
        const genericMessages: Record<number, string> = {
            400: 'Invalid request. Please check your input.',
            401: 'Session expired. Please log in again.',
            403: 'Access denied.',
            404: 'Resource not found.',
            422: 'Please check your input and try again.',
            429: 'Too many attempts. Please wait a moment and try again.',
            500: 'Server error. Please try again in a moment.',
            503: 'Service temporarily unavailable. Please try again shortly.',
        };

        const isGeneric = !err.message || err.message === 'Request failed' || err.message === 'Network Error';
        const genericMessage = genericMessages[err.status];
        if (isGeneric && genericMessage) return genericMessage;

        return err.message;
    }
    if (axios.isCancel(err)) return 'Request timed out. Please check your connection.';
    if (err instanceof AxiosError && !err.response) return 'Network error. Please check your connection.';
    return 'Something went wrong. Please try again.';
}

const CSRF_COOKIE_NAME = 'vl_csrf_token';

export const apiClient = axios.create({
    baseURL: '/api', // Proxied via next.config.ts to http://localhost:4000/api
    withCredentials: true, // Always send HTTP-only session cookies
    xsrfCookieName: CSRF_COOKIE_NAME,
    xsrfHeaderName: 'x-csrf-token',
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 30_000,
});

// Explicitly attach CSRF token for double-submit cookie pattern
apiClient.interceptors.request.use((config) => {
    if (typeof document !== 'undefined') {
        const match = document.cookie.match(new RegExp(`(^|;\\s*)${CSRF_COOKIE_NAME}=([^;]*)`));
        if (match && match[2]) {
            config.headers['x-csrf-token'] = match[2];
        }
    }
    return config;
});

// Refresh token state — ensures only ONE refresh call is in flight at a time.
let isRefreshing = false;
let refreshSubscribers: ((success: boolean) => void)[] = [];

function onRefreshComplete(success: boolean) {
    refreshSubscribers.forEach(callback => callback(success));
    refreshSubscribers = [];
}

apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _isRetry?: boolean };

        // 401 Unauthorized handling with Token Refresh Queueing
        if (error.response?.status === 401 && originalRequest && !originalRequest._isRetry) {
            // Prevent infinite loop if the refresh request itself fails
            if (originalRequest.url === '/auth/refresh') {
                return Promise.reject(error);
            }

            originalRequest._isRetry = true;

            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    refreshSubscribers.push((success: boolean) => {
                        if (success) resolve(apiClient(originalRequest));
                        else reject(error);
                    });
                });
            }

            isRefreshing = true;

            try {
                // Must use apiClient to ensure CSRF is passed to refresh endpoint
                await apiClient.post('/auth/refresh', {});
                
                isRefreshing = false;
                onRefreshComplete(true);

                // Replay original request with new cookies attached
                return apiClient(originalRequest);
            } catch (refreshError) {
                isRefreshing = false;
                onRefreshComplete(false);

                // If refresh fails, they are truly logged out. 
                // We let the AuthContext catch the 401 and handle the redirect.
                const status = axios.isAxiosError(refreshError) ? (refreshError.response?.status || 401) : 401;
                throw new ApiError(status, 'Session expired. Please log in again.');
            }
        }

        // Standardize all other errors
        const status = error.response?.status || 500;
        const data = error.response?.data as { error?: string, message?: string, code?: string, details?: Record<string, string[]> } | undefined;
        let message = data?.error || data?.message || error.message || 'Request failed';

        // Extract detailed validation errors if present
        if (data?.details && typeof data.details === 'object') {
            const firstDetailKey = Object.keys(data.details)[0];
            if (firstDetailKey && Array.isArray(data.details[firstDetailKey]) && data.details[firstDetailKey][0]) {
                const detailMsg = data.details[firstDetailKey][0];
                message = message === 'Validation failed' ? detailMsg : `${message}: ${detailMsg}`;
            }
        }

        throw new ApiError(status, message, data?.code, data);
    }
);

// ── Auth APIs ──
export const authApi = {
    // Shared
    getMe: () => apiClient.get<{ success: true; caller: AuthUser }>('/auth/me').then(res => res.data.caller),
    refresh: () => apiClient.post<{ success: true }>('/auth/refresh').then(res => res.data),
    logout: () => apiClient.post<{ success: true }>('/auth/logout').then(res => res.data),
    
    // B2C (Citizen - Web3)
    getCitizenNonce: () => 
        apiClient.get<{ success: true; nonce: string; }>(`/auth/citizen/nonce`).then(res => res.data),
    loginCitizen: (walletAddress: string, message: string, signature: string) =>
        apiClient.post<{ success: true; user: AuthUser }>('/auth/citizen/login', { walletAddress, message, signature }).then(res => res.data),
    loginCitizenAadhaar: (vehicleId: string, documentNumber: string) =>
        apiClient.post<{ success: true; user: AuthUser }>('/auth/citizen/login-aadhaar', { vehicleId, documentNumber }).then(res => res.data),

    // B2B (Institution - Web2)
    loginInstitution: (email: string, password: string) =>
        apiClient.post<{ success: true; user: AuthUser }>('/auth/institution/login', { email, password }).then(res => res.data),
    forgotPassword: (email: string) =>
        apiClient.post<{ success: true; message: string }>('/auth/institution/forgot-password', { email }).then(res => res.data),
    resetPassword: (email: string, otpCode: string, newPassword: string) =>
        apiClient.post<{ success: true; message: string }>('/auth/institution/reset-password', { email, otpCode, newPassword }).then(res => res.data),
};

// ── Citizen APIs ──
export const citizenApi = {
    // Public Selection Data
    listRtos: () => 
        apiClient.get<{ success: true; rtos: B2BEntity[] }>('/citizens/rtos').then(res => res.data),
    listScrapCenters: (page = 1, limit = 50) =>
        apiClient.get<{ success: true; scrapCenters: B2BEntity[]; total: number }>('/citizens/scrap-centers', { params: { page, limit } }).then(res => res.data),

    // Private Citizen Profile Data
    getMe: () => 
        apiClient.get<{ success: true; profile: CitizenProfile }>('/citizens/me').then(res => res.data),
    submitKyc: (payload: { 
        documentType: string; 
        documentNumber: string; 
        name: string; 
        phone: string; 
        email?: string; 
        rtoEntityId?: string; 
    }) =>
        apiClient.post<{ success: true; profile: CitizenProfile }>('/citizens/kyc', payload).then(res => res.data),

    // Vehicle Dashboard Data
    listMyVehicles: (page = 1, limit = 20) =>
        apiClient.get<{ success: true; vehicles: VehicleOwnership[]; total: number }>('/citizens/vehicles', { params: { page, limit } }).then(res => res.data),
    getVehicleDetail: (ownTid: string) =>
        apiClient.get<{ success: true; vehicleDetails: VehicleOwnership }>(`/citizens/vehicles/${ownTid}`).then(res => res.data),
    
    // Pre-flight Checks & Status
    checkScrapEligibility: (dvpId: string) =>
        apiClient.get<{ success: true; eligibility: ScrapEligibilityResult }>(`/citizens/vehicles/by-dvp/${dvpId}/scrap/eligibility`).then(res => res.data),
    checkTransferEligibility: (ownTid: string) =>
        apiClient.get<{ success: true; eligibility: TransferEligibilityResult }>(`/citizens/vehicles/${ownTid}/transfer/eligibility`).then(res => res.data),
    getTransferStatus: (ownTid: string) =>
        apiClient.get<{ success: true; transfer: TransferRequest }>(`/citizens/vehicles/${ownTid}/transfer/status`).then(res => res.data),
    getIncomingTransfers: () =>
        apiClient.get<{ success: true; transfers: TransferRequest[] }>('/citizens/transfers/incoming').then(res => res.data),
    getVehicleTimeline: (ownTid: string) =>
        apiClient.get<{ success: true; timeline: TimelineEvent[] }>(`/citizens/vehicles/${ownTid}/timeline`).then(res => res.data),
};

// ── Institution (B2B Entity) APIs ──
export const institutionApi = {
    create: (payload: CreateB2BEntityPayload) =>
        apiClient.post<{ success: true; entity: B2BEntityDetail; message: string }>('/institutions', payload).then(res => res.data),
    list: (params?: { page?: number; limit?: number; type?: EntityType; search?: string; isActive?: boolean }) =>
        apiClient.get<{ success: true; entities: B2BEntityDetail[]; total: number; page: number; limit: number }>('/institutions', { params }).then(res => res.data),
    getById: (id: string) =>
        apiClient.get<{ success: true; entity: B2BEntityDetail }>(`/institutions/${id}`).then(res => res.data),
    toggle: (id: string, isActive: boolean) =>
        apiClient.patch<{ success: true; entity: B2BEntityDetail; message: string }>(`/institutions/${id}/toggle`, { isActive }).then(res => res.data),
    retryRegistration: (id: string) =>
        apiClient.post<{ success: true; message: string }>(`/institutions/${id}/retry`).then(res => res.data),
};

// ── Staff (B2B Member) APIs ──
export const staffApi = {
    list: (params?: { page?: number; limit?: number; search?: string; role?: MemberRole; isActive?: boolean }) =>
        apiClient.get<{ success: true; members: B2BMember[]; total: number; page: number; limit: number }>('/staff', { params }).then(res => res.data),
    getById: (id: string) =>
        apiClient.get<{ success: true; member: B2BMember }>(`/staff/${id}`).then(res => res.data),
    create: (payload: CreateMemberPayload) =>
        apiClient.post<{ success: true; member: B2BMember; tempPassword: string; message: string }>('/staff', payload).then(res => res.data),
    updateRole: (id: string, role: MemberRole) =>
        apiClient.patch<{ success: true; member: B2BMember }>(`/staff/${id}/role`, { role }).then(res => res.data),
    updateStatus: (id: string, isActive: boolean) =>
        apiClient.patch<{ success: true; member: B2BMember }>(`/staff/${id}/status`, { isActive }).then(res => res.data),
    forceResetPassword: (id: string) =>
        apiClient.post<{ success: true; member: B2BMember; tempPassword: string; message: string }>(`/staff/${id}/reset-password`).then(res => res.data),
    changePassword: (payload: { oldPassword: string; newPassword: string }) =>
        apiClient.patch<{ success: true; message: string }>('/staff/me/password', payload).then(res => res.data),
};

// ── Manufacturer APIs ──
export const mfgApi = {
    listVehicles: (params?: { page?: number; limit?: number; status?: VehicleStatus }) =>
        apiClient.get<{ success: true; vehicles: MfgVehicle[]; total: number; page: number; limit: number }>('/mfg/vehicles', { params }).then(res => res.data),
    manufacture: (payload: ManufactureVehiclePayload) =>
        apiClient.post<{ success: true; vehicle: MfgVehicle; message: string }>('/mfg/vehicles/manufacture', payload).then(res => res.data),
    assignToDealer: (tokenId: string, payload: AssignToDealerPayload) =>
        apiClient.post<{ success: true; message: string }>(`/mfg/vehicles/${tokenId}/assign`, payload).then(res => res.data),
};

// ── RTO APIs ──
export const rtoApi = {
    // Write Operations
    issueTradeCert: (payload: IssueTradeCertPayload) =>
        apiClient.post<{ success: true; tradeCert: RtoTradeCert; message: string }>('/rto/trade-certs/issue', payload).then(res => res.data),
    revokeTradeCert: (dealerWallet: string) =>
        apiClient.post<{ success: true; message: string }>(`/rto/trade-certs/revoke/${dealerWallet}`).then(res => res.data),
    registerVehicle: (payload: RegisterVehiclePayload) =>
        apiClient.post<{ success: true; message: string }>('/rto/vehicles/register', payload).then(res => res.data),
    approveTransfer: (ownTid: string) =>
        apiClient.post<{ success: true; message: string }>(`/rto/transfers/${ownTid}/approve`).then(res => res.data),
    // Read Operations
    listTradeCerts: (params?: { page?: number; limit?: number; isActive?: string }) =>
        apiClient.get<{ success: true; tradeCerts: RtoTradeCert[]; total: number; page: number; limit: number }>('/rto/trade-certs', { params }).then(res => res.data),
    listRegistrations: (params?: { page?: number; limit?: number; status?: RegistrationStatus }) =>
        apiClient.get<{ success: true; registrations: RtoRegistration[]; total: number; page: number; limit: number }>('/rto/vehicles/registrations', { params }).then(res => res.data),
    listTransfers: (params?: { page?: number; limit?: number; status?: TransferStatus }) =>
        apiClient.get<{ success: true; transfers: RtoTransfer[]; total: number; page: number; limit: number }>('/rto/transfers', { params }).then(res => res.data),
};

// ── Police APIs ──
export const policeApi = {
    issueChallan: (payload: IssueChallanPayload) =>
        apiClient.post<{ success: true; challan: PoliceChallan; message: string }>('/police/challans/issue', payload).then(res => res.data),
    cancelChallan: (challanId: string) =>
        apiClient.post<{ success: true; message: string }>(`/police/challans/${challanId}/cancel`).then(res => res.data),
    markPaid: (challanId: string) =>
        apiClient.post<{ success: true; message: string }>(`/police/challans/${challanId}/mark-paid`).then(res => res.data),
    listChallans: (params?: { page?: number; limit?: number; status?: ChallanStatus }) =>
        apiClient.get<{ success: true; challans: PoliceChallan[]; total: number; page: number; limit: number }>('/police/challans', { params }).then(res => res.data),
};

// ── Bank APIs ──
export const bankApi = {
    registerLoan: (payload: RegisterLoanPayload) =>
        apiClient.post<{ success: true; loan: BankLoanRecord; message: string }>('/bank/loans', payload).then(res => res.data),
    issueNoc: (loanId: string) =>
        apiClient.post<{ success: true; message: string }>(`/bank/loans/${loanId}/noc`).then(res => res.data),
    cancelPendingLoan: (dvpId: string) =>
        apiClient.delete<{ success: true; message: string }>(`/bank/loans/pending/${dvpId}`).then(res => res.data),
    refinanceLoan: (loanId: string, payload: RefinanceLoanPayload) =>
        apiClient.post<{ success: true; message: string }>(`/bank/loans/${loanId}/refinance`, payload).then(res => res.data),
    listLoans: (params?: { page?: number; limit?: number; status?: LoanStatus; nocIssued?: boolean; dvpId?: string }) =>
        apiClient.get<{ success: true; loans: BankLoanRecord[]; total: number; page: number; limit: number }>('/bank/loans', { params }).then(res => res.data),
    getLoanDetails: (loanId: string) =>
        apiClient.get<{ success: true; loan: BankLoanRecord }>(`/bank/loans/${loanId}`).then(res => res.data),
};

// ── Insurance APIs ──
export const insuranceApi = {
    issuePolicy: (payload: IssuePolicyPayload) =>
        apiClient.post<{ success: true; policy: InsurancePolicyRecord; message: string }>('/insurance/policies', payload).then(res => res.data),
    markExpired: (polId: string) =>
        apiClient.post<{ success: true; message: string }>(`/insurance/policies/${polId}/expire`).then(res => res.data),
    fileClaim: (polId: string) =>
        apiClient.post<{ success: true; message: string }>(`/insurance/policies/${polId}/claims`).then(res => res.data),
    listPolicies: (params?: { page?: number; limit?: number; status?: InsuranceStatus; ownTid?: string }) =>
        apiClient.get<{ success: true; policies: InsurancePolicyRecord[]; total: number; page: number; limit: number }>('/insurance/policies', { params }).then(res => res.data),
    getVehiclePolicy: (ownTid: string) =>
        apiClient.get<{ success: true; policy: InsurancePolicyRecord }>(`/insurance/vehicle/${ownTid}/policy`).then(res => res.data),
    getPolicyDetails: (polId: string) =>
        apiClient.get<{ success: true; policy: InsurancePolicyRecord }>(`/insurance/policies/${polId}`).then(res => res.data),
};

// ── PUC APIs ──
export const pucApi = {
    issuePuc: (payload: IssuePucPayload) =>
        apiClient.post<{ success: true; certificate: PucCertificateRecord; message: string }>('/puc/certificates', payload).then(res => res.data),
    markExpired: (certId: string) =>
        apiClient.post<{ success: true; message: string }>(`/puc/certificates/${certId}/expire`).then(res => res.data),
    listCertificates: (params?: { page?: number; limit?: number; status?: PucStatus }) =>
        apiClient.get<{ success: true; certificates: PucCertificateRecord[]; total: number; page: number; limit: number }>('/puc/certificates', { params }).then(res => res.data),
    getVehicleCertificate: (ownTid: string) =>
        apiClient.get<{ success: true; certificate: PucCertificateRecord }>(`/puc/vehicle/${ownTid}/certificate`).then(res => res.data),
    getCertificateDetails: (certId: string) =>
        apiClient.get<{ success: true; certificate: PucCertificateRecord }>(`/puc/certificates/${certId}`).then(res => res.data),
};

// ── Scrap Center APIs ──
export const scrapApi = {
    scrapVehicle: (dvpId: string) =>
        apiClient.post<{ success: true; message: string }>(`/scrap/vehicles/${dvpId}/scrap`).then(res => res.data),
    checkEligibility: (dvpId: string) =>
        apiClient.get<{ success: true; eligibility: ScrapEligibility }>(`/scrap/vehicles/${dvpId}/eligibility`).then(res => res.data),
    listScrappedVehicles: (params?: { page?: number; limit?: number }) =>
        apiClient.get<{ success: true; vehicles: ScrapVehicleRecord[]; total: number; page: number; limit: number }>('/scrap/vehicles', { params }).then(res => res.data),
    getVehicleDetails: (dvpId: string) =>
        apiClient.get<{ success: true; vehicle: ScrapVehicleRecord }>(`/scrap/vehicles/${dvpId}`).then(res => res.data),
};

// ── Government APIs ──
export const govApi = {
    listGlobalChallans: (params?: { page?: number; limit?: number; status?: ChallanStatus }) =>
        apiClient.get<{ success: true; challans: GlobalChallan[]; total: number; page: number; limit: number }>('/gov/challans', { params }).then(res => res.data),
    adminCancelChallan: (challanId: string) =>
        apiClient.post<{ success: true; message: string }>(`/gov/challans/${challanId}/cancel`).then(res => res.data),
    getSystemAnalytics: () =>
        apiClient.get<{ success: true; analytics: SystemAnalytics }>('/gov/analytics').then(res => res.data),
    getAuditLogs: (params?: { page?: number; limit?: number }) =>
        apiClient.get<{ success: true; data: TimelineEvent[]; total: number; page: number; limit: number; totalPages: number }>('/gov/audit-logs', { params }).then(res => res.data),
};

// ── Admin / Safe Governance APIs ──
export const adminApi = {
    getSafeInfo: () =>
        apiClient.get<{ success: true; safeInfo: SafeInfo }>('/admin/safe/info').then(res => res.data),
    listProposals: (params?: { page?: number; limit?: number; status?: SafeProposalStatus }) =>
        apiClient.get<{ success: true; proposals: SafeProposal[]; pagination: { total: number; page: number; limit: number; totalPages: number } }>('/admin/proposals', { params }).then(res => res.data),
    getProposal: (id: string) =>
        apiClient.get<{ success: true; proposal: SafeProposal }>(`/admin/proposals/${id}`).then(res => res.data),
    cancelProposal: (id: string) =>
        apiClient.delete<{ success: true; proposal: SafeProposal; message: string }>(`/admin/proposals/${id}`).then(res => res.data),
    signProposal: (id: string, signature: string) =>
        apiClient.post<{ success: true; signature: SafeSignature; message: string }>(`/admin/proposals/${id}/sign`, { signature }).then(res => res.data),
    executeProposal: (id: string) =>
        apiClient.post<{ success: true; message: string }>(`/admin/proposals/${id}/execute`).then(res => res.data),
};

// ── Dealer APIs (Citizen-Dealer) ──
export const dealerApi = {
    listInventory: () =>
        apiClient.get<{ success: true; vehicles: DealerInventoryItem[] }>('/dealer/inventory').then(res => res.data),
    listTradeCerts: () =>
        apiClient.get<{ success: true; tradeCerts: DealerTradeCert[] }>('/dealer/trade-certs').then(res => res.data),
    createSaleRequest: (payload: CreateSaleRequestPayload) =>
        apiClient.post<{ success: true; message: string }>('/dealer/sale-requests', payload).then(res => res.data),
};

// ── Payment APIs ──
export const paymentApi = {
    initiateChallanPayment: (challanId: string, paymentMethod?: 'UPI' | 'CARD' | 'NET_BANKING' | 'WALLET') =>
        apiClient.post<{ success: true; order: PaymentOrder }>(`/payment/challans/${challanId}/initiate`, { paymentMethod }).then(res => res.data),
    listCitizenChallans: (params?: { page?: number; limit?: number; status?: ChallanStatus }) =>
        apiClient.get<{ success: true; challans: CitizenChallanForPayment[]; total: number; page: number; limit: number }>('/payment/challans', { params }).then(res => res.data),
};
