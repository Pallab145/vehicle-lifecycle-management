'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wind, ClipboardCheck, History } from 'lucide-react';
import Link from 'next/link';

const actions = [
    { name: 'Issue PUC Certificate', href: '/institutions/dashboard/puc/issue', icon: ClipboardCheck, description: 'Conduct emissions test and issue PUC certificate on blockchain.' },
    { name: 'Testing Logs', href: '/institutions/dashboard/puc/logs', icon: History, description: 'View all PUC certificates issued, mark expired ones.' },
];

export default function PucHubPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Wind className="h-6 w-6 text-primary" /> PUC Center Hub</h1>
                <p className="text-muted-foreground">Pollution Under Control testing operations.</p>
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
