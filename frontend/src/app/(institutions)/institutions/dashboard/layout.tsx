'use client';

import { RequireB2BAuth } from '@/components/auth/RequireAuth';
import { NotificationProvider } from '@/providers/NotificationProvider';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Sidebar } from './Sidebar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu, LogOut, User } from 'lucide-react';
import { useUser } from '@/contexts/UserContext';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function InstitutionDashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useUser();

  return (
    <RequireB2BAuth>
      <NotificationProvider>
        <div className="flex min-h-screen bg-background relative overflow-hidden">
          {/* Ambient Background Glow */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] -z-10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[100px] -z-10 pointer-events-none" />

          {/* Desktop Sidebar (Glass) */}
          <div className="w-64 border-r border-border/50 bg-background/60 backdrop-blur-xl hidden md:block z-10">
            <div className="h-16 flex items-center border-b border-border/50 px-6 bg-background/40">
              <h2 className="text-lg font-bold bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent">Institution Portal</h2>
            </div>
            <Sidebar />
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden relative z-10">
            <header className="h-16 border-b border-border/50 bg-background/60 backdrop-blur-md flex items-center justify-between px-4 md:px-6 sticky top-0 z-20">
              <div className="flex items-center gap-4">
                {/* Mobile Sidebar Trigger */}
                <Sheet>
                  <SheetTrigger className="md:hidden p-2 rounded-md hover:bg-muted inline-flex items-center justify-center">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle navigation menu</span>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-64 p-0">
                    <div className="flex h-16 items-center border-b px-6">
                      <h2 className="text-lg font-bold text-primary">Institution Portal</h2>
                    </div>
                    <Sidebar />
                  </SheetContent>
                </Sheet>
                <h2 className="text-lg font-semibold md:hidden">Portal</h2>
              </div>

              <div className="ml-auto flex items-center gap-4">
                <ThemeToggle />
                {/* Profile Dropdown */}
                {user && (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="outline" className="flex items-center gap-2 focus:outline-none" />}>
                        <User className="h-4 w-4" />
                        <span className="hidden sm:inline-block">{user.email || 'Staff Profile'}</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>
                          <div className="flex flex-col space-y-1">
                            <p className="text-sm font-medium leading-none">{user.email}</p>
                            <p className="text-xs leading-none text-muted-foreground">{user.role} | {user.entityType}</p>
                          </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => logout()} className="text-destructive cursor-pointer">
                          <LogOut className="mr-2 h-4 w-4" />
                          <span>Log out</span>
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </header>

            <main className="flex-1 p-4 md:p-6 overflow-y-auto">
              {children}
            </main>
          </div>
        </div>
      </NotificationProvider>
    </RequireB2BAuth>
  );
}
