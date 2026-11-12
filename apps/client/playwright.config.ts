import { defineConfig } from '@playwright/test';

// E2E_PORT lets several checkouts run e2e side by side (a busy port would
// otherwise be reused locally and test someone else's build).
const PORT = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${PORT}/overclock/`,
    trace: 'retain-on-failure',
    browserName: 'chromium',
  },
  // Phones are played sideways (owner decision 2026-11-12): the phone sizes are
  // landscape. `portrait` only checks the "Turn your phone sideways" prompt.
  projects: [
    {
      name: 'phone',
      testIgnore: /rotate\.spec\.ts/,
      use: {
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'phone-small',
      testIgnore: /rotate\.spec\.ts/,
      use: {
        viewport: { width: 640, height: 360 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      testIgnore: /rotate\.spec\.ts/,
      use: {
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      },
    },
    {
      name: 'portrait',
      testMatch: /rotate\.spec\.ts/,
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: `http://localhost:${PORT}/overclock/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
