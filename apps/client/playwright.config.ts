import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// E2E_PORT lets several checkouts run e2e side by side (a busy port would
// otherwise be reused locally and test someone else's build).
const PORT = Number(process.env.E2E_PORT ?? 4173);
// The Android app's web build (S-04-2: `vite build --mode android`, served from the root).
// Offset well past PORT so side-by-side runs (E2E_PORT 4173, 4174, ...) never collide.
const ANDROID_PORT = Number(process.env.E2E_ANDROID_PORT ?? PORT + 500);
const NOT_WEB = [/rotate\.spec\.ts/, /android\.spec\.ts/];
// Sprint 9 owner bug: a short sideways screen (Android Chrome with its address
// bar showing). `phone-short` runs the rail specs only; short-rail.spec.ts sets
// its own short sizes, so the other projects skip it.
// Sprint 10: the new board specs run there too (not s10-online). Sprint 11: s11-break, s11-cards, s11-save, qa-sprint11.
// Sprint 12: s12-melange, s12-abt, s12-archives, s12-runner (not s12-online).
// Sprint 13: the deck builder specs (s13-decks, s13-editor, s13-rules, s13-play) and qa-sprint13.
// Sprint 14: the deck sync and online deck specs (s14-sync, s14-link, s14-online-decks) and qa-sprint14.
// Sprint 15: the movement specs (s15-hand, s15-flights, s15-online, s15-snappy) and s15-site.
const SHORT_SPECS = [/short-rail\.spec\.ts/, /s03-corp-score\.spec\.ts/, /s10-scored\.spec\.ts/, /s10-stats\.spec\.ts/, /s10-bankjob\.spec\.ts/, /s10-board\.spec\.ts/, /qa-sprint10\.spec\.ts/, /s11-break\.spec\.ts/, /s11-cards\.spec\.ts/, /s11-save\.spec\.ts/, /qa-sprint11\.spec\.ts/, /s12-melange\.spec\.ts/, /s12-abt\.spec\.ts/, /s12-archives\.spec\.ts/, /s12-runner\.spec\.ts/, /qa-sprint12\.spec\.ts/, /s13-(decks|editor|rules|play)\.spec\.ts/, /qa-sprint13\.spec\.ts/, /s14-(sync|link|online-decks)\.spec\.ts/, /qa-sprint14\.spec\.ts/, /s15-(hand|flights|online|snappy|site)\.spec\.ts/];
const NOT_WIDE = [...NOT_WEB, /short-rail\.spec\.ts/];
// Sprint 6: the online service (apps/server) under `wrangler dev`, test mode on,
// fresh storage every run. The web build points "Play online" at it.
const SERVER_PORT = Number(process.env.E2E_SERVER_PORT ?? PORT + 600);
const SERVER_URL = `ws://127.0.0.1:${SERVER_PORT}`;
const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), '../server');
const PERSIST = join(tmpdir(), `overclock-e2e-${SERVER_PORT}`);
// `E2E_NO_SERVER=1`: no service and a web build without one (runs that need no
// online play, e.g. the guard-mutation check).
const WITH_SERVER = process.env.E2E_NO_SERVER !== '1';

/** The online service under `wrangler dev` (test mode, fresh storage). */
const service = {
  // Pages are served from http://localhost:<port>, which this allowlist lets in.
  command: [
    `rm -rf "${PERSIST}" &&`,
    `npx wrangler dev --port ${SERVER_PORT} --ip 127.0.0.1 --persist-to "${PERSIST}"`,
    `--var OVERCLOCK_TEST_MODE:1 --var "ALLOWED_ORIGINS:http://localhost:*,http://127.0.0.1:*"`,
    '--show-interactive-dev-session=false',
  ].join(' '),
  cwd: SERVER_DIR,
  url: `http://127.0.0.1:${SERVER_PORT}/health`,
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
};

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
      testIgnore: NOT_WIDE,
      use: {
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'phone-small',
      testIgnore: NOT_WIDE,
      use: {
        viewport: { width: 640, height: 360 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      testIgnore: NOT_WIDE,
      use: {
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      },
    },
    {
      // Android Chrome sideways with the address bar showing: the owner's phone
      // (Galaxy S23, DPR 2.625) measures 891x296 CSS px. Must stay at a size where
      // the short-screen rail rule actually kicks in (height <= ~313; 915x330 does not).
      name: 'phone-short',
      testMatch: SHORT_SPECS,
      use: {
        viewport: { width: 891, height: 296 },
        deviceScaleFactor: 2.625,
        isMobile: true,
        hasTouch: true,
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
      env: { ...(process.env as Record<string, string>), OVERCLOCK_SERVER_URL: WITH_SERVER ? SERVER_URL : '' },
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
    ...(WITH_SERVER ? [service] : []),
  ],
});
