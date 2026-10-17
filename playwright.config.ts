import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5182/',
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
    // The first-run tour is tested on its own; everywhere else it has already been seen.
    storageState: 'tests/e2e/storage.json',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: 'tests/e2e/storage.json' } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5182/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
