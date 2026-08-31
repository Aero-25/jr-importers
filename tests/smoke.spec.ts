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

test('the icon set is served and the head points at it', async ({ page, request }) => {
  for (const icon of ['/favicon.ico', '/icon-32.png', '/icon-180.png', '/icon-192.png', '/logo.png']) {
    const response = await request.get(icon);
    expect(response.status(), `${icon} should be served`).toBe(200);
  }

  await page.goto('/');

  // Vite fingerprints these into /assets/, so the assertion is on the shape of
  // the reference rather than the literal path — the unhashed copies above are
  // what a browser asks for by convention when the tags are missing.
  const favicon = await page.locator('link[rel="icon"]').first().getAttribute('href');
  expect(favicon).toMatch(/\.(ico|png|svg)$/);

  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(touch).toMatch(/\.png$/);

  // The old build pointed og:image and the JSON-LD at a host that never
  // resolved, which is invisible until somebody shares a link.
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(ogImage).not.toContain('pages.dev');
});

// Headless Chromium reports prefers-reduced-motion: reduce, and the hero
// correctly refuses to animate under it. Opting in is what makes the first of
// these a test of the motion rather than a test of the reduced-motion guard.
test.describe('hero', () => {
  test.describe('with motion allowed', () => {
    test.use({ reducedMotion: 'no-preference' });

    test('the hero shifts as the page scrolls', async ({ page }) => {
      await page.goto('/');

      const hero = page.locator('[data-hero]');
      await expect(hero).toBeVisible();

      const read = () =>
        hero.evaluate((el) => getComputedStyle(el).getPropertyValue('--parallax').trim());

      // useParallax writes --parallax on first run, so it starts settled at 0.
      expect(await read()).toBe('0px');

      // The page has to be long enough to scroll before any of this means
      // anything — with an empty catalogue the home page is much shorter, and
      // a wheel event on an unscrollable page silently does nothing.
      await expect
        .poll(() => page.evaluate(() => document.body.scrollHeight - window.innerHeight), {
          timeout: 10_000,
        })
        .toBeGreaterThan(200);

      // scrollTo rather than mouse.wheel: it is synchronous and cannot be
      // swallowed by a page that is still settling under parallel test load.
      await page.evaluate(() => window.scrollTo(0, 400));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

      // The write is coalesced into an animation frame rather than done inline.
      await expect.poll(read, { timeout: 5_000 }).not.toBe('0px');
    });
  });

  test('and stays put when reduced motion is asked for', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');

    const hero = page.locator('[data-hero]');
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(500);

    // useParallax bails before attaching its scroll listener, so the property
    // is never written and resolves to empty rather than a pixel value.
    expect(
      await hero.evaluate((el) => getComputedStyle(el).getPropertyValue('--parallax').trim()),
    ).toBe('');

    // But the content must still be on screen. useReveal starts every .reveal
    // element at opacity 0 and adds is-in to bring it in; if that were skipped
    // along with the animation, a reduced-motion visitor would get a blank hero.
    await expect(page.locator('h1.reveal')).toHaveClass(/is-in/);
    await expect(page.locator('h1.reveal')).toBeVisible();

    await context.close();
  });
});
