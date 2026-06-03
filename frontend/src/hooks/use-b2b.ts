import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { institutionApi, staffApi, govApi } from '@/lib/api';
import { toast } from 'sonner';
import type { EntityType, MemberRole, CreateB2BEntityPayload, CreateMemberPayload } from '@/types/b2b';

// ── Analytics Hooks ──
export function useSystemAnalytics() {
    return useQuery({
        queryKey: ['gov', 'analytics'],
        queryFn: () => govApi.getSystemAnalytics(),
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

// ── Institution (B2B Entity) Hooks ──

export function useInstitutions(params?: { page?: number; limit?: number; type?: EntityType; search?: string; isActive?: boolean }) {
    return useQuery({
        queryKey: ['institutions', params],
        queryFn: () => institutionApi.list(params),
        staleTime: 1000 * 60 * 2,
    });
}

export function useInstitutionDetail(id: string) {
    return useQuery({
        queryKey: ['institution', id],
        queryFn: () => institutionApi.getById(id),
        enabled: !!id,
        staleTime: 1000 * 60,
    });
}

export function useCreateInstitution() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: CreateB2BEntityPayload) => institutionApi.create(payload),
        onSuccess: (data) => {
            toast.success(data.message || 'Institution created successfully');
            queryClient.invalidateQueries({ queryKey: ['institutions'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to create institution');
        },
    });
}

export function useToggleInstitution() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => institutionApi.toggle(id, isActive),
        onSuccess: (data) => {
            toast.success(data.message || 'Institution status updated');
            queryClient.invalidateQueries({ queryKey: ['institutions'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to update institution status');
        },
    });
}

export function useRetryRegistration() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => institutionApi.retryRegistration(id),
        onSuccess: (data) => {
            toast.success(data.message || 'Registration retry initiated');
            queryClient.invalidateQueries({ queryKey: ['institutions'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to retry registration');
        },
    });
}

// ── Staff (B2B Member) Hooks ──

export function useStaffMembers(params?: { page?: number; limit?: number; search?: string; role?: MemberRole; isActive?: boolean }) {
    return useQuery({
        queryKey: ['staff', params],
        queryFn: () => staffApi.list(params),
        staleTime: 1000 * 60 * 2,
    });
}

export function useStaffMemberDetail(id: string) {
    return useQuery({
        queryKey: ['staff', 'detail', id],
        queryFn: () => staffApi.getById(id),
        enabled: !!id,
        staleTime: 1000 * 60,
    });
}

export function useCreateStaffMember() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: CreateMemberPayload) => staffApi.create(payload),
        onSuccess: (data) => {
            toast.success(data.message || 'Staff member created');
            queryClient.invalidateQueries({ queryKey: ['staff'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to create staff member');
        },
    });
}

export function useUpdateStaffRole() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, role }: { id: string; role: MemberRole }) => staffApi.updateRole(id, role),
        onSuccess: () => {
            toast.success('Role updated successfully');
            queryClient.invalidateQueries({ queryKey: ['staff'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to update role');
        },
    });
}

export function useUpdateStaffStatus() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => staffApi.updateStatus(id, isActive),
        onSuccess: () => {
            toast.success('Status updated successfully');
            queryClient.invalidateQueries({ queryKey: ['staff'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to update status');
        },
    });
}

export function useForceResetStaffPassword() {
    return useMutation({
        mutationFn: (id: string) => staffApi.forceResetPassword(id),
        onError: (error: any) => {
            toast.error(error.message || 'Failed to reset password');
        },
    });
}

export function useChangePassword() {
    return useMutation({
        mutationFn: (payload: { oldPassword: string; newPassword: string }) => staffApi.changePassword(payload),
        onSuccess: (data) => {
            toast.success(data.message || 'Password successfully changed');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to change password');
        },
    });
}

// ── Global System Logs ──
export function useGlobalAuditLogs(params?: { page?: number; limit?: number }) {
    return useQuery({
        queryKey: ['gov', 'auditLogs', params],
        queryFn: () => govApi.getAuditLogs(params),
        staleTime: 1000 * 60 * 2, // 2 minutes
    });
}
