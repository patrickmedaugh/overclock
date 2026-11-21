// Sprint 15 (S-15-4): never slower than today. A tap while cards move finishes the movement at
// once and is answered within 0.1 s, on every screen size (891x296, 844x390, 640x360, desktop);
// nothing blocks play for more than 0.6 s; turning the phone mid-movement leaves nothing floating.
import { type Page, expect, test } from '@playwright/test';
import type { AnimRecord } from '../src/hook-types';
import { anims, center, dispatch, dragTo, expectSnappy, getView, holdAt, layout, measureTap, openBoard, openHand, passTurn, tap, toRunnerTurn, waitIdle } from './helpers';

async function startDraw(page: Page): Promise<void> {
  const l = await waitIdle(page);
  await page.evaluate(() => window.__overclock!.motion('hold'));
  await tap(page, l.corp.deck);
  await page.waitForFunction(() => window.__overclock!.layout().motion.active > 0);
}

test.describe('S-15-4 never slower than today', () => {
  test('a tap while a card flies finishes the movement at once and is answered within 0.1 s', async ({ page }) => {
    await openBoard(page, 1);
    await startDraw(page);
    const before = await getView(page);
    const handBefore = before.players.corp.handCount;
    const l = await layout(page);
    const m = await measureTap(page, l.corp.credits);
    expectSnappy(m, ['motion_skipped']);
    const skipped = m.anims.find((a) => a.kind === 'motion_skipped')!;
    expect(skipped.scheduledMs).toBe(0);
    // Finished before the tap was handled: the tap acted on the board as it ends up.
    expect(skipped.startedAt).toBeLessThanOrEqual(m.handledAt);
    expect(m.view.players.corp.credits, 'the tap counted').toBe(before.players.corp.credits + 1);
    const after = await layout(page);
    expect(after.motion.flights, 'nothing left in the air').toEqual([]);
    expect(after.hand.length).toBe(handBefore);
    const last = after.hand.at(-1)!.box;
    expect(last.y, 'the drawn card is in the hand').toBeGreaterThanOrEqual(after.handArea.y - 1);
  });

  test('every movement in a few turns of play stays inside the 0.6 s budget', async ({ page }) => {
    await openBoard(page, 1);
    await page.evaluate(() => window.__overclock!.clearAnims());
    const v = await getView(page);
    const install = v.handOptions.flat().find((o) => o.reject === null && o.action.type === 'install');
    if (install) await dispatch(page, install.action);
    await waitIdle(page);
    await dispatch(page, { type: 'draw', player: 'corp' });
    await waitIdle(page);
    await passTurn(page);
    await toRunnerOptions(page);
    await passTurn(page);
    const all: AnimRecord[] = await page.evaluate(() => window.__overclock!.anims());
    expect(all.length).toBeGreaterThan(3);
    for (const r of all) if (r.kind !== 'hint' && r.kind !== 'notice') expect(r.scheduledMs, `${r.kind} within 0.6 s`).toBeLessThanOrEqual(600);
  });

  test('turning the phone mid-movement puts every card in its place (nothing left floating)', async ({ page }) => {
    test.skip(test.info().project.use.isMobile !== true, 'phones only');
    await openBoard(page, 1);
    await startDraw(page);
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.height, height: size.width });
    await page.waitForFunction(() => window.__overclock!.layout().viewport.width < window.__overclock!.layout().viewport.height);
    await page.setViewportSize(size);
    await page.waitForFunction((w) => window.__overclock!.layout().viewport.width === w, size.width);
    const now = await layout(page);
    expect(now.motion.active).toBe(0);
    expect(now.motion.flights).toEqual([]);
    await page.evaluate(() => window.__overclock!.motion('normal'));
    const idle = await waitIdle(page);
    expect(now.hand.map((h) => h.box), 'hand cards where an idle board puts them').toEqual(idle.hand.map((h) => h.box));
  });

  test('S-15-6 hold to play: the card reacts at once, lifts at 0.25 s, and nothing stops play for more than 0.6 s', async ({ page }) => {
    await openBoard(page, 6);
    const open = await openHand(page, 0);
    // The view's neighbour faces are drawn ahead one frame at a time: let that finish first.
    await page.evaluate(
      () =>
        new Promise<void>((done) => {
          let last = performance.now();
          let quick = 0;
          const step = (t: number) => {
            quick = t - last < 50 ? quick + 1 : 0;
            last = t;
            if (quick >= 5) done();
            else requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }),
    );
    await page.evaluate(() => {
      const w = window as unknown as { __down: number; __gap: number };
      w.__gap = 0;
      window.addEventListener('pointerdown', (e) => (w.__down = e.timeStamp), { capture: true, once: true });
      let last = performance.now();
      const f = window as unknown as { __frames: number[] };
      f.__frames = [];
      const loop = (t: number) => {
        w.__gap = Math.max(w.__gap, t - last);
        last = t;
        f.__frames.push(t);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      window.__overclock!.clearAnims();
    });
    const hold = await holdAt(page, open.handView!.centre);
    await page.waitForFunction(() => window.__overclock!.layout().drag !== null);
    const { down, gap } = await page.evaluate(() => {
      const w = window as unknown as { __down: number; __gap: number };
      return { down: w.__down, gap: w.__gap };
    });
    const recs = await anims(page);
    const press = recs.find((r) => r.kind === 'hand_press')!;
    const lift = recs.find((r) => r.kind === 'card_lift')!;
    test.info().annotations.push({ type: 'hold-ms', description: JSON.stringify({ press: press.startedAt - down, lift: lift.startedAt - down, longestFrame: gap }) });
    // Reacts (rises) as soon as the press is handled, within a tenth of a second.
    expect(press.startedAt - press.inputAt!).toBeLessThan(100);
    expect(press.scheduledMs).toBeLessThanOrEqual(100);
    // Lifts at 0.25 s after the finger went down (never before; late only by a frame the runner was drawing).
    expect(lift.startedAt - down).toBeGreaterThanOrEqual(245);
    // On time: within a tenth of a second of 0.25 s, or, where the page draws slowly, on the first or
    // second frame after it (a late timer waits one frame on purpose, QA-S3-7).
    const frames = await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames);
    const after = frames.filter((t) => t >= down + 250);
    expect(lift.startedAt, 'lifted on time').toBeLessThanOrEqual(Math.max(down + 350, (after[1] ?? Infinity) + 100));
    // Drop it on a lit place: the hand comes back and the next tap is answered at once.
    const l = await layout(page);
    const t = l.targets.find((x) => x.lit)!;
    await dragTo(hold, center(open.handView!.centre), center(t.box), 4);
    await hold.release();
    await page.waitForFunction(() => window.__overclock!.layout().drag === null && !window.__overclock!.layout().handMinimized);
    const all: AnimRecord[] = await page.evaluate(() => window.__overclock!.anims());
    for (const k of ['hand_minimize', 'hand_restore', 'card_lift', 'install_flight'] as const) expect(all.some((r) => r.kind === k), k).toBe(true);
    for (const r of all) if (r.kind !== 'hint' && r.kind !== 'notice') expect(r.scheduledMs, `${r.kind} within 0.6 s`).toBeLessThanOrEqual(600);
    const m = await measureTap(page, (await layout(page)).corp.credits);
    expectSnappy(m, ['credit_pop']);
  });
});

/** The Runner plays what the view offers first (install or play), then draws. */
async function toRunnerOptions(page: Page): Promise<void> {
  const v = await getView(page);
  if (v.activePlayer !== 'runner') await toRunnerTurn(page);
  const w = await getView(page);
  const opt = w.handOptions.flat().find((o) => o.reject === null && (o.action.type === 'play' || o.action.type === 'install'));
  if (opt) await dispatch(page, opt.action);
  await waitIdle(page);
  await dispatch(page, { type: 'draw', player: 'runner' });
  await waitIdle(page);
}
