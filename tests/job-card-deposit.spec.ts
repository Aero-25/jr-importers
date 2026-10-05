import { expect, test, type Page } from '@playwright/test';

/**
 * A deposit taken on a job card is money at the counter.
 *
 * A repair is booked in, the customer pays a deposit and the handset goes on
 * the bench — no order, no invoice. The deposit used to be a bare number on
 * the job card with nothing saying how it was paid, so no cash up could see
 * it. The form now asks, and only when there is something to ask about.
 */

async function mockShop(page: Page) {
  const writes: Record<string, unknown>[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('jr-importers-auth', JSON.stringify({
      access_token: 'test-token', refresh_token: 'test-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'test-admin', email: 'admin@example.com', aud: 'authenticated' },
    }));
  });
  await page.route('**/config.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.JR_CONFIG = { SUPABASE_URL: "https://jc-test.supabase.co", SUPABASE_ANON_KEY: "test-anon-key" };',
  }));
  await page.route('**/*.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1)!;
    const reply = (rows: Record<string, unknown>[]) => route.fulfill({
      json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` },
    });
    if (table === 'users') {
      return reply([{ id: 'test-admin', role: 'admin', active: true, full_name: 'Test Manager' }]);
    }
    if (table === 'job_cards' && request.method() === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}');
      writes.push(Array.isArray(body) ? body[0] : body);
      return reply([{ id: 1, job_number: 1361, ...(Array.isArray(body) ? body[0] : body) }]);
    }
    if (url.pathname.includes('/rpc/')) return route.fulfill({ json: { ok: true } });
    return reply([]);
  });
  return { writes };
}

test('the deposit method is asked for only once a deposit is entered', async ({ page }) => {
  await mockShop(page);
  await page.goto('/admin/#/job-cards');
  await page.getByRole('button', { name: /New job card|Book in/i }).first().click();

  // Nothing taken yet, so nothing to ask.
  await expect(page.getByLabel('Deposit paid by')).toHaveCount(0);

  await page.getByLabel('Deposit (N$)').fill('450');
  const method = page.getByLabel('Deposit paid by');
  await expect(method).toBeVisible();
  // Cash is the counter default, which is what a deposit nearly always is.
  await expect(method).toHaveValue('Cash');

  // And it goes away again if the deposit is cleared.
  await page.getByLabel('Deposit (N$)').fill('0');
  await expect(page.getByLabel('Deposit paid by')).toHaveCount(0);
});

test('a deposit is saved with the method it was taken by', async ({ page }) => {
  const { writes } = await mockShop(page);
  await page.goto('/admin/#/job-cards');
  await page.getByRole('button', { name: /New job card|Book in/i }).first().click();

  await page.getByLabel('Name & surname').fill('NA');
  await page.getByLabel('Contact no.').fill('0813996181');
  await page.getByLabel('Type of handset').fill('UF Armor 13');
  await page.getByLabel('Fault', { exact: true }).fill('Charging Port');
  await page.getByLabel('Deposit (N$)').fill('450');
  await page.getByLabel('Deposit paid by').selectOption('Card');

  await page.getByRole('button', { name: 'Create job card' }).click();

  await expect.poll(() => writes.length).toBeGreaterThan(0);
  const saved = writes.at(-1)!;
  expect(saved.deposit).toBe(450);
  expect(saved.deposit_method).toBe('Card');
});

test('no deposit means no method is recorded at all', async ({ page }) => {
  const { writes } = await mockShop(page);
  await page.goto('/admin/#/job-cards');
  await page.getByRole('button', { name: /New job card|Book in/i }).first().click();

  await page.getByLabel('Name & surname').fill('Walk-in');
  await page.getByLabel('Contact no.').fill('0810000000');
  await page.getByLabel('Type of handset').fill('Test handset');
  await page.getByLabel('Fault', { exact: true }).fill('Screen');

  await page.getByRole('button', { name: 'Create job card' }).click();

  await expect.poll(() => writes.length).toBeGreaterThan(0);
  const saved = writes.at(-1)!;
  expect(saved.deposit).toBe(0);
  // Null, not "Cash": nothing was taken, so nothing should imply it was.
  expect(saved.deposit_method).toBeNull();
});
