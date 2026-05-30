'use client';

import { useVehicles } from '@/hooks/use-citizen';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Car, FileText, AlertCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function VehicleSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-1/2 mb-2" />
        <Skeleton className="h-4 w-1/3" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-24" />
      </CardContent>
      <CardFooter>
        <Skeleton className="h-10 w-full" />
      </CardFooter>
    </Card>
  );
}

export default function CitizenDashboardPage() {
  const { data, isLoading, error } = useVehicles(1, 50);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error loading vehicles</AlertTitle>
        <AlertDescription>
          {error.message || 'There was a problem fetching your vehicles. Please try again later.'}
        </AlertDescription>
      </Alert>
    );
  }

  const vehicles = data?.vehicles || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Vehicles</h1>
        <p className="text-muted-foreground">Manage your vehicle passports and ownership records.</p>
      </div>

      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <VehicleSkeleton />
          <VehicleSkeleton />
          <VehicleSkeleton />
        </div>
      ) : vehicles.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
          <Car className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
          <CardTitle className="mb-2">No Vehicles Found</CardTitle>
          <CardDescription className="max-w-md">
            You do not currently have any vehicles registered to your wallet address. If you recently purchased a vehicle, the transfer request may still be pending.
          </CardDescription>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((ownership) => {
            const vehicle = ownership.passport;
            const isPendingTransfer = ownership.transferRequests && ownership.transferRequests.length > 0;
            const statusColor = ownership.status === 'ACTIVE' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500';

            return (
              <Card key={ownership.ownTid} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl">{vehicle.make} {vehicle.model}</CardTitle>
                      <CardDescription>{vehicle.registrationNumber}</CardDescription>
                    </div>
                    <Badge variant="outline" className={statusColor}>
                      {vehicle.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground block">VIN Hash</span>
                      <span className="font-medium truncate block" title={vehicle.vinHash}>{vehicle.vinHash.substring(0, 10)}...</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Color</span>
                      <span className="font-medium capitalize">{vehicle.color}</span>
                    </div>
                  </div>
                  
                  {isPendingTransfer && (
                    <Alert className="py-2 bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                      <AlertDescription className="text-xs flex items-center">
                        <ArrowRight className="h-3 w-3 mr-1" /> Transfer Pending
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
                <CardFooter className="pt-0 flex gap-2">
                  <Link href={`/dashboard/vehicles/${ownership.ownTid}`} className="flex-1">
                    <Button variant="default" className="w-full">
                      <FileText className="mr-2 h-4 w-4" />
                      View Passport
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
