/** Runtime configuration for the Relay web application. */

import { env } from "node:process";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.pw.js",
  fullyParallel: true,
  forbidOnly: Boolean(env.CI),
  retries: env.CI ? 2 : 0,
  reporter: env.CI
    ? [["list"], ["html", { open: "never" }]]
    : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !env.CI,
    timeout: 30_000,
  },
});
