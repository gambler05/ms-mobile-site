import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  outputDir: "test-results/playwright",
  use: {
    baseURL: "http://127.0.0.1:5310",
    viewport: { width: 1440, height: 900 },
    locale: "fr-FR",
    permissions: ["clipboard-read", "clipboard-write"],
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: "npx tsx e2e/start-env.ts",
    url: "http://127.0.0.1:5310/api/health",
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "pipe",
  },
});
