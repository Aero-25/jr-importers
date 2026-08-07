import { expect, test, type Page } from '@playwright/test';

/**
 * Smoke tests: does it boot, and do the screens render?
 *
 * Deliberately not asserting on data. There are no database credentials here,
 * so anything that depends on live rows would either need secrets in CI or a
 * fixture that drifts from reality. What these catch is the failure that
 * actually happens: a change that white-screens a route, breaks a chunk, or
 * throws during boot.
 */

/** Fails the test on any console error or page exception, not just assertions. */
function watchForFaults(page: Page): string[] {
  const faults: string[] = [];

  page.on('pageerror', (error) => faults.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // Network failures are expected: CI has no Supabase credentials.
    if (/Failed to load resource|net::ERR|supabase|Failed to fetch/i.test(text)) return;
    faults.push(`console: ${text}`);
  });

  return faults;
}

test('the shop loads and shows the brand', async ({ page }) => {
  const faults = watchForFaults(page);

  await page.goto('/');
  await expect(page).toHaveTitle(/JR Importers/i);
  await expect(page.locator('#root')).not.toBeEmpty();

  expect(faults, faults.join('\n')).toEqual([]);
});

test('the shop renders a phones page', async ({ page }) => {
  const faults = watchForFaults(page);

  await page.goto('/shop/phones');
  await expect(page.locator('#root')).not.toBeEmpty();
  await page.waitForTimeout(1500);

  expect(faults, faults.join('\n')).toEqual([]);
});

test('the admin console boots to its sign-in screen', async ({ page }) => {
  const faults = watchForFaults(page);

  await page.goto('/admin/');
  await expect(page.locator('#root')).not.toBeEmpty();
  // Not signed in, so the console must show a way in rather than a blank page.
  await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: 15_000 });

  expect(faults, faults.join('\n')).toEqual([]);
});

test('a job card link resolves instead of 404ing', async ({ page }) => {
  // This exact route was dead in production for days: the host bypassed the
  // redirect rules and the page never got served. It is worth a test.
  const response = await page.goto('/jobcard/?t=smoke-test-token');
  expect(response?.status()).toBe(200);
  await expect(page.locator('#root')).not.toBeEmpty();
});

test('the terms and privacy pages are reachable from the footer', async ({ page }) => {
  for (const path of ['/terms.html', '/privacy.html']) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} should be served`).toBe(200);
  }
});

test('the sitemap lists products and robots points at it', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);

  const xml = await sitemap.text();
  expect(xml).toContain('<urlset');
  // Product URLs must carry the same id-slug shape the site links to, or every
  // handset gets indexed under two addresses.
  expect(xml).toMatch(/<loc>[^<]+\/product\/\d+-[a-z0-9-]+<\/loc>/);

  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  const text = await robots.text();
  expect(text).toContain('Sitemap:');
  expect(text).toContain('Disallow: /admin');
});
