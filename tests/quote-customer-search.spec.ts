import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });

test('quotes search customers by typing on a tablet and save the selected contact', async ({ page }, testInfo) => {
  const customer = { id: 'customer-2492', name: 'Zelda Tablet', phone: '0812345678', email: 'zelda@example.com', account_code: 'ZT2492' };
  const quote = {
    id: 42, quote_number: 'Q42', customer_name: 'Previous Customer', customer_id: 'previous',
    customer_email: 'previous@example.com', customer_phone: '0811111111', status: 'draft',
    created_at: '2026-09-07T10:00:00Z',
    items: [{ product_id: 1, name: 'Handset', price: 100, quantity: 1, line_total: 100 }],
    total_amount: 100, subtotal_amount: 86.96, vat_amount: 13.04,
  };
  const searches: URL[] = [];
  const saves: Record<string, unknown>[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('jr-importers-auth', JSON.stringify({
      access_token: 'test-token', refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'test-staff', email: 'staff@example.com', aud: 'authenticated' },
    }));
  });
  await page.route('**/config.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.JR_CONFIG = { SUPABASE_URL: "https://quote-test.supabase.co", SUPABASE_ANON_KEY: "test-anon-key" };',
  }));
  await page.route('**/*.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1);
    let rows: Record<string, unknown>[] = [];
    if (table === 'users') rows = [{ id: 'test-staff', role: 'cashier', active: true, full_name: 'Test cashier' }];
    if (table === 'quotes') {
      if (request.method() === 'PATCH') saves.push(request.postDataJSON());
      rows = [{ ...quote, ...saves.at(-1) }];
    }
    if (table === 'customers') {
      searches.push(url);
      rows = url.searchParams.get('or')?.includes('NoMatch') ? [] : [customer];
    }
    const singular = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    await route.fulfill({ json: singular ? rows[0] ?? null : rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  });

  await page.goto('/admin/#/quotes');
  await page.getByRole('cell', { name: 'Previous Customer', exact: true }).tap();
  const input = page.getByRole('textbox', { name: 'Customer', exact: true });
  await expect(input).toHaveValue('Previous Customer');
  expect(searches).toHaveLength(0);
  await input.fill('');
  await expect(input).toHaveValue('');

  for (const term of ['Zelda', 'ZT2492', '0812345678', 'zelda@example.com']) {
    await input.fill(term);
    await expect.poll(() => searches.at(-1)?.searchParams.get('or')).toContain(`name.ilike.%${term}%`);
    const query = searches.at(-1)!;
    for (const column of ['account_code', 'phone', 'email']) expect(query.searchParams.get('or')).toContain(`${column}.ilike.%${term}%`);
    expect(query.searchParams.get('limit')).toBe('20');
    await expect(page.getByRole('button', { name: /Zelda Tablet/ })).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath('quote-customer-search-tablet.png') });
  await page.getByRole('button', { name: /Zelda Tablet/ }).tap();
  await expect(input).toHaveValue('Zelda Tablet');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(customer.email);
  await expect(page.getByLabel('Phone', { exact: true })).toHaveValue(customer.phone);
  await expect(page.getByRole('button', { name: /Zelda Tablet/ })).toHaveCount(0);

  await input.fill('NoMatch');
  await expect(page.getByText('No customer matches that.', { exact: true })).toBeVisible();
  await input.fill('Zelda');
  await page.getByRole('button', { name: /Zelda Tablet/ }).tap();
  await page.getByRole('button', { name: 'Save changes', exact: true }).tap();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0]).toMatchObject({ customer_id: customer.id, customer_name: customer.name, customer_email: customer.email, customer_phone: customer.phone });
});
