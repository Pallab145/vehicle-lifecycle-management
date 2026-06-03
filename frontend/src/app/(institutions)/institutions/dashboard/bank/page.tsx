'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Landmark, FileText, Shield } from 'lucide-react';
import Link from 'next/link';

const actions = [
    { name: 'Loan Management', href: '/institutions/dashboard/bank/loans', icon: FileText, description: 'Register new vehicle loans, view portfolio, and manage loan lifecycle.' },
    { name: 'NOC & Settlement', href: '/institutions/dashboard/bank/noc', icon: Shield, description: 'Issue NOC for cleared loans, process refinancing.' },
];

export default function BankHubPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Landmark className="h-6 w-6 text-primary" /> Bank Hub</h1>
                <p className="text-muted-foreground">Financial institution operations — vehicle loans and NOC management.</p>
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
