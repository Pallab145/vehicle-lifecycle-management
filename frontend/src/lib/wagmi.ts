import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { type Chain } from 'viem';

export const vehiclePrivateChain = {
  id: 4100,
  name: 'Vehicle Lifecycle Private Network',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: ['https://rpc.ahaarx.com'] },
    public: { http: ['https://rpc.ahaarx.com'] },
  },
} as const satisfies Chain;

export const config = getDefaultConfig({
  appName: 'Vehicle Lifecycle Management',
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID as string,
  chains: [vehiclePrivateChain],
  ssr: true, // Required for Next.js App Router
});
