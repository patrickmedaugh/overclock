// S-04-1 / S-04-2: the Android app's web bundle (`vite build --mode android`,
// what goes inside the APK), served from the web root as Capacitor does.
// Runs only in the `android` Playwright project.
import { type Page, expect, test } from '@playwright/test';
import { pixelStats } from './pixels';

/** Sprint 6: the app opens on the start screen; "Play on this device" starts today's game. */
async function playHere(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Play on this device/ }).tap();
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

  test('S-07-6 in the app bundle: tap the hand, hold the big card and drag it with real touches; let go away and the hand view is back', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./');
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    await playHere(page);
    await page.waitForTimeout(400);
    const W = BOARD.width;
    const H = BOARD.height;
    // The right-hand rail (credits, clicks, End turn): no card of the hand view covers it, the view's shade does.
    const rail = { x: W - 80, y: Math.round(H * 0.55), width: 60, height: Math.round(H * 0.35) };
    const [board] = await pixelStats(page, [rail]);
    // A card in the hand strip along the bottom: the hand view opens, shading the board.
    await page.touchscreen.tap(W * 0.45, H - 30);
    await page.waitForTimeout(400);
    const [open] = await pixelStats(page, [rail]);
    expect(open!.mean, 'the hand view shades the board').toBeLessThan(board!.mean - 5);
    await test.info().attach('app-hand-view', { body: await page.screenshot(), contentType: 'image/png' });
    // Hold the big card in the middle until it lifts, then drag it to the opponent's row (no place to play).
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: W / 2, y: H / 2 }] });
    await page.waitForTimeout(700);
    const to = { x: W * 0.25, y: H * 0.22 };
    for (let k = 1; k <= 6; k++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: W / 2 + ((to.x - W / 2) * k) / 6, y: H / 2 + ((to.y - H / 2) * k) / 6 }] });
    }
    await page.waitForTimeout(300);
    const [dragging] = await pixelStats(page, [rail]);
    // Lifted: the view faded out, the board shows again (the touch was not cancelled by the WebView).
    expect(dragging!.mean, 'the board shows while the card is dragged').toBeGreaterThan(open!.mean + 5);
    await test.info().attach('app-dragging', { body: await page.screenshot(), contentType: 'image/png' });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(500);
    const [back] = await pixelStats(page, [rail]);
    expect(back!.mean, 'let go away from a place: the hand view is back').toBeLessThan(dragging!.mean - 5);
    expect(errors).toEqual([]);
  });

  test('upright, the app still shows no rotate prompt (Android keeps it sideways)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./');
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    await expect(page.getByText('Turn your phone sideways')).toHaveCount(0);
  });
});
