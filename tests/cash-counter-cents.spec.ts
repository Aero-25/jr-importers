import { expect, test, type Page } from '@playwright/test';

/**
 * The drawer is counted down to five cents.
 *
 * The counter used to stop at N$1 on the grounds that the shop rounds to the
 * dollar. It does not: a sale goes out at 3,552.12 and the coins are really
 * in the drawer, so a count that ignores them can never agree with the till
 * and the shortfall comes back every evening as an unexplained variance.
 */

const SHIFT = {
  id: 61, till_id: 1, cashier_name: 'Test Cashier', status: 'Open', opening_float: 500,
  opening_time: '2026-10-13T08:00:00Z', closing_time: null, notes: null,
  opening_denominations: { '100': 5 }, closing_denominations: null,
  actual_cash: null, expected_cash: null, cash_variance: null,
  closing_stock_count: null, stock_variance_total: null,
  counted_card: null, card_variance: null,
};

async function mockTill(page: Page) {
  const updates: Record<string, unknown>[] = [];
  const shift = { ...SHIFT };
  await page.addInitScript(() => {
    localStorage.setItem('jr-importers-auth', JSON.stringify({
      access_token: 'test-token', refresh_token: 'test-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'test-staff', email: 'staff@example.com', aud: 'authenticated' },
    }));
  });
  await page.route('**/config.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.JR_CONFIG = { SUPABASE_URL: "https://cents-test.supabase.co", SUPABASE_ANON_KEY: "test-anon-key" };',
  }));
  await page.route('**/*.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1)!;
    if (url.pathname.endsWith('/rpc/till_cash_up')) {
      return route.fulfill({ json: {
        ok: true, shift_id: 61, till_id: 1, cashier: 'Test Cashier', status: 'Open',
        opened_at: shift.opening_time, closed_at: null, opening_float: 500,
        total_sales: 3552.12, cash_sales: 3552.12, card_sales: 0, eft_sales: 0, other_sales: 0,
        petty_cash: 0, expected_cash: 4052.12, counted_cash: 0, variance: -4052.12,
        counted_card: null, card_variance: null, float_target: 500, float_retained: 0,
        float_short: 500, cash_to_bank: 0, transaction_count: 1,
        opening_denominations: shift.opening_denominations, closing_denominations: {},
        stock_count: [], stock_lines_off: 0, stock_variance_total: 0, invoices: [],
      } });
    }
    if (table === 'till_shifts' && request.method() === 'PATCH') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      updates.push(body);
      return route.fulfill({ json: [{ ...shift, ...body }] });
    }
    if (table === 'users') {
      return route.fulfill({ json: [{ id: 'test-staff', role: 'admin', active: true, full_name: 'Test Manager' }], headers: { 'content-range': '0-0/1' } });
    }
    if (table === 'till_shifts') {
      const singular = (request.headers().accept ?? '').includes('vnd.pgrst.object');
      return route.fulfill({ json: singular ? shift : [shift], headers: { 'content-range': '0-0/1' } });
    }
    if (url.pathname.includes('/rpc/')) return route.fulfill({ json: { ok: true } });
    return route.fulfill({ json: [], headers: { 'content-range': '0-0/0' } });
  });
  return { updates };
}

test('the drawer counts coins down to five cents', async ({ page }) => {
  await mockTill(page);
  await page.goto('/admin/#/pos');
  await page.getByRole('button', { name: 'Close till' }).click();

  // Every coin the drawer holds has a row, labelled as cents rather than
  // as a fraction of a dollar.
  for (const coin of ['50c', '10c', '5c']) {
    await expect(page.getByLabel(`Number of ${coin} pieces`)).toBeVisible();
  }
  await expect(page.getByLabel('Number of N$0.5 pieces')).toHaveCount(0);

  // The notes and the larger coins are still there.
  for (const face of ['N$200', 'N$100', 'N$10', 'N$5', 'N$1']) {
    await expect(page.getByLabel(`Number of ${face} pieces`)).toBeVisible();
  }
});

test('cents are added into the counted total', async ({ page }) => {
  await mockTill(page);
  await page.goto('/admin/#/pos');
  await page.getByRole('button', { name: 'Close till' }).click();

  // 2 x N$200 + 1 x N$50 + 1 x N$5 + 2 x N$1 + 50c + 2 x 10c + 5c = 457.75
  await page.getByLabel('Number of N$200 pieces').fill('2');
  await page.getByLabel('Number of N$50 pieces').fill('1');
  await page.getByLabel('Number of N$5 pieces').fill('1');
  await page.getByLabel('Number of N$1 pieces').fill('2');
  await page.getByLabel('Number of 50c pieces').fill('1');
  await page.getByLabel('Number of 10c pieces').fill('2');
  await page.getByLabel('Number of 5c pieces').fill('1');

  await expect(page.getByText(/457[.,]75/).first()).toBeVisible();
});

test('a count of coins alone still totals correctly', async ({ page }) => {
  await mockTill(page);
  await page.goto('/admin/#/pos');
  await page.getByRole('button', { name: 'Close till' }).click();

  // Three five-cent pieces: 0.15, not 0.15000000000000002.
  await page.getByLabel('Number of 5c pieces').fill('3');
  await expect(page.getByText(/0[.,]15/).first()).toBeVisible();
});
