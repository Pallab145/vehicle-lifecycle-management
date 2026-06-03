'use client';

import { useState } from 'react';
import { useStaffMembers, useCreateStaffMember, useUpdateStaffRole, useUpdateStaffStatus, useForceResetStaffPassword } from '@/hooks/use-b2b';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { UserPlus, MoreHorizontal, Shield, ShieldOff, Copy, Search, KeyRound } from 'lucide-react';
import type { B2BMember, MemberRole } from '@/types/b2b';
import { toast } from 'sonner';

const ROLE_COLORS: Record<MemberRole, string> = {
    OWNER: 'bg-purple-500/10 text-purple-600 border-purple-200',
    ADMIN: 'bg-blue-500/10 text-blue-600 border-blue-200',
    OPERATOR: 'bg-green-500/10 text-green-600 border-green-200',
    VIEWER: 'bg-gray-500/10 text-gray-600 border-gray-200',
};

export default function StaffPage() {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newMember, setNewMember] = useState({ name: '', email: '', role: 'OPERATOR' as MemberRole });

    const { data, isLoading } = useStaffMembers({ page, limit: 10, search: search || undefined });
    const createMutation = useCreateStaffMember();
    const updateRoleMutation = useUpdateStaffRole();
    const updateStatusMutation = useUpdateStaffStatus();
    const forceResetMutation = useForceResetStaffPassword();

    const columns: Column<B2BMember>[] = [
        {
            key: 'name',
            header: 'Name',
            render: (row) => (
                <div>
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.email}</p>
                </div>
            ),
        },
        {
            key: 'role',
            header: 'Role',
            render: (row) => (
                <Badge variant="outline" className={ROLE_COLORS[row.role]}>
                    {row.role}
                </Badge>
            ),
        },
        {
            key: 'isActive',
            header: 'Status',
            render: (row) => (
                <Badge variant={row.isActive ? 'default' : 'secondary'}>
                    {row.isActive ? 'Active' : 'Inactive'}
                </Badge>
            ),
        },
        {
            key: 'lastLoginAt',
            header: 'Last Login',
            render: (row) =>
                row.lastLoginAt
                    ? new Date(row.lastLoginAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                    : 'Never',
        },
        {
            key: 'actions',
            header: '',
            className: 'w-12',
            render: (row) => (
                <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-8 w-8 p-0" />}>
                            <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {(['ADMIN', 'OPERATOR', 'VIEWER'] as MemberRole[]).filter(r => r !== row.role).map(role => (
                            <DropdownMenuItem
                                key={role}
                                onClick={() => updateRoleMutation.mutate({ id: row.id, role })}
                            >
                                Set as {role}
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => updateStatusMutation.mutate({ id: row.id, isActive: !row.isActive })}
                        >
                            {row.isActive ? (
                                <><ShieldOff className="mr-2 h-4 w-4" /> Deactivate</>
                            ) : (
                                <><Shield className="mr-2 h-4 w-4" /> Activate</>
                            )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => {
                                if (confirm(`Are you sure you want to forcefully reset ${row.name}'s password?`)) {
                                    forceResetMutation.mutate(row.id, {
                                        onSuccess: (data) => {
                                            toast.success('Password reset successfully');
                                            if (data.tempPassword) {
                                                toast.info(`Temporary password for ${row.name}: ${data.tempPassword}`, {
                                                    duration: 30000,
                                                    action: {
                                                        label: 'Copy',
                                                        onClick: () => navigator.clipboard.writeText(data.tempPassword),
                                                    },
                                                });
                                            }
                                        }
                                    });
                                }
                            }}
                        >
                            <KeyRound className="mr-2 h-4 w-4" /> Reset Password
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
        },
    ];

    const handleCreate = () => {
        createMutation.mutate(newMember, {
            onSuccess: (data) => {
                setIsCreateOpen(false);
                setNewMember({ name: '', email: '', role: 'OPERATOR' });
                // Show temp password in a toast so admin can share it
                if (data.tempPassword) {
                    toast.info(`Temporary password: ${data.tempPassword}`, {
                        duration: 15000,
                        action: {
                            label: 'Copy',
                            onClick: () => navigator.clipboard.writeText(data.tempPassword),
                        },
                    });
                }
            },
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Staff Members</h1>
                    <p className="text-muted-foreground">Manage your institution&apos;s team members and their access levels.</p>
                </div>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger render={<Button />}>
                            <UserPlus className="mr-2 h-4 w-4" /> Add Member
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add Staff Member</DialogTitle>
                            <DialogDescription>
                                Create a new staff account. A temporary password will be generated automatically.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Full Name</Label>
                                <Input
                                    id="name"
                                    placeholder="John Doe"
                                    value={newMember.name}
                                    onChange={(e) => setNewMember(prev => ({ ...prev, name: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="john@institution.gov.in"
                                    value={newMember.email}
                                    onChange={(e) => setNewMember(prev => ({ ...prev, email: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="role">Role</Label>
                                <Select
                                    value={newMember.role}
                                    onValueChange={(val) => setNewMember(prev => ({ ...prev, role: val as MemberRole }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ADMIN">Admin</SelectItem>
                                        <SelectItem value="OPERATOR">Operator</SelectItem>
                                        <SelectItem value="VIEWER">Viewer</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                            <Button onClick={handleCreate} disabled={createMutation.isPending || !newMember.name || !newMember.email}>
                                {createMutation.isPending ? 'Creating…' : 'Create Member'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by name or email…"
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            className="max-w-sm"
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <DataTable
                        columns={columns}
                        data={data?.members ?? []}
                        isLoading={isLoading}
                        total={data?.total ?? 0}
                        page={page}
                        limit={10}
                        onPageChange={setPage}
                        emptyMessage="No staff members found."
                    />
                </CardContent>
            </Card>
        </div>
    );
}
