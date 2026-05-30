import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { citizenApi } from '@/lib/api';
import { toast } from 'sonner';

// ── Data Fetching Hooks ──

export function useCitizenProfile() {
    return useQuery({
        queryKey: ['citizen', 'profile'],
        queryFn: citizenApi.getMe,
        staleTime: 1000 * 60 * 10, // 10 minutes
        retry: 1,
    });
}

export function useVehicles(page = 1, limit = 20) {
    return useQuery({
        queryKey: ['citizen', 'vehicles', page, limit],
        queryFn: () => citizenApi.listMyVehicles(page, limit),
        staleTime: 1000 * 60 * 2, // 2 minutes
    });
}

export function useVehicleDetail(ownTid: string) {
    return useQuery({
        queryKey: ['citizen', 'vehicle', ownTid],
        queryFn: () => citizenApi.getVehicleDetail(ownTid),
        enabled: !!ownTid,
        staleTime: 1000 * 60, // 1 minute
    });
}

export function useRtos() {
    return useQuery({
        queryKey: ['public', 'rtos'],
        queryFn: citizenApi.listRtos,
        staleTime: 1000 * 60 * 60 * 24, // 24 hours (seldom changes)
    });
}

// ── Mutations ──

export function useSubmitKyc() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (payload: { 
            documentType: string; 
            documentNumber: string; 
            name: string; 
            phone: string; 
            email?: string; 
            rtoEntityId?: string;
        }) => {
            // Note: Our API signature in api.ts might need an update if we pass all these fields
            // The existing citizenApi.submitKyc signature in api.ts takes only fullName and aadhaarNumber
            // Let's ensure it matches the actual backend VerifyKycSchema!
            return citizenApi.submitKyc(payload as any); 
        },
        onSuccess: (data) => {
            toast.success('KYC Submitted and Verified successfully!');
            // Update the profile cache with the new verified profile
            queryClient.setQueryData(['citizen', 'profile'], data);
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to submit KYC');
        }
    });
}
