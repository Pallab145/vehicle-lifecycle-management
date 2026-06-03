import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { insuranceApi } from '@/lib/api';
import { toast } from 'sonner';
import type { InsuranceStatus, IssuePolicyPayload } from '@/types/b2b';

export function useInsurancePolicies(params?: { page?: number; limit?: number; status?: InsuranceStatus; ownTid?: string }) {
    return useQuery({
        queryKey: ['insurance', 'policies', params],
        queryFn: () => insuranceApi.listPolicies(params),
        staleTime: 1000 * 60 * 2,
    });
}

export function usePolicyDetail(polId: string) {
    return useQuery({
        queryKey: ['insurance', 'policy', polId],
        queryFn: () => insuranceApi.getPolicyDetails(polId),
        enabled: !!polId,
        staleTime: 1000 * 60,
    });
}

export function useVehiclePolicy(ownTid: string) {
    return useQuery({
        queryKey: ['insurance', 'vehicle-policy', ownTid],
        queryFn: () => insuranceApi.getVehiclePolicy(ownTid),
        enabled: !!ownTid,
        staleTime: 1000 * 60,
    });
}

export function useIssuePolicy() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: IssuePolicyPayload) => insuranceApi.issuePolicy(payload),
        onSuccess: (data) => {
            toast.success(data.message || 'Policy issued successfully');
            queryClient.invalidateQueries({ queryKey: ['insurance', 'policies'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to issue policy');
        },
    });
}

export function useFileClaim() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (polId: string) => insuranceApi.fileClaim(polId),
        onSuccess: () => {
            toast.success('Claim filed successfully');
            queryClient.invalidateQueries({ queryKey: ['insurance', 'policies'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to file claim');
        },
    });
}

export function useMarkInsuranceExpired() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (polId: string) => insuranceApi.markExpired(polId),
        onSuccess: () => {
            toast.success('Policy marked as expired');
            queryClient.invalidateQueries({ queryKey: ['insurance', 'policies'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to mark policy expired');
        },
    });
}
