import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next"],
    setupFiles: ["./vitest.setup.ts"],
  },
});