import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// L'interface est servie par le serveur Node en production (même origine que l'API).
// En développement, Vite relaie /api vers le serveur.
const apiPort = Number(process.env.PORT ?? 5174);

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false },
    },
  },
});
