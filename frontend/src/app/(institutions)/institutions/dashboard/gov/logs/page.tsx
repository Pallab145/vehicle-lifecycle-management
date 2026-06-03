'use client';

import { useState } from 'react';
import { useGlobalChallans, useAdminCancelChallan } from '@/hooks/use-payment';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { XCircle } from 'lucide-react';
import type { GlobalChallan, ChallanStatus } from '@/types/b2b';

const STATUS_COLORS: Record<ChallanStatus, string> = {
    PENDING: 'bg-yellow-500/10 text-yellow-600',
    PAID: 'bg-green-500/10 text-green-600',
    CANCELLED: 'bg-red-500/10 text-red-600',
};

export default function GovLogsPage() {
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');

    const params = {
        page,
        limit: 15,
        status: statusFilter !== 'ALL' ? (statusFilter as ChallanStatus) : undefined,
    };

    const { data, isLoading } = useGlobalChallans(params);
    const cancelMutation = useAdminCancelChallan();

    const columns: Column<GlobalChallan>[] = [
        {
            key: 'challanId',
            header: 'Challan #',
            render: (row) => <span className="font-mono text-sm">{row.challanId ?? '—'}</span>,
        },
        {
            key: 'amount',
            header: 'Amount',
            render: (row) => <span className="font-medium">₹{Number(row.amount).toLocaleString('en-IN')}</span>,
        },
        {
            key: 'status',
            header: 'Status',
            render: (row) => (
                <Badge variant="outline" className={STATUS_COLORS[row.status]}>{row.status}</Badge>
            ),
        },
        {
            key: 'policeEntity',
            header: 'Issued By',
            render: (row) => row.policeEntity?.name ?? row.policeEntityId.substring(0, 8),
        },
        {
            key: 'issuedAt',
            header: 'Issued',
            render: (row) => new Date(row.issuedAt).toLocaleDateString('en-IN'),
        },
        {
            key: 'actions',
            header: '',
            className: 'w-12',
            render: (row) =>
                row.status === 'PENDING' ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancelMutation.mutate(row.id)}
                        disabled={cancelMutation.isPending}
                    >
                        <XCircle className="h-4 w-4 text-destructive" />
                    </Button>
                ) : null,
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">System Logs — Global Challans</h1>
                <p className="text-muted-foreground">View and manage all traffic challans across the entire network.</p>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="All Statuses" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Statuses</SelectItem>
                            <SelectItem value="PENDING">Pending</SelectItem>
                            <SelectItem value="PAID">Paid</SelectItem>
                            <SelectItem value="CANCELLED">Cancelled</SelectItem>
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent>
                    <DataTable
                        columns={columns}
                        data={data?.challans ?? []}
                        isLoading={isLoading}
                        total={data?.total ?? 0}
                        page={page}
                        limit={15}
                        onPageChange={setPage}
                        emptyMessage="No challans found."
                    />
                </CardContent>
            </Card>
        </div>
    );
}
