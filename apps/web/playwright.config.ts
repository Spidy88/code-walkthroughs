import { defineConfig, devices } from '@playwright/test';

// Dedicated port for Playwright runs to avoid collisions with other dev
// servers on the developer's machine. Override via CW_E2E_PORT if needed.
const E2E_PORT = Number(process.env.CW_E2E_PORT ?? 5179);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: 'on',
    video: 'on',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    port: E2E_PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      CW_WEB_PORT: String(E2E_PORT),
    },
  },
  outputDir: './test-results',
});
