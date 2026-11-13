// S-06-5: "Hand the phone over" in pass-the-phone mode. After End turn, and
// around the Corp's Rez / Don't rez during a run, an opaque cover hides every
// card until the next player taps it; the tap shows their board at once (< 100 ms).
import { type Page, expect, test } from '@playwright/test';
import { type Box, type LayoutSnapshot, dispatch, getView, layout, runButtonOf, tap, toStep, waitEndTurnArmed, waitIdle } from './helpers';
import { pixelStats } from './pixels';

/** Pass-the-phone straight away, with the cover (no `cover=off`). */
async function openCovered(page: Page, seed: number): Promise<void> {
  await page.goto(`./?seed=${seed}&play=here`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
}

/** Attached to the report; `S06_SHOTS=<dir>` also writes them there (for review). */
async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.S06_SHOTS;
  const path = dir ? `${dir}/${test.info().project.name}-${name}.png` : undefined;
  await test.info().attach(name, { body: await page.screenshot(path ? { path } : {}), contentType: 'image/png' });
}

/** Where the cards are: the bottom player's hand (or the hand area during a run), the top row and the servers. */
function cardAreas(l: LayoutSnapshot): Box[] {
  const hand = l.hand.length > 0 ? l.hand.map((h) => h.box) : [l.handArea];
  return [...hand, ...l.servers.map((s) => s.box)].filter((b) => b.width > 4 && b.height > 4);
}

/** The parts of `b` outside `cut` (up to four rects), ignoring slivers. */
function outside(b: Box, cut: Box): Box[] {
  const parts: Box[] = [];
  const top = Math.min(b.y + b.height, cut.y);
  const bottom = Math.max(b.y, cut.y + cut.height);
  if (top > b.y) parts.push({ x: b.x, y: b.y, width: b.width, height: top - b.y });
  if (bottom < b.y + b.height) parts.push({ x: b.x, y: bottom, width: b.width, height: b.y + b.height - bottom });
  const y0 = Math.max(b.y, cut.y);
  const y1 = Math.min(b.y + b.height, cut.y + cut.height);
  if (y1 > y0) {
    if (cut.x > b.x) parts.push({ x: b.x, y: y0, width: Math.min(b.width, cut.x - b.x), height: y1 - y0 });
    if (cut.x + cut.width < b.x + b.width) {
      const x = Math.max(b.x, cut.x + cut.width);
      parts.push({ x, y: y0, width: b.x + b.width - x, height: y1 - y0 });
    }
  }
  return parts.filter((p) => p.width > 4 && p.height > 4);
}

/**
 * The cover is up and nothing of the board shows through: every place a card
 * sits is flat (the cover's gradient only), unlike the same places once lifted.
 */
async function expectCovered(page: Page, to: 'corp' | 'runner', title: RegExp): Promise<Box[]> {
  const l = await layout(page);
  expect(l.cover, 'the cover is up').not.toBeNull();
  expect(l.cover!.to).toBe(to);
  expect(l.cover!.title).toMatch(title);
  expect(l.cover!.line).toBe('Tap when ready');
  expect(l.cover!.box).toEqual({ x: 0, y: 0, width: l.viewport.width, height: l.viewport.height });
  // Card places, minus the cover's own picture and words.
  const areas = cardAreas(l).flatMap((b) => outside(b, l.cover!.content));
  expect(areas.length).toBeGreaterThan(0);
  // A frame with the cover on it is drawn before the pixels are read.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const stats = await pixelStats(page, areas);
  areas.forEach((b, i) => expect(stats[i]!.spread, `card place ${JSON.stringify(b)} is hidden`).toBeLessThan(4));
  return areas;
}

/**
 * Taps the cover (a real tap) and measures: the cover is gone and the next frame
 * is drawn within 100 ms of the game handling the tap.
 */
async function liftCover(page: Page): Promise<{ stateMs: number; frameMs: number; queueMs: number }> {
  await page.evaluate(() => {
    const w = window as unknown as { __lift?: unknown };
    w.__lift = undefined;
    window.addEventListener(
      'pointerup',
      (e) => {
        const hook = window.__overclock!;
        const stateAt = performance.now();
        const input = hook.lastInput();
        const gone = hook.layout().cover === null;
        requestAnimationFrame((frameAt) => {
          w.__lift = { tapAt: e.timeStamp, handledAt: input?.eventAt === e.timeStamp ? input.handledAt : NaN, stateAt, frameAt, gone, target: input?.target };
        });
      },
      { once: true },
    );
  });
  const l = await layout(page);
  // Tap where a card would be (the middle of the bottom row): the cover takes it.
  await tap(page, { x: l.viewport.width / 2 - 5, y: l.viewport.height - 40, width: 10, height: 10 });
  await page.waitForFunction(() => (window as unknown as { __lift?: unknown }).__lift !== undefined);
  const m = await page.evaluate(() => (window as unknown as { __lift: { tapAt: number; handledAt: number; stateAt: number; frameAt: number; gone: boolean; target?: string } }).__lift);
  expect(m.target, 'the cover took the tap').toBe('cover');
  expect(Number.isFinite(m.handledAt)).toBe(true);
  expect(m.gone, 'the cover went away on the tap').toBe(true);
  const r = { stateMs: m.stateAt - m.handledAt, frameMs: m.frameAt - m.handledAt, queueMs: m.handledAt - m.tapAt };
  test.info().annotations.push({ type: 'cover-lift', description: JSON.stringify(r) });
  expect(r.stateMs, 'cover gone within 100 ms').toBeLessThan(100);
  expect(r.frameMs, 'board drawn within 100 ms').toBeLessThan(100);
  expect((await layout(page)).cover).toBeNull();
  return r;
}

test.describe('S-06-5 pass-the-phone cover', () => {
  test('End turn covers every card until the Runner taps; the tap shows the Runner board at once, and plays nothing', async ({ page }) => {
    await openCovered(page, 1);
    // Corp's turn 1: end it (the 6th card goes to Archives); the turn passes.
    await dispatch(page, { type: 'end_turn', player: 'corp' });
    expect((await layout(page)).cover, 'no cover while the Corp still discards').toBeNull();
    await dispatch(page, { type: 'discard', player: 'corp', handIndices: [5] });
    const before = await getView(page);
    expect(before.viewer).toBe('runner');
    const areas = await expectCovered(page, 'runner', /^Pass the phone to the Runner$/);
    await shot(page, 'cover-to-runner');

    await liftCover(page);
    const after = await getView(page);
    // The tap only lifted the cover: no click spent, nothing drawn.
    expect(after).toEqual(before);
    await waitIdle(page);
    const l = await layout(page);
    expect(l.viewer).toBe('runner');
    expect(l.hand.length).toBe(5);
    // Now the cards show.
    const stats = await pixelStats(page, cardAreas(l));
    expect(Math.max(...stats.map((s) => s.spread)), 'cards visible after the tap').toBeGreaterThan(10);
    expect(areas.length).toBeGreaterThan(0);
    await shot(page, 'cover-lifted-runner');
  });

  test("the Runner's real End turn tap covers for the Corp", async ({ page }) => {
    await openCovered(page, 1);
    await dispatch(page, { type: 'end_turn', player: 'corp' });
    await dispatch(page, { type: 'discard', player: 'corp', handIndices: [5] });
    await liftCover(page);
    await waitIdle(page);
    await waitEndTurnArmed(page);
    const l = await layout(page);
    expect(l.endTurn).not.toBeNull();
    await tap(page, l.endTurn!.box);
    await expectCovered(page, 'corp', /^Pass the phone to the Corp$/);
    expect((await getView(page)).viewer).toBe('corp');
    await liftCover(page);
    expect((await layout(page)).viewer).toBe('corp');
  });

  test("Rez / Don't rez: the phone goes to the Corp first, then back to the Runner", async ({ page }) => {
    await openCovered(page, 1);
    await toStep(page, 1, 'corp_rez_prompt');
    // The Runner's approach to face-down ICE waits on the Corp: cover for the Corp.
    expect((await getView(page)).viewer).toBe('runner');
    await expectCovered(page, 'corp', /^Pass the phone to the Corp$/);
    await shot(page, 'cover-to-corp-for-rez');
    await liftCover(page);
    await waitIdle(page);
    let l = await layout(page);
    // The Corp's choice is on screen; the Runner's hand is put away during the run.
    expect(l.run?.buttons.map((b) => b.label)).toEqual(expect.arrayContaining([expect.stringMatching(/^Rez/), "Don't rez"]));
    expect(l.hand).toEqual([]);
    await shot(page, 'corp-decides');

    await tap(page, runButtonOf(l, "Don't rez").box);
    await expectCovered(page, 'runner', /^Pass the phone back to the Runner$/);
    await shot(page, 'cover-back-to-runner');
    await liftCover(page);
    await waitIdle(page);
    l = await layout(page);
    expect(l.viewer).toBe('runner');
    expect(l.run === null || !l.run.buttons.some((b) => b.label === "Don't rez")).toBe(true);
  });

  test('Back under the cover asks "Leave the game?" over it; Stay keeps the cover', async ({ page }) => {
    await openCovered(page, 1);
    await dispatch(page, { type: 'end_turn', player: 'corp' });
    await dispatch(page, { type: 'discard', player: 'corp', handIndices: [5] });
    expect(await page.evaluate(() => window.__overclock!.back())).toBe('ask_leave');
    let l = await layout(page);
    expect(l.dialog?.title).toBe('Leave the game?');
    expect(l.cover).not.toBeNull();
    expect(await page.evaluate(() => window.__overclock!.back())).toBe('close_dialog');
    l = await layout(page);
    expect(l.dialog).toBeNull();
    expect(l.cover?.to).toBe('runner');
  });

  test('the cover is laid out again on rotation / resize and still covers everything', async ({ page }) => {
    await openCovered(page, 1);
    await dispatch(page, { type: 'end_turn', player: 'corp' });
    await dispatch(page, { type: 'discard', player: 'corp', handIndices: [5] });
    const vp = page.viewportSize()!;
    await page.setViewportSize({ width: vp.width - 60, height: vp.height });
    await page.waitForFunction((w) => window.__overclock!.layout().cover?.box.width === w, vp.width - 60);
    await expectCovered(page, 'runner', /Runner/);
  });
});
