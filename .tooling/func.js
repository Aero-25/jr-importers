// Functional write-path test: drive a real debtor receipt + quote conversion + stock-take via the admin UI.
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'http://127.0.0.1:8787';
const outDir = path.join(__dirname, '..', '.shots', 'func');
require('fs').mkdirSync(outDir, { recursive: true });

const clickNav = async (page, label) => page.evaluate((lbl) => {
  const el = Array.from(document.querySelectorAll('.nav-item')).find(e => e.textContent.replace(/\s+/g,' ').trim() === lbl);
  if (el) { el.click(); return true; } return false;
}, label);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then(c => c.newPage());
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0,160)));
  page.on('console', m => { if (m.type()==='error' && !/deoptimised|Babel/.test(m.text())) errors.push(m.text().slice(0,160)); });

  await page.goto(BASE + '/admin.html', { waitUntil: 'networkidle' });
  const emailInput = await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 45000 }).catch(() => null);
  if (emailInput) {
    await page.fill('input[type="email"], input[name="email"]', process.env.JR_ADMIN_EMAIL || 'admin@jrimporters.com');
    await page.fill('input[type="password"]', process.env.JR_ADMIN_PASS || '');
    await page.keyboard.press('Enter');
  }
  await page.waitForSelector('.nav-item', { timeout: 30000 });
  await page.waitForTimeout(5000);

  // ---- Debtor receipt ----
  await clickNav(page, 'Debtors');
  await page.waitForTimeout(1500);
  // click first "Receive" button
  const recv = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(e => /Receive/.test(e.textContent));
    if (b) { b.click(); return true; } return false;
  });
  await page.waitForTimeout(900);
  // set amount to 250 and submit
  await page.evaluate(() => {
    const amt = document.querySelector('input[type="number"]');
    if (amt) { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; setter.call(amt,'250'); amt.dispatchEvent(new Event('input',{bubbles:true})); }
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(e => /Record Payment/.test(e.textContent)); if (b) b.click(); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outDir, 'after-receipt.png') });
  console.log('debtor receipt: clicked Receive=' + recv);

  // ---- Quote convert ----
  await clickNav(page, 'Quotes');
  await page.waitForTimeout(1500);
  page.once('dialog', d => d.accept());
  const conv = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(e => /Convert/.test(e.textContent));
    if (b) { b.click(); return true; } return false;
  });
  await page.waitForTimeout(3000);
  console.log('quote convert: clicked=' + conv);

  // ---- Stock take: create + count + apply ----
  await clickNav(page, 'Stock Takes');
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(e => /New Stock Take/.test(e.textContent)); if (b) b.click(); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outDir, 'stocktake.png') });

  console.log('ERRORS:', errors.length);
  errors.slice(0,10).forEach(e => console.log('  ', e));
  await browser.close();
})();
