import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Blocks, Eye, Lock, Zap } from 'lucide-react';

const features = [
  {
    icon: Blocks,
    title: 'Blockchain-Powered',
    description: 'Every vehicle event is recorded as an immutable transaction on the Polygon Amoy network.',
    detailTitle: 'Why Blockchain?',
    detailText: 'By utilizing Polygon Amoy, a high-speed and low-cost Layer-2 network, our system guarantees that every action—from manufacturing to scrapping—is permanently etched on an immutable public ledger. This completely eliminates the risk of missing paper trails, corrupt central databases, or hidden vehicle histories.',
  },
  {
    icon: Lock,
    title: 'Tamper-Proof Records',
    description: 'Soulbound NFT passports ensure vehicle history cannot be forged, altered, or duplicated.',
    detailTitle: 'What is a Soulbound NFT?',
    detailText: 'When a manufacturer registers a new vehicle, it mints a Digital Vehicle Passport (DVP) as a non-transferable "Soulbound" NFT. The metadata of this NFT tracks the entire lifecycle of the car. It cannot be stolen, deleted, or transferred to another vehicle, making vehicle cloning or VIN swapping practically impossible.',
  },
  {
    icon: Eye,
    title: 'Full Transparency',
    description: 'Citizens, RTOs, police, insurers, and banks share a single source of truth.',
    detailTitle: 'A Single Source of Truth',
    detailText: 'Instead of separate, siloed databases for Police challans, RTO registrations, and Insurance claims, all institutions read from and write to the same smart contracts. When an insurance company marks a car as totaled, the RTO and potential buyers see it instantly. No more information asymmetry.',
  },
  {
    icon: Zap,
    title: 'Real-Time Sync',
    description: 'Server-Sent Events push blockchain state changes to dashboards in real time.',
    detailTitle: 'Instant Updates',
    detailText: 'We bridge the gap between Web3 and Web2 user experiences. Our custom backend indexer listens to blockchain events and pushes them to your browser via Server-Sent Events (SSE). When a transfer is approved on-chain, your dashboard updates immediately without needing to refresh the page.',
  },
];

export function FeaturesSection() {
  return (
    <section className="relative bg-muted/20 border-y border-border/50">
      {/* Decorative gradient blur */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-[100px] -z-10 pointer-events-none" />
      
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center mb-16 space-y-4">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Built for Trust & Transparency</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            A comprehensive Web3 solution managing the entire vehicle lifecycle across 6 smart contracts and 8 institution types.
          </p>
        </div>
        
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f, i) => (
            <Dialog key={f.title}>
              <DialogTrigger className="text-left w-full h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl">
                <Card 
                  className="group relative h-full border-border/50 bg-background/50 backdrop-blur-xl hover:bg-background/90 hover:shadow-2xl hover:shadow-primary/20 hover:-translate-y-2 hover:border-primary/50 transition-all duration-300 overflow-hidden cursor-pointer"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <CardHeader className="pb-3 relative z-10">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center mb-3 shadow-inner group-hover:scale-110 group-hover:from-primary/40 transition-transform duration-300">
                      <f.icon className="h-6 w-6 text-primary drop-shadow-md" />
                    </div>
                    <CardTitle className="text-xl font-bold">{f.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="relative z-10">
                    <p className="text-muted-foreground leading-relaxed">{f.description}</p>
                    <div className="mt-4 text-sm font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      Learn more <span className="text-lg leading-none">&rarr;</span>
                    </div>
                  </CardContent>
                </Card>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl border-blue-500/30 bg-background/95 backdrop-blur-3xl shadow-2xl shadow-blue-500/20 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-transparent to-primary/5 pointer-events-none" />
                <DialogHeader className="relative z-10 flex flex-col items-center text-center space-y-4 py-6">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/20 to-primary/10 flex items-center justify-center mb-2 shadow-inner border border-blue-500/20">
                    <f.icon className="h-10 w-10 text-blue-500 drop-shadow-md" />
                  </div>
                  <DialogTitle className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-primary bg-clip-text text-transparent">
                    {f.detailTitle}
                  </DialogTitle>
                  <DialogDescription className="text-lg pt-4 leading-relaxed text-foreground/80 max-w-xl mx-auto">
                    {f.detailText}
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          ))}
        </div>
      </div>
    </section>
  );
}
