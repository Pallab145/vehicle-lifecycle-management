'use client';

import { useState } from 'react';
import { useDealerInventory, useDealerTradeCerts, useCreateSaleRequest } from '@/hooks/use-dealer';
import { useRtos } from '@/hooks/use-citizen';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Car, Loader2, Store, FileText, CheckCircle2 } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import type { DealerInventoryItem } from '@/types/b2b';

export default function CitizenDealerPage() {
    const { data: inventoryData, isLoading: inventoryLoading } = useDealerInventory();
    const { data: tradeCertData, isLoading: certsLoading } = useDealerTradeCerts();
    const { data: rtosData, isLoading: rtosLoading } = useRtos();
    
    const [selectedDvpId, setSelectedDvpId] = useState<string>('');
    const [buyerWallet, setBuyerWallet] = useState('');
    const [rtoEntityId, setRtoEntityId] = useState('');
    const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);

    const saleMutation = useCreateSaleRequest();

    const handleCreateSaleRequest = () => {
        if (!selectedDvpId || !buyerWallet || !rtoEntityId) return;
        
        saleMutation.mutate({
            dvpId: selectedDvpId,
            buyerWallet,
            rtoEntityId
        }, {
            onSuccess: () => {
                setIsSaleModalOpen(false);
                setBuyerWallet('');
                setRtoEntityId('');
                setSelectedDvpId('');
            }
        });
    };

    const columns: Column<DealerInventoryItem>[] = [
        { 
            key: 'vehicle', 
            header: 'Vehicle', 
            render: (r) => (
                <div>
                    <p className="font-medium">{r.make} {r.model}</p>
                    <p className="text-xs text-muted-foreground font-mono">DVP #{r.dvpId}</p>
                </div>
            ) 
        },
        { 
            key: 'status', 
            header: 'Status', 
            render: (r) => {
                if (r.registrationRequest) {
                    return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600">Pending RTO</Badge>;
                }
                return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">In Stock</Badge>;
            } 
        },
        { 
            key: 'mfgDate', 
            header: 'Mfg Date', 
            render: (r) => new Date(r.mfgDate).toLocaleDateString('en-IN') 
        },
        {
            key: 'actions',
            header: '',
            className: 'w-32',
            render: (r) => (
                !r.registrationRequest ? (
                    <Button 
                        size="sm" 
                        onClick={() => {
                            setSelectedDvpId(String(r.dvpId));
                            setIsSaleModalOpen(true);
                        }}
                    >
                        Sell Vehicle
                    </Button>
                ) : (
                    <span className="text-xs text-muted-foreground">Sent to RTO</span>
                )
            )
        }
    ];

    const inventory = inventoryData?.vehicles ?? [];
    const tradeCerts = tradeCertData?.tradeCerts ?? [];
    const rtos = rtosData?.rtos ?? [];

    const activeTradeCert = tradeCerts.find(tc => tc.isActive && new Date(tc.validTill) > new Date());

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <Store className="h-6 w-6 text-primary" /> Dealer Dashboard
                </h1>
                <p className="text-muted-foreground">
                    Manage vehicle inventory assigned to you by manufacturers and submit sale requests to RTOs.
                </p>
            </div>

            {/* Trade Certificate Status */}
            <Card className={activeTradeCert ? "border-green-200 bg-green-50/50 dark:bg-green-900/10" : "border-yellow-200 bg-yellow-50/50 dark:bg-yellow-900/10"}>
                <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-full ${activeTradeCert ? "bg-green-100 text-green-600 dark:bg-green-900/30" : "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30"}`}>
                            <FileText className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-sm">Trade Certificate Status</h3>
                            {activeTradeCert ? (
                                <p className="text-xs text-muted-foreground">
                                    Valid until {new Date(activeTradeCert.validTill).toLocaleDateString('en-IN')}
                                </p>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    No active trade certificate found. You cannot register vehicles.
                                </p>
                            )}
                        </div>
                    </div>
                    {activeTradeCert ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">Active</Badge>
                    ) : (
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-200">Required</Badge>
                    )}
                </CardContent>
            </Card>

            {/* Inventory List */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">My Inventory</CardTitle>
                    <CardDescription>Vehicles assigned to your wallet by manufacturers.</CardDescription>
                </CardHeader>
                <CardContent>
                    <DataTable 
                        columns={columns} 
                        data={inventory} 
                        isLoading={inventoryLoading} 
                        emptyMessage="No vehicles in your inventory. Manufacturers assign vehicles to your wallet." 
                    />
                </CardContent>
            </Card>

            {/* Sale Request Modal */}
            <Dialog open={isSaleModalOpen} onOpenChange={setIsSaleModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Submit Sale Request (Registration)</DialogTitle>
                        <DialogDescription>
                            Submit the buyer's details to the RTO for official registration. Once approved by the RTO, the buyer will receive the ownership token.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {!activeTradeCert && (
                            <Alert variant="destructive">
                                <AlertTitle>No Active Trade Certificate</AlertTitle>
                                <AlertDescription>
                                    The RTO will reject this registration because your wallet does not hold an active trade certificate.
                                </AlertDescription>
                            </Alert>
                        )}
                        
                        <div className="space-y-2">
                            <Label htmlFor="buyerWallet">Buyer's Wallet Address</Label>
                            <Input 
                                id="buyerWallet" 
                                placeholder="0x..." 
                                value={buyerWallet} 
                                onChange={(e) => setBuyerWallet(e.target.value)} 
                            />
                            <p className="text-xs text-muted-foreground">Ensure the buyer has completed KYC with this wallet.</p>
                        </div>
                        
                        <div className="space-y-2">
                            <Label htmlFor="rto">Select RTO</Label>
                            <Select value={rtoEntityId} onValueChange={(v) => setRtoEntityId(v || '')}>
                                <SelectTrigger id="rto" disabled={rtosLoading}>
                                    <SelectValue placeholder={rtosLoading ? 'Loading RTOs...' : 'Select RTO Jurisdiction'} />
                                </SelectTrigger>
                                <SelectContent>
                                    {rtos.map((rto) => (
                                        <SelectItem key={rto.id} value={rto.id}>
                                            {rto.name} ({rto.code})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsSaleModalOpen(false)}>Cancel</Button>
                        <Button 
                            onClick={handleCreateSaleRequest} 
                            disabled={saleMutation.isPending || !buyerWallet.startsWith('0x') || buyerWallet.length !== 42 || !rtoEntityId}
                        >
                            {saleMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</> : 'Submit to RTO'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
