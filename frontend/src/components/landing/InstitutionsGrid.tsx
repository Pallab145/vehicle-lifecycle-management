import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Factory, Landmark, Recycle, Shield, ShieldCheck, Wind } from 'lucide-react';

const entities = [
  { 
    icon: Landmark, 
    name: 'RTO', 
    description: 'Vehicle registration & transfers',
    detailText: 'Regional Transport Offices (RTOs) are responsible for minting the initial vehicle registration onto the blockchain. They approve ownership transfer requests and can view the complete, untampered history of any vehicle instantly without cross-referencing state databases.'
  },
  { 
    icon: Factory, 
    name: 'Manufacturer', 
    description: 'Mint Digital Vehicle Passports',
    detailText: 'Manufacturers are the origin point. As soon as a car rolls off the assembly line, the Manufacturer mints a Soulbound Digital Vehicle Passport (DVP) containing the VIN, make, model, and engine details. This guarantees the origin of the vehicle.'
  },
  { 
    icon: Shield, 
    name: 'Police', 
    description: 'Issue & manage challans',
    detailText: 'The Police portal allows traffic authorities to issue on-chain challans (traffic tickets). Since these are tied to the vehicle\'s NFT, a vehicle cannot be sold or transferred until all pending challans are cleared.'
  },
  { 
    icon: ShieldCheck, 
    name: 'Insurance', 
    description: 'Policy issuance & claims',
    detailText: 'Insurance companies can issue and verify policies directly on the blockchain. If a car is totaled in an accident, the insurer flags the vehicle\'s NFT. This completely prevents totaled cars from being fraudulently resold to unsuspecting buyers.'
  },
  { 
    icon: Wind, 
    name: 'PUC Center', 
    description: 'Emission testing & certificates',
    detailText: 'Pollution Under Control (PUC) centers log emission test results on-chain. Valid PUC certificates are automatically verified by smart contracts before permitting certain actions, like ownership transfers or insurance renewals.'
  },
  { 
    icon: Recycle, 
    name: 'Scrap Center', 
    description: 'End-of-life vehicle processing',
    detailText: 'Authorized Scrapyards manage the end-of-life of a vehicle. Once an owner authorizes scrapping, the Scrap Center permanently burns the vehicle\'s token, effectively removing it from circulation and preventing its VIN from being reused on stolen vehicles.'
  },
];

export function InstitutionsGrid() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="text-center mb-16 space-y-4">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Supported Institutions</h2>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Each institution type gets a dedicated dashboard with role-based access control and blockchain integration.
        </p>
      </div>
      
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
        {entities.map((e) => (
          <Dialog key={e.name}>
            <DialogTrigger className="text-left w-full h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl">
              <div 
                className="flex h-full items-start gap-4 p-5 rounded-2xl border border-border/50 bg-background/50 backdrop-blur-xl hover:border-primary/50 hover:bg-background/90 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-2 transition-all duration-300 group cursor-pointer overflow-hidden relative"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="p-3 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 shrink-0 shadow-inner group-hover:scale-110 group-hover:from-primary/40 transition-transform duration-300 relative z-10">
                  <e.icon className="h-6 w-6 text-primary drop-shadow-sm" />
                </div>
                <div className="space-y-1 relative z-10 flex-1">
                  <p className="font-bold text-lg">{e.name}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{e.description}</p>
                  <div className="mt-2 text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                    How it works <span className="text-sm leading-none">&rarr;</span>
                  </div>
                </div>
              </div>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl border-blue-500/30 bg-background/95 backdrop-blur-3xl shadow-2xl shadow-blue-500/20 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-transparent to-primary/5 pointer-events-none" />
              <DialogHeader className="relative z-10 flex flex-col items-center text-center space-y-4 py-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/20 to-primary/10 flex items-center justify-center mb-2 shadow-inner border border-blue-500/20">
                  <e.icon className="h-10 w-10 text-blue-500 drop-shadow-md" />
                </div>
                <DialogTitle className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-primary bg-clip-text text-transparent">
                  {e.name} Portal
                </DialogTitle>
                <DialogDescription className="text-lg pt-4 leading-relaxed text-foreground/80 max-w-xl mx-auto">
                  {e.detailText}
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        ))}
      </div>
    </section>
  );
}
