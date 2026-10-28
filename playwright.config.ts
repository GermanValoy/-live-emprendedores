import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const enCI = !!process.env.CI;
/** Pruebas que necesitan cámara y micrófono (la pantalla para salir en vivo y la sala). */
const CON_CAMARA = /(estudio-vivo|sala-vivo)\.spec\.ts/;

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
  projects: [
    { name: "celular", use: { ...devices["Pixel 7"] }, testIgnore: CON_CAMARA },
    {
      // Cámara y micrófono simulados por Chrome, con el permiso ya dado.
      name: "celular-camara",
      testMatch: CON_CAMARA,
      use: {
        ...devices["Pixel 7"],
        permissions: ["camera", "microphone"],
        launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
      },
    },
  ],
  webServer: {
    command: enCI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !enCI,
    timeout: 120_000,
  },
});
