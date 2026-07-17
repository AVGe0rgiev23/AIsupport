import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    hookTimeout: 120_000, // mongodb-memory-server downloads a binary on first run
    testTimeout: 30_000,
  },
});
