import type { TableName } from '@/lib/database.types';
import {
  INVOICE_STATUSES,
  LAYBY_STATUSES,
  PAYMENT_METHODS,
  QUOTE_STATUSES,
  STOCK_TAKE_STATUSES,
} from '@/lib/constants';
import * as resources from '@/data/resources';

export type FieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  | 'money'
  | 'date'
  | 'select'
  | 'lookup'
  | 'textarea'
  | 'checkbox'
  | 'readonly'
  /** An imported record shown as a read-only key/value table. */
  | 'record'
  /** Search-as-you-type customer picker. Fills name, email and customer_id. */
  | 'customer'
  /** Layby instalment history, with a control to take the next payment. */
  | 'payments'
  /** Evidence photographs, uploaded to storage and kept as an array of URLs. */
  | 'photos';

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  /**
   * For `lookup` fields: the table whose names fill the dropdown. The chosen
   * name is stored as plain text, so existing rows keep working unchanged.
   */
  lookup?: 'suppliers' | 'customers';
  /**
   * Derived from the line items, never typed. Shown in the form as a plain
   * figure and skipped on save — the dialog computes and writes it itself.
   */
  computed?: boolean;
  required?: boolean;
  /**
   * For `checkbox` fields: the state a NEW record starts in. Must mirror the
   * column's database default — a pre-ticked box the user never touches is a
   * silent claim (a "tax deductible" that inflates the VAT return, say).
   */
  defaultChecked?: boolean;
  hint?: string;
  /** Show as a table column. Fields without this are edit-only. */
  inList?: boolean;
  align?: 'left' | 'right' | 'center';
  /** Table column hidden on narrow screens. */
  secondary?: boolean;
  /** Full width in the two-column edit form. */
  wide?: boolean;
  /**
   * Columns this control writes besides its own key.
   *
   * The save path builds its payload from `fields`, so a control that sets
   * anything else — the customer picker writing `customer_id` next to the
   * name — would have that value silently dropped. Naming the columns here
   * keeps them.
   */
  extraKeys?: string[];
}

export interface RecordSpec {
  title: string;
  description: string;
  table: TableName;
  resource: { useList: unknown; useCreate: unknown; useUpdate: unknown; useRemove: unknown };
  searchColumns: string[];
  fields: FieldSpec[];
  /** Inbound records the shop writes; staff read and action but do not author. */
  readOnly?: boolean;
  createLabel?: string;
  /**
   * The record carries an `items` jsonb column: the dialog gets a line-item
   * editor (product search, quantities, prices) and computes the money
   * fields from the lines. Prices are VAT-inclusive throughout, so the VAT
   * shown is worked backwards out of the total, same as the till.
   */
  lineItems?: boolean;
  /** The record prints as an A4 document of this kind. */
  pdf?: 'quote' | 'invoice' | 'damage_report';
}

/** What a claim is against. Mirrors the check constraint on the table. */
export const DAMAGE_CLAIM_TYPES = ['warranty', 'insurance', 'supplier'] as const;

/** Where a claim has got to. Mirrors the check constraint on the table. */
export const DAMAGE_CLAIM_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'settled',
] as const;

const money = (key: string, label: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({
  key,
  label,
  type: 'money',
  align: 'right',
  ...extra,
});

/**
 * Declarative module definitions.
 *
 * Everything here is a plain list-and-form over one table. Modules with real
 * domain rules — POS, Orders, Dispatch, Products, Ledger — are hand-written
 * instead, because a generic form cannot express "releasing stock" or
 * "reconciling a till".
 */
export const RECORD_SPECS: Record<string, RecordSpec> = {
  damage_reports: {
    title: 'Damage reports',
    description:
      'Insurance, warranty and supplier claims for damaged or failed stock — with the evidence attached.',
    table: 'damage_reports',
    resource: resources.damageReports,
    searchColumns: ['report_number', 'product_name', 'imei', 'claim_reference', 'customer_name'],
    createLabel: 'New damage report',
    pdf: 'damage_report',
    fields: [
      { key: 'report_number', label: 'Report no.', type: 'readonly', inList: true },
      {
        key: 'claim_type',
        label: 'Claim type',
        type: 'select',
        options: DAMAGE_CLAIM_TYPES,
        required: true,
        inList: true,
        hint: 'warranty — the maker should cover it. insurance — an incident on your policy. supplier — arrived damaged or dead.',
      },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: DAMAGE_CLAIM_STATUSES,
        inList: true,
      },
      {
        key: 'insurer_name',
        label: 'Insurance company',
        type: 'text',
        inList: true,
        hint: 'Who the letter is addressed to, e.g. Sanlam Insurance.',
      },
      { key: 'insurer_contact', label: 'Their contact person', type: 'text' },
      { key: 'insurer_phone', label: 'Their phone', type: 'tel' },
      { key: 'product_name', label: 'Item', type: 'text', required: true, inList: true },
      { key: 'imei', label: 'IMEI / serial', type: 'text', inList: true, secondary: true },
      {
        key: 'purchase_invoice',
        label: 'Purchase invoice',
        type: 'text',
        hint: 'The invoice this item was bought or sold on. An assessor will ask for it.',
      },
      { key: 'incident_date', label: 'Date of incident', type: 'date', inList: true },
      { key: 'reported_date', label: 'Date reported', type: 'date' },
      {
        key: 'customer_name',
        label: 'Customer',
        type: 'customer',
        extraKeys: ['customer_id', 'customer_phone'],
        hint: 'Only if the claim concerns a customer’s handset.',
      },
      { key: 'supplier_name', label: 'Supplier', type: 'lookup', lookup: 'suppliers' },
      {
        key: 'finding',
        label: 'Not repairable due to',
        type: 'text',
        inList: true,
        hint: 'The assessment conclusion, e.g. “water damage”. Reads as “…not repairable due to water damage.”',
      },
      {
        key: 'description',
        label: 'Damage found',
        type: 'textarea',
        required: true,
        wide: true,
        hint: 'The components found damaged. Reads as “It has also been assessed that <this>.”',
      },
      { key: 'cause', label: 'Cause of damage', type: 'textarea', wide: true },
      {
        key: 'discontinued',
        label: 'Model discontinued',
        type: 'checkbox',
        hint: 'Adds the line an assessor looks for when a like-for-like replacement is not possible.',
      },
      { key: 'signed_by', label: 'Signed by', type: 'text', hint: 'Whoever signs the letter.' },
      money('claim_amount', 'Amount claimed', { inList: true }),
      money('settled_amount', 'Amount settled', { secondary: true }),
      { key: 'claim_reference', label: 'Insurer / supplier reference', type: 'text' },
      { key: 'photos', label: 'Photographs', type: 'photos', wide: true },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
  },

  customers: {
    title: 'Customers',
    description: 'Everyone who has bought from you or holds an account.',
    table: 'customers',
    resource: resources.customers,
    searchColumns: ['name', 'email', 'phone', 'city', 'account_code'],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, inList: true },
      { key: 'email', label: 'Email', type: 'email', inList: true },
      { key: 'phone', label: 'Phone', type: 'tel', inList: true },
      { key: 'city', label: 'Town / city', type: 'text', inList: true, secondary: true },
      { key: 'region', label: 'Region', type: 'text' },
      { key: 'address', label: 'Address', type: 'textarea', wide: true },
      {
        key: 'customer_type',
        label: 'Type',
        type: 'select',
        options: ['retail', 'wholesale', 'account'],
        inList: true,
        secondary: true,
      },
      money('credit_limit', 'Credit limit', { hint: 'Used by the debtors ledger.' }),
      { key: 'active', label: 'Active', type: 'checkbox', defaultChecked: true },
      {
        key: 'account_code',
        label: 'IQ account',
        type: 'text',
        inList: true,
        secondary: true,
        hint: 'The account code this customer had in IQ. What they will quote off an old statement.',
      },
      { key: 'opened_date', label: 'Account opened', type: 'date' },
      { key: 'last_invoice_date', label: 'Last invoiced', type: 'date' },
      money('last_invoice_amount', 'Last invoice amount'),
      { key: 'last_payment_date', label: 'Last paid', type: 'date' },
      money('last_payment_amount', 'Last payment amount'),
      {
        key: 'iq_data',
        label: 'IQ record',
        type: 'record',
        wide: true,
        hint: 'Everything IQ held for this account, under IQ own field names. History, not live values — the fields above are what the shop uses.',
      },
    ],
  },

  suppliers: {
    title: 'Suppliers',
    description: 'Who you buy from.',
    table: 'suppliers',
    resource: resources.suppliers,
    searchColumns: ['name', 'company', 'contact_person', 'email', 'account_code'],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, inList: true },
      { key: 'company', label: 'Company', type: 'text', inList: true },
      { key: 'contact_person', label: 'Contact person', type: 'text', inList: true, secondary: true },
      { key: 'email', label: 'Email', type: 'email', inList: true },
      { key: 'phone', label: 'Phone', type: 'tel' },
      { key: 'payment_terms', label: 'Payment terms', type: 'text', hint: 'e.g. 30 days from invoice' },
      { key: 'address', label: 'Address', type: 'textarea', wide: true },
      { key: 'active', label: 'Active', type: 'checkbox', defaultChecked: true },
      {
        key: 'account_code',
        label: 'IQ account',
        type: 'text',
        inList: true,
        secondary: true,
        hint: 'The account code this supplier had in IQ.',
      },
      { key: 'last_invoice_date', label: 'Last invoiced', type: 'date' },
      money('last_invoice_amount', 'Last invoice amount'),
      {
        key: 'iq_data',
        label: 'IQ record',
        type: 'record',
        wide: true,
        hint: 'Everything IQ held for this account, under IQ own field names.',
      },
    ],
  },

  requests: {
    title: 'Special orders',
    description: 'Customers asking you to import something specific.',
    table: 'special_order_requests',
    resource: resources.specialOrders,
    searchColumns: ['requested_product', 'customer_name', 'customer_email', 'customer_phone'],
    fields: [
      { key: 'requested_product', label: 'Requested', type: 'text', required: true, inList: true },
      { key: 'customer_name', label: 'Customer', type: 'text', inList: true },
      { key: 'customer_phone', label: 'Phone', type: 'tel', inList: true, secondary: true },
      { key: 'customer_email', label: 'Email', type: 'email' },
      { key: 'preferred_color_storage', label: 'Colour / storage', type: 'text' },
      money('target_budget', 'Their budget', { inList: true, secondary: true }),
      money('quoted_price', 'Your quote', { inList: true }),
      money('deposit_amount', 'Deposit taken'),
      { key: 'city', label: 'Town', type: 'text' },
      { key: 'needed_by', label: 'Needed by', type: 'date' },
      { key: 'supplier_reference', label: 'Supplier reference', type: 'text' },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: ['New request', 'Quoted', 'Deposit paid', 'Ordered', 'Arrived', 'Closed'],
        inList: true,
      },
      { key: 'admin_notes', label: 'Internal notes', type: 'textarea', wide: true },
    ],
  },

  stock_alerts: {
    title: 'Back-in-stock alerts',
    description: 'People waiting to hear when something lands.',
    table: 'stock_alert_requests',
    resource: resources.stockAlerts,
    searchColumns: ['product_name', 'customer_name', 'customer_phone', 'customer_email'],
    fields: [
      { key: 'product_name', label: 'Product', type: 'text', inList: true },
      { key: 'customer_name', label: 'Customer', type: 'text', inList: true },
      { key: 'customer_phone', label: 'Phone', type: 'tel', inList: true },
      { key: 'customer_email', label: 'Email', type: 'email', secondary: true, inList: true },
      { key: 'preferred_color', label: 'Preferred colour', type: 'text' },
      { key: 'channel', label: 'Contact via', type: 'select', options: ['WhatsApp', 'Email', 'SMS'] },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: ['Waiting', 'Notified', 'Converted', 'Closed'],
        inList: true,
      },
    ],
  },

  quotes: {
    title: 'Quotes',
    description: 'Sales quotations issued to customers.',
    table: 'quotes',
    resource: resources.quotes,
    searchColumns: ['quote_number', 'customer_name', 'customer_email'],
    lineItems: true,
    pdf: 'quote',
    fields: [
      {
        key: 'quote_number',
        label: 'Quote no.',
        type: 'readonly',
        inList: true,
        hint: 'Assigned automatically when the quote is created — numbers run in order.',
      },
      { key: 'customer_name', label: 'Customer', type: 'lookup', lookup: 'customers', required: true, inList: true },
      { key: 'customer_email', label: 'Email', type: 'email' },
      { key: 'customer_phone', label: 'Phone', type: 'tel' },
      money('subtotal_amount', 'Subtotal (excl VAT)', { secondary: true, computed: true }),
      money('vat_amount', 'VAT', { secondary: true, computed: true }),
      money('total_amount', 'Total', { inList: true, computed: true }),
      { key: 'valid_until', label: 'Valid until', type: 'date', inList: true, secondary: true },
      { key: 'status', label: 'Status', type: 'select', options: QUOTE_STATUSES, inList: true },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
  },

  invoices: {
    title: 'Invoices',
    description: 'Issued invoices and their payment state.',
    table: 'invoices',
    resource: resources.invoices,
    searchColumns: ['invoice_number', 'customer_name', 'customer_email', 'po_number'],
    lineItems: true,
    pdf: 'invoice',
    fields: [
      {
        key: 'invoice_number',
        label: 'Invoice no.',
        type: 'readonly',
        inList: true,
        hint: 'Assigned automatically when the invoice is created — numbers run in order.',
      },
      {
        key: 'customer_name',
        label: 'Customer',
        type: 'customer',
        required: true,
        inList: true,
        hint: 'Search by name, IQ account code, phone or email.',
        // The link to the account, which is what lets the printed invoice
        // carry their address and account code rather than a bare name.
        extraKeys: ['customer_id'],
      },
      { key: 'customer_email', label: 'Email', type: 'email', inList: true, secondary: true },
      {
        key: 'po_number',
        label: 'Customer PO number',
        type: 'text',
        inList: true,
        secondary: true,
        hint: 'Their purchase order. Printed on the invoice so their accounts department can match it.',
      },
      money('subtotal_amount', 'Subtotal (excl VAT)', { secondary: true, computed: true }),
      money('vat_amount', 'VAT', { secondary: true, computed: true }),
      money('total_amount', 'Total', { inList: true, computed: true }),
      { key: 'due_date', label: 'Due', type: 'date', inList: true },
      { key: 'status', label: 'Status', type: 'select', options: INVOICE_STATUSES, inList: true },
      {
        key: 'payment_method',
        label: 'Paid by',
        type: 'select',
        options: PAYMENT_METHODS,
        hint: 'How it was settled. Marking an invoice paid puts it on the open shift cash-up; Cash is what the drawer is counted against.',
      },
      {
        key: 'notes',
        label: 'Comment',
        type: 'textarea',
        wide: true,
        hint: 'Prints on the invoice, under the totals.',
      },
    ],
  },

  laybys: {
    title: 'Laybys',
    description: 'Instalment sales and their outstanding balances.',
    table: 'laybys',
    resource: resources.laybys,
    searchColumns: ['layby_number', 'customer_name', 'customer_phone'],
    fields: [
      {
        key: 'layby_number',
        label: 'Layby no.',
        type: 'readonly',
        inList: true,
        hint: 'Assigned automatically — numbers run in order.',
      },
      { key: 'customer_name', label: 'Customer', type: 'lookup', lookup: 'customers', required: true, inList: true },
      { key: 'customer_phone', label: 'Phone', type: 'tel', secondary: true, inList: true },
      money('total_amount', 'Total', { inList: true }),
      money('deposit_amount', 'Deposit'),
      money('paid_amount', 'Paid', { inList: true }),
      money('balance_amount', 'Balance', { inList: true }),
      { key: 'due_date', label: 'Due', type: 'date', secondary: true, inList: true },
      { key: 'status', label: 'Status', type: 'select', options: LAYBY_STATUSES, inList: true },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
      {
        key: 'payments',
        label: 'Instalments',
        type: 'payments',
        wide: true,
        hint: 'Money taken against this layby. Each payment lands on the open shift cash-up as it is recorded.',
      },
    ],
  },

  grvs: {
    title: 'Goods received',
    description: 'Deliveries booked in against supplier invoices.',
    table: 'grvs',
    resource: resources.grvs,
    searchColumns: ['supplier_name', 'supplier_invoice_no', 'po_number'],
    fields: [
      { key: 'supplier_name', label: 'Supplier', type: 'lookup', lookup: 'suppliers', required: true, inList: true },
      { key: 'supplier_invoice_no', label: 'Supplier invoice', type: 'text', inList: true },
      { key: 'po_number', label: 'PO number', type: 'text', secondary: true, inList: true },
      { key: 'invoice_date', label: 'Invoice date', type: 'date', inList: true, secondary: true },
      money('total_amount', 'Total', { inList: true }),
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: ['received', 'checked', 'disputed'],
        inList: true,
      },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
  },

  purchase_orders: {
    title: 'Purchase orders',
    description: 'What you have ordered from suppliers.',
    table: 'purchase_orders',
    resource: resources.purchaseOrders,
    searchColumns: ['supplier_name'],
    fields: [
      { key: 'supplier_name', label: 'Supplier', type: 'lookup', lookup: 'suppliers', required: true, inList: true },
      money('total_amount', 'Total', { inList: true }),
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        // The values the system actually writes: 'draft'/'sent' from the
        // console, 'Receiving'/'Received' stamped by the receiving RPCs.
        // Offering a different vocabulary here left cancelled orders
        // invisible to the GRV screen's outstanding filter and rendered a
        // blank status for orders the server had already moved on.
        options: ['draft', 'sent', 'Receiving', 'Received', 'cancelled'],
        inList: true,
      },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
  },

  stock_takes: {
    title: 'Stock takes',
    description: 'Physical counts and the variances they found.',
    table: 'stock_takes',
    resource: resources.stockTakes,
    searchColumns: ['reference', 'created_by'],
    fields: [
      { key: 'reference', label: 'Reference', type: 'text', required: true, inList: true },
      { key: 'total_items', label: 'Items counted', type: 'number', align: 'right', inList: true },
      { key: 'total_variance', label: 'Variance', type: 'number', align: 'right', inList: true },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: STOCK_TAKE_STATUSES,
        inList: true,
      },
      { key: 'created_by', label: 'Counted by', type: 'text', secondary: true, inList: true },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
  },

  expenses: {
    title: 'Expenses',
    description: 'Money out — rent, transport, wages, consumables.',
    table: 'expenses',
    resource: resources.expenses,
    searchColumns: ['description', 'category', 'supplier_vendor', 'receipt_number'],
    fields: [
      { key: 'description', label: 'Description', type: 'text', required: true, inList: true },
      {
        key: 'category',
        label: 'Category',
        type: 'select',
        options: ['Rent', 'Salaries', 'Transport', 'Utilities', 'Marketing', 'Stock', 'Other'],
        inList: true,
      },
      money('amount', 'Amount', { required: true, inList: true }),
      { key: 'expense_date', label: 'Date', type: 'date', required: true, inList: true },
      { key: 'supplier_vendor', label: 'Paid to', type: 'text', secondary: true, inList: true },
      { key: 'receipt_number', label: 'Receipt no.', type: 'text' },
      {
        key: 'payment_method',
        label: 'Paid by',
        type: 'select',
        options: ['Cash', 'Card', 'EFT', 'Debit order'],
      },
      { key: 'tax_deductible', label: 'Tax deductible', type: 'checkbox' },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
  },

  coupons: {
    title: 'Coupons',
    description: 'Discount codes customers can redeem at checkout.',
    table: 'coupons',
    resource: resources.coupons,
    searchColumns: ['code', 'notes'],
    fields: [
      { key: 'code', label: 'Code', type: 'text', required: true, inList: true },
      {
        key: 'discount_type',
        label: 'Type',
        type: 'select',
        options: ['percentage', 'fixed'],
        inList: true,
      },
      {
        key: 'discount_value',
        label: 'Value',
        type: 'number',
        align: 'right',
        inList: true,
        hint: 'A percentage, or an amount in N$ for fixed coupons.',
      },
      money('min_purchase', 'Minimum spend', { secondary: true }),
      { key: 'max_uses', label: 'Max uses', type: 'number', align: 'right', secondary: true },
      { key: 'times_used', label: 'Used', type: 'readonly', align: 'right', inList: true },
      { key: 'valid_until', label: 'Expires', type: 'date', inList: true },
      { key: 'active', label: 'Active', type: 'checkbox', defaultChecked: true, inList: true },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
  },

  users: {
    title: 'Staff & access',
    description: 'Who can open the console, and what they can reach.',
    table: 'users',
    resource: resources.staffUsers,
    searchColumns: ['full_name', 'email', 'username', 'role'],
    createLabel: 'Add staff record',
    fields: [
      { key: 'full_name', label: 'Name', type: 'text', inList: true },
      { key: 'email', label: 'Email', type: 'email', required: true, inList: true },
      {
        key: 'role',
        label: 'Role',
        type: 'select',
        // Two profiles worth choosing, and the older names kept working so
        // nobody's access changes underneath them.
        options: ['sales', 'admin', 'customer', 'cashier', 'staff', 'manager', 'owner'],
        inList: true,
        hint: 'sales — the till, orders, job cards and customers. admin — all of that plus the money screens, staff and amending a cash-up. customer has no console access at all.',
      },
      { key: 'phone', label: 'Phone', type: 'tel', secondary: true, inList: true },
      { key: 'active', label: 'Active', type: 'checkbox', defaultChecked: true, inList: true },
      { key: 'last_login', label: 'Last seen', type: 'readonly', secondary: true, inList: true },
    ],
  },
};
