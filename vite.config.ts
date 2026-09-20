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
      includeAssets: [
        'apple-touch-icon-v2.png',
        'apple-touch-icon-167-v2.png',
        'apple-touch-icon-152-v2.png',
        'apple-touch-icon-120-v2.png',
      ],
      manifest: {
        name: 'Training',
        short_name: 'Training',
        description: 'Krafttraining protokollieren – lokal auf dem Gerät.',
        lang: 'de',
        // The query makes iOS treat this as a brand new web app, so it looks the
        // icon up again instead of reusing the grey placeholder it remembered.
        start_url: `${base}?v=2`,
        id: `${base}?v=2`,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'icon-192-v2.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512-v2.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
