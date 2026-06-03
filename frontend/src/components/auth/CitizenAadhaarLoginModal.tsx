'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/UserContext';
import { authApi } from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ShieldCheck, Car } from 'lucide-react';
import { toast } from 'sonner';

export function CitizenAadhaarLoginModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [vehicleId, setVehicleId] = useState('');
    const [documentNumber, setDocumentNumber] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    const router = useRouter();
    const { refetchUser } = useUser();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!vehicleId || !documentNumber) {
            toast.error('Please fill in all fields');
            return;
        }

        setIsLoading(true);
        try {
            await authApi.loginCitizenAadhaar(vehicleId, documentNumber);
            await refetchUser();
            toast.success('Successfully authenticated');
            setIsOpen(false);
            router.push('/dashboard');
        } catch (error: any) {
            console.error('Aadhaar login error:', error);
            toast.error(error.message || 'Authentication failed. Please check your details.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <Button 
                variant="outline" 
                className="w-full gap-2 h-11 border-primary/30 hover:border-primary/60 hover:bg-primary/10 transition-colors text-primary font-semibold shadow-sm" 
                onClick={() => setIsOpen(true)}
            >
                <ShieldCheck className="w-5 h-5" />
                View with Aadhaar / Gov ID
            </Button>
            
            <Dialog open={isOpen} onOpenChange={setIsOpen}>

            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-primary" />
                        Verify Vehicle Ownership
                    </DialogTitle>
                    <DialogDescription>
                        Enter your Vehicle ID and Aadhaar / Gov ID to view your vehicle details securely without a Web3 wallet.
                    </DialogDescription>
                </DialogHeader>
                
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    <div className="space-y-2">
                        <Label htmlFor="vehicleId">Vehicle ID (Token ID)</Label>
                        <div className="relative">
                            <Car className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input 
                                id="vehicleId"
                                placeholder="e.g. 1" 
                                className="pl-9"
                                value={vehicleId}
                                onChange={(e) => setVehicleId(e.target.value)}
                            />
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <Label htmlFor="documentNumber">Aadhaar / Gov ID</Label>
                        <div className="relative">
                            <ShieldCheck className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input 
                                id="documentNumber"
                                type="password"
                                placeholder="Enter your ID number" 
                                className="pl-9"
                                value={documentNumber}
                                onChange={(e) => setDocumentNumber(e.target.value)}
                            />
                        </div>
                    </div>

                    <Button type="submit" className="w-full mt-2" disabled={isLoading}>
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Verifying...
                            </>
                        ) : (
                            'Verify & View Vehicle'
                        )}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
        </>
    );
}
