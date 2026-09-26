import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/unit/setup.ts"],
    fileParallelism: false,
    testTimeout: 30000,
  },
  resolve: { alias: [{ find: /^@\/generated\/(.*)$/, replacement: path.resolve(__dirname, "generated/$1") }, { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, "src/$1") }] },
});
