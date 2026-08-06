// Postbuild: assemble dist/ into a Cloudflare Pages publish directory.
//
// Vite emits the multi-page build under dist/src/<app>/index.html with hashed
// assets in dist/assets (absolute /assets/... URLs, so files can be relocated
// freely). This script promotes the redesigned storefront to the site root,
// tucks the in-progress React admin under /admin-app/, and copies the static
// runtime files the site still serves (legacy admin, PWA, payment worker).

import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const log = (m) => console.log(`[postbuild] ${m}`);

async function move(from, to) {
  if (!existsSync(from)) return false;
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.rename(from, to);
  return true;
}

async function copyIn(file) {
  const from = path.join(root, file);
  if (!existsSync(from)) { log(`skip (missing): ${file}`); return; }
  const to = path.join(dist, file);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
  log(`copied: ${file}`);
}

async function run() {
  if (!existsSync(dist)) throw new Error('dist/ not found — run vite build first');

  // 1) Redesigned storefront becomes the site homepage.
  if (await move(path.join(dist, 'src/storefront/index.html'), path.join(dist, 'index.html'))) {
    log('storefront -> /index.html');
  }

  // 2) New React POS/admin is the primary admin, served at /admin.
  //    Also mirror it at /admin-app/ so already-installed APKs keep working.
  if (await move(path.join(dist, 'src/admin/index.html'), path.join(dist, 'admin/index.html'))) {
    log('react admin -> /admin/index.html');
    await fs.mkdir(path.join(dist, 'admin-app'), { recursive: true });
    await fs.copyFile(path.join(dist, 'admin/index.html'), path.join(dist, 'admin-app/index.html'));
    log('react admin mirrored -> /admin-app/index.html');
  }

  // 2b) The job-card link is its own document at /jobcard/, reached by token.
  if (await move(path.join(dist, 'src/jobcard/index.html'), path.join(dist, 'jobcard/index.html'))) {
    log('job card -> /jobcard/index.html');
  }

  // 3) Drop the now-empty src/ scaffolding from the output.
  await fs.rm(path.join(dist, 'src'), { recursive: true, force: true });

  // 4) Carry over the static runtime files the deployed site still needs.
  //    NOTE: legacy admin.html is parked at /admin-legacy.html (not /admin) —
  //    the new POS owns /admin now.
  const staticFiles = [
    '_worker.js',          // Pages advanced-mode worker: /api/* + static fallthrough
    'config.js',           // runtime Supabase/worker config (window.JR_CONFIG)
    'icon.svg',
    'manifest.webmanifest',
    'admin.webmanifest',
    'sw.js',
    'offline.html',
    'privacy.html',
    'terms.html',
    'app-shell.js',
    'OneSignalSDKWorker.js',
  ];
  for (const f of staticFiles) await copyIn(f);

  // Park the legacy admin out of the way (keep it reachable as a backup).
  if (existsSync(path.join(root, 'admin.html'))) {
    await fs.copyFile(path.join(root, 'admin.html'), path.join(dist, 'admin-legacy.html'));
    log('legacy admin -> /admin-legacy.html');
  }

  // 5) SPA fallback for the storefront.
  //
  //    The storefront uses history routing, so /shop, /product/… and the
  //    /jobcard/<token> link a customer opens from WhatsApp have no matching
  //    file. _worker.js falls through to env.ASSETS, which 404s on those.
  //
  //    _redirects covers it on Cloudflare Pages; 404.html is the belt-and-
  //    braces version that also works if this is ever served from GitHub
  //    Pages. Real files are matched before either applies, so /admin and the
  //    hashed assets are unaffected. The console uses hash routing and needs
  //    no rule.
  await fs.writeFile(
    path.join(dist, '_redirects'),
    '/admin/*    /admin/index.html   200\n/*          /index.html         200\n',
    'utf8',
  );
  log('wrote /_redirects (SPA fallback)');

  if (existsSync(path.join(dist, 'index.html'))) {
    await fs.copyFile(path.join(dist, 'index.html'), path.join(dist, '404.html'));
    log('storefront mirrored -> /404.html');
  }

  log('done — dist/ is ready for Cloudflare Pages (output directory: dist)');
}

run().catch((e) => { console.error(e); process.exit(1); });
