// QA Sprint 15 round 7 (written by QA): the owner's hold-to-play steps in the Android app's bundle
// (no test hook: judged from screenshots), with real touch input sent as a finger moves (CDP, no
// made-up timestamps, not waiting for the page): a quick tap on the big card never drops the hand
// (no lift); a slanted thumb drag out of the small hand lifts the card (the hand drops away); let go
// on the opponent's row, the hand comes back. (Screenshots here take ~0.1-0.3 s, too slow to time the
// 0.2 s "card first, then hand" order: that is checked frame by frame with the test hook in qa-sprint15.spec.ts.)
// Runs in the `android` project (844x390, touch).
import { type CDPSession, type Page, expect, test } from '@playwright/test';
import { pixelStats } from './pixels';

const W = 844;
const H = 390;
const STRIP = { x: Math.round(W * 0.2), y: H - 50, width: Math.round(W * 0.45), height: 40 };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

async function playHere(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Play on this device/ }).tap();
  await page.getByRole('button', { name: /^Start$/ }).tap();
  await expect(page.locator('#start')).toBeHidden();
}

/** Touch events sent as the finger moves (not awaited one by one), like a real screen. */
function finger(cdp: CDPSession) {
  const pending: Promise<unknown>[] = [];
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) => pending.push(cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [p] : [] }));
  return {
    down: (p: { x: number; y: number }) => send('touchStart', p),
    async drag(from: { x: number; y: number }, to: { x: number; y: number }, ms: number, bend = 0) {
      const n = Math.max(3, Math.round(ms / 16));
      const t0 = Date.now();
      const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const c = { x: (from.x + to.x) / 2 - ((to.y - from.y) / len) * bend, y: (from.y + to.y) / 2 + ((to.x - from.x) / len) * bend };
      for (let k = 1; k <= n; k++) {
        const s = k / n;
        send('touchMove', { x: (1 - s) ** 2 * from.x + 2 * (1 - s) * s * c.x + s * s * to.x, y: (1 - s) ** 2 * from.y + 2 * (1 - s) * s * c.y + s * s * to.y });
        await sleep(t0 + (ms * k) / n - Date.now());
      }
    },
    async up() {
      send('touchEnd');
      await Promise.all(pending.splice(0));
    },
  };
}

test('round 7, app bundle: a quick tap on the big card never lifts it; a slanted thumb drag out of the small hand lifts it; let go away, the hand comes back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  await playHere(page);
  await page.waitForTimeout(800);
  const cdp = await page.context().newCDPSession(page);
  const f = finger(cdp);
  const [base] = await pixelStats(page, [STRIP]);

  // Open the hand view with a 90 ms tap on the hand, then tap the big card for 80 ms.
  const x = W * 0.45;
  f.down({ x, y: H - 30 });
  await sleep(90);
  await f.up();
  await page.waitForTimeout(600);
  const table = { x: 0, y: Math.round(H * 0.15), width: Math.round(W * 0.75), height: Math.round(H * 0.55) };
  const [viewStrip, viewTable] = await pixelStats(page, [STRIP, table]);
  f.down({ x: W * 0.4, y: H * 0.45 });
  await sleep(80);
  await f.up();
  await page.waitForTimeout(150);
  const [tapStrip, tapTable] = await pixelStats(page, [STRIP, table]);
  test.info().annotations.push({ type: 'r7-app-tap', description: JSON.stringify({ viewStrip: viewStrip!.mean, tapStrip: tapStrip!.mean, viewTable: viewTable!.mean, tapTable: tapTable!.mean }) });
  expect(Math.abs(tapStrip!.mean - viewStrip!.mean), 'a quick tap does not drop the hand (no lift)').toBeLessThan(3);
  await test.info().attach('app-after-quick-tap', { body: await page.screenshot(), contentType: 'image/png' });
  // Close the view (top-left corner).
  f.down({ x: 8, y: 8 });
  await sleep(70);
  await f.up();
  await page.waitForTimeout(600);

  // A thumb drag out of the small hand that starts at a slant (about 200 ms).
  const s = { x, y: H - 30 };
  f.down(s);
  await f.drag(s, { x: s.x + 45, y: s.y - 110 }, 200, 20);
  await page.waitForTimeout(350);
  const [held] = await pixelStats(page, [STRIP]);
  await test.info().attach('app-held-from-strip', { body: await page.screenshot(), contentType: 'image/png' });
  expect(Math.abs(held!.mean - base!.mean), 'lifted: the hand dropped away').toBeGreaterThan(5);
  // Let go over the opponent's row (no place to play there).
  await f.drag({ x: s.x + 45, y: s.y - 110 }, { x: W * 0.25, y: H * 0.1 }, 200);
  await f.up();
  await page.waitForTimeout(700);
  const [back] = await pixelStats(page, [STRIP]);
  test.info().annotations.push({ type: 'r7-app-return', description: JSON.stringify({ base: base!.mean, held: held!.mean, back: back!.mean }) });
  expect(Math.abs(back!.mean - base!.mean), 'the hand is back').toBeLessThan(Math.abs(held!.mean - base!.mean) / 2);
  expect(errors).toEqual([]);
  await cdp.detach();
});
