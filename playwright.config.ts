import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const enCI = !!process.env.CI;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: enCI,
  retries: enCI ? 1 : 0,
  reporter: enCI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "celular", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: enCI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !enCI,
    timeout: 120_000,
  },
});
