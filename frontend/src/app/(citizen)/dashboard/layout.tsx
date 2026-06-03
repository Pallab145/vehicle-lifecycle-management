'use client';

import { RequireB2CAuth } from '@/components/auth/RequireAuth';
import { useCitizenProfile } from '@/hooks/use-citizen';
import { Web3LoginButton } from '@/components/auth/Web3LoginButton';
import { Loader2, Car, ArrowLeftRight, UserCheck, Menu, CreditCard, Recycle, Store } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NotificationProvider } from '@/providers/NotificationProvider';

const navItems = [
  { name: 'My Vehicles', href: '/dashboard', icon: Car },
  { name: 'Transfer Requests', href: '/dashboard/transfers', icon: ArrowLeftRight },
  { name: 'My Challans', href: '/dashboard/challans', icon: CreditCard },
  { name: 'Authorize Scrap', href: '/dashboard/scrap', icon: Recycle },
  { name: 'Dealer Dashboard', href: '/dashboard/dealer', icon: Store },
  { name: 'Profile / KYC', href: '/dashboard/kyc', icon: UserCheck },
];

export default function CitizenDashboardLayout({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useCitizenProfile();
  const pathname = usePathname();
  const router = useRouter();

  const isKycVerified = data?.profile?.isKycVerified;

  // Enforce KYC verification: if not verified, force them to the KYC page
  if (!isLoading && !isKycVerified && pathname !== '/dashboard/kyc') {
    // Only allow them to be on the KYC page
    setTimeout(() => {
        router.replace('/dashboard/kyc');
    }, 0);
  }

  const NavLinks = () => (
    <nav className="space-y-1.5">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.name}
            href={item.href}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all duration-200 group ${
              isActive 
                ? 'bg-primary/10 text-primary font-semibold shadow-inner shadow-primary/5' 
                : 'text-muted-foreground hover:bg-primary/5 hover:text-primary'
            }`}
          >
            <Icon className={`h-4 w-4 ${isActive ? 'text-primary' : 'group-hover:scale-110 transition-transform'}`} />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <RequireB2CAuth>
      <NotificationProvider>
        <div className="flex min-h-screen bg-background relative overflow-hidden">
          {/* Ambient Background Glow */}
          <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] -z-10 pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[100px] -z-10 pointer-events-none" />

          {/* Desktop Sidebar */}
          <div className="hidden md:flex w-64 flex-col border-r border-border/50 bg-background/60 backdrop-blur-xl z-10">
            <div className="flex h-16 items-center border-b border-border/50 bg-background/40 px-6">
              <h2 className="text-lg font-bold bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent">Citizen Portal</h2>
            </div>
            <div className="flex-1 overflow-auto py-4 px-3">
              <NavLinks />
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex flex-1 flex-col overflow-hidden relative z-10">
            
            {/* Topbar */}
            <header className="flex h-16 items-center justify-between border-b border-border/50 bg-background/60 backdrop-blur-md px-4 md:px-6 sticky top-0 z-20">
              <div className="flex items-center gap-4">
                {/* Mobile Sidebar Trigger */}
                <Sheet>
                  <SheetTrigger className="md:hidden p-2 rounded-md hover:bg-muted inline-flex items-center justify-center">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle navigation menu</span>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-64 p-0">
                    <div className="flex h-16 items-center border-b px-6">
                      <h2 className="text-lg font-bold text-primary">Citizen Portal</h2>
                    </div>
                    <div className="py-4 px-3">
                      <NavLinks />
                    </div>
                  </SheetContent>
                </Sheet>
                
                <h2 className="text-lg font-semibold md:hidden bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent">Vehicle Lifecycle</h2>
              </div>

              <div className="flex items-center gap-4">
                <ThemeToggle />
                <Web3LoginButton />
              </div>
            </header>

          {/* Main scrollable content */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {isLoading ? (
                <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                children
            )}
          </main>
        </div>
      </div>
      </NotificationProvider>
    </RequireB2CAuth>
  );
}
