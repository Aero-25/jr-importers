import { expect, test, type Page } from '@playwright/test';

/**
 * A till cannot be closed while a count does not agree.
 *
 * Closing is three counts: the drawer, the card machine against what the
 * till rang up on card, and the phones. The first two are compulsory. The
 * database refuses the close outright (see the migrations); this covers the
 * screens in front of it — the cashier is shown which count is out, the
 * shift is left open with the counts saved, and only a manager with a
 * written reason can close it anyway.
 */

const SHIFT = {
  id: 41, till_id: 1, cashier_name: 'Test Cashier', status: 'Open', opening_float: 500,
  opening_time: '2026-09-12T08:00:00Z', closing_time: null, notes: null,
  opening_denominations: { '100': 5 }, closing_denominations: null,
  actual_cash: null, expected_cash: null, cash_variance: null,
  closing_stock_count: null, stock_variance_total: null,
  counted_card: null, card_variance: null,
};

/** What `till_cash_up` says once the count is saved. Expected 1 500, counted 1 420. */
function cashUp(shift: typeof SHIFT, counted: number, countedCard: number | null = null) {
  const expected = 1500;
  const cardSales = 2000;
  return {
    ok: true, shift_id: 41, till_id: 1, cashier: 'Test Cashier', status: 'Open',
    opened_at: shift.opening_time, closed_at: null, opening_float: 500,
    total_sales: 3000, cash_sales: 1000, card_sales: cardSales, eft_sales: 0, other_sales: 0,
    petty_cash: 0, expected_cash: expected, counted_cash: counted,
    variance: Math.round((counted - expected) * 100) / 100,
    counted_card: countedCard,
    card_variance: countedCard === null ? null : Math.round((countedCard - cardSales) * 100) / 100,
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
  let countedCard: number | null = null;
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
      await route.fulfill({ json: cashUp(shift, counted, countedCard) });
      return;
    }
    if (table === 'till_shifts' && request.method() === 'PATCH') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      updates.push(body);
      if (typeof body.actual_cash === 'number') counted = body.actual_cash;
      if (typeof body.counted_card === 'number') countedCard = body.counted_card;
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

/** The card screen: enter the slip total and move on. */
async function enterCardSlip(page: Page, total: string) {
  await page.getByRole('button', { name: 'Next: the card machine' }).click();
  await page.getByLabel('Card machine total (from the swipe slip)').fill(total);
  await page.getByRole('button', { name: 'Next: count phones' }).click();
}

async function countShortDrawer(page: Page) {
  await page.goto('/admin/#/pos');
  await page.getByRole('button', { name: 'Close till' }).click();
  // 14 × N$100 + 1 × N$20 = 1 420 against an expected 1 500.
  await page.getByLabel('Number of N$100 pieces').fill('14');
  await page.getByLabel('Number of N$20 pieces').fill('1');
  await enterCardSlip(page, '2000');
  await page.getByRole('button', { name: 'Close the till' }).click();
}

test('a cashier cannot close a short drawer; the shift stays open with the count saved', async ({ page }) => {
  const { updates } = await mockTill(page, 'cashier');
  await countShortDrawer(page);

  await expect(page.getByRole('heading', { name: 'These counts do not agree' })).toBeVisible();
  await expect(page.getByText(/Drawer N\$ 80[.,]00 short/)).toBeVisible();
  await expect(page.getByText('a manager has to sign it off')).toBeVisible();
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

  await expect(page.getByRole('heading', { name: 'These counts do not agree' })).toBeVisible();
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
  await enterCardSlip(page, '2000');
  await page.getByRole('button', { name: 'Close the till' }).click();

  await expect(page.getByRole('heading', { name: /Cash up — shift #41/ })).toBeVisible();
  const close = updates.find((u) => u.status === 'Closed');
  expect(close).toBeDefined();
  expect(close!.cash_variance).toBe(0);
  expect(close!.counted_card).toBe(2000);
  expect(close!.card_variance).toBe(0);
  expect(close!.variance_accepted_reason).toBeNull();
});

test('the card machine total is compulsory, and is checked against the till', async ({ page }) => {
  await mockTill(page, 'cashier');
  await page.goto('/admin/#/pos');
  await page.getByRole('button', { name: 'Close till' }).click();
  await page.getByLabel('Number of N$100 pieces').fill('15');
  await page.getByRole('button', { name: 'Next: the card machine' }).click();

  // Nothing entered: the cashier cannot move past it.
  const next = page.getByRole('button', { name: 'Next: count phones' });
  await expect(next).toBeDisabled();

  // The till's own card figure is shown to compare against.
  await expect(page.getByText('Card takings on the till')).toBeVisible();
  await expect(page.getByText(/2.000[.,]00/).first()).toBeVisible();

  // A slip that disagrees says so, and by how much.
  await page.getByLabel('Card machine total (from the swipe slip)').fill('1850');
  await expect(page.getByText(/150[.,]00 short on the slip/)).toBeVisible();
  await expect(next).toBeEnabled();

  // And one that agrees says that too.
  await page.getByLabel('Card machine total (from the swipe slip)').fill('2000');
  await expect(page.getByText('The machine agrees')).toBeVisible();
});

test('a card slip that does not agree stops the close, and a manager can sign it off', async ({ page }) => {
  const { updates } = await mockTill(page, 'admin');
  await page.goto('/admin/#/pos');
  await page.getByRole('button', { name: 'Close till' }).click();
  // The drawer is right; only the card machine is out.
  await page.getByLabel('Number of N$100 pieces').fill('15');
  await enterCardSlip(page, '1850');
  await page.getByRole('button', { name: 'Close the till' }).click();

  await expect(page.getByRole('heading', { name: 'These counts do not agree' })).toBeVisible();
  await expect(page.getByText(/Card slip N\$ 150[.,]00 short/)).toBeVisible();
  // The drawer balanced, so it is not blamed.
  await expect(page.getByText(/Drawer N\$/)).toHaveCount(0);
  expect(updates.some((u) => u.status === 'Closed')).toBe(false);

  await page.getByLabel('Manager: reason for accepting the difference').fill('One slip not batched; bank to follow up');
  await page.getByRole('button', { name: 'Accept the difference and close' }).click();

  await expect(page.getByRole('heading', { name: /Cash up — shift #41/ })).toBeVisible();
  const close = updates.find((u) => u.status === 'Closed');
  expect(close).toBeDefined();
  expect(close!.card_variance).toBe(-150);
  expect(close!.cash_variance).toBe(0);
  expect(close!.variance_accepted_reason).toBe('One slip not batched; bank to follow up');
});
