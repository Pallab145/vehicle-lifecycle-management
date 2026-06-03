'use client';

import { useState } from 'react';
import { useBankLoans, useRegisterLoan, useCancelPendingLoan } from '@/hooks/use-bank';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Plus, MoreHorizontal, XCircle } from 'lucide-react';
import type { BankLoanRecord, LoanStatus } from '@/types/b2b';

const STATUS_COLORS: Record<LoanStatus, string> = {
    PENDING: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    ACTIVE: 'bg-green-500/10 text-green-600 border-green-500/30',
    CLEARED: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
    DEFAULTED: 'bg-red-500/10 text-red-600 border-red-500/30',
};

export default function BankLoansPage() {
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [isOpen, setIsOpen] = useState(false);
    const [form, setForm] = useState({ dvpId: '', borrowerWallet: '', amount: '', tenure: '12' });

    const params = { page, limit: 10, status: statusFilter !== 'ALL' ? (statusFilter as LoanStatus) : undefined };
    const { data, isLoading } = useBankLoans(params);
    const registerMutation = useRegisterLoan();
    const cancelMutation = useCancelPendingLoan();

    const handleRegister = () => {
        registerMutation.mutate(
            { dvpId: form.dvpId, borrowerWallet: form.borrowerWallet, amount: form.amount, tenure: parseInt(form.tenure) },
            { onSuccess: () => { setIsOpen(false); setForm({ dvpId: '', borrowerWallet: '', amount: '', tenure: '12' }); } }
        );
    };

    const columns: Column<BankLoanRecord>[] = [
        { key: 'loanId', header: 'Loan #', render: (r) => <span className="font-mono text-sm font-medium">{r.loanId ?? 'Pending'}</span> },
        {
            key: 'borrowerWallet', header: 'Borrower',
            render: (r) => (
                <div className="flex flex-col">
                    <span className="font-mono text-xs">{r.borrowerWallet.substring(0, 8)}…{r.borrowerWallet.slice(-4)}</span>
                    {r.loanBorrower?.name && <span className="text-xs text-muted-foreground">{r.loanBorrower.name}</span>}
                </div>
            ),
        },
        { key: 'amount', header: 'Amount', render: (r) => <span className="font-medium">₹{Number(r.amount).toLocaleString('en-IN')}</span> },
        { key: 'tenure', header: 'Tenure', render: (r) => <span className="text-sm">{r.tenure} months</span> },
        { key: 'status', header: 'Status', render: (r) => <Badge variant="outline" className={STATUS_COLORS[r.status]}>{r.status}</Badge> },
        {
            key: 'nocIssued', header: 'NOC',
            render: (r) => r.nocIssued
                ? <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">Issued</Badge>
                : <span className="text-muted-foreground text-xs">—</span>,
        },
        { key: 'disbursedAt', header: 'Disbursed', render: (r) => new Date(r.disbursedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
        {
            key: 'actions', header: '', className: 'w-12',
            render: (r) => r.status === 'PENDING' ? (
                <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-8 w-8 p-0" />}><MoreHorizontal className="h-4 w-4" /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => cancelMutation.mutate(r.passportId)} className="text-destructive">
                            <XCircle className="mr-2 h-4 w-4" /> Cancel Pending
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FileText className="h-6 w-6 text-primary" /> Loan Management</h1>
                    <p className="text-muted-foreground">Register new vehicle loans and manage your portfolio.</p>
                </div>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger render={<Button />}><Plus className="mr-2 h-4 w-4" /> Register Loan</DialogTrigger>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Register Vehicle Loan</DialogTitle>
                            <DialogDescription>Register a new loan against a vehicle DVP on the blockchain.</DialogDescription>
                        </DialogHeader>
                        <div className="grid sm:grid-cols-2 gap-4 py-4">
                            <div className="space-y-2">
                                <Label>DVP Token ID <span className="text-destructive">*</span></Label>
                                <Input placeholder="e.g. 1" value={form.dvpId} onChange={(e) => setForm(p => ({ ...p, dvpId: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Tenure (months) <span className="text-destructive">*</span></Label>
                                <Input type="number" min="1" max="360" placeholder="12" value={form.tenure} onChange={(e) => setForm(p => ({ ...p, tenure: e.target.value }))} />
                            </div>
                            <div className="space-y-2 col-span-2">
                                <Label>Borrower Wallet <span className="text-destructive">*</span></Label>
                                <Input placeholder="0x…" value={form.borrowerWallet} onChange={(e) => setForm(p => ({ ...p, borrowerWallet: e.target.value }))} />
                            </div>
                            <div className="space-y-2 col-span-2">
                                <Label>Loan Amount (Wei) <span className="text-destructive">*</span></Label>
                                <Input type="number" placeholder="e.g. 500000" value={form.amount} onChange={(e) => setForm(p => ({ ...p, amount: e.target.value }))} />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                            <Button onClick={handleRegister} disabled={registerMutation.isPending || !form.dvpId || !form.borrowerWallet || !form.amount}>
                                {registerMutation.isPending ? 'Registering…' : 'Register Loan'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
            <Card>
                <CardHeader className="pb-3">
                    <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v || 'ALL'); setPage(1); }}>
                        <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Statuses</SelectItem>
                            <SelectItem value="PENDING">Pending</SelectItem>
                            <SelectItem value="ACTIVE">Active</SelectItem>
                            <SelectItem value="CLEARED">Cleared</SelectItem>
                            <SelectItem value="DEFAULTED">Defaulted</SelectItem>
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent>
                    <DataTable columns={columns} data={data?.loans ?? []} isLoading={isLoading} total={data?.total ?? 0} page={page} limit={10} onPageChange={setPage} emptyMessage="No loans found." />
                </CardContent>
            </Card>
        </div>
    );
}
