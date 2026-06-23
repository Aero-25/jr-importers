import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        storefront: 'src/storefront/index.html',
        admin: 'src/admin/index.html'
      }
    }
  }
});
