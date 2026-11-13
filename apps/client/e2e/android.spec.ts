// S-04-1 / S-04-2: the Android app's web bundle (`vite build --mode android`,
// what goes inside the APK), served from the web root as Capacitor does.
// Runs only in the `android` Playwright project.
import { type Page, expect, test } from '@playwright/test';
import { pixelStats } from './pixels';

/** Sprint 6: the app opens on the start screen; "Play on this phone" starts today's game. */
async function playHere(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Play on this phone/ }).tap();
  await expect(page.locator('#start')).toBeHidden();
}

const BOARD = { x: 0, y: 0, width: 844, height: 390 };

test.describe('S-04-2 the app bundle', () => {
  test('boots without the test hook, the rotate prompt or anything from other sites', async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const foreign: string[] = [];
    const errors: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.protocol.startsWith('http') && u.origin !== origin) foreign.push(r.url());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
    });
    await page.goto('./');
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    expect(new URL(page.url()).pathname).toBe('/');

    // The hidden switches the tests use are not in the app.
    expect(await page.evaluate(() => typeof window.__overclock)).toBe('undefined');
    // The app is locked sideways: no "Turn your phone sideways" screen at all.
    expect(await page.locator('#rotate').count()).toBe(0);
    await expect(page.getByText('Turn your phone sideways')).toHaveCount(0);
    // Strict CSP still in place.
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-eval');

    // The board is drawn (not a blank screen).
    await playHere(page);
    await page.waitForTimeout(300);
    const [s] = await pixelStats(page, [BOARD]);
    expect(s!.spread).toBeGreaterThan(10);
    await test.info().attach('app-bundle', { body: await page.screenshot(), contentType: 'image/png' });

    expect(foreign, 'requests to other sites').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('keeps running with the network switched off', async ({ page, context }) => {
    // In the app every file comes from the APK (the test above proves no request leaves the
    // app's origin); here the network goes off after boot and the game keeps drawing.
    await page.goto('./');
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    await playHere(page);
    await context.setOffline(true);
    // Everything after boot (workers, textures) works with the network off.
    await page.waitForTimeout(300);
    const [s] = await pixelStats(page, [BOARD]);
    expect(s!.spread).toBeGreaterThan(10);
    await context.setOffline(false);
  });

  test('upright, the app still shows no rotate prompt (Android keeps it sideways)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./');
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    await expect(page.getByText('Turn your phone sideways')).toHaveCount(0);
  });
});
