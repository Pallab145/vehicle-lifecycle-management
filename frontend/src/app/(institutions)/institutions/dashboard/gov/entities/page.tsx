'use client';

import { useState } from 'react';
import { useInstitutions, useCreateInstitution, useToggleInstitution, useRetryRegistration } from '@/hooks/use-b2b';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuGroup
} from '@/components/ui/dropdown-menu';
import { Plus, MoreHorizontal, Search, Power, RotateCcw } from 'lucide-react';
import type { B2BEntityDetail, EntityType } from '@/types/b2b';

const ENTITY_TYPE_OPTIONS: { value: Exclude<EntityType, 'GOVERNMENT'>; label: string }[] = [
    { value: 'RTO', label: 'Regional Transport Office' },
    { value: 'MANUFACTURER', label: 'Vehicle Manufacturer' },
    { value: 'POLICE', label: 'Police Station' },
    { value: 'INSURANCE', label: 'Insurance Company' },
    { value: 'PUC_CENTER', label: 'PUC Center' },
    { value: 'SCRAP_CENTER', label: 'Scrap Center' },
    { value: 'BANK', label: 'Bank / Financial Institution' },
];

const TYPE_COLORS: Record<string, string> = {
    GOVERNMENT: 'bg-purple-500/10 text-purple-600',
    RTO: 'bg-blue-500/10 text-blue-600',
    MANUFACTURER: 'bg-orange-500/10 text-orange-600',
    POLICE: 'bg-red-500/10 text-red-600',
    INSURANCE: 'bg-teal-500/10 text-teal-600',
    PUC_CENTER: 'bg-green-500/10 text-green-600',
    SCRAP_CENTER: 'bg-yellow-500/10 text-yellow-600',
    BANK: 'bg-indigo-500/10 text-indigo-600',
};

const DEFAULT_VALUES: Record<string, { code: string, name: string, adminName: string, adminEmail: string }> = {
    RTO: { code: 'MH12-RTO', name: 'Mumbai RTO Office', adminName: 'Rajesh Kumar', adminEmail: 'admin@rto.gov.in' },
    MANUFACTURER: { code: 'TATA-MOTORS', name: 'Tata Motors Factory', adminName: 'Ratan Tata', adminEmail: 'admin@tatamotors.com' },
    POLICE: { code: 'MUM-POLICE', name: 'Mumbai Traffic Police HQ', adminName: 'ACP Pradyuman', adminEmail: 'admin@police.gov.in' },
    INSURANCE: { code: 'LIC-IND', name: 'LIC India', adminName: 'Sanjay Sharma', adminEmail: 'admin@lic.in' },
    PUC_CENTER: { code: 'PUC-MH12', name: 'Green Drive PUC', adminName: 'Vikram Singh', adminEmail: 'admin@puc.in' },
    SCRAP_CENTER: { code: 'SCRAP-MUM', name: 'Mumbai Auto Scrap', adminName: 'Rahul Patel', adminEmail: 'admin@scrap.in' },
    BANK: { code: 'SBI-IND', name: 'State Bank of India', adminName: 'Arundhati B', adminEmail: 'admin@sbi.in' },
};

export default function EntitiesPage() {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('ALL');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [form, setForm] = useState({
        type: '' as EntityType,
        code: '',
        name: '',
        adminName: '',
        adminEmail: '',
    });

    const filterParams = {
        page,
        limit: 10,
        search: search || undefined,
        type: typeFilter !== 'ALL' ? (typeFilter as EntityType) : undefined,
    };

    const { data, isLoading } = useInstitutions(filterParams);
    const createMutation = useCreateInstitution();
    const toggleMutation = useToggleInstitution();
    const retryMutation = useRetryRegistration();

    const columns: Column<B2BEntityDetail>[] = [
        {
            key: 'name',
            header: 'Institution',
            render: (row) => (
                <div>
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{row.code}</p>
                </div>
            ),
        },
        {
            key: 'type',
            header: 'Type',
            render: (row) => (
                <Badge variant="outline" className={TYPE_COLORS[row.type] || ''}>
                    {row.type.replace('_', ' ')}
                </Badge>
            ),
        },
        {
            key: 'walletAddress',
            header: 'Wallet',
            render: (row) => (
                <span className="font-mono text-xs" title={row.walletAddress}>
                    {row.walletAddress.substring(0, 6)}…{row.walletAddress.slice(-4)}
                </span>
            ),
        },
        {
            key: 'onChainId',
            header: 'On-Chain ID',
            render: (row) => row.onChainId ? (
                <Badge variant="outline" className="font-mono">{row.onChainId}</Badge>
            ) : (
                <Badge variant="secondary">Pending</Badge>
            ),
        },
        {
            key: 'isActive',
            header: 'Status',
            render: (row) => (
                <Badge variant={row.isActive ? 'default' : 'destructive'}>
                    {row.isActive ? 'Active' : 'Suspended'}
                </Badge>
            ),
        },
        {
            key: 'actions',
            header: '',
            className: 'w-12',
            render: (row) => (
                <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => toggleMutation.mutate({ id: row.id, isActive: !row.isActive })}>
                            <Power className="mr-2 h-4 w-4" />
                            {row.isActive ? 'Suspend' : 'Activate'}
                        </DropdownMenuItem>
                        {!row.onChainId && (
                            <DropdownMenuItem onClick={() => retryMutation.mutate(row.id)}>
                                <RotateCcw className="mr-2 h-4 w-4" />
                                Retry Registration
                            </DropdownMenuItem>
                        )}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
        },
    ];

    const handleCreate = () => {
        createMutation.mutate(
            {
                type: form.type as Exclude<EntityType, 'GOVERNMENT'>,
                code: form.code,
                name: form.name,
                adminMember: { name: form.adminName, email: form.adminEmail },
            },
            {
                onSuccess: () => {
                    setIsCreateOpen(false);
                    setForm({ type: '' as EntityType, code: '', name: '', adminName: '', adminEmail: '' });
                },
            }
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Entity Directory</h1>
                    <p className="text-muted-foreground">Manage all registered institutions in the network.</p>
                </div>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger render={<Button />}>
                        <Plus className="mr-2 h-4 w-4" /> Register Entity
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Register New Institution</DialogTitle>
                            <DialogDescription>This will create a new B2B entity and submit a blockchain registration transaction.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Entity Type</Label>
                                    <Select value={form.type} onValueChange={(val) => {
                                        const newType = (val as EntityType) || 'RTO';
                                        setForm({ type: newType, code: '', name: '', adminName: '', adminEmail: '' });
                                    }}>
                                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                        <SelectContent>
                                            {ENTITY_TYPE_OPTIONS.map(o => (
                                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Short Code</Label>
                                    <Input placeholder={form.type ? DEFAULT_VALUES[form.type]?.code : 'MH12-RTO'} value={form.code} onChange={(e) => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Institution Name</Label>
                                <Input placeholder={form.type ? DEFAULT_VALUES[form.type]?.name : 'Mumbai RTO Office'} value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} />
                            </div>
                            <div className="border-t pt-4 space-y-4">
                                <p className="text-sm font-medium">Initial Admin Member</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Admin Name</Label>
                                        <Input placeholder={form.type ? DEFAULT_VALUES[form.type]?.adminName : 'Rajesh Kumar'} value={form.adminName} onChange={(e) => setForm(p => ({ ...p, adminName: e.target.value }))} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Admin Email</Label>
                                        <Input type="email" placeholder={form.type ? DEFAULT_VALUES[form.type]?.adminEmail : 'admin@rto.gov.in'} value={form.adminEmail} onChange={(e) => setForm(p => ({ ...p, adminEmail: e.target.value }))} />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                            <Button onClick={handleCreate} disabled={createMutation.isPending || !form.type || !form.code || !form.name || !form.adminName || !form.adminEmail}>
                                {createMutation.isPending ? 'Registering…' : 'Register Entity'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex items-center gap-2 flex-1">
                            <Search className="h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search by name or code…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="max-w-sm" />
                        </div>
                        <Select value={typeFilter} onValueChange={(val) => { setTypeFilter(val || 'ALL'); setPage(1); }}>
                            <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="All Types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All Types</SelectItem>
                                {ENTITY_TYPE_OPTIONS.map(o => (
                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <DataTable
                        columns={columns}
                        data={data?.entities ?? []}
                        isLoading={isLoading}
                        total={data?.total ?? 0}
                        page={page}
                        limit={10}
                        onPageChange={setPage}
                        emptyMessage="No institutions found."
                    />
                </CardContent>
            </Card>
        </div>
    );
}
