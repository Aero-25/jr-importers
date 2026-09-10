import { expect, test } from '@playwright/test';

/**
 * The statement is assembled from four tables, and the whole point of it is
 * that the arithmetic is right: a client who paid cash at the till owes
 * nothing, an invoice raised on account is owed until a receipt lands, and
 * history carried over from IQ must not be charged twice — the opening
 * balance already holds it.
 */

const customer = {
  id: 'customer-77',
  name: 'Coastal Fisheries',
  email: 'accounts@coastal.example',
  phone: '0812223344',
  account_code: 'CF0077',
  address: '12 Harbour Road',
  city: 'Walvis Bay',
  region: 'Erongo',
  credit_limit: 5000,
  customer_type: 'account',
  active: true,
  created_at: '2024-01-04T08:00:00Z',
  updated_at: '2024-01-04T08:00:00Z',
};

const ledger = [
  {
    id: 1, account_type: 'debtor', customer_id: customer.id, supplier_id: null,
    party_name: customer.name, txn_type: 'opening', amount: 1200, method: null,
    reference: 'IQ opening balance', doc_type: null, doc_id: null, notes: null,
    txn_date: '2026-01-01', created_by: 'import', created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2, account_type: 'debtor', customer_id: customer.id, supplier_id: null,
    party_name: customer.name, txn_type: 'invoice', amount: 800, method: null,
    reference: 'INV-500', doc_type: 'invoice', doc_id: '500', notes: 'Invoice on account',
    txn_date: '2026-02-10', created_by: 'admin', created_at: '2026-02-10T09:00:00Z',
  },
  {
    id: 3, account_type: 'debtor', customer_id: customer.id, supplier_id: null,
    party_name: customer.name, txn_type: 'payment', amount: -500, method: 'EFT',
    reference: 'Receipt 91', doc_type: 'receipt', doc_id: null, notes: null,
    txn_date: '2026-02-20', created_by: 'admin', created_at: '2026-02-20T09:00:00Z',
  },
];

const invoices = [
  // Already on the ledger above: it must not be charged a second time.
  {
    id: 500, invoice_number: 'INV-500', customer_id: customer.id, customer_name: customer.name,
    items: [], total_amount: 800, subtotal_amount: 695.65, vat_amount: 104.35, status: 'sent',
    source: null, order_id: null, created_at: '2026-02-10T09:00:00Z',
  },
  // A till sale: invoiced and settled in the same breath, so it nets to zero.
  // Its description comes off the goods themselves.
  {
    id: 501, invoice_number: 'INV-501', customer_id: customer.id, customer_name: customer.name,
    items: [
      { name: 'Galaxy A16 128GB', quantity: 2, price: 1200 },
      { name: 'Screen protector', quantity: 1, price: 300 },
    ],
    total_amount: 2700, subtotal_amount: 2347.83, vat_amount: 352.17, status: 'paid',
    payment_method: 'Cash', source: 'pos', order_id: null,
    created_at: '2026-03-02T11:00:00Z', paid_at: '2026-03-02T11:00:00Z',
  },
  // IQ history: the debt is already inside the opening balance. It carries no
  // line items — IQ exported document headers only — so the description has to
  // come out of the header IQ gave us, whatever it named the column.
  {
    id: 502, invoice_number: 'IQ-9001', customer_id: customer.id, customer_name: customer.name,
    items: [], total_amount: 4300, subtotal_amount: 3739.13, vat_amount: 560.87, status: 'paid',
    source: 'iq-import', order_id: null, created_at: '2025-11-14T10:00:00Z',
    iq_data: { DOCNUMBER: 'IQ-9001', ACCOUNT: 'CF0077', TOTAL: '4300.00', DESCRIPT: 'Handsets for trawler crew' },
  },
  // An imported credit note: a document with a negative total.
  {
    id: 503, invoice_number: 'IQ-9002', customer_id: customer.id, customer_name: customer.name,
    items: [], total_amount: -900, status: 'paid', source: 'iq-import', order_id: null,
    created_at: '2025-11-20T10:00:00Z', iq_data: { COMMENT: 'Returned faulty charger' },
  },
];

const laybys = [
  {
    id: 7, layby_number: 'LAY-0007', customer_id: customer.id, customer_name: customer.name,
    items: [{ name: 'Galaxy A16', quantity: 1, price: 3000 }],
    total_amount: 3000, deposit_amount: 500, paid_amount: 500, balance_amount: 2500,
    payments: [{ amount: 500, method: 'Cash', date: '2026-03-05' }],
    status: 'active', created_at: '2026-03-05T08:30:00Z',
  },
];

test('a client statement pulls every transaction on the account and carries the balance down', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('jr-importers-auth', JSON.stringify({
      access_token: 'test-token', refresh_token: 'test-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'test-manager', email: 'manager@example.com', aud: 'authenticated' },
    }));
  });
  await page.route('**/config.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.JR_CONFIG = { SUPABASE_URL: "https://statement-test.supabase.co", SUPABASE_ANON_KEY: "test-anon-key" };',
  }));
  await page.route('**/*.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1);
    let rows: Record<string, unknown>[] = [];
    if (table === 'users') rows = [{ id: 'test-manager', role: 'admin', active: true, full_name: 'Test manager' }];
    if (table === 'customers') rows = [customer];
    if (table === 'account_transactions') rows = ledger;
    if (table === 'invoices') rows = invoices;
    if (table === 'laybys') rows = laybys;
    if (table === 'refunds') rows = [];
    const singular = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    await route.fulfill({
      json: singular ? rows[0] ?? null : rows,
      headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` },
    });
  });

  await page.goto('/admin/#/invoices');

  // Reached from Invoices, which is where staff go looking for it.
  await page.getByRole('button', { name: 'Client statements' }).click();
  await expect(page.getByRole('heading', { name: 'Client statements' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Client', exact: true }).fill('Coastal');
  await page.getByRole('button', { name: /Coastal Fisheries/ }).click();

  // Opening 1 200 + invoice 800 - receipt 500 = 1 500. The till sale charges
  // and settles 2 700, the IQ document and the layby move nothing.
  // The grouping mark depends on the browser's locale data for en-NA, so the
  // assertion reads the digits rather than the separator.
  const balanceTile = page.locator('div').filter({ hasText: /^Balance due/ }).first();
  await expect(balanceTile).toContainText(/1.500[.,]00/);

  // What each document was actually for, not a repeated internal label.
  await expect(page.getByText('Handsets for trawler crew')).toBeVisible();
  await expect(page.getByText('Galaxy A16 128GB x2, Screen protector')).toBeVisible();
  // A negative imported document is a credit note, and its money belongs in
  // the payments column — not a bill for minus nine hundred dollars.
  const creditRow = page.getByRole('row').filter({ hasText: 'Returned faulty charger' });
  await expect(creditRow).toContainText('Credit note');
  await expect(creditRow).toContainText(/900[.,]00/);

  await expect(page.getByRole('cell', { name: 'IQ-9001' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'LAY-0007' }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'INV-501 settled' })).toBeVisible();
  // INV-500 appears once — the ledger charge. The invoice row for the same
  // document is dropped, or the customer would be billed for it twice: 1 200
  // opening + 800 invoice + 2 700 till sale = 4 700 charged, not 5 500.
  await expect(page.getByRole('cell', { name: 'INV-500', exact: true })).toHaveCount(1);
  const chargedTile = page.locator('div').filter({ hasText: /^Charged/ }).first();
  await expect(chargedTile).toContainText(/4.700[.,]00/);

  await expect(page.getByText(/2.500[.,]00 still to run on laybys/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath('client-statement.png'), fullPage: true });
});
