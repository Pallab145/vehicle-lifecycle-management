import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { paymentApi, govApi } from '@/lib/api';
import { toast } from 'sonner';
import type { ChallanStatus } from '@/types/b2b';

// ── Payment Hooks (Citizen) ──

export function useCitizenChallans(params?: { page?: number; limit?: number; status?: ChallanStatus }) {
    return useQuery({
        queryKey: ['payment', 'challans', params],
        queryFn: () => paymentApi.listCitizenChallans(params),
        staleTime: 1000 * 60 * 2,
    });
}

export function useInitiatePayment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ challanId, paymentMethod }: { challanId: string; paymentMethod?: 'UPI' | 'CARD' | 'NET_BANKING' | 'WALLET' }) =>
            paymentApi.initiateChallanPayment(challanId, paymentMethod),
        onSuccess: () => {
            toast.success('Payment initiated');
            queryClient.invalidateQueries({ queryKey: ['payment', 'challans'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to initiate payment');
        },
    });
}

// ── Government Hooks ──

export function useGlobalChallans(params?: { page?: number; limit?: number; status?: ChallanStatus }) {
    return useQuery({
        queryKey: ['gov', 'challans', params],
        queryFn: () => govApi.listGlobalChallans(params),
        staleTime: 1000 * 60 * 2,
    });
}

export function useAdminCancelChallan() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (challanId: string) => govApi.adminCancelChallan(challanId),
        onSuccess: () => {
            toast.success('Challan cancelled by admin');
            queryClient.invalidateQueries({ queryKey: ['gov', 'challans'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to cancel challan');
        },
    });
}
