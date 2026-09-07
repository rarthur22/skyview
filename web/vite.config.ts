import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The SkyView server port. Follows the PORT env var so a single override moves
// both the server and (via the proxy below) the Vite dev server.
const SERVER_PORT = process.env.PORT ?? "3000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@skyview/shared": resolve(__dirname, "../shared/src"),
    },
  },
  server: {
    port: 5173,
    // Proxy REST + WS to the SkyView server during dev.
    proxy: {
      "/api": {
        target: `http://localhost:${SERVER_PORT}`,
        changeOrigin: true,
      },
      "/ws": {
        target: `ws://localhost:${SERVER_PORT}`,
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
