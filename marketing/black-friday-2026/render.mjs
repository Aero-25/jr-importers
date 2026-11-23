// Renders comp.html deterministically: seek(t) → screenshot → ffmpeg.
//   node render.mjs stills 0.5,2.3,...     → stills/t-<t>.png
//   node render.mjs video [fps] [out.mp4]  → silent master; use 30 (comp.html draws its own motion blur)
//   node render.mjs serve                  → http://127.0.0.1:8787/comp.html?play  (real-time preview, no sound)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const types = { '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png' };
// Brand files are read straight from the shop so the spot never drifts from it.
const repo = path.resolve(root, '..', '..');
const brand = {
  '/assets/archivo-latin.woff2': 'public/fonts/archivo-latin.woff2',
  '/assets/manrope-latin.woff2': 'public/fonts/manrope-latin.woff2',
  '/assets/coastline-hero.webp': 'public/coastline-hero.webp',
  '/assets/logo.png': 'logo.png',
};
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const p = brand[url] ? path.join(repo, brand[url]) : path.join(root, url);
  if (brand[url]) return fs.createReadStream(p).pipe(res.writeHead(200, { 'Content-Type': types[path.extname(p)] }));
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(process.argv[2] === 'serve' ? 8787 : 0);
const port = server.address().port;
if (process.argv[2] === 'serve') { console.log(`http://127.0.0.1:${port}/comp.html?play`); await new Promise(() => {}); }

const [mode = 'stills', arg1, arg2] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/comp.html`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
const stage = await page.$('#stage');

if (mode === 'stills') {
  fs.mkdirSync(path.join(root, 'stills'), { recursive: true });
  for (const t of arg1.split(',').map(Number)) {
    await page.evaluate(t => window.seek(t), t);
    await stage.screenshot({ path: path.join(root, 'stills', `t-${t.toFixed(2)}.png`) });
  }
} else {
  const fps = Number(arg1 || 60);
  const out = arg2 || path.join(root, 'out', 'video-silent.mp4');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const duration = await page.evaluate(() => window.DURATION);
  const frames = Math.round(duration * fps);
  // Shutter: blend the sub-frames spanning 1/60 s into each 30 fps frame (a 180° motion blur).
  const taps = fps >= 120 ? 3 : fps >= 60 ? 2 : 1;
  const vf = (taps > 1 ? `tmix=frames=${taps}:weights=${Array(taps).fill(1).join(' ')},fps=30,` : '') + 'format=yuv420p';
  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-r', '30', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate(t => window.seek(t), i / fps);
    const buf = await stage.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 60 === 0) console.log(`frame ${i}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('wrote', out);
}
await browser.close();
server.close();
