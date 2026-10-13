import { expect, test, type Page } from '@playwright/test';

/**
 * A document shows the handset it actually sold.
 *
 * The chooser only ever loaded units with status 'available'. Once a sale
 * went through, its handset was sold and so vanished from the picker — while
 * the one still on the shelf sat there greyed out beside it. Reopening
 * INV12191 after its IMEI was corrected showed the old number and not the
 * new one, which reads exactly like the correction never happened.
 */

const SOLD = '356322910409323';
const ON_SHELF = '356322910400868';

const INVOICE = {
  id: 9101,
  invoice_number: 'INV12191',
  customer_name: 'Namib Mills (PTY) LTD',
  customer_email: 'wwalters@namibmills.com.na',
  doc_type: 'invoice',
  status: 'paid',
  payment_method: 'EFT',
  po_number: 'PO68783',
  subtotal_amount: 3088.8,
  vat_amount: 463.32,
  total_amount: 3552.12,
  charge_vat: true,
  created_at: '2026-10-06T09:00:00Z',
  items: [
    {
      sku: 'SAM-A05S-128',
      imei: SOLD,
      imeis: [SOLD],
      name: 'Samsung Galaxy A05s 128GB',
      color: 'Black',
      price: 3552.12,
      quantity: 1,
      cost_price: 2200,
      line_total: 3552.12,
      product_id: 7,
    },
  ],
};

async function mockShop(page: Page) {
  const unitQueries: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('jr-importers-auth', JSON.stringify({
      access_token: 'test-token', refresh_token: 'test-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'test-admin', email: 'admin@example.com', aud: 'authenticated' },
    }));
  });
  await page.route('**/config.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.JR_CONFIG = { SUPABASE_URL: "https://imei-test.supabase.co", SUPABASE_ANON_KEY: "test-anon-key" };',
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

    if (table === 'product_imeis') {
      unitQueries.push(url.search);
      // The shelf holds the other handset; the sold one is only returned
      // because the document asked for it by number.
      const rows: Record<string, unknown>[] = [
        { product_id: 7, imei: ON_SHELF, color: 'Black', serial_number: null },
      ];
      if (url.search.includes(SOLD)) {
        rows.push({ product_id: 7, imei: SOLD, color: 'Black', serial_number: null });
      }
      return reply(rows);
    }
    if (table === 'users') return reply([{ id: 'test-admin', role: 'admin', active: true, full_name: 'Test Manager' }]);
    if (table === 'invoices') return reply([INVOICE]);
    if (table === 'products') {
      return reply([{ id: 7, sku: 'SAM-A05S-128', name: 'Samsung Galaxy A05s 128GB', price: 3500, cost_price: 2563, stock: 1, category: 'Smartphones', active: true }]);
    }
    if (url.pathname.includes('/rpc/')) return route.fulfill({ json: { ok: true } });
    return reply([]);
  });
  return { unitQueries };
}

test('the handset on the invoice is the one shown as chosen', async ({ page }) => {
  const { unitQueries } = await mockShop(page);
  await page.goto('/admin/#/invoices?open=9101');

  // The sold handset the invoice names is on screen and marked chosen.
  const sold = page.getByRole('button', { name: new RegExp(SOLD) });
  await expect(sold).toBeVisible();
  await expect(sold).toHaveClass(/border-lime-500/);

  // The one still on the shelf is offered too, but not as the chosen one.
  const shelf = page.getByRole('button', { name: new RegExp(ON_SHELF) });
  await expect(shelf).toBeVisible();
  await expect(shelf).not.toHaveClass(/border-lime-500/);

  await expect(page.getByText('1 of 1 chosen')).toBeVisible();

  // The query asked for the picked handset by number rather than relying on
  // it still being available.
  expect(unitQueries.some((q) => q.includes(SOLD))).toBe(true);
});
