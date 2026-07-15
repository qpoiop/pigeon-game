import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Base is relative so the built app can be served from any static path
// (GitHub Pages project sites, subfolders, file previews, …).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // Auto-inject the registration script and swap in a new service worker as
      // soon as one is built — players always get the latest version on reload.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'favicon-64.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'PIGEON PROTOCOL — 비둘기 특무',
        short_name: 'Pigeon',
        description: '탑다운 3D 잠입 전략 게임. 전서구 요원이 되어 마이크로필름을 회수하고 탈출하라.',
        lang: 'ko',
        theme_color: '#f3f2f2',
        background_color: '#14110f',
        display: 'standalone',
        // free rotation — don't lock the installed app to one orientation
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // three.js + app chunks are large; precache everything the build emits.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Google Fonts stylesheet + font files — cache so the app renders
            // with its typeface offline after the first online load.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
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
