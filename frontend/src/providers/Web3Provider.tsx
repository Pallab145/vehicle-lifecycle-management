'use client';

import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { config } from '@/lib/wagmi';
import '@rainbow-me/rainbowkit/styles.css';

export function Web3Provider({ children }: { children: React.ReactNode }) {
    // Combine Wagmi + React Query + RainbowKit here to ensure correct nesting
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 1000 * 60 * 5,
                refetchOnWindowFocus: false,
                retry: 1,
            },
        },
    }));

    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider theme={lightTheme({
                    accentColor: 'hsl(var(--primary))',
                    accentColorForeground: 'hsl(var(--primary-foreground))',
                    borderRadius: 'medium',
                })}>
                    {children}
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
