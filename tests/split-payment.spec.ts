import { expect, test, type Page } from '@playwright/test';

/**
 * A sale paid more than one way.
 *
 * Part cash, the rest on card is the usual shape. The sale must carry each
 * tender — that is what the cash-up counts the drawer against — and be
 * booked under a readable summary rather than whichever method the cashier
 * happened to press.
 */

const shift = {
  id: 41, till_id: 1, cashier_name: 'Test Cashier', status: 'Open', opening_float: 500,
  opening_time: '2026-09-22T08:00:00Z', closing_time: null, opening_denominations: { '100': 5 },
};
const product = {
  id: 8, name: 'Samsung Galaxy A56 5G 128GB', sku: 'SAM-A56-128', barcode: null, brand: 'Samsung',
  category: 'Accessories', price: 4900, cost_price: 1000, stock: 3, color: 'Black', active: true, show_online: true,
  image: null, description: null, reorder_level: 1,
};

async function mockTill(page: Page) {
  const orders: Record<string, unknown>[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('jr-importers-auth', JSON.stringify({
      access_token: 'test-token', refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'test-staff', email: 'staff@example.com', aud: 'authenticated' },
    }));
  });
  await page.route('**/config.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.JR_CONFIG = { SUPABASE_URL: "https://split-test.supabase.co", SUPABASE_ANON_KEY: "test-anon-key" };',
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
    if (url.pathname.includes('/rpc/reserve_order_stock')) return route.fulfill({ json: { ok: true } });
    if (url.pathname.includes('/rpc/')) return route.fulfill({ json: { ok: true } });
    if (table === 'users') return reply([{ id: 'test-staff', role: 'sales', active: true, full_name: 'Test Cashier' }]);
    if (table === 'till_shifts') return reply([shift]);
    // The exact barcode/SKU lookup carries `sku.eq.`; the mock answers it
    // only for the real SKU, so a name search still shows the grid.
    if (table === 'products') {
      const q = decodeURIComponent(url.search);
      const exact = q.includes('sku.eq.');
      return reply(exact ? (q.includes('SAM-A56-128') ? [product] : []) : [product]);
    }
    if (table === 'orders' && request.method() === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      orders.push(body);
      const row = { id: 'order-1', ...body };
      return route.fulfill({ status: 201, json: singular ? row : [row] });
    }
    return reply([]);
  });
  return { orders };
}

test('a sale can be paid part cash, part card, and carries both tenders', async ({ page }) => {
  const { orders } = await mockTill(page);
  await page.goto('/admin/#/pos');
  await page.getByPlaceholder('Barcode, SKU, or product name…').fill('A56');
  await page.getByRole('button', { name: /Samsung Galaxy A56/ }).first().click();
  await page.getByRole('button', { name: /^Pay / }).click();

  await page.getByRole('button', { name: /Walk-in/ }).click();
  await page.getByRole('button', { name: 'Split payment — more than one way' }).click();

  // Cannot complete until the tenders add up to the total.
  const complete = page.getByRole('button', { name: 'Complete sale' });
  await expect(complete).toBeDisabled();
  await page.getByLabel('Tender 1 amount').fill('3200');
  await expect(page.getByText(/1.700[.,]00 still to pay/)).toBeVisible();
  await expect(complete).toBeDisabled();
  // "Rest" fills the second line with what is left.
  await page.getByRole('button', { name: 'Rest' }).nth(1).click();
  await expect(page.getByLabel('Tender 2 amount')).toHaveValue('1700');
  await expect(page.getByText('Adds up')).toBeVisible();

  // Change is worked out on the cash part, not the whole sale.
  await page.getByLabel('Cash tendered').fill('3500');
  await expect(page.getByText(/300[.,]00/).last()).toBeVisible();

  await expect(complete).toBeEnabled();
  await complete.click();

  await expect.poll(() => orders.length).toBe(1);
  const sale = orders[0]!;
  expect(sale.payment_method).toBe('Cash 3,200.00 + Card 1,700.00');
  expect(sale.payments).toEqual([{ method: 'Cash', amount: 3200 }, { method: 'Card', amount: 1700 }]);
  expect(sale.total_amount).toBe(4900);
});

test('a sale paid one way carries no breakdown', async ({ page }) => {
  const { orders } = await mockTill(page);
  await page.goto('/admin/#/pos');
  await page.getByPlaceholder('Barcode, SKU, or product name…').fill('A56');
  await page.getByRole('button', { name: /Samsung Galaxy A56/ }).first().click();
  await page.getByRole('button', { name: /^Pay / }).click();
  await page.getByRole('button', { name: /Walk-in/ }).click();
  await page.getByRole('button', { name: 'Card', exact: true }).click();
  await page.getByRole('button', { name: 'Complete sale' }).click();

  await expect.poll(() => orders.length).toBe(1);
  expect(orders[0]!.payment_method).toBe('Card');
  expect(orders[0]!.payments).toBeNull();
});
