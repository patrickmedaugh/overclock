// S-15-6 (owner, after the Sprint 15 demo): hold a card to play it, Hearthstone-style. In the hand
// view sideways = browse, a still hold (0.12 s since owner round 3, 2026-11-22; was 0.25 s) or an upward
// or diagonal drag = pick up; on the small hand strip a still hold or any drag but down picks up too. The hand drops away, every place the card can go lights at once
// (from view.handOptions), the place under it is highlighted strongly, letting go there plays it;
// anywhere else it glides back. A tap on the big card never plays ("Hold to play"). A card that
// can't be played lifts dimmed with the reason. Runs at 891x296, 844x390, 640x360 and desktop
// (mouse), and at 6x CPU slow-down (E2E_CPU_THROTTLE=6, docs/TESTING.md §3).
import { type Page, expect, test } from '@playwright/test';
import { getCard } from '@overclock/cards';
import type { CardOption, PlayerView } from '@overclock/engine';
import {
  type Box,
  type Hold,
  type LayoutSnapshot,
  anims,
  center,
  dispatch,
  dragTo,
  emptySpot,
  getView,
  holdAt,
  layout,
  openBoard,
  openHand,
  pickCard,
  sendTap,
  tap,
  toRunnerTurn,
  waitHandBack,
  waitIdle,
} from './helpers';

/** The place kind (and server) an option lights, as the board names them. */
function placeOf(o: CardOption): string {
  const a = o.action;
  if (a.type === 'install' && a.server === 'new') return 'new_server';
  if (a.type === 'install' && a.server !== undefined) return `server:${a.server}`;
  if (a.type === 'install') return 'install';
  if (a.type === 'play' && a.installIndex !== undefined) return `grip:${a.installIndex}`;
  if (a.type === 'play' && a.uid !== undefined) return `expose:${a.uid}`;
  if (a.type === 'play' && a.server !== undefined) return `play:${a.server}`;
  return 'play';
}

function placeOfTarget(t: LayoutSnapshot['targets'][number]): string {
  if (t.kind === 'server') return `server:${t.server}`;
  if (t.kind === 'grip') return `grip:${t.index}`;
  if (t.kind === 'expose') return `expose:${t.uid}`;
  if (t.kind === 'play' && t.server !== undefined) return `play:${t.server}`;
  return t.kind;
}

const sorted = (xs: string[]) => [...xs].sort();

/** Puts a finger on hand card `i` in the strip and drags it up out of the strip (keeps it down). */
async function liftFromStrip(page: Page, i: number): Promise<{ hold: Hold; at: { x: number; y: number }; l: LayoutSnapshot }> {
  const l0 = await layout(page);
  const box = l0.hand[i]!.box;
  const start = center(box);
  const hold = await holdAt(page, box);
  const at = { x: start.x, y: box.y - box.height * 0.3 };
  await dragTo(hold, start, at, 3);
  await page.waitForFunction(() => window.__overclock!.layout().drag !== null);
  return { hold, at, l: await layout(page) };
}

/**
 * QA-S15-11: a press at `a` and a move to `b`, sent at once without waiting for the page to handle the
 * press (touch on the phone projects, mouse on desktop; the browser stamps each as it arrives, as a
 * finger's events are). Returns the release (at `b`).
 */
async function pressAndMove(page: Page, a: { x: number; y: number }, b: { x: number; y: number }): Promise<() => Promise<void>> {
  const cdp = await page.context().newCDPSession(page);
  const touch = test.info().project.use.hasTouch === true;
  if (touch) {
    await Promise.all([
      cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] }),
      cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [b] }),
    ]);
  } else {
    // The pointer is over the card first (no button: hover only), then press + move go together.
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y, button: 'none', buttons: 0 });
    await Promise.all([
      cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 }),
      cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, button: 'left', buttons: 1 }),
    ]);
  }
  return async () => {
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 });
    await cdp.detach();
  };
}

/** A point on the table off every lit place. */
function offPlaces(l: LayoutSnapshot): { x: number; y: number } {
  const p = center(emptySpot(l));
  const hit = (b: Box) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
  // The play zone covers the table: let go over the rail's help text instead (never a place).
  if (l.targets.some((t) => hit(t.box))) return { x: l.viewport.width - 4, y: Math.round(l.viewport.height * 0.35) };
  return { x: Math.min(p.x, l.viewport.width - 4), y: p.y };
}

/**
 * A quick press-move-release from `a` to `b` in `steps` moves, all sent at once and stamped 30 ms
 * apart (the page judges a press by its events' times, so a busy page sees the flick that was made).
 */
async function flick(page: Page, a: { x: number; y: number }, b: { x: number; y: number }, steps: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const t0 = Date.now() / 1000;
  const touch = test.info().project.use.hasTouch === true;
  const at = (k: number) => ({ x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps });
  const sent: Promise<unknown>[] = [];
  for (let k = 0; k <= steps + 1; k++) {
    const p = at(Math.min(k, steps));
    const timestamp = t0 + k * 0.03;
    if (touch) {
      const type = k === 0 ? 'touchStart' : k <= steps ? 'touchMove' : 'touchEnd';
      sent.push(cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [p], timestamp }));
    } else {
      const type = k === 0 ? 'mousePressed' : k <= steps ? 'mouseMoved' : 'mouseReleased';
      sent.push(cdp.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, timestamp }));
    }
  }
  await Promise.all(sent);
  await cdp.detach();
}

/** S-15-6 owner round 3: the still hold that lifts a card (ms; `HOLD_MS`). */
const HOLD = 120;

/** Pointer down event times on the page (for "lifted 0.12 s after the finger went down"). */
async function watchDowns(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __downs: number[]; __moves: { at: number; handled: number; y: number }[] };
    w.__downs = [];
    w.__moves = [];
    window.addEventListener('pointerdown', (e) => w.__downs.push(e.timeStamp), { capture: true });
    window.addEventListener('pointermove', (e) => w.__moves.push({ at: e.timeStamp, handled: performance.now(), y: e.clientY }), { capture: true });
    // The longest frame since: a GPU-less test runner can take 100-300 ms to draw one frame at 2.6x
    // pixels, which delays every handler (input queueing is the browser's, not the game's budget).
    const g = window as unknown as { __gap: number };
    g.__gap = 0;
    let last = performance.now();
    const f = window as unknown as { __frames: number[] };
    f.__frames = [];
    const loop = (t: number) => {
      g.__gap = Math.max(g.__gap, t - last);
      last = t;
      f.__frames.push(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}
/** Waits until a few frames in a row come quickly (nothing heavy is being drawn ahead). */
async function settleFrames(page: Page): Promise<void> {
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
}
const frameGap = (page: Page) => page.evaluate(() => (window as unknown as { __gap: number }).__gap);
const resetGap = (page: Page) => page.evaluate(() => ((window as unknown as { __gap: number }).__gap = 0));
const lastDown = (page: Page) => page.evaluate(() => (window as unknown as { __downs: number[] }).__downs.at(-1)!);

test.describe('S-15-6 hold a card to play it', () => {
  test('in the hand view a sideways flick browses: nothing is picked up', async ({ page }) => {
    await openBoard(page, 1);
    const open = await openHand(page, 1);
    await page.evaluate(() => window.__overclock!.clearAnims());
    const c = center(open.handView!.centre);
    // A slightly rising sideways flick (well outside the 40° cone) is still a browse. Sent as one
    // quick gesture stamped 30 ms apart (a slowed-down page must not see a pause the finger never made).
    const to = { x: c.x - open.handView!.centre.width * 0.7, y: c.y - 14 };
    await flick(page, c, to, 6);
    await page.waitForFunction(() => (window.__overclock!.layout().handView?.index ?? 0) >= 2);
    const l = await layout(page);
    expect(l.drag).toBeNull();
    expect(l.targets).toEqual([]);
    expect(l.handMinimized).toBe(false);
    expect((await anims(page)).some((a) => a.kind === 'card_lift')).toBe(false);
  });

  test('QA-S15-2: a quick flick handed over only after the hold timer lifted the card (busy page) is undone: it browses, nothing is played', async ({ page }) => {
    test.skip(test.info().project.use.hasTouch !== true, 'touch (event times made in the past)');
    await openBoard(page, 4);
    const before = await getView(page);
    const open = await openHand(page, 4); // Hedge Fund: its lit place is the whole table
    const c = center(open.handView!.centre);
    const cdp = await page.context().newCDPSession(page);
    const t0 = Date.now();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [c], timestamp: t0 / 1000 });
    // The browser hands the flick over late: the timer has lifted the card by then.
    await page.waitForFunction(() => window.__overclock!.layout().drag !== null);
    // The flick itself was made 70-110 ms after the finger went down, let go at 120 ms, over the table.
    for (let k = 1; k <= 5; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x - 25 * k, y: c.y }], timestamp: (t0 + 60 + 10 * k) / 1000 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: (t0 + 120) / 1000 });
    await cdp.detach();
    await page.waitForTimeout(400);
    const l = await layout(page);
    expect(l.drag, 'the lift is undone').toBeNull();
    expect(l.targets).toEqual([]);
    expect(l.handView?.index, 'it browsed (a flick to the left brings the next card)').toBe(5);
    expect(await getView(page), 'nothing played or paid').toEqual(before);
    expect((await anims(page)).some((a) => a.kind === 'play_flight' || a.kind === 'install_flight')).toBe(false);
  });

  test('holding the big card still lifts it at 0.12 s: the view fades, the hand drops away, its places light', async ({ page }) => {
    await openBoard(page, 6);
    const v = await getView(page);
    const i = v.handOptions.findIndex((os) => os.some((o) => o.reject === null && o.action.type === 'install'));
    const open = await openHand(page, i);
    await watchDowns(page);
    // The view's neighbour faces are drawn ahead one per frame: let that finish (GPU-less runners draw slowly).
    await settleFrames(page);
    await resetGap(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    const h = await holdAt(page, open.handView!.centre);
    await page.waitForFunction(() => window.__overclock!.layout().drag !== null);
    const down = await lastDown(page);
    const lift = (await anims(page)).find((a) => a.kind === 'card_lift')!;
    // Judged from the press: not before 0.12 s, and on time (a tenth of a second of slack).
    const gap = await frameGap(page);
    test.info().annotations.push({ type: 'lift-ms', description: `${(lift.startedAt - down).toFixed(1)} (longest frame ${gap.toFixed(1)})` });
    expect(lift.startedAt - down).toBeGreaterThanOrEqual(HOLD - 5);
    // On time: within a tenth of a second of 0.12 s, or, where the page draws slowly, on the first or
    // second frame after it (a late timer waits one frame on purpose so a quick release queued
    // meanwhile stays a tap, QA-S3-7). On a phone a frame is ~16 ms; a GPU-less 6x-slowed runner
    // draws one in up to ~400 ms.
    const frames = await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames);
    const after = frames.filter((t) => t >= down + HOLD);
    const due = Math.max(down + HOLD + 100, (after[1] ?? Infinity) + 100);
    expect(lift.startedAt, 'lifted on time').toBeLessThanOrEqual(due);
    await page.waitForTimeout(200);
    const l = await layout(page);
    expect(l.drag).toMatchObject({ index: i, from: 'view', dimmed: false });
    expect(l.zoom, 'the big view faded away').toBeNull();
    expect(l.handMinimized).toBe(true);
    for (const c of l.hand) if (c.cardId !== l.drag!.cardId || l.hand.indexOf(c) !== i) expect(c.box.y, 'the hand is below the screen').toBeGreaterThanOrEqual(l.viewport.height);
    expect(sorted(l.targets.map(placeOfTarget))).toEqual(sorted(v.handOptions[i]!.map(placeOf)));
    const recs = await anims(page);
    expect(recs.find((a) => a.kind === 'hand_minimize')!.scheduledMs).toBeLessThanOrEqual(120);
    await h.release();
    await waitHandBack(page);
  });

  test('dragging the big card upward picks it up at once (no wait)', async ({ page }) => {
    await openBoard(page, 6);
    const open = await openHand(page, 0);
    await watchDowns(page);
    // The view's neighbour faces are drawn ahead one per frame: let that finish (GPU-less runners draw slowly).
    await settleFrames(page);
    await resetGap(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    const c = center(open.handView!.centre);
    // QA-S15-11: the press and the move are sent together, as a finger makes them (none waits for the
    // page to finish the press: `page.mouse.down()` alone took 80-215 ms on desktop, past the hold time).
    const release = await pressAndMove(page, c, { x: c.x + 4, y: c.y - 40 });
    await page.waitForFunction(() => window.__overclock!.layout().drag !== null);
    const lift = (await anims(page)).find((a) => a.kind === 'card_lift')!;
    // Lifted by the move that left the 7 px circle upward, not by the hold timer.
    const m = await page.evaluate((y0) => (window as unknown as { __moves: { at: number; handled: number; y: number }[] }).__moves.find((x) => y0 - x.y > 7)!, c.y);
    // Budgets count from when the page handled the move (input queueing is annotated only, as for taps).
    test.info().annotations.push({ type: 'lift-ms', description: `${(lift.startedAt - m.handled).toFixed(1)} after handling, queued ${(m.handled - m.at).toFixed(1)}` });
    expect(lift.startedAt - m.handled, 'lifted on that move').toBeLessThan(100);
    expect(m.at - (await lastDown(page)), 'the finger left the circle before the hold time').toBeLessThan(HOLD);
    expect((await layout(page)).drag).toMatchObject({ index: 0, from: 'view' });
    await release();
    await page.waitForFunction(() => window.__overclock!.layout().drag === null);
  });

  test('straight up out of the small hand picks a card up without opening the hand view', async ({ page }) => {
    await openBoard(page, 6);
    const v = await getView(page);
    const { hold, l } = await liftFromStrip(page, 2);
    expect(l.handView).toBeNull();
    expect(l.drag).toMatchObject({ index: 2, from: 'strip', dimmed: false });
    expect(l.selected).toBe(2);
    expect(sorted(l.targets.map(placeOfTarget))).toEqual(sorted(v.handOptions[2]!.map(placeOf)));
    await hold.release();
    await waitHandBack(page);
  });

  test('owner round 3: holding a card still in the small hand picks it up at 0.12 s (no hand view), big; let go on a lit place plays it', async ({ page }) => {
    await openBoard(page, 6);
    const l0 = await waitIdle(page);
    const v = await getView(page);
    const i = v.handOptions.findIndex((os) => os.some((o) => o.reject === null && o.action.type === 'install'));
    await watchDowns(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    const h = await holdAt(page, l0.hand[i]!.box);
    await page.waitForFunction(() => window.__overclock!.layout().drag !== null);
    const down = await lastDown(page);
    const lift = (await anims(page)).find((a) => a.kind === 'card_lift')!;
    test.info().annotations.push({ type: 'lift-ms', description: (lift.startedAt - down).toFixed(1) });
    expect(lift.startedAt - down, 'not before the hold time').toBeGreaterThanOrEqual(HOLD - 5);
    const l = await layout(page);
    expect(l.drag).toMatchObject({ index: i, from: 'strip', dimmed: false });
    expect(l.handView, 'no hand view: the card itself is held').toBeNull();
    // Bigger than before round 3 (1.5x: 0.63 of the screen's height), wholly on screen.
    expect(l.drag!.box.height).toBeGreaterThan(l.viewport.height * 0.6);
    expect(l.drag!.box.y).toBeGreaterThanOrEqual(-0.5);
    expect(l.drag!.box.y + l.drag!.box.height).toBeLessThanOrEqual(l.viewport.height + 0.5);
    const t = l.targets[0]!;
    await dragTo(h, center(l0.hand[i]!.box), center(t.box), 8);
    await h.release();
    await waitHandBack(page);
    expect(await getView(page), 'played').not.toEqual(v);
    expect((await getView(page)).players.corp.hand!.length).toBeLessThan(v.players.corp.hand!.length);
  });

  test('every place the card can go lights at once, by card type, for both sides (one-shot cards: the table)', async ({ page }) => {
    test.setTimeout(180_000);
    const seen = new Set<string>();
    const want = ['ice', 'asset', 'agenda', 'upgrade', 'operation', 'program', 'hardware', 'resource', 'event'];
    for (let seed = 1; seed <= 10 && want.some((t) => !seen.has(t)); seed++) {
      await openBoard(page, { seed, decks: 'core' });
      for (const side of ['corp', 'runner'] as const) {
        if (side === 'runner') await toRunnerTurn(page);
        const v: PlayerView = await getView(page);
        const hand = v.players[side].hand!;
        for (let i = 0; i < hand.length; i++) {
          const type = getCard(hand[i]!)!.type;
          if (seen.has(type)) continue;
          const options = v.handOptions[i]!;
          const playable = options.some((o) => o.reject === null);
          if (!playable || options.length === 0) continue;
          seen.add(type);
          const { hold, at, l } = await liftFromStrip(page, i);
          expect(l.drag!.dimmed).toBe(false);
          expect(sorted(l.targets.map(placeOfTarget)), `${hand[i]} (${type})`).toEqual(sorted(options.map(placeOf)));
          for (const t of l.targets) {
            const o = options.find((x) => placeOf(x) === placeOfTarget(t))!;
            expect(t.lit, `${placeOfTarget(t)} lit as the engine says`).toBe(o.reject === null);
          }
          if (options.length === 1 && placeOf(options[0]!) === 'play') {
            // A one-shot card: the table above the hand is its place.
            const zone = l.targets[0]!.box;
            expect(zone.width).toBeGreaterThanOrEqual(l.handArea.width * 0.9);
            expect(zone.height).toBeGreaterThan(l.handArea.height * 2);
            expect(zone.y + zone.height).toBeLessThanOrEqual(l.handArea.y + 0.5);
          }
          await test.info().attach(`held-${type}`, { body: await page.screenshot(), contentType: 'image/png' });
          await dragTo(hold, at, offPlaces(l), 3);
          await hold.release();
          await waitHandBack(page);
        }
      }
    }
    expect(sorted([...seen])).toEqual(sorted(want));
  });

  test('over a lit place it is highlighted strongly; off it, plain lit again', async ({ page }) => {
    await openBoard(page, 6);
    const { hold, at, l } = await liftFromStrip(page, 0);
    const rd = l.targets.find((t) => t.kind === 'server' && t.server === 'rd')!;
    const off = offPlaces(l);
    await dragTo(hold, at, off, 3);
    await page.waitForFunction(() => window.__overclock!.layout().targets.every((t) => !t.hover));
    await dragTo(hold, off, center(rd.box), 5);
    await page.waitForFunction(() => window.__overclock!.layout().targets.some((t) => t.hover && t.server === 'rd'));
    let now = await layout(page);
    expect(now.targets.filter((t) => t.hover).map(placeOfTarget)).toEqual(['server:rd']);
    expect(now.drag!.hover).toEqual({ kind: 'server', server: 'rd', lit: true });
    // S-15-6 arrow (U9): switched off at 891x296; if ever on, it never crosses another lit place.
    if (now.drag!.arrow) {
      const a = now.drag!.arrow;
      for (const t of now.targets) if (!t.hover) expect(t.box.x > Math.max(a.x1, a.x2) || t.box.x + t.box.width < Math.min(a.x1, a.x2) || t.box.y > Math.max(a.y1, a.y2) || t.box.y + t.box.height < Math.min(a.y1, a.y2)).toBe(true);
    }
    await test.info().attach('hover', { body: await page.screenshot(), contentType: 'image/png' });
    await dragTo(hold, center(rd.box), off, 4);
    await page.waitForFunction(() => window.__overclock!.layout().targets.every((t) => !t.hover));
    now = await layout(page);
    expect(now.drag!.hover).toBeNull();
    await hold.release();
    await waitHandBack(page);
  });

  test('let go on a lit place: played there at its price, and the hand comes back up', async ({ page }) => {
    await openBoard(page, 6);
    const before = await getView(page);
    const { hold, at, l } = await liftFromStrip(page, 0);
    const rd = l.targets.find((t) => t.kind === 'server' && t.server === 'rd')!;
    await dragTo(hold, at, center(rd.box), 5);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await hold.release();
    await waitHandBack(page);
    const v = await getView(page);
    expect(v.players.corp.handCount).toBe(before.players.corp.handCount - 1);
    expect(v.players.corp.clicks).toBe(before.players.corp.clicks - 1);
    expect(v.players.corp.credits).toBe(before.players.corp.credits);
    expect(v.corpServers.find((s) => s.id === 'rd')!.ice.map((c) => c.cardId)).toEqual([before.players.corp.hand![0]]);
    const recs = await anims(page);
    expect(recs.some((a) => a.kind === 'install_flight')).toBe(true);
    // AC 6 (changed after owner review 2026-11-21): the hand rises after a short pause (0.2 s) once the card flies.
    expect(recs.find((a) => a.kind === 'hand_restore')!.scheduledMs).toBeGreaterThanOrEqual(150);
    expect(recs.find((a) => a.kind === 'hand_restore')!.scheduledMs).toBeLessThanOrEqual(400);
    for (const r of recs) if (r.kind !== 'hint' && r.kind !== 'notice') expect(r.scheduledMs, r.kind).toBeLessThanOrEqual(600);
    const after = await layout(page);
    expect(after.targets).toEqual([]);
    expect(after.selected).toBeNull();
  });

  test('a one-shot card dropped on the table is played (the middle of the table is its place)', async ({ page }) => {
    // Seed 6: Hedge Fund is in the Corp's hand.
    await openBoard(page, 6);
    const before = await getView(page);
    const l = await pickCard(page, 'Hedge Fund');
    const zone = l.targets.find((t) => t.kind === 'play')!;
    await tap(page, zone.box);
    await waitIdle(page);
    const v = await getView(page);
    expect(v.players.corp.credits).toBe(before.players.corp.credits + 4);
    expect(v.players.corp.handCount).toBe(before.players.corp.handCount - 1);
  });

  test('let go anywhere that is not lit: nothing is played or paid, it glides back and the hand comes up', async ({ page }) => {
    await openBoard(page, 6);
    const before = await getView(page);
    const { hold, at, l } = await liftFromStrip(page, 0);
    await dragTo(hold, at, offPlaces(l), 4);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await hold.release();
    await waitHandBack(page);
    expect(await getView(page)).toEqual(before);
    const recs = await anims(page);
    // AC 7 (changed after owner review 2026-11-21): the glide (0.18 s) comes first, the hand after it.
    expect(recs.find((a) => a.kind === 'hand_return')!.scheduledMs).toBeLessThanOrEqual(200);
    expect(recs.find((a) => a.kind === 'hand_restore')!.scheduledMs).toBeGreaterThanOrEqual(recs.find((a) => a.kind === 'card_return')!.scheduledMs);
    const after = await layout(page);
    expect(after.targets).toEqual([]);
    expect(after.handView).toBeNull();
  });

  test('a quick tap on the big card never plays: it stays big, nothing lights, and "Hold to play" shows', async ({ page }) => {
    await openBoard(page, 6);
    const before = await getView(page);
    const open = await openHand(page, 0);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, open.handView!.centre);
    await page.waitForFunction(() => window.__overclock!.layout().handView?.tip !== null && window.__overclock!.layout().handView !== null);
    const l = await layout(page);
    expect(l.handView).toMatchObject({ index: 0, lifted: false });
    expect(l.handView!.tip!.text).toBe('Hold to play');
    expect(l.drag).toBeNull();
    expect(l.targets).toEqual([]);
    expect(l.selected).toBeNull();
    expect((await anims(page)).some((a) => a.kind === 'hold_tip')).toBe(true);
    await test.info().attach('hold-tip', { body: await page.screenshot(), contentType: 'image/png' });
    // A slow tap (made 200 ms ago, handled now: the page was busy) is still a tap, by its own times.
    await sendTap(page, open.handView!.centre, { madeAt: Date.now() - 200 });
    await page.waitForTimeout(150);
    expect((await layout(page)).drag).toBeNull();
    expect(await getView(page)).toEqual(before);
    // The closed hand strip: a tap opens the view to read (as before).
    await page.evaluate(() => window.__overclock!.back());
    await page.waitForFunction(() => window.__overclock!.layout().handView === null);
    const s = await layout(page);
    await tap(page, s.hand[1]!.box);
    await page.waitForFunction(() => window.__overclock!.layout().handView?.index === 1);
    expect(await getView(page)).toEqual(before);
  });

  test('a card that cannot be played now still lifts, dimmed, nothing lit; letting go sends it back and says why', async ({ page }) => {
    await openBoard(page, 6);
    // No clicks left.
    for (let k = 0; k < 3; k++) await dispatch(page, { type: 'gain_credit', player: 'corp' });
    await waitIdle(page);
    const before = await getView(page);
    const { hold, at, l } = await liftFromStrip(page, 0);
    expect(l.drag).toMatchObject({ index: 0, dimmed: true, reason: 'No clicks left' });
    expect(l.targets).toEqual([]);
    expect(l.selected).toBeNull();
    // AC 9 (changed after owner review 2026-11-21): no reason while it is held; it shows on letting go.
    expect((await anims(page)).find((a) => a.kind === 'hint'), 'nothing said while held').toBeUndefined();
    await dragTo(hold, at, { x: at.x, y: at.y - 60 }, 3);
    await hold.release();
    await waitHandBack(page);
    expect((await anims(page)).find((a) => a.kind === 'hint')?.text, 'says why on letting go').toBe('No clicks left');
    expect(await getView(page)).toEqual(before);
    expect((await anims(page)).filter((a) => a.kind === 'hint').every((a) => a.text === 'No clicks left')).toBe(true);
  });

  test('not enough credits: dimmed, nothing lit, the reason says so', async ({ page }) => {
    // Seed 2: the Runner installs Gordian Blade (4 of 5 credits); the 2-credit cards are then too dear.
    await openBoard(page, 2);
    await toRunnerTurn(page);
    let v = await getView(page);
    await dispatch(page, { type: 'install', player: 'runner', handIndex: v.players.runner.hand!.indexOf('r05') });
    await waitIdle(page);
    v = await getView(page);
    const i = v.handOptions.findIndex((os) => os.length > 0 && os.every((o) => o.reject === 'no_credits'));
    expect(i).toBeGreaterThanOrEqual(0);
    const { hold, l } = await liftFromStrip(page, i);
    expect(l.drag).toMatchObject({ index: i, dimmed: true, reason: 'Not enough credits' });
    expect(l.targets).toEqual([]);
    await hold.release();
    await waitHandBack(page);
    expect(await getView(page)).toEqual(v);
  });
});
