import { expect, test, type Page } from '@playwright/test';

/**
 * The VAT report, in the shape IQ printed it.
 *
 * A return is five totals; what gets checked against a filing is the listing
 * underneath — one row per document, TxDate / Reference / Description /
 * Amount / VatAmount. The figures here are August 2026's, taken from the
 * shop's own IQ export.
 */

const AUGUST = [
  { tx_date: '2026-08-03', reference: 'INV12081', description: '0811223379 W Walters', excl: 4260.87, vat: 639.13, incl: 4900, doc_type: 'invoice', status: 'paid' },
  { tx_date: '2026-08-05', reference: 'INV12082', description: 'B H L Bulk Haulage Logistics (PTY) Ltd', excl: 2782.61, vat: 417.39, incl: 3200, doc_type: 'invoice', status: 'paid' },
  { tx_date: '2026-08-12', reference: 'INV12090', description: 'CASH', excl: 130.43, vat: 19.57, incl: 150, doc_type: 'invoice', status: 'paid' },
  { tx_date: '2026-08-24', reference: 'CRN401', description: 'NAMIB MILLS Namib Mills (PTY) LTD', excl: -33788.79, vat: -5068.32, incl: -38857.11, doc_type: 'credit_note', status: 'paid' },
];

const RETURN = {
  ok: true,
  period_from: '2026-08-01', period_to: '2026-08-31', rate: 0.15, period_locked: false,
  sales_inc: 394125.73, refunds_inc: 38857.11, net_sales_inc: 355268.62,
  output_vat: -3992.23, document_count: 4, refunds_recorded: 0,
  purchases_inc: 0, expenses_inc: 0, input_vat: 0, payable: -3992.23,
};

/** The four rows above add to exactly this much VAT. */
const LISTED_VAT = AUGUST.reduce((n, r) => n + r.vat, 0);

async function mockShop(page: Page, vatReturn: Record<string, unknown> = RETURN) {
  await page.addInitScript(() => {
    localStorage.setItem('jr-importers-auth', JSON.stringify({
      access_token: 'test-token', refresh_token: 'test-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'test-admin', email: 'admin@example.com', aud: 'authenticated' },
    }));
  });
  await page.route('**/config.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.JR_CONFIG = { SUPABASE_URL: "https://vat-test.supabase.co", SUPABASE_ANON_KEY: "test-anon-key" };',
  }));
  await page.route('**/*.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').at(-1)!;
    if (url.pathname.endsWith('/rpc/vat_transactions')) return route.fulfill({ json: AUGUST });
    if (url.pathname.endsWith('/rpc/vat_return')) return route.fulfill({ json: vatReturn });
    if (table === 'users') {
      return route.fulfill({
        json: [{ id: 'test-admin', role: 'admin', active: true, full_name: 'Test Manager' }],
        headers: { 'content-range': '0-0/1' },
      });
    }
    if (url.pathname.includes('/rpc/')) return route.fulfill({ json: { ok: true } });
    return route.fulfill({ json: [], headers: { 'content-range': '0-0/0' } });
  });
}

/**
 * Anchored, and case-insensitive: the headings are uppercased in CSS (which
 * Chromium folds into the accessible name), and Playwright matches a plain
 * string as a substring — so a bare "Amount" would also find "VatAmount".
 */
const header = (name: string) => new RegExp('^' + name + '$', 'i');

test("the listing shows every document in IQ's columns, and totals them", async ({ page }) => {
  await mockShop(page);
  await page.goto('/admin/#/finance');

  for (const name of ['TxDate', 'Reference', 'Description', 'Amount', 'VatAmount']) {
    await expect(page.getByRole('columnheader', { name: header(name) })).toBeVisible();
  }

  await expect(
    page.getByText('4 documents · every invoice and credit note in the period'),
  ).toBeVisible();

  // An ordinary invoice, a cash sale, and a credit note carrying its negative.
  await expect(page.getByRole('cell', { name: 'INV12081' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '0811223379 W Walters' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'CASH', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'CRN401' })).toBeVisible();
  await expect(page.getByText(/5[.,]068[.,]32/).first()).toBeVisible();

  // The listing carries its own total, and it agrees with the return.
  await expect(page.getByText(/Total · /)).toBeVisible();
  expect(Math.round(LISTED_VAT * 100) / 100).toBe(RETURN.output_vat);
  await expect(page.getByText('The listing does not agree with the return')).toHaveCount(0);
});

test('a listing that disagrees with the return refuses to be quiet about it', async ({ page }) => {
  // The return claims VAT the documents do not support. Filing that is the
  // one thing this screen must never let happen silently.
  await mockShop(page, { ...RETURN, output_vat: 46339.41 });
  await page.goto('/admin/#/finance');

  await expect(page.getByText('The listing does not agree with the return')).toBeVisible();
  await expect(page.getByText(/Do not file until they agree/)).toBeVisible();
});

test('the return is built from invoices, and says how many', async ({ page }) => {
  await mockShop(page);
  await page.goto('/admin/#/finance');

  await expect(page.getByText('Invoices including VAT (4)')).toBeVisible();
  await expect(page.getByText('Less credit notes')).toBeVisible();
});

test('a refund outside a credit note is called out rather than ignored', async ({ page }) => {
  await mockShop(page, { ...RETURN, refunds_recorded: 1250 });
  await page.goto('/admin/#/finance');

  await expect(page.getByText('Refunds recorded outside a credit note')).toBeVisible();
  await expect(page.getByText(/1.250[.,]00 of approved refunds/)).toBeVisible();
});

test("the listing exports as CSV in IQ's columns", async ({ page }) => {
  await mockShop(page);
  await page.goto('/admin/#/finance');

  // Pin the period, so the filename is the period and not today's default.
  await page.getByLabel('From').fill('2026-08-01');
  await page.getByLabel('To').fill('2026-08-31');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('vat-2026-08-01-to-2026-08-31.csv');

  const stream = await file.createReadStream();
  const text = await new Promise<string>((resolve, reject) => {
    let out = '';
    stream.on('data', (chunk) => { out += chunk; });
    stream.on('end', () => resolve(out));
    stream.on('error', reject);
  });

  const lines = text.replace(/^﻿/, '').trim().split('\r\n');
  expect(lines[0]).toBe('TxDate,Reference,Description,Amount,VatAmount');
  expect(lines[1]).toBe('2026-08-03,INV12081,0811223379 W Walters,4260.87,639.13');
  // The credit note keeps its negatives, or the file will not reconcile.
  expect(lines[4]).toBe('2026-08-24,CRN401,NAMIB MILLS Namib Mills (PTY) LTD,-33788.79,-5068.32');
  expect(lines).toHaveLength(5);
});

test('the default VAT period is whole months, not a day either side', async ({ page }) => {
  // Built from local calendar parts. Through toISOString() the first of the
  // month came back as the last day of the month before, Namibia being two
  // hours ahead of UTC — a period an inch out at each end.
  await mockShop(page);
  await page.goto('/admin/#/finance');

  await expect(page.getByLabel('From')).toHaveValue(/^\d{4}-\d{2}-01$/);
  const to = await page.getByLabel('To').inputValue();
  const lastDayOfThatMonth = new Date(Number(to.slice(0, 4)), Number(to.slice(5, 7)), 0).getDate();
  expect(Number(to.slice(8, 10))).toBe(lastDayOfThatMonth);
});
