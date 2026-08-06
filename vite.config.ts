import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// The app is a two-entry MPA so it keeps deploying exactly like the legacy
// build did: a customer storefront at `/` and the retail/POS console at
// `/admin.html`. Both share one bundle graph, so shared code is emitted once.
export default defineConfig({
  root: resolve(__dirname, 'app'),
  publicDir: resolve(__dirname, 'app/public'),
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
