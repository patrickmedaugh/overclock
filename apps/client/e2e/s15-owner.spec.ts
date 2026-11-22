// S-15-6, owner's round-2 review (PR #34, 2026-11-21): real-input checks for what he saw.
// These drive the page the way a person does: plain page.mouse / page.touchscreen, or CDP touch and
// mouse events WITHOUT made-up timestamps (the browser stamps them when they arrive), with the
// pauses a person makes. The older helpers jump the finger 0.3 card heights straight up in one go,
// or stamp a whole gesture in advance; that hid these bugs.
//  - step 2: a single tap / click on the big card must not lift or light anything (and a slow
//    click held still must never play the card on the place under the big card);
//  - step 5/6: after a drop or a put-back the card moves first, the hand comes up a moment later;
//    a tap meanwhile still works and finishes the movement;
//  - step 7: dragging up out of the small hand works, also when the thumb starts at a slant;
//  - step 3/4: the held card is big and never covers the place under the finger, which glows brightly;
//  - step 8/9: holding a card that can't be played shows no reason; letting go shows it.
// Owner round 3 (2026-11-22): "anything longer than a quick tap should grab the card", "the card should
// still be bigger", "directly dragging a card from a minimized hand did not work": a finger's small,
// paced steps (4 px, a frame apart) from the small hand to a lit place, in one motion, with the hand
// view closed and open (it shows the small hand under it: a press there was taken as a browse).
import { type CDPSession, type Page, expect, test } from '@playwright/test';
import { type Box, type LayoutSnapshot, anims, center, dispatch, getView, layout, openBoard, toRunnerTurn, waitHandBack, waitIdle } from './helpers';
import { pixelStats } from './pixels';

const SHOTS = process.env.S15_OWNER_SHOTS ?? '';
const touch = () => test.info().project.use.hasTouch === true;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${test.info().project.name}.png` });
};

/** A finger (touch screen) or the mouse, driven by real input events the browser stamps itself. */
interface Pointer {
  down(x: number, y: number): Promise<void>;
  move(x: number, y: number): Promise<void>;
  up(): Promise<void>;
  /**
   * Sends these moves one after another with no pause (a quick drag). Each is its own event: all at
   * once, the browser would merge them into one move per frame and the page would never see the
   * start of the gesture.
   */
  burst(points: { x: number; y: number }[]): Promise<void>;
}

async function pointer(page: Page): Promise<Pointer> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  if (touch()) {
    const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [p] : [] }).then(() => undefined);
    return {
      down: (x, y) => send('touchStart', { x, y }),
      move: (x, y) => send('touchMove', { x, y }),
      up: () => send('touchEnd'),
      burst: async (ps) => {
        for (const p of ps) await send('touchMove', p);
      },
    };
  }
  const send = (type: 'mouseMoved', p: { x: number; y: number }, buttons: number) =>
    cdp.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons, clickCount: 1 }).then(() => undefined);
  return {
    down: async (x, y) => {
      await page.mouse.move(x, y);
      await page.mouse.down();
    },
    move: async (x, y) => {
      await page.mouse.move(x, y);
    },
    up: () => page.mouse.up(),
    burst: async (ps) => {
      for (const p of ps) await send('mouseMoved', p, 1);
    },
  };
}

/**
 * Records, every frame, whether a card is held or places are lit, the lowest hand card's top (the
 * strip's, not the held or gliding card's), and the
 * page's pointer down / up event times (performance.now() clock).
 */
async function watch(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __w: { frames: { t: number; held: boolean; lit: number; handTop: number; minimized: boolean }[]; downs: number[]; ups: number[]; moves: number[] }; __wOn?: boolean };
    w.__w = { frames: [], downs: [], ups: [], moves: [] };
    if (w.__wOn) return;
    w.__wOn = true;
    window.addEventListener('pointerdown', (e) => w.__w.downs.push(e.timeStamp), { capture: true });
    window.addEventListener('pointerup', (e) => w.__w.ups.push(e.timeStamp), { capture: true });
    window.addEventListener('pointermove', (e) => w.__w.moves.push(e.timeStamp), { capture: true });
    const loop = (t: number) => {
      const l = window.__overclock!.layout();
      w.__w.frames.push({ t, held: l.drag !== null, lit: l.targets.length, handTop: Math.max(...l.hand.map((h) => h.box.y)), minimized: l.handMinimized });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}
type Watched = { frames: { t: number; held: boolean; lit: number; handTop: number; minimized: boolean }[]; downs: number[]; ups: number[]; moves: number[] };
const watched = (page: Page) => page.evaluate(() => (window as unknown as { __w: Watched }).__w);

/** Opens the hand view on card `i` with a real tap on the small hand, once the deal has landed. */
async function openView(page: Page, i: number): Promise<LayoutSnapshot> {
  await waitIdle(page);
  const l = await layout(page);
  const c = center(l.hand[i]!.box);
  if (touch()) await page.touchscreen.tap(c.x, c.y);
  else await page.mouse.click(c.x, c.y, { delay: 90 });
  await page.waitForFunction((k) => window.__overclock!.layout().handView?.index === k, i);
  await waitIdle(page);
  return layout(page);
}

/**
 * 12 px steps straight up until the finger is well above the small hand (a slowed-down page may
 * open the reading hold before it sees the moves; leaving the strip then lifts that card too).
 */
function upOutOf(box: Box, s: { x: number; y: number }): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let y = s.y - 12; y > box.y - box.height * 0.3; y -= 12) pts.push({ x: s.x, y });
  pts.push({ x: s.x, y: Math.max(4, box.y - box.height * 0.3) });
  return pts;
}

const inside = (b: Box, p: { x: number; y: number }) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;

test.describe('S-15-6 owner review (real input)', () => {
  test('step 2: a quick tap or click on the big card never lifts it or lights a place, not even for a frame', async ({ page }) => {
    await openBoard(page, 6);
    const before = await getView(page);
    const i = before.handOptions.findIndex((os) => os.some((o) => o.reject === null && o.action.type === 'install'));
    let checked = 0;
    const open = await openView(page, i);
    const c = center(open.handView!.centre);
    for (let attempt = 0; attempt < 4 && checked < 2; attempt++) {
      await waitIdle(page);
      await watch(page);
      if (touch()) await page.touchscreen.tap(c.x, c.y);
      else await page.mouse.click(c.x, c.y, { delay: 60 });
      await page.waitForTimeout(500);
      const w = await watched(page);
      const held = w.ups.at(-1)! - w.downs.at(-1)!;
      test.info().annotations.push({ type: 'tap', description: `down→up ${Math.round(held)} ms (event times)` });
      // A busy test runner can stretch a tap past 0.12 s by the browser's own clock: then it was a
      // hold, and that try does not count (it must still never play: checked below).
      expect(await getView(page), 'nothing played or paid').toEqual(before);
      await waitHandBack(page);
      if (held < 110) {
        checked++;
        expect(w.frames.filter((f) => f.held || f.lit > 0).length, 'no frame shows a lifted card or a lit place').toBe(0);
        const l = await layout(page);
        expect(l.drag).toBeNull();
        expect(l.handView?.index, 'the big card stays').toBe(i);
        expect(l.handView?.tip?.text).toBe('Hold to play');
      }
      // Let the tip fade before the next try.
      await page.waitForFunction(() => window.__overclock!.layout().handView?.tip === null);
    }
    expect(checked, 'at least two taps were quick enough to judge').toBeGreaterThanOrEqual(2);
  });

  test('step 2: a slow click held still on the big card (it lifts) and let go in place never plays it: it goes back', async ({ page }) => {
    await openBoard(page, 6);
    const before = await getView(page);
    const i = before.handOptions.findIndex((os) => os.some((o) => o.reject === null && o.action.type === 'install'));
    const open = await openView(page, i);
    const c = center(open.handView!.centre);
    const p = await pointer(page);
    await p.down(c.x, c.y);
    await page.waitForFunction(() => window.__overclock!.layout().drag !== null);
    await page.waitForTimeout(150);
    await p.up();
    await waitHandBack(page);
    await page.waitForTimeout(300);
    expect(await getView(page), 'nothing played or paid').toEqual(before);
    const l = await layout(page);
    expect(l.handView?.index, 'the hand view is back on that card').toBe(i);
    expect(l.handView?.tip?.text).toBe('Drag it to a lit place');
    expect((await anims(page)).some((a) => a.kind === 'install_flight' || a.kind === 'play_flight')).toBe(false);
  });

  for (const how of ['slanted', 'flat, then up'] as const) {
    test(`step 7: a quick drag up out of the small hand (${how} start) picks the card up, without the hand view`, async ({ page }) => {
      await openBoard(page, 6);
      const l0 = await waitIdle(page);
      const box = l0.hand[2]!.box;
      const s = center(box);
      // A thumb's "straight up": the first 12 px go up at a slant (~56° from vertical) or almost
      // flat, then it rises out of the strip. Sent back to back, as fast as a quick finger.
      const path =
        how === 'slanted'
          ? [{ dx: 5, dy: -3 }, { dx: 11, dy: -7 }, { dx: 15, dy: -16 }, { dx: 18, dy: -30 }, { dx: 20, dy: -46 }, { dx: 21, dy: -62 }]
          : [{ dx: 6, dy: -1 }, { dx: 14, dy: -2 }, { dx: 18, dy: -10 }, { dx: 20, dy: -30 }, { dx: 21, dy: -50 }, { dx: 21, dy: -70 }];
      const pts = path.map((d) => ({ x: s.x + d.dx, y: Math.max(4, s.y + d.dy) }));
      const p = await pointer(page);
      await watch(page);
      await page.evaluate(() => window.__overclock!.clearAnims());
      await p.down(s.x, s.y);
      await p.burst(pts);
      await page.waitForFunction(() => window.__overclock!.layout().drag !== null, undefined, { timeout: 2000 });
      const l = await layout(page);
      expect(l.drag).toMatchObject({ index: 2, from: 'strip' });
      expect(l.targets.length, 'its places are lit').toBeGreaterThan(0);
      // The hold-to-read (0.35 s) opens the view only if the busy test runner handed the moves over
      // that late (by the browser's own event times); a quick drag never opens it.
      const w = await watched(page);
      const down = w.downs.at(-1)!;
      const exit = w.moves.filter((m) => m > down)[1] ?? Infinity;
      const late = exit - down >= 300;
      test.info().annotations.push({ type: 'moves', description: `second move ${Math.round(exit - down)} ms after the down` });
      if (!late) expect((await anims(page)).some((a) => a.kind === 'hand_open'), 'the hand view did not open').toBe(false);
      await p.up();
      await waitHandBack(page);
    });
  }

  test('steps 3/4: the held card is big, never over the place under the finger; that place glows brightly', async ({ page }) => {
    await openBoard(page, 6);
    const v = await getView(page);
    const i = v.handOptions.findIndex((os) => os.some((o) => o.reject === null && o.action.type === 'install'));
    const open = await openView(page, i);
    const c = center(open.handView!.centre);
    const p = await pointer(page);
    await p.down(c.x, c.y);
    await page.waitForFunction(() => window.__overclock!.layout().drag !== null);
    let l = await layout(page);
    const hq = l.targets.find((t) => t.kind === 'server' && t.server === 'hq') ?? l.targets[0]!;
    // The finger in the lower part of the place (the card sits above the finger).
    const f = { x: hq.box.x + hq.box.width / 2, y: hq.box.y + hq.box.height * 0.8 };
    // Before the finger gets there: the place is only plainly lit.
    const ring = (t: Box): Box => ({ x: t.x + t.width + 2, y: f.y - 6, width: 5, height: 12 });
    const away = { x: l.viewport.width * 0.55, y: l.viewport.height * 0.15 };
    for (let k = 1; k <= 6; k++) await p.move(c.x + ((away.x - c.x) * k) / 6, c.y + ((away.y - c.y) * k) / 6);
    await page.waitForTimeout(250);
    const [plain] = await pixelStats(page, [ring(hq.box)]);
    for (let k = 1; k <= 8; k++) await p.move(away.x + ((f.x - away.x) * k) / 8, away.y + ((f.y - away.y) * k) / 8);
    await page.waitForFunction(() => window.__overclock!.layout().drag?.hover !== null);
    await page.waitForTimeout(250);
    l = await layout(page);
    await shot(page, 's15-6-owner-hover');
    const [strong] = await pixelStats(page, [ring(hq.box)]);
    const d = l.drag!;
    test.info().annotations.push({ type: 'held', description: JSON.stringify({ box: d.box, viewport: l.viewport, zoom: open.handView!.centre, plain, strong }) });
    // Big: at least 1.9x a hand card and close to the big card (capped at 42% of the screen height).
    expect(d.box.height).toBeGreaterThanOrEqual(Math.min(open.handView!.centre.height * 0.7, l.viewport.height * 0.4) - 1);
    // Never over the finger: the place it lands on stays in view.
    expect(inside(d.box, f), 'the held card does not cover the finger point').toBe(false);
    expect(l.targets.find((t) => t.hover)?.kind).toBe(hq.kind);
    // The strong glow is bright right outside the place's edge (not just a size change).
    expect(strong!.mean - plain!.mean, 'the hovered place glows brightly outside its edge').toBeGreaterThan(40);
    await p.up();
  });

  for (const side of ['corp', 'runner'] as const) {
    test(`steps 5/6 (${side}): after a drop the card flies first, the hand comes up a moment later; after a put-back it glides home first`, async ({ page }) => {
      await openBoard(page, side === 'corp' ? 6 : 3);
      if (side === 'runner') await toRunnerTurn(page);
      const v = await getView(page);
      const kind = side === 'corp' ? 'install' : 'play';
      const i = v.handOptions.findIndex((os) => os.some((o) => o.reject === null && o.action.type === kind));
      expect(i).toBeGreaterThanOrEqual(0);
      // Put-back first: hold, drag over nothing, let go.
      let open = await openView(page, i);
      let c = center(open.handView!.centre);
      let p = await pointer(page);
      await p.down(c.x, c.y);
      await page.waitForFunction(() => window.__overclock!.layout().drag !== null);
      // Over the rail's help text: never a place (the Runner's event lights the whole table).
      const spot = { x: open.viewport.width - 4, y: Math.round(open.viewport.height * 0.35) };
      for (let k = 1; k <= 6; k++) await p.move(c.x + ((spot.x - c.x) * k) / 6, c.y + ((spot.y - c.y) * k) / 6);
      await page.waitForTimeout(100);
      await watch(page);
      await page.evaluate(() => window.__overclock!.clearAnims());
      await p.up();
      await waitHandBack(page);
      await page.waitForFunction(() => window.__overclock!.layout().handView !== null && !window.__overclock!.layout().animating);
      let w = await watched(page);
      let up = w.ups.at(-1)!;
      let recs = await anims(page);
      const ret = recs.find((a) => a.kind === 'card_return')!;
      const restore = recs.find((a) => a.kind === 'hand_restore')!;
      expect(ret, 'it glides home').toBeTruthy();
      expect(restore.scheduledMs, 'the hand waits, then rises (in ≤ 0.6 s)').toBeGreaterThanOrEqual(ret.scheduledMs);
      expect(restore.scheduledMs).toBeLessThanOrEqual(600);
      let firstUp = w.frames.find((f) => f.t > up && f.handTop < open.viewport.height - 1);
      test.info().annotations.push({ type: 'put-back', description: `hand first visible ${firstUp ? Math.round(firstUp.t - up) : 'never'} ms after the release` });
      expect(firstUp, 'the hand came back').toBeTruthy();
      expect(firstUp!.t - up, 'the hand rises only after the glide').toBeGreaterThanOrEqual(150);

      // Then a drop on a lit place.
      open = await openView(page, i);
      c = center(open.handView!.centre);
      p = await pointer(page);
      await p.down(c.x, c.y);
      await page.waitForFunction(() => window.__overclock!.layout().drag !== null);
      const l = await layout(page);
      const t = l.targets.find((x) => x.lit)!;
      const to = center(t.box);
      for (let k = 1; k <= 8; k++) await p.move(c.x + ((to.x - c.x) * k) / 8, c.y + ((to.y - c.y) * k) / 8);
      await page.waitForFunction(() => window.__overclock!.layout().drag?.hover !== null);
      await watch(page);
      await page.evaluate(() => window.__overclock!.clearAnims());
      await p.up();
      await page.waitForFunction(() => window.__overclock!.layout().drag === null);
      await page.waitForTimeout(150);
      await shot(page, `s15-6-owner-after-drop-${side}`);
      await waitHandBack(page);
      await waitIdle(page);
      w = await watched(page);
      up = w.ups.at(-1)!;
      recs = await anims(page);
      expect(recs.some((a) => a.kind === 'install_flight' || a.kind === 'play_flight'), 'it was played and flew').toBe(true);
      firstUp = w.frames.find((f) => f.t > up && f.handTop < l.viewport.height - 1);
      test.info().annotations.push({ type: 'drop', description: `hand first visible ${firstUp ? Math.round(firstUp.t - up) : 'never'} ms after the release` });
      expect(firstUp, 'the hand comes back after a play').toBeTruthy();
      expect(firstUp!.t - up, 'the hand rises only after the card has started its flight').toBeGreaterThanOrEqual(150);
      const after = await layout(page);
      expect(after.handMinimized).toBe(false);
      expect(after.hand.every((h) => h.box.y + h.box.height <= after.viewport.height + 0.5), 'the whole hand is back on screen').toBe(true);
    });
  }

  test('step 6: a tap while the hand is still coming back works at once (and finishes the movement)', async ({ page }) => {
    await openBoard(page, 6);
    const l0 = await waitIdle(page);
    const box = l0.hand[1]!.box;
    const s = center(box);
    const p = await pointer(page);
    await p.down(s.x, s.y);
    await p.burst(upOutOf(box, s));
    await page.waitForFunction(() => window.__overclock!.layout().drag !== null);
    const vh = l0.viewport.height;
    await p.move(s.x, Math.round(vh * 0.08));
    await p.up();
    // Straight away (the hand is still down): tap where card 3 will be.
    const c3 = center(l0.hand[3]!.box);
    if (touch()) await page.touchscreen.tap(c3.x, c3.y);
    else await page.mouse.click(c3.x, c3.y);
    await page.waitForFunction(() => window.__overclock!.layout().handView?.index === 3, undefined, { timeout: 2000 });
    const l = await layout(page);
    expect(l.handMinimized).toBe(false);
  });

  test('steps 8/9: holding a card that cannot be played shows no reason; letting go shows it', async ({ page }) => {
    await openBoard(page, 6);
    for (let k = 0; k < 3; k++) await dispatch(page, { type: 'gain_credit', player: 'corp' });
    const l0 = await waitIdle(page);
    const before = await getView(page);
    const s = center(l0.hand[0]!.box);
    const p = await pointer(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await p.down(s.x, s.y);
    await p.burst(upOutOf(l0.hand[0]!.box, s));
    await page.waitForFunction(() => window.__overclock!.layout().drag !== null);
    await page.waitForTimeout(400);
    const held = await layout(page);
    expect(held.drag).toMatchObject({ dimmed: true });
    expect(held.targets).toEqual([]);
    expect((await anims(page)).filter((a) => a.kind === 'hint'), 'no reason while held').toEqual([]);
    expect(held.hint).toBeNull();
    expect(held.text.help).not.toContain('No clicks left');
    await shot(page, 's15-6-owner-dimmed-held');
    await p.up();
    await page.waitForFunction(() => window.__overclock!.layout().hint !== null);
    const recs = await anims(page);
    const ret = recs.find((a) => a.kind === 'card_return')!;
    const hint = recs.find((a) => a.kind === 'hint')!;
    expect(hint.text).toBe('No clicks left');
    expect(hint.startedAt - ret.startedAt, 'the reason shows as it is let go').toBeLessThan(100);
    await waitHandBack(page);
    expect(await getView(page)).toEqual(before);
  });

  /** A finger's path: small steps (4 px at the start, then up to 20), one frame apart, from `a` to `b`. */
  async function glide(page: Page, p: Pointer, a: { x: number; y: number }, b: { x: number; y: number }): Promise<void> {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    // The first 12 px in 4 px steps (the start of the gesture is what is judged), then even steps.
    for (const r of [4, 8, 12]) {
      if (r >= d) break;
      await p.move(a.x + ((b.x - a.x) * r) / d, a.y + ((b.y - a.y) * r) / d);
      await page.waitForTimeout(16);
    }
    const n = Math.max(3, Math.min(16, Math.ceil(d / 20)));
    for (let k = 1; k <= n; k++) {
      await p.move(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
      await page.waitForTimeout(16);
    }
  }

  for (const how of ['hand view closed', 'hand view open'] as const) {
    test(`round 3: a card dragged from the small hand (${how}) to a lit place in one motion is played`, async ({ page }) => {
      await openBoard(page, 6);
      await waitIdle(page);
      const before = await getView(page);
      const i = before.handOptions.findIndex((os) => os.some((o) => o.reject === null && o.action.type === 'install'));
      // With the view open, it shows another card big; the small hand stays at the bottom.
      if (how === 'hand view open') await openView(page, (i + 2) % before.handOptions.length);
      const l0 = await waitIdle(page);
      expect(l0.hand[i]!.box.y + l0.hand[i]!.box.height, 'the small hand is on screen').toBeLessThanOrEqual(l0.viewport.height + 0.5);
      const s = center(l0.hand[i]!.box);
      const p = await pointer(page);
      await page.evaluate(() => window.__overclock!.clearAnims());
      await p.down(s.x, s.y);
      // Up and to the right, the way a thumb drags a card onto the table.
      const mid = { x: l0.viewport.width * 0.45, y: l0.viewport.height * 0.4 };
      await glide(page, p, s, mid);
      await page.waitForFunction(() => window.__overclock!.layout().drag !== null, undefined, { timeout: 2000 });
      const held = await layout(page);
      expect(held.drag).toMatchObject({ index: i, dimmed: false });
      expect(held.targets.length, 'its places are lit').toBeGreaterThan(0);
      const t = held.targets.find((x) => x.kind === 'new_server') ?? held.targets[0]!;
      await glide(page, p, mid, center(t.box));
      await page.waitForFunction(() => window.__overclock!.layout().drag?.hover !== null);
      await p.up();
      await waitHandBack(page);
      const after = await getView(page);
      expect(after.players.corp.hand!.length, 'the card left the hand: played').toBe(before.players.corp.hand!.length - 1);
    });
  }

  test('round 3: a still press on the small hand picks the card up at 0.12 s (no hand view); in the same motion it is played', async ({ page }) => {
    await openBoard(page, 6);
    const l0 = await waitIdle(page);
    const before = await getView(page);
    const i = before.handOptions.findIndex((os) => os.some((o) => o.reject === null && o.action.type === 'install'));
    const s = center(l0.hand[i]!.box);
    const p = await pointer(page);
    await watch(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await p.down(s.x, s.y);
    await page.waitForFunction(() => window.__overclock!.layout().drag !== null, undefined, { timeout: 1000 });
    const w = await watched(page);
    const down = w.downs.at(-1)!;
    const first = w.frames.find((f) => f.held)!;
    test.info().annotations.push({ type: 'lift', description: `first held frame ${Math.round(first.t - down)} ms after the down` });
    expect(first.t - down, 'not before 0.12 s').toBeGreaterThanOrEqual(115);
    const recs = await anims(page);
    expect(recs.some((a) => a.kind === 'hand_open'), 'no hand view: the card itself is held').toBe(false);
    const held = await layout(page);
    // Round 3: bigger (0.63 of the screen's height; was 0.42), wholly on screen.
    expect(held.drag!.box.height).toBeGreaterThanOrEqual(held.viewport.height * 0.62);
    expect(held.drag!.box.y).toBeGreaterThanOrEqual(-0.5);
    expect(held.drag!.box.y + held.drag!.box.height).toBeLessThanOrEqual(held.viewport.height + 0.5);
    expect(held.drag!.box.x).toBeGreaterThanOrEqual(-0.5);
    expect(held.drag!.box.x + held.drag!.box.width).toBeLessThanOrEqual(held.viewport.width + 0.5);
    await shot(page, 's15-6-round3-held-from-strip');
    const t = held.targets.find((x) => x.kind === 'new_server') ?? held.targets[0]!;
    await glide(page, p, s, center(t.box));
    await p.up();
    await waitHandBack(page);
    expect((await getView(page)).players.corp.hand!.length, 'played').toBe(before.players.corp.hand!.length - 1);
  });

  test('round 3: a quick tap on the small hand never lifts the card: it opens the hand view', async ({ page }) => {
    await openBoard(page, 6);
    const l0 = await waitIdle(page);
    const c = center(l0.hand[1]!.box);
    let checked = 0;
    for (let attempt = 0; attempt < 4 && checked < 2; attempt++) {
      await watch(page);
      if (touch()) await page.touchscreen.tap(c.x, c.y);
      else {
        // A quick click: down and up sent together (the browser stamps each as it arrives; a busy
        // desktop runner would otherwise stretch page.mouse.click past 0.12 s).
        const cdp = await page.context().newCDPSession(page);
        const ev = (type: 'mousePressed' | 'mouseReleased') => cdp.send('Input.dispatchMouseEvent', { type, x: c.x, y: c.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
        await page.mouse.move(c.x, c.y);
        await Promise.all([ev('mousePressed'), ev('mouseReleased')]);
        await cdp.detach();
      }
      await page.waitForFunction(() => window.__overclock!.layout().handView?.index === 1);
      await page.waitForTimeout(300);
      const w = await watched(page);
      const held = w.ups.at(-1)! - w.downs.at(-1)!;
      test.info().annotations.push({ type: 'tap', description: `down→up ${Math.round(held)} ms (event times)` });
      if (held < 110) {
        checked++;
        expect(w.frames.filter((f) => f.held || f.lit > 0).length, 'no frame shows a lifted card or a lit place').toBe(0);
      }
      expect(await page.evaluate(() => window.__overclock!.back())).toBe('close_zoom');
      await waitIdle(page);
    }
    expect(checked, 'at least two taps were quick enough to judge').toBeGreaterThanOrEqual(2);
  });
});
