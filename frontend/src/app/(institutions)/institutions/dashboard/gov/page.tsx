'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useUser } from '@/contexts/UserContext';
import { useSystemAnalytics } from '@/hooks/use-b2b';
import { Building2, ShieldAlert, Activity, Car, FileWarning, HandCoins, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';

const COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6'];

export default function GovOverviewPage() {
    const { user } = useUser();
    const { data: analyticsResp, isLoading } = useSystemAnalytics();
    
    const quickActions = [
        { name: 'Manage Entities', href: '/institutions/dashboard/gov/entities', icon: Building2, description: 'Register, view, and toggle B2B institutions' },
        { name: 'Global Challans', href: '/institutions/dashboard/gov/logs', icon: ShieldAlert, description: 'View and manage all traffic challans system-wide' },
    ];

    if (isLoading || !analyticsResp) {
        return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    const { analytics } = analyticsResp;

    // Format data for Recharts
    const vehicleData = [
        { name: 'Manufactured', value: analytics.vehicles.manufactured },
        { name: 'Active', value: analytics.vehicles.active },
        { name: 'Scrapped', value: analytics.vehicles.scrapped },
    ];

    const finesData = [
        { name: 'Collected', value: Number(analytics.fines.collectedWei) / 1e18 },
        { name: 'Pending', value: Number(analytics.fines.pendingWei) / 1e18 },
    ];

    const institutionData = analytics.institutions.map(inst => ({
        name: inst.type.replace('_', ' '),
        count: inst.count
    }));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">National Overview</h1>
                <p className="text-muted-foreground">Government super-admin analytics and system-wide visibility.</p>
            </div>

            {/* Top Level Metric Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-200/50">
                    <CardHeader className="pb-2 flex flex-row justify-between items-center">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Vehicles</CardTitle>
                        <Car className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent><p className="text-2xl font-bold text-blue-600">{analytics.vehicles.total}</p></CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-200/50">
                    <CardHeader className="pb-2 flex flex-row justify-between items-center">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Pending Fines (ETH)</CardTitle>
                        <FileWarning className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent><p className="text-2xl font-bold text-red-600">{(Number(analytics.fines.pendingWei) / 1e18).toFixed(4)}</p></CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-200/50">
                    <CardHeader className="pb-2 flex flex-row justify-between items-center">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Collected Fines (ETH)</CardTitle>
                        <HandCoins className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent><p className="text-2xl font-bold text-green-600">{(Number(analytics.fines.collectedWei) / 1e18).toFixed(4)}</p></CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-200/50">
                    <CardHeader className="pb-2 flex flex-row justify-between items-center">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Transfers (30d)</CardTitle>
                        <Activity className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent><p className="text-2xl font-bold text-purple-600">{analytics.recentActivity.transfersLast30Days}</p></CardContent>
                </Card>
            </div>

            {/* Charts Row */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Vehicle Distribution Pie Chart */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Vehicle Lifecycle Status</CardTitle>
                        <CardDescription>Current state of all minted Digital Vehicle Passports</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={vehicleData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                    {vehicleData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => [value, 'Vehicles']} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Institutions Bar Chart */}
                <Card className="col-span-1 lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Registered Institutions</CardTitle>
                        <CardDescription>B2B network nodes registered on the blockchain</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={institutionData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                <YAxis allowDecimals={false} />
                                <Tooltip cursor={{ fill: 'transparent' }} />
                                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                {quickActions.map((action) => (
                    <Link key={action.href} href={action.href}>
                        <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer h-full">
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-primary/10">
                                        <action.icon className="h-5 w-5 text-primary" />
                                    </div>
                                    <CardTitle className="text-lg">{action.name}</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">{action.description}</p>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}
