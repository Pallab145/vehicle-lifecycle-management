import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Blocks, ChevronRight, Shield } from 'lucide-react';
import { Web3LoginButton } from '@/components/auth/Web3LoginButton';

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Dynamic Ambient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-blue-600/10 dark:from-primary/30 dark:via-background dark:to-blue-900/20" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/20 blur-[100px] rounded-full pointer-events-none -z-10" />
      <div 
        className="absolute inset-0 opacity-[0.25] dark:opacity-[0.1]" 
        style={{ 
          backgroundImage: 'radial-gradient(circle at 2px 2px, hsl(var(--primary)) 1.5px, transparent 0)', 
          backgroundSize: '40px 40px' 
        }} 
      />
      
      <div className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32 lg:py-40">
        <div className="text-center space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <Badge variant="outline" className="px-4 py-1.5 text-sm font-medium border-primary/30 text-primary bg-primary/10 backdrop-blur-md">
            <Blocks className="mr-1.5 h-3.5 w-3.5" /> 
            Powered by Polygon Blockchain
          </Badge>
          
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground leading-[1.1]">
            Vehicle Lifecycle
            <span className="block mt-2 bg-gradient-to-r from-primary via-blue-500 to-indigo-500 bg-clip-text text-transparent drop-shadow-sm">
              Management System
            </span>
          </h1>
          
          <p className="mx-auto max-w-2xl text-lg sm:text-xl text-muted-foreground leading-relaxed">
            A decentralized platform for secure, transparent vehicle tracking — from manufacture to scrap. 
            Every registration, transfer, challan, and insurance policy lives on-chain.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
            <div className="hover:-translate-y-1 transition-transform duration-300">
              <Web3LoginButton />
            </div>
            <Link href="/institutions/login" className="hover:-translate-y-1 transition-transform duration-300">
              <Button variant="outline" size="lg" className="gap-2 min-w-[220px] bg-background/50 backdrop-blur-md border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-all">
                <Shield className="h-4 w-4" />
                Institutional Portal
                <ChevronRight className="h-4 w-4 opacity-50" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
