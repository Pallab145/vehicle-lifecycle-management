'use client';

import { RequireB2BAuth } from '@/components/auth/RequireAuth';
import { NotificationProvider } from '@/providers/NotificationProvider';
import { Sidebar } from './Sidebar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu, LogOut, User } from 'lucide-react';
import { useUser } from '@/contexts/UserContext';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function InstitutionDashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useUser();

  return (
    <RequireB2BAuth>
      <NotificationProvider>
        <div className="flex min-h-screen bg-muted/40">
          
          {/* Desktop Sidebar */}
          <div className="w-64 border-r bg-background hidden md:block">
            <div className="h-16 flex items-center border-b px-6">
              <h2 className="text-lg font-bold text-primary">Institution Portal</h2>
            </div>
            <Sidebar />
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <header className="h-16 border-b bg-background flex items-center justify-between px-4 md:px-6 sticky top-0 z-10">
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
                {/* Profile Dropdown */}
                {user && (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="focus:outline-none">
                      <Button variant="outline" className="flex items-center gap-2 pointer-events-none">
                        <User className="h-4 w-4" />
                        <span className="hidden sm:inline-block">{user.email || 'Staff Profile'}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
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
