import { expect, test, type Page } from '@playwright/test';
import type { ProductRow } from '../src/lib/database.types';

// Production registers an offline worker; network interception must also cover
// reloads so cached responses cannot escape this fixture or reach shop records.
test.use({ serviceWorkers: 'block' });

// Keep the shopping journey deterministic and isolated from shop records.
const product = (overrides: Partial<ProductRow>): ProductRow => ({
  id: 901, name: 'Samsung Coast 128GB', brand: 'Samsung', category: 'Smartphones',
  description: 'An everyday handset with a bright display and all-day battery.',
  price: 3200, cost_price: 0, stock: 3, reorder_level: 1, sku: 'QA-SAM-128',
  barcode: null, color: null, image: '/icon-192.png', image1: '/logo.png',
  image2: null, image3: null, image4: null, image5: null,
  spec_display: '6.5-inch AMOLED', spec_processor: 'Octa-core', spec_ram: '8GB',
  spec_storage: '128GB', spec_battery: '5000mAh', spec_back_camera: '50MP',
  spec_front_camera: '13MP', spec_os: 'Android', spec_weight: null, spec_extras: null,
  active: true, show_online: true, featured: true,
  created_at: '2026-09-01T12:00:00Z', updated_at: '2026-09-01T12:00:00Z',
  ...overrides,
});

const PRODUCTS = [
  product({}),
  product({ id: 902, name: 'Ulefone Dune 256GB', brand: 'Ulefone', price: 2700, stock: 4, featured: false, spec_storage: '256GB' }),
  product({ id: 903, name: 'Samsung Horizon Ultra', price: 10500, stock: 2, spec_ram: '12GB' }),
  product({ id: 904, name: 'Samsung Coast Tab', category: 'Tablets', price: 4500, stock: 2 }),
];

async function mockShop(page: Page) {
  const reads: URL[] = [];
  const writes: string[] = [];
  const faults: string[] = [];
  page.on('pageerror', (error) => faults.push(error.message));

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      writes.push(`${request.method()} ${url.pathname}`);
      await route.fulfill({ status: 403, json: { message: 'Writes are blocked by storefront QA.' } });
      return;
    }
    if (url.pathname === '/config.js') {
      await route.fulfill({
        contentType: 'application/javascript',
        body: 'window.JR_CONFIG = { SUPABASE_URL: "https://storefront-test.supabase.co", SUPABASE_ANON_KEY: "test-anon-key" };',
      });
      return;
    }
    if (!url.pathname.startsWith('/rest/v1/') && !url.pathname.startsWith('/auth/v1/')) {
      await route.continue();
      return;
    }

    reads.push(url);
    const table = url.pathname.split('/').at(-1);
    let rows: Array<Record<string, unknown>> = [];
    if (table === 'products') {
      let selected = [...PRODUCTS];
      for (const [column, value] of url.searchParams) {
        if (!['id', 'category', 'brand', 'price', 'stock', 'featured', 'active', 'show_online'].includes(column)) continue;
        const [operator, ...rest] = value.split('.');
        const operand = rest.join('.');
        selected = selected.filter((row) => {
          const field = row[column as keyof ProductRow];
          if (operator === 'eq') return String(field) === operand;
          if (operator === 'neq') return String(field) !== operand;
          if (operator === 'gt') return Number(field) > Number(operand);
          if (operator === 'gte') return Number(field) >= Number(operand);
          if (operator === 'lte') return Number(field) <= Number(operand);
          if (operator === 'in') return operand.slice(1, -1).split(',').map((part) => part.replaceAll('"', '')).includes(String(field));
          return true;
        });
      }
      const search = url.searchParams.getAll('or').join(',').match(/name\.ilike\.%([^%]+)%/)?.[1]?.toLowerCase();
      if (search) selected = selected.filter((row) => [row.name, row.brand, row.description, row.sku, row.category].some((value) => value?.toLowerCase().includes(search)));
      const order = url.searchParams.get('order') ?? '';
      if (order.startsWith('price.')) selected.sort((a, b) => order.includes('desc') ? b.price - a.price : a.price - b.price);
      if (order.startsWith('name.')) selected.sort((a, b) => a.name.localeCompare(b.name));
      rows = selected.slice(0, Number(url.searchParams.get('limit') ?? 300));
    }
    if (table === 'product_imeis' && url.searchParams.get('product_id') === 'eq.901') {
      rows = [{ color: 'Black' }, { color: 'Black' }, { color: 'Blue' }];
    }
    const singular = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    await route.fulfill({
      json: singular ? rows[0] ?? null : rows,
      headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` },
    });
  });

  return { reads, writes, faults };
}

async function expectNoPageOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

test('mobile shoppers can open categories and type a product search', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const network = await mockShop(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Close menu', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await page.locator('header a:visible').filter({ hasText: /^Tablets$/ }).click();
  await expect(page).toHaveURL(/\/shop\/tablets$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Tablets' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeVisible();

  if (await page.locator('input[type="search"]:visible').count() === 0) {
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  }
  const search = page.locator('header input[type="search"]:visible').first();
  await search.fill('Ulefone Dune');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/shop\?q=Ulefone%20Dune$/);
  await expect(page.getByRole('heading', { level: 3, name: 'Ulefone Dune 256GB' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Samsung Coast 128GB' })).toHaveCount(0);
  await expectNoPageOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('mobile-search.png'), fullPage: true });
  expect(network.writes).toEqual([]);
  expect(network.faults).toEqual([]);
});

test('tablet filters preserve brand, budget and sort behaviour', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  const network = await mockShop(page);
  await page.goto('/shop/phones');
  await expect(page.locator('main article')).toHaveCount(3);
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByTestId('facet-brand').getByRole('button', { name: /^Samsung/ }).click();
  await expect(page.locator('main article')).toHaveCount(2);
  await page.getByRole('button', { name: 'Under N$4 000', exact: true }).click();
  await expect(page.locator('main article')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 3, name: 'Samsung Coast 128GB' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('brand')).toBe('Samsung');
  expect(new URL(page.url()).searchParams.get('max')).toBe('4000');
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await page.getByLabel('Sort by', { exact: true }).selectOption('price-desc');
  await expect(page.locator('main article').first().getByRole('heading', { level: 3 })).toHaveText('Samsung Horizon Ultra');
  await expectNoPageOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('tablet-catalogue.png'), fullPage: true });
  expect(network.reads.some((url) => url.searchParams.get('brand') === 'eq.Samsung' && url.searchParams.get('price') === 'lte.4000')).toBe(true);
  expect(network.writes).toEqual([]);
  expect(network.faults).toEqual([]);
});

test('colour availability, gallery and cart quantity controls still work', async ({ page }) => {
  const network = await mockShop(page);
  await page.goto('/product/901-samsung-coast-128gb');
  await expect(page.getByRole('heading', { level: 1, name: 'Samsung Coast 128GB' })).toBeVisible();
  await page.getByRole('button', { name: 'View image 2 of 2' }).click();
  await expect(page.getByRole('button', { name: 'View image 2 of 2' })).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Add to cart', exact: true }).first().click();
  await expect(page.getByText('Choose a colour', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cart, 0 items', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Blue\s*1$/ }).click();
  await expect(page.getByRole('button', { name: 'Increase quantity', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /^Black\s*2$/ }).click();
  await page.getByRole('button', { name: 'Increase quantity', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Increase quantity', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Add to cart', exact: true }).first().click();
  await page.getByRole('link', { name: 'Cart, 2 items', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your cart', exact: true })).toBeVisible();
  await expect(page.getByText('Black', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Decrease quantity of Samsung Coast 128GB' }).click();
  await expect(page.getByRole('link', { name: 'Cart, 1 item', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Cart, 1 item', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Increase quantity of Samsung Coast 128GB' }).click();
  await expect(page.getByRole('link', { name: 'Cart, 2 items', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove Samsung Coast 128GB', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your cart is empty', exact: true })).toBeVisible();
  expect(network.writes).toEqual([]);
  expect(network.faults).toEqual([]);
});

test('comparison retains selected phones and reads their live colours', async ({ page }) => {
  const network = await mockShop(page);
  await page.goto('/shop/phones');
  await page.getByRole('button', { name: 'Compare Samsung Coast 128GB', exact: true }).click();
  await page.getByRole('button', { name: 'Compare Ulefone Dune 256GB', exact: true }).click();
  await page.getByRole('link', { name: 'Compare, 2 products', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Compare products', exact: true })).toBeVisible();
  await expect(page.getByText('Black', { exact: true })).toBeVisible();
  await expect(page.getByText('Blue', { exact: true })).toBeVisible();
  await expect(page.getByText('3 in stock', { exact: true })).toBeVisible();
  await expect(page.getByText('4 in stock', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Compare, 2 products', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove Samsung Coast 128GB', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Compare, 1 product', exact: true })).toBeVisible();
  expect(network.writes).toEqual([]);
  expect(network.faults).toEqual([]);
});

test('mobile checkout validates contact and delivery then preserves the sign-in destination', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const network = await mockShop(page);
  await page.addInitScript(() => localStorage.setItem('jr-cart-v2', JSON.stringify([{
    product_id: 902, name: 'Ulefone Dune 256GB', sku: 'QA-ULE-256', price: 2700,
    quantity: 1, color: null, image: '/icon-192.png', available_stock: 4,
  }])));
  await page.goto('/checkout');
  const placeOrder = page.getByRole('button', { name: 'Place order', exact: true });
  await placeOrder.click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('textbox', { name: 'Full name', exact: true })).toBeFocused();
  await page.getByRole('textbox', { name: 'Full name', exact: true }).fill('Test Shopper');
  await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('0812345678');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('shopper@example.com');
  await page.getByLabel('Method', { exact: true }).selectOption('Courier');
  await placeOrder.click();
  await expect(page.getByRole('textbox', { name: 'Delivery address', exact: true })).toBeFocused();
  await expect(page).toHaveURL(/\/checkout$/);
  await page.getByRole('textbox', { name: 'Delivery address', exact: true }).fill('12 Test Street, Walvis Bay');
  await expectNoPageOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('mobile-checkout.png'), fullPage: true });
  await placeOrder.click();
  await expect(page).toHaveURL(/\/account\/sign-in\?next=\/checkout$/);
  await expect(page.getByRole('heading', { name: /Sign in/i })).toBeVisible();
  expect(network.writes).toEqual([]);
  expect(network.faults).toEqual([]);
});
