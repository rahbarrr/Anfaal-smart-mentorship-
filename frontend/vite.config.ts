import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Brand colours (kept in sync with src/theme.css: --primary / --background)
const THEME_COLOR = '#8f3f66'
const BACKGROUND_COLOR = '#f4f1f2'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "prompt": a new service worker waits until the user chooses to update,
      // so we never reload the page while someone is typing or uploading a call.
      registerType: 'prompt',
      injectRegister: false, // registered manually in src/pwa/ (see usePwa.ts)
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'sw-push.js'],
      manifest: {
        id: '/',
        name: 'Anfaal Smart Mentorship',
        short_name: 'Anfaal',
        description: 'Anfaal Smart Mentorship Platform',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        importScripts: ['/sw-push.js'],
        // Precache ONLY the static app shell (hashed JS/CSS/HTML/icons/fonts).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
        // Never skipWaiting/clientsClaim automatically: updates are user-approved
        // via the "Update now" banner (SKIP_WAITING message).
        skipWaiting: false,
        clientsClaim: false,
        // SPA routing: serve the cached shell for navigations, but never for the API.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /\/sw\.js$/, /\/manifest\.webmanifest$/],
        // No runtime caching for API / S3 / any private data: only Google Fonts
        // (public, immutable) are cached at runtime. Everything else goes to network.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'anfaal-google-fonts-css' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'anfaal-google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
})
