// S-00-2: the demo loads in under 5 seconds. S-01-6 / U3: it runs under a
// strict CSP and can be added to the home screen as a full-screen app.
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

test('no console errors or CSP violations on load and during a turn', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  await page.goto('./?seed=3');
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  await page.evaluate(() => {
    const h = window.__overclock!;
    h.dispatch({ type: 'draw', player: 'corp' });
    h.dispatch({ type: 'gain_credit', player: 'corp' });
    h.dispatch({ type: 'end_turn', player: 'corp' });
  });
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('the page ships a strict Content Security Policy (no unsafe-eval)', async ({ page }) => {
  await page.goto('./');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-eval');
  expect(csp).toContain("worker-src 'self' blob:");
});

test('home-screen install: manifest (standalone) and iOS full-screen tags are present', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  // Relative to the page, so it works at /overclock/ (Pages) and / (Netlify).
  expect(href!.startsWith('/')).toBe(false);
  const manifestUrl = new URL(href!, page.url()).toString();
  const res = await request.get(manifestUrl);
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as { display: string; start_url: string; orientation: string; icons: { src: string }[] };
  expect(manifest.display).toBe('standalone');
  // S-02-6 AC4: opened from the home screen, the game opens sideways.
  expect(manifest.orientation).toBe('landscape');
  expect(manifest.start_url).toBe('./');
  for (const icon of manifest.icons) {
    expect(icon.src.startsWith('/')).toBe(false);
    expect((await request.get(new URL(icon.src, manifestUrl).toString())).ok()).toBe(true);
  }
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'black-translucent');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
});
