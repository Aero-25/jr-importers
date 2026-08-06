/** Domain vocabulary shared by the storefront and the POS console. */

/* ── Catalogue ───────────────────────────────────────────────────────────── */

export const CATEGORIES = [
  'Phones',
  'Tablets',
  'Laptops',
  'Audio',
  'Wearables',
  'TV & Display',
  'Gaming',
  'Accessories',
  'Networking',
  'Storage',
  'Components',
  'Misc',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Groups the storefront's top-level tabs. Order is the order shown. */
export const CATEGORY_GROUPS: Array<{ id: string; label: string; categories: Category[] }> = [
  { id: 'phones', label: 'Phones', categories: ['Phones'] },
  { id: 'computing', label: 'Computing', categories: ['Laptops', 'Tablets', 'Components', 'Storage'] },
  { id: 'audio', label: 'Audio & Wearables', categories: ['Audio', 'Wearables'] },
  { id: 'home', label: 'TV & Gaming', categories: ['TV & Display', 'Gaming'] },
  { id: 'accessories', label: 'Accessories', categories: ['Accessories', 'Networking', 'Misc'] },
];

/* ── Order lifecycle ─────────────────────────────────────────────────────── */

export const ORDER_STATUSES = [
  'Pending',
  'Paid',
  'Processing',
  'Ready for Collection',
  'Dispatched',
  'Delivered',
  'Completed',
  'Cancelled',
  'Refunded',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Statuses that still owe the customer something — the dispatch work queue. */
export const OPEN_ORDER_STATUSES: readonly string[] = [
  'Pending',
  'Paid',
  'Processing',
  'Ready for Collection',
  'Dispatched',
];

export const ORDER_STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warn' | 'danger'> =
  {
    Pending: 'warn',
    Paid: 'success',
    Processing: 'info',
    'Ready for Collection': 'info',
    Dispatched: 'info',
    Delivered: 'success',
    Completed: 'success',
    Cancelled: 'danger',
    Refunded: 'danger',
  };

/* ── Payments ────────────────────────────────────────────────────────────── */

export const PAYMENT_METHODS = [
  'Cash',
  'Card',
  'EFT',
  'DPO Online',
  'Layby',
  'Account',
  'Voucher',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Methods that put physical cash in the till drawer, for shift reconciliation. */
export const CASH_METHODS: readonly string[] = ['Cash'];

export const DELIVERY_METHODS = ['Collection', 'Courier', 'Local Delivery'] as const;

/* ── Documents ───────────────────────────────────────────────────────────── */

export const QUOTE_STATUSES = [
  'draft',
  'sent',
  'accepted',
  'declined',
  'expired',
  'converted',
] as const;

export const LAYBY_STATUSES = ['active', 'completed', 'cancelled'] as const;

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'void'] as const;

export const STOCK_TAKE_STATUSES = ['in_progress', 'completed', 'cancelled'] as const;

/* ── Stock ───────────────────────────────────────────────────────────────── */

export const MOVEMENT_TYPES = [
  'sale',
  'return',
  'grv',
  'adjustment',
  'stock_take',
  'transfer',
  'write_off',
] as const;

export const IMEI_STATUSES = ['available', 'reserved', 'sold', 'returned', 'faulty'] as const;

/* ── Roles ───────────────────────────────────────────────────────────────── */

/** Roles `public.is_admin()` accepts. Keep in step with the SQL function. */
export const ADMIN_ROLES: readonly string[] = ['admin', 'owner', 'manager'];

/** Everyone who may open the console at all; cashiers get a reduced module set. */
export const STAFF_ROLES: readonly string[] = [...ADMIN_ROLES, 'cashier', 'staff'];

/* ── Store ───────────────────────────────────────────────────────────────── */

export const STORE = {
  name: 'JR Importers',
  tagline: 'Namibia’s tech superstore',
  country: 'Namibia',
  city: 'Windhoek',
} as const;

/** How long a checkout holds stock before the reservation lapses. */
export const STOCK_RESERVATION_MINUTES = 30;
