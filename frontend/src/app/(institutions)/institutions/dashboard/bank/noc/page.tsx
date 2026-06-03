'use client';

import { useState } from 'react';
import { useBankLoans, useIssueNoc, useRefinanceLoan } from '@/hooks/use-bank';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Shield, MoreHorizontal, CheckCircle2, RefreshCcw } from 'lucide-react';
import type { BankLoanRecord, LoanStatus } from '@/types/b2b';

const STATUS_COLORS: Record<LoanStatus, string> = {
    PENDING: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    ACTIVE: 'bg-green-500/10 text-green-600 border-green-500/30',
    CLEARED: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
    DEFAULTED: 'bg-red-500/10 text-red-600 border-red-500/30',
};

export default function BankNocPage() {
    const [page, setPage] = useState(1);
    const [refiDialog, setRefiDialog] = useState<BankLoanRecord | null>(null);
    const [refiForm, setRefiForm] = useState({ newAmount: '', newTenure: '12' });

    // Only show ACTIVE and CLEARED loans (relevant for NOC and refinance)
    const { data, isLoading } = useBankLoans({ page, limit: 10 });
    const nocMutation = useIssueNoc();
    const refiMutation = useRefinanceLoan();

    const handleRefinance = () => {
        if (!refiDialog?.loanId) return;
        refiMutation.mutate(
            { loanId: String(refiDialog.loanId), payload: { newAmount: refiForm.newAmount, newTenure: parseInt(refiForm.newTenure) } },
            { onSuccess: () => { setRefiDialog(null); setRefiForm({ newAmount: '', newTenure: '12' }); } }
        );
    };

    const columns: Column<BankLoanRecord>[] = [
        { key: 'loanId', header: 'Loan #', render: (r) => <span className="font-mono text-sm font-medium">{r.loanId ?? 'Pending'}</span> },
        {
            key: 'borrowerWallet', header: 'Borrower',
            render: (r) => <span className="font-mono text-xs">{r.borrowerWallet.substring(0, 8)}…{r.borrowerWallet.slice(-4)}</span>,
        },
        { key: 'amount', header: 'Amount', render: (r) => <span className="font-medium">₹{Number(r.amount).toLocaleString('en-IN')}</span> },
        { key: 'status', header: 'Status', render: (r) => <Badge variant="outline" className={STATUS_COLORS[r.status]}>{r.status}</Badge> },
        {
            key: 'nocIssued', header: 'NOC Status',
            render: (r) => {
                if (r.nocIssued) return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">✓ Issued</Badge>;
                if (r.status === 'CLEARED') return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">Awaiting NOC</Badge>;
                return <span className="text-muted-foreground text-xs">N/A</span>;
            },
        },
        {
            key: 'nocDate', header: 'NOC Date',
            render: (r) => r.nocDate ? new Date(r.nocDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : <span className="text-muted-foreground text-xs">—</span>,
        },
        {
            key: 'actions', header: '', className: 'w-12',
            render: (r) => (r.status === 'CLEARED' && !r.nocIssued && r.loanId) || (r.status === 'ACTIVE' && r.loanId) ? (
                <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-8 w-8 p-0" />}><MoreHorizontal className="h-4 w-4" /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {r.status === 'CLEARED' && !r.nocIssued && (
                            <DropdownMenuItem onClick={() => nocMutation.mutate(String(r.loanId))}>
                                <CheckCircle2 className="mr-2 h-4 w-4" /> Issue NOC
                            </DropdownMenuItem>
                        )}
                        {r.status === 'ACTIVE' && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => { setRefiDialog(r); setRefiForm({ newAmount: '', newTenure: '12' }); }}>
                                    <RefreshCcw className="mr-2 h-4 w-4" /> Refinance
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null,
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Shield className="h-6 w-6 text-primary" /> NOC & Settlement</h1>
                <p className="text-muted-foreground">Issue No Objection Certificates for cleared loans and process refinancing.</p>
            </div>
            <Card>
                <CardHeader className="pb-3">
                    <p className="text-sm text-muted-foreground">Showing all loans. Use actions to issue NOC for cleared loans or refinance active ones.</p>
                </CardHeader>
                <CardContent>
                    <DataTable columns={columns} data={data?.loans ?? []} isLoading={isLoading} total={data?.total ?? 0} page={page} limit={10} onPageChange={setPage} emptyMessage="No loans found." />
                </CardContent>
            </Card>

            {/* Refinance Dialog */}
            <Dialog open={!!refiDialog} onOpenChange={() => setRefiDialog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Refinance Loan #{refiDialog?.loanId}</DialogTitle>
                        <DialogDescription>Create a new loan with updated terms. The existing loan will be closed.</DialogDescription>
                    </DialogHeader>
                    <div className="grid sm:grid-cols-2 gap-4 py-4">
                        <div className="space-y-2">
                            <Label>New Amount (Wei) <span className="text-destructive">*</span></Label>
                            <Input type="number" placeholder="e.g. 300000" value={refiForm.newAmount} onChange={(e) => setRefiForm(p => ({ ...p, newAmount: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>New Tenure (months) <span className="text-destructive">*</span></Label>
                            <Input type="number" min="1" max="360" placeholder="12" value={refiForm.newTenure} onChange={(e) => setRefiForm(p => ({ ...p, newTenure: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRefiDialog(null)}>Cancel</Button>
                        <Button onClick={handleRefinance} disabled={refiMutation.isPending || !refiForm.newAmount}>
                            {refiMutation.isPending ? 'Processing…' : 'Refinance Loan'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
