import {
  BadgePercent,
  Banknote,
  BarChart3,
  Bell,
  BellRing,
  Building2,
  ClipboardList,
  FileText,
  Inbox,
  Landmark,
  type LucideIcon,
  Package,
  PackageSearch,
  Receipt,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  Siren,
  PieChart,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  /** Restricts the item to admin/owner/manager. Cashiers see the rest. */
  adminOnly?: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

/**
 * Console navigation.
 *
 * The legacy console had 18 flat tabs, which meant a cashier hunting for the
 * till scanned past Creditors and Stock Takes. Grouping by what someone is
 * actually doing — selling, fulfilling, managing stock, keeping books — keeps
 * each list short enough to scan.
 */
export const NAV: NavSection[] = [
  {
    id: 'sell',
    label: 'Sell',
    items: [
      { id: 'dashboard', label: 'Dashboard', path: '/', icon: BarChart3 },
      { id: 'pos', label: 'POS Terminal', path: '/pos', icon: Store },
      { id: 'cash-ups', label: 'Cash ups', path: '/cash-ups', icon: Banknote },
      { id: 'orders', label: 'Orders', path: '/orders', icon: ShoppingCart },
      { id: 'refunds', label: 'Refunds & returns', path: '/refunds', icon: RotateCcw },
      { id: 'dispatch', label: 'Dispatch', path: '/dispatch', icon: Truck },
    ],
  },
  {
    id: 'repairs',
    label: 'Repairs',
    items: [{ id: 'job-cards', label: 'Job Cards', path: '/job-cards', icon: Wrench }],
  },
  {
    id: 'catalogue',
    label: 'Catalogue & stock',
    items: [
      { id: 'products', label: 'Products', path: '/products', icon: Package },
      { id: 'stock-takes', label: 'Stock takes', path: '/stock-takes', icon: ClipboardList },
      { id: 'grv', label: 'Goods received', path: '/grv', icon: PackageSearch },
      {
        id: 'purchase-orders',
        label: 'Purchase orders',
        path: '/purchase-orders',
        icon: ScrollText,
        adminOnly: true,
      },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      { id: 'customers', label: 'Customers', path: '/customers', icon: Users },
      { id: 'suppliers', label: 'Suppliers', path: '/suppliers', icon: Building2 },
      { id: 'messages', label: 'Messages', path: '/messages', icon: Inbox },
      { id: 'requests', label: 'Special orders', path: '/requests', icon: Bell },
      { id: 'stock-alerts', label: 'Stock alerts', path: '/stock-alerts', icon: BellRing },
    ],
  },
  {
    id: 'documents',
    label: 'Documents',
    items: [
      { id: 'quotes', label: 'Quotes', path: '/quotes', icon: FileText },
      { id: 'invoices', label: 'Invoices', path: '/invoices', icon: Receipt },
      { id: 'laybys', label: 'Laybys', path: '/laybys', icon: Wallet },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    items: [
      { id: 'reports', label: 'Reports', path: '/reports', icon: PieChart, adminOnly: true },
      { id: 'finance', label: 'Finance & VAT', path: '/finance', icon: Landmark, adminOnly: true },
      { id: 'ledger', label: 'Debtors & creditors', path: '/ledger', icon: Landmark, adminOnly: true },
      { id: 'expenses', label: 'Expenses', path: '/expenses', icon: Banknote, adminOnly: true },
      { id: 'coupons', label: 'Coupons', path: '/coupons', icon: BadgePercent, adminOnly: true },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    items: [
      { id: 'staff', label: 'Staff & access', path: '/staff', icon: Users, adminOnly: true },
      { id: 'activity', label: 'Activity log', path: '/activity', icon: ShieldCheck, adminOnly: true },
      { id: 'errors', label: 'Faults', path: '/errors', icon: Siren, adminOnly: true },
      { id: 'settings', label: 'Settings', path: '/settings', icon: Settings, adminOnly: true },
    ],
  },
];

export function visibleSections(isAdmin: boolean): NavSection[] {
  return NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => isAdmin || !item.adminOnly),
  })).filter((section) => section.items.length > 0);
}
