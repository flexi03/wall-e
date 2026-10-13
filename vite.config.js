import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Eigene Werte aus site.config.js, sonst die Beispiel-Datei (z. B. im öffentlichen Repo)
const root = fileURLToPath(new URL('.', import.meta.url));
const siteFile = existsSync(`${root}site.config.js`) ? `${root}site.config.js` : `${root}site.config.example.js`;
const site = (await import(siteFile)).default;

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@site': siteFile } },
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  server: {
    port: 5173,
    // "npm run dev -- --host": auch vom Handy im selben WLAN erreichbar.
    // Lokal gibt es kein PHP – /api geht an den in site.config.js eingetragenen Server.
    proxy: site.devApiTarget
      ? {
          '/api': { target: site.devApiTarget, changeOrigin: true }
        }
      : undefined
  }
});
