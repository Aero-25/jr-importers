// Bundles the JR Importers admin web app into mobile/www so it ships inside the APK.
// The bundled admin still talks to the live Supabase backend; only the UI code is a snapshot.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const www = path.resolve(__dirname, 'www');
fs.mkdirSync(www, { recursive: true });

// admin.html becomes the app's entry point.
const copies = [
  ['admin.html', 'index.html'],
  ['config.js', 'config.js'],
  ['app-shell.js', 'app-shell.js'],
  ['sw.js', 'sw.js'],
  ['icon.svg', 'icon.svg'],
  ['OneSignalSDKWorker.js', 'OneSignalSDKWorker.js'],
  ['admin.webmanifest', 'admin.webmanifest'],
  ['offline.html', 'offline.html']
];

for (const [src, dest] of copies) {
  const from = path.join(root, src);
  if (fs.existsSync(from)) {
    fs.copyFileSync(from, path.join(www, dest));
    console.log('copied', src, '->', dest);
  } else {
    console.warn('skip (missing):', src);
  }
}
console.log('web bundle ready in', www);
