'use client';

import { useState } from 'react';
import { useSafeInfo, useProposals, useProposalDetail, useCancelProposal, useSignProposal, useExecuteProposal } from '@/hooks/use-admin';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Shield, Key, Users, Hash, FileSignature, Play, XCircle, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import type { SafeProposal, SafeProposalStatus } from '@/types/b2b';

const STATUS_COLORS: Record<SafeProposalStatus, string> = {
    PENDING: 'bg-yellow-500/10 text-yellow-600',
    THRESHOLD_MET: 'bg-blue-500/10 text-blue-600',
    EXECUTED: 'bg-green-500/10 text-green-600',
    EXECUTION_FAILED: 'bg-red-500/10 text-red-600',
    CANCELLED: 'bg-gray-500/10 text-gray-600',
};

export default function GovernanceAdminPage() {
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);

    const { data: safeData, isLoading: safeLoading } = useSafeInfo();
    const params = { page, limit: 10, status: statusFilter !== 'ALL' ? (statusFilter as SafeProposalStatus) : undefined };
    const { data: proposalData, isLoading: proposalLoading } = useProposals(params);
    const { data: detailData } = useProposalDetail(selectedProposalId ?? '');

    const cancelMutation = useCancelProposal();
    const signMutation = useSignProposal();
    const executeMutation = useExecuteProposal();

    const safeInfo = safeData?.safeInfo;
    const proposals = proposalData?.proposals ?? [];
    const detail = detailData?.proposal;

    const columns: Column<SafeProposal>[] = [
        {
            key: 'actionType',
            header: 'Action',
            render: (r) => (
                <div>
                    <p className="font-medium text-sm">{r.actionType.replace(/_/g, ' ')}</p>
                    {r.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{r.description}</p>}
                </div>
            ),
        },
        {
            key: 'signatures',
            header: 'Signatures',
            render: (r) => (
                <span className="font-mono text-sm">
                    {r._count?.signatures ?? 0} / {safeInfo?.threshold ?? '?'}
                </span>
            ),
        },
        {
            key: 'status',
            header: 'Status',
            render: (r) => <Badge variant="outline" className={STATUS_COLORS[r.status]}>{r.status.replace('_', ' ')}</Badge>,
        },
        {
            key: 'createdAt',
            header: 'Created',
            render: (r) => new Date(r.createdAt).toLocaleDateString('en-IN'),
        },
        {
            key: 'actions',
            header: '',
            className: 'w-20',
            render: (r) => (
                <Button variant="outline" size="sm" onClick={() => setSelectedProposalId(r.id)}>
                    View
                </Button>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <Shield className="h-6 w-6 text-primary" /> Governance — Gnosis Safe
                </h1>
                <p className="text-muted-foreground">Multi-signature administration for entity registration and system operations.</p>
            </div>

            {/* Safe Info Cards */}
            {safeInfo && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Safe Address</CardTitle></CardHeader>
                        <CardContent><p className="font-mono text-xs break-all">{safeInfo.address}</p></CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Threshold</CardTitle></CardHeader>
                        <CardContent><p className="text-2xl font-bold">{safeInfo.threshold} / {safeInfo.owners.length}</p></CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Owners</CardTitle></CardHeader>
                        <CardContent><p className="text-2xl font-bold">{safeInfo.owners.length}</p></CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Nonce</CardTitle></CardHeader>
                        <CardContent><p className="text-2xl font-bold font-mono">{safeInfo.nonce}</p></CardContent>
                    </Card>
                </div>
            )}

            {/* Owners List */}
            {safeInfo && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2"><Key className="h-4 w-4" /> Safe Owners</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {safeInfo.owners.map((addr, i) => (
                                <div key={addr} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/50">
                                    <Badge variant="outline" className="shrink-0">#{i + 1}</Badge>
                                    <span className="font-mono text-sm break-all">{addr}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <Separator />

            {/* Proposals Table */}
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <CardTitle className="text-lg">Proposals</CardTitle>
                        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                            <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All Statuses</SelectItem>
                                <SelectItem value="PENDING">Pending</SelectItem>
                                <SelectItem value="THRESHOLD_MET">Threshold Met</SelectItem>
                                <SelectItem value="EXECUTED">Executed</SelectItem>
                                <SelectItem value="EXECUTION_FAILED">Failed</SelectItem>
                                <SelectItem value="CANCELLED">Cancelled</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <DataTable
                        columns={columns}
                        data={proposals}
                        isLoading={proposalLoading}
                        total={proposalData?.pagination?.total ?? 0}
                        page={page}
                        limit={10}
                        onPageChange={setPage}
                        emptyMessage="No proposals found."
                    />
                </CardContent>
            </Card>

            {/* Proposal Detail Dialog */}
            <Dialog open={!!selectedProposalId} onOpenChange={(open) => !open && setSelectedProposalId(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Proposal Details</DialogTitle>
                        <DialogDescription>
                            {detail?.actionType?.replace(/_/g, ' ')} — <Badge variant="outline" className={detail ? STATUS_COLORS[detail.status] : ''}>{detail?.status}</Badge>
                        </DialogDescription>
                    </DialogHeader>

                    {detail && (
                        <div className="space-y-4">
                            {detail.description && (
                                <div><span className="text-sm text-muted-foreground block">Description</span><p className="text-sm">{detail.description}</p></div>
                            )}
                            {detail.safeTxHash && (
                                <div><span className="text-sm text-muted-foreground block">Safe Tx Hash</span><p className="font-mono text-xs break-all">{detail.safeTxHash}</p></div>
                            )}
                            <div>
                                <span className="text-sm text-muted-foreground block mb-2">
                                    Signatures ({detail.signatures?.length ?? 0} / {safeInfo?.threshold ?? '?'})
                                </span>
                                <div className="space-y-2">
                                    {detail.signatures?.map((sig) => (
                                        <div key={sig.id} className="flex items-center gap-2 p-2 rounded bg-muted/50 text-sm">
                                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                                            <span className="font-mono text-xs">{sig.signerWallet.substring(0, 6)}…{sig.signerWallet.slice(-4)}</span>
                                            <span className="text-muted-foreground ml-auto">{sig.member?.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {detail && (
                        <DialogFooter className="gap-2 sm:gap-0">
                            {detail.status === 'PENDING' && (
                                <>
                                    <Button
                                        onClick={() => {
                                            // In a real app, this would call MetaMask for EIP-712 signing
                                            const mockSig = '0x' + '00'.repeat(65);
                                            signMutation.mutate({ id: detail.id, signature: mockSig });
                                        }}
                                        disabled={signMutation.isPending}
                                    >
                                        <FileSignature className="mr-2 h-4 w-4" />
                                        {signMutation.isPending ? 'Signing…' : 'Sign Proposal'}
                                    </Button>
                                    <Button variant="destructive" onClick={() => cancelMutation.mutate(detail.id)} disabled={cancelMutation.isPending}>
                                        <XCircle className="mr-2 h-4 w-4" />
                                        Cancel
                                    </Button>
                                </>
                            )}
                            {detail.status === 'THRESHOLD_MET' && (
                                <Button onClick={() => executeMutation.mutate(detail.id)} disabled={executeMutation.isPending}>
                                    <Play className="mr-2 h-4 w-4" />
                                    {executeMutation.isPending ? 'Executing…' : 'Execute'}
                                </Button>
                            )}
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
