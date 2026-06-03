import { HeroSection } from '@/components/landing/HeroSection';
import { PortalsSection } from '@/components/landing/PortalsSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { InstitutionsGrid } from '@/components/landing/InstitutionsGrid';
import { Footer } from '@/components/landing/Footer';

import { ThemeToggle } from '@/components/ThemeToggle';

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
      {/* Premium Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full pointer-events-none -z-10 animate-pulse duration-[10000ms]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/15 blur-[120px] rounded-full pointer-events-none -z-10 animate-pulse duration-[8000ms]" />
      
      <div className="absolute top-6 right-6 z-50">
        <ThemeToggle />
      </div>

      <div className="flex-grow z-10">
        <HeroSection />
        <PortalsSection />
        <FeaturesSection />
        <InstitutionsGrid />
      </div>
      <div className="z-10">
        <Footer />
      </div>
    </main>
  );
}
