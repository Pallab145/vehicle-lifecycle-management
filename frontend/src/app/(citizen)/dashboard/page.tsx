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
              <Card key={ownership.ownTid} className="flex flex-col relative overflow-hidden bg-background/40 backdrop-blur-md border-border/50 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 transition-all duration-500 group hover:-translate-y-1">
                {/* Decorative background gradient */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/10 via-primary/5 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10" />

                <CardHeader className="pb-3 relative z-10">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent group-hover:from-primary group-hover:to-blue-500 transition-all">
                        {vehicle.make} {vehicle.model}
                      </CardTitle>
                      <CardDescription className="font-mono text-xs mt-1">{vehicle.registrationNumber}</CardDescription>
                    </div>
                    <Badge variant="outline" className={`${statusColor} bg-background/50 backdrop-blur-sm border-current/20 shadow-sm`}>
                      {vehicle.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-4 relative z-10">
                  <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-muted/30 border border-border/30">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1 font-semibold">VIN Hash</span>
                      <span className="font-mono text-xs truncate block text-foreground/80" title={vehicle.vinHash}>{vehicle.vinHash.substring(0, 10)}...</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1 font-semibold">Color</span>
                      <span className="font-medium text-sm capitalize text-foreground/80">{vehicle.color}</span>
                    </div>
                  </div>
                  
                  {isPendingTransfer && (
                    <Alert className="py-2.5 bg-blue-500/10 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 border-blue-500/20 backdrop-blur-sm animate-pulse">
                      <AlertDescription className="text-xs font-medium flex items-center">
                        <ArrowRight className="h-3.5 w-3.5 mr-1.5" /> Transfer Pending
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
                <CardFooter className="pt-0 flex gap-2 relative z-10">
                  <Link href={`/dashboard/vehicles/${ownership.ownTid}`} className="flex-1">
                    <Button variant="default" className="w-full bg-primary/90 hover:bg-primary hover:shadow-lg hover:shadow-primary/20 transition-all duration-300">
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
