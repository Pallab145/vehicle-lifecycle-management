import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rtoApi } from '@/lib/api';
import { toast } from 'sonner';
import type { RegistrationStatus, TransferStatus, IssueTradeCertPayload, RegisterVehiclePayload } from '@/types/b2b';

// ── Read Hooks ──

export function useRtoRegistrations(params?: { page?: number; limit?: number; status?: RegistrationStatus }) {
    return useQuery({
        queryKey: ['rto', 'registrations', params],
        queryFn: () => rtoApi.listRegistrations(params),
        staleTime: 1000 * 60 * 2,
    });
}

export function useRtoTransfers(params?: { page?: number; limit?: number; status?: TransferStatus }) {
    return useQuery({
        queryKey: ['rto', 'transfers', params],
        queryFn: () => rtoApi.listTransfers(params),
        staleTime: 1000 * 60 * 2,
    });
}

export function useRtoTradeCerts(params?: { page?: number; limit?: number; isActive?: string }) {
    return useQuery({
        queryKey: ['rto', 'trade-certs', params],
        queryFn: () => rtoApi.listTradeCerts(params),
        staleTime: 1000 * 60 * 2,
    });
}

// ── Mutation Hooks ──

export function useIssueTradeCert() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: IssueTradeCertPayload) => rtoApi.issueTradeCert(payload),
        onSuccess: (data) => {
            toast.success(data.message || 'Trade certificate issued');
            queryClient.invalidateQueries({ queryKey: ['rto', 'trade-certs'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to issue trade certificate');
        },
    });
}

export function useRevokeTradeCert() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (dealerWallet: string) => rtoApi.revokeTradeCert(dealerWallet),
        onSuccess: () => {
            toast.success('Trade certificate revoked');
            queryClient.invalidateQueries({ queryKey: ['rto', 'trade-certs'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to revoke trade certificate');
        },
    });
}

export function useRegisterVehicle() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: RegisterVehiclePayload) => rtoApi.registerVehicle(payload),
        onSuccess: () => {
            toast.success('Vehicle registration submitted to blockchain');
            queryClient.invalidateQueries({ queryKey: ['rto', 'registrations'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to register vehicle');
        },
    });
}

export function useApproveTransfer() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (ownTid: string) => rtoApi.approveTransfer(ownTid),
        onSuccess: () => {
            toast.success('Transfer approved and submitted to blockchain');
            queryClient.invalidateQueries({ queryKey: ['rto', 'transfers'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to approve transfer');
        },
    });
}
