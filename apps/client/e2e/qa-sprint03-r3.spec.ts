// QA Sprint 3 round 3 (QA-S3-7): a quick tap with a long page stall in the middle is still a tap;
// real holds (with or without a stall) still zoom and never pick. QA-written, independent of discard.spec.ts:
// the stall runs in a bubble-phase listener after the game handled the press, 600ms and 1200ms.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { center, dispatch, layout, openBoard, tap, waitIdle } from './helpers';
import type { Box } from './helpers';

async function openPicker(page: Page) {
  await openBoard(page);
  await dispatch(page, { type: 'draw', player: 'corp' });
  await dispatch(page, { type: 'draw', player: 'corp' });
  const l = await waitIdle(page);
  await tap(page, l.endTurn!.box);
  return waitIdle(page);
}

/** Arms a page stall of `ms` that starts right after the game handles the next pointerdown. */
async function armStall(page: Page, ms: number) {
  await page.evaluate((ms) => {
    const w = window as unknown as { __q: { down: number; up: number; upHandled: number; stallEnd: number } };
    w.__q = { down: 0, up: 0, upHandled: 0, stallEnd: 0 };
    window.addEventListener('pointerdown', (e) => { w.__q.down = e.timeStamp; }, { once: true, capture: true });
    // Bubble phase on window: runs after the game's own pointerdown handler set its hold timer.
    window.addEventListener('pointerdown', () => {
      const until = performance.now() + ms;
      while (performance.now() < until) { /* stalled */ }
      w.__q.stallEnd = performance.now();
    }, { once: true });
    window.addEventListener('pointerup', (e) => {
      w.__q.up = e.timeStamp;
      w.__q.upHandled = performance.now();
    }, { once: true, capture: true });
  }, ms);
}

/** Down stamped t0, up stamped t0+heldMs; up sent after `waitBeforeUp` real ms. */
async function cdpPress(page: Page, b: Box, heldMs: number, waitBeforeUp: number) {
  const { x, y } = center(b);
  const cdp = await page.context().newCDPSession(page);
  const touch = test.info().project.use.hasTouch === true;
  const t0 = Date.now();
  const at = (ms: number) => ({ timestamp: (t0 + ms) / 1000 });
  const down = touch
    ? cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }], ...at(0) })
    : cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, ...at(0) });
  await new Promise((r) => setTimeout(r, Math.max(waitBeforeUp, heldMs + 1)));
  const up = touch
    ? cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], ...at(heldMs) })
    : cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, ...at(heldMs) });
  await Promise.all([down, up]);
  await cdp.detach();
}

const q = (page: Page) => page.evaluate(() => (window as unknown as { __q: { down: number; up: number; upHandled: number; stallEnd: number } }).__q);

for (const [stall, waitUp, label] of [
  [600, 150, 'release queued during a 600ms stall'],
  [600, 900, 'release sent after a 600ms stall ended and the hold timer ran'],
  [1200, 150, 'release queued during a 1200ms stall'],
  [1200, 1500, 'release sent after a 1200ms stall'],
] as const) {
  test(`QA r3: 30ms tap, ${label}: picks the card, no zoom left`, async ({ page }) => {
    let l = await openPicker(page);
    expect(l.picker?.label).toBe('Discard 3');
    await armStall(page, stall);
    await cdpPress(page, l.hand[2]!.box, 30, waitUp);
    await page.waitForFunction(() => (window as unknown as { __q: { upHandled: number } }).__q.upHandled > 0);
    await page.waitForTimeout(500);
    const t = await q(page);
    expect(t.up - t.down, 'finger down for ~30ms').toBeLessThan(60);
    expect(t.upHandled - t.down, 'release handled after the 350ms hold time').toBeGreaterThan(400);
    l = await layout(page);
    expect(l.hand[2]!.marked, 'picked').toBe(true);
    expect(l.picker?.label).toBe('Discard 2');
    expect(l.zoom).toBeNull();
  });
}

test('QA r3: a real 900ms hold with a 600ms stall in it zooms and does NOT pick', async ({ page }) => {
  let l = await openPicker(page);
  await armStall(page, 600);
  const { x, y } = center(l.hand[2]!.box);
  const cdp = await page.context().newCDPSession(page);
  const touch = test.info().project.use.hasTouch === true;
  if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  else await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await page.waitForTimeout(900);
  l = await layout(page);
  expect(l.zoom, 'zoom open while still held').not.toBeNull();
  if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  else await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await cdp.detach();
  await page.waitForTimeout(300);
  l = await layout(page);
  expect(l.zoom).toBeNull();
  expect(l.hand[2]!.marked, 'a hold is not a pick').toBe(false);
  expect(l.picker?.label).toBe('Discard 3');
});

test('QA r3: a real 600ms hold (no stall) on a hand card zooms; release does not pick', async ({ page }) => {
  let l = await openPicker(page);
  const { x, y } = center(l.hand[0]!.box);
  const cdp = await page.context().newCDPSession(page);
  const touch = test.info().project.use.hasTouch === true;
  if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  else await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await page.waitForTimeout(600);
  l = await layout(page);
  expect(l.zoom).not.toBeNull();
  // Screenshots only on request, so normal runs never rewrite committed files.
  if (process.env.QA_SCREENS) await page.screenshot({ path: `../../docs/sprints/sprint-03-qa/${test.info().project.name === 'phone' ? 'phone-844x390' : test.info().project.name === 'phone-small' ? 'phone-640x360' : 'desktop-1280x800'}-r3-01-hold-zooms-in-discard-picker.png` });
  if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  else await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await cdp.detach();
  await page.waitForTimeout(300);
  l = await layout(page);
  expect(l.zoom).toBeNull();
  expect(l.hand[0]!.marked).toBe(false);
});
