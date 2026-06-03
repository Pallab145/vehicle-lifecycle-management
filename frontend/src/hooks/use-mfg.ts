import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mfgApi } from '@/lib/api';
import { toast } from 'sonner';
import type { VehicleStatus, ManufactureVehiclePayload, AssignToDealerPayload } from '@/types/b2b';

export function useMfgVehicles(params?: { page?: number; limit?: number; status?: VehicleStatus }) {
    return useQuery({
        queryKey: ['mfg', 'vehicles', params],
        queryFn: () => mfgApi.listVehicles(params),
        staleTime: 1000 * 60 * 2,
    });
}

export function useManufactureVehicle() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: ManufactureVehiclePayload) => mfgApi.manufacture(payload),
        onSuccess: (data) => {
            toast.success(data.message || 'Vehicle manufactured successfully');
            queryClient.invalidateQueries({ queryKey: ['mfg', 'vehicles'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to manufacture vehicle');
        },
    });
}

export function useAssignToDealer() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ tokenId, payload }: { tokenId: string; payload: AssignToDealerPayload }) =>
            mfgApi.assignToDealer(tokenId, payload),
        onSuccess: () => {
            toast.success('Vehicle assigned to dealer successfully');
            queryClient.invalidateQueries({ queryKey: ['mfg', 'vehicles'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to assign vehicle to dealer');
        },
    });
}
