import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Two-entry MPA. Vite emits dist/src/<app>/index.html; scripts/postbuild.mjs
// then promotes the storefront to / and the console to /admin, which is the
// layout Cloudflare Pages publishes.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(process.cwd(), 'src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // The legacy pages shipped ~1.3MB of render-blocking script. Fail loudly
    // if a chunk creeps back toward that.
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      input: {
        storefront: 'src/storefront/index.html',
        admin: 'src/admin/index.html',
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
});
