'use client';

import { useState } from 'react';
import { useUser } from '@/contexts/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Building2, Wallet, Hash, Globe, Shield, Copy, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useChangePassword } from '@/hooks/use-b2b';

function ChangePasswordForm() {
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const mutation = useChangePassword();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (newPassword !== confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }
        
        if (newPassword.length < 8) {
            toast.error('New password must be at least 8 characters');
            return;
        }

        mutation.mutate({ oldPassword, newPassword }, {
            onSuccess: () => {
                setOldPassword('');
                setNewPassword('');
                setConfirmPassword('');
            }
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
            <div className="space-y-2">
                <Label htmlFor="oldPassword">Current Password</Label>
                <Input 
                    id="oldPassword" 
                    type="password" 
                    required 
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input 
                    id="newPassword" 
                    type="password" 
                    required 
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input 
                    id="confirmPassword" 
                    type="password" 
                    required 
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                />
            </div>
            <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Change Password
            </Button>
        </form>
    );
}

function InfoRow({ icon: Icon, label, value, copyable }: { icon: any; label: string; value: string | null | undefined; copyable?: boolean }) {
    const displayValue = value || 'N/A';
    return (
        <div className="flex items-start gap-3 py-3">
            <Icon className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="font-medium break-all">{displayValue}</p>
            </div>
            {copyable && value && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                        navigator.clipboard.writeText(value);
                        toast.success('Copied to clipboard');
                    }}
                >
                    <Copy className="h-3.5 w-3.5" />
                </Button>
            )}
        </div>
    );
}

export default function SettingsPage() {
    const { user } = useUser();

    if (!user) return null;

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground">View your institution profile and account details.</p>
            </div>

            {/* Entity Profile */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-primary" />
                        Institution Profile
                    </CardTitle>
                    <CardDescription>On-chain registered entity details</CardDescription>
                </CardHeader>
                <CardContent className="divide-y">
                    <InfoRow icon={Building2} label="Entity Type" value={user.entityType} />
                    <InfoRow icon={Hash} label="Entity ID" value={user.entityId} copyable />
                    <InfoRow icon={Wallet} label="Entity Wallet" value={user.wallet} copyable />
                </CardContent>
            </Card>

            {/* Account Profile */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-primary" />
                        Your Account
                    </CardTitle>
                    <CardDescription>Your personal staff member credentials</CardDescription>
                </CardHeader>
                <CardContent className="divide-y">
                    <InfoRow icon={Globe} label="Email" value={user.email} />
                    <InfoRow icon={Shield} label="Role" value={user.role} />
                    <InfoRow icon={Hash} label="Member ID" value={user.sub} copyable />
                </CardContent>
            </Card>

            {/* Security Profile */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-primary" />
                        Security
                    </CardTitle>
                    <CardDescription>Update your password</CardDescription>
                </CardHeader>
                <CardContent>
                    <ChangePasswordForm />
                </CardContent>
            </Card>

            {/* Session Info */}
            <Card>
                <CardHeader>
                    <CardTitle>Session Info</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3">
                        <Badge variant="outline">
                            Auth Type: {user.type}
                        </Badge>
                        <Badge variant="outline">
                            Issued: {new Date(user.iat * 1000).toLocaleString('en-IN')}
                        </Badge>
                        <Badge variant="outline">
                            Expires: {new Date(user.exp * 1000).toLocaleString('en-IN')}
                        </Badge>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
