import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { toast } from 'sonner';
import type { SafeProposalStatus } from '@/types/b2b';

export function useSafeInfo() {
    return useQuery({
        queryKey: ['admin', 'safe-info'],
        queryFn: () => adminApi.getSafeInfo(),
        staleTime: 1000 * 60 * 5,
    });
}

export function useProposals(params?: { page?: number; limit?: number; status?: SafeProposalStatus }) {
    return useQuery({
        queryKey: ['admin', 'proposals', params],
        queryFn: () => adminApi.listProposals(params),
        staleTime: 1000 * 60,
    });
}

export function useProposalDetail(id: string) {
    return useQuery({
        queryKey: ['admin', 'proposal', id],
        queryFn: () => adminApi.getProposal(id),
        enabled: !!id,
        staleTime: 1000 * 30,
    });
}

export function useCancelProposal() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => adminApi.cancelProposal(id),
        onSuccess: () => {
            toast.success('Proposal cancelled');
            queryClient.invalidateQueries({ queryKey: ['admin', 'proposals'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to cancel proposal');
        },
    });
}

export function useSignProposal() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, signature }: { id: string; signature: string }) =>
            adminApi.signProposal(id, signature),
        onSuccess: (data) => {
            toast.success(data.message || 'Proposal signed');
            queryClient.invalidateQueries({ queryKey: ['admin', 'proposals'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to sign proposal');
        },
    });
}

export function useExecuteProposal() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => adminApi.executeProposal(id),
        onSuccess: () => {
            toast.success('Proposal execution initiated');
            queryClient.invalidateQueries({ queryKey: ['admin', 'proposals'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to execute proposal');
        },
    });
}
