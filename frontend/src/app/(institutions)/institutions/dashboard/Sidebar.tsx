'use client';

import { useUser } from '@/contexts/UserContext';
import { ENTITY_NAV_CONFIG, GLOBAL_B2B_NAV, NavItem } from '@/config/b2b-navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function Sidebar() {
    const { user } = useUser();
    const pathname = usePathname();

    if (!user) return null;

    // Resolve specific entity nav based on user.entityType
    const entityType = user.entityType || 'UNKNOWN';
    const specificNav: NavItem[] = ENTITY_NAV_CONFIG[entityType] || [];

    const NavLinks = ({ items }: { items: NavItem[] }) => (
        <nav className="space-y-1.5">
            {items.map((item) => {
                // Exact match for dashboard, prefix match for nested routes
                const isActive = item.href === '/institutions/dashboard' 
                    ? pathname === item.href 
                    : pathname.startsWith(item.href);
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
        <div className="flex flex-col h-full py-4 px-3 overflow-y-auto">
            {entityType === 'UNKNOWN' && (
                <Alert variant="destructive" className="mb-4">
                    <ShieldAlert className="h-4 w-4" />
                    <AlertDescription>Error resolving Entity Type.</AlertDescription>
                </Alert>
            )}

            <div className="mb-6">
                <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {entityType} Operations
                </h3>
                <NavLinks items={specificNav} />
            </div>

            <div className="mt-auto pt-6 border-t">
                <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Global Admin
                </h3>
                <NavLinks items={GLOBAL_B2B_NAV} />
            </div>
        </div>
    );
}
