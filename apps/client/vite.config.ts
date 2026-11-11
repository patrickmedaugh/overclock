import { defineConfig } from 'vitest/config';

// Production builds are served from the GitHub Pages project site
// (https://<owner>.github.io/overclock/), so assets need the /overclock/ base.
// `vite dev` uses `/` for convenience. `vite preview` serves the production
// build under /overclock/, which is what the Playwright e2e run hits.
// Other hosts (e.g. Netlify, which serves from the site root) set BASE_PATH=/.
const basePath = process.env['BASE_PATH'];

export default defineConfig(({ command, isPreview }) => ({
  base: basePath ?? (command === 'build' || isPreview ? '/overclock/' : '/'),
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
