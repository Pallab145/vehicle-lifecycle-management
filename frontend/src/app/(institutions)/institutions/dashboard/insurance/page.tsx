'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, FileText, FileSearch } from 'lucide-react';
import Link from 'next/link';

const actions = [
    { name: 'Issue Policy', href: '/institutions/dashboard/insurance/policies', icon: FileText, description: 'Issue new insurance policies and manage existing ones.' },
    { name: 'Claims & Expiry', href: '/institutions/dashboard/insurance/claims', icon: FileSearch, description: 'File insurance claims and mark policies as expired.' },
];

export default function InsuranceHubPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /> Insurance Hub</h1>
                <p className="text-muted-foreground">Insurance operations center — issue policies, manage claims.</p>
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
