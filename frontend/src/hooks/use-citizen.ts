import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { citizenApi } from '@/lib/api';
import { toast } from 'sonner';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';

// ── Contract ABIs (minimal, only citizen-callable functions) ──

export const OWNERSHIP_ABI = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "ownTid", "type": "uint256" },
      { "internalType": "address", "name": "buyer", "type": "address" }
    ],
    "name": "initTransfer",
    "outputs": [{ "internalType": "uint64", "name": "", "type": "uint64" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "ownTid", "type": "uint256" }
    ],
    "name": "acceptTransfer",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "ownTid", "type": "uint256" }
    ],
    "name": "cancelTransfer",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export const DVP_ABI = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "internalType": "string", "name": "scrapCenterCode", "type": "string" }
    ],
    "name": "authorizeScrap",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

// Read from env, fallback to placeholder for dev
export const OWNERSHIP_CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_OWNERSHIP_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;
export const DVP_CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_DVP_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;

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

export function useIncomingTransfers() {
    return useQuery({
        queryKey: ['citizen', 'transfers', 'incoming'],
        queryFn: citizenApi.getIncomingTransfers,
        staleTime: 1000 * 30, // 30 seconds
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

export function useVehicleTimeline(ownTid: string) {
    return useQuery({
        queryKey: ['citizen', 'vehicle', ownTid, 'timeline'],
        queryFn: () => citizenApi.getVehicleTimeline(ownTid),
        enabled: !!ownTid,
        staleTime: 1000 * 60 * 5, // 5 minutes
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

export function useInitTransfer() {
    const { data: hash, isPending, writeContract, error } = useWriteContract();

    const initiate = async (ownTid: string, buyerAddress: string) => {
        writeContract({
            address: OWNERSHIP_CONTRACT_ADDRESS,
            abi: OWNERSHIP_ABI,
            functionName: 'initTransfer',
            args: [BigInt(ownTid), buyerAddress as `0x${string}`],
        });
    };

    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
        hash,
    });

    return {
        initiate,
        isPending,
        isConfirming,
        isConfirmed,
        hash,
        error
    };
}

export function useAcceptTransfer() {
    const { data: hash, isPending, writeContract, error, reset } = useWriteContract();

    const accept = (ownTid: string) => {
        writeContract({
            address: OWNERSHIP_CONTRACT_ADDRESS,
            abi: OWNERSHIP_ABI,
            functionName: 'acceptTransfer',
            args: [BigInt(ownTid)],
        });
    };

    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
        hash,
    });

    return {
        accept,
        isPending,
        isConfirming,
        isConfirmed,
        hash,
        error,
        reset,
    };
}

export function useCancelTransfer() {
    const { data: hash, isPending, writeContract, error, reset } = useWriteContract();

    const cancel = (ownTid: string) => {
        writeContract({
            address: OWNERSHIP_CONTRACT_ADDRESS,
            abi: OWNERSHIP_ABI,
            functionName: 'cancelTransfer',
            args: [BigInt(ownTid)],
        });
    };

    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
        hash,
    });

    return {
        cancel,
        isPending,
        isConfirming,
        isConfirmed,
        hash,
        error,
        reset,
    };
}


export function useAuthorizeScrap() {
    const { data: hash, isPending, writeContract, error, reset } = useWriteContract();

    const authorize = (dvpId: string, scrapCenterCode: string) => {
        writeContract({
            address: DVP_CONTRACT_ADDRESS,
            abi: DVP_ABI,
            functionName: 'authorizeScrap',
            args: [BigInt(dvpId), scrapCenterCode],
        });
    };

    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
        hash,
    });

    return {
        authorize,
        isPending,
        isConfirming,
        isConfirmed,
        hash,
        error,
        reset,
    };
}

export function useScrapCenters() {
    return useQuery({
        queryKey: ['public', 'scrap-centers'],
        queryFn: () => citizenApi.listScrapCenters(),
        staleTime: 1000 * 60 * 60, // 1 hour (seldom changes)
    });
}
