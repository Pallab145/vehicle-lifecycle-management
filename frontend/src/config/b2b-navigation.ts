import { 
    LayoutDashboard, 
    Factory, 
    FileSignature, 
    ShieldAlert, 
    ShieldCheck, 
    Wind, 
    Recycle, 
    Landmark, 
    Users, 
    Settings,
    FileCheck2,
    CarFront,
    ArrowLeftRight,
    Search,
    FileText,
    Activity
} from 'lucide-react';

export interface NavItem {
    name: string;
    href: string;
    icon: any; // LucideIcon
}

// Global B2B navigation that all users see regardless of entity type
export const GLOBAL_B2B_NAV: NavItem[] = [
    { name: 'Dashboard', href: '/institutions/dashboard', icon: LayoutDashboard },
    { name: 'Staff Members', href: '/institutions/dashboard/staff', icon: Users },
    { name: 'Settings', href: '/institutions/dashboard/settings', icon: Settings },
];

// Entity-Specific Navigation Mapping
export const ENTITY_NAV_CONFIG: Record<string, NavItem[]> = {
    GOVERNMENT: [
        { name: 'National Overview', href: '/institutions/dashboard/gov', icon: Activity },
        { name: 'Entity Directory', href: '/institutions/dashboard/gov/entities', icon: Search },
        { name: 'System Logs', href: '/institutions/dashboard/gov/logs', icon: FileText },
    ],
    RTO: [
        { name: 'RTO Hub', href: '/institutions/dashboard/rto', icon: Landmark },
        { name: 'Registrations', href: '/institutions/dashboard/rto/registrations', icon: FileSignature },
        { name: 'Transfers', href: '/institutions/dashboard/rto/transfers', icon: ArrowLeftRight },
        { name: 'Trade Certificates', href: '/institutions/dashboard/rto/trade-certs', icon: FileCheck2 },
    ],
    MANUFACTURER: [
        { name: 'Mfg Hub', href: '/institutions/dashboard/mfg', icon: Factory },
        { name: 'Mint Vehicle (DVP)', href: '/institutions/dashboard/mfg/mint', icon: CarFront },
        { name: 'Production History', href: '/institutions/dashboard/mfg/history', icon: FileText },
    ],
    POLICE: [
        { name: 'Police Hub', href: '/institutions/dashboard/police', icon: ShieldAlert },
        { name: 'Issue Challan', href: '/institutions/dashboard/police/challan', icon: FileSignature },
        { name: 'Vehicle Search', href: '/institutions/dashboard/police/search', icon: Search },
    ],
    INSURANCE: [
        { name: 'Insurance Hub', href: '/institutions/dashboard/insurance', icon: ShieldCheck },
        { name: 'Issue Policy', href: '/institutions/dashboard/insurance/policies', icon: FileSignature },
        { name: 'Process Claims', href: '/institutions/dashboard/insurance/claims', icon: Activity },
    ],
    PUC_CENTER: [
        { name: 'PUC Hub', href: '/institutions/dashboard/puc', icon: Wind },
        { name: 'Issue Certificate', href: '/institutions/dashboard/puc/issue', icon: FileCheck2 },
        { name: 'Testing Logs', href: '/institutions/dashboard/puc/logs', icon: FileText },
    ],
    SCRAP_CENTER: [
        { name: 'Scrap Hub', href: '/institutions/dashboard/scrap', icon: Recycle },
        { name: 'Process Scrap', href: '/institutions/dashboard/scrap/process', icon: FileCheck2 },
        { name: 'Dismantling Logs', href: '/institutions/dashboard/scrap/logs', icon: FileText },
    ],
    BANK: [
        { name: 'Bank Hub', href: '/institutions/dashboard/bank', icon: Landmark },
        { name: 'Issue Loan', href: '/institutions/dashboard/bank/loans', icon: FileSignature },
        { name: 'Issue NOC', href: '/institutions/dashboard/bank/noc', icon: FileCheck2 },
    ],
};
