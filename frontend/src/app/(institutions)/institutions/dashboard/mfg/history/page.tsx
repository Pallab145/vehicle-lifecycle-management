'use client';

import { useState } from 'react';
import { useMfgVehicles, useAssignToDealer } from '@/hooks/use-mfg';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, Truck } from 'lucide-react';
import type { MfgVehicle, VehicleStatus } from '@/types/b2b';

const STATUS_COLORS: Record<VehicleStatus, string> = {
    NOT_REG: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
    ACTIVE: 'bg-green-500/10 text-green-600 border-green-500/30',
    SCRAPPED: 'bg-red-500/10 text-red-600 border-red-500/30',
};

export default function MfgHistoryPage() {
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [isAssignOpen, setIsAssignOpen] = useState(false);
    const [selectedTokenId, setSelectedTokenId] = useState('');
    const [dealerWallet, setDealerWallet] = useState('');

    const params = { page, limit: 10, status: statusFilter !== 'ALL' ? (statusFilter as VehicleStatus) : undefined };
    const { data, isLoading } = useMfgVehicles(params);
    const assignMutation = useAssignToDealer();

    const handleAssign = () => {
        assignMutation.mutate(
            { tokenId: selectedTokenId, payload: { dealerWallet } },
            { onSuccess: () => { setIsAssignOpen(false); setDealerWallet(''); } }
        );
    };

    const columns: Column<MfgVehicle>[] = [
        { key: 'dvpId', header: 'DVP ID', render: (r) => <span className="font-mono text-sm font-medium">{r.dvpId ?? 'Pending'}</span> },
        { key: 'vinHash', header: 'VIN Hash', render: (r) => <span className="font-mono text-xs" title={r.vinHash}>{r.vinHash.substring(0, 10)}…</span> },
        { key: 'status', header: 'Status', render: (r) => <Badge variant="outline" className={STATUS_COLORS[r.status]}>{r.status}</Badge> },
        {
            key: 'dealerWallet', header: 'Dealer',
            render: (r) => r.dealerWallet
                ? <span className="font-mono text-xs">{r.dealerWallet.substring(0, 6)}…{r.dealerWallet.slice(-4)}</span>
                : <span className="text-muted-foreground text-xs">Unassigned</span>,
        },
        { key: 'mfgDate', header: 'Mfg Date', render: (r) => new Date(r.mfgDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
        {
            key: 'actions', header: '', className: 'w-12',
            render: (r) => r.status === 'NOT_REG' && !r.dealerWallet && r.dvpId ? (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setSelectedTokenId(String(r.dvpId)); setIsAssignOpen(true); }}
                    title="Assign to Dealer"
                >
                    <Truck className="h-4 w-4" />
                </Button>
            ) : null,
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><History className="h-6 w-6 text-primary" /> Production History</h1>
                <p className="text-muted-foreground">All vehicles manufactured by your entity. Assign unregistered vehicles to dealers.</p>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-3 mb-4">
                        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v || 'ALL'); setPage(1); }}>
                            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All Statuses</SelectItem>
                                <SelectItem value="NOT_REG">Not Registered</SelectItem>
                                <SelectItem value="ACTIVE">Active</SelectItem>
                                <SelectItem value="SCRAPPED">Scrapped</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <DataTable columns={columns} data={data?.vehicles ?? []} isLoading={isLoading} total={data?.total ?? 0} page={page} limit={10} onPageChange={setPage} emptyMessage="No vehicles manufactured yet." />
                </CardContent>
            </Card>

            {/* Assign to Dealer Dialog */}
            <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Assign to Dealer</DialogTitle>
                        <DialogDescription>Assign DVP #{selectedTokenId} to a dealer&apos;s wallet address for first sale.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-4">
                        <Label>Dealer Wallet Address</Label>
                        <Input placeholder="0x…" value={dealerWallet} onChange={(e) => setDealerWallet(e.target.value)} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAssignOpen(false)}>Cancel</Button>
                        <Button onClick={handleAssign} disabled={assignMutation.isPending || !dealerWallet}>{assignMutation.isPending ? 'Assigning…' : 'Assign'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
