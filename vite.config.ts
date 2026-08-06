import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * GitHub Pages has no rewrite rules — it serves `404.html` for any path with no
 * matching file. Shipping a copy of the storefront shell under that name turns
 * its 404 handler into the SPA fallback, so /shop, /product/… and the
 * /jobcard/<token> link a customer opens from WhatsApp all resolve.
 *
 * Cloudflare Pages uses `app/public/_redirects` for the same job.
 */
function spaFallback(outDir: string): Plugin {
  return {
    name: 'jr-spa-fallback',
    apply: 'build',
    closeBundle() {
      copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'));
    },
  };
}

// The app is a two-entry MPA so it keeps deploying exactly like the legacy
// build did: a customer storefront at `/` and the retail/POS console at
// `/admin.html`. Both share one bundle graph, so shared code is emitted once.
export default defineConfig({
  root: resolve(__dirname, 'app'),
  publicDir: resolve(__dirname, 'app/public'),
  // Without the React plugin esbuild still compiles JSX, but dev loses Fast
  // Refresh — every edit becomes a full reload that drops component state.
  plugins: [react(), spaFallback(resolve(__dirname, 'dist'))],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    // The legacy pages shipped ~1.3MB of render-blocking script. Fail loudly
    // if a chunk creeps back toward that.
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      input: {
        shop: resolve(__dirname, 'app/index.html'),
        admin: resolve(__dirname, 'app/admin.html'),
      },
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
  server: {
    port: 5173,
    open: '/index.html',
  },
});
