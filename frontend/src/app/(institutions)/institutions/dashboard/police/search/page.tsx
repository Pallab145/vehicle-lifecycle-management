'use client';

import { useState } from 'react';
import { usePoliceChallans, useCancelChallan, useMarkChallanPaid } from '@/hooks/use-police';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, MoreHorizontal, XCircle, CheckCircle2 } from 'lucide-react';
import type { PoliceChallan, ChallanStatus } from '@/types/b2b';

const STATUS_COLORS: Record<ChallanStatus, string> = {
    PENDING: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
    PAID: 'bg-green-500/10 text-green-600 border-green-500/30',
    CANCELLED: 'bg-red-500/10 text-red-600 border-red-500/30',
};

export default function PoliceSearchPage() {
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');

    const params = { page, limit: 10, status: statusFilter !== 'ALL' ? (statusFilter as ChallanStatus) : undefined };
    const { data, isLoading } = usePoliceChallans(params);
    const cancelMutation = useCancelChallan();
    const markPaidMutation = useMarkChallanPaid();

    const columns: Column<PoliceChallan>[] = [
        { key: 'challanId', header: 'Challan #', render: (r) => <span className="font-mono text-sm font-medium">{r.challanId ?? '—'}</span> },
        { key: 'ownTid', header: 'Own TID', render: (r) => <span className="font-mono text-sm">{r.ownTid ?? '—'}</span> },
        {
            key: 'ownerWallet', header: 'Vehicle Owner',
            render: (r) => r.ownership ? (
                <span className="font-mono text-xs">{r.ownership.ownerWallet.substring(0, 8)}…{r.ownership.ownerWallet.slice(-4)}</span>
            ) : <span className="text-muted-foreground">—</span>,
        },
        { key: 'amount', header: 'Amount', render: (r) => <span className="font-medium">₹{Number(r.amount).toLocaleString('en-IN')}</span> },
        { key: 'status', header: 'Status', render: (r) => <Badge variant="outline" className={STATUS_COLORS[r.status]}>{r.status}</Badge> },
        { key: 'issuedAt', header: 'Issued', render: (r) => new Date(r.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
        {
            key: 'paidAt', header: 'Resolved',
            render: (r) => {
                if (r.paidAt) return <span className="text-xs text-green-600">{new Date(r.paidAt).toLocaleDateString('en-IN')}</span>;
                if (r.cancelledAt) return <span className="text-xs text-red-500">{new Date(r.cancelledAt).toLocaleDateString('en-IN')}</span>;
                return <span className="text-muted-foreground text-xs">—</span>;
            },
        },
        {
            key: 'actions', header: '', className: 'w-12',
            render: (r) => r.status === 'PENDING' ? (
                <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-8 w-8 p-0" />}><MoreHorizontal className="h-4 w-4" /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => markPaidMutation.mutate(r.id)}><CheckCircle2 className="mr-2 h-4 w-4" /> Mark Paid</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => cancelMutation.mutate(r.id)} className="text-destructive"><XCircle className="mr-2 h-4 w-4" /> Cancel</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null,
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Search className="h-6 w-6 text-primary" /> Challan Records</h1>
                <p className="text-muted-foreground">Search and manage all issued challans. Mark as paid or cancel pending challans.</p>
            </div>
            <Card>
                <CardHeader className="pb-3">
                    <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v || 'ALL'); setPage(1); }}>
                        <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Statuses</SelectItem>
                            <SelectItem value="PENDING">Pending</SelectItem>
                            <SelectItem value="PAID">Paid</SelectItem>
                            <SelectItem value="CANCELLED">Cancelled</SelectItem>
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent>
                    <DataTable columns={columns} data={data?.challans ?? []} isLoading={isLoading} total={data?.total ?? 0} page={page} limit={10} onPageChange={setPage} emptyMessage="No challans found." />
                </CardContent>
            </Card>
        </div>
    );
}
