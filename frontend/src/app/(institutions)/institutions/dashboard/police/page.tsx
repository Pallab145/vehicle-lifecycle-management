'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert, FileWarning, Search } from 'lucide-react';
import Link from 'next/link';

const actions = [
    { name: 'Issue Challan', href: '/institutions/dashboard/police/challan', icon: FileWarning, description: 'Issue a new traffic violation challan against a vehicle.' },
    { name: 'Challan Records', href: '/institutions/dashboard/police/search', icon: Search, description: 'Search and manage all issued challans — mark paid, cancel.' },
];

export default function PoliceHubPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ShieldAlert className="h-6 w-6 text-primary" /> Police Hub</h1>
                <p className="text-muted-foreground">Traffic enforcement operations center.</p>
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
