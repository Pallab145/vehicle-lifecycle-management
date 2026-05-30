'use client';

import { useState } from 'react';
import { useCitizenProfile, useSubmitKyc, useRtos } from '@/hooks/use-citizen';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function KycPage() {
  const { data: profileData, isLoading: isProfileLoading } = useCitizenProfile();
  const { data: rtosData, isLoading: isRtosLoading } = useRtos();
  const { mutate: submitKyc, isPending } = useSubmitKyc();

  const [documentType, setDocumentType] = useState('AADHAAR');
  const [documentNumber, setDocumentNumber] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [rtoEntityId, setRtoEntityId] = useState('');

  const isVerified = profileData?.profile?.isKycVerified;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitKyc({
      documentType,
      documentNumber,
      name,
      phone,
      email: email || undefined,
      rtoEntityId: rtoEntityId || undefined,
    });
  };

  if (isProfileLoading) {
    return <Loader2 className="h-8 w-8 animate-spin text-primary" />;
  }

  if (isVerified) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <Alert className="border-green-500 bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-400">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          <AlertTitle className="text-lg font-bold">KYC Verified</AlertTitle>
          <AlertDescription>
            Your identity has been verified. You now have full access to the Citizen Dashboard, including vehicle transfers and scrapping.
          </AlertDescription>
        </Alert>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Profile Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-semibold text-muted-foreground block">Name</span>
                {profileData?.profile?.name || 'N/A'}
              </div>
              <div>
                <span className="font-semibold text-muted-foreground block">Wallet Address</span>
                <span className="break-all">{profileData?.profile?.walletAddress}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Action Required</AlertTitle>
        <AlertDescription>
          You must complete your KYC verification to access your vehicles or perform any lifecycle actions.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Complete KYC</CardTitle>
          <CardDescription>
            Submit your identity details securely to verify your account.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name (as per document)</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="documentType">Document Type</Label>
                <Select value={documentType} onValueChange={(val) => setDocumentType(val as string)}>
                  <SelectTrigger id="documentType">
                    <SelectValue placeholder="Select Document" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AADHAAR">Aadhaar</SelectItem>
                    <SelectItem value="DRIVING_LICENSE">Driving License</SelectItem>
                    <SelectItem value="PASSPORT">Passport</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="documentNumber">Document Number</Label>
                <Input id="documentNumber" required value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input id="phone" type="tel" placeholder="+91..." required value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address (Optional)</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rto">Select your RTO</Label>
              <Select value={rtoEntityId} onValueChange={(val) => setRtoEntityId(val as string)}>
                <SelectTrigger id="rto" disabled={isRtosLoading}>
                  <SelectValue placeholder={isRtosLoading ? 'Loading RTOs...' : 'Select RTO Jurisdiction'} />
                </SelectTrigger>
                <SelectContent>
                  {rtosData?.rtos?.map((rto) => (
                    <SelectItem key={rto.id} value={rto.id}>
                      {rto.name} ({rto.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Optional: Choose your local Regional Transport Office for faster processing.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Identity Verification
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
