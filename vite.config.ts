import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// On GitHub Pages the app lives under /<repo-name>/. The deploy workflow sets BASE_PATH.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Manifest and icons must never come from the offline cache: iOS reads them
      // when the app is added to the home screen, and a stale copy breaks the icon.
      workbox: {
        globPatterns: ['**/*.{js,css,html}'],
        globIgnores: ['**/manifest.webmanifest', '**/icon-*.png', '**/apple-touch-icon*.png'],
        runtimeCaching: [
          {
            urlPattern: ({ request }: { request: Request }) =>
              request.destination === 'image' || request.destination === 'manifest',
            handler: 'NetworkFirst',
            options: { cacheName: 'assets', expiration: { maxEntries: 20 } },
          },
        ],
      },
      manifest: false,
    }),
  ],
});
