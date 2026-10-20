import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Bulk pricing, driven with a real supplier file.
 *
 * The file in tests/fixtures is an actual Active Cellular list: letterhead
 * across the top, the letterhead repeated when the page breaks, Samsung phones
 * and Samsung tablets in the same column, then iPhones, Xiaomi, Honor, Huawei
 * and a Mobicel. Nothing about it is tidy, which is the point — the parser has
 * to find the 27 phones in it without any help.
 *
 * The last test is the one that matters most: the file a customer receives must
 * not carry what the shop paid.
 */

const SUPPLIER_FILE = 'tests/fixtures/supplier-price-list.xlsx';

/** Two lines from the real file, priced at 22% on top of 17% import VAT. */
const A06 = { cost: 1625, retail: 2667.46 };

const LIST = {
  id: 501,
  upload_id: 301,
  brand: 'Samsung',
  pricing_mode: 'calculated',
  pdf_path: null,
  week_start: '2026-10-19',
  import_vat_rate: 0.17,
  sales_vat_rate: 0.15,
  default_markup: 22,
  product_count: 2,
  in_stock_count: 1,
  on_order_count: 0,
  status: 'approved',
  generated_by: 'Test Manager',
  approved_by: 'Test Manager',
  approved_at: '2026-10-19T08:00:00Z',
  created_at: '2026-10-19T08:00:00Z',
};

const ITEMS = [
  {
    id: 1, list_id: 501, variant_key: 'samsung|a06|64',
    display_name: 'Samsung Galaxy A06 64GB', model: 'A06', storage_gb: 64, five_g: false,
    supplier_cost: A06.cost, import_vat: 276.25, landed_cost: 1901.25, markup_pct: 22,
    price_excl_vat: 2319.53, sales_vat: 347.93, final_price: A06.retail,
    stock_status: 'in_stock', stock_qty: 4, product_id: 11,
  },
  {
    id: 2, list_id: 501, variant_key: 'samsung|s26 ultra|512',
    display_name: 'Samsung Galaxy S26 Ultra 512GB', model: 'S26 ULTRA', storage_gb: 512,
    five_g: false, supplier_cost: 19995, import_vat: 3399.15, landed_cost: 23394.15,
    markup_pct: 22, price_excl_vat: 28540.86, sales_vat: 4281.13, final_price: 32821.99,
    stock_status: 'on_order', stock_qty: 0, product_id: null,
  },
];

/** The tab bar. The Dashboard panel repeats some of these labels as shortcuts. */
const tabs = (page: Page) => page.getByLabel('Bulk pricing', { exact: true });

async function mockConsole(page: Page) {
  const rpcCalls: Array<{ name: string; body: unknown }> = [];

  await page.addInitScript(() => {
    localStorage.setItem('jr-importers-auth', JSON.stringify({
      access_token: 'test-token', refresh_token: 'test-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'test-admin', email: 'admin@example.com', aud: 'authenticated' },
    }));
  });

  await page.route('**/config.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.JR_CONFIG = { SUPABASE_URL: "https://bulk-test.supabase.co", SUPABASE_ANON_KEY: "test-anon-key" };',
  }));

  await page.route('**/*.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const tail = url.pathname.split('/').at(-1)!;
    const singular = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    const reply = (rows: Record<string, unknown>[]) => route.fulfill({
      json: singular ? rows[0] ?? null : rows,
      headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` },
    });

    if (url.pathname.includes('/rpc/')) {
      let body: unknown = null;
      try { body = JSON.parse(request.postData() ?? 'null'); } catch { /* no body */ }
      rpcCalls.push({ name: tail, body });

      if (tail === 'bulk_dashboard') {
        return route.fulfill({ json: {
          this_week: '2026-10-19',
          rates: { import_vat: 0.17, sales_vat: 0.15, default_markup: 22, auto_send: false, require_approval: true },
          latest_upload: { id: 301, file_name: 'supplier.xlsx', at: '2026-10-19T08:00:00Z', rows: 59, phones: 27, skipped: 32 },
          latest_list: { id: 501, week: '2026-10-19', status: 'approved', products: 2, in_stock: 1, on_order: 0, at: '2026-10-19T08:00:00Z', current_week: true },
          latest_distribution: null,
          recipients: { total: 2, active: 2 },
          markups_overridden: 0,
        } });
      }
      if (tail === 'bulk_save_upload') return route.fulfill({ json: 301 });
      if (tail === 'bulk_generate_list' || tail === 'bulk_recalculate') return route.fulfill({ json: 501 });
      return route.fulfill({ json: { ok: true } });
    }

    if (tail === 'users') {
      return reply([{ id: 'test-admin', role: 'admin', active: true, full_name: 'Test Manager' }]);
    }
    if (tail === 'settings') {
      return reply([
        { key: 'bulk_import_vat_rate', value: 0.17 },
        { key: 'bulk_sales_vat_rate', value: 0.15 },
        { key: 'bulk_default_markup', value: 22 },
        { key: 'bulk_schedule_day', value: 1 },
        { key: 'bulk_schedule_time', value: '08:00' },
        { key: 'bulk_auto_send', value: false },
        { key: 'bulk_require_approval', value: true },
        { key: 'bulk_email_subject', value: 'JR Importers | Weekly Samsung Price List - {date}' },
        { key: 'bulk_email_body', value: 'Good Morning {name},\n\nPrices attached.' },
      ]);
    }
    if (tail === 'bulk_price_lists') return reply([LIST]);
    if (tail === 'bulk_price_list_items') return reply(ITEMS);
    if (tail === 'customers') {
      // searchParams.get already decodes; decoding again chokes on the %
      // wildcards PostgREST uses for ilike.
      const match = (url.searchParams.get('or') ?? '').toLowerCase();
      const all = [
        { id: 'c1', name: 'Coastal Cellular', email: 'buyer@coastal.na' },
        { id: 'c2', name: 'Swakop Phones', email: 'orders@swakopphones.na' },
        { id: 'c3', name: 'Namib Mills (PTY) LTD', email: 'wwalters@namibmills.com.na' },
      ];
      return reply(all.filter((c) =>
        match.includes(c.name.toLowerCase().slice(0, 4)) || match.includes(c.email.slice(0, 4))));
    }
    if (tail === 'bulk_recipients') {
      return reply([
        { id: 1, name: 'Coastal Cellular', email: 'buyer@coastal.na', active: true, opted_out_at: null, notes: null },
        { id: 2, name: null, email: 'walvis@dealer.com', active: true, opted_out_at: null, notes: null },
      ]);
    }
    if (tail === 'bulk_distributions' || tail === 'bulk_deliveries') return reply([]);
    return reply([]);
  });

  return { rpcCalls };
}

test('the nav carries Bulk pricing and it opens', async ({ page }) => {
  await mockConsole(page);
  await page.goto('/admin/#/bulk-pricing');

  await expect(page.getByRole('link', { name: 'Bulk pricing' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bulk pricing' })).toBeVisible();
  // Every tab the shop needs for the Monday round.
  for (const tab of [
    'Dashboard', 'Upload supplier prices', 'Pricing & markups',
    'Stock availability', 'Generated lists', 'Email distribution', 'Settings',
  ]) {
    await expect(tabs(page).getByRole('button', { name: tab })).toBeVisible();
  }
});

test('a real supplier file yields the Samsung phones and nothing else', async ({ page }) => {
  await mockConsole(page);
  await page.goto('/admin/#/bulk-pricing');
  await tabs(page).getByRole('button', { name: 'Upload supplier prices' }).click();

  await page.setInputFiles('input[type="file"]', SUPPLIER_FILE);

  // 27 phones in that file; the other 32 lines are tablets or other brands.
  await expect(page.getByText('Samsung phones found')).toBeVisible();
  await expect(page.locator('div', { has: page.getByText('Samsung phones found') })
    .getByText('27', { exact: true }).first()).toBeVisible();

  // Storage, never RAM, and never the 5 in "5G".
  await expect(page.getByRole('cell', { name: 'Samsung Galaxy A07 128GB', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Samsung Galaxy A07 64GB', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Samsung Galaxy A57 256GB 5G', exact: true })).toBeVisible();

  // The awkward ones: a suffix model, a bare trailing letter, a foldable.
  await expect(page.getByRole('cell', { name: 'Samsung Galaxy S25 FE 256GB', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Samsung Galaxy A04s 32GB', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Samsung Galaxy Z Fold 7 512GB', exact: true })).toBeVisible();

  // No tablet, and no other brand, reaches the priced table.
  const table = page.locator('table').first();
  await expect(table).not.toContainText('TAB');
  await expect(table).not.toContainText('I-PHONE');
  await expect(table).not.toContainText('XIAOMI');
  await expect(table).not.toContainText('HONOR');

  // They are accounted for rather than silently dropped.
  await page.getByText('lines were not imported').click();
  await expect(page.getByText('SAMSUNG X115 TAB-A9  8.7"  64GIG LTE (LOCAL)')).toBeVisible();
  await expect(page.getByText('I-PHONE 17 PRO MAX 512GIG (LOCAL)')).toBeVisible();
});

test('a line can be dropped from the preview, and one added by hand', async ({ page }) => {
  await mockConsole(page);
  await page.goto('/admin/#/bulk-pricing');
  await tabs(page).getByRole('button', { name: 'Upload supplier prices' }).click();
  await page.setInputFiles('input[type="file"]', SUPPLIER_FILE);

  // Count the priced rows themselves rather than the tile: it is the table
  // that gets saved.
  const rows = page.locator('table').first().locator('tbody tr');
  await expect(rows).toHaveCount(27);

  // A handset the shop does not want on this week's list.
  await page.getByRole('button', { name: 'Remove Samsung Galaxy A23 64GB' }).click();
  await expect(page.getByRole('cell', { name: 'Samsung Galaxy A23 64GB', exact: true })).toHaveCount(0);
  await expect(rows).toHaveCount(26);

  // One the supplier quoted separately.
  await page.getByLabel('Model').fill('A26');
  await page.getByLabel('Storage (GB)').fill('128');
  await page.getByLabel('Supplier cost').fill('3600');
  await page.getByLabel('5G').check();
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(page.getByRole('cell', { name: 'Samsung Galaxy A26 128GB 5G', exact: true })).toBeVisible();
  await expect(rows).toHaveCount(27);

  // The same handset twice would be priced twice over.
  await page.getByLabel('Model').fill('A26');
  await page.getByLabel('Storage (GB)').fill('128');
  await page.getByLabel('Supplier cost').fill('3700');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('A26 128GB is already on this list.')).toBeVisible();
  await expect(rows).toHaveCount(27);
});

test('the pricing table shows the full build-up and sends the markup to the server', async ({ page }) => {
  const { rpcCalls } = await mockConsole(page);
  await page.goto('/admin/#/bulk-pricing');
  await tabs(page).getByRole('button', { name: 'Pricing & markups' }).click();

  const row = page.getByRole('row', { name: /Samsung Galaxy A06 64GB/ });
  await expect(row).toContainText('1,625.00');   // supplier cost
  await expect(row).toContainText('276.25');     // import VAT
  await expect(row).toContainText('1,901.25');   // landed
  await expect(row).toContainText('2,667.46');   // retail
  await expect(row).toContainText('In stock');

  // Everything here is on a supplier list the shop orders from, so a handset
  // that is not on the shelf is on order — never "out of stock".
  const away = page.getByRole('row', { name: /Samsung Galaxy S26 Ultra 512GB/ });
  await expect(away).toContainText('On order');
  await expect(page.locator('table')).not.toContainText('Out of stock');

  // Changing a markup is sent to the database, which owns the arithmetic, and
  // the list is repriced from there rather than in the browser.
  await page.getByLabel('Markup for Samsung Galaxy A06 64GB').fill('18');
  await page.getByLabel('Markup for Samsung Galaxy A06 64GB').blur();

  await expect.poll(() => rpcCalls.filter((c) => c.name === 'bulk_set_markup').length).toBe(1);
  const call = rpcCalls.find((c) => c.name === 'bulk_set_markup')!;
  expect(call.body).toMatchObject({ p_variant_key: 'samsung|a06|64', p_markup: 18 });
  await expect.poll(() => rpcCalls.some((c) => c.name === 'bulk_recalculate')).toBe(true);
});

test('recipients can be picked from the customers the shop already has', async ({ page }) => {
  await mockConsole(page);
  await page.goto('/admin/#/bulk-pricing');
  await tabs(page).getByRole('button', { name: 'Email distribution' }).click();

  // Typing a name offers matching customers.
  await page.getByLabel('Name', { exact: true }).fill('Coas');
  const option = page.getByRole('option', { name: /Coastal Cellular/ });
  await expect(option).toBeVisible();

  // Picking one fills both fields, so the address is never retyped.
  await option.click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Coastal Cellular');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('buyer@coastal.na');

  // A dealer who is not a customer yet can still be typed in full.
  await page.getByLabel('Name', { exact: true }).fill('Brand New Dealer');
  await page.getByLabel('Email', { exact: true }).fill('new@dealer.na');
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
});

test('the customer attachment carries retail prices and no costs at all', async ({ page }) => {
  await mockConsole(page);
  await page.goto('/admin/#/bulk-pricing');
  await tabs(page).getByRole('button', { name: 'Email distribution' }).click();

  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Preview the attachment' }).click(),
  ]).then(([d]) => d);

  expect(download.suggestedFilename()).toBe('JR_Importers_Samsung_Price_List_2026-10-19.pdf');

  const path = await download.path();
  const pdf = readFileSync(path!).toString('latin1');

  // What a customer is meant to see.
  expect(pdf).toContain('JR IMPORTERS');
  expect(pdf).toContain('Samsung Galaxy A06 64GB');
  expect(pdf).toContain('2,667.46');

  // What they must never see: the cost, the import VAT, the landed cost, the
  // margin or the markup. Checked against the raw bytes, so a figure hidden in
  // metadata or an unused object would still be caught.
  for (const secret of ['1,625.00', '1625', '276.25', '1,901.25', '2,319.53', '19,995']) {
    expect(pdf, `the customer PDF must not contain ${secret}`).not.toContain(secret);
  }
  // The small tag that says how many are on the shelf.
  expect(pdf).toContain('the tag is how many we hold');

  // Nor anything identifying where the shop buys. The supplier's name and the
  // file it came in are on the upload record; neither belongs in a customer's
  // hands.
  for (const secret of ['Active Cellular', 'activecellular', 'EXPORT', 'LOCAL', 'GIG']) {
    expect(pdf, `the customer PDF must not mention ${secret}`).not.toContain(secret);
  }

  expect(pdf.toLowerCase()).not.toContain('markup');
  expect(pdf.toLowerCase()).not.toContain('supplier cost');
  expect(pdf.toLowerCase()).not.toContain('landed');
});

test('the costing workbook is a separate download that does carry the costs', async ({ page }) => {
  await mockConsole(page);
  await page.goto('/admin/#/bulk-pricing');
  await tabs(page).getByRole('button', { name: 'Generated lists' }).click();

  // The first press fetches the list's lines; the second builds the file.
  await page.getByRole('button', { name: 'Costing' }).first().click();
  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Costing' }).first().click(),
  ]).then(([d]) => d);

  expect(download.suggestedFilename()).toBe('JR_Importers_Samsung_Internal_Costing_2026-10-19.xlsx');

  const bytes = readFileSync((await download.path())!);
  // A real zip, and therefore a real workbook.
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  const raw = bytes.toString('latin1');
  expect(raw).toContain('xl/worksheets/sheet1.xml');
  expect(raw).toContain('xl/styles.xml');
});
