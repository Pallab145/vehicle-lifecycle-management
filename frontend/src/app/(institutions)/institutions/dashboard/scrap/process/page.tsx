'use client';

import { useState } from 'react';
import { useScrapEligibility, useScrapVehicle } from '@/hooks/use-scrap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, CheckCircle2, XCircle, Recycle, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function ScrapProcessPage() {
    const [dvpId, setDvpId] = useState('');
    const [searchId, setSearchId] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);

    const { data: eligibility, isLoading: checking, refetch } = useScrapEligibility(searchId);
    const scrapMutation = useScrapVehicle();

    const handleCheck = () => {
        if (dvpId) {
            setSearchId(dvpId);
        }
    };

    const handleScrap = () => {
        scrapMutation.mutate(searchId, {
            onSuccess: () => {
                setConfirmOpen(false);
                setDvpId('');
                setSearchId('');
            },
        });
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Search className="h-6 w-6 text-primary" /> Process Vehicle</h1>
                <p className="text-muted-foreground">Check scrap eligibility and initiate dismantling.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Check Eligibility</CardTitle>
                    <CardDescription>Enter the vehicle&apos;s DVP Token ID to check if it&apos;s authorized for scrapping.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-3">
                        <div className="flex-1 space-y-2">
                            <Label>DVP Token ID</Label>
                            <Input placeholder="e.g. 1" value={dvpId} onChange={(e) => setDvpId(e.target.value)} />
                        </div>
                        <Button className="self-end" onClick={handleCheck} disabled={!dvpId || checking}>
                            {checking ? 'Checking…' : 'Check'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {eligibility?.eligibility && (
                <Card className={eligibility.eligibility.eligible ? 'border-green-500/30' : 'border-red-500/30'}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            {eligibility.eligibility.eligible
                                ? <><CheckCircle2 className="h-5 w-5 text-green-600" /> Eligible for Scrapping</>
                                : <><XCircle className="h-5 w-5 text-red-600" /> Not Eligible</>
                            }
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">DVP ID:</span>
                            <span className="font-mono font-medium">{eligibility.eligibility.dvpId}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Status:</span>
                            <Badge variant="outline">{eligibility.eligibility.status}</Badge>
                        </div>
                        {eligibility.eligibility.reasons.length > 0 && (
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-muted-foreground">Reasons:</p>
                                <ul className="space-y-1">
                                    {eligibility.eligibility.reasons.map((reason, i) => (
                                        <li key={i} className="text-sm flex items-center gap-2">
                                            <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                                            {reason}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {eligibility.eligibility.eligible && (
                            <Button
                                className="w-full mt-4 bg-red-600 hover:bg-red-700"
                                onClick={() => setConfirmOpen(true)}
                            >
                                <Recycle className="mr-2 h-4 w-4" /> Initiate Scrapping
                            </Button>
                        )}
                    </CardContent>
                </Card>
            )}

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" /> Confirm Vehicle Scrapping
                        </DialogTitle>
                        <DialogDescription>
                            This will permanently mark the vehicle as SCRAPPED on the blockchain. This action is <strong>irreversible</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">DVP Token ID:</span><span className="font-mono font-medium">{searchId}</span></div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
                        <Button onClick={handleScrap} disabled={scrapMutation.isPending} className="bg-red-600 hover:bg-red-700">
                            {scrapMutation.isPending ? 'Scrapping…' : 'Confirm Scrap'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
