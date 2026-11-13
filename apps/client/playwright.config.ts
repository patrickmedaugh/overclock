import { defineConfig } from '@playwright/test';

// E2E_PORT lets several checkouts run e2e side by side (a busy port would
// otherwise be reused locally and test someone else's build).
const PORT = Number(process.env.E2E_PORT ?? 4173);
// The Android app's web build (S-04-2: `vite build --mode android`, served from the root).
// Offset well past PORT so side-by-side runs (E2E_PORT 4173, 4174, ...) never collide.
const ANDROID_PORT = Number(process.env.E2E_ANDROID_PORT ?? PORT + 500);
const NOT_WEB = [/rotate\.spec\.ts/, /android\.spec\.ts/];

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
      testIgnore: NOT_WEB,
      use: {
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'phone-small',
      testIgnore: NOT_WEB,
      use: {
        viewport: { width: 640, height: 360 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      testIgnore: NOT_WEB,
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
    {
      // The Android app's bundle in a sideways phone-sized browser: boots with
      // no test hook, no rotate prompt and nothing loaded from other sites.
      name: 'android',
      testMatch: /android\.spec\.ts/,
      use: {
        baseURL: `http://localhost:${ANDROID_PORT}/`,
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: `npm run build && npm run preview -- --port ${PORT}`,
      url: `http://localhost:${PORT}/overclock/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npm run build:android && npx vite preview --mode android --port ${ANDROID_PORT}`,
      url: `http://localhost:${ANDROID_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
