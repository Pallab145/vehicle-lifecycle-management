'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileSignature, ArrowLeftRight, FileCheck2, Landmark } from 'lucide-react';
import Link from 'next/link';

const actions = [
    { name: 'Vehicle Registrations', href: '/institutions/dashboard/rto/registrations', icon: FileSignature, description: 'Approve dealer sale requests and register vehicles' },
    { name: 'Transfer Approvals', href: '/institutions/dashboard/rto/transfers', icon: ArrowLeftRight, description: 'Review and approve ownership transfers' },
    { name: 'Trade Certificates', href: '/institutions/dashboard/rto/trade-certs', icon: FileCheck2, description: 'Issue and revoke dealer trade certificates' },
];

export default function RtoHubPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Landmark className="h-6 w-6 text-primary" /> RTO Hub</h1>
                <p className="text-muted-foreground">Regional Transport Office operations center.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {actions.map((a) => (
                    <Link key={a.href} href={a.href}>
                        <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer h-full">
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-primary/10"><a.icon className="h-5 w-5 text-primary" /></div>
                                    <CardTitle className="text-lg">{a.name}</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent><p className="text-sm text-muted-foreground">{a.description}</p></CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}
