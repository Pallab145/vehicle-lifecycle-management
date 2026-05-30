'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSignMessage, useDisconnect } from 'wagmi';
import { authApi } from '@/lib/api';
import { useUser } from '@/contexts/UserContext';
import { Button } from '@/components/ui/button';
import { Loader2, LogIn, LayoutDashboard, LogOut } from 'lucide-react';
import { toast } from 'sonner';

export function Web3LoginButton() {
    const { address, isConnected } = useAccount();
    const { disconnect } = useDisconnect();
    const { signMessageAsync } = useSignMessage();
    const { user, refetchUser, isLoading: isUserLoading, logout } = useUser();
    const router = useRouter();

    const [isSigningIn, setIsSigningIn] = useState(false);

    // Is the user cryptographically logged into our backend?
    const isAuthenticated = user?.type === 'B2C' && user?.wallet?.toLowerCase() === address?.toLowerCase();

    const handleSignIn = async () => {
        if (!address) return;
        
        setIsSigningIn(true);
        try {
            // 1. Fetch secure nonce from our backend
            const { nonce } = await authApi.getCitizenNonce();

            // 2. Construct standard SIWE message
            const message = `Welcome to Vehicle Lifecycle Management!\n\nSign this message to securely log in. This costs no gas.\n\nWallet: ${address}\nNonce: ${nonce}`;

            // 3. Prompt user to sign the message with MetaMask
            const signature = await signMessageAsync({ message });

            // 4. Send signature to backend for verification and JWT session cookie issuance
            await authApi.loginCitizen(address, message, signature);

            // 5. Refetch the global user context
            await refetchUser();
            
            toast.success('Successfully logged in!');
            router.push('/dashboard');
        } catch (error: any) {
            console.error('SIWE Error:', error);
            // Handle user rejecting the signature
            if (error?.code === 4001) {
                toast.error('Signature request rejected');
            } else {
                toast.error(error.message || 'Failed to verify signature');
            }
        } finally {
            setIsSigningIn(false);
        }
    };

    const handleLogout = async () => {
        await logout(); // Clears backend session cookie
        disconnect(); // Disconnects wagmi wallet
    };

    return (
        <ConnectButton.Custom>
            {({
                account,
                chain,
                openAccountModal,
                openChainModal,
                openConnectModal,
                authenticationStatus,
                mounted,
            }) => {
                const ready = mounted && authenticationStatus !== 'loading' && !isUserLoading;
                const connected = ready && account && chain && (!authenticationStatus || authenticationStatus === 'authenticated');

                if (!ready) {
                    return (
                        <Button disabled variant="outline" className="w-full">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Loading...
                        </Button>
                    );
                }

                if (!connected) {
                    return (
                        <Button onClick={openConnectModal} className="w-full">
                            Connect Wallet
                        </Button>
                    );
                }

                if (chain.unsupported) {
                    return (
                        <Button onClick={openChainModal} variant="destructive" className="w-full">
                            Wrong Network
                        </Button>
                    );
                }

                // Wallet is connected to the right chain.
                // Are they authenticated with our backend?
                if (!isAuthenticated) {
                    return (
                        <Button onClick={handleSignIn} disabled={isSigningIn} className="w-full font-bold">
                            {isSigningIn ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <LogIn className="mr-2 h-4 w-4" />
                            )}
                            {isSigningIn ? 'Signing...' : 'Sign in to Dashboard'}
                        </Button>
                    );
                }

                // Wallet is connected AND authenticated with backend.
                return (
                    <div className="flex flex-col gap-2 w-full">
                        <Button onClick={() => router.push('/dashboard')} className="w-full" variant="outline">
                            <LayoutDashboard className="mr-2 h-4 w-4" />
                            Go to Dashboard
                        </Button>
                        <div className="flex items-center justify-between mt-2 text-sm text-muted-foreground bg-muted p-2 rounded-md">
                            <span className="truncate max-w-[120px]" title={account.address}>
                                {account.displayName}
                            </span>
                            <button 
                                onClick={handleLogout}
                                className="text-destructive hover:underline flex items-center"
                            >
                                <LogOut className="h-3 w-3 mr-1" />
                                Disconnect
                            </button>
                        </div>
                    </div>
                );
            }}
        </ConnectButton.Custom>
    );
}
