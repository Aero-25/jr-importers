// Bundles the built admin console into mobile/www so it ships inside the APK.
//
// This used to copy admin.html from the repository root — the *legacy* console,
// which postbuild now files away as admin-legacy.html. The APK was carrying a
// snapshot of an application that had been replaced, and never noticed because
// capacitor.config pointed the WebView at the live site instead of the bundle.
//
// It now takes dist/admin, which is the console the build actually produces, so
// the app runs from its own copy and works with no network at all.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const www = path.resolve(__dirname, 'www');

if (!fs.existsSync(path.join(dist, 'admin', 'index.html'))) {
  console.error('No dist/admin — run `npm run build` at the repository root first.');
  process.exit(1);
}

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });

// The console's own document becomes the app's entry point. It uses hash
// routing precisely so it survives being served as a local file.
fs.copyFileSync(path.join(dist, 'admin', 'index.html'), path.join(www, 'index.html'));

// Everything the document references. assets/ carries the hashed bundles, and
// config.js stays outside them so the backend can be repointed without a
// rebuild — the same reason it is separate on the web.
for (const entry of ['assets', 'config.js', 'favicon.ico', 'icon-192.png', 'logo-mark.png']) {
  const from = path.join(dist, entry);
  if (!fs.existsSync(from)) {
    console.warn('skip (missing):', entry);
    continue;
  }
  fs.cpSync(from, path.join(www, entry), { recursive: true });
  console.log('bundled', entry);
}

const size = fs
  .readdirSync(path.join(www, 'assets'))
  .reduce((n, f) => n + fs.statSync(path.join(www, 'assets', f)).size, 0);
console.log(`web bundle ready in ${www} (${Math.round(size / 1024)} kB of assets)`);
