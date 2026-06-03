'use client';

import { useState } from 'react';
import { useIssueChallan } from '@/hooks/use-police';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileWarning, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function PoliceIssueChallanPage() {
    const [form, setForm] = useState({ ownTid: '', amount: '' });
    const [success, setSuccess] = useState(false);
    const issueMutation = useIssueChallan();
    const router = useRouter();

    const handleIssue = () => {
        issueMutation.mutate({ ownTid: form.ownTid, amount: form.amount }, {
            onSuccess: () => {
                setSuccess(true);
                setForm({ ownTid: '', amount: '' });
                setTimeout(() => setSuccess(false), 3000);
            },
        });
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FileWarning className="h-6 w-6 text-primary" /> Issue Traffic Challan</h1>
                <p className="text-muted-foreground">Issue a new challan against a vehicle ownership token on the blockchain.</p>
            </div>

            {success && (
                <Card className="border-green-500/30 bg-green-500/5">
                    <CardContent className="pt-6 flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <p className="text-green-700 dark:text-green-400 font-medium">Challan issued successfully! Transaction submitted to blockchain.</p>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Challan Details</CardTitle>
                    <CardDescription>Enter the vehicle&apos;s ownership token ID and the fine amount to issue a challan.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Ownership Token ID <span className="text-destructive">*</span></Label>
                            <Input placeholder="e.g. 1" value={form.ownTid} onChange={(e) => setForm(p => ({ ...p, ownTid: e.target.value }))} />
                            <p className="text-xs text-muted-foreground">The on-chain Ownership Token ID of the vehicle being fined.</p>
                        </div>
                        <div className="space-y-2">
                            <Label>Fine Amount (Wei) <span className="text-destructive">*</span></Label>
                            <Input type="number" placeholder="e.g. 500" value={form.amount} onChange={(e) => setForm(p => ({ ...p, amount: e.target.value }))} />
                            <p className="text-xs text-muted-foreground">Amount in Wei (smallest denomination). Will be recorded on the ChallanContract.</p>
                        </div>
                    </div>
                    <div className="flex gap-3 mt-6">
                        <Button variant="outline" onClick={() => router.push('/institutions/dashboard/police')}>Cancel</Button>
                        <Button onClick={handleIssue} disabled={issueMutation.isPending || !form.ownTid || !form.amount} className="bg-red-600 hover:bg-red-700">
                            {issueMutation.isPending ? 'Issuing on Blockchain…' : 'Issue Challan'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
