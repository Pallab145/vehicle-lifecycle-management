'use client';

import { useState } from 'react';
import { useGlobalAuditLogs } from '@/hooks/use-b2b';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, Factory, Car, CheckCircle2, FileWarning, Wallet, History, AlertCircle, PiggyBank, FileText, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { TimelineEvent } from '@/types/citizen';

export default function GlobalAuditLogsPage() {
    const [page, setPage] = useState(1);
    const limit = 50;

    const { data, isLoading } = useGlobalAuditLogs({ page, limit });

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Global Audit & Activity Logs</h1>
                <p className="text-muted-foreground">Monitor real-time events and actions across all entities in the decentralized network.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center">
                        <History className="mr-2 h-5 w-5 text-primary" /> Master Network Timeline
                    </CardTitle>
                    <CardDescription>Chronological feed of all actions (Minting, Registrations, Transfers, Fines, Insurance) performed by B2B entities.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                    ) : !data?.data?.length ? (
                        <p className="text-muted-foreground text-center py-8 border border-dashed rounded-lg">No audit events found.</p>
                    ) : (
                        <div className="relative border-l-2 border-muted ml-4 space-y-8 pb-4">
                            {data.data.map((event: any, index: number) => {
                                let Icon = FileText;
                                let color = "bg-primary";
                                let iconColor = "text-white";
                                
                                if (event.type === 'VEHICLE_MINTED' || event.type === 'MANUFACTURED') { Icon = Factory; color = 'bg-blue-500 border-blue-500'; }
                                if (event.type === 'OWNERSHIP_MINTED' || event.type === 'REGISTERED') { Icon = CheckCircle2; color = 'bg-green-500 border-green-500'; }
                                if (event.type === 'TRANSFER_COMPLETED') { Icon = Wallet; color = 'bg-indigo-500 border-indigo-500'; }
                                if (event.type === 'TRANSFER_INITIATED') { Icon = ArrowLeftRight || Wallet; color = 'bg-slate-500 border-slate-500'; }
                                if (event.type === 'CHALLAN_ISSUED') { Icon = FileWarning; color = 'bg-red-500 border-red-500'; }
                                if (event.type === 'CHALLAN_PAID') { Icon = CheckCircle2; color = 'bg-emerald-500 border-emerald-500'; }
                                if (event.type === 'INSURANCE_ISSUED' || event.type === 'PUC_ISSUED') { Icon = ShieldCheck; color = 'bg-teal-500 border-teal-500'; }
                                if (event.type === 'LOAN_DISBURSED') { Icon = PiggyBank; color = 'bg-amber-500 border-amber-500'; }
                                if (event.type === 'SCRAPPED') { Icon = Trash2; color = 'bg-gray-800 border-gray-800'; }

                                return (
                                    <div key={`${event.id}-${index}`} className="relative pl-8">
                                        {/* Icon Node */}
                                        <div className={`absolute -left-[21px] top-1 h-10 w-10 rounded-full border-4 border-background flex items-center justify-center ${color}`}>
                                            <Icon className={`h-4 w-4 ${iconColor}`} />
                                        </div>
                                        
                                        <div className="bg-muted/30 rounded-xl p-4 border border-border/50 hover:bg-muted/50 transition-colors">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
                                                <h3 className="font-semibold text-base">{event.title}</h3>
                                                <time className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                                                    {new Date(event.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </time>
                                            </div>
                                            
                                            <p className="text-sm text-foreground/80 mb-3">{event.description}</p>
                                            
                                            <div className="flex items-center gap-2 text-xs">
                                                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">
                                                    {event.entityType}
                                                </span>
                                                <span className="text-muted-foreground font-medium">
                                                    {event.entityName}
                                                </span>
                                            </div>

                                            {event.metadata && Object.keys(event.metadata).length > 0 && (
                                                <div className="mt-3 bg-background border border-border/50 rounded-lg p-3 text-xs font-mono text-muted-foreground break-all">
                                                    {JSON.stringify(event.metadata)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    
                    {/* Pagination Controls */}
                    {data && data.totalPages > 1 && (
                        <div className="flex items-center justify-between pt-6 mt-6 border-t border-border/50">
                            <div className="text-sm text-muted-foreground">
                                Showing page {data.page} of {data.totalPages} ({data.total} total events)
                            </div>
                            <div className="flex gap-2">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    disabled={page === 1}
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                >
                                    <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                                </Button>
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    disabled={page >= data.totalPages}
                                    onClick={() => setPage(p => p + 1)}
                                >
                                    Next <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
