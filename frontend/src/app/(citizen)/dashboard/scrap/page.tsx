'use client';

import { useState } from 'react';
import { useVehicles, useAuthorizeScrap, useScrapCenters } from '@/hooks/use-citizen';
import { citizenApi } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Recycle, CheckCircle2, AlertTriangle, Loader2, Info, ShieldCheck, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

export default function CitizenScrapPage() {
    const [selectedDvpId, setSelectedDvpId] = useState('');
    const [selectedScrapCenter, setSelectedScrapCenter] = useState('');
    const { data: vehicleData } = useVehicles(1, 50);

    // Fetch scrap centers list
    const { data: scrapCenterData, isLoading: scrapCentersLoading } = useScrapCenters();

    // Eligibility check
    const { data: eligData, isLoading: eligLoading } = useQuery({
        queryKey: ['citizen-scrap-eligibility', selectedDvpId],
        queryFn: () => citizenApi.checkScrapEligibility(selectedDvpId),
        enabled: !!selectedDvpId,
    });

    // Web3 hook for authorizeScrap
    const { authorize, isPending, isConfirming, isConfirmed, error: txError, reset } = useAuthorizeScrap();

    const vehicles = vehicleData?.vehicles ?? [];
    const eligibility = eligData?.eligibility;
    const scrapCenters = scrapCenterData?.scrapCenters ?? [];

    const handleAuthorize = () => {
        if (!selectedDvpId || !selectedScrapCenter) return;
        authorize(selectedDvpId, selectedScrapCenter);
    };

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <Recycle className="h-6 w-6 text-primary" /> Authorize Scrap
                </h1>
                <p className="text-muted-foreground">
                    Authorize a scrap center to dismantle your vehicle. This is an irreversible on-chain action.
                </p>
            </div>

            <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>How Scrapping Works</AlertTitle>
                <AlertDescription>
                    <ol className="list-decimal list-inside mt-1 space-y-1 text-sm">
                        <li>Select a vehicle and check eligibility below</li>
                        <li>Choose an authorized scrap center from the dropdown</li>
                        <li>Sign the <code className="bg-muted px-1 rounded">authorizeScrap</code> transaction via MetaMask</li>
                        <li>The scrap center processes the dismantling from their dashboard</li>
                        <li>Your vehicle passport is permanently marked as SCRAPPED</li>
                    </ol>
                </AlertDescription>
            </Alert>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Select Vehicle</CardTitle>
                    <CardDescription>Choose which vehicle to check for scrap eligibility.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Select value={selectedDvpId} onValueChange={(v) => { setSelectedDvpId(v || ''); reset(); }}>
                        <SelectTrigger><SelectValue placeholder="Select a vehicle" /></SelectTrigger>
                        <SelectContent>
                            {vehicles.map((v: any) => (
                                <SelectItem key={v.passport?.dvpId ?? v.ownTid} value={String(v.passport?.dvpId ?? '')}>
                                    {v.passport?.make} {v.passport?.model} — DVP #{v.passport?.dvpId}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {selectedDvpId && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Scrap Eligibility Check</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {eligLoading ? (
                            <div className="flex items-center gap-2 py-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking…</div>
                        ) : eligibility ? (
                            <div className="space-y-4">
                                {eligibility.isEligible ? (
                                    <>
                                        <Alert className="border-green-200 bg-green-50 dark:bg-green-900/20">
                                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                                            <AlertTitle className="text-green-700">Eligible for Scrapping</AlertTitle>
                                            <AlertDescription>All compliance checks passed. Select a scrap center and authorize below.</AlertDescription>
                                        </Alert>

                                        {/* Scrap Center Selector */}
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Select Scrap Center</label>
                                            <Select value={selectedScrapCenter} onValueChange={(v) => setSelectedScrapCenter(v || '')} disabled={scrapCentersLoading}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={scrapCentersLoading ? 'Loading scrap centers…' : 'Choose a scrap center'} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {scrapCenters.map((sc: any) => (
                                                        <SelectItem key={sc.id} value={sc.code}>
                                                            {sc.name} ({sc.code})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {/* Warning */}
                                        <div className="p-4 border rounded-lg bg-destructive/5 border-destructive/20">
                                            <p className="text-sm font-medium text-destructive mb-2">⚠️ This action is irreversible</p>
                                            <p className="text-sm text-muted-foreground">Once scrapped, the vehicle&apos;s Digital Vehicle Passport (DVP) is permanently burned. The ownership token becomes inactive.</p>
                                        </div>

                                        {/* Transaction Status */}
                                        {isConfirmed && (
                                            <Alert className="bg-green-500/10 text-green-600 border-green-500/20">
                                                <ShieldCheck className="h-4 w-4 text-green-600" />
                                                <AlertDescription>
                                                    Scrap authorization confirmed on-chain! The scrap center can now process the dismantling from their dashboard.
                                                </AlertDescription>
                                            </Alert>
                                        )}

                                        {txError && (
                                            <Alert variant="destructive">
                                                <AlertCircle className="h-4 w-4" />
                                                <AlertDescription>
                                                    {(txError as any)?.shortMessage || txError.message || 'Transaction failed or was rejected.'}
                                                </AlertDescription>
                                            </Alert>
                                        )}

                                        {/* Authorize Button */}
                                        {!isConfirmed && (
                                            <Button
                                                onClick={handleAuthorize}
                                                disabled={isPending || isConfirming || !selectedScrapCenter}
                                                variant="destructive"
                                                className="w-full"
                                                size="lg"
                                            >
                                                {isPending ? (
                                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Check Wallet...</>
                                                ) : isConfirming ? (
                                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirming on-chain...</>
                                                ) : (
                                                    <><Recycle className="mr-2 h-4 w-4" /> Authorize Scrap via MetaMask</>
                                                )}
                                            </Button>
                                        )}
                                    </>
                                ) : (
                                    <Alert variant="destructive">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertTitle>Not Eligible for Scrapping</AlertTitle>
                                        <AlertDescription>
                                            <ul className="list-disc list-inside mt-1">
                                                {eligibility.reasons?.map((r: string, i: number) => <li key={i}>{r}</li>)}
                                            </ul>
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        ) : (
                            <p className="text-muted-foreground py-4 text-center">Could not check eligibility.</p>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
