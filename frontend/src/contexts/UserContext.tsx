'use client';

import React, { createContext, useContext, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/lib/api';
import type { AuthUser } from '@/types/auth';

interface UserContextState {
    user: AuthUser | null;
    isLoading: boolean;
    error: Error | null;
    refetchUser: () => Promise<void>;
    logout: () => Promise<void>;
}

const UserContext = createContext<UserContextState | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
    const queryClient = useQueryClient();

    // Fetch user profile on mount / focus. 
    // If it fails with 401, it will gracefully return null and not throw thanks to retry: false.
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: async () => {
            try {
                const res = await authApi.getMe();
                return res;
            } catch (err: any) {
                // If the user is unauthenticated (401), we just return null. 
                // Any other error (500) will be thrown and caught by react-query.
                if (err?.status === 401) {
                    return null;
                }
                throw err;
            }
        },
        retry: false,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });

    const logout = async () => {
        try {
            await authApi.logout();
        } catch (e) {
            console.error('Logout failed', e);
        } finally {
            // Clear all react-query cache and reset user to null immediately
            queryClient.clear();
            await refetch();
        }
    };

    const value = useMemo(() => ({
        user: data || null,
        isLoading,
        error: error as Error | null,
        refetchUser: async () => { await refetch(); },
        logout,
    }), [data, isLoading, error, refetch, queryClient]);

    return (
        <UserContext.Provider value={value}>
            {children}
        </UserContext.Provider>
    );
}

export function useUser() {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error('useUser must be used within a UserProvider');
    }
    return context;
}
