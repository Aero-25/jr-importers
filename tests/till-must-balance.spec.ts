import { expect, test, type Page } from '@playwright/test';

/**
 * A till cannot be closed on a drawer that does not balance.
 *
 * The database refuses the close outright (see the migration); this covers
 * the screen in front of it — the cashier is shown what is short, the shift
 * is left open with the count saved, and only a manager with a written
 * reason can close it anyway.
 */

const SHIFT = {
  id: 41, till_id: 1, cashier_name: 'Test Cashier', status: 'Open', opening_float: 500,
  opening_time: '2026-09-12T08:00:00Z', closing_time: null, notes: null,
  opening_denominations: { '100': 5 }, closing_denominations: null,
  actual_cash: null, expected_cash: null, cash_variance: null,
  closing_stock_count: null, stock_variance_total: null,
};

/** What `till_cash_up` says once the count is saved. Expected 1 500, counted 1 420. */
function cashUp(shift: typeof SHIFT, counted: number) {
  const expected = 1500;
  return {
    ok: true, shift_id: 41, till_id: 1, cashier: 'Test Cashier', status: 'Open',
    opened_at: shift.opening_time, closed_at: null, opening_float: 500,
    total_sales: 1000, cash_sales: 1000, card_sales: 0, eft_sales: 0, other_sales: 0,
    petty_cash: 0, expected_cash: expected, counted_cash: counted,
    variance: Math.round((counted - expected) * 100) / 100,
    float_target: 500, float_retained: 500, float_short: 0, cash_to_bank: counted - 500,
    transaction_count: 3, opening_denominations: shift.opening_denominations,
    closing_denominations: {}, stock_count: [], stock_variance_total: 0,
  };
}

async function mockTill(page: Page, role: 'cashier' | 'admin') {
  const updates: Record<string, unknown>[] = [];
  // Per test: the manager test closes it, and the next test needs it open.
  const shift = { ...SHIFT };
  let counted = 0;
  await page.addInitScript(() => {
    localStorage.setItem('jr-importers-auth', JSON.stringify({
      access_token: 'test-token', refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'test-staff', email: 'staff@example.com', aud: 'authenticated' },
    }));
  });
  await page.route('**/config.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.JR_CONFIG = { SUPABASE_URL: "https://till-test.supabase.co", SUPABASE_ANON_KEY: "test-anon-key" };',
  }));
  await page.route('**/*.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1)!;

    if (url.pathname.endsWith('/rpc/till_cash_up')) {
      await route.fulfill({ json: cashUp(shift, counted) });
      return;
    }
    if (table === 'till_shifts' && request.method() === 'PATCH') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      updates.push(body);
      if (typeof body.actual_cash === 'number') counted = body.actual_cash;
      if (body.status === 'Closed') shift.status = 'Closed';
      await route.fulfill({ json: [{ ...shift, ...body }] });
      return;
    }
    if (table === 'users') {
      await route.fulfill({ json: [{ id: 'test-staff', role, active: true, full_name: role === 'admin' ? 'Test Manager' : 'Test Cashier' }] });
      return;
    }
    if (table === 'till_shifts') {
      const singular = (request.headers().accept ?? '').includes('vnd.pgrst.object');
      const rows = shift.status === 'Open' ? [shift] : [];
      await route.fulfill({ json: singular ? rows[0] ?? null : rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
      return;
    }
    await route.fulfill({ json: [], headers: { 'content-range': '0-0/0' } });
  });
  return { updates };
}

async function countShortDrawer(page: Page) {
  await page.goto('/admin/#/pos');
  await page.getByRole('button', { name: 'Close till' }).click();
  // 14 × N$100 + 1 × N$20 = 1 420 against an expected 1 500.
  await page.getByLabel('Number of N$100 pieces').fill('14');
  await page.getByLabel('Number of N$20 pieces').fill('1');
  await page.getByRole('button', { name: 'Next: count phones' }).click();
  await page.getByRole('button', { name: 'Close the till' }).click();
}

test('a cashier cannot close a short drawer; the shift stays open with the count saved', async ({ page }) => {
  const { updates } = await mockTill(page, 'cashier');
  await countShortDrawer(page);

  await expect(page.getByRole('heading', { name: 'The drawer does not balance' })).toBeVisible();
  await expect(page.getByText(/80[.,]00 short/)).toBeVisible();
  await expect(page.getByText('a manager has to sign the difference off')).toBeVisible();
  // No way to force it through as a cashier.
  await expect(page.getByRole('button', { name: 'Accept the difference and close' })).toHaveCount(0);

  // The count was saved; nothing set the shift to Closed.
  expect(updates.some((u) => u.actual_cash === 1420)).toBe(true);
  expect(updates.some((u) => u.status === 'Closed')).toBe(false);

  // Back to the drawer keeps what was typed.
  await page.getByRole('button', { name: 'Recount the drawer' }).click();
  await expect(page.getByLabel('Number of N$100 pieces')).toHaveValue('14');
});

test('a manager can accept the difference, but only with a reason', async ({ page }) => {
  const { updates } = await mockTill(page, 'admin');
  await countShortDrawer(page);

  await expect(page.getByRole('heading', { name: 'The drawer does not balance' })).toBeVisible();
  const accept = page.getByRole('button', { name: 'Accept the difference and close' });
  await expect(accept).toBeDisabled();

  await page.getByLabel('Manager: reason for accepting the difference').fill('N$80 given as change on order 1234, not rung up');
  await expect(accept).toBeEnabled();
  await accept.click();

  await expect(page.getByRole('heading', { name: /Cash up — shift #41/ })).toBeVisible();
  const close = updates.find((u) => u.status === 'Closed');
  expect(close).toBeDefined();
  expect(close!.variance_accepted_reason).toBe('N$80 given as change on order 1234, not rung up');
  expect(close!.cash_variance).toBe(-80);
  // The report says who signed it off.
  await expect(page.getByText(/Accepted by Test Manager: N\$80 given as change/)).toBeVisible();
});

test('a balanced drawer closes without any of that', async ({ page }) => {
  const { updates } = await mockTill(page, 'cashier');
  await page.goto('/admin/#/pos');
  await page.getByRole('button', { name: 'Close till' }).click();
  await page.getByLabel('Number of N$100 pieces').fill('15');
  await page.getByRole('button', { name: 'Next: count phones' }).click();
  await page.getByRole('button', { name: 'Close the till' }).click();

  await expect(page.getByRole('heading', { name: /Cash up — shift #41/ })).toBeVisible();
  const close = updates.find((u) => u.status === 'Closed');
  expect(close).toBeDefined();
  expect(close!.cash_variance).toBe(0);
  expect(close!.variance_accepted_reason).toBeNull();
});
