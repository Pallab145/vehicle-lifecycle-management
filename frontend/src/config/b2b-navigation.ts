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
    ArrowLeftRight,
    Search,
    FileText,
    Activity,
    Hammer,
    History,
    FileWarning,
    FileSearch,
    ClipboardCheck,
    Shield,
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
        { name: 'Global Challans', href: '/institutions/dashboard/gov/logs', icon: FileText },
        { name: 'Global Audit Logs', href: '/institutions/dashboard/gov/audit', icon: FileText },
        { name: 'Governance', href: '/institutions/dashboard/gov/admin', icon: ShieldCheck },
    ],
    RTO: [
        { name: 'RTO Hub', href: '/institutions/dashboard/rto', icon: Landmark },
        { name: 'Registrations', href: '/institutions/dashboard/rto/registrations', icon: FileSignature },
        { name: 'Transfers', href: '/institutions/dashboard/rto/transfers', icon: ArrowLeftRight },
        { name: 'Trade Certificates', href: '/institutions/dashboard/rto/trade-certs', icon: FileCheck2 },
    ],
    MANUFACTURER: [
        { name: 'MFG Hub', href: '/institutions/dashboard/mfg', icon: Factory },
        { name: 'Mint Vehicle', href: '/institutions/dashboard/mfg/mint', icon: Hammer },
        { name: 'Production History', href: '/institutions/dashboard/mfg/history', icon: History },
    ],
    POLICE: [
        { name: 'Police Hub', href: '/institutions/dashboard/police', icon: ShieldAlert },
        { name: 'Issue Challan', href: '/institutions/dashboard/police/challan', icon: FileWarning },
        { name: 'Challan Records', href: '/institutions/dashboard/police/search', icon: Search },
    ],
    INSURANCE: [
        { name: 'Insurance Hub', href: '/institutions/dashboard/insurance', icon: ShieldCheck },
        { name: 'Policies', href: '/institutions/dashboard/insurance/policies', icon: FileText },
        { name: 'Claims & Expiry', href: '/institutions/dashboard/insurance/claims', icon: FileSearch },
    ],
    PUC_CENTER: [
        { name: 'PUC Hub', href: '/institutions/dashboard/puc', icon: Wind },
        { name: 'Issue Certificate', href: '/institutions/dashboard/puc/issue', icon: ClipboardCheck },
        { name: 'Testing Logs', href: '/institutions/dashboard/puc/logs', icon: History },
    ],
    SCRAP_CENTER: [
        { name: 'Scrap Hub', href: '/institutions/dashboard/scrap', icon: Recycle },
        { name: 'Process Vehicle', href: '/institutions/dashboard/scrap/process', icon: Search },
        { name: 'Dismantling Logs', href: '/institutions/dashboard/scrap/logs', icon: History },
    ],
    BANK: [
        { name: 'Bank Hub', href: '/institutions/dashboard/bank', icon: Landmark },
        { name: 'Loan Management', href: '/institutions/dashboard/bank/loans', icon: FileText },
        { name: 'NOC & Settlement', href: '/institutions/dashboard/bank/noc', icon: Shield },
    ],
};
