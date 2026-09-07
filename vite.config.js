import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Two-entry MPA. Vite emits dist/src/<app>/index.html; scripts/postbuild.mjs
// then promotes the storefront to / and the console to /admin, which is the
// layout Cloudflare Pages publishes.
/*
  The Android app ships its own copy of the console rather than loading the
  site, so an installed till stays on whatever code its APK was built from
  until someone reinstalls it. Baking the build time in is what lets the app
  say which build it is, and compare itself against what the server has.
*/
const BUILD_TIME = new Date().toISOString();

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
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
        jobcard: 'src/jobcard/index.html',
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
