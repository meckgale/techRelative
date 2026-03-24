import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

const coreProjects = [
  {
    name: "chromium",
    use: { browserName: "chromium" as const },
  },
  {
    name: "mobile-chrome",
    use: { ...devices["Pixel 5"] },
  },
];

const ciOnlyProjects = [
  {
    name: "firefox",
    use: { browserName: "firefox" as const },
  },
  {
    name: "webkit",
    use: { browserName: "webkit" as const },
  },
  {
    name: "mobile-safari",
    use: { ...devices["iPhone 13"] },
  },
];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 3,
  timeout: 60000,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: "http://localhost:3000",
    actionTimeout: 10000,
    trace: "on-first-retry",
  },
  projects: isCI ? [...coreProjects, ...ciOnlyProjects] : coreProjects,
});
