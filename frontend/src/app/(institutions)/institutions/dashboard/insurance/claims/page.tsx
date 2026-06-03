'use client';

import { useState } from 'react';
import { useInsurancePolicies, useFileClaim, useMarkInsuranceExpired } from '@/hooks/use-insurance';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FileSearch, MoreHorizontal, AlertTriangle, Clock } from 'lucide-react';
import type { InsurancePolicyRecord, InsuranceStatus } from '@/types/b2b';

const STATUS_COLORS: Record<InsuranceStatus, string> = {
    ACTIVE: 'bg-green-500/10 text-green-600 border-green-500/30',
    EXPIRED: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
    CANCELLED: 'bg-red-500/10 text-red-600 border-red-500/30',
};

export default function InsuranceClaimsPage() {
    const [page, setPage] = useState(1);
    const { data, isLoading } = useInsurancePolicies({ page, limit: 10, status: 'ACTIVE' });
    const claimMutation = useFileClaim();
    const expireMutation = useMarkInsuranceExpired();

    const columns: Column<InsurancePolicyRecord>[] = [
        { key: 'polId', header: 'Policy #', render: (r) => <span className="font-mono text-sm font-medium">{r.polId ?? 'Pending'}</span> },
        { key: 'ownTid', header: 'Own TID', render: (r) => <span className="font-mono text-sm">{r.ownTid ?? '—'}</span> },
        {
            key: 'ownerWallet', header: 'Holder',
            render: (r) => <span className="font-mono text-xs">{r.ownerWallet.substring(0, 8)}…{r.ownerWallet.slice(-4)}</span>,
        },
        { key: 'coverage', header: 'Coverage', render: (r) => <span className="font-medium">₹{Number(r.coverage).toLocaleString('en-IN')}</span> },
        { key: 'claimCount', header: 'Claims Filed', render: (r) => <Badge variant="outline" className={r.claimCount > 0 ? 'bg-orange-500/10 text-orange-600' : ''}>{r.claimCount}</Badge> },
        { key: 'status', header: 'Status', render: (r) => <Badge variant="outline" className={STATUS_COLORS[r.status]}>{r.status}</Badge> },
        {
            key: 'expiryDate', header: 'Expires',
            render: (r) => {
                const d = new Date(r.expiryDate);
                const daysLeft = Math.ceil((d.getTime() - Date.now()) / 86400000);
                return <span className={`text-sm ${daysLeft < 30 ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>{d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ({daysLeft}d)</span>;
            },
        },
        {
            key: 'actions', header: '', className: 'w-12',
            render: (r) => r.status === 'ACTIVE' && r.polId ? (
                <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-8 w-8 p-0" />}><MoreHorizontal className="h-4 w-4" /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => claimMutation.mutate(String(r.polId))}><AlertTriangle className="mr-2 h-4 w-4" /> File Claim</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => expireMutation.mutate(String(r.polId))} className="text-destructive"><Clock className="mr-2 h-4 w-4" /> Mark Expired</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null,
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FileSearch className="h-6 w-6 text-primary" /> Claims & Expiry</h1>
                <p className="text-muted-foreground">File claims against active policies or mark expired policies.</p>
            </div>
            <Card>
                <CardHeader className="pb-3">
                    <p className="text-sm text-muted-foreground">Showing only <strong>ACTIVE</strong> policies eligible for claims or expiry.</p>
                </CardHeader>
                <CardContent>
                    <DataTable columns={columns} data={data?.policies ?? []} isLoading={isLoading} total={data?.total ?? 0} page={page} limit={10} onPageChange={setPage} emptyMessage="No active policies found." />
                </CardContent>
            </Card>
        </div>
    );
}
