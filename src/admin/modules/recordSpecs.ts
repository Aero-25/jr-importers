import type { TableName } from '@/lib/database.types';
import {
  INVOICE_STATUSES,
  LAYBY_STATUSES,
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
  | 'textarea'
  | 'checkbox'
  | 'readonly';

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  required?: boolean;
  hint?: string;
  /** Show as a table column. Fields without this are edit-only. */
  inList?: boolean;
  align?: 'left' | 'right' | 'center';
  /** Table column hidden on narrow screens. */
  secondary?: boolean;
  /** Full width in the two-column edit form. */
  wide?: boolean;
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
}

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
  customers: {
    title: 'Customers',
    description: 'Everyone who has bought from you or holds an account.',
    table: 'customers',
    resource: resources.customers,
    searchColumns: ['name', 'email', 'phone', 'city'],
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
      { key: 'active', label: 'Active', type: 'checkbox' },
    ],
  },

  suppliers: {
    title: 'Suppliers',
    description: 'Who you buy from.',
    table: 'suppliers',
    resource: resources.suppliers,
    searchColumns: ['name', 'company', 'contact_person', 'email'],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, inList: true },
      { key: 'company', label: 'Company', type: 'text', inList: true },
      { key: 'contact_person', label: 'Contact person', type: 'text', inList: true, secondary: true },
      { key: 'email', label: 'Email', type: 'email', inList: true },
      { key: 'phone', label: 'Phone', type: 'tel' },
      { key: 'payment_terms', label: 'Payment terms', type: 'text', hint: 'e.g. 30 days from invoice' },
      { key: 'address', label: 'Address', type: 'textarea', wide: true },
      { key: 'active', label: 'Active', type: 'checkbox' },
    ],
  },

  messages: {
    title: 'Messages',
    description: 'Enquiries sent from the shop’s contact form.',
    table: 'messages',
    resource: resources.messages,
    searchColumns: ['name', 'email', 'message'],
    readOnly: true,
    fields: [
      { key: 'created_at', label: 'Received', type: 'readonly', inList: true, secondary: true },
      { key: 'name', label: 'From', type: 'readonly', inList: true },
      { key: 'email', label: 'Email', type: 'readonly', inList: true },
      { key: 'message', label: 'Message', type: 'readonly', inList: true, wide: true },
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
    fields: [
      { key: 'quote_number', label: 'Quote no.', type: 'text', inList: true },
      { key: 'customer_name', label: 'Customer', type: 'text', required: true, inList: true },
      { key: 'customer_email', label: 'Email', type: 'email' },
      { key: 'customer_phone', label: 'Phone', type: 'tel' },
      money('subtotal_amount', 'Subtotal', { secondary: true }),
      money('vat_amount', 'VAT', { secondary: true }),
      money('total_amount', 'Total', { inList: true }),
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
    searchColumns: ['customer_name', 'customer_email'],
    fields: [
      { key: 'customer_name', label: 'Customer', type: 'text', required: true, inList: true },
      { key: 'customer_email', label: 'Email', type: 'email', inList: true, secondary: true },
      money('subtotal_amount', 'Subtotal', { secondary: true }),
      money('vat_amount', 'VAT', { secondary: true }),
      money('total_amount', 'Total', { inList: true }),
      { key: 'due_date', label: 'Due', type: 'date', inList: true },
      { key: 'status', label: 'Status', type: 'select', options: INVOICE_STATUSES, inList: true },
    ],
  },

  laybys: {
    title: 'Laybys',
    description: 'Instalment sales and their outstanding balances.',
    table: 'laybys',
    resource: resources.laybys,
    searchColumns: ['layby_number', 'customer_name', 'customer_phone'],
    fields: [
      { key: 'layby_number', label: 'Layby no.', type: 'text', inList: true },
      { key: 'customer_name', label: 'Customer', type: 'text', required: true, inList: true },
      { key: 'customer_phone', label: 'Phone', type: 'tel', secondary: true, inList: true },
      money('total_amount', 'Total', { inList: true }),
      money('deposit_amount', 'Deposit'),
      money('paid_amount', 'Paid', { inList: true }),
      money('balance_amount', 'Balance', { inList: true }),
      { key: 'due_date', label: 'Due', type: 'date', secondary: true, inList: true },
      { key: 'status', label: 'Status', type: 'select', options: LAYBY_STATUSES, inList: true },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
  },

  grvs: {
    title: 'Goods received',
    description: 'Deliveries booked in against supplier invoices.',
    table: 'grvs',
    resource: resources.grvs,
    searchColumns: ['supplier_name', 'supplier_invoice_no', 'po_number'],
    fields: [
      { key: 'supplier_name', label: 'Supplier', type: 'text', required: true, inList: true },
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
      { key: 'supplier_name', label: 'Supplier', type: 'text', required: true, inList: true },
      money('total_amount', 'Total', { inList: true }),
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: ['draft', 'sent', 'partially_received', 'received', 'cancelled'],
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
      { key: 'active', label: 'Active', type: 'checkbox', inList: true },
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
        options: ['customer', 'cashier', 'staff', 'manager', 'admin', 'owner'],
        inList: true,
        hint: 'manager, admin and owner pass the is_admin() check.',
      },
      { key: 'phone', label: 'Phone', type: 'tel', secondary: true, inList: true },
      { key: 'active', label: 'Active', type: 'checkbox', inList: true },
      { key: 'last_login', label: 'Last seen', type: 'readonly', secondary: true, inList: true },
    ],
  },
};
