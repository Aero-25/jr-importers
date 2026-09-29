import { expect, test, type Page } from '@playwright/test';

/**
 * Commission is earned, not taken over the counter.
 *
 * One property commission is worth more than a month of phones and cables, so
 * totalling it into "Takings" told the shop nothing about how the shop did.
 * It comes out by default, with a tick to put it back.
 */

const SHIFTS = [
  // The commission shift: N$460,287.50 rung up, of which N$454,867.50 is
  // commission and only N$5,420.00 is trade.
  {
    id: 19, till_id: 1, cashier_name: 'JR Importers Admin', status: 'Closed',
    opening_time: '2026-09-15T08:00:00Z', closing_time: '2026-09-15T17:00:00Z',
    total_sales: 460287.5, petty_cash_total: 0, cash_variance: 0,
    opening_float: 500, opening_denominations: {}, closing_denominations: {},
    actual_cash: 500, expected_cash: 500, counted_card: 0, card_variance: 0,
  },
  // An ordinary trading shift, no commission at all.
  {
    id: 27, till_id: 1, cashier_name: 'JR Importers Admin', status: 'Closed',
    opening_time: '2026-09-25T08:05:00Z', closing_time: '2026-09-25T17:00:00Z',
    total_sales: 28945, petty_cash_total: 145, cash_variance: 0,
    opening_float: 450, opening_denominations: {}, closing_denominations: {},
    actual_cash: 4140, expected_cash: 4140, counted_card: 25110, card_variance: 0,
  },
];

/** Amounts render as "N$ 34,365.00" — the space may be non-breaking. */
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
    body: 'window.JR_CONFIG = { SUPABASE_URL: "https://commission-test.supabase.co", SUPABASE_ANON_KEY: "test-anon-key" };',
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
    if (table === 'users') return reply([{ id: 'test-admin', role: 'admin', active: true, full_name: 'Test Manager' }]);
    if (table === 'till_shift_commission') {
      return reply([{ shift_id: 19, commission_sales: 454867.5, commission_count: 6 }]);
    }
    if (table === 'till_shifts') return reply(SHIFTS);
    if (url.pathname.includes('/rpc/')) return route.fulfill({ json: { ok: true } });
    return reply([]);
  });
}

test('takings leave commission out until it is asked for', async ({ page }) => {
  await mockShop(page);
  await page.goto('/admin/#/cash-ups');

  // 460,287.50 + 28,945.00 = 489,232.50 rung up, but only 34,365.00 is trade.
  await expect(page.getByText('Shop takings (closed shifts)')).toBeVisible();
  await expect(page.getByText(amount('34,365.00'))).toBeVisible();
  await expect(page.getByText(/Excludes\s+N\$\s*454[.,]867[.,]50 commission/)).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Sales (excl. commission)' })).toBeVisible();

  // The commission shift shows its trade, with the commission named beneath
  // it rather than silently dropped.
  await expect(page.getByText(amount('5,420.00'))).toBeVisible();
  await expect(page.getByText(/\+\s*N\$\s*454[.,]867[.,]50 commission/)).toBeVisible();

  // Ticking it puts the commission back.
  await page.getByLabel('Include commission earnings').check();
  await expect(page.getByText('Takings (closed shifts)', { exact: true })).toBeVisible();
  await expect(page.getByText(amount('489,232.50'))).toBeVisible();
  await expect(page.getByText(/Includes\s+N\$\s*454[.,]867[.,]50 commission/)).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Sales', exact: true })).toBeVisible();
  await expect(page.getByText(amount('460,287.50'))).toBeVisible();
});

test('a shift without commission reads the same either way', async ({ page }) => {
  await mockShop(page);
  await page.goto('/admin/#/cash-ups');

  await expect(page.getByText(amount('28,945.00'))).toBeVisible();
  await page.getByLabel('Include commission earnings').check();
  await expect(page.getByText(amount('28,945.00'))).toBeVisible();

  // And nothing about the toggle makes a balanced shift look out.
  await expect(page.getByText('Till is short')).toHaveCount(0);
  await expect(page.getByText('balanced').first()).toBeVisible();
});
