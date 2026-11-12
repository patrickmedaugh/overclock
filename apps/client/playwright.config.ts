import { defineConfig } from '@playwright/test';

const PORT = 4173;

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
  // Charter Definition of Done viewports (owner decision 2026-11-12): phones held
  // sideways (844x390, small 640x360) and a desktop. An upright 390x844 phone is
  // only used by e2e/rotate.spec.ts (it shows "Turn your phone sideways").
  projects: [
    {
      name: 'phone',
      use: {
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'phone-small',
      use: {
        viewport: { width: 640, height: 360 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      use: {
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: `http://localhost:${PORT}/overclock/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
