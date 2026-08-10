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
const adminHtml = path.join(dist, 'admin', 'index.html');
fs.copyFileSync(adminHtml, path.join(www, 'index.html'));

// Only the assets the console reaches. dist/assets holds every entry point's
// chunks — storefront and job card included — because Vite pools them, but
// this app is the admin and nothing else: shop code has no business in the
// APK, reachable or not. Chunk names are content-hashed and appear as literal
// strings wherever they are imported, so walking the references from the
// admin document finds the closure exactly.
const assetsDir = path.join(dist, 'assets');
const everyAsset = fs.readdirSync(assetsDir);
const needed = new Set();
const queue = [];
const scan = (text) => {
  for (const name of everyAsset) {
    if (!needed.has(name) && text.includes(name)) {
      needed.add(name);
      queue.push(name);
    }
  }
};
scan(fs.readFileSync(adminHtml, 'utf8'));
while (queue.length > 0) {
  const name = queue.pop();
  // Only text assets can reference further chunks.
  if (/\.(js|css)$/.test(name)) scan(fs.readFileSync(path.join(assetsDir, name), 'utf8'));
}

fs.mkdirSync(path.join(www, 'assets'), { recursive: true });
for (const name of needed) {
  fs.copyFileSync(path.join(assetsDir, name), path.join(www, 'assets', name));
}
console.log(`bundled assets: ${needed.size} of ${everyAsset.length} (admin closure only)`);

// config.js stays outside the hashed bundles so the backend can be repointed
// without a rebuild — the same reason it is separate on the web.
for (const entry of ['config.js', 'favicon.ico', 'icon-192.png', 'logo-mark.png']) {
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
