import { expect, test, type Page } from '@playwright/test';

/**
 * A repair becomes an invoice, from either end.
 *
 * From the job card: one button raises the invoice with the PARTS line worked
 * out from the card, links it, and opens it. From an invoice: picking the job
 * card adds the same line and the same link. Both routes go through one
 * helper, so the two cannot disagree about what a repair costs.
 */

const job = {
  id: 91, job_number: 1352, customer_id: 'cust-9', customer_name: 'Maria Shikongo', customer_phone: '0812223344',
  customer_email: 'maria@example.com', handset_type: 'Samsung Galaxy A16', imei: '351317390710823',
  fault: 'Cracked screen', physical_condition: 'Scratched back', pattern_pin: null, deposit: 200, cost: 1500,
  handling_fee: 50, checks: {}, technician: 'Petrus', status: 'Ready for collection', notes: null,
  accept_token: 'tok', accepted_at: '2026-09-10T09:00:00Z', accepted_name: 'Maria', accepted_signature: null,
  accepted_user_agent: null, quote_amount: null, quote_note: null, quote_sent_at: null, quote_responded_at: null,
  quote_approved: null, collected_at: null, created_by: 'admin', created_at: '2026-09-10T08:30:00Z', updated_at: '2026-09-10T09:00:00Z',
};
const parts = { id: 85, name: 'PARTS', sku: 'SVC-PARTS', cost_price: 0, price: 0, active: true, category: 'Services', stock: 0, color: null };

async function mockShop(page: Page) {
  const inserted: Record<string, unknown>[] = [];
  const invoices: Record<string, unknown>[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('jr-importers-auth', JSON.stringify({
      access_token: 'test-token', refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'test-admin', email: 'admin@example.com', aud: 'authenticated' },
    }));
  });
  await page.route('**/config.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.JR_CONFIG = { SUPABASE_URL: "https://repair-test.supabase.co", SUPABASE_ANON_KEY: "test-anon-key" };',
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

    if (table === 'users') return reply([{ id: 'test-admin', role: 'admin', active: true, full_name: 'Test admin' }]);
    if (table === 'job_cards') return reply([job]);
    if (table === 'products') return reply([parts]);
    if (table === 'invoices' && request.method() === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      const row = { id: 700, invoice_number: 'INV12150', ...body };
      inserted.push(body);
      invoices.push(row);
      return route.fulfill({ status: 201, json: singular ? row : [row] });
    }
    if (table === 'invoices') {
      const wanted = url.searchParams.get('job_card_id') ?? url.searchParams.get('id');
      const rows = wanted ? invoices.filter((r) => String(r.job_card_id) === wanted.replace('eq.', '') || String(r.id) === wanted.replace('eq.', '')) : invoices;
      return reply(rows);
    }
    return reply([]);
  });
  return { inserted, invoices };
}

test('a job card raises its own invoice, linked, and opens it', async ({ page }) => {
  const { inserted } = await mockShop(page);
  await page.goto('/admin/#/job-cards');
  await page.getByRole('cell', { name: /Maria Shikongo/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Job Card 1352' })).toBeVisible();

  await page.getByRole('button', { name: 'Invoice this repair' }).click();

  // The invoice: one PARTS line for repair 1 500 + handling 50 - deposit 200.
  await expect.poll(() => inserted.length).toBe(1);
  const body = inserted[0]!;
  expect(body.job_card_id).toBe(91);
  expect(body.customer_name).toBe('Maria Shikongo');
  expect(body.status).toBe('sent');
  const items = body.items as Array<Record<string, unknown>>;
  expect(items).toHaveLength(1);
  expect(items[0]!.sku).toBe('SVC-PARTS');
  expect(items[0]!.name).toBe('Repair — Job #1352 · Samsung Galaxy A16 · Cracked screen');
  expect(items[0]!.price).toBe(1350);
  expect(body.total_amount).toBe(1350);
  expect(body.vat_amount).toBe(176.09);
  expect(body.notes).toContain('less deposit 200.00');

  // Handed straight to the invoice, which shows the repair it is for.
  await expect(page).toHaveURL(/#\/invoices/);
  await expect(page.getByText('Job #1352 — Maria Shikongo')).toBeVisible();
  await expect(page.locator('input[value="Repair — Job #1352 · Samsung Galaxy A16 · Cracked screen"]')).toBeVisible();
});

test('an invoice can pick its job card and gets the repair line and the customer', async ({ page }) => {
  await mockShop(page);
  await page.goto('/admin/#/invoices');
  await page.getByRole('button', { name: 'New' }).click();

  await page.getByPlaceholder('Search by job number, customer, handset or IMEI').fill('1352');
  await page.getByRole('button', { name: /Job #1352 — Maria Shikongo/ }).click();

  await expect(page.getByText('Job #1352 — Maria Shikongo')).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^Customer/ }).first()).toHaveValue('Maria Shikongo');
  await expect(page.locator('input[value="Repair — Job #1352 · Samsung Galaxy A16 · Cracked screen"]')).toBeVisible();
  await expect(page.locator('input[value="1350"]')).toBeVisible();

  // Picking the same job card again does not add a second line.
  await page.getByRole('button', { name: 'Unlink' }).click();
  await page.getByPlaceholder('Search by job number, customer, handset or IMEI').fill('Maria');
  await page.getByRole('button', { name: /Job #1352 — Maria Shikongo/ }).click();
  await expect(page.locator('input[value="Repair — Job #1352 · Samsung Galaxy A16 · Cracked screen"]')).toHaveCount(1);
});

test('a job card already invoiced shows the invoice instead of raising another', async ({ page }) => {
  const { invoices } = await mockShop(page);
  invoices.push({ id: 700, invoice_number: 'INV12150', job_card_id: 91, status: 'sent', total_amount: 1350 });
  await page.goto('/admin/#/job-cards');
  await page.getByRole('cell', { name: /Maria Shikongo/ }).first().click();
  await expect(page.getByRole('button', { name: 'Invoiced · INV12150' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invoice this repair' })).toHaveCount(0);
});
