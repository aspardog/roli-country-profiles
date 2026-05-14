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
        manualChunks: {
          // Split heavy export libs into their own chunk so they load on demand
          'pdf-export': ['jspdf', 'svg2pdf.js'],
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
