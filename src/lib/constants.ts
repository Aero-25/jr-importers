/** Domain vocabulary shared by the storefront and the POS console. */

/* ── Catalogue ───────────────────────────────────────────────────────────── */

/**
 * The category values actually present in `products.category`.
 *
 * These must match the database exactly — the storefront's group tabs filter on
 * them with `.in('category', …)`, so an invented value silently returns an
 * empty page. Confirm with:
 *   select distinct category from public.products where active;
 */
export const CATEGORIES = [
  'Smartphones',
  'Tablets',
  'Laptops',
  'Audio',
  'Wearables',
  'Cameras',
  'Drones',
  'Gaming',
  'Smart Home',
  'Car Tech',
  'Accessories',
  'Repairs',
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * The storefront is a phone shop.
 *
 * Only these categories are merchandised. The rest of the catalogue (laptops,
 * audio, drones, cameras, gaming, smart home, car tech, tablets, wearables)
 * still exists in the database and the console — it is simply not on the shop.
 * Widen the shop by adding groups here; nothing else needs to change.
 */
export const SHOP_CATEGORIES: Category[] = ['Smartphones', 'Accessories', 'Repairs'];

/** Groups the storefront's top-level tabs. Order is the order shown. */
export const CATEGORY_GROUPS: Array<{ id: string; label: string; categories: Category[] }> = [
  { id: 'phones', label: 'All phones', categories: ['Smartphones'] },
  { id: 'accessories', label: 'Accessories', categories: ['Accessories'] },
  { id: 'repairs', label: 'Repairs', categories: ['Repairs'] },
];

/** Budget bands. Phone shoppers arrive with a number in mind far more than a brand. */
export const PRICE_BANDS = [
  { id: 'entry', label: 'Under N$4 000', max: 4000 },
  { id: 'mid', label: 'N$4 000 – N$10 000', min: 4000, max: 10000 },
  { id: 'flagship', label: 'N$10 000 and up', min: 10000 },
] as const;

/** Storage tiers offered as a filter; matched against `spec_storage`. */
export const STORAGE_TIERS = ['64GB', '128GB', '256GB', '512GB'] as const;

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
  tagline: 'Namibia’s cellphone specialists',
  country: 'Namibia',
  city: 'Walvis Bay',
  address: 'Pelican Mall, Walvis Bay',
  phone: '+264 81 562 9203',
  email: 'JR.Importers@iway.na',
} as const;

/** How long a checkout holds stock before the reservation lapses. */
export const STOCK_RESERVATION_MINUTES = 30;

/* ── Repair job cards ────────────────────────────────────────────────────── */

export const JOB_CARD_STATUSES = [
  'Awaiting acceptance',
  'Received',
  'Awaiting quote approval',
  'Approved — in repair',
  'Quote declined',
  'Ready for collection',
  'Collected',
  'Returned unrepaired',
] as const;

export const JOB_CARD_STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warn' | 'danger'> =
  {
    'Awaiting acceptance': 'warn',
    Received: 'info',
    'Awaiting quote approval': 'warn',
    'Approved — in repair': 'info',
    'Quote declined': 'danger',
    'Ready for collection': 'success',
    Collected: 'success',
    'Returned unrepaired': 'neutral',
  };

/** The bench checklist printed down the right-hand side of the card. */
export const JOB_CARD_CHECKS = [
  { key: 'lcd', label: 'LCD' },
  { key: 'touch', label: 'Touch' },
  { key: 'ringer', label: 'Ringer' },
  { key: 'volume', label: 'Volume' },
  { key: 'power', label: 'Power' },
  { key: 'charge', label: 'Charge' },
  { key: 'ear_speaker', label: 'Ear spk.' },
  { key: 'mic', label: 'Mic' },
  { key: 'cameras', label: 'Cameras' },
  { key: 'signed', label: 'Signed' },
] as const;

/** Minimum non-refundable handling fee, per the printed terms. */
export const JOB_CARD_HANDLING_FEE = 200;

/** Repairs above this must be confirmed with the customer before work starts. */
export const JOB_CARD_QUOTE_THRESHOLD = 350;

/**
 * The terms as printed on the card. Reproduced verbatim — the guest acceptance
 * page shows exactly what the customer would have signed at the counter, so
 * these must not be paraphrased.
 */
export const JOB_CARD_TERMS: readonly string[] = [
  'A minimum handling fee of N$200 is payable / NON REFUNDABLE.',
  'Whilst all due care is exercised while handsets are in our possession, all handsets handed in for repairs are handed in at the customer’s risk.',
  'All outstanding amounts must be settled prior to release of handset.',
  'All repairs must be collected within 90 days, or the phone will be sold to defray repair costs.',
  'No warranty on any liquid or physical damage repairs.',
  'No phone will be collected without a job card present.',
  'Sim / Memory Cards handed in will be for the risk of the owner.',
  'Any parts that has been replaced will carry a 30 day warranty. KEEP INVOICE. No warranty on software.',
  'Repairs that will cost more than N$ 350-00 will first be confirmed with the customer prior to any repairs being carried out. Repairs costing less than N$ 350-00 will be carried out without prior confirmation sought from the customer.',
  'If found that any software/programmes has been downloaded, the warranty is automatically voided.',
] as const;

export const JOB_CARD_MEMORY_WARNING =
  'WE DO NOT TAKE RESPONSIBILITY FOR ANY MEMORY LOSS ON A PHONE / MEMORY CARD OR SIM CARD.';

export const JOB_CARD_CONSENT =
  'I HEREBY AGREE THAT I HAVE READ AND UNDERSTOOD THE TERMS AND CONDITIONS.';
