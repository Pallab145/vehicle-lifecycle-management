'use client';

import { useVehicleDetail } from '@/hooks/use-citizen';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Car, ShieldCheck, AlertTriangle, FileWarning, ArrowRight, Wallet, History, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InsurancePolicy, PucCertificate, Challan, LoanRecord } from '@/types/citizen';

function VehicleDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Card>
        <CardContent className="p-6 h-[400px]">
          <Skeleton className="h-full w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function VehicleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ownTid = params.ownTid as string;

  const { data, isLoading, error } = useVehicleDetail(ownTid);

  if (isLoading) {
    return <VehicleDetailSkeleton />;
  }

  if (error || !data?.vehicleDetails) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error loading passport</AlertTitle>
          <AlertDescription>
            {error?.message || 'Could not find the vehicle. You may not be the owner.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const ownership = data.vehicleDetails;
  const vehicle = ownership.passport;
  const isPendingTransfer = ownership.transferRequests && ownership.transferRequests.length > 0;
  
  // Badges
  const overallStatusColor = ownership.status === 'ACTIVE' ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20' : 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20';

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="outline" size="icon" onClick={() => router.back()} className="mt-1">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{vehicle.make} {vehicle.model}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded text-sm">
                {vehicle.registrationNumber}
              </span>
              <Badge variant="outline" className={overallStatusColor}>
                {ownership.status}
              </Badge>
              {vehicle.status === 'SCRAPPED' && (
                <Badge variant="destructive">SCRAPPED</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ownership.status === 'ACTIVE' && (
            <Button>
              Initiate Transfer <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {isPendingTransfer && (
        <Alert className="border-blue-200 bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400">
          <ArrowRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertTitle>Transfer Request Pending</AlertTitle>
          <AlertDescription>
            This vehicle is currently locked in a pending transfer. You cannot initiate a new transfer or scrap the vehicle until this is resolved.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="insurance">Insurance & PUC</TabsTrigger>
          <TabsTrigger value="challans">Challans & Loans</TabsTrigger>
        </TabsList>
        
        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Car className="mr-2 h-5 w-5 text-primary" /> Vehicle Specifications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-muted-foreground block">Make</span>
                    <span className="font-medium">{vehicle.make}</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground block">Model</span>
                    <span className="font-medium">{vehicle.model}</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground block">Color</span>
                    <span className="font-medium capitalize">{vehicle.color}</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground block">DVP Token ID</span>
                    <span className="font-mono text-sm bg-muted px-1 rounded">{vehicle.dvpId}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-sm text-muted-foreground block">Cryptographic VIN Hash</span>
                    <span className="font-mono text-xs break-all bg-muted p-2 rounded block mt-1">
                      {vehicle.vinHash}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Wallet className="mr-2 h-5 w-5 text-primary" /> Current Ownership
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-sm text-muted-foreground block mb-1">Owner Wallet Address</span>
                  <span className="font-mono text-sm break-all bg-muted p-2 rounded block">
                    {ownership.ownerWallet}
                  </span>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground block">Ownership Token ID (ownTid)</span>
                  <span className="font-mono text-sm">{ownership.ownTid}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Insurance Tab */}
        <TabsContent value="insurance" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <ShieldCheck className="mr-2 h-5 w-5 text-primary" /> Active Insurance
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ownership.insurancePolicies && ownership.insurancePolicies.length > 0 ? (
                <div className="space-y-4">
                  {ownership.insurancePolicies.map((policy: InsurancePolicy) => (
                    <div key={policy.id} className="flex justify-between items-center p-4 border rounded-lg bg-card">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-lg">₹{Number(policy.coverage).toLocaleString()} Coverage</span>
                          <Badge variant={policy.status === 'ACTIVE' ? 'default' : 'secondary'} className={policy.status === 'ACTIVE' ? 'bg-green-500 hover:bg-green-600' : ''}>
                            {policy.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Valid: {new Date(policy.issueDate).toLocaleDateString()} to {new Date(policy.expiryDate).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Premium</div>
                        <div className="font-medium">₹{Number(policy.premium).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground py-4 text-center border border-dashed rounded-lg">No insurance policies found on record.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <History className="mr-2 h-5 w-5 text-primary" /> PUC Certificates
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ownership.pucCertificates && ownership.pucCertificates.length > 0 ? (
                <div className="space-y-2">
                  {ownership.pucCertificates.map((puc: PucCertificate) => (
                    <div key={puc.id} className="flex justify-between p-3 border rounded bg-card text-sm">
                      <div>
                        <span className="font-medium block">
                          Emissions: CO {puc.co} | HC {puc.hc} | Smoke {puc.smoke}
                        </span>
                        <span className="text-muted-foreground">Valid till: {new Date(puc.expiryDate).toLocaleDateString()}</span>
                      </div>
                      <Badge variant="outline">{puc.status}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground py-4 text-center border border-dashed rounded-lg">No PUC certificates found.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Challans & Loans Tab */}
        <TabsContent value="challans" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center text-destructive">
                <FileWarning className="mr-2 h-5 w-5" /> Traffic Challans
              </CardTitle>
              <CardDescription>Outstanding fines must be cleared before transfer or scrapping.</CardDescription>
            </CardHeader>
            <CardContent>
              {ownership.challans && ownership.challans.length > 0 ? (
                <div className="space-y-3">
                  {ownership.challans.map((challan: Challan) => (
                    <div key={challan.id} className="flex justify-between items-center p-4 border rounded-lg bg-card">
                      <div>
                        <div className="font-medium text-destructive mb-1">₹{Number(challan.amount).toLocaleString()} Fine</div>
                        <div className="text-sm text-muted-foreground">
                          Issued: {new Date(challan.issuedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <Badge variant={challan.status === 'PENDING' ? 'destructive' : 'secondary'}>
                        {challan.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center border border-dashed rounded-lg bg-green-500/5 border-green-500/20">
                  <ShieldCheck className="h-8 w-8 text-green-500 mx-auto mb-2 opacity-50" />
                  <p className="text-green-700 dark:text-green-400 font-medium">No pending challans! Your record is clean.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <AlertTriangle className="mr-2 h-5 w-5 text-primary" /> Active Bank Loans
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ownership.loanRecords && ownership.loanRecords.length > 0 ? (
                <div className="space-y-3">
                  {ownership.loanRecords.map((loan: LoanRecord) => (
                    <div key={loan.id} className="p-4 border rounded-lg bg-card text-sm">
                      <div className="flex justify-between mb-2">
                        <span className="font-medium text-lg">₹{Number(loan.amount).toLocaleString()} Loan</span>
                        <Badge variant="outline">{loan.status}</Badge>
                      </div>
                      <div className="text-muted-foreground">
                        Disbursed: {new Date(loan.disbursedAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground py-4 text-center border border-dashed rounded-lg">No active loans found on this vehicle.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
