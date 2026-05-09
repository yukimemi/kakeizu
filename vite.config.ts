import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Auto-update the service worker when a new build hits.
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "家系図 — kakeizu",
        short_name: "家系図",
        description: "家族みんなで作る、和紙のような家系図ウェブアプリ",
        lang: "ja",
        theme_color: "#FCF9F2",
        background_color: "#FCF9F2",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        // SPA: fall back to index.html for unknown routes, but skip Firebase
        // Auth handler URLs and any /api/* paths so they hit the network.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/__\/auth/, /^\/api\//],
        runtimeCaching: [
          {
            // Google Fonts stylesheets — kept fresh, fall back to cache offline.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-stylesheets" },
          },
          {
            // Google Fonts webfont files — long-lived, cache aggressively.
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // User photos from Firebase Storage. Cache so the tree renders
            // instantly when revisiting; revalidate when online.
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "firebase-storage",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true, // listen on 0.0.0.0 so Tailscale / LAN can reach the dev server
    // Allow access via Tailscale (.ts.net) and any LAN host. Leading dot
    // matches the domain and all subdomains.
    allowedHosts: [".ts.net", ".local", "localhost"],
  },
});
