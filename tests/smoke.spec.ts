import { expect, test, type Page } from '@playwright/test';

/**
 * Critical-path smoke tests against the built site and the live Supabase
 * project. These are deliberately shallow: they prove the bundle boots, the
 * data layer reaches the database, and the paths a customer or cashier hits
 * first do not throw.
 */

/** Fails the test on any uncaught page error, not just on a bad assertion. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test.describe('storefront', () => {
  test('home page renders products from the live catalogue', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');

    await expect(page).toHaveTitle(/JR Importers/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('import prices');

    // Product rails are data-driven; a card proves Supabase responded.
    const firstCard = page.locator('article').first();
    await expect(firstCard).toBeVisible({ timeout: 20_000 });
    await expect(firstCard.getByText(/N\$/)).toBeVisible();

    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('catalogue lists products and filters by brand', async ({ page }) => {
    await page.goto('/shop');

    await expect(page.getByRole('heading', { name: 'All phones' })).toBeVisible();
    await expect(page.locator('article').first()).toBeVisible({ timeout: 20_000 });

    // Scoped to the brand facet specifically — the sidebar also holds budget
    // buttons, which write `min`/`max` rather than `brand`.
    const brandButton = page.getByTestId('facet-brand').getByRole('button').first();
    await expect(brandButton).toBeVisible({ timeout: 20_000 });
    await brandButton.click();
    await expect(page).toHaveURL(/[?&]brand=/);
  });

  test('budget bands filter by price', async ({ page }) => {
    await page.goto('/shop/phones');
    await expect(page.locator('article').first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /under n\$4/i }).click();
    await expect(page).toHaveURL(/[?&]max=4000/);
  });

  test('the shop is scoped to phones, not the whole warehouse', async ({ page }) => {
    await page.goto('/shop');
    await expect(page.locator('article').first()).toBeVisible({ timeout: 20_000 });

    // Laptops, drones and cameras exist in the database but are off the shop.
    const headings = await page.locator('article h3').allInnerTexts();
    expect(headings.join(' | ')).not.toMatch(/macbook|drone|canon eos/i);
  });

  test('a product opens on its own URL and can be added to the cart', async ({ page }) => {
    await page.goto('/shop');
    await expect(page.locator('article').first()).toBeVisible({ timeout: 20_000 });

    await page.locator('article h3 a').first().click();
    await expect(page).toHaveURL(/\/product\/\d+/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const addToCart = page.getByRole('button', { name: /add to cart/i }).first();
    if (await addToCart.isEnabled()) {
      await addToCart.click();
      await page.goto('/cart');
      await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
      await expect(page.getByRole('button', { name: /^checkout$/i })).toBeVisible();
    }
  });

  test('deep links resolve without a server rewrite', async ({ page }) => {
    // Proves the 404.html / _redirects fallback works for links a customer
    // receives rather than clicks through to.
    const response = await page.goto('/shop?q=phone');
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('unknown routes render the 404 page, not a blank screen', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByText('404')).toBeVisible();
  });
});

test.describe('job card link', () => {
  test('an invalid token is rejected with a way to get help', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/jobcard/not-a-real-token-000000000000000000');

    await expect(page.getByRole('heading', { name: /link not valid/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('link', { name: /call/i })).toBeVisible();

    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('renders without the shop chrome', async ({ page }) => {
    await page.goto('/jobcard/not-a-real-token-000000000000000000');
    // No cart link: this page is a task, not a shopping session.
    await expect(page.getByRole('link', { name: /cart/i })).toHaveCount(0);
  });
});

test.describe('retail console', () => {
  test('requires sign-in and does not leak the module list', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/admin.html');

    await expect(page.getByRole('heading', { name: 'Retail Console' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByLabel(/staff email/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

    // Navigation must not render for an anonymous visitor.
    await expect(page.getByRole('link', { name: 'POS Terminal' })).toHaveCount(0);

    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('hash routing keeps deep links working', async ({ page }) => {
    // Hash routes never reach the server, so this must load the console shell
    // rather than 404 — the property that makes the APK work.
    const response = await page.goto('/admin.html#/pos');
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole('heading', { name: 'Retail Console' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('is excluded from search engines', async ({ page }) => {
    await page.goto('/admin.html');
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute('content', /noindex/);
  });
});
