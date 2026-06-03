import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bankApi } from '@/lib/api';
import { toast } from 'sonner';
import type { LoanStatus, RegisterLoanPayload, RefinanceLoanPayload } from '@/types/b2b';

export function useBankLoans(params?: { page?: number; limit?: number; status?: LoanStatus; nocIssued?: boolean; dvpId?: string }) {
    return useQuery({
        queryKey: ['bank', 'loans', params],
        queryFn: () => bankApi.listLoans(params),
        staleTime: 1000 * 60 * 2,
    });
}

export function useLoanDetail(loanId: string) {
    return useQuery({
        queryKey: ['bank', 'loan', loanId],
        queryFn: () => bankApi.getLoanDetails(loanId),
        enabled: !!loanId,
        staleTime: 1000 * 60,
    });
}

export function useRegisterLoan() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: RegisterLoanPayload) => bankApi.registerLoan(payload),
        onSuccess: (data) => {
            toast.success(data.message || 'Loan registered successfully');
            queryClient.invalidateQueries({ queryKey: ['bank', 'loans'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to register loan');
        },
    });
}

export function useIssueNoc() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (loanId: string) => bankApi.issueNoc(loanId),
        onSuccess: () => {
            toast.success('NOC issued successfully');
            queryClient.invalidateQueries({ queryKey: ['bank', 'loans'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to issue NOC');
        },
    });
}

export function useCancelPendingLoan() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (dvpId: string) => bankApi.cancelPendingLoan(dvpId),
        onSuccess: () => {
            toast.success('Pending loan cancelled');
            queryClient.invalidateQueries({ queryKey: ['bank', 'loans'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to cancel pending loan');
        },
    });
}

export function useRefinanceLoan() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ loanId, payload }: { loanId: string; payload: RefinanceLoanPayload }) =>
            bankApi.refinanceLoan(loanId, payload),
        onSuccess: () => {
            toast.success('Loan refinanced successfully');
            queryClient.invalidateQueries({ queryKey: ['bank', 'loans'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to refinance loan');
        },
    });
}
