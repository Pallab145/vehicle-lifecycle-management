'use client';

import { useUser } from '@/contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, Factory, Landmark, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ENTITY_NAV_CONFIG } from '@/config/b2b-navigation';

export default function InstitutionDashboardPage() {
    const { user } = useUser();

    if (!user) return null;

    const entityType = user.entityType || 'UNKNOWN';
    const primaryNav = ENTITY_NAV_CONFIG[entityType]?.[1]; // Usually the primary action

    return (
        <div className="space-y-6 max-w-4xl mx-auto mt-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Welcome to the B2B Portal</h1>
                <p className="text-muted-foreground">
                    You are logged in as a <span className="font-semibold text-primary">{user.role}</span> for a <span className="font-semibold text-primary">{entityType}</span> institution.
                </p>
            </div>

            <Card className="border-2 border-primary/10 shadow-sm bg-gradient-to-br from-card to-muted/20">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-6 w-6 text-primary" />
                        Authentication Context
                    </CardTitle>
                    <CardDescription>Your secure institutional session details</CardDescription>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-4">
                    <div>
                        <span className="block text-sm text-muted-foreground mb-1">Entity ID</span>
                        <code className="bg-muted px-2 py-1 rounded text-sm">{user.entityId || 'N/A'}</code>
                    </div>
                    <div>
                        <span className="block text-sm text-muted-foreground mb-1">Email Address</span>
                        <code className="bg-muted px-2 py-1 rounded text-sm">{user.email}</code>
                    </div>
                    {user.wallet && (
                        <div className="sm:col-span-2">
                            <span className="block text-sm text-muted-foreground mb-1">Connected Wallet</span>
                            <code className="bg-muted px-2 py-1 rounded text-sm break-all">{user.wallet}</code>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="flex flex-col sm:flex-row gap-4">
                {primaryNav && (
                    <Link href={primaryNav.href} className="w-full sm:w-auto">
                        <Button size="lg" className="w-full">
                            Go to {primaryNav.name} <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                )}
                <Link href="/institutions/dashboard/settings" className="w-full sm:w-auto">
                    <Button variant="outline" size="lg" className="w-full">
                        Manage Settings
                    </Button>
                </Link>
            </div>
        </div>
    );
}
