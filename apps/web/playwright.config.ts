import { defineConfig } from "@playwright/test";

const mockApiBaseUrl = "http://127.0.0.1:18999";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "../../output/playwright/test-results",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:15173",
    colorScheme: "light",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev --port 15173 --strictPort",
    url: "http://127.0.0.1:15173",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_API_BASE_URL: mockApiBaseUrl,
    },
  },
});
