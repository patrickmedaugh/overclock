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
 * Strict Content Security Policy for the production build (every e2e run
 * executes under it). No 'unsafe-eval': Pixi runs through `pixi.js/unsafe-eval`
 * (imported first in main.ts) so it never calls `new Function`. Inline styles
 * are allowed for the boot style block and Pixi's canvas style attribute;
 * Pixi's image workers are created from blob: URLs. Dev builds skip this
 * because Vite's hot reload injects inline scripts.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

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

export default defineConfig(({ command, isPreview }) => ({
  base: basePath ?? (command === 'build' || isPreview ? '/overclock/' : '/'),
  plugins: [cspMeta()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
}));
