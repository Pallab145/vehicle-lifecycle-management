'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@/contexts/UserContext';
import { Loader2 } from 'lucide-react';
import type { AuthType } from '@/types/auth';

interface RequireAuthProps {
    children: React.ReactNode;
    allowedTypes?: AuthType[]; // If empty, any logged-in user is allowed
    redirectTo?: string;
}

/**
 * A wrapper component that strictly enforces authentication and role-based access.
 * It uses the cached React Query state from UserContext, so it won't trigger unnecessary network requests.
 */
export function RequireAuth({ children, allowedTypes, redirectTo = '/login' }: RequireAuthProps) {
    const { user, isLoading } = useUser();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!isLoading) {
            // 1. Not logged in
            if (!user) {
                // Pass a generic returnUrl to redirect back after login, if needed
                const searchParams = new URLSearchParams();
                searchParams.set('returnUrl', pathname);
                router.replace(`${redirectTo}?${searchParams.toString()}`);
                return;
            }

            // 2. Logged in, but wrong type (e.g. B2C user trying to access B2B routes)
            if (allowedTypes && allowedTypes.length > 0 && !allowedTypes.includes(user.type)) {
                // Kick them to a forbidden page or their own dashboard
                router.replace(user.type === 'B2C' ? '/(citizen)' : '/institutions/dashboard');
            }
        }
    }, [user, isLoading, allowedTypes, redirectTo, router, pathname]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    // Only render children if user exists AND meets type requirements
    if (!user || (allowedTypes && !allowedTypes.includes(user.type))) {
        return null; // Will redirect in useEffect
    }

    return <>{children}</>;
}

// ── Convenience Wrappers ──

export function RequireB2CAuth({ children }: { children: React.ReactNode }) {
    return <RequireAuth allowedTypes={['B2C']} redirectTo="/">{children}</RequireAuth>;
}

export function RequireB2BAuth({ children }: { children: React.ReactNode }) {
    return <RequireAuth allowedTypes={['B2B']} redirectTo="/institutions/login">{children}</RequireAuth>;
}
