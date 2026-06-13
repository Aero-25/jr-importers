// Screenshot harness for JR Importers storefront + admin.
// Usage: node shoot.js <tag>   (tag is a label folder under ../.shots)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8787';
const ADMIN_EMAIL = process.env.JR_ADMIN_EMAIL || 'admin@jrimporters.com';
const ADMIN_PASS = process.env.JR_ADMIN_PASS || '';
const tag = process.argv[2] || 'shot';
const outDir = path.join(__dirname, '..', '.shots', tag);
fs.mkdirSync(outDir, { recursive: true });

const log = (...a) => console.log('•', ...a);

async function shoot(page, name, full = true) {
  const p = path.join(outDir, name + '.png');
  await page.screenshot({ path: p, fullPage: full });
  log('shot', name);
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  try {
    // ---- Storefront ----
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(3500);
    await shoot(page, '01-store-top', false);
    await shoot(page, '02-store-full', true);
    // scroll to product grid
    await page.evaluate(() => window.scrollBy(0, 1100));
    await page.waitForTimeout(800);
    await shoot(page, '03-store-products', false);

    // ---- Admin login ----
    await page.goto(BASE + '/admin.html', { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2500);
    await shoot(page, '10-admin-login', false);
    // fill login
    const emailSel = 'input[type="email"], input[name="email"]';
    const passSel = 'input[type="password"]';
    if (await page.$(emailSel)) {
      await page.fill(emailSel, ADMIN_EMAIL);
      await page.fill(passSel, ADMIN_PASS);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(6000);
      await shoot(page, '11-admin-dashboard', false);
      await shoot(page, '12-admin-dashboard-full', true);
      // try navigating to a few views via hash
      for (const v of ['pos', 'products', 'orders']) {
        await page.goto(BASE + '/admin.html#' + v, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        await shoot(page, '13-admin-' + v, false);
      }
    }
  } catch (e) {
    errors.push('FATAL: ' + e.message);
  }

  fs.writeFileSync(path.join(outDir, '_errors.txt'), errors.join('\n') || '(none)');
  log('errors:', errors.length);
  errors.slice(0, 30).forEach(e => console.log('   ', e));
  await browser.close();
})();
