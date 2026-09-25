import { expect, test, type Page, type Request } from '@playwright/test';
import { classifyLanding, deviceType, isBot } from '../src/lib/trafficSource';

/**
 * The website counts its own visitors, and the console's Analytics screen
 * says how many came and where from. The numbers are only worth having if the
 * source is right — a WhatsApp link credited to "Direct" hides the one channel
 * this shop lives on — and if the shop's own browsing stays out of them.
 */

// Production registers an offline worker; interception must see every request.
test.use({ serviceWorkers: 'block' });

const LIVE_CONFIG =
  'window.JR_CONFIG = { SITE_URL: "http://127.0.0.1:4173", SUPABASE_URL: "https://analytics-test.supabase.co", SUPABASE_ANON_KEY: "test-anon-key" };';
const PREVIEW_CONFIG =
  'window.JR_CONFIG = { SUPABASE_URL: "https://analytics-test.supabase.co", SUPABASE_ANON_KEY: "test-anon-key" };';

interface VisitCall {
  p_session: string;
  p_visitor: string;
  p_path: string;
  p_landing: Record<string, string | null> | null;
}

/** Serves the shop with no data, and records every visit it tries to count. */
async function mockShop(page: Page, configScript: string) {
  const visits: VisitCall[] = [];

  await page.route('**/config.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: configScript }),
  );
  // In production the site's Cloudflare worker answers this from the connection.
  await page.route('**/api/geo', (route) => route.fulfill({ json: { country: 'NA', city: 'Walvis Bay' } }));
  await page.route('**/*.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/rpc/record_site_visit')) {
      visits.push(request.postDataJSON() as VisitCall);
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ json: [], headers: { 'content-range': '*/0' } });
  });

  return visits;
}

/*
  Playwright announces itself through `navigator.webdriver`, which the counter
  treats as a robot. Hidden here so the counter can be watched working.
*/
async function actLikeAPerson(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
  });
}

test('a visit to the live site is counted once, with where it came from', async ({ page }) => {
  await actLikeAPerson(page);
  const visits = await mockShop(page, LIVE_CONFIG);

  await page.goto('/?utm_source=fb&utm_medium=paid&utm_campaign=spring-sale');
  await expect.poll(() => visits.length).toBe(1);

  const [landing] = visits;
  expect(landing!.p_path).toBe('/');
  expect(landing!.p_landing).toMatchObject({
    source: 'Facebook',
    channel: 'Ads',
    utm_source: 'fb',
    utm_medium: 'paid',
    utm_campaign: 'spring-sale',
    device: 'desktop',
    country: 'NA',
    city: 'Walvis Bay',
  });

  // Clicking on inside the shop is the same sitting, and says nothing new
  // about where the shopper came from.
  await page.locator('footer').getByRole('link', { name: 'About us' }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect.poll(() => visits.length).toBe(2);
  expect(visits[1]).toMatchObject({
    p_session: landing!.p_session,
    p_visitor: landing!.p_visitor,
    p_path: '/about',
    p_landing: null,
  });

  // An order id is the key to that customer's confirmation page. The report
  // only needs to know one was opened.
  await page.goto('/order/5f1c2d7e-8a44-4d3c-9d0b-2b6f0f7b9c11');
  await expect.poll(() => visits.length).toBe(3);
  expect(visits[2]).toMatchObject({ p_session: landing!.p_session, p_path: '/order/:id', p_landing: null });
  expect(JSON.stringify(visits)).not.toContain('5f1c2d7e');
});

test('previews, the test suite and staff devices are not counted as visitors', async ({ page }) => {
  // Not the live address: a Cloudflare preview, a local build, this suite.
  const previewVisits = await mockShop(page, PREVIEW_CONFIG);
  await actLikeAPerson(page);
  await page.goto('/');
  await expect(page.locator('#root')).not.toBeEmpty();
  await page.waitForTimeout(1500);
  expect(previewVisits).toEqual([]);

  // The live address, but a browser a member of staff has signed in on.
  await page.unrouteAll();
  const staffVisits = await mockShop(page, LIVE_CONFIG);
  await page.evaluate(() => localStorage.setItem('jr-staff-device', '1'));
  await page.goto('/about');
  await expect(page.locator('#root')).not.toBeEmpty();
  await page.waitForTimeout(1500);
  expect(staffVisits).toEqual([]);
});

test('the source of a visit is read the way a shop owner would name it', () => {
  const ownHost = 'jrimporters.com';
  const from = (referrer: string, search = '', userAgent = '') =>
    classifyLanding({ referrer, search, ownHost, userAgent });

  // A link tapped in a WhatsApp chat on Android.
  expect(from('android-app://com.whatsapp/')).toMatchObject({
    source: 'WhatsApp',
    channel: 'Messaging',
    referrer_host: 'app:com.whatsapp',
  });
  expect(from('https://www.google.com.na/')).toMatchObject({ source: 'Google', channel: 'Search', referrer_host: 'google.com.na' });
  expect(from('https://mail.google.com/')).toMatchObject({ source: 'Gmail', channel: 'Email' });
  expect(from('https://l.facebook.com/', '?fbclid=abc')).toMatchObject({ source: 'Facebook', channel: 'Social' });
  expect(from('https://l.instagram.com/')).toMatchObject({ source: 'Instagram', channel: 'Social' });
  expect(from('https://www.namibian.com.na/news/story')).toMatchObject({
    source: 'namibian.com.na',
    channel: 'Referral',
  });

  // Tags the shop put on its own link beat whatever else is known.
  expect(from('https://l.facebook.com/', '?utm_source=whatsapp&utm_campaign=status')).toMatchObject({
    source: 'WhatsApp',
    channel: 'Messaging',
    utm_campaign: 'status',
  });
  expect(from('', '?utm_source=flyer&utm_campaign=counter')).toMatchObject({ source: 'Flyer', channel: 'Campaign' });
  expect(from('', '?utm_source=ig&utm_medium=cpc')).toMatchObject({ source: 'Instagram', channel: 'Ads' });
  expect(from('', '?gclid=xyz')).toMatchObject({ source: 'Google', channel: 'Ads' });

  // Clicking between the shop's own pages is not a referral.
  expect(from('https://www.jrimporters.com/shop')).toMatchObject({ source: 'Direct', channel: 'Direct', referrer_host: null });
  // Facebook's in-app browser hides the referrer but not itself.
  expect(from('', '', 'Mozilla/5.0 (iPhone) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]')).toMatchObject({
    source: 'Facebook',
    channel: 'Social',
  });
  expect(from('')).toMatchObject({ source: 'Direct', channel: 'Direct' });

  expect(deviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')).toBe('mobile');
  expect(deviceType('Mozilla/5.0 (Linux; Android 14; SM-A165F) Chrome/126.0 Mobile Safari/537.36')).toBe('mobile');
  expect(deviceType('Mozilla/5.0 (Linux; Android 14; SM-X110) Chrome/126.0 Safari/537.36')).toBe('tablet');
  expect(deviceType('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 5)).toBe('tablet');
  expect(deviceType('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36')).toBe('desktop');
  expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true);
  expect(isBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36')).toBe(false);
});

const report = {
  ok: true,
  days: 30,
  bucket: 'day',
  from: '2026-08-26T22:00:00Z',
  to: '2026-09-25T10:00:00Z',
  visitors: 412,
  new_visitors: 300,
  sessions: 530,
  page_views: 1590,
  bounced: 212,
  prev_visitors: 350,
  prev_sessions: 470,
  prev_page_views: 1500,
  today_visitors: 23,
  live_visitors: 2,
  first_visit_at: '2026-06-01T08:00:00Z',
  series: Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 7, 27 + i)).toISOString().slice(0, 10);
    const visitors = 8 + ((i * 7) % 11);
    return { date, visitors, sessions: visitors + 3, page_views: visitors * 3 };
  }),
  channels: [
    { channel: 'Messaging', visitors: 160, sessions: 210 },
    { channel: 'Search', visitors: 120, sessions: 150 },
    { channel: 'Social', visitors: 90, sessions: 110 },
    { channel: 'Direct', visitors: 42, sessions: 60 },
  ],
  sources: [
    { source: 'WhatsApp', channel: 'Messaging', visitors: 160, sessions: 210 },
    { source: 'Google', channel: 'Search', visitors: 120, sessions: 150 },
    { source: 'Facebook', channel: 'Social', visitors: 90, sessions: 110 },
    { source: 'Direct', channel: 'Direct', visitors: 42, sessions: 60 },
  ],
  campaigns: [
    { campaign: 'spring-sale', source: 'facebook', medium: 'paid', visitors: 40, sessions: 48 },
  ],
  pages: [
    { path: '/', views: 600, visitors: 380 },
    { path: '/shop/phones', views: 420, visitors: 250 },
    { path: '/product/901-samsung-galaxy-a16', views: 180, visitors: 120 },
  ],
  countries: [
    { country: 'NA', visitors: 380, sessions: 490 },
    { country: 'ZA', visitors: 32, sessions: 40 },
  ],
  cities: [
    { city: 'Walvis Bay', country: 'NA', visitors: 210, sessions: 270 },
    { city: 'Swakopmund', country: 'NA', visitors: 110, sessions: 140 },
  ],
  devices: [
    { device: 'mobile', visitors: 350, sessions: 450 },
    { device: 'desktop', visitors: 62, sessions: 80 },
  ],
};

test('the Analytics tab shows how many came and where they came from', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('jr-importers-auth', JSON.stringify({
      access_token: 'test-token', refresh_token: 'test-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'test-manager', email: 'manager@example.com', aud: 'authenticated' },
    }));
  });
  await page.route('**/config.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.JR_CONFIG = { SUPABASE_URL: "https://analytics-test.supabase.co", SUPABASE_ANON_KEY: "test-anon-key" };',
  }));

  const reportRequests: Request[] = [];
  await page.route('**/*.supabase.co/**', async (route) => {
    const request = route.request();
    const name = new URL(request.url()).pathname.split('/').at(-1);
    if (name === 'site_analytics') {
      reportRequests.push(request);
      await route.fulfill({ json: report });
      return;
    }
    const rows = name === 'users'
      ? [{ id: 'test-manager', role: 'admin', active: true, full_name: 'Test manager' }]
      : [];
    const singular = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    await route.fulfill({
      json: singular ? rows[0] ?? null : rows,
      headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` },
    });
  });

  await page.goto('/admin/#/');
  await page.getByRole('link', { name: 'Analytics' }).first().click();
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  expect(reportRequests[0]?.postDataJSON()).toEqual({ p_days: 30 });

  // The headline: how many, and whether that is up on the month before.
  const visitorsTile = page.locator('div').filter({ hasText: /^Visitors/ }).first();
  await expect(visitorsTile).toContainText('412');
  await expect(visitorsTile).toContainText('18%');
  await expect(visitorsTile).toContainText('300 new · 112 repeat');
  await expect(page.getByText('2 on the site now')).toBeVisible();

  // Where they came from, named the way the shop would name it.
  const panel = (title: string) => page.locator('section').filter({ hasText: title });
  await expect(panel('How they found you').getByRole('listitem').first()).toContainText(/Messaging.*210.*40%/);
  await expect(panel('Top sources').getByRole('listitem').filter({ hasText: 'WhatsApp' })).toContainText('210');
  await expect(panel('Countries').getByRole('listitem').filter({ hasText: 'Namibia' })).toContainText('380');
  await expect(panel('Towns & cities').getByRole('listitem').filter({ hasText: 'Walvis Bay' })).toContainText('210');
  await expect(panel('Most viewed pages').getByRole('listitem').filter({ hasText: 'Samsung galaxy a16' })).toContainText('180');
  await expect(page.getByRole('row').filter({ hasText: 'spring-sale' })).toContainText('facebook / paid');

  // Pointing at a bar gives that day's numbers.
  const bars = page.getByRole('img', { name: /Visitors per day/ });
  await bars.hover({ position: { x: 5, y: 150 } });
  await expect(bars.getByText(/27 Aug 2026/)).toBeVisible();
  await expect(bars).toContainText('8 visitors · 11 visits · 24 pages');

  // Switching the period asks the database for that period.
  await page.getByRole('button', { name: 'Last 7 days' }).click();
  await expect.poll(() => reportRequests.at(-1)?.postDataJSON()).toEqual({ p_days: 7 });

  // Signing in marks this browser as the shop's own, so it is not counted.
  expect(await page.evaluate(() => localStorage.getItem('jr-staff-device'))).toBe('1');

  await page.screenshot({ path: testInfo.outputPath('analytics.png'), fullPage: true });
});
