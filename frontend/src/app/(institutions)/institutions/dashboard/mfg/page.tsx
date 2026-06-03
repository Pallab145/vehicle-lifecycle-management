'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Factory, Hammer, History, Truck } from 'lucide-react';
import Link from 'next/link';

const actions = [
    { name: 'Mint Vehicle (DVP)', href: '/institutions/dashboard/mfg/mint', icon: Hammer, description: 'Manufacture a new vehicle and mint a Digital Vehicle Passport on the blockchain.' },
    { name: 'Production History', href: '/institutions/dashboard/mfg/history', icon: History, description: 'View all manufactured vehicles, assign to dealers, and track status.' },
];

export default function MfgHubPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Factory className="h-6 w-6 text-primary" /> Manufacturer Hub</h1>
                <p className="text-muted-foreground">Vehicle manufacturing operations center.</p>
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
