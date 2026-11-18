// S-04-1 / S-04-2: the Android app's web bundle (`vite build --mode android`,
// what goes inside the APK), served from the web root as Capacitor does.
// Runs only in the `android` Playwright project.
import { LocalMatch } from '@overclock/match';
import { type Page, expect, test } from '@playwright/test';
import { pixelStats } from './pixels';

/** Sprint 6: the app opens on the start screen; "Play on this device" starts today's game. */
async function playHere(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Play on this device/ }).tap();
  // Sprint 13: the deck picker (standard decks picked) -> Start.
  await page.getByRole('button', { name: /^Start$/ }).tap();
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

  test('S-11-3: the app killed and opened again: Continue game brings the pass-the-phone game back', async ({ page, context }) => {
    // Android may kill the app in the background; its WebView storage stays (DECISIONS 2026-11-17).
    // Here: close the page and open the bundle again in the same browser storage.
    const errors: string[] = [];
    const watch = (p: Page) => p.on('pageerror', (e) => errors.push(e.message));
    watch(page);
    const saved = (p: Page) =>
      p.evaluate(() => {
        const raw = window.localStorage.getItem('overclock.hotseat.v1');
        return raw === null ? null : (JSON.parse(raw) as { actions: { type: string }[] }).actions;
      });
    await page.goto('./');
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    await playHere(page);
    await page.waitForTimeout(400);
    // A real tap: the Corp's credits in the rail (+1 credit) — the app saves it by itself.
    await page.touchscreen.tap(BOARD.width - 75, Math.round(BOARD.height * 0.66));
    await expect.poll(() => saved(page)).toEqual([{ type: 'gain_credit', player: 'corp' }]);
    const [before] = await pixelStats(page, [BOARD]);

    await page.close();
    const again = await context.newPage();
    watch(again);
    await again.goto('./');
    await again.waitForFunction(() => document.body.dataset.ready === 'true');
    const cont = again.getByRole('button', { name: /^Continue game/ });
    await expect(cont).toContainText("On this device · Corp's turn");
    await test.info().attach('app-continue', { body: await again.screenshot(), contentType: 'image/png' });
    await cont.tap();
    await expect(again.locator('#start')).toBeHidden();
    // Behind the pass cover first; a tap lifts it and the board is drawn.
    await again.waitForTimeout(300);
    await test.info().attach('app-restored-cover', { body: await again.screenshot(), contentType: 'image/png' });
    await again.touchscreen.tap(BOARD.width / 2, BOARD.height / 2);
    await again.waitForTimeout(400);
    const [after] = await pixelStats(again, [BOARD]);
    expect(after!.spread).toBeGreaterThan(10);
    expect(Math.abs(after!.mean - before!.mean), 'the same board as before').toBeLessThan(3);
    await test.info().attach('app-restored', { body: await again.screenshot(), contentType: 'image/png' });
    // Still the same saved game (nothing lost, nothing added).
    expect(await saved(again)).toEqual([{ type: 'gain_credit', player: 'corp' }]);
    expect(errors).toEqual([]);
  });

  test('Sprint 12 (S-12-5): a new game in the app deals the 45-card decks', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    await playHere(page);
    await page.waitForTimeout(400);
    // A real tap (+1 credit) makes the app save the game; its save names the decks it deals.
    await page.touchscreen.tap(BOARD.width - 75, Math.round(BOARD.height * 0.66));
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('overclock.hotseat.v1'))).not.toBeNull();
    const raw = await page.evaluate(() => window.localStorage.getItem('overclock.hotseat.v1'));
    const save = JSON.parse(raw!) as { options: { deckSet: string } };
    expect(save.options.deckSet).toBe('core45');
    // Replayed here: 45 cards a side (deck + hand; nothing else played yet).
    const loaded = LocalMatch.load(raw!);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const v = loaded.match.view('corp');
    expect(v.players.corp.deckCount + v.players.corp.handCount).toBe(45);
    expect(v.players.runner.deckCount + v.players.runner.handCount).toBe(45);
  });

  test('upright, the app still shows no rotate prompt (Android keeps it sideways)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./');
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    await expect(page.getByText('Turn your phone sideways')).toHaveCount(0);
  });
});
