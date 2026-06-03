import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { policeApi } from '@/lib/api';
import { toast } from 'sonner';
import type { ChallanStatus, IssueChallanPayload } from '@/types/b2b';

export function usePoliceChallans(params?: { page?: number; limit?: number; status?: ChallanStatus }) {
    return useQuery({
        queryKey: ['police', 'challans', params],
        queryFn: () => policeApi.listChallans(params),
        staleTime: 1000 * 60 * 2,
    });
}

export function useIssueChallan() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: IssueChallanPayload) => policeApi.issueChallan(payload),
        onSuccess: (data) => {
            toast.success(data.message || 'Challan issued successfully');
            queryClient.invalidateQueries({ queryKey: ['police', 'challans'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to issue challan');
        },
    });
}

export function useCancelChallan() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (challanId: string) => policeApi.cancelChallan(challanId),
        onSuccess: () => {
            toast.success('Challan cancelled');
            queryClient.invalidateQueries({ queryKey: ['police', 'challans'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to cancel challan');
        },
    });
}

export function useMarkChallanPaid() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (challanId: string) => policeApi.markPaid(challanId),
        onSuccess: () => {
            toast.success('Challan marked as paid');
            queryClient.invalidateQueries({ queryKey: ['police', 'challans'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to mark challan as paid');
        },
    });
}
