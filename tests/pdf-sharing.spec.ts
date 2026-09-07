import { expect, test, type Page } from '@playwright/test';

const common = {
  id: 1, customer_name: 'PDF Test Customer', customer_email: 'pdf@example.com',
  customer_phone: '0816720024', created_at: '2026-09-04T14:42:00Z',
  items: [{ product_id: 1, name: 'Test handset', quantity: 1, price: 2700, line_total: 2700 }],
  total_amount: 2700, subtotal_amount: 2347.83, vat_amount: 352.17,
};
const fixtures: Record<string, Record<string, unknown>> = {
  orders: { ...common, id: 'a05c9819-0000-4000-8000-000000000000', status: 'Paid', payment_method: 'Cash', delivery_method: 'Collection' },
  invoices: { ...common, customer_phone: undefined, customer_email: null, customer_id: 'customer-1', invoice_number: 'INV12129', status: 'paid' },
  quotes: { ...common, quote_number: 'Q123', status: 'draft' },
  job_cards: { ...common, job_number: 1352, status: 'New', handset_type: 'Test handset', pattern_pin: 'SECRET-UNLOCK-9274', checks: {}, accept_token: 'test-accept-token', deposit: 0, cost: 500 },
};

async function mockApp(page: Page, failUpload = false, rows = fixtures) {
  const uploads: { url: string; body: Buffer }[] = [];
  const faults: string[] = [];
  page.on('pageerror', (error) => faults.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('jr-importers-auth', JSON.stringify({
      access_token: 'test-token', refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'test-staff', email: 'staff@example.com', aud: 'authenticated' },
    }));
    // Capture handoffs without opening WhatsApp/email or sending anything.
    const state = window as unknown as { handoffs: string[]; closedPopups: number };
    state.handoffs = [];
    state.closedPopups = 0;
    window.open = (() => ({
      opener: null,
      location: { set href(value: string) { state.handoffs.push(value); } },
      close() { state.closedPopups++; },
    })) as unknown as typeof window.open;
  });
  await page.route('**/config.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.JR_CONFIG = { SUPABASE_URL: "https://pdf-test.supabase.co", SUPABASE_ANON_KEY: "test-anon-key" };',
  }));
  await page.route('**/*.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.includes('/storage/v1/object/')) {
      uploads.push({ url: url.pathname, body: request.postDataBuffer() ?? Buffer.alloc(0) });
      await route.fulfill({ status: failUpload ? 403 : 200, json: failUpload ? { message: 'Upload denied', error: 'Unauthorized', statusCode: '403' } : { Key: url.pathname } });
      return;
    }
    const table = url.pathname.split('/').at(-1)!;
    const row = table === 'users'
      ? { id: 'test-staff', role: 'cashier', active: true, full_name: 'Test cashier' }
      : table === 'customers' ? { id: 'customer-1', phone: '0816720024', email: 'linked@example.com' } : rows[table];
    const data = row ? [row] : [];
    const singular = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    await route.fulfill({ json: singular ? row ?? null : data, headers: { 'content-range': `0-${Math.max(0, data.length - 1)}/${data.length}` } });
  });
  return { uploads, faults };
}

async function openRecord(page: Page, table: string) {
  await page.goto(`/admin/#/${table === 'job_cards' ? 'job-cards' : table}`);
  await page.getByRole('cell', { name: /PDF Test Customer/ }).click();
  await expect(page.getByRole('button', { name: 'WhatsApp PDF', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Email PDF', exact: true })).toBeVisible();
}

for (const table of Object.keys(fixtures)) {
  test(`${table}: WhatsApp and email carry the correct generated PDF`, async ({ page }) => {
    const { uploads, faults } = await mockApp(page);
    await openRecord(page, table);
    for (const channel of ['WhatsApp', 'Email']) {
      await page.getByRole('button', { name: `${channel} PDF`, exact: true }).click();
      await expect(page.getByLabel(channel === 'WhatsApp' ? 'WhatsApp number' : 'Email address', { exact: true })).toHaveValue(
        channel === 'WhatsApp' ? '0816720024' : table === 'invoices' ? 'linked@example.com' : 'pdf@example.com',
      );
      await page.getByRole('button', { name: channel === 'WhatsApp' ? 'Open WhatsApp' : 'Open email', exact: true }).click();
      await expect.poll(() => page.evaluate(() => (window as unknown as { handoffs: string[] }).handoffs.length)).toBe(channel === 'WhatsApp' ? 1 : 2);
    }
    const handoffs = await page.evaluate(() => (window as unknown as { handoffs: string[] }).handoffs);
    expect(handoffs[0]).toMatch(/^https:\/\/wa.me\/264816720024\?text=/);
    expect(handoffs[1]).toMatch(/^mailto:/);
    const expectedTitle = { orders: 'ORDER', invoices: 'TAX INVOICE', quotes: 'QUOTATION', job_cards: 'JOB CARD' }[table]!;
    expect(uploads).toHaveLength(2);
    for (const [index, upload] of uploads.entries()) {
      const pdf = upload.body.toString('latin1');
      expect(pdf).toContain('%PDF-');
      expect(pdf).toContain(expectedTitle);
      expect(pdf).toContain('PDF Test Customer');
      expect(pdf).not.toContain('SECRET-UNLOCK-9274');
      expect(decodeURIComponent(handoffs[index]!)).toContain(upload.url.replace('/storage/v1/object/', '/storage/v1/object/public/'));
      expect(upload.url).toMatch(/\/[0-9a-f-]{36}\.pdf$/);
    }
    expect(uploads[0]!.url).not.toBe(uploads[1]!.url);
    expect(faults).toEqual([]);
  });
}

test('missing recipient can be entered; upload failure closes popup and allows retry', async ({ page }) => {
  const { uploads } = await mockApp(page, true);
  await openRecord(page, 'orders');
  await page.getByRole('button', { name: 'Email PDF', exact: true }).click();
  const input = page.getByLabel('Email address', { exact: true });
  await expect(input).toHaveValue('pdf@example.com');
  await input.fill('');
  await expect(page.getByRole('button', { name: 'Open email', exact: true })).toBeDisabled();
  await input.fill('invalid');
  await expect(page.getByRole('button', { name: 'Open email', exact: true })).toBeDisabled();
  expect(uploads).toHaveLength(0);
  await input.fill('new@example.com');
  await page.getByRole('button', { name: 'Open email', exact: true }).click();
  await expect(page.getByText('Could not prepare the PDF', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { handoffs: string[] }).handoffs)).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { closedPopups: number }).closedPopups)).toBe(1);
  await expect(page.getByRole('button', { name: 'Open email', exact: true })).toBeEnabled();
});

test('invoice PDF includes current edits and remains usable on a narrow screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApp(page);
  await openRecord(page, 'invoices');
  await page.getByLabel('Comment', { exact: true }).fill('Current edited comment');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const pdf = Buffer.concat(chunks).toString('latin1');
  expect(pdf).toContain('Current edited comment');
  expect(pdf).toContain('INV12129');
  await page.getByRole('button', { name: 'Email PDF', exact: true }).click();
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue('linked@example.com');
  await page.getByRole('button', { name: 'Open email', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('invoice-mobile.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('imported invoice without item lines retains its recorded total', async ({ page }) => {
  await mockApp(page, false, { ...fixtures, invoices: { ...fixtures.invoices, items: [] } });
  await openRecord(page, 'invoices');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString('latin1')).toMatch(/2[ ,]700\.00/);
});
