// S-00-2: the demo loads in under 5 seconds.
import { expect, test } from '@playwright/test';

test('first load is interactive in under 5 seconds', async ({ page }) => {
  const start = Date.now();
  await page.goto('./');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
  const ms = Date.now() - start;
  test.info().annotations.push({ type: 'load-ms', description: String(ms) });
  expect(ms).toBeLessThan(5000);
  // Served under the GitHub Pages base path.
  expect(new URL(page.url()).pathname.startsWith('/overclock/')).toBe(true);
});

test('no console errors on load', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('./');
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  expect(errors).toEqual([]);
});
