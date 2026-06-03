'use client';

import { useState } from 'react';
import { useScrappedVehicles } from '@/hooks/use-scrap';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { History } from 'lucide-react';
import type { ScrapVehicleRecord } from '@/types/b2b';

export default function ScrapLogsPage() {
    const [page, setPage] = useState(1);
    const { data, isLoading } = useScrappedVehicles({ page, limit: 10 });

    const columns: Column<ScrapVehicleRecord>[] = [
        { key: 'dvpId', header: 'DVP ID', render: (r) => <span className="font-mono text-sm font-medium">{r.dvpId ?? '—'}</span> },
        { key: 'vinHash', header: 'VIN Hash', render: (r) => <span className="font-mono text-xs" title={r.vinHash}>{r.vinHash.substring(0, 12)}…</span> },
        { key: 'status', header: 'Status', render: (r) => <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">{r.status}</Badge> },
        {
            key: 'ownerWallet', header: 'Last Owner',
            render: (r) => r.ownership?.ownerWallet
                ? <span className="font-mono text-xs">{r.ownership.ownerWallet.substring(0, 8)}…{r.ownership.ownerWallet.slice(-4)}</span>
                : <span className="text-muted-foreground text-xs">—</span>,
        },
        { key: 'mfgDate', header: 'Manufactured', render: (r) => new Date(r.mfgDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
        { key: 'scrapDate', header: 'Scrapped', render: (r) => r.scrapDate ? new Date(r.scrapDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><History className="h-6 w-6 text-primary" /> Dismantling Logs</h1>
                <p className="text-muted-foreground">All vehicles scrapped by your center.</p>
            </div>
            <Card>
                <CardContent className="pt-6">
                    <DataTable columns={columns} data={data?.vehicles ?? []} isLoading={isLoading} total={data?.total ?? 0} page={page} limit={10} onPageChange={setPage} emptyMessage="No scrapped vehicles found." />
                </CardContent>
            </Card>
        </div>
    );
}
