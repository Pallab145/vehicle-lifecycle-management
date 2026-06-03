'use client';

import { useState } from 'react';
import { useCitizenChallans, useInitiatePayment } from '@/hooks/use-payment';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CreditCard, Banknote, Loader2 } from 'lucide-react';
import type { CitizenChallanForPayment, ChallanStatus } from '@/types/b2b';

const STATUS_COLORS: Record<ChallanStatus, string> = {
    PENDING: 'bg-yellow-500/10 text-yellow-600',
    PAID: 'bg-green-500/10 text-green-600',
    CANCELLED: 'bg-gray-500/10 text-gray-600',
};

export default function CitizenChallansPage() {
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const params = { page, limit: 10, status: statusFilter !== 'ALL' ? (statusFilter as ChallanStatus) : undefined };
    const { data, isLoading } = useCitizenChallans(params);
    const payMutation = useInitiatePayment();
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedChallanId, setSelectedChallanId] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'CARD' | 'NET_BANKING' | 'WALLET'>('UPI');

    const handlePay = () => {
        payMutation.mutate({ challanId: selectedChallanId, paymentMethod }, {
            onSuccess: () => {
                setIsPaymentModalOpen(false);
            }
        });
    };

    const columns: Column<CitizenChallanForPayment>[] = [
        {
            key: 'vehicle',
            header: 'Vehicle',
            render: (r) => (
                <div>
                    <p className="font-medium">{r.ownership?.passport?.make} {r.ownership?.passport?.model}</p>
                    <p className="text-xs text-muted-foreground">{r.ownership?.passport?.registrationNumber ?? `OwnTid: ${r.ownership?.ownTid}`}</p>
                </div>
            ),
        },
        {
            key: 'policeEntity',
            header: 'Issued By',
            render: (r) => r.policeEntity?.name ?? '—',
        },
        {
            key: 'amount',
            header: 'Fine Amount',
            render: (r) => <span className="font-semibold text-destructive">₹{Number(r.amount).toLocaleString('en-IN')}</span>,
        },
        {
            key: 'status',
            header: 'Status',
            render: (r) => <Badge variant="outline" className={STATUS_COLORS[r.status]}>{r.status}</Badge>,
        },
        {
            key: 'issuedAt',
            header: 'Issued',
            render: (r) => new Date(r.issuedAt).toLocaleDateString('en-IN'),
        },
        {
            key: 'actions',
            header: '',
            className: 'w-32',
            render: (r) =>
                r.status === 'PENDING' ? (
                    <Button
                        size="sm"
                        onClick={() => {
                            setSelectedChallanId(r.id);
                            setIsPaymentModalOpen(true);
                        }}
                    >
                        <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                        Pay Now
                    </Button>
                ) : r.status === 'PAID' ? (
                    <Badge variant="outline" className="bg-green-500/10 text-green-600">
                        <Banknote className="mr-1 h-3 w-3" /> Paid
                    </Badge>
                ) : null,
        },
    ];

    const pendingCount = data?.challans?.filter(c => c.status === 'PENDING').length ?? 0;
    const totalPending = data?.challans?.filter(c => c.status === 'PENDING')
        .reduce((sum, c) => sum + Number(c.amount), 0) ?? 0;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">My Challans</h1>
                <p className="text-muted-foreground">View and pay your traffic challans across all vehicles.</p>
            </div>

            {pendingCount > 0 && (
                <Card className="border-destructive/50 bg-destructive/5">
                    <CardContent className="flex items-center justify-between py-4">
                        <div>
                            <p className="font-medium text-destructive">{pendingCount} Pending Challan{pendingCount > 1 ? 's' : ''}</p>
                            <p className="text-sm text-muted-foreground">Total outstanding: ₹{totalPending.toLocaleString('en-IN')}</p>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader className="pb-3">
                    <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as string); setPage(1); }}>
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
                    <DataTable columns={columns} data={data?.challans ?? []} isLoading={isLoading} total={data?.total ?? 0} page={page} limit={10} onPageChange={setPage} emptyMessage="No challans found. Your record is clean! 🎉" />
                </CardContent>
            </Card>

            <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Complete Payment</DialogTitle>
                        <DialogDescription>
                            Select your preferred payment method to clear this challan. (Mock Gateway)
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <Select 
                            value={paymentMethod} 
                            onValueChange={(val) => setPaymentMethod(val as 'UPI' | 'CARD' | 'NET_BANKING' | 'WALLET')}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select Payment Method" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="UPI">UPI</SelectItem>
                                <SelectItem value="CARD">Credit/Debit Card</SelectItem>
                                <SelectItem value="NET_BANKING">Net Banking</SelectItem>
                                <SelectItem value="WALLET">Wallet</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPaymentModalOpen(false)}>Cancel</Button>
                        <Button onClick={handlePay} disabled={payMutation.isPending}>
                            {payMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : 'Pay Securely'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
