import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@skyview/shared": resolve(__dirname, "shared/src"),
    },
  },
  test: {
    environment: "node",
    include: ["shared/src/**/*.test.ts", "server/src/**/*.test.ts"],
  },
});
