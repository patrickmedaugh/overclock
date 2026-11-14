import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Production builds are served from the GitHub Pages project site
// (https://<owner>.github.io/overclock/), so assets need the /overclock/ base.
// `vite dev` uses `/` for convenience. `vite preview` serves the production
// build under /overclock/, which is what the Playwright e2e run hits.
// Other hosts (e.g. Netlify, which serves from the site root) set BASE_PATH=/.
// Everything in index.html and the manifest uses relative paths, so any base works.
const basePath = process.env['BASE_PATH'];

/**
 * The online service's origin (`wss://host[:port]`) from OVERCLOCK_SERVER_URL,
 * or '' when unset. Anything but ws:/wss: fails the build (no silent CSP hole).
 */
export function serverOrigin(url: string): string {
  if (!url) return '';
  const u = new URL(url);
  if (u.protocol !== 'wss:' && u.protocol !== 'ws:') throw new Error(`OVERCLOCK_SERVER_URL must be ws:// or wss://, got ${url}`);
  return `${u.protocol}//${u.host}`;
}

const SERVER_URL = process.env['OVERCLOCK_SERVER_URL'] ?? '';

/**
 * Strict Content Security Policy for the production build (every e2e run
 * executes under it). No 'unsafe-eval': Pixi runs through `pixi.js/unsafe-eval`
 * (imported first in main.ts) so it never calls `new Function`. Inline styles
 * are allowed for the boot style block and Pixi's canvas style attribute;
 * Pixi's image workers are created from blob: URLs. Dev builds skip this
 * because Vite's hot reload injects inline scripts.
 */
export function cspFor(server: string): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // Sprint 6: only the online service's origin besides our own.
    `connect-src 'self'${server ? ` ${serverOrigin(server)}` : ''}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
}

export const CSP = cspFor(SERVER_URL);

function cspMeta(): Plugin {
  return {
    name: 'overclock-csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
      ],
    },
  };
}

/**
 * The build date shown in a board corner (S-04-1), e.g. "2026-11-13 14:32 UTC".
 * CI sets OVERCLOCK_BUILD_TIME once so the app, the web build and the release
 * page show the same time; otherwise it is the time of this build.
 */
export function buildTime(now = new Date()): string {
  const fromEnv = process.env['OVERCLOCK_BUILD_TIME'];
  if (fromEnv) return fromEnv;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}-${p(now.getUTCMonth() + 1)}-${p(now.getUTCDate())} ${p(now.getUTCHours())}:${p(now.getUTCMinutes())} UTC`;
}

/**
 * Android app build (`vite build --mode android`): the "Turn your phone
 * sideways" prompt is dropped (the app is locked sideways), markup and styles
 * between the `rotate:start` / `rotate:end` markers in index.html go with it.
 */
function dropRotate(): Plugin {
  return {
    name: 'overclock-drop-rotate',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html
          .replace(/\/\* rotate:start \*\/[\s\S]*?\/\* rotate:end \*\//g, '')
          .replace(/<!-- rotate:start -->[\s\S]*?<!-- rotate:end -->/g, ''),
    },
  };
}

export default defineConfig(({ command, isPreview, mode }) => {
  const android = mode === 'android';
  return {
    // Capacitor serves the app from the web root (https://localhost/).
    base: android ? '/' : (basePath ?? (command === 'build' || isPreview ? '/overclock/' : '/')),
    plugins: [cspMeta(), ...(android ? [dropRotate()] : [])],
    define: {
      // The Playwright test hook (window.__overclock) is left out of the app.
      __TEST_HOOK__: JSON.stringify(!android),
      // Native-only code (Back button, app resume) is loaded only in the app.
      __NATIVE__: JSON.stringify(android),
      __BUILD_TIME__: JSON.stringify(buildTime()),
      // Sprint 6: the online service (wss://...) and the web game's address (for
      // share links from the app). Unset: "Play online" says it isn't set up yet.
      __SERVER_URL__: JSON.stringify(SERVER_URL),
      __WEB_URL__: JSON.stringify(process.env['OVERCLOCK_WEB_URL'] ?? ''),
    },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1200,
      outDir: android ? 'dist-android' : 'dist',
    },
    preview: {
      port: 4173,
      strictPort: true,
    },
    test: {
      include: ['test/**/*.test.ts'],
      environment: 'node',
    },
  };
});
