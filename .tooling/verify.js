// Interactive end-to-end verification for JR Importers.
// Clicks through storefront flows and every admin view, capturing console/page errors per step.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8787';
const ADMIN_EMAIL = process.env.JR_ADMIN_EMAIL || 'admin@jrimporters.com';
const ADMIN_PASS = process.env.JR_ADMIN_PASS || '';
const outDir = path.join(__dirname, '..', '.shots', 'verify');
fs.mkdirSync(outDir, { recursive: true });

const ADMIN_VIEWS = ['dashboard','pos','orders','online-orders','dispatch','special-orders','back-in-stock','products','stock-alerts','customers','suppliers','purchase-orders','grv','invoices','coupons','hero-images','messages','expenses','users','settings'];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const report = [];
  let bucket = [];
  const tap = (label) => { bucket = []; report.push({ label, errors: bucket }); return bucket; };
  page.on('console', m => { if (m.type() === 'error' && !/deoptimised|Babel/.test(m.text())) bucket.push(m.text().slice(0,200)); });
  page.on('pageerror', e => bucket.push('PAGEERROR: ' + e.message.slice(0,200)));

  // ---------- STOREFRONT ----------
  tap('store:load');
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(3500);

  tap('store:open-product');
  try {
    const card = await page.$('.product-tile button');
    if (card) { await card.click(); await page.waitForTimeout(1500); }
    await page.screenshot({ path: path.join(outDir, 'store-product-modal.png') });
  } catch (e) { bucket.push('click fail: ' + e.message); }

  tap('store:add-to-cart');
  try {
    // close modal if open, then add first card
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    const addBtn = await page.$('.product-tile button.btn-primary');
    if (addBtn) { await addBtn.click(); await page.waitForTimeout(1200); }
  } catch (e) { bucket.push('add fail: ' + e.message); }

  // ---------- ADMIN ----------
  tap('admin:login');
  await page.goto(BASE + '/admin.html', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2500);
  try {
    await page.fill('input[type="email"], input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASS);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(6000);
  } catch (e) { bucket.push('login fail: ' + e.message); }

  // Enumerate sidebar nav items by their visible label and click each.
  const labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.nav-item'))
      .map(el => el.textContent.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  );
  const seen = new Set();
  let idx = 0;
  for (const label of labels) {
    const key = label.replace(/[0-9]+$/, '').trim();
    if (seen.has(key)) continue; seen.add(key);
    idx++;
    tap('admin:' + key);
    try {
      const ok = await page.evaluate((lbl) => {
        const el = Array.from(document.querySelectorAll('.nav-item'))
          .find(e => e.textContent.replace(/\s+/g,' ').trim() === lbl);
        if (el) { el.click(); return true; }
        return false;
      }, label);
      if (!ok) { bucket.push('nav-item not found'); continue; }
      await page.waitForTimeout(1700);
      const slug = key.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await page.screenshot({ path: path.join(outDir, 'admin-' + String(idx).padStart(2,'0') + '-' + slug + '.png') });
    } catch (e) { bucket.push('nav fail: ' + e.message); }
  }

  await browser.close();
  const summary = report.map(r => `${r.errors.length ? 'FAIL' : ' ok '}  ${r.label}${r.errors.length ? '\n      ' + r.errors.join('\n      ') : ''}`).join('\n');
  fs.writeFileSync(path.join(outDir, '_report.txt'), summary);
  console.log(summary);
  const fails = report.filter(r => r.errors.length).length;
  console.log('\nTOTAL STEPS:', report.length, ' FAILURES:', fails);
})();
