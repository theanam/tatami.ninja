import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

/** Regenerates the first-run tour screenshots: npx playwright test -c playwright.tour.config.ts */
export default defineConfig({
  ...base,
  testDir: './tests/tour',
  fullyParallel: false,
  workers: 1,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: 'tests/e2e/storage.json', colorScheme: 'dark' } }],
});
