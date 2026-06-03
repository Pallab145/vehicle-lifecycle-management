'use client';

import { useState } from 'react';
import { useVehicles, useAcceptTransfer, useCancelTransfer, useIncomingTransfers } from '@/hooks/use-citizen';
import { citizenApi } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeftRight, CheckCircle2, Loader2, AlertTriangle, ArrowRight, Check, X, ShieldCheck, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { TransferExpiryBadge } from '@/components/citizen/TransferExpiryBadge';

function TransferStatusSteps({ transfer }: { transfer: any }) {
    const Step = ({ label, ok }: { label: string; ok: boolean }) => (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg border ${ok ? 'border-green-200 bg-green-50 dark:bg-green-900/20' : 'border-muted'}`}>
            {ok ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-muted-foreground" />}
            <span className={ok ? 'font-medium text-green-700 dark:text-green-400' : 'text-muted-foreground'}>{label}</span>
        </div>
    );
    return (
        <div className="flex flex-col sm:flex-row gap-2">
            <Step label="Seller Initiated" ok={transfer.sellerOK} />
            <div className="hidden sm:flex items-center"><ArrowRight className="h-4 w-4 text-muted-foreground" /></div>
            <Step label="Buyer Accepted" ok={transfer.buyerOK} />
            <div className="hidden sm:flex items-center"><ArrowRight className="h-4 w-4 text-muted-foreground" /></div>
            <Step label="RTO Approved" ok={transfer.rtoOK} />
        </div>
    );
}

export default function CitizenTransferPage() {
    const [selectedOwnTid, setSelectedOwnTid] = useState('');
    const { data: vehicleData } = useVehicles(1, 50);
    const { data: incomingData } = useIncomingTransfers();
    const { address } = useAccount();

    // Accept Transfer Web3 hook
    const { accept, isPending: isAcceptPending, isConfirming: isAcceptConfirming, isConfirmed: isAcceptConfirmed, error: acceptError } = useAcceptTransfer();

    // Cancel Transfer Web3 hook
    const { cancel, isPending: isCancelPending, isConfirming: isCancelConfirming, isConfirmed: isCancelConfirmed, error: cancelError } = useCancelTransfer();

    // Check eligibility for selected vehicle
    const { data: eligData, isLoading: eligLoading } = useQuery({
        queryKey: ['transfer-eligibility', selectedOwnTid],
        queryFn: () => citizenApi.checkTransferEligibility(selectedOwnTid),
        enabled: !!selectedOwnTid,
    });

    // Check existing transfer status
    const { data: transferData } = useQuery({
        queryKey: ['transfer-status', selectedOwnTid],
        queryFn: () => citizenApi.getTransferStatus(selectedOwnTid).catch(() => null),
        enabled: !!selectedOwnTid,
    });

    const vehicles = vehicleData?.vehicles ?? [];
    const incomingTransfers = incomingData?.transfers ?? [];
    const eligibility = eligData?.eligibility;
    const activeTransfer = transferData?.transfer;

    // Determine if the current user is the buyer who needs to accept
    const isBuyerWhoNeedsToAccept = activeTransfer &&
        activeTransfer.sellerOK &&
        !activeTransfer.buyerOK &&
        address &&
        activeTransfer.buyerWallet.toLowerCase() === address.toLowerCase();

    // Determine if the current user is the seller or if the transfer is expired
    const isSeller = activeTransfer && address && activeTransfer.sellerWallet.toLowerCase() === address.toLowerCase();
    const isExpired = activeTransfer && new Date(activeTransfer.reqDate).getTime() + 30 * 24 * 60 * 60 * 1000 < Date.now();
    const canCancel = isSeller || isExpired;

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <ArrowLeftRight className="h-6 w-6 text-primary" /> Transfer Ownership
                </h1>
                <p className="text-muted-foreground">
                    Initiate or accept a vehicle ownership transfer. Transfers require seller initiation, buyer acceptance, and RTO approval.
                </p>
            </div>

            {/* Incoming Transfers (For Buyer) */}
            {incomingTransfers.length > 0 && (
                <div className="space-y-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2 text-blue-700 dark:text-blue-400">
                        <ArrowLeftRight className="h-5 w-5" /> Incoming Transfer Requests
                    </h2>
                    {incomingTransfers.map((req: any) => (
                        <Card key={req.id} className="border-blue-200 bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-800">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex justify-between items-center">
                                    <span>{req.ownership.passport?.make} {req.ownership.passport?.model}</span>
                                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100">Action Required</Badge>
                                </CardTitle>
                                <CardDescription>
                                    Reg: {req.ownership.passport?.registrationNumber ?? 'N/A'} • Seller: {req.sellerWallet.slice(0, 6)}...{req.sellerWallet.slice(-4)}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button 
                                    onClick={() => {
                                        setSelectedOwnTid(String(req.ownTid));
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    className="w-full"
                                    variant="outline"
                                >
                                    View Details & Accept
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Step 1: Select Vehicle */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Select Vehicle</CardTitle>
                    <CardDescription>Choose which vehicle to check for transfer eligibility.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Select value={selectedOwnTid} onValueChange={setSelectedOwnTid}>
                        <SelectTrigger><SelectValue placeholder="Select a vehicle" /></SelectTrigger>
                        <SelectContent>
                            {vehicles.map((v: any) => (
                                <SelectItem key={v.ownTid} value={String(v.ownTid)}>
                                    {v.passport?.make} {v.passport?.model} — {v.passport?.registrationNumber ?? `OwnTid: ${v.ownTid}`}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {/* Active Transfer Status */}
            {activeTransfer && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Active Transfer Request</CardTitle>
                        <CardDescription className="flex items-center gap-2">
                            <span>Status: <Badge variant="outline">{activeTransfer.status}</Badge></span>
                            <TransferExpiryBadge reqDate={activeTransfer.reqDate} />
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <TransferStatusSteps transfer={activeTransfer} />
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-muted-foreground block">Seller</span>
                                <span className="font-mono text-xs">{activeTransfer.sellerWallet}</span>
                            </div>
                            <div>
                                <span className="text-muted-foreground block">Buyer</span>
                                <span className="font-mono text-xs">{activeTransfer.buyerWallet}</span>
                            </div>
                        </div>

                        {/* Accept Transfer Button — shown to the buyer when they need to accept */}
                        {isBuyerWhoNeedsToAccept && (
                            <div className="space-y-3 pt-2 border-t">
                                <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-900/20">
                                    <AlertCircle className="h-4 w-4 text-blue-600" />
                                    <AlertTitle className="text-blue-700 dark:text-blue-400">Action Required</AlertTitle>
                                    <AlertDescription>
                                        The seller has initiated a transfer to your wallet. Sign the transaction below to accept ownership.
                                    </AlertDescription>
                                </Alert>

                                {isAcceptConfirmed && (
                                    <Alert className="bg-green-500/10 text-green-600 border-green-500/20">
                                        <ShieldCheck className="h-4 w-4 text-green-600" />
                                        <AlertDescription>
                                            Transfer accepted successfully! Waiting for RTO approval to finalize.
                                        </AlertDescription>
                                    </Alert>
                                )}

                                {acceptError && (
                                    <Alert variant="destructive">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertDescription>
                                            {(acceptError as any)?.shortMessage || acceptError.message || 'Transaction failed or was rejected.'}
                                        </AlertDescription>
                                    </Alert>
                                )}

                                {!isAcceptConfirmed && (
                                    <Button
                                        onClick={() => accept(String(activeTransfer.ownTid))}
                                        disabled={isAcceptPending || isAcceptConfirming}
                                        className="w-full"
                                        size="lg"
                                    >
                                        {isAcceptPending ? (
                                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Check Wallet...</>
                                        ) : isAcceptConfirming ? (
                                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirming on-chain...</>
                                        ) : (
                                            <><CheckCircle2 className="mr-2 h-4 w-4" /> Accept Transfer via MetaMask</>
                                        )}
                                    </Button>
                                )}
                            </div>
                        )}

                        {/* Cancel Transfer Button */}
                        {canCancel && !isCancelConfirmed && (
                            <div className="space-y-3 pt-2 border-t">
                                <Alert variant="destructive" className="bg-destructive/5">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Cancel Transfer</AlertTitle>
                                    <AlertDescription>
                                        {isExpired ? 'This transfer request has expired (30 days) and can be cancelled.' : 'You can cancel this pending transfer before it is completed.'}
                                    </AlertDescription>
                                </Alert>

                                {cancelError && (
                                    <Alert variant="destructive">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertDescription>
                                            {(cancelError as any)?.shortMessage || cancelError.message || 'Transaction failed.'}
                                        </AlertDescription>
                                    </Alert>
                                )}

                                <Button
                                    variant="destructive"
                                    onClick={() => cancel(String(activeTransfer.ownTid))}
                                    disabled={isCancelPending || isCancelConfirming}
                                    className="w-full"
                                    size="lg"
                                >
                                    {isCancelPending ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Check Wallet...</>
                                    ) : isCancelConfirming ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirming on-chain...</>
                                    ) : (
                                        <><X className="mr-2 h-4 w-4" /> Cancel Transfer via MetaMask</>
                                    )}
                                </Button>
                            </div>
                        )}
                        
                        {isCancelConfirmed && (
                            <Alert className="bg-green-500/10 text-green-600 border-green-500/20 mt-4">
                                <ShieldCheck className="h-4 w-4 text-green-600" />
                                <AlertDescription>
                                    Transfer cancelled successfully!
                                </AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Eligibility Check */}
            {selectedOwnTid && !activeTransfer && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Transfer Eligibility</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {eligLoading ? (
                            <div className="flex items-center gap-2 py-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking…</div>
                        ) : eligibility ? (
                            <div className="space-y-4">
                                {eligibility.isEligible ? (
                                    <Alert className="border-green-200 bg-green-50 dark:bg-green-900/20">
                                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                                        <AlertTitle className="text-green-700">Eligible for Transfer</AlertTitle>
                                        <AlertDescription>All compliance checks passed. You can initiate a transfer from the vehicle detail page.</AlertDescription>
                                    </Alert>
                                ) : (
                                    <Alert variant="destructive">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertTitle>Not Eligible</AlertTitle>
                                        <AlertDescription>
                                            <ul className="list-disc list-inside mt-1">
                                                {eligibility.reasons?.map((r: string, i: number) => <li key={i}>{r}</li>)}
                                            </ul>
                                        </AlertDescription>
                                    </Alert>
                                )}

                                {eligibility.isEligible && (
                                    <div className="p-4 border rounded-lg bg-muted/50 space-y-2">
                                        <p className="text-sm font-medium">To initiate transfer:</p>
                                        <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                                            <li>Go to the vehicle&apos;s detail page and click &quot;Initiate Transfer&quot;</li>
                                            <li>The buyer will see an &quot;Accept Transfer&quot; button on this page</li>
                                            <li>RTO will approve the transfer on-chain</li>
                                        </ol>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-muted-foreground py-4 text-center">Select a vehicle to check eligibility.</p>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
