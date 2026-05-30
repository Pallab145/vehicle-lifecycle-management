import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Web3LoginButton } from '@/components/auth/Web3LoginButton';
import { Button } from '@/components/ui/button';
import { Shield, Users } from 'lucide-react';

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center bg-muted/40 p-6 min-h-screen">
      <div className="w-full max-w-4xl text-center space-y-8 mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl text-foreground">
          Vehicle Lifecycle Management
        </h1>
        <p className="text-xl text-muted-foreground">
          Secure, transparent, and decentralized vehicle tracking on the blockchain.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 w-full max-w-4xl">
        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader>
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Users className="text-primary w-6 h-6" />
            </div>
            <CardTitle>Citizen Portal</CardTitle>
            <CardDescription>
              For vehicle owners. Connect your Web3 wallet to manage your vehicles, transfer ownership, and view history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Web3LoginButton />
          </CardContent>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader>
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Shield className="text-primary w-6 h-6" />
            </div>
            <CardTitle>Institutional Portal</CardTitle>
            <CardDescription>
              For RTOs, Police, Manufacturers, and other authorized entities managing the lifecycle network.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/institutions/login" className="w-full block">
              <Button variant="outline" className="w-full">
                Enter Institutional Portal
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
