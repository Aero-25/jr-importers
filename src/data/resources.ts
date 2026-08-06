/**
 * Straightforward tables — list/detail/create/update/remove with no domain
 * rules beyond ordering. Anything with real logic lives in its own module
 * (see products.ts, orders.ts, pos.ts, ledger.ts).
 */
import { createResource } from './crud';

export const suppliers = createResource('suppliers', {
  orderBy: { column: 'name', ascending: true },
});

export const customers = createResource('customers', {
  orderBy: { column: 'created_at', ascending: false },
});

export const coupons = createResource('coupons', {
  orderBy: { column: 'created_at', ascending: false },
});

export const expenses = createResource('expenses', {
  orderBy: { column: 'expense_date', ascending: false },
});

export const invoices = createResource('invoices', {
  orderBy: { column: 'created_at', ascending: false },
});

export const quotes = createResource('quotes', {
  orderBy: { column: 'created_at', ascending: false },
});

export const laybys = createResource('laybys', {
  orderBy: { column: 'created_at', ascending: false },
});

export const purchaseOrders = createResource('purchase_orders', {
  orderBy: { column: 'created_at', ascending: false },
});

export const grvs = createResource('grvs', {
  orderBy: { column: 'created_at', ascending: false },
});

export const stockTakes = createResource('stock_takes', {
  orderBy: { column: 'created_at', ascending: false },
});

export const stockMovements = createResource('stock_movements', {
  orderBy: { column: 'created_at', ascending: false },
  limit: 200,
});

export const serviceCharges = createResource('service_charges', {
  orderBy: { column: 'name', ascending: true },
});

export const heroImages = createResource('hero_images', {
  orderBy: { column: 'order_index', ascending: true },
});

export const messages = createResource('messages', {
  orderBy: { column: 'created_at', ascending: false },
});

export const specialOrders = createResource('special_order_requests', {
  orderBy: { column: 'created_at', ascending: false },
});

export const stockAlerts = createResource('stock_alert_requests', {
  orderBy: { column: 'created_at', ascending: false },
});

export const blockedUsers = createResource('blocked_users', {
  orderBy: { column: 'created_at', ascending: false },
});

export const staffUsers = createResource('users', {
  orderBy: { column: 'created_at', ascending: false },
});

export const tillShifts = createResource('till_shifts', {
  orderBy: { column: 'opening_time', ascending: false },
});

export const productImeis = createResource('product_imeis', {
  orderBy: { column: 'created_at', ascending: false },
});

export const couponUsage = createResource('coupon_usage', {
  orderBy: { column: 'used_at', ascending: false },
});
