'use client';

import { useState } from 'react';
import { useRtoRegistrations, useRegisterVehicle } from '@/hooks/use-rto';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileSignature, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { RtoRegistration, RegistrationStatus } from '@/types/b2b';

const STATUS_COLORS: Record<RegistrationStatus, string> = {
    PENDING: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
    APPROVED: 'bg-green-500/10 text-green-600 border-green-500/30',
    REJECTED: 'bg-red-500/10 text-red-600 border-red-500/30',
};

export default function RtoRegistrationsPage() {
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [confirmDialog, setConfirmDialog] = useState<RtoRegistration | null>(null);

    const params = { page, limit: 10, status: statusFilter !== 'ALL' ? (statusFilter as RegistrationStatus) : undefined };
    const { data, isLoading } = useRtoRegistrations(params);
    const registerMutation = useRegisterVehicle();

    const handleApprove = (reg: RtoRegistration) => {
        registerMutation.mutate(
            { dvpId: reg.dvpId, buyerWallet: reg.buyerWallet, dealerWallet: reg.dealerWallet },
            { onSuccess: () => setConfirmDialog(null) }
        );
    };

    const columns: Column<RtoRegistration>[] = [
        {
            key: 'dvpId', header: 'DVP ID',
            render: (r) => <span className="font-mono text-sm font-medium">{r.dvpId}</span>,
        },
        {
            key: 'buyerWallet', header: 'Buyer',
            render: (r) => (
                <div className="flex flex-col">
                    <span className="font-mono text-xs">{r.buyerWallet.substring(0, 8)}…{r.buyerWallet.slice(-6)}</span>
                    {r.buyerUser?.name && <span className="text-xs text-muted-foreground">{r.buyerUser.name}</span>}
                </div>
            ),
        },
        {
            key: 'dealerWallet', header: 'Dealer',
            render: (r) => (
                <div className="flex flex-col">
                    <span className="font-mono text-xs">{r.dealerWallet.substring(0, 8)}…{r.dealerWallet.slice(-6)}</span>
                    {r.dealerUser?.name && <span className="text-xs text-muted-foreground">{r.dealerUser.name}</span>}
                </div>
            ),
        },
        {
            key: 'status', header: 'Status',
            render: (r) => <Badge variant="outline" className={STATUS_COLORS[r.status]}>{r.status}</Badge>,
        },
        {
            key: 'createdAt', header: 'Requested',
            render: (r) => <span className="text-sm text-muted-foreground">{new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>,
        },
        {
            key: 'actions', header: '', className: 'w-24',
            render: (r) => r.status === 'PENDING' ? (
                <Button
                    size="sm"
                    variant="outline"
                    className="text-green-600 border-green-500/30 hover:bg-green-500/10"
                    onClick={() => setConfirmDialog(r)}
                >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approve
                </Button>
            ) : null,
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <FileSignature className="h-6 w-6 text-primary" /> Vehicle Registrations
                </h1>
                <p className="text-muted-foreground">Review and approve dealer sale requests. Approving will register the vehicle on the blockchain.</p>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v || 'ALL'); setPage(1); }}>
                            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All Statuses</SelectItem>
                                <SelectItem value="PENDING">Pending</SelectItem>
                                <SelectItem value="APPROVED">Approved</SelectItem>
                                <SelectItem value="REJECTED">Rejected</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <DataTable
                        columns={columns}
                        data={data?.registrations ?? []}
                        isLoading={isLoading}
                        total={data?.total ?? 0}
                        page={page}
                        limit={10}
                        onPageChange={setPage}
                        emptyMessage="No registration requests found."
                    />
                </CardContent>
            </Card>

            {/* Confirmation Dialog */}
            <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-yellow-500" /> Confirm Vehicle Registration
                        </DialogTitle>
                        <DialogDescription>
                            This will register the vehicle on the blockchain and mint an Ownership Token. This action is irreversible.
                        </DialogDescription>
                    </DialogHeader>
                    {confirmDialog && (
                        <div className="space-y-3 py-4 text-sm">
                            <div className="flex justify-between"><span className="text-muted-foreground">DVP Token ID:</span><span className="font-mono font-medium">{confirmDialog.dvpId}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Buyer Wallet:</span><span className="font-mono text-xs">{confirmDialog.buyerWallet}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Dealer Wallet:</span><span className="font-mono text-xs">{confirmDialog.dealerWallet}</span></div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
                        <Button
                            onClick={() => confirmDialog && handleApprove(confirmDialog)}
                            disabled={registerMutation.isPending}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            {registerMutation.isPending ? 'Submitting to Blockchain…' : 'Approve & Register'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
