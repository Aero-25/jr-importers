import { expect, test, type Page } from '@playwright/test';

/**
 * An invoice raised at the console is a sale: it shows on Orders under its
 * invoice number, and on the cash up of the shift that took the money.
 *
 * INV12178 is the case that surfaced it — paid, and visible nowhere but the
 * Invoices list. The database now writes an order beside the invoice and
 * stamps the invoice with the shift it was settled in; these cover the
 * screens that read them.
 */

const ORDER = {
  id: 'b1f2c3d4-0000-4000-8000-000000000001',
  invoice_id: 7, invoice_number: 'INV12178',
  user_id: null, customer_name: 'Meritus Brokers cc', customer_email: 'adrimeritus@gmail.com',
  customer_phone: null, customer_city: null, customer_region: null,
  delivery_address: null, delivery_method: null,
  items: [{ product_id: 12, name: 'Samsung Galaxy A16', price: 7400, quantity: 1, line_total: 7400 }],
  subtotal: 7400, subtotal_amount: 6434.78, vat_amount: 965.22, total_amount: 7400,
  payment_method: 'EFT', payments: null, payment_reference: null, dpo_trans_ref: null,
  status: 'Completed', loyalty_discount: 0, coupon_code: null, coupon_discount: null,
  notes: 'Invoice INV12178', stock_reserved: false, reservation_expires_at: null, stock_returned: false,
  courier_company: null, waybill_number: null, date_dispatched: null, picked_up_at: null,
  paid_at: '2026-09-30T09:12:00Z', delivery_notes: null, till_shift_id: null,
  created_at: '2026-09-25T10:00:00Z', updated_at: '2026-09-30T09:12:00Z',
};

const SHIFT = {
  id: 30, till_id: 1, cashier_name: 'JR Importers Admin', status: 'Closed',
  opening_time: '2026-09-30T08:00:00Z', closing_time: '2026-09-30T17:00:00Z',
  total_sales: 1200, petty_cash_total: 0, cash_variance: 0,
  opening_float: 500, opening_denominations: {}, closing_denominations: {},
  actual_cash: 500, expected_cash: 500, counted_card: 1200, card_variance: 0,
  amended_at: null, amended_by: null, amend_reason: null, original_counted: null,
  variance_accepted_by: null, variance_accepted_reason: null,
};

/** Shift 30 rang up N$1,200 on card and took INV12178's N$7,400 by EFT — a sale raised on shift 26. */
const CASH_UP = {
  ok: true, shift_id: 30, till_id: 1, cashier: 'JR Importers Admin', closed_by: 'JR Importers Admin',
  status: 'Closed', opened_at: SHIFT.opening_time, closed_at: SHIFT.closing_time, opening_float: 500,
  cash_sales: 0, card_sales: 1200, eft_sales: 7400, other_sales: 0, total_sales: 1200,
  commission_sales: 0, commission_count: 0, transaction_count: 1,
  invoice_sales: 0, invoice_count: 0, invoice_unpaid: 0, invoice_unpaid_count: 0,
  invoice_paid: 7400, invoice_paid_count: 1, invoice_paid_earlier: 7400, invoice_paid_earlier_count: 1,
  invoices: [{
    id: 7, invoice_number: 'INV12178', doc_type: 'invoice', customer_name: 'Meritus Brokers cc',
    total_amount: 7400, status: 'paid', payment_method: 'EFT',
    raised_here: false, settled_here: true, raised_shift_id: 26, settled_shift_id: 30,
    created_at: '2026-09-25T10:00:00Z', paid_at: '2026-09-30T09:12:00Z',
  }],
  layby_payments: 0, layby_payment_count: 0, petty_cash: 0,
  refunds: 0, cash_refunds: 0, refund_count: 0,
  expected_cash: 500, counted_cash: 500, variance: 0,
  counted_card: 1200, card_variance: 0, card_variance_reason: null, card_variance_by: null,
  float_target: 500, float_retained: 500, float_short: 0, cash_to_bank: 0,
  opening_denominations: {}, closing_denominations: {},
  stock_count: [], stock_lines_off: 0, stock_variance_total: 0, notes: null,
};

/** Amounts render as "N$ 7,400.00" — the space may be non-breaking. */
const amount = (digits: string) => new RegExp(`N\\$\\s*${digits.replace(/[.,]/g, '[.,]')}`);

async function mockShop(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('jr-importers-auth', JSON.stringify({
      access_token: 'test-token', refresh_token: 'test-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'test-admin', email: 'admin@example.com', aud: 'authenticated' },
    }));
  });
  await page.route('**/config.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.JR_CONFIG = { SUPABASE_URL: "https://invoice-test.supabase.co", SUPABASE_ANON_KEY: "test-anon-key" };',
  }));
  await page.route('**/*.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1)!;
    const singular = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    const reply = (rows: Record<string, unknown>[]) => route.fulfill({
      json: singular ? rows[0] ?? null : rows,
      headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` },
    });
    if (url.pathname.endsWith('/rpc/till_cash_up')) return route.fulfill({ json: CASH_UP });
    if (url.pathname.includes('/rpc/')) return route.fulfill({ json: { ok: true } });
    if (table === 'users') return reply([{ id: 'test-admin', role: 'admin', active: true, full_name: 'Test Manager' }]);
    if (table === 'orders') return reply([ORDER]);
    if (table === 'till_shifts') return reply([SHIFT]);
    return reply([]);
  });
}

test('an invoiced sale is on Orders under its number, and is managed from the invoice', async ({ page }) => {
  await mockShop(page);
  await page.goto('/admin/#/orders');

  // Found by the number the customer holds, not an eight-character order id.
  await expect(page.getByText('INV12178', { exact: true })).toBeVisible();
  await expect(page.getByText('Meritus Brokers cc')).toBeVisible();
  await expect(page.getByText(amount('7,400.00'))).toBeVisible();

  await page.getByText('INV12178', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Order INV12178' })).toBeVisible();

  // The invoice is the record. The order cannot be cancelled or re-statused
  // from here — it is sent to the invoice instead, and follows it.
  await expect(page.getByText(/Raised as invoice INV12178/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
  await expect(page.getByLabel('Change order status')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open the invoice' }).click();
  await expect.poll(() => page.url()).toContain('/invoices?open=7');
});

test('the cash up names the invoice and says its money settled an earlier sale', async ({ page }) => {
  await mockShop(page);
  await page.goto('/admin/#/cash-ups');
  await page.getByText('#30', { exact: true }).click();
  await expect(page.getByRole('heading', { name: /Cash up — shift #30/ })).toBeVisible();

  // The tender lines add up to more than the shift's own sales, and the
  // report says why rather than leaving the reader to find the difference.
  await expect(page.getByText(/settled from earlier shifts \(1\)/)).toBeVisible();
  await expect(page.getByText(amount('7,400.00')).first()).toBeVisible();

  // And the document itself is on the page, by number.
  await expect(page.getByText('INV12178', { exact: true })).toBeVisible();
  await expect(page.getByText('Meritus Brokers cc')).toBeVisible();
  await expect(page.getByText(/raised on shift #26/)).toBeVisible();
});
