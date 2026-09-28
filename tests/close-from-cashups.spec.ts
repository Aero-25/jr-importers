import { expect, test, type Page } from '@playwright/test';

/**
 * Finishing a shift from the Cash ups screen.
 *
 * Closing the till only ever lived on the POS screen, but the cash up is
 * where people go to read the shift — and an open shift's report claimed
 * the till was short by its whole expected figure, because nothing had been
 * counted yet. Both of those sent the shop looking for a problem that did
 * not exist.
 */

const shift = {
  id: 27, till_id: 1, cashier_name: 'JR Importers Admin', status: 'Open', opening_float: 450,
  opening_time: '2026-09-25T08:05:23Z', closing_time: null, notes: null,
  opening_denominations: { '100': 2, '50': 5 }, closing_denominations: {},
  actual_cash: null, expected_cash: null, cash_variance: null,
  closing_stock_count: null, stock_variance_total: null,
  counted_card: null, card_variance: null, amended_at: null, amended_by: null,
  amend_reason: null, original_counted: null,
};

function cashUp(counted: number, countedCard: number | null, status: string) {
  const expected = 3905;
  const cardSales = 14580;
  return {
    ok: true, shift_id: 27, till_id: 1, cashier: 'JR Importers Admin', status,
    opened_at: shift.opening_time, closed_at: null, opening_float: 450,
    total_sales: 18180, cash_sales: 3600, card_sales: cardSales, eft_sales: 0, other_sales: 0,
    petty_cash: 145, expected_cash: expected, counted_cash: counted,
    variance: Math.round((counted - expected) * 100) / 100,
    counted_card: countedCard,
    card_variance: countedCard === null ? null : Math.round((countedCard - cardSales) * 100) / 100,
    float_target: 500, float_retained: Math.min(counted, 500), float_short: Math.max(500 - counted, 0),
    cash_to_bank: Math.max(counted - Math.min(counted, 500), 0),
    transaction_count: 8, invoice_sales: 0, invoice_count: 0, invoice_unpaid: 0, invoice_unpaid_count: 0,
    layby_payments: 0, layby_payment_count: 0, refunds: 0, cash_refunds: 0, refund_count: 0,
    opening_denominations: shift.opening_denominations, closing_denominations: {},
    stock_count: [], stock_lines_off: 0, stock_variance_total: 0, notes: null,
  };
}

async function mockShop(page: Page) {
  const updates: Record<string, unknown>[] = [];
  const state = { ...shift };
  let counted = 0;
  let countedCard: number | null = null;
  await page.addInitScript(() => {
    localStorage.setItem('jr-importers-auth', JSON.stringify({
      access_token: 'test-token', refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'test-admin', email: 'admin@example.com', aud: 'authenticated' },
    }));
  });
  await page.route('**/config.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.JR_CONFIG = { SUPABASE_URL: "https://cashup-test.supabase.co", SUPABASE_ANON_KEY: "test-anon-key" };',
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
    if (url.pathname.endsWith('/rpc/till_cash_up')) {
      return route.fulfill({ json: cashUp(counted, countedCard, state.status) });
    }
    if (url.pathname.includes('/rpc/')) return route.fulfill({ json: { ok: true } });
    if (table === 'users') return reply([{ id: 'test-admin', role: 'admin', active: true, full_name: 'Test Manager' }]);
    if (table === 'till_shifts' && request.method() === 'PATCH') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      updates.push(body);
      if (typeof body.actual_cash === 'number') counted = body.actual_cash;
      if (typeof body.counted_card === 'number') countedCard = body.counted_card;
      if (typeof body.status === 'string') state.status = body.status;
      return route.fulfill({ json: [{ ...state, ...body }] });
    }
    if (table === 'till_shifts') return reply([state]);
    return reply([]);
  });
  return { updates };
}

test('an open shift is not reported as short before it has been counted', async ({ page }) => {
  await mockShop(page);
  await page.goto('/admin/#/cash-ups');
  await page.getByRole('cell', { name: /JR Importers Admin/ }).first().click();

  await expect(page.getByText('Shift still open — not counted yet')).toBeVisible();
  // The old report shouted a shortfall of the entire expected figure.
  await expect(page.getByText('Till is short')).toHaveCount(0);
  // What it shows instead is what is expected in the drawer so far.
  await expect(page.getByText(/3.905[.,]00/).first()).toBeVisible();
});

test('a shift can be closed from the cash up, through all three counts', async ({ page }) => {
  const { updates } = await mockShop(page);
  await page.goto('/admin/#/cash-ups');
  await page.getByRole('cell', { name: /JR Importers Admin/ }).first().click();

  await page.getByRole('button', { name: 'Close this till' }).click();
  await expect(page.getByRole('heading', { name: 'Close till — count the drawer' })).toBeVisible();

  // 39 x N$100 + 1 x N$5 = 3 905, exactly what the drawer expects.
  await page.getByLabel('Number of N$100 pieces').fill('39');
  await page.getByLabel('Number of N$5 pieces').fill('1');
  await page.getByRole('button', { name: 'Next: the card machine' }).click();

  await expect(page.getByRole('heading', { name: 'Close till — the card machine' })).toBeVisible();
  await page.getByLabel('Card machine total (from the swipe slip)').fill('14580');
  await expect(page.getByText('The machine agrees')).toBeVisible();
  await page.getByRole('button', { name: 'Next: count phones' }).click();

  await page.getByRole('button', { name: 'Close the till' }).click();

  // Two writes land: the counts, then the close. Waiting on the close itself
  // rather than on "any write", or the assertion races the second one.
  await expect.poll(() => updates.some((u) => u.status === 'Closed')).toBe(true);
  const close = updates.find((u) => u.status === 'Closed')!;
  expect(close.cash_variance).toBe(0);
  expect(close.counted_card).toBe(14580);
  expect(close.card_variance).toBe(0);
  expect(close.variance_accepted_reason).toBeNull();
});
