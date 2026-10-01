import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { fileURLToPath, URL } from "node:url";

// Ren SPA: ingen SSR, inga serverfunktioner. Allt som kräver service-role bor
// i Supabase Edge Functions (supabase/functions). Se produkt/ritning-v2 i
// projektet, avsnitt 6.
export default defineConfig({
  plugins: [
    // `bun run dev:https`: kameran (getUserMedia) finns bara i en säker
    // kontext, och telefonen når dev-servern på datorns LAN-adress över
    // http. Självsignerat certifikat; telefonen får godkänna det en gång.
    process.env.SKINTEL_HTTPS ? basicSsl() : null,
    // Routerpluginet ska ligga före react().
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "robots.txt"],
      manifest: {
        name: "Skintel",
        short_name: "Skintel",
        description: "Hudläkarens bedömning av din fläck, i mobilen.",
        lang: "sv",
        start_url: "/app",
        scope: "/",
        display: "standalone",
        background_color: "#fbfaf6",
        theme_color: "#195553",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Skalet cachas; API-anrop mot Supabase går alltid till nätet.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/\.well-known\//, /^\/robots\.txt$/],
        globPatterns: ["**/*.{js,css,html,svg,woff2,png}"],
        // Sidorna under /dev finns bara i utvecklingsläge (routerna svarar
        // 404 i det byggda paketet), så deras kod, stil och provtypsnitt
        // ska inte förcachas. Brevets serif (Source Serif 4) förcachas --
        // ett brev ska gå att läsa utan nät -- men bara de latinska
        // teckenuppsättningarna.
        globIgnores: [
          "**/ui-*.js",
          "**/figur-*.js",
          "**/identitet-*.{js,css}",
          "**/page-*.js",
          "**/familjen-grotesk-*.woff2",
          "**/fraunces-*.woff2",
          "**/inter-*.woff2",
          "**/source-serif-4-{cyrillic,cyrillic-ext,greek,vietnamese}-*.woff2",
          // Journalen som PDF (3.4b) kräver nät ändå -- den läser ärendena och
          // fotona -- så jsPDF och journalens kod hämtas först vid tryck.
          // Typsnitten (.ttf) omfattas inte av globPatterns.
          "**/skapa-*.js",
          "**/jspdf*.js",
        ],
      },
    }),
  ],
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      // jsPDF:s valfria delar används inte av journalen (se filen).
      {
        find: /^(html2canvas|dompurify|canvg)$/,
        replacement: fileURLToPath(new URL("./src/journal/utan-tillagg.ts", import.meta.url)),
      },
    ],
  },
  server: { host: true, port: 8080 },
  preview: { host: true, port: 8080 },
});
