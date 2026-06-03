import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scrapApi } from '@/lib/api';
import { toast } from 'sonner';

export function useScrappedVehicles(params?: { page?: number; limit?: number }) {
    return useQuery({
        queryKey: ['scrap', 'vehicles', params],
        queryFn: () => scrapApi.listScrappedVehicles(params),
        staleTime: 1000 * 60 * 2,
    });
}

export function useScrapVehicleDetail(dvpId: string) {
    return useQuery({
        queryKey: ['scrap', 'vehicle', dvpId],
        queryFn: () => scrapApi.getVehicleDetails(dvpId),
        enabled: !!dvpId,
        staleTime: 1000 * 60,
    });
}

export function useScrapEligibility(dvpId: string) {
    return useQuery({
        queryKey: ['scrap', 'eligibility', dvpId],
        queryFn: () => scrapApi.checkEligibility(dvpId),
        enabled: !!dvpId,
        staleTime: 1000 * 30,
    });
}

export function useScrapVehicle() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (dvpId: string) => scrapApi.scrapVehicle(dvpId),
        onSuccess: () => {
            toast.success('Vehicle scrapped successfully');
            queryClient.invalidateQueries({ queryKey: ['scrap'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to scrap vehicle');
        },
    });
}
