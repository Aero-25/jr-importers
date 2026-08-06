// Bundles the JR Importers admin web app into mobile/www so it ships inside the APK.
// The bundled admin still talks to the live Supabase backend; only the UI code is a snapshot.
const fs = require('fs');
const path = require('path');

// Source is the Vite build output, not the repository root — the root files are
// the legacy single-file app. Run `npm run build` first.
const dist = path.resolve(__dirname, '..', 'dist');
const www = path.resolve(__dirname, 'www');

if (!fs.existsSync(path.join(dist, 'admin.html'))) {
  console.error('dist/admin.html not found. Run `npm run build` in the repo root first.');
  process.exit(1);
}

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });

// admin.html becomes the app's entry point. The console uses hash routing, so
// being renamed to index.html and served from a local file changes nothing.
const copies = [
  ['admin.html', 'index.html'],
  ['config.js', 'config.js'],
  ['sw.js', 'sw.js'],
  ['icon.svg', 'icon.svg'],
  ['OneSignalSDKWorker.js', 'OneSignalSDKWorker.js'],
  ['admin.webmanifest', 'admin.webmanifest'],
  ['offline.html', 'offline.html'],
];

for (const [src, dest] of copies) {
  const from = path.join(dist, src);
  if (fs.existsSync(from)) {
    fs.copyFileSync(from, path.join(www, dest));
    console.log('copied', src, '->', dest);
  } else {
    console.warn('skip (missing):', src);
  }
}

// The hashed JS/CSS the entry references.
const assetsFrom = path.join(dist, 'assets');
if (fs.existsSync(assetsFrom)) {
  fs.cpSync(assetsFrom, path.join(www, 'assets'), { recursive: true });
  console.log('copied assets/');
}

console.log('web bundle ready in', www);
