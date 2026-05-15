import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false, // Don't ship source maps to production
    rollupOptions: {
      output: {
        // Split heavy export libs into their own chunk so they load on demand.
        manualChunks(id) {
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/svg2pdf.js')) {
            return 'pdf-export';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    headers: {
      // Mirror production security headers in dev for parity
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  },
});
