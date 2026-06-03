'use client';

import { useState } from 'react';
import { useIssuePuc } from '@/hooks/use-puc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClipboardCheck, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function PucIssuePage() {
    const [form, setForm] = useState({ ownTid: '', co: '', hc: '', smoke: '', passed: 'true', expiryDays: '180' });
    const [success, setSuccess] = useState(false);
    const issueMutation = useIssuePuc();
    const router = useRouter();

    const handleIssue = () => {
        const expiryDate = Math.floor(Date.now() / 1000) + (parseInt(form.expiryDays) * 86400);
        issueMutation.mutate(
            { ownTid: form.ownTid, co: parseInt(form.co), hc: parseInt(form.hc), smoke: parseInt(form.smoke), passed: form.passed === 'true', expiryDate },
            {
                onSuccess: () => {
                    setSuccess(true);
                    setForm({ ownTid: '', co: '', hc: '', smoke: '', passed: 'true', expiryDays: '180' });
                    setTimeout(() => setSuccess(false), 3000);
                },
            }
        );
    };

    const isValid = form.ownTid && form.co && form.hc && form.smoke;

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ClipboardCheck className="h-6 w-6 text-primary" /> Issue PUC Certificate</h1>
                <p className="text-muted-foreground">Record emissions test results and issue a PUC certificate NFT.</p>
            </div>

            {success && (
                <Card className="border-green-500/30 bg-green-500/5">
                    <CardContent className="pt-6 flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <p className="text-green-700 dark:text-green-400 font-medium">PUC certificate issued successfully!</p>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Emissions Test Results</CardTitle>
                    <CardDescription>Enter the vehicle&apos;s emission readings from the PUC testing equipment.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2 col-span-2">
                            <Label>Ownership Token ID <span className="text-destructive">*</span></Label>
                            <Input placeholder="e.g. 1" value={form.ownTid} onChange={(e) => setForm(p => ({ ...p, ownTid: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>CO Level (ppm) <span className="text-destructive">*</span></Label>
                            <Input type="number" placeholder="e.g. 350" value={form.co} onChange={(e) => setForm(p => ({ ...p, co: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>HC Level (ppm) <span className="text-destructive">*</span></Label>
                            <Input type="number" placeholder="e.g. 120" value={form.hc} onChange={(e) => setForm(p => ({ ...p, hc: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Smoke Level (HSU) <span className="text-destructive">*</span></Label>
                            <Input type="number" placeholder="e.g. 45" value={form.smoke} onChange={(e) => setForm(p => ({ ...p, smoke: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Test Result</Label>
                            <Select value={form.passed} onValueChange={(v) => setForm(p => ({ ...p, passed: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="true">✅ Passed</SelectItem>
                                    <SelectItem value="false">❌ Failed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2 col-span-2">
                            <Label>Certificate Validity (Days)</Label>
                            <Input type="number" min="1" max="365" placeholder="180" value={form.expiryDays} onChange={(e) => setForm(p => ({ ...p, expiryDays: e.target.value }))} />
                        </div>
                    </div>
                    <div className="flex gap-3 mt-6">
                        <Button variant="outline" onClick={() => router.push('/institutions/dashboard/puc')}>Cancel</Button>
                        <Button onClick={handleIssue} disabled={issueMutation.isPending || !isValid}>
                            {issueMutation.isPending ? 'Issuing on Blockchain…' : 'Issue PUC Certificate'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
