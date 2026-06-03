'use client';

import { useState } from 'react';
import { useManufactureVehicle } from '@/hooks/use-mfg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Hammer, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function MfgMintPage() {
    const [form, setForm] = useState({ vin: '', make: '', model: '', color: '', engineNo: '', chassisNo: '' });
    const [success, setSuccess] = useState(false);
    const mintMutation = useManufactureVehicle();
    const router = useRouter();

    const handleMint = () => {
        mintMutation.mutate(form, {
            onSuccess: () => {
                setSuccess(true);
                setForm({ vin: '', make: '', model: '', color: '', engineNo: '', chassisNo: '' });
                setTimeout(() => setSuccess(false), 3000);
            },
        });
    };

    const isValid = form.vin && form.make && form.model && form.engineNo && form.chassisNo;

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Hammer className="h-6 w-6 text-primary" /> Mint Vehicle</h1>
                <p className="text-muted-foreground">Create a new Digital Vehicle Passport (DVP) NFT on the blockchain.</p>
            </div>

            {success && (
                <Card className="border-green-500/30 bg-green-500/5">
                    <CardContent className="pt-6 flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <p className="text-green-700 dark:text-green-400 font-medium">Vehicle minted successfully! Transaction submitted to blockchain.</p>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Vehicle Details</CardTitle>
                    <CardDescription>Enter the vehicle specifications. This will mint a soulbound ERC-721 token on the DVP contract.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2 col-span-2">
                            <Label>Vehicle Identification Number (VIN) <span className="text-destructive">*</span></Label>
                            <Input placeholder="MAHBB1HFXM1234567" value={form.vin} onChange={(e) => setForm(p => ({ ...p, vin: e.target.value }))} />
                            <p className="text-xs text-muted-foreground">17-character alphanumeric VIN. Will be hashed (keccak256) before storing on-chain.</p>
                        </div>
                        <div className="space-y-2">
                            <Label>Make <span className="text-destructive">*</span></Label>
                            <Input placeholder="Tata" value={form.make} onChange={(e) => setForm(p => ({ ...p, make: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Model <span className="text-destructive">*</span></Label>
                            <Input placeholder="Nexon" value={form.model} onChange={(e) => setForm(p => ({ ...p, model: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Color</Label>
                            <Input placeholder="Royal Blue" value={form.color} onChange={(e) => setForm(p => ({ ...p, color: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Engine No <span className="text-destructive">*</span></Label>
                            <Input placeholder="K10C1234567" value={form.engineNo} onChange={(e) => setForm(p => ({ ...p, engineNo: e.target.value }))} />
                        </div>
                        <div className="space-y-2 col-span-2">
                            <Label>Chassis No <span className="text-destructive">*</span></Label>
                            <Input placeholder="MAHBB1HF..." value={form.chassisNo} onChange={(e) => setForm(p => ({ ...p, chassisNo: e.target.value }))} />
                        </div>
                    </div>
                    <div className="flex gap-3 mt-6">
                        <Button variant="outline" onClick={() => router.push('/institutions/dashboard/mfg')}>Cancel</Button>
                        <Button onClick={handleMint} disabled={mintMutation.isPending || !isValid}>
                            {mintMutation.isPending ? 'Minting on Blockchain…' : 'Mint Vehicle (DVP)'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
