'use client';

import { useState } from 'react';
import { useInsurancePolicies, useIssuePolicy } from '@/hooks/use-insurance';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Plus } from 'lucide-react';
import type { InsurancePolicyRecord, InsuranceStatus } from '@/types/b2b';

const STATUS_COLORS: Record<InsuranceStatus, string> = {
    ACTIVE: 'bg-green-500/10 text-green-600 border-green-500/30',
    EXPIRED: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
    CANCELLED: 'bg-red-500/10 text-red-600 border-red-500/30',
};

export default function InsurancePoliciesPage() {
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [isOpen, setIsOpen] = useState(false);
    const [form, setForm] = useState({ ownTid: '', coverage: '', premium: '', expiryDays: '365' });

    const params = { page, limit: 10, status: statusFilter !== 'ALL' ? (statusFilter as InsuranceStatus) : undefined };
    const { data, isLoading } = useInsurancePolicies(params);
    const issueMutation = useIssuePolicy();

    const handleIssue = () => {
        const expiryDate = Math.floor(Date.now() / 1000) + (parseInt(form.expiryDays) * 86400);
        issueMutation.mutate(
            { ownTid: form.ownTid, coverage: form.coverage, premium: form.premium, expiryDate },
            { onSuccess: () => { setIsOpen(false); setForm({ ownTid: '', coverage: '', premium: '', expiryDays: '365' }); } }
        );
    };

    const columns: Column<InsurancePolicyRecord>[] = [
        { key: 'polId', header: 'Policy #', render: (r) => <span className="font-mono text-sm font-medium">{r.polId ?? 'Pending'}</span> },
        { key: 'ownTid', header: 'Own TID', render: (r) => <span className="font-mono text-sm">{r.ownTid ?? '—'}</span> },
        {
            key: 'ownerWallet', header: 'Policy Holder',
            render: (r) => <span className="font-mono text-xs">{r.ownerWallet.substring(0, 8)}…{r.ownerWallet.slice(-4)}</span>,
        },
        { key: 'coverage', header: 'Coverage', render: (r) => <span className="font-medium">₹{Number(r.coverage).toLocaleString('en-IN')}</span> },
        { key: 'premium', header: 'Premium', render: (r) => <span>₹{Number(r.premium).toLocaleString('en-IN')}</span> },
        { key: 'claimCount', header: 'Claims', render: (r) => <span className="text-sm">{r.claimCount}</span> },
        { key: 'status', header: 'Status', render: (r) => <Badge variant="outline" className={STATUS_COLORS[r.status]}>{r.status}</Badge> },
        { key: 'expiryDate', header: 'Expiry', render: (r) => {
            const d = new Date(r.expiryDate);
            const expired = d < new Date();
            return <span className={`text-sm ${expired ? 'text-red-500' : 'text-muted-foreground'}`}>{d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>;
        }},
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FileText className="h-6 w-6 text-primary" /> Insurance Policies</h1>
                    <p className="text-muted-foreground">Issue new policies and view all policies issued by your entity.</p>
                </div>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger render={<Button />}><Plus className="mr-2 h-4 w-4" /> Issue Policy</DialogTrigger>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Issue Insurance Policy</DialogTitle>
                            <DialogDescription>Issue a new insurance policy NFT for a registered vehicle.</DialogDescription>
                        </DialogHeader>
                        <div className="grid sm:grid-cols-2 gap-4 py-4">
                            <div className="space-y-2 col-span-2">
                                <Label>Ownership Token ID <span className="text-destructive">*</span></Label>
                                <Input placeholder="e.g. 1" value={form.ownTid} onChange={(e) => setForm(p => ({ ...p, ownTid: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Coverage (Wei) <span className="text-destructive">*</span></Label>
                                <Input type="number" placeholder="e.g. 100000" value={form.coverage} onChange={(e) => setForm(p => ({ ...p, coverage: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Premium (Wei) <span className="text-destructive">*</span></Label>
                                <Input type="number" placeholder="e.g. 5000" value={form.premium} onChange={(e) => setForm(p => ({ ...p, premium: e.target.value }))} />
                            </div>
                            <div className="space-y-2 col-span-2">
                                <Label>Policy Duration (Days)</Label>
                                <Input type="number" min="1" max="3650" placeholder="365" value={form.expiryDays} onChange={(e) => setForm(p => ({ ...p, expiryDays: e.target.value }))} />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                            <Button onClick={handleIssue} disabled={issueMutation.isPending || !form.ownTid || !form.coverage || !form.premium}>
                                {issueMutation.isPending ? 'Issuing…' : 'Issue Policy'}
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
                            <SelectItem value="ACTIVE">Active</SelectItem>
                            <SelectItem value="EXPIRED">Expired</SelectItem>
                            <SelectItem value="CANCELLED">Cancelled</SelectItem>
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent>
                    <DataTable columns={columns} data={data?.policies ?? []} isLoading={isLoading} total={data?.total ?? 0} page={page} limit={10} onPageChange={setPage} emptyMessage="No policies found." />
                </CardContent>
            </Card>
        </div>
    );
}
