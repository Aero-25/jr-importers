import { expect, test, type Page } from '@playwright/test';

/**
 * Sharing a document, on every channel it can go out on.
 *
 * The two channels are deliberately different and the tests hold them apart.
 * WhatsApp publishes the PDF to storage and hands the cashier a wa.me link to
 * a public URL. Email sends the PDF itself, as an attachment, from the shop's
 * own address through the `send-document` function — nothing is uploaded and
 * no mail client is opened, because a mailto: would send the invoice from
 * whichever personal account the cashier happens to be signed into.
 */

/** A 1x1 JPEG, so the evidence grid is exercised with a real decodable image. */
const PIXEL_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy' +
  'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA' +
  'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA' +
  'AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3' +
  'ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm' +
  'p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEA' +
  'AwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSEx' +
  'BhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElK' +
  'U1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3' +
  'uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iii' +
  'gD//2Q==',
  'base64',
);

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
  // A claim is addressed to the insurer or supplier, never to the customer, so
  // its recipients come from different columns than every other document here.
  damage_reports: {
    ...common, id: 7, report_number: 'DR-0007', claim_type: 'insurance', status: 'submitted',
    product_name: 'PDF Test Handset', imei: '351209350238038', description: 'the board is corroded',
    finding: 'water damage', claim_amount: 2700, reported_date: '2026-09-04',
    insurer_name: 'Test Insurance', insurer_phone: '0816720024', supplier_id: 5,
    photos: ['https://pdf-test.supabase.co/storage/v1/object/public/Images/damage/one.jpg'],
  },
};

/** Which document each fixture produces, and who it is addressed to. */
const expected: Record<string, { title: string; email: string; slug: string }> = {
  orders: { title: 'ORDER', email: 'pdf@example.com', slug: 'Order-' },
  invoices: { title: 'TAX INVOICE', email: 'linked@example.com', slug: 'Invoice-' },
  quotes: { title: 'QUOTATION', email: 'pdf@example.com', slug: 'Quote-' },
  job_cards: { title: 'JOB CARD', email: 'pdf@example.com', slug: 'Job-Card-' },
  damage_reports: { title: 'DAMAGE REPORT', email: 'claims@example.com', slug: 'Damage Report' },
};

type Sent = { to: string; subject: string; filename: string; attachment: string };

async function mockApp(page: Page, failUpload = false, rows = fixtures) {
  const uploads: { url: string; body: Buffer }[] = [];
  const sent: Sent[] = [];
  const faults: string[] = [];
  page.on('pageerror', (error) => faults.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('jr-importers-auth', JSON.stringify({
      access_token: 'test-token', refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'test-staff', email: 'staff@example.com', aud: 'authenticated' },
    }));
    // Capture handoffs without opening WhatsApp or sending anything.
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

    // The mail path. Nothing must reach storage on this channel.
    if (url.pathname.startsWith('/functions/v1/send-document')) {
      sent.push(JSON.parse(request.postData() ?? '{}') as Sent);
      await route.fulfill({ json: { ok: true, id: 'test-message-id' } });
      return;
    }

    if (url.pathname.includes('/storage/v1/object/')) {
      // Reading an evidence photograph back is a GET; publishing is not.
      if (request.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'image/jpeg', body: PIXEL_JPEG });
        return;
      }
      uploads.push({ url: url.pathname, body: request.postDataBuffer() ?? Buffer.alloc(0) });
      await route.fulfill({ status: failUpload ? 403 : 200, json: failUpload ? { message: 'Upload denied', error: 'Unauthorized', statusCode: '403' } : { Key: url.pathname } });
      return;
    }

    const table = url.pathname.split('/').at(-1)!;
    const row = table === 'users'
      ? { id: 'test-staff', role: 'cashier', active: true, full_name: 'Test cashier' }
      : table === 'customers' ? { id: 'customer-1', phone: '0816720024', email: 'linked@example.com' }
      : table === 'suppliers' ? { id: 5, phone: '0816720024', email: 'claims@example.com' }
      : rows[table];
    const data = row ? [row] : [];
    const singular = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    await route.fulfill({ json: singular ? row ?? null : data, headers: { 'content-range': `0-${Math.max(0, data.length - 1)}/${data.length}` } });
  });
  return { uploads, sent, faults };
}

async function openRecord(page: Page, table: string) {
  await page.goto(`/admin/#/${table.replace(/_/g, '-')}`);
  // Damage reports list the item, not the customer — a claim is filed by device.
  const cell = table === 'damage_reports' ? /PDF Test Handset/ : /PDF Test Customer/;
  await page.getByRole('cell', { name: cell }).click();
  await expect(page.getByRole('button', { name: 'WhatsApp PDF', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Email PDF', exact: true })).toBeVisible();
}

for (const table of Object.keys(fixtures)) {
  test(`${table}: WhatsApp links to the PDF and email attaches it`, async ({ page }) => {
    const { uploads, sent, faults } = await mockApp(page);
    await openRecord(page, table);
    const { title, email, slug } = expected[table]!;

    /* WhatsApp: publish, then hand over a link to what was published. */
    await page.getByRole('button', { name: 'WhatsApp PDF', exact: true }).click();
    await expect(page.getByLabel('WhatsApp number', { exact: true })).toHaveValue('0816720024');
    await page.getByRole('button', { name: 'Open WhatsApp', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { handoffs: string[] }).handoffs.length)).toBe(1);

    const [handoff] = await page.evaluate(() => (window as unknown as { handoffs: string[] }).handoffs);
    expect(handoff).toMatch(/^https:\/\/wa.me\/264816720024\?text=/);
    expect(uploads).toHaveLength(1);
    const published = uploads[0]!;
    expect(published.url).toMatch(/\/[0-9a-f-]{36}\.pdf$/);
    expect(decodeURIComponent(handoff!)).toContain(
      published.url.replace('/storage/v1/object/', '/storage/v1/object/public/'),
    );
    const shared = published.body.toString('latin1');
    expect(shared).toContain('%PDF-');
    expect(shared).toContain(title);
    expect(shared).toContain('PDF Test Customer');
    expect(shared).not.toContain('SECRET-UNLOCK-9274');

    /* Email: the PDF travels with the message; storage is not touched again. */
    await page.getByRole('button', { name: 'Email PDF', exact: true }).click();
    await expect(page.getByLabel('Email address', { exact: true })).toHaveValue(email);
    await page.getByRole('button', { name: 'Send email', exact: true }).click();
    await expect(page.getByText('Email sent', { exact: true })).toBeVisible();

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(email);
    expect(sent[0]!.filename).toContain(slug);
    const attached = Buffer.from(sent[0]!.attachment, 'base64').toString('latin1');
    expect(attached).toContain('%PDF-');
    expect(attached).toContain(title);
    expect(attached).not.toContain('SECRET-UNLOCK-9274');
    // Email must not publish a public copy — that is the WhatsApp channel only.
    expect(uploads).toHaveLength(1);
    // And no mail client was opened.
    expect(await page.evaluate(() => (window as unknown as { handoffs: string[] }).handoffs.length)).toBe(1);

    expect(faults).toEqual([]);
  });
}

test('a damage report carries its evidence photographs', async ({ page }) => {
  const { uploads } = await mockApp(page);
  await openRecord(page, 'damage_reports');
  await page.getByRole('button', { name: 'WhatsApp PDF', exact: true }).click();
  await page.getByRole('button', { name: 'Open WhatsApp', exact: true }).click();
  await expect.poll(() => uploads.length).toBe(1);
  const pdf = uploads[0]!.body.toString('latin1');
  expect(pdf).toContain('EVIDENCE PHOTOGRAPHS');
  expect(pdf).toContain('Photograph 1 of 1');
  // The letter is addressed to the insurer, and the report is paginated.
  expect(pdf).toContain('Test Insurance');
  expect(pdf).toContain('Page 1 of 2');
});

test('a claim greets the insurer, not the customer whose handset it is', async ({ page }) => {
  const { sent } = await mockApp(page);
  await openRecord(page, 'damage_reports');
  await page.getByRole('button', { name: 'Email PDF', exact: true }).click();
  await page.getByRole('button', { name: 'Send email', exact: true }).click();
  await expect.poll(() => sent.length).toBe(1);
  const body = JSON.stringify(sent[0]);
  expect(body).toContain('Damage Report DR-0007');
  expect(body).not.toContain('Good day PDF Test Customer');
});

test('missing recipient can be entered; upload failure closes popup and allows retry', async ({ page }) => {
  const { uploads } = await mockApp(page, true);
  await openRecord(page, 'orders');
  await page.getByRole('button', { name: 'WhatsApp PDF', exact: true }).click();
  const input = page.getByLabel('WhatsApp number', { exact: true });
  await expect(input).toHaveValue('0816720024');
  await input.fill('');
  await expect(page.getByRole('button', { name: 'Open WhatsApp', exact: true })).toBeDisabled();
  await input.fill('123');
  await expect(page.getByRole('button', { name: 'Open WhatsApp', exact: true })).toBeDisabled();
  expect(uploads).toHaveLength(0);
  await input.fill('0816720024');
  await page.getByRole('button', { name: 'Open WhatsApp', exact: true }).click();
  await expect(page.getByText('Could not prepare the PDF', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { handoffs: string[] }).handoffs)).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { closedPopups: number }).closedPopups)).toBe(1);
  await expect(page.getByRole('button', { name: 'Open WhatsApp', exact: true })).toBeEnabled();
});

test('an email address must be valid before the message can be sent', async ({ page }) => {
  const { sent } = await mockApp(page);
  await openRecord(page, 'orders');
  await page.getByRole('button', { name: 'Email PDF', exact: true }).click();
  const input = page.getByLabel('Email address', { exact: true });
  await expect(input).toHaveValue('pdf@example.com');
  await input.fill('');
  await expect(page.getByRole('button', { name: 'Send email', exact: true })).toBeDisabled();
  await input.fill('invalid');
  await expect(page.getByRole('button', { name: 'Send email', exact: true })).toBeDisabled();
  expect(sent).toHaveLength(0);
  await input.fill('new@example.com');
  await page.getByRole('button', { name: 'Send email', exact: true }).click();
  await expect(page.getByText('Email sent', { exact: true })).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]!.to).toBe('new@example.com');
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
  await page.getByRole('button', { name: 'Send email', exact: true }).scrollIntoViewIfNeeded();
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
