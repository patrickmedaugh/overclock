// QA Sprint 4 (written by QA): the Android app's bundle (dist-android) played
// with real taps, no test hook, at both phone sizes. Runs in the `android` project.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { pixelStats } from './pixels';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-04-qa');

for (const vp of [
  { width: 844, height: 390 },
  { width: 640, height: 360 },
]) {
  test(`app bundle ${vp.width}x${vp.height}: plays with taps, nothing leaves the app, no test hook`, async ({ page, baseURL }) => {
    mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize(vp);
    const origin = new URL(baseURL!).origin;
    const foreign: string[] = [];
    const errors: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.protocol !== 'data:' && u.protocol !== 'blob:' && u.origin !== origin) foreign.push(r.url());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./');
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    expect(await page.evaluate(() => typeof (window as unknown as Record<string, unknown>)['__overclock'])).toBe('undefined');
    // No hook in any script the page loaded either.
    const srcs = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.endsWith('.js')));
    for (const s of srcs) expect(await (await page.request.get(s)).text()).not.toContain('__overclock');
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(SHOTS, `android-app-${vp.width}x${vp.height}-01-board.png`) });

    // Gain a credit (Corp credits pill is on the bottom row's right side: just tap around the hand and board).
    const W = vp.width;
    const H = vp.height;
    await page.touchscreen.tap(W * 0.45, H - 30); // a hand card: picks it
    await page.waitForTimeout(250);
    await page.touchscreen.tap(W * 0.5, H * 0.5); // board: drops the pick
    await page.waitForTimeout(250);
    // Hold a hand card and slide (S-04-3 in the app bundle).
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: W * 0.35, y: H - 30 }] });
    await page.waitForTimeout(700);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: W * 0.5, y: H - 30 }] });
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(SHOTS, `android-app-${vp.width}x${vp.height}-02-hold-slide.png`) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    const [s] = await pixelStats(page, [{ x: 0, y: 0, width: W, height: H }]);
    expect(s!.spread).toBeGreaterThan(10);
    expect(foreign).toEqual([]);
    expect(errors).toEqual([]);
  });
}
