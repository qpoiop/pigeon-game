import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base is relative so the built app can be served from any static path
// (GitHub Pages project sites, subfolders, file previews, …).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: {
    // three is large and stable — split it into its own long-cached vendor
    // chunk so app changes don't invalidate it (and to quiet the size warning).
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
