// QA Sprint 7 (written by QA): S-07-6 drag-to-play in the Android app's bundle (no test hook),
// with real touches, at both phone sizes. Where to touch comes from the web build (same code,
// same seed, same size), which has the hook; the app is then checked on its pixels:
// the hand view opens, the lifted card is dragged onto "new server", let go -> a card is now
// drawn in the new server's place and the Corp's clicks area matches; the app's screen there matches
// the web build after the same drag. Runs in the `android` project.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type CDPSession, type Page, expect, test } from '@playwright/test';
import type { Box } from '../src/hook-types';
import { pixelStats } from './pixels';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-07-qa');
const WEB = `http://localhost:${Number(process.env.E2E_PORT ?? 4173)}/overclock/`;
const center = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

async function drag(cdp: CDPSession, page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  await page.waitForTimeout(700); // long-press: lifts
  for (let k = 1; k <= 8; k++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * k) / 8, y: from.y + ((to.y - from.y) * k) / 8 }] });
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(150);
}

for (const vp of [
  { width: 844, height: 390 },
  { width: 640, height: 360 },
]) {
  test(`app bundle ${vp.width}x${vp.height}: tap the hand, long-press, drag onto "new server", let go: it is played`, async ({ page, context }) => {
    test.setTimeout(60_000);
    mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize(vp);
    // 1) The web build (hook) tells where things are, and what the screen looks like after.
    const web = await context.newPage();
    await web.setViewportSize(vp);
    await web.goto(`${WEB}?seed=1&play=here&cover=off&decks=starter`);
    await web.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
    await web.waitForTimeout(400);
    const v = await web.evaluate(() => window.__overclock!.getView());
    const i = v.handOptions.findIndex((os) => os.some((o) => o.reject === null && o.action.type === 'install' && o.action.server === 'new'));
    expect(i).toBeGreaterThanOrEqual(0);
    const l0 = await web.evaluate(() => window.__overclock!.layout());
    const handCard = l0.hand[i]!.box;
    const clicks = l0.corp.clicks;
    await web.touchscreen.tap(center(handCard).x, center(handCard).y);
    await web.waitForFunction((k) => window.__overclock!.layout().handView?.index === k, i);
    const centre = (await web.evaluate(() => window.__overclock!.layout())).handView!.centre;
    const wcdp = await context.newCDPSession(web);
    await wcdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center(centre)] });
    await web.waitForFunction(() => window.__overclock!.layout().drag !== null);
    const target = (await web.evaluate(() => window.__overclock!.layout())).targets.find((t) => t.kind === 'new_server' && t.lit)!;
    expect(target).toBeTruthy();
    // Same gesture goes on: drag onto the place and let go (the app gets the same touches below).
    const from = center(centre);
    const to = center(target.box);
    for (let k = 1; k <= 8; k++) {
      await wcdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * k) / 8, y: from.y + ((to.y - from.y) * k) / 8 }] });
      await web.waitForTimeout(16);
    }
    await web.waitForFunction(() => window.__overclock!.layout().drag?.hover?.kind === 'new_server');
    await wcdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await web.waitForFunction(() => !window.__overclock!.layout().animating && window.__overclock!.layout().drag === null);
    await web.waitForTimeout(800);
    const wv = await web.evaluate(() => window.__overclock!.getView());
    expect(wv.players.corp.handCount).toBe(v.players.corp.handCount - 1);
    const placed = (await web.evaluate(() => window.__overclock!.layout())).servers.at(-1)!;
    const newCard = (placed.content[0] ?? placed.ice[0])!.box;
    const [webCard, webClicks] = await pixelStats(web, [newCard, clicks]);
    await wcdp.detach();
    await web.close();

    // 2) The app bundle, same seed, real touches only.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./?seed=1&decks=starter');
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    expect(await page.evaluate(() => typeof window.__overclock)).toBe('undefined');
    await page.getByRole('button', { name: /Play on this device/ }).tap();
    await expect(page.locator('#start')).toBeHidden();
    await page.waitForTimeout(500);
    const [beforeCard] = await pixelStats(page, [newCard, clicks]);
    await page.touchscreen.tap(center(handCard).x, center(handCard).y);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(SHOTS, `android-app-${vp.width}x${vp.height}-01-hand-view.png`) });
    const cdp = await context.newCDPSession(page);
    await drag(cdp, page, center(centre), center(target.box));
    await page.screenshot({ path: join(SHOTS, `android-app-${vp.width}x${vp.height}-02-dragging-over-new-server.png`) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(SHOTS, `android-app-${vp.width}x${vp.height}-03-dropped-played.png`) });
    const [afterCard, afterClicks] = await pixelStats(page, [newCard, clicks]);
    // A card is now drawn where the new server is, as on the web build; the clicks counter reads as there (3 -> 2 is too small a pixel change to test on its own).
    expect(Math.abs(afterCard!.mean - beforeCard!.mean) + Math.abs(afterCard!.spread - beforeCard!.spread), 'something drawn in the new server').toBeGreaterThan(5);
    expect(Math.abs(afterCard!.mean - webCard!.mean), 'same as the web build').toBeLessThan(6);
    expect(Math.abs(afterClicks!.mean - webClicks!.mean), 'clicks as on the web build').toBeLessThan(6);
    expect(errors).toEqual([]);
  });
}
