'use client';

import { useState } from 'react';
import { useRtoTransfers, useApproveTransfer } from '@/hooks/use-rto';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeftRight, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import type { RtoTransfer, TransferStatus } from '@/types/b2b';

const STATUS_COLORS: Record<TransferStatus, string> = {
    PENDING: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
    BUYER_ACCEPTED: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    RTO_APPROVED: 'bg-green-500/10 text-green-600 border-green-500/30',
    CANCELLED: 'bg-red-500/10 text-red-600 border-red-500/30',
};

const STATUS_LABELS: Record<TransferStatus, string> = {
    PENDING: 'Pending Buyer',
    BUYER_ACCEPTED: 'Awaiting RTO',
    RTO_APPROVED: 'Completed',
    CANCELLED: 'Cancelled',
};

export default function RtoTransfersPage() {
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [confirmDialog, setConfirmDialog] = useState<RtoTransfer | null>(null);

    const params = { page, limit: 10, status: statusFilter !== 'ALL' ? (statusFilter as TransferStatus) : undefined };
    const { data, isLoading } = useRtoTransfers(params);
    const approveMutation = useApproveTransfer();

    const handleApprove = (transfer: RtoTransfer) => {
        if (!transfer.ownTid) return;
        approveMutation.mutate(String(transfer.ownTid), {
            onSuccess: () => setConfirmDialog(null),
        });
    };

    const columns: Column<RtoTransfer>[] = [
        {
            key: 'ownTid', header: 'Own TID',
            render: (r) => <span className="font-mono text-sm font-medium">{r.ownTid ?? '—'}</span>,
        },
        {
            key: 'transfer', header: 'Transfer',
            render: (r) => (
                <div className="flex items-center gap-2 text-xs font-mono">
                    <span title={r.sellerWallet}>{r.sellerWallet.substring(0, 6)}…{r.sellerWallet.slice(-4)}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span title={r.buyerWallet}>{r.buyerWallet.substring(0, 6)}…{r.buyerWallet.slice(-4)}</span>
                </div>
            ),
        },
        {
            key: 'approvals', header: 'Approvals',
            render: (r) => (
                <div className="flex gap-1.5">
                    <Badge variant="outline" className={`text-[10px] ${r.sellerOK ? 'bg-green-500/10 text-green-600 border-green-500/30' : 'bg-muted text-muted-foreground'}`}>Seller</Badge>
                    <Badge variant="outline" className={`text-[10px] ${r.buyerOK ? 'bg-green-500/10 text-green-600 border-green-500/30' : 'bg-muted text-muted-foreground'}`}>Buyer</Badge>
                    <Badge variant="outline" className={`text-[10px] ${r.rtoOK ? 'bg-green-500/10 text-green-600 border-green-500/30' : 'bg-muted text-muted-foreground'}`}>RTO</Badge>
                </div>
            ),
        },
        {
            key: 'status', header: 'Status',
            render: (r) => <Badge variant="outline" className={STATUS_COLORS[r.status]}>{STATUS_LABELS[r.status]}</Badge>,
        },
        {
            key: 'reqDate', header: 'Requested',
            render: (r) => <span className="text-sm text-muted-foreground">{new Date(r.reqDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>,
        },
        {
            key: 'actions', header: '', className: 'w-24',
            render: (r) => r.status === 'BUYER_ACCEPTED' ? (
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
                    <ArrowLeftRight className="h-6 w-6 text-primary" /> Transfer Approvals
                </h1>
                <p className="text-muted-foreground">Review and approve vehicle ownership transfers. Only transfers accepted by the buyer are ready for RTO approval.</p>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v || 'ALL'); setPage(1); }}>
                            <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All Statuses</SelectItem>
                                <SelectItem value="PENDING">Pending Buyer</SelectItem>
                                <SelectItem value="BUYER_ACCEPTED">Awaiting RTO</SelectItem>
                                <SelectItem value="RTO_APPROVED">Completed</SelectItem>
                                <SelectItem value="CANCELLED">Cancelled</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <DataTable
                        columns={columns}
                        data={data?.transfers ?? []}
                        isLoading={isLoading}
                        total={data?.total ?? 0}
                        page={page}
                        limit={10}
                        onPageChange={setPage}
                        emptyMessage="No transfer requests found."
                    />
                </CardContent>
            </Card>

            {/* Confirmation Dialog */}
            <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-yellow-500" /> Confirm Transfer Approval
                        </DialogTitle>
                        <DialogDescription>
                            This will approve the ownership transfer on the blockchain. The Ownership Token will be transferred to the buyer.
                        </DialogDescription>
                    </DialogHeader>
                    {confirmDialog && (
                        <div className="space-y-3 py-4 text-sm">
                            <div className="flex justify-between"><span className="text-muted-foreground">Ownership TID:</span><span className="font-mono font-medium">{confirmDialog.ownTid}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Seller:</span><span className="font-mono text-xs">{confirmDialog.sellerWallet}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Buyer:</span><span className="font-mono text-xs">{confirmDialog.buyerWallet}</span></div>
                            <div className="flex gap-1.5 justify-end pt-2">
                                <Badge variant="outline" className={confirmDialog.sellerOK ? 'bg-green-500/10 text-green-600' : ''}>Seller ✓</Badge>
                                <Badge variant="outline" className={confirmDialog.buyerOK ? 'bg-green-500/10 text-green-600' : ''}>Buyer ✓</Badge>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
                        <Button
                            onClick={() => confirmDialog && handleApprove(confirmDialog)}
                            disabled={approveMutation.isPending}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            {approveMutation.isPending ? 'Submitting…' : 'Approve Transfer'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
