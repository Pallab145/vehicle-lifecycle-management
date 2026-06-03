import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dealerApi } from '@/lib/api';
import { toast } from 'sonner';
import type { CreateSaleRequestPayload } from '@/types/b2b';

export function useDealerInventory() {
    return useQuery({
        queryKey: ['dealer', 'inventory'],
        queryFn: () => dealerApi.listInventory(),
        staleTime: 1000 * 60 * 2,
    });
}

export function useDealerTradeCerts() {
    return useQuery({
        queryKey: ['dealer', 'trade-certs'],
        queryFn: () => dealerApi.listTradeCerts(),
        staleTime: 1000 * 60 * 5,
    });
}

export function useCreateSaleRequest() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: CreateSaleRequestPayload) => dealerApi.createSaleRequest(payload),
        onSuccess: () => {
            toast.success('Sale request submitted to RTO');
            queryClient.invalidateQueries({ queryKey: ['dealer', 'inventory'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to submit sale request');
        },
    });
}
