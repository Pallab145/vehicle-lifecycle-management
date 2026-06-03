'use client';

import { useState } from 'react';
import { useRtoTradeCerts, useIssueTradeCert, useRevokeTradeCert } from '@/hooks/use-rto';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileCheck2, Plus, MoreHorizontal, XCircle } from 'lucide-react';
import type { RtoTradeCert } from '@/types/b2b';

export default function RtoTradeCertsPage() {
    const [page, setPage] = useState(1);
    const [activeFilter, setActiveFilter] = useState<string>('ALL');
    const [isOpen, setIsOpen] = useState(false);
    const [form, setForm] = useState({ dealerWallet: '', validDays: '365' });

    const params = { page, limit: 10, isActive: activeFilter !== 'ALL' ? activeFilter : undefined };
    const { data, isLoading } = useRtoTradeCerts(params);
    const issueMutation = useIssueTradeCert();
    const revokeMutation = useRevokeTradeCert();

    const handleIssue = () => {
        const validTill = Math.floor(Date.now() / 1000) + (parseInt(form.validDays) * 86400);
        issueMutation.mutate(
            { dealerWallet: form.dealerWallet, validTill },
            { onSuccess: () => { setIsOpen(false); setForm({ dealerWallet: '', validDays: '365' }); } }
        );
    };

    const columns: Column<RtoTradeCert>[] = [
        {
            key: 'dealerWallet', header: 'Dealer',
            render: (r) => (
                <div className="flex flex-col">
                    <span className="font-mono text-xs">{r.dealerWallet.substring(0, 10)}…{r.dealerWallet.slice(-6)}</span>
                    {r.dealerUser?.name && <span className="text-xs text-muted-foreground">{r.dealerUser.name}</span>}
                </div>
            ),
        },
        {
            key: 'isActive', header: 'Status',
            render: (r) => {
                const expired = new Date(r.validTill) < new Date();
                if (!r.isActive) return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">Revoked</Badge>;
                if (expired) return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">Expired</Badge>;
                return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">Active</Badge>;
            },
        },
        {
            key: 'issuedAt', header: 'Issued',
            render: (r) => <span className="text-sm">{new Date(r.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>,
        },
        {
            key: 'validTill', header: 'Valid Until',
            render: (r) => {
                const d = new Date(r.validTill);
                const expired = d < new Date();
                return <span className={`text-sm ${expired ? 'text-red-500' : 'text-muted-foreground'}`}>{d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>;
            },
        },
        {
            key: 'actions', header: '', className: 'w-12',
            render: (r) => r.isActive ? (
                <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-8 w-8 p-0" />}><MoreHorizontal className="h-4 w-4" /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => revokeMutation.mutate(r.dealerWallet)} className="text-destructive">
                            <XCircle className="mr-2 h-4 w-4" /> Revoke Certificate
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
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <FileCheck2 className="h-6 w-6 text-primary" /> Trade Certificates
                    </h1>
                    <p className="text-muted-foreground">Issue and manage dealer trade certificates. A valid certificate is required for dealers to sell vehicles.</p>
                </div>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger render={<Button />}><Plus className="mr-2 h-4 w-4" /> Issue Trade Cert</DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Issue Trade Certificate</DialogTitle>
                            <DialogDescription>Issue a new trade certificate to authorize a dealer to sell vehicles through your RTO.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Dealer Wallet Address</Label>
                                <Input placeholder="0x…" value={form.dealerWallet} onChange={(e) => setForm(p => ({ ...p, dealerWallet: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Validity Period (Days)</Label>
                                <Input type="number" min="1" max="3650" placeholder="365" value={form.validDays} onChange={(e) => setForm(p => ({ ...p, validDays: e.target.value }))} />
                                <p className="text-xs text-muted-foreground">Certificate will be valid for {form.validDays} days from today.</p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                            <Button onClick={handleIssue} disabled={issueMutation.isPending || !form.dealerWallet}>
                                {issueMutation.isPending ? 'Issuing…' : 'Issue Certificate'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <Select value={activeFilter} onValueChange={(v) => { setActiveFilter(v || 'ALL'); setPage(1); }}>
                        <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Certificates" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Certificates</SelectItem>
                            <SelectItem value="true">Active Only</SelectItem>
                            <SelectItem value="false">Revoked Only</SelectItem>
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent>
                    <DataTable
                        columns={columns}
                        data={data?.tradeCerts ?? []}
                        isLoading={isLoading}
                        total={data?.total ?? 0}
                        page={page}
                        limit={10}
                        onPageChange={setPage}
                        emptyMessage="No trade certificates found."
                    />
                </CardContent>
            </Card>
        </div>
    );
}
