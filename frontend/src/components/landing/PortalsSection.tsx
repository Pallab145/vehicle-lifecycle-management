import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Shield, Car, ArrowLeftRight, FileCheck2, Recycle, Landmark, Factory, ShieldCheck, Wind, ChevronRight } from 'lucide-react';
import { Web3LoginButton } from '@/components/auth/Web3LoginButton';
import { CitizenAadhaarLoginModal } from '@/components/auth/CitizenAadhaarLoginModal';

const entities = [
  { icon: Landmark, name: 'RTO' },
  { icon: Factory, name: 'Manufacturer' },
  { icon: Shield, name: 'Police' },
  { icon: ShieldCheck, name: 'Insurance' },
  { icon: Wind, name: 'PUC Center' },
  { icon: Recycle, name: 'Scrap Center' },
];

export function PortalsSection() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="grid md:grid-cols-2 gap-8">
        {/* Citizen Portal Card */}
        <Card className="relative overflow-hidden border border-border/50 bg-background/50 backdrop-blur-xl hover:border-primary/50 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/20 group hover:-translate-y-2">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-primary/20 via-primary/5 to-transparent rounded-bl-full -z-10 group-hover:scale-125 transition-transform duration-700 blur-[20px]" />
          
          <CardHeader className="relative z-10">
            <div className="w-16 h-16 bg-gradient-to-br from-primary/30 to-primary/10 rounded-2xl flex items-center justify-center mb-4 group-hover:-translate-y-2 group-hover:shadow-xl group-hover:shadow-primary/30 transition-all duration-500 border border-primary/20">
              <Users className="text-primary w-8 h-8 drop-shadow-md" />
            </div>
            <CardTitle className="text-4xl font-extrabold tracking-tight">Citizen Portal</CardTitle>
            <CardDescription className="text-base text-muted-foreground leading-relaxed mt-3">
              Connect your Web3 wallet to manage vehicles, track ownership transfers, pay challans, and view your complete vehicle history on the blockchain.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="relative z-10">
            <div className="flex flex-wrap gap-2 mb-8">
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-colors"><Car className="mr-1.5 h-3.5 w-3.5" /> View Vehicles</Badge>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-colors"><ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" /> Transfers</Badge>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-colors"><FileCheck2 className="mr-1.5 h-3.5 w-3.5" /> Challans</Badge>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-colors"><Recycle className="mr-1.5 h-3.5 w-3.5" /> Scrap Auth</Badge>
            </div>
            <div className="group-hover:-translate-y-1 transition-transform duration-500 flex flex-col gap-4">
              <Web3LoginButton />
              
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/80" />
                </div>
                <div className="relative flex justify-center text-xs uppercase font-semibold tracking-wider">
                  <span className="bg-background px-3 text-muted-foreground/80">
                    Or View Without Wallet
                  </span>
                </div>
              </div>

              <CitizenAadhaarLoginModal />
            </div>
          </CardContent>
        </Card>

        {/* Institutional Portal Card */}
        <Card className="relative overflow-hidden border border-border/50 bg-background/40 backdrop-blur-md hover:border-blue-500/50 transition-all duration-500 hover:shadow-2xl hover:shadow-blue-500/10 group">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-blue-500/15 via-blue-500/5 to-transparent rounded-bl-[100px] -z-10 group-hover:scale-110 transition-transform duration-700" />
          
          <CardHeader className="relative">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500/20 to-blue-500/5 rounded-2xl flex items-center justify-center mb-4 group-hover:-translate-y-1 group-hover:shadow-lg group-hover:shadow-blue-500/20 transition-all duration-300 border border-blue-500/10">
              <Shield className="text-blue-500 w-7 h-7" />
            </div>
            <CardTitle className="text-3xl tracking-tight">Institutional Portal</CardTitle>
            <CardDescription className="text-base text-muted-foreground leading-relaxed mt-2">
              For RTOs, Police, Manufacturers, Insurance, PUC Centers, Banks, and Scrap Centers. Role-based dashboards with multi-sig governance.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="relative">
            <div className="flex flex-wrap gap-2 mb-8">
              {entities.slice(0, 4).map(e => (
                <Badge key={e.name} variant="secondary" className="bg-secondary/50 hover:bg-secondary">
                  <e.icon className="mr-1.5 h-3 w-3 text-blue-500" /> {e.name}
                </Badge>
              ))}
              <Badge variant="secondary" className="bg-secondary/50 hover:bg-secondary">+2 more</Badge>
            </div>
            <Link href="/institutions/login" className="w-full block group-hover:-translate-y-1 transition-transform duration-300">
              <Button variant="outline" className="w-full gap-2 h-11 border-blue-500/20 hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors">
                Enter Institutional Portal <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
