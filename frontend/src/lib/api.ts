import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { AuthUser } from '@/types/auth';
import type { 
    B2BEntity, 
    CitizenProfile,
    VehicleOwnership, 
    ScrapEligibilityResult, 
    TransferEligibilityResult,
    TransferRequest
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
    timeout: 10_000,
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
};
