'use client';

import { useState } from 'react';
import { usePucCertificates, useMarkPucExpired } from '@/hooks/use-puc';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, MoreHorizontal, Clock } from 'lucide-react';
import type { PucCertificateRecord, PucStatus } from '@/types/b2b';

const STATUS_COLORS: Record<PucStatus, string> = {
    VALID: 'bg-green-500/10 text-green-600 border-green-500/30',
    EXPIRED: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
    REVOKED: 'bg-red-500/10 text-red-600 border-red-500/30',
};

export default function PucLogsPage() {
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');

    const params = { page, limit: 10, status: statusFilter !== 'ALL' ? (statusFilter as PucStatus) : undefined };
    const { data, isLoading } = usePucCertificates(params);
    const expireMutation = useMarkPucExpired();

    const columns: Column<PucCertificateRecord>[] = [
        { key: 'certId', header: 'Cert #', render: (r) => <span className="font-mono text-sm font-medium">{r.certId ?? 'Pending'}</span> },
        { key: 'ownTid', header: 'Own TID', render: (r) => <span className="font-mono text-sm">{r.ownTid ?? '—'}</span> },
        {
            key: 'emissions', header: 'Emissions (CO/HC/Smoke)',
            render: (r) => <span className="font-mono text-xs">{r.co}/{r.hc}/{r.smoke}</span>,
        },
        {
            key: 'passed', header: 'Result',
            render: (r) => r.passed
                ? <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">Passed</Badge>
                : <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">Failed</Badge>,
        },
        { key: 'status', header: 'Status', render: (r) => <Badge variant="outline" className={STATUS_COLORS[r.status]}>{r.status}</Badge> },
        { key: 'issueDate', header: 'Issued', render: (r) => new Date(r.issueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
        {
            key: 'expiryDate', header: 'Expiry',
            render: (r) => {
                const d = new Date(r.expiryDate);
                const expired = d < new Date();
                return <span className={`text-sm ${expired ? 'text-red-500' : 'text-muted-foreground'}`}>{d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>;
            },
        },
        {
            key: 'actions', header: '', className: 'w-12',
            render: (r) => r.status === 'VALID' && r.certId ? (
                <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-8 w-8 p-0" />}><MoreHorizontal className="h-4 w-4" /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => expireMutation.mutate(String(r.certId))} className="text-destructive"><Clock className="mr-2 h-4 w-4" /> Mark Expired</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null,
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><History className="h-6 w-6 text-primary" /> Testing Logs</h1>
                <p className="text-muted-foreground">All PUC certificates issued by your center.</p>
            </div>
            <Card>
                <CardHeader className="pb-3">
                    <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v || 'ALL'); setPage(1); }}>
                        <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Statuses</SelectItem>
                            <SelectItem value="VALID">Valid</SelectItem>
                            <SelectItem value="EXPIRED">Expired</SelectItem>
                            <SelectItem value="REVOKED">Revoked</SelectItem>
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent>
                    <DataTable columns={columns} data={data?.certificates ?? []} isLoading={isLoading} total={data?.total ?? 0} page={page} limit={10} onPageChange={setPage} emptyMessage="No PUC certificates found." />
                </CardContent>
            </Card>
        </div>
    );
}
