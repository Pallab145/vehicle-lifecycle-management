import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pucApi } from '@/lib/api';
import { toast } from 'sonner';
import type { PucStatus, IssuePucPayload } from '@/types/b2b';

export function usePucCertificates(params?: { page?: number; limit?: number; status?: PucStatus }) {
    return useQuery({
        queryKey: ['puc', 'certificates', params],
        queryFn: () => pucApi.listCertificates(params),
        staleTime: 1000 * 60 * 2,
    });
}

export function usePucCertificateDetail(certId: string) {
    return useQuery({
        queryKey: ['puc', 'certificate', certId],
        queryFn: () => pucApi.getCertificateDetails(certId),
        enabled: !!certId,
        staleTime: 1000 * 60,
    });
}

export function useVehiclePucCertificate(ownTid: string) {
    return useQuery({
        queryKey: ['puc', 'vehicle-certificate', ownTid],
        queryFn: () => pucApi.getVehicleCertificate(ownTid),
        enabled: !!ownTid,
        staleTime: 1000 * 60,
    });
}

export function useIssuePuc() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: IssuePucPayload) => pucApi.issuePuc(payload),
        onSuccess: (data) => {
            toast.success(data.message || 'PUC certificate issued');
            queryClient.invalidateQueries({ queryKey: ['puc', 'certificates'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to issue PUC certificate');
        },
    });
}

export function useMarkPucExpired() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (certId: string) => pucApi.markExpired(certId),
        onSuccess: () => {
            toast.success('PUC certificate marked as expired');
            queryClient.invalidateQueries({ queryKey: ['puc', 'certificates'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to mark certificate expired');
        },
    });
}
