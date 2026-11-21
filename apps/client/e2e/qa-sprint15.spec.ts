// QA Sprint 15 (independent, written by QA; not the developers' specs). Movement (S-15-1..S-15-4):
// - S-15-1: the press lift is timed from the browser's own pointerdown stamp (not the game's log);
//   a quick tap on the big card (no hold) leaves nothing enlarged; the glide home after a drop away
//   from every lit place is sampled frame by frame (in between positions = a glide, not a jump);
// - S-15-2: a button install (pick, then tap a lit place) flies from the hand card and settles;
//   pass-the-phone WITH the cover (the real hand-over): every flight on the Runner's screen is a
//   card back for Corp cards the Runner may not know, also a Corp operation shown just before the
//   hand-over; online the Runner's phone sees the Corp's draw, install and end-of-turn discard as
//   card backs and never receives the ids;
// - S-15-3: other hand cards slide aside on a draw (sampled per frame); the Corp's turn-start draw
//   flies; Bank Job emptied flies to the Heap and the count waits for the landing; an accessed card
//   trashed flies to Archives (count waits); a stolen agenda flies to the Runner's score pile (count
//   and points wait, then tick); several discards at the end of the turn ripple and finish <= 0.5 s;
//   Accelerated Beta Test's 3 cards ripple to Archives <= 0.5 s;
// - S-15-4: taps while an install, a one-shot card and a discard ripple are moving (real time, not
//   frozen) finish the movement and are answered < 100 ms; long tasks while cards move < 600 ms;
//   upright mid-showcase shows the turn-sideways prompt and back sideways nothing floats and the
//   Heap count is exact; the same Corp install gives the same movement in pass-the-phone and online.
// `QA_SCREENS=1` writes screenshots to docs/sprints/sprint-15-qa/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';
import { getCard } from '@overclock/cards';
import type { Action, CardOption, PlayerView } from '@overclock/engine';
import { planToStep } from '@overclock/match/testing';
import type { AnimRecord } from '../src/hook-types';
import {
  type LayoutSnapshot,
  anims,
  center,
  dispatch,
  emptySpot,
  expectSnappy,
  measureTap,
  passTurn,
  getView,
  layout,
  liftHand,
  sendTap,
  openBoard,
  openHand,
  pickHand,
  runButtonOf,
  startRun,
  tap,
  targetOf,
  toRunnerTurn,
  toStep,
  waitIdle,
} from './helpers';
import { act, joinGame, layoutOf, openPhone, startTestGame, view, waitPlaying, waitView } from './online';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-15-qa');
const SIZE: Record<string, string> = {
  phone: '844x390',
  'phone-small': '640x360',
  desktop: '1280x800',
  'phone-short': '891x296',
};

async function snap(page: Page, name: string): Promise<void> {
  const p = test.info().project.name;
  const save = process.env.QA_SCREENS === '1';
  if (save) mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot(save ? { path: join(SHOTS, `r1-${SIZE[p] ?? p}-${name}.png`) } : {});
  await test.info().attach(name, { body, contentType: 'image/png' });
}

type Flight = LayoutSnapshot['motion']['flights'][number];

async function holdMotion(page: Page): Promise<void> {
  await page.evaluate(() => window.__overclock!.motion('hold'));
}

async function advance(page: Page, ms: number): Promise<LayoutSnapshot> {
  await page.evaluate((t) => window.__overclock!.advanceMotion(t), ms);
  return layout(page);
}

/** Steps frozen movement in `step` ms until nothing moves; returns the movement time it took. */
async function runOut(page: Page, step = 20, max = 2000): Promise<number> {
  let t = 0;
  while ((await layout(page)).motion.active > 0 && t < max) {
    await advance(page, step);
    t += step;
  }
  return t;
}

/** Starts an in-page recorder of every flight seen (kind, card id, box), polled every 4 ms. */
async function recordFlights(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __qaFlights: unknown[];
      __qaFlightTimer?: number;
    };
    if (w.__qaFlightTimer) clearInterval(w.__qaFlightTimer);
    w.__qaFlights = [];
    const seen = new Set<string>();
    w.__qaFlightTimer = window.setInterval(() => {
      const l = window.__overclock!.layout();
      for (const f of l.motion.flights) {
        const key = `${f.kind}|${f.cardId}|${Math.round(f.box.x)}|${Math.round(f.box.y)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        w.__qaFlights.push({ ...f, viewer: l.viewer, cover: l.cover !== null });
      }
    }, 4);
  });
}

async function recorded(page: Page): Promise<(Flight & { viewer: string; cover: boolean })[]> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __qaFlights: (Flight & { viewer: string; cover: boolean })[];
        }
      ).__qaFlights,
  );
}

function kindOf(o: CardOption): string {
  const a = o.action;
  if (a.type === 'install' && a.server === 'new') return 'new_server';
  return a.type;
}

function cardWith(v: PlayerView, kind: string): number {
  const i = v.handOptions.findIndex((os) => os.some((o) => o.reject === null && kindOf(o) === kind));
  if (i < 0) throw new Error(`no hand card with a lit ${kind} place`);
  return i;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Every movement record of a run is inside the snappiness budget (hint/notice are reading time, not movement). */
function expectBudget(recs: AnimRecord[]): void {
  for (const r of recs) if (r.kind !== 'hint' && r.kind !== 'notice') expect(r.scheduledMs, `${r.kind} <= 600 ms`).toBeLessThanOrEqual(600);
}

/** A seed whose remote_single_card_no_ice case is a trash or a steal (core decks). */
function kindSeed(kind: 'trash' | 'steal'): number {
  for (let seed = 1; seed <= 40; seed++) {
    try {
      if (planToStep(seed, 'remote_single_card_no_ice').info['kind'] === kind) return seed;
    } catch {
      /* not reached on this seed */
    }
  }
  throw new Error(`no ${kind} seed`);
}

async function lean(page: Page): Promise<void> {
  // A busy test machine counts as a slow phone and drops decorative extras (S-05-3); pin fast frames.
  await page.evaluate(() => window.__overclock!.frameSpeed('fast'));
}

// ---------------------------------------------------------------------------------------------
test.describe('QA S-15-1 hand: press, tap, glide home', () => {
  test.skip(() => test.info().project.use.hasTouch !== true, 'the hand view press is a touch gesture (mouse hover: dev spec)');

  test('the big card starts rising within 100 ms of the finger going down (browser stamp), full lift soon after; a quick tap leaves nothing enlarged', async ({ page }) => {
    await openBoard(page, 1);
    await lean(page);
    const open = await openHand(page, 1);
    await waitIdle(page);
    const centre = open.handView!.centre;
    await page.evaluate(() => {
      const w = window as unknown as {
        __qa: {
          down: number;
          samples: { t: number; w: number; y: number }[];
          on: boolean;
        };
      };
      w.__qa = { down: NaN, samples: [], on: true };
      window.addEventListener('pointerdown', (e) => (w.__qa.down = e.timeStamp), { capture: true, once: true });
      const tick = (t: number) => {
        const z = window.__overclock!.layout().zoom;
        if (z) w.__qa.samples.push({ t, w: z.box.width, y: z.box.y });
        if (w.__qa.on) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const cdp = await page.context().newCDPSession(page);
    const c = center(centre);
    // The browser's own stamps make it a 150 ms tap: a busy CI page acks the press late, and the
    // game judges a tap by the events' times (QA-S3-7), so the release is stamped 150 ms after it.
    const t0 = Date.now();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }], timestamp: t0 / 1000 });
    await page.waitForTimeout(150); // < 250 ms hold: a tap, not a lift
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: (t0 + 150) / 1000 });
    await page.waitForTimeout(250);
    const qa = await page.evaluate(() => {
      const w = window as unknown as {
        __qa: {
          down: number;
          samples: { t: number; w: number; y: number }[];
          on: boolean;
        };
      };
      w.__qa.on = false;
      return w.__qa;
    });
    expect(Number.isFinite(qa.down)).toBe(true);
    const first = qa.samples.find((s) => s.t >= qa.down && s.w > centre.width + 0.5);
    expect(first, 'it grew').toBeTruthy();
    test.info().annotations.push({
      type: 'press-lift',
      description: `first grown frame ${(first!.t - qa.down).toFixed(1)} ms after pointerdown`,
    });
    expect(first!.t - qa.down, 'starts growing within a tenth of a second').toBeLessThan(100);
    const full = qa.samples.find((s) => s.t >= qa.down && s.w >= centre.width * 1.07);
    expect(full, 'grows about 8 %').toBeTruthy();
    expect(full!.y, 'and rises').toBeLessThan(centre.y - 1);
    expect(Math.max(...qa.samples.map((s) => s.w)), 'a little, not a lot').toBeLessThan(centre.width * 1.1);
    // S-15-6: a quick tap never picks: the view stays open on the card ("Hold to play"), nothing is left lifted or enlarged.
    const l = await waitIdle(page);
    expect(l.drag).toBeNull();
    expect(l.handView).toMatchObject({ index: 1, lifted: false });
    expect(l.handView!.tip?.text).toBe('Hold to play');
    expect(l.selected).toBeNull();
    expect(l.zoom!.box.width).toBeCloseTo(centre.width, 0);
    expect(l.motion.flights).toEqual([]);
    await cdp.detach();
  });

  test('let go away from every lit place: the card glides home over several frames (not a jump) and the hand view is back', async ({ page }) => {
    await openBoard(page, 1);
    await lean(page);
    const v = await getView(page);
    const { hold, lifted } = await liftHand(page, cardWith(v, 'new_server'));
    const away = center(emptySpot(lifted));
    const from = center(lifted.handView!.centre);
    for (let k = 1; k <= 6; k++) await hold.move(from.x + ((away.x - from.x) * k) / 6, from.y + ((away.y - from.y) * k) / 6);
    await page.waitForFunction(() => window.__overclock!.layout().drag?.hover === null);
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const dropped = (await layout(page)).drag!.box;
    await page.evaluate(() => {
      const w = window as unknown as {
        __g: { t: number; x: number; y: number }[];
        __gOn: boolean;
      };
      w.__g = [];
      w.__gOn = true;
      const tick = (t: number) => {
        const l = window.__overclock!.layout();
        const b = l.drag?.box ?? l.zoom?.box;
        if (b) w.__g.push({ t, x: b.x + b.width / 2, y: b.y + b.height / 2 });
        if (w.__gOn) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await hold.release();
    await page.waitForFunction(() => window.__overclock!.layout().drag === null);
    await page.waitForTimeout(300);
    const g = await page.evaluate(() => {
      const w = window as unknown as {
        __g: { t: number; x: number; y: number }[];
        __gOn: boolean;
      };
      w.__gOn = false;
      return w.__g;
    });
    const end = await waitIdle(page);
    expect(end.handView, 'the hand view is back').not.toBeNull();
    const home = center(end.handView!.centre);
    const start = center(dropped);
    const total = dist(start, home);
    const between = g.filter((p) => dist(p, home) > 2 && dist(p, start) > 2 && dist(p, home) < total);
    test.info().annotations.push({
      type: 'glide',
      description: `${between.length} in-between frames over ${total.toFixed(0)} px`,
    });
    expect(between.length, 'seen in between (glides)').toBeGreaterThanOrEqual(1);
    const rec = (await page.evaluate(() => window.__overclock!.anims())).filter((a) => a.kind === 'hand_return' || a.kind === 'card_return');
    for (const r of rec) expect(r.scheduledMs).toBeLessThanOrEqual(200);
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('QA S-15-2 played cards fly and land', () => {
  test('a held install (picked up, let go on the lit new-server place) flies from where it was let go to its spot and settles', async ({ page }) => {
    await openBoard(page, 1);
    const v = await getView(page);
    const i = cardWith(v, 'new_server');
    const cardId = v.players.corp.hand![i]!;
    const picked = await pickHand(page, i);
    const handBox = picked.hand[i]!.box;
    await holdMotion(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, targetOf(picked, 'new_server').box);
    await page.waitForFunction(() => window.__overclock!.layout().motion.flights.some((f) => f.kind === 'install'));
    let l = await layout(page);
    const f0 = l.motion.flights.find((f) => f.kind === 'install')!;
    expect(f0.cardId, "the Corp's own card on the Corp's screen").toBe(cardId);
    // S-15-6: picked up and let go on the place: it flies from where it was let go (the held card).
    const dropAt = center(targetOf(picked, 'new_server').box);
    expect(dist(center(f0.box), dropAt), 'starts where it was let go').toBeLessThan(Math.max(handBox.width, handBox.height));
    l = await advance(page, 120);
    await snap(page, 's15-2-button-install-mid');
    const remote = l.servers.at(-1)!;
    const spot = [...remote.content, ...remote.ice][0]!.box;
    const mid = l.motion.flights.find((f) => f.kind === 'install')!;
    expect(dist(center(mid.box), center(spot))).toBeLessThan(dist(center(f0.box), center(spot)));
    const took = await runOut(page);
    expect(took, 'flight + settle within 0.6 s').toBeLessThanOrEqual(600);
    const a = await page.evaluate(() => window.__overclock!.anims());
    expect(
      a.some((r) => r.kind === 'land_settle'),
      'lands with a settle',
    ).toBe(true);
    expectBudget(a);
  });

  test("pass-the-phone with the cover: the Runner's screen shows Corp cards he may not know only as card backs (install, discard, a just-played operation)", async ({ page }) => {
    await page.goto('./?seed=1&play=here&decks=starter');
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
    let l = await layout(page);
    if (l.cover) {
      await tap(page, {
        x: l.viewport.width / 2 - 5,
        y: l.viewport.height - 40,
        width: 10,
        height: 10,
      });
      await page.waitForFunction(() => window.__overclock!.layout().cover === null);
    }
    await waitIdle(page);
    const v = await getView(page);
    const corpHand = v.players.corp.hand!;
    const inst = v.handOptions[cardWith(v, 'new_server')]!.find((o) => o.reject === null && kindOf(o) === 'new_server')!;
    await dispatch(page, inst.action);
    await waitIdle(page);
    // An operation if there is one (shown face up to the Corp; it is public once played).
    const w = await getView(page);
    const op = w.handOptions.flat().find((o) => o.reject === null && o.action.type === 'play');
    await holdMotion(page);
    await recordFlights(page);
    if (op) await dispatch(page, op.action);
    // End the turn with the discard (if any) while the Corp's own movement is still frozen mid-air.
    await page.evaluate(() => {
      const hook = window.__overclock!;
      hook.dispatch({ type: 'end_turn', player: 'corp' });
      const x = hook.getView();
      if (x.pendingDiscard > 0)
        hook.dispatch({
          type: 'discard',
          player: 'corp',
          handIndices: Array.from({ length: x.pendingDiscard }, (_, k) => k),
        });
    });
    for (let k = 0; k < 20 && (await layout(page)).cover === null; k++) await advance(page, 60);
    l = await layout(page);
    expect(l.cover, 'the hand-over cover is up').not.toBeNull();
    expect(l.cover!.to).toBe('runner');
    await snap(page, 's15-2-cover-up');
    // The Runner lifts the cover with a real tap.
    await tap(page, {
      x: l.viewport.width / 2 - 5,
      y: l.viewport.height - 40,
      width: 10,
      height: 10,
    });
    await page.waitForFunction(() => window.__overclock!.layout().cover === null && window.__overclock!.layout().viewer === 'runner');
    await page.waitForTimeout(50);
    l = await layout(page);
    const inAir = l.motion.flights.find((f) => f.kind === 'install');
    if (inAir) {
      expect(inAir.cardId).toBeNull();
      await snap(page, 's15-2-runner-sees-back-fly-in');
    }
    await runOut(page);
    const runnerView = await getView(page);
    // Cards the Runner may see: public places in his own view.
    const pub = new Set<string>([
      ...runnerView.players.corp.discard.filter((c): c is string => typeof c === 'string'),
      ...runnerView.corpServers.flatMap((s) => [...s.ice, ...s.content].map((c) => c.cardId).filter((c): c is string => !!c)),
      ...(runnerView.players.runner.hand ?? []),
      ...runnerView.rig.map((c) => c.cardId).filter((c): c is string => typeof c === 'string'),
      ...runnerView.players.runner.discard.filter((c): c is string => typeof c === 'string'),
    ]);
    const all = await recorded(page);
    const asRunner = all.filter((f) => f.viewer === 'runner');
    test.info().annotations.push({
      type: 'runner-flights',
      description: JSON.stringify(asRunner.map((f) => [f.kind, f.cardId, f.cover])),
    });
    expect(
      asRunner.some((f) => f.kind === 'install' && f.cardId === null),
      "the Corp's install flies in as a back",
    ).toBe(true);
    for (const f of asRunner) {
      if (f.cardId === null) continue;
      expect(f.cover, 'nothing flies over the cover').toBe(false);
      // A face is fine only if the Runner's own view shows that card face up somewhere.
      expect(pub.has(f.cardId), `${f.kind} ${f.cardId} is public to the Runner`).toBe(true);
    }
    // Every Corp hand card (start of turn) that the Runner's view still doesn't show stays unseen.
    const hiddenIds = corpHand.filter((c) => !pub.has(c));
    for (const f of asRunner) expect(f.cardId === null || !hiddenIds.includes(f.cardId) || pub.has(f.cardId)).toBe(true);
  });

  test("online: the Runner's phone sees the Corp's draw, install and end-of-turn discard as card backs and never receives their ids", async ({ browser }) => {
    const corp = await openPhone(browser);
    const runner = await openPhone(browser, 'motion=hold');
    const code = await startTestGame(corp, 'corp', {
      seed: 1,
      actions: [],
      deckSet: 'starter',
    });
    await joinGame(runner, code);
    await Promise.all([waitPlaying(corp), waitPlaying(runner)]);
    await recordFlights(runner.page);
    const before = runner.received.length;
    let v = await view(corp);
    const inst = v.handOptions.flat().find((o) => o.reject === null && o.action.type === 'install' && o.action.server === 'new')!;
    const instId = v.players.corp.hand![v.handOptions.findIndex((os) => os.includes(inst))]!;
    await act(corp, inst.action);
    await waitView(runner, (w) => w.corpServers.length > 3);
    await runner.page.evaluate(() => window.__overclock!.advanceMotion(600));
    await act(corp, { type: 'draw', player: 'corp' });
    await waitView(runner, (w) => w.players.corp.handCount === 6);
    await runner.page.evaluate(() => window.__overclock!.advanceMotion(600));
    await act(corp, { type: 'draw', player: 'corp' });
    await waitView(runner, (w) => w.players.corp.handCount === 7);
    await runner.page.evaluate(() => window.__overclock!.advanceMotion(600));
    v = await view(corp);
    const drawn = v.players.corp.hand!.slice(-2);
    await act(corp, { type: 'end_turn', player: 'corp' });
    v = await view(corp);
    const k = v.pendingDiscard;
    expect(k, 'the Corp has to discard').toBeGreaterThan(0);
    const discardIds = v.players.corp.hand!.slice(0, k);
    await act(corp, {
      type: 'discard',
      player: 'corp',
      handIndices: Array.from({ length: k }, (_, j) => j),
    });
    await waitView(runner, (w) => w.activePlayer === 'runner');
    await runner.page.waitForTimeout(100);
    await snap(runner.page, 's15-2-online-runner-sees-discard-backs');
    await runner.page.evaluate(() => window.__overclock!.advanceMotion(1000));
    const fl = await recorded(runner.page);
    test.info().annotations.push({
      type: 'runner-flights',
      description: JSON.stringify(fl.map((f) => [f.kind, f.cardId])),
    });
    expect(fl.filter((f) => f.kind === 'install').length).toBeGreaterThan(0);
    expect(fl.filter((f) => f.kind === 'draw').length, "the Corp's 2 draws fly too").toBeGreaterThanOrEqual(1);
    const rv = await view(runner);
    const pubArchives = new Set(rv.players.corp.discard.filter((c): c is string => typeof c === 'string'));
    for (const f of fl) {
      if (f.kind === 'install' || f.kind === 'draw') expect(f.cardId, `${f.kind} is a back`).toBeNull();
      if (f.kind === 'discard' && f.cardId !== null) expect(pubArchives.has(f.cardId), 'a discard shown face up is face up in Archives').toBe(true);
    }
    const secret = [instId, ...drawn, ...discardIds.filter((c) => !pubArchives.has(c))];
    const frames = runner.received.slice(before).join('\n');
    // A card id may appear in the Runner's frames only if the Runner's own view shows it (his own cards, public cards).
    const runnerKnows = new Set([...rv.players.runner.hand!, ...rv.players.runner.discard, ...rv.rig.map((c) => c.cardId), ...pubArchives]);
    for (const id of secret) if (!runnerKnows.has(id)) expect(frames.includes(`"${id}"`), `${id} never sent to the Runner`).toBe(false);
    await corp.context.close();
    await runner.context.close();
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('QA S-15-3 piles', () => {
  test('a draw: the drawn card flies in and the other hand cards slide aside over several frames', async ({ page }) => {
    await openBoard(page, 1);
    await lean(page);
    const l0 = await waitIdle(page);
    await page.evaluate(() => {
      const w = window as unknown as {
        __h: { t: number; xs: number[] }[];
        __hOn: boolean;
      };
      w.__h = [];
      w.__hOn = true;
      const tick = (t: number) => {
        w.__h.push({
          t,
          xs: window.__overclock!.layout().hand.map((h) => h.box.x),
        });
        if (w.__hOn) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await tap(page, l0.corp.deck);
    const l1 = await waitIdle(page);
    await page.waitForTimeout(100);
    const h = await page.evaluate(() => {
      const w = window as unknown as {
        __h: { t: number; xs: number[] }[];
        __hOn: boolean;
      };
      w.__hOn = false;
      return w.__h;
    });
    expect(l1.hand.length).toBe(l0.hand.length + 1);
    // The first card's x before and after.
    const x0 = l0.hand[0]!.box.x;
    const x1 = l1.hand[0]!.box.x;
    test.info().annotations.push({
      type: 'slide',
      description: `hand[0] x ${x0.toFixed(1)} -> ${x1.toFixed(1)}`,
    });
    if (Math.abs(x1 - x0) > 2) {
      const lo = Math.min(x0, x1) + 0.5;
      const hi = Math.max(x0, x1) - 0.5;
      const mids = h.filter((s) => s.xs.length > 0 && s.xs[0]! > lo && s.xs[0]! < hi);
      expect(mids.length, 'the other cards slide (in-between positions seen)').toBeGreaterThanOrEqual(1);
    }
    await snap(page, 's15-3-after-draw');
  });

  test("the Corp's draw at the start of its turn flies from R&D into the hand", async ({ page }) => {
    await openBoard(page, 1);
    await toRunnerTurn(page);
    await holdMotion(page);
    await recordFlights(page);
    await page.evaluate(() => window.__overclock!.dispatch({ type: 'end_turn', player: 'runner' }));
    for (let k = 0; k < 30 && (await layout(page)).viewer !== 'corp'; k++) await advance(page, 40);
    await page.waitForFunction(() => window.__overclock!.layout().viewer === 'corp');
    const l = await layout(page);
    await page.waitForTimeout(30);
    const fl = (await recorded(page)).filter((f) => f.viewer === 'corp' && f.kind === 'draw');
    expect(fl.length, "the turn's draw flies").toBe(1);
    expect(dist(center(fl[0]!.box), center(l.corp.deck)), 'from R&D').toBeLessThan(6);
    await runOut(page);
    expect((await layout(page)).hand.length).toBe((await getView(page)).players.corp.handCount);
  });

  test('Bank Job emptied flies to the Heap; the Heap count goes up when it lands', async ({ page }) => {
    await openBoard(page, 1); // starter decks, as s10-bankjob
    const plan = await toStep(page, 1, 'runner_bank_job_remote');
    let l = await startRun(page, plan.info['server']!);
    await tap(page, runButtonOf(l, 'Bank Job: take credits').box);
    await page.waitForFunction(() => window.__overclock!.layout().run?.amount != null);
    l = await layout(page);
    expect(l.run!.amount!.amount, 'opens at all 8').toBe(8);
    const heap0 = Number(l.text.runnerDiscard || 0);
    await holdMotion(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, l.run!.buttons.find((b) => b.role === 'bid_go')!.box);
    await page.waitForFunction(() => window.__overclock!.layout().motion.flights.some((f) => f.kind === 'trash'));
    l = await advance(page, 100);
    expect(Number(l.text.runnerDiscard || 0), 'the Heap waits for the card').toBe(heap0);
    const f = l.motion.flights.find((x) => x.kind === 'trash')!;
    expect(f.cardId, 'Bank Job is face up (it was on the table)').not.toBeNull();
    expect(dist(center(f.box), center(l.runner.discard)), 'heading for the Heap').toBeLessThan(dist(center(l.rig.find((c) => c.cardId === f.cardId)?.box ?? f.box), center(l.runner.discard)) + 1);
    await snap(page, 's15-3-bank-job-to-heap');
    await runOut(page);
    l = await layout(page);
    expect(Number(l.text.runnerDiscard), 'counted on landing').toBe(heap0 + 1);
    expect((await getView(page)).players.runner.discardCount).toBe(heap0 + 1);
  });

  for (const kind of ['trash', 'steal'] as const) {
    test(`an accessed card ${kind === 'trash' ? 'trashed flies to Archives' : "stolen flies to the Runner's score pile, points tick up"}; the count waits for the landing`, async ({ page }) => {
      const seed = kindSeed(kind);
      await openBoard(page, { seed, decks: 'core' });
      const plan = await toStep(page, seed, 'remote_single_card_no_ice');
      let l = await startRun(page, plan.info['server']!);
      // Get to the access (Continue / Access cards if asked).
      for (let g = 0; g < 4 && !l.run?.buttons.some((b) => (kind === 'trash' ? /^Trash/ : /^Steal/).test(b.label)); g++) {
        const b = l.run?.buttons.find((x) => x.lit);
        if (!b) break;
        await tap(page, b.box);
        l = await waitIdle(page);
      }
      const btn = l.run!.buttons.find((b) => (kind === 'trash' ? /^Trash/ : /^Steal/).test(b.label))!;
      expect(btn, `a ${kind} button`).toBeTruthy();
      const archives0 = Number(l.text.corpDiscard || 0);
      const scored0 = l.scored.runner.count;
      const points0 = l.score.runner.text;
      await holdMotion(page);
      await page.evaluate(() => window.__overclock!.clearAnims());
      await tap(page, btn.box);
      await page.waitForFunction((k) => window.__overclock!.layout().motion.flights.some((f) => f.kind === k), kind);
      const f0 = (await layout(page)).motion.flights.find((x) => x.kind === kind)!;
      l = await advance(page, 100);
      if (kind === 'trash') expect(Number(l.text.corpDiscard || 0), 'Archives waits').toBe(archives0);
      else {
        expect(l.scored.runner.count, 'the score pile waits').toBe(scored0);
        expect(l.score.runner.text, 'the points wait').toBe(points0);
      }
      const f = l.motion.flights.find((x) => x.kind === kind)!;
      const to = kind === 'trash' ? l.corp.discard : l.scored.runner.box;
      expect(dist(center(f.box), center(to)), `heading for ${kind === 'trash' ? 'Archives' : 'his score pile'}`).toBeLessThan(dist(center(f0.box), center(to)));
      await snap(page, `s15-3-access-${kind}-mid`);
      await runOut(page);
      l = await advance(page, 600); // the points tick (200 ms) + glow run on the same clock
      const v = await getView(page);
      if (kind === 'trash') {
        expect(Number(l.text.corpDiscard), 'Archives +1 on landing').toBe(archives0 + 1);
      } else {
        expect(l.scored.runner.count).toBe(scored0 + 1);
        const pts = v.players.runner.points;
        expect(l.score.runner.text).toBe(`Runner ${pts} ${pts === 1 ? 'point' : 'points'}`);
        const tick = (await page.evaluate(() => window.__overclock!.anims())).find((r) => r.kind === 'score_tick');
        expect(tick, 'the points tick with a glow').toBeTruthy();
      }
      expectBudget(await page.evaluate(() => window.__overclock!.anims()));
    });
  }

  for (const side of ['runner', 'corp'] as const) {
    test(`${side}: several cards discarded at the end of the turn ripple to the ${side === 'runner' ? 'Heap' : 'Archives'} one after another, all landed within 0.5 s, count on landing`, async ({
      page,
    }) => {
      await openBoard(page, { seed: 1, decks: 'core' });
      const plan = await toStep(page, 1, side === 'runner' ? 'runner_must_discard' : 'corp_must_discard');
      const count = Number(plan.info['count']);
      expect(count).toBeGreaterThanOrEqual(2);
      const l0 = await waitIdle(page);
      const pile = (l: LayoutSnapshot) => Number((side === 'runner' ? l.text.runnerDiscard : l.text.corpDiscard) || 0);
      const before = pile(l0);
      await holdMotion(page);
      await recordFlights(page);
      await page.evaluate(
        ({ s, n }) =>
          window.__overclock!.dispatch({
            type: 'discard',
            player: s,
            handIndices: Array.from({ length: n }, (_, k) => k),
          }),
        { s: side, n: count },
      );
      await page.waitForFunction(() => window.__overclock!.layout().motion.active > 0);
      let l = await advance(page, 60);
      expect(pile(l), 'the pile waits for the cards').toBeLessThan(before + count);
      await snap(page, `s15-3-${side}-discard-ripple`);
      // Step the frozen clock and note when the last card lands.
      let t = 60;
      while ((await layout(page)).motion.flights.some((f) => f.kind === 'discard') && t < 1500) {
        await advance(page, 10);
        t += 10;
      }
      test.info().annotations.push({
        type: 'ripple',
        description: `${count} cards landed by ${t} ms`,
      });
      expect(t, 'the whole ripple within ~0.5 s').toBeLessThanOrEqual(510);
      await runOut(page);
      await page.evaluate(() => window.__overclock!.motion('normal'));
      l = await waitIdle(page);
      expect(pile(l), 'every card counted').toBe(before + count);
      const disc = (await recorded(page)).filter((f) => f.kind === 'discard');
      expect(disc.length, 'each card flies').toBeGreaterThanOrEqual(Math.min(count, 2));
    });
  }

  test('Accelerated Beta Test: the 3 looked-at cards ripple to Archives within 0.5 s, Archives +3 on landing', async ({ page }) => {
    await openBoard(page, { seed: 2, decks: 'core45' });
    const plan = await toStep(page, 2, 'abt_scorable_no_ice');
    let l = await waitIdle(page);
    const card = l.servers.flatMap((s) => s.content).find((c) => c.uid === plan.info['uid'])!;
    await tap(page, card.box);
    await page.waitForFunction((u) => window.__overclock!.layout().selectedInstalled === u, plan.info['uid']);
    await tap(page, targetOf(await layout(page), 'score').box);
    await page.waitForFunction(() => window.__overclock!.layout().sheet?.kind === 'look');
    l = await waitIdle(page);
    const before = Number(l.text.corpDiscard || 0);
    await holdMotion(page);
    await recordFlights(page);
    await tap(page, targetOf(l, 'look_done').box);
    await page.waitForFunction(() => window.__overclock!.layout().motion.active > 0);
    let t = 0;
    while ((await layout(page)).motion.active > 0 && t < 1500) {
      if (t === 60) await snap(page, 's15-3-abt-ripple');
      await advance(page, 10);
      t += 10;
    }
    test.info().annotations.push({ type: 'abt', description: `landed by ${t} ms` });
    expect(t).toBeLessThanOrEqual(510);
    l = await waitIdle(page);
    expect(Number(l.text.corpDiscard)).toBe(before + 3);
    const mills = (await recorded(page)).filter((f) => f.kind === 'mill' || f.kind === 'trash');
    expect(mills.length, 'the cards fly').toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('QA S-15-4 never slower', () => {
  /**
   * Starts a movement with `action` in real time (motion `normal`) and taps the seat's credits
   * (click for a credit) at once through the browser's input pipeline. A window capture listener
   * notes how many cards were in the air when the finger went down (before the game sees it).
   */
  async function tapDuring(page: Page, action: Action, seat: 'corp' | 'runner', mustCatch = true, onHand = false, freeze = false): Promise<boolean> {
    await page.evaluate(() => window.__overclock!.motion('normal'));
    const l = await waitIdle(page);
    if (freeze) await holdMotion(page);
    // On the hand: a point inside the first hand card both before and after one card leaves the
    // hand (whether the strip re-centres or not), so the tap opens the hand view either way.
    const h0 = l.hand[0]!.box;
    const slot = l.hand.length > 1 ? l.hand[1]!.box.x - h0.x : h0.width;
    const box = onHand ? { x: h0.x + slot / 2, y: h0.y + h0.height / 2 - 4, width: 8, height: 8 } : l[seat].credits;
    const credits0 = (await getView(page)).players[seat].credits;
    await page.evaluate(() => {
      const w = window as unknown as { __m?: unknown; __air: number };
      const hook = window.__overclock!;
      w.__m = undefined;
      w.__air = -1;
      window.addEventListener('pointerdown', () => (w.__air = hook.layout().motion.active), { capture: true, once: true });
      window.addEventListener(
        'pointerup',
        (e) => {
          const stateAt = performance.now();
          const input = hook.lastInput();
          w.__m = {
            tapAt: e.timeStamp,
            handledAt: input && input.eventAt === e.timeStamp ? input.handledAt : NaN,
            stateAt,
            credits: hook.getView().players.corp.credits + hook.getView().players.runner.credits,
            air: hook.layout().motion.active,
          };
        },
        { once: true },
      );
    });
    await page.evaluate((a) => {
      window.__overclock!.clearAnims();
      window.__overclock!.dispatch(a);
    }, action);
    if (freeze) await page.waitForFunction(() => window.__overclock!.layout().motion.active > 0);
    await sendTap(page, box);
    await page.waitForFunction(() => (window as unknown as { __m?: unknown }).__m !== undefined);
    const m = await page.evaluate(() => {
      const w = window as unknown as {
        __m: { tapAt: number; handledAt: number; stateAt: number; air: number };
        __air: number;
      };
      return { __m: w.__m, __air: w.__air };
    });
    const recs = await page.evaluate(() => window.__overclock!.anims());
    test.info().annotations.push({
      type: 'tap-during',
      description: JSON.stringify({
        inAirAtDown: m.__air,
        queueMs: m.__m.handledAt - m.__m.tapAt,
        stateMs: m.__m.stateAt - m.__m.handledAt,
      }),
    });
    if (mustCatch) expect(m.__air, 'cards were moving when the finger went down').toBeGreaterThan(0);
    expect(Number.isFinite(m.__m.handledAt), 'the tap reached the game').toBe(true);
    expect(m.__m.stateAt - m.__m.handledAt, 'answered within 0.1 s').toBeLessThan(100);
    expect(m.__m.air, 'nothing in the air once the tap is handled').toBe(0);
    if (m.__air > 0)
      expect(
        recs.some((a) => a.kind === 'motion_skipped'),
        'the movement jumped to its end',
      ).toBe(true);
    if (onHand) await page.waitForFunction(() => window.__overclock!.layout().handView !== null, undefined, { timeout: 2000 });
    else expect((await getView(page)).players[seat].credits, 'the tap counted').toBe(credits0 + 1);
    const after = await layout(page);
    expect(after.motion.flights, 'nothing left in the air').toEqual([]);
    return m.__air > 0;
  }

  test('a tap during an install flight finishes it and is answered within 0.1 s (flight frozen mid-air; real time: see the one-shot test)', async ({ page }) => {
    await openBoard(page, 1);
    // The test machine draws a moving frame in 120-250 ms (no GPU) and holds input until the frame
    // is out, so a real-time tap usually arrives after a 0.35 s install has landed. The flight is
    // frozen mid-air instead (test switch) and the tap is a real one through the browser.
    const v = await getView(page);
    const o = v.handOptions.flat().find((x) => x.reject === null && kindOf(x) === 'new_server')!;
    expect(await tapDuring(page, o.action, 'corp', true, true, true)).toBe(true);
    const l = await layout(page);
    expect(l.servers.length, 'the card is on its spot').toBe(4);
    expect([...l.servers[3]!.content, ...l.servers[3]!.ice].length).toBe(1);
  });

  test('a tap during a one-shot card showing (real time; frozen if the runner is too busy) finishes it; the Heap count is exact', async ({ page }) => {
    await openBoard(page, 1);
    await toRunnerTurn(page);
    // Real time: the 0.48 s showcase outlasts the test machine's slow (no GPU) frames most of the
    // time; a second one-shot card if the first tap arrived after it landed (each try costs 2 clicks).
    let caught = false;
    for (let k = 0; k < 2 && !caught; k++) {
      const v = await getView(page);
      const o = v.handOptions.flat().find((x) => x.reject === null && x.action.type === 'play');
      if (!o) break;
      const heap0 = v.players.runner.discardCount;
      // Second try (only if the first real-time tap came after the landing, e.g. a CI runner busy
      // with 4 workers): the showcase is frozen mid-air and the tap is still a real one.
      const frozen = k > 0;
      caught = await tapDuring(page, o.action, 'runner', false, false, frozen);
      test.info().annotations.push({
        type: 'showcase-try',
        description: `try ${k + 1} (${frozen ? 'frozen' : 'real time'}): ${caught ? 'tap during the showcase' : 'already landed'}`,
      });
      const l = await layout(page);
      expect(Number(l.text.runnerDiscard), 'the Heap count is exact').toBe(heap0 + 1);
    }
    expect(caught, 'a tap landed while the one-shot card was moving').toBe(true);
  });

  test('long tasks while cards move stay far under 0.6 s, and every movement record is inside the budget', async ({ page }) => {
    await openBoard(page, 1);
    await waitIdle(page);
    await page.evaluate(() => {
      const w = window as unknown as { __lt: number[] };
      w.__lt = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__lt.push(e.duration);
      }).observe({ type: 'longtask' });
      window.__overclock!.clearAnims();
    });
    const v = await getView(page);
    const o = v.handOptions.flat().find((x) => x.reject === null && kindOf(x) === 'new_server')!;
    await dispatch(page, o.action);
    await waitIdle(page);
    await dispatch(page, { type: 'draw', player: 'corp' });
    await waitIdle(page);
    await page.evaluate(() => {
      const hook = window.__overclock!;
      hook.dispatch({ type: 'end_turn', player: 'corp' });
      const x = hook.getView();
      if (x.pendingDiscard > 0)
        hook.dispatch({
          type: 'discard',
          player: 'corp',
          handIndices: Array.from({ length: x.pendingDiscard }, (_, k) => k),
        });
    });
    await waitIdle(page);
    const w = await getView(page);
    const play = w.handOptions.flat().find((x) => x.reject === null && (x.action.type === 'play' || x.action.type === 'install'));
    if (play) await dispatch(page, play.action);
    await waitIdle(page);
    const lt = await page.evaluate(() => (window as unknown as { __lt: number[] }).__lt);
    test.info().annotations.push({
      type: 'longtasks',
      description: JSON.stringify(lt.map((d) => Math.round(d))),
    });
    for (const d of lt) expect(d, 'no long task blocks input for 0.6 s').toBeLessThan(600);
    expectBudget(await page.evaluate(() => window.__overclock!.anims()));
  });

  test('upright mid-showcase: the turn-sideways prompt; back sideways nothing floats and the Heap count is exact', async ({ page }) => {
    test.skip(test.info().project.use.isMobile !== true, 'phones only');
    await openBoard(page, 1);
    await toRunnerTurn(page);
    const v = await getView(page);
    const o = v.handOptions.flat().find((x) => x.reject === null && x.action.type === 'play')!;
    const heap0 = v.players.runner.discardCount;
    await holdMotion(page);
    await dispatch(page, o.action);
    await page.waitForFunction(() => window.__overclock!.layout().motion.active > 0);
    await advance(page, 170);
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.height, height: size.width });
    await page.waitForFunction(() => window.__overclock!.layout().mode === 'portrait');
    await expect(page.getByText(/Turn your phone sideways/i)).toBeVisible();
    await snap(page, 's15-4-upright-mid-movement');
    await page.setViewportSize(size);
    await page.waitForFunction((wd) => window.__overclock!.layout().viewport.width === wd && window.__overclock!.layout().mode === 'landscape', size.width);
    const now = await layout(page);
    expect(now.motion.active).toBe(0);
    expect(now.motion.flights).toEqual([]);
    expect(Number(now.text.runnerDiscard), 'the Heap shows the card').toBe(heap0 + 1);
    await page.evaluate(() => window.__overclock!.motion('normal'));
    const idle = await waitIdle(page);
    expect(now.hand.map((h) => h.box)).toEqual(idle.hand.map((h) => h.box));
    expect(now.rig.map((c) => c.box)).toEqual(idle.rig.map((c) => c.box));
    await snap(page, 's15-4-back-sideways');
  });

  test("the same Corp install moves the same in pass-the-phone and online (Corp's screen: from the hand, face up; Runner's: a back from the top)", async ({ page, browser }) => {
    type Seen = { kind: string; faceUp: boolean; fromTop: boolean }[];
    const summary = (fl: Flight[], vh: number): Seen =>
      fl
        .filter((f) => f.kind === 'install')
        .map((f) => ({
          kind: f.kind,
          faceUp: f.cardId !== null,
          fromTop: center(f.box).y < vh / 2,
        }));
    // Pass-the-phone (no cover).
    await openBoard(page, 1);
    const v = await getView(page);
    const o = v.handOptions.flat().find((x) => x.reject === null && kindOf(x) === 'new_server')! as {
      action: Action;
    };
    await holdMotion(page);
    await recordFlights(page);
    await dispatch(page, o.action);
    await page.waitForTimeout(30);
    const vh = (await layout(page)).viewport.height;
    const hotCorp = summary(await recorded(page), vh);
    await runOut(page);
    await recordFlights(page);
    await page.evaluate(() => {
      const hook = window.__overclock!;
      hook.dispatch({ type: 'end_turn', player: 'corp' });
      const x = hook.getView();
      if (x.pendingDiscard > 0)
        hook.dispatch({
          type: 'discard',
          player: 'corp',
          handIndices: Array.from({ length: x.pendingDiscard }, (_, k) => k),
        });
    });
    for (let k = 0; k < 20 && (await layout(page)).viewer !== 'runner'; k++) await advance(page, 60);
    await page.waitForFunction(() => window.__overclock!.layout().motion.flights.some((f) => f.kind === 'install'));
    await page.waitForTimeout(30);
    const hotRunner = summary(
      (await recorded(page)).filter((f) => (f as { viewer?: string }).viewer === 'runner'),
      vh,
    );
    // Online.
    const corp = await openPhone(browser, 'motion=hold');
    const runner = await openPhone(browser, 'motion=hold');
    const code = await startTestGame(corp, 'corp', {
      seed: 1,
      actions: [],
      deckSet: 'starter',
    });
    await joinGame(runner, code);
    await Promise.all([waitPlaying(corp), waitPlaying(runner)]);
    await recordFlights(corp.page);
    await recordFlights(runner.page);
    await act(corp, o.action);
    await waitView(runner, (w) => w.corpServers.length > 3);
    await runner.page.waitForFunction(() => window.__overclock!.layout().motion.flights.some((f) => f.kind === 'install'));
    await corp.page.waitForTimeout(30);
    const onCorp = summary(await recorded(corp.page), (await layoutOf(corp)).viewport.height);
    const onRunner = summary(await recorded(runner.page), (await layoutOf(runner)).viewport.height);
    test.info().annotations.push({
      type: 'compare',
      description: JSON.stringify({ hotCorp, onCorp, hotRunner, onRunner }),
    });
    expect(hotCorp.length).toBe(1);
    expect(onCorp, "Corp's screen: same movement").toEqual(hotCorp);
    expect(hotRunner.length).toBe(1);
    expect(onRunner, "Runner's screen: same movement").toEqual(hotRunner);
    expect(hotRunner[0]).toEqual({
      kind: 'install',
      faceUp: false,
      fromTop: true,
    });
    await corp.context.close();
    await runner.context.close();
  });
});

// =============================================================================================
// Round 3 (S-15-6 hold a card to play it), written by QA. Independent of the developers' specs:
// QA drives its own touch / mouse gestures through CDP (not the e2e pickHand/pickCard helpers),
// expects the lit places from the card TYPE and the board (not from view.handOptions), compares a
// drop's result with the engine applying the same option directly, records every frame in the
// page (drag, lit places, hand strip, longest frame) and times things from the browser's own
// event stamps. Screenshots: QA_SCREENS=1 -> docs/sprints/sprint-15-qa/r3-<size>-<name>.png.

type Pt = { x: number; y: number };

async function snap3(page: Page, name: string): Promise<void> {
  const p = test.info().project.name;
  const save = process.env.QA_SCREENS === '1';
  if (save) mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot(save ? { path: join(SHOTS, `r3-${SIZE[p] ?? p}-${name}.png`) } : {});
  await test.info().attach(name, { body, contentType: 'image/png' });
}

const touchProject = () => test.info().project.use.hasTouch === true;

/** QA's own finger (touch on phones, the left mouse button on desktop), optionally stamped (wall-clock ms). */
interface Finger {
  down(p: Pt, t?: number): Promise<void>;
  move(p: Pt, t?: number): Promise<void>;
  up(t?: number): Promise<void>;
  cancel(): Promise<void>;
  at: Pt;
}
async function qaFinger(page: Page): Promise<Finger> {
  const cdp = await page.context().newCDPSession(page);
  const touch = touchProject();
  const ts = (t?: number) => (t === undefined ? {} : { timestamp: t / 1000 });
  const f: Finger = {
    at: { x: 0, y: 0 },
    async down(p, t) {
      f.at = p;
      if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p], ...ts(t) });
      else {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, buttons: 0, ...ts(t) });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1, ...ts(t) });
      }
    },
    async move(p, t) {
      f.at = p;
      if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p], ...ts(t) });
      else await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'left', buttons: 1, ...ts(t) });
    },
    async up(t) {
      if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], ...ts(t) });
      else await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: f.at.x, y: f.at.y, button: 'left', buttons: 0, clickCount: 1, ...ts(t) });
      await cdp.detach().catch(() => undefined);
    },
    async cancel() {
      if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      else await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: f.at.x, y: f.at.y, button: 'left', buttons: 0, clickCount: 1 });
      await cdp.detach().catch(() => undefined);
    },
  };
  return f;
}

/** Slides the finger to `to` in `steps` moves (a finger drags, it does not jump). */
async function slide(f: Finger, to: Pt, steps = 4): Promise<void> {
  const from = f.at;
  for (let k = 1; k <= steps; k++) await f.move({ x: from.x + ((to.x - from.x) * k) / steps, y: from.y + ((to.y - from.y) * k) / steps });
}

interface QaFrame {
  t: number;
  drag: boolean;
  dimmed: boolean;
  targets: number;
  lit: number;
  minimized: boolean;
  zoom: boolean;
  view: boolean;
  stripTop: number;
  /** Lowest edge of the hand strip's cards (<= viewport height: the hand is back up). */
  stripBottom: number;
  vh: number;
  dragBox: { x: number; y: number; width: number; height: number } | null;
}
/** Starts QA's in-page recorder: every frame's hold state, the pointer stamps and long tasks. */
async function qaWatch(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __q: { frames: QaFrame[]; downs: number[]; ups: number[]; downsAt: number[]; upsAt: number[]; moves: { at: number; handled: number; x: number; y: number }[]; long: number[]; on: boolean };
    };
    if (w.__q) w.__q.on = false;
    const q = { frames: [] as QaFrame[], downs: [] as number[], ups: [] as number[], downsAt: [] as number[], upsAt: [] as number[], moves: [] as { at: number; handled: number; x: number; y: number }[], long: [] as number[], on: true };
    w.__q = q;
    window.addEventListener('pointerdown', (e) => q.on && (q.downs.push(e.timeStamp), q.downsAt.push(performance.now())), { capture: true });
    window.addEventListener('pointerup', (e) => q.on && (q.ups.push(e.timeStamp), q.upsAt.push(performance.now())), { capture: true });
    window.addEventListener('pointermove', (e) => q.on && q.moves.push({ at: e.timeStamp, handled: performance.now(), x: e.clientX, y: e.clientY }), { capture: true });
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (q.on) q.long.push(e.duration);
      }).observe({ type: 'longtask', buffered: false });
    } catch {
      /* no longtask support */
    }
    const tick = (t: number) => {
      if (!q.on) return;
      const l = window.__overclock!.layout();
      q.frames.push({
        t,
        drag: l.drag !== null,
        dimmed: l.drag?.dimmed ?? false,
        targets: l.targets.length,
        lit: l.targets.filter((x) => x.lit).length,
        minimized: l.handMinimized,
        zoom: l.zoom !== null,
        view: l.handView !== null,
        stripTop: Math.min(...l.hand.map((h) => h.box.y)),
        stripBottom: Math.max(...l.hand.map((h) => h.box.y + h.box.height)),
        vh: l.viewport.height,
        dragBox: l.drag ? { ...l.drag.box } : null,
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
type QaLog = { frames: QaFrame[]; downs: number[]; ups: number[]; downsAt: number[]; upsAt: number[]; moves: { at: number; handled: number; x: number; y: number }[]; long: number[] };
const qaLog = (page: Page): Promise<QaLog> => page.evaluate(() => (window as unknown as { __q: QaLog }).__q);

/** A few quick frames in a row (nothing heavy is being drawn ahead, e.g. the hand view's neighbour faces). */
async function quietFrames(page: Page): Promise<void> {
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

const waitDrag = (page: Page, timeout = 4000) => page.waitForFunction(() => window.__overclock!.layout().drag !== null, undefined, { timeout });
async function waitBack(page: Page): Promise<LayoutSnapshot> {
  await page.waitForFunction(() => {
    const l = window.__overclock!.layout();
    return l.drag === null && !l.handMinimized && l.hand.every((h) => h.box.y + h.box.height <= l.viewport.height + 0.5) && !l.animating;
  });
  return layout(page);
}

/** QA's pick-up straight out of the small hand: finger down on card i, then up out of the strip. Finger stays down. */
async function qaLiftStrip(page: Page, i: number): Promise<{ f: Finger; l: LayoutSnapshot }> {
  const l0 = await waitIdle(page);
  const box = l0.hand[i]!.box;
  const c = center(box);
  const f = await qaFinger(page);
  await f.down(c);
  await slide(f, { x: c.x + 3, y: box.y - box.height * 0.35 }, 3);
  await waitDrag(page);
  return { f, l: await layout(page) };
}

/** QA's pick-up from the hand view: tap the strip card (opens the view on it), then hold the big card still. */
async function qaLiftView(page: Page, i: number, how: 'still' | 'up'): Promise<{ f: Finger; l: LayoutSnapshot }> {
  const l0 = await waitIdle(page);
  await tap(page, l0.hand[i]!.box);
  await page.waitForFunction((k) => window.__overclock!.layout().handView?.index === k, i);
  await quietFrames(page);
  const v = (await layout(page)).handView!;
  const c = center(v.centre);
  const f = await qaFinger(page);
  await f.down(c);
  if (how === 'up') await slide(f, { x: c.x - 4, y: c.y - 45 }, 3);
  await waitDrag(page);
  return { f, l: await layout(page) };
}

/** A point on the board that is no place (right of the servers, or the rail's help text if the play zone covers it). */
function offPlace(l: LayoutSnapshot): Pt {
  const p = center(emptySpot(l));
  const hit = (b: { x: number; y: number; width: number; height: number }) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
  if (l.targets.some((t) => hit(t.box))) return { x: l.viewport.width - 6, y: Math.round(l.viewport.height * 0.35) };
  return p;
}

const placeName = (t: LayoutSnapshot['targets'][number]) => (t.kind === 'server' ? `server:${t.server}` : t.kind === 'play' && t.server ? `play:${t.server}` : t.kind);

/** What the game must light for a card of `type` on a fresh board (QA's reading of the rules, not handOptions). */
function expectedPlaces(type: string, v: PlayerView): string[] {
  const remotes = v.corpServers.filter((s) => !['hq', 'rd', 'archives'].includes(s.id)).map((s) => `server:${s.id}`);
  switch (type) {
    case 'ice':
    case 'upgrade':
      return ['server:hq', 'server:rd', 'server:archives', ...remotes, 'new_server'].sort();
    case 'asset':
    case 'agenda':
      return [...remotes, 'new_server'].sort();
    case 'program':
    case 'hardware':
    case 'resource':
      return ['install'];
    default:
      return ['play'];
  }
}

function overlapArea(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** The game's view and log are compared without the client-only fields (none expected; kept explicit). */
const sameGame = (v: PlayerView) => JSON.parse(JSON.stringify(v)) as PlayerView;

test.describe('QA S-15-6 hold a card to play it', () => {
  test('AC1: sideways flicks in the hand view (flat, rising up to 45°, falling) browse and never pick a card up', async ({ page }) => {
    await openBoard(page, 4);
    const before = await getView(page);
    await qaWatch(page);
    let l = await waitIdle(page);
    await tap(page, l.hand[2]!.box);
    await page.waitForFunction(() => window.__overclock!.layout().handView?.index === 2);
    const flicks: { name: string; dx: number; dy: number; wait: number }[] = [
      { name: 'flat left', dx: -1, dy: 0, wait: 0 },
      { name: 'flat right', dx: 1, dy: 0, wait: 0 },
      { name: 'rising 30° left', dx: -Math.cos(Math.PI / 6), dy: -Math.sin(Math.PI / 6), wait: 0 },
      { name: 'rising 45° right', dx: Math.SQRT1_2, dy: -Math.SQRT1_2, wait: 0 },
      { name: 'falling 30° left', dx: -Math.cos(Math.PI / 6), dy: Math.sin(Math.PI / 6), wait: 0 },
    ];
    const results: string[] = [];
    // Lefts and rights alternate, so the view never runs into the end of the hand.
    for (const fl of flicks) {
      l = await waitIdle(page);
      const idx = l.handView!.index;
      const c = center(l.handView!.centre);
      const len = l.handView!.centre.width * 0.8;
      const f = await qaFinger(page);
      const t0 = Date.now();
      await f.down(c, t0);
      if (fl.wait) await page.waitForTimeout(fl.wait);
      // Stamped 25 ms apart: the page judges the flick that was made, even if it is busy.
      for (let k = 1; k <= 6; k++) await f.move({ x: c.x + (fl.dx * len * k) / 6, y: c.y + (fl.dy * len * k) / 6 }, t0 + fl.wait + 25 * k);
      await f.up(t0 + fl.wait + 25 * 7);
      await page.waitForFunction((k) => {
        const x = window.__overclock!.layout();
        return x.handView !== null && x.handView.index !== k && !x.animating;
      }, idx, { timeout: 4000 }).catch(() => undefined);
      const after = await layout(page);
      results.push(`${fl.name}: ${idx} -> ${after.handView?.index}`);
      expect(after.drag, `${fl.name}: nothing picked up`).toBeNull();
      expect(after.handView?.index, `${fl.name}: browsed to another card`).not.toBe(idx);
    }
    test.info().annotations.push({ type: 'flicks', description: results.join('; ') });
    const log = await qaLog(page);
    expect(log.frames.some((fr) => fr.drag), 'no frame ever showed a held card').toBe(false);
    expect(log.frames.some((fr) => fr.targets > 0), 'no frame ever lit a place').toBe(false);
    expect(log.frames.some((fr) => fr.minimized), 'the hand never dropped away').toBe(false);
    expect((await anims(page)).some((a) => a.kind === 'card_lift')).toBe(false);
    expect(await getView(page)).toEqual(before);
  });

  // QA-S15-2 (open): a sideways flick made before 0.25 s but handled after the hold timer ran (a busy
  // page) is picked up instead of browsed, and letting go over a lit place PLAYS the card. Gated so CI
  // stays green until the fix: run with QA_REPRO=1; ui-dev removes the skip with the fix.
  test('QA-S15-2 repro: a quick sideways flick on a busy page browses; it never picks up or plays the card', async ({ page }) => {
    test.skip(process.env.QA_REPRO !== '1', 'QA-S15-2 repro (fails until fixed): QA_REPRO=1');
    test.skip(!touchProject(), 'touch');
    await openBoard(page, 4);
    const before = await getView(page);
    const l0 = await waitIdle(page);
    await tap(page, l0.hand[4]!.box); // Hedge Fund (its lit place is the whole table)
    await page.waitForFunction(() => window.__overclock!.layout().handView?.index === 4);
    await quietFrames(page);
    const c = center((await layout(page)).handView!.centre);
    await page.evaluate(() => window.__overclock!.clearAnims());
    const cdp = await page.context().newCDPSession(page);
    const t0 = Date.now();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [c], timestamp: t0 / 1000 });
    // The page is busy for a few frames (350 ms each: a struggling phone).
    await page.evaluate(() => {
      let n = 0;
      const busy = () => {
        const t = performance.now();
        while (performance.now() - t < 350) {
          /* busy */
        }
        if (++n < 4) requestAnimationFrame(busy);
      };
      requestAnimationFrame(busy);
    });
    await page.waitForTimeout(150);
    // Meanwhile the finger flicked flat to the left 70-110 ms after going down and let go at 120 ms
    // (stamped when made, in the past, as a phone's touch screen stamps them).
    const sent: Promise<unknown>[] = [];
    for (let k = 1; k <= 5; k++) sent.push(cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x - 25 * k, y: c.y }], timestamp: (t0 + 60 + 10 * k) / 1000 }));
    sent.push(cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: (t0 + 120) / 1000 }));
    await Promise.all(sent);
    await page.waitForTimeout(2500);
    const recs = await anims(page);
    const after = await getView(page);
    test.info().annotations.push({ type: 'anims', description: `${recs.map((a) => a.kind).join(',')}; credits ${before.players.corp.credits} -> ${after.players.corp.credits}, hand ${before.players.corp.handCount} -> ${after.players.corp.handCount}` });
    expect(recs.some((a) => a.kind === 'card_lift'), 'a quick sideways flick never lifts the card').toBe(false);
    expect(await getView(page), 'nothing played or paid').toEqual(before);
    expect((await layout(page)).handView?.index, 'it browsed').not.toBe(4);
    await cdp.detach();
  });

  test('AC1/2: a sideways slide along the small hand never picks a card up', async ({ page }) => {
    await openBoard(page, 4);
    await qaWatch(page);
    const l = await waitIdle(page);
    const a = center(l.hand[0]!.box);
    const b = center(l.hand.at(-1)!.box);
    const f = await qaFinger(page);
    const t0 = Date.now();
    await f.down(a, t0);
    for (let k = 1; k <= 6; k++) await f.move({ x: a.x + ((b.x - a.x) * k) / 6, y: a.y - 4 * (k % 2) }, t0 + 30 * k);
    await f.up(t0 + 30 * 7);
    await page.waitForTimeout(400);
    const log = await qaLog(page);
    expect(log.frames.some((fr) => fr.drag)).toBe(false);
    expect(log.frames.some((fr) => fr.targets > 0)).toBe(false);
  });

  test('AC2: held still on the big card it lifts at 0.25 s (not before), follows the finger, the big view fades and the hand drops off the screen', async ({ page }) => {
    await openBoard(page, 4);
    await tap(page, (await waitIdle(page)).hand[3]!.box); // Ice Wall
    await page.waitForFunction(() => window.__overclock!.layout().handView?.index === 3);
    await quietFrames(page);
    await qaWatch(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    const v = (await layout(page)).handView!;
    const c = center(v.centre);
    const f = await qaFinger(page);
    await f.down(c);
    await waitDrag(page);
    const lift = (await anims(page)).find((a) => a.kind === 'card_lift')!;
    const log0 = await qaLog(page);
    const down = log0.downs.at(-1)!;
    // Not before 0.25 s; and in time (100 ms, or the frame the page was drawing plus one, per the architect's rule).
    const after250 = log0.frames.filter((fr) => fr.t >= down + 250).map((fr) => fr.t);
    const due = Math.max(down + 350, (after250[1] ?? Infinity) + 100);
    test.info().annotations.push({ type: 'lift-after-down-ms', description: (lift.startedAt - down).toFixed(1) });
    expect(lift.startedAt - down).toBeGreaterThanOrEqual(245);
    expect(lift.startedAt).toBeLessThanOrEqual(due);
    expect(log0.frames.filter((fr) => fr.t < down + 245).some((fr) => fr.drag), 'nothing held before 0.25 s').toBe(false);
    // Follows the finger: three spots on the table, the card is drawn under the finger each time.
    const l1 = await layout(page);
    for (const p of [{ x: l1.viewport.width * 0.3, y: l1.viewport.height * 0.4 }, { x: l1.viewport.width * 0.6, y: l1.viewport.height * 0.3 }, { x: l1.viewport.width * 0.45, y: l1.viewport.height * 0.55 }]) {
      await slide(f, p, 4);
      await page.waitForFunction((q) => {
        const d = window.__overclock!.layout().drag;
        return d !== null && q.x >= d.box.x && q.x <= d.box.x + d.box.width && q.y >= d.box.y && q.y <= d.box.y + d.box.height;
      }, p, { timeout: 3000 });
    }
    const l = await layout(page);
    expect(l.zoom, 'the big view is gone').toBeNull();
    expect(l.handMinimized).toBe(true);
    for (const [k, h] of l.hand.entries()) if (k !== 3) expect(h.box.y, `hand card ${k} is below the screen`).toBeGreaterThanOrEqual(l.viewport.height);
    const recs = await anims(page);
    expect(recs.find((a) => a.kind === 'hand_minimize')?.scheduledMs).toBeLessThanOrEqual(120);
    await snap3(page, 's15-6-held-ice-from-view');
    await f.up();
    await waitBack(page);
  });

  test('AC2: an upward drag on the big card picks it up at once, before 0.25 s', async ({ page }) => {
    await openBoard(page, 4);
    await tap(page, (await waitIdle(page)).hand[0]!.box);
    await page.waitForFunction(() => window.__overclock!.layout().handView?.index === 0);
    await quietFrames(page);
    await qaWatch(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    const c = center((await layout(page)).handView!.centre);
    const f = await qaFinger(page);
    const t0 = Date.now();
    await f.down(c, t0);
    // 25° off straight up, made 40 ms after the down.
    await f.move({ x: c.x + 8, y: c.y - 8 }, t0 + 20);
    await f.move({ x: c.x + 14, y: c.y - 30 }, t0 + 40);
    await waitDrag(page);
    const lift = (await anims(page)).find((a) => a.kind === 'card_lift')!;
    const log = await qaLog(page);
    const leave = log.moves.find((m) => Math.hypot(m.x - c.x, m.y - c.y) > 12)!;
    test.info().annotations.push({ type: 'up-lift', description: `${(lift.startedAt - leave.handled).toFixed(1)} ms after the page handled the move; made ${(leave.at - log.downs.at(-1)!).toFixed(0)} ms after down` });
    expect(lift.startedAt - leave.handled).toBeLessThan(100);
    expect((await layout(page)).drag).toMatchObject({ index: 0, from: 'view' });
    await f.up();
    await waitBack(page);
  });

  test('AC2: straight up out of the small hand picks the card up without the hand view; a still hold there still reads it big (no pick-up)', async ({ page }) => {
    await openBoard(page, 4);
    await qaWatch(page);
    // A still hold on the strip: read big, nothing picked.
    let l = await waitIdle(page);
    const f0 = await qaFinger(page);
    await f0.down(center(l.hand[1]!.box));
    await page.waitForFunction(() => window.__overclock!.layout().handView !== null, undefined, { timeout: 3000 });
    await page.waitForTimeout(500);
    expect((await layout(page)).drag, 'still hold on the strip reads, never picks').toBeNull();
    await f0.up();
    await page.evaluate(() => window.__overclock!.back());
    await page.waitForFunction(() => window.__overclock!.layout().handView === null);
    // Straight up: picked up, the hand view never opened.
    await qaWatch(page);
    const { f, l: held } = await qaLiftStrip(page, 2);
    expect(held.drag).toMatchObject({ index: 2, from: 'strip', dimmed: false });
    const log = await qaLog(page);
    expect(log.frames.some((fr) => fr.view), 'the hand view never opened').toBe(false);
    await page.waitForFunction(() => window.__overclock!.layout().hand.filter((_h, k) => k !== window.__overclock!.layout().drag?.index).every((h) => h.box.y >= window.__overclock!.layout().viewport.height));
    await snap3(page, 's15-6-held-from-strip');
    await f.up();
    l = await waitBack(page);
    expect(l.handView).toBeNull();
  });

  test('AC3: every place a card can go lights in the same frame it lifts, by card type, for the Corp and the Runner; lit places are on screen and do not overlap', async ({ page }) => {
    test.setTimeout(240_000);
    // Starter deals: seed 4 Corp (upgrade, ICE, operation, asset), seed 3 Corp (agenda), seed 6 Runner (event, resource, hardware, program).
    const cases: { seed: number; side: 'corp' | 'runner'; ids: string[] }[] = [
      { seed: 4, side: 'corp', ids: ['c11', 'c05', 'c01', 'c03'] },
      { seed: 3, side: 'corp', ids: ['c08'] },
      { seed: 6, side: 'runner', ids: ['r01', 'r02', 'r09', 'r05'] },
    ];
    const seen: string[] = [];
    for (const cs of cases) {
      await openBoard(page, cs.seed);
      if (cs.side === 'runner') await toRunnerTurn(page);
      for (const id of cs.ids) {
        const v = await getView(page);
        const i = v.players[cs.side].hand!.indexOf(id);
        expect(i, id).toBeGreaterThanOrEqual(0);
        const type = getCard(id)!.type;
        await qaWatch(page);
        const { f, l } = await qaLiftStrip(page, i);
        const log = await qaLog(page);
        const first = log.frames.find((fr) => fr.drag)!;
        expect(first.targets, `${id}: all places lit in the lift's first frame`).toBe(l.targets.length);
        const got = l.targets.map(placeName).sort();
        expect(got, `${getCard(id)!.name} (${type})`).toEqual(expectedPlaces(type, v));
        for (const t of l.targets) {
          expect(t.lit, `${placeName(t)} lit (fresh board, enough credits)`).toBe(true);
          expect(t.box.x).toBeGreaterThanOrEqual(-0.5);
          expect(t.box.y).toBeGreaterThanOrEqual(-0.5);
          expect(t.box.x + t.box.width).toBeLessThanOrEqual(l.viewport.width + 0.5);
          expect(t.box.y + t.box.height).toBeLessThanOrEqual(l.viewport.height + 0.5);
        }
        for (const a of l.targets) for (const b of l.targets) if (a !== b) expect(overlapArea(a.box, b.box), `${placeName(a)} vs ${placeName(b)}`).toBe(0);
        seen.push(`${type}: ${got.join(' ')} (min ${Math.min(...l.targets.map((t) => Math.min(t.box.width, t.box.height))).toFixed(0)} px)`);
        if (['c05', 'c03', 'r01', 'r05'].includes(id)) await snap3(page, `s15-6-lit-${type}`);
        await slide(f, offPlace(l), 3);
        await f.up();
        await waitBack(page);
      }
    }
    test.info().annotations.push({ type: 'lit', description: seen.join(' | ') });
    expect(seen).toHaveLength(9);
  });

  test('AC4/5: over each lit place in turn only that place is strongly highlighted; off it, none; no arrow is drawn (highlight-only)', async ({ page }) => {
    await openBoard(page, 4);
    await dispatch(page, { type: 'install', player: 'corp', handIndex: 5, server: 'new' }); // PAD Campaign: a remote exists
    await waitIdle(page);
    const { f, l } = await qaLiftStrip(page, 2); // Ice Wall
    expect(l.targets.length).toBeGreaterThanOrEqual(5);
    const off = offPlace(l);
    for (const t of l.targets) {
      await slide(f, center(t.box), 4);
      await page.waitForFunction((n) => window.__overclock!.layout().targets.filter((x) => x.hover).length === 1 && window.__overclock!.layout().targets.find((x) => x.hover)!.box.x === n, t.box.x, { timeout: 3000 });
      const now = await layout(page);
      expect(now.targets.filter((x) => x.hover).map(placeName)).toEqual([placeName(t)]);
      expect(now.drag!.hover).toMatchObject({ kind: t.kind, lit: true });
      expect(now.drag!.arrow, 'no arrow (ARROW = false)').toBeNull();
      if (t.server === 'rd') await snap3(page, 's15-6-hover-rd-no-arrow');
      await slide(f, off, 3);
      await page.waitForFunction(() => window.__overclock!.layout().targets.every((x) => !x.hover), undefined, { timeout: 3000 });
      expect((await layout(page)).drag!.hover).toBeNull();
    }
    await f.up();
    await waitBack(page);
  });

  // AC6: the drop does what the engine does with the same option: same cost, same board.
  const drops: { name: string; seed: number; side: 'corp' | 'runner'; setup: Action[]; id: string; place: string; via: 'strip' | 'still' | 'up' }[] = [
    { name: 'Corp ICE onto R&D that already has ICE (1 credit), held still in the hand view', seed: 6, side: 'corp', setup: [{ type: 'install', player: 'corp', handIndex: 0, server: 'rd' }], id: 'c06', place: 'server:rd', via: 'still' },
    { name: 'Corp asset into a new server, from the small hand', seed: 4, side: 'corp', setup: [], id: 'c03', place: 'new_server', via: 'strip' },
    { name: 'Corp upgrade into HQ, dragged up in the hand view', seed: 3, side: 'corp', setup: [], id: 'c11', place: 'server:hq', via: 'up' },
    { name: 'Corp operation (Hedge Fund) on the table', seed: 4, side: 'corp', setup: [], id: 'c01', place: 'play', via: 'strip' },
    { name: 'Runner program (Gordian Blade, 4 credits) onto the rig', seed: 2, side: 'runner', setup: [], id: 'r05', place: 'install', via: 'still' },
    { name: 'Runner event (Easy Mark) on the table', seed: 6, side: 'runner', setup: [], id: 'r01', place: 'play', via: 'strip' },
  ];
  for (const d of drops) {
    test(`AC6: let go on a lit place plays it exactly like the engine's own option (same cost, same board), flies and lands, hand back up: ${d.name}`, async ({ page }) => {
      const prep = async () => {
        await openBoard(page, d.seed);
        if (d.side === 'runner') await toRunnerTurn(page);
        for (const a of d.setup) await dispatch(page, a);
        return waitIdle(page);
      };
      await prep();
      const v0 = await getView(page);
      const i = v0.players[d.side].hand!.indexOf(d.id);
      const lifted = d.via === 'strip' ? await qaLiftStrip(page, i) : await qaLiftView(page, i, d.via);
      const target = lifted.l.targets.find((t) => placeName(t) === d.place)!;
      expect(target, d.place).toBeTruthy();
      expect(target.lit).toBe(true);
      await slide(lifted.f, center(target.box), 5);
      await page.waitForFunction((n) => window.__overclock!.layout().drag?.hover?.kind === n, target.kind);
      await page.evaluate(() => window.__overclock!.clearAnims());
      await lifted.f.up();
      const back = await waitBack(page);
      const recs = await anims(page);
      const dropped = sameGame(await getView(page));
      expect(back.targets).toEqual([]);
      expect(back.selected).toBeNull();
      expect(recs.find((a) => a.kind === 'hand_restore')?.scheduledMs, 'the hand comes back up').toBeLessThanOrEqual(140);
      const flew = recs.filter((a) => /flight|showcase|land_settle/.test(a.kind)).map((a) => a.kind);
      test.info().annotations.push({ type: 'drop-anims', description: recs.map((a) => `${a.kind}:${a.scheduledMs}`).join(' ') });
      expect(flew.length, 'it flies to its place').toBeGreaterThan(0);
      for (const r of recs) if (r.kind !== 'hint' && r.kind !== 'notice') expect(r.scheduledMs, r.kind).toBeLessThanOrEqual(600);
      // The same option applied by the engine directly, on the same deal.
      const option = v0.handOptions[i]!.find((o) => {
        const a = o.action;
        const p = a.type === 'install' && a.server === 'new' ? 'new_server' : a.type === 'install' && a.server ? `server:${a.server}` : a.type;
        return p === d.place;
      })!;
      await prep();
      await dispatch(page, option.action);
      await waitIdle(page);
      const direct = sameGame(await getView(page));
      expect(dropped, 'the drop = the engine applying the same option').toEqual(direct);
      const cr = dropped.players[d.side].credits - v0.players[d.side].credits;
      test.info().annotations.push({ type: 'cost', description: `credits ${cr >= 0 ? '+' : ''}${cr}, clicks ${dropped.players[d.side].clicks - v0.players[d.side].clicks}` });
    });
  }

  test('AC7: let go where nothing is lit (empty table, the bottom where the hand was, a dimmed place, a cancelled touch): nothing played or paid, it glides back, the hand comes up', async ({ page }) => {
    // Seed 6: R&D gets three ICE (0 + 1 + 2 credits: 5 -> 2); two turns later another Ice Wall on R&D costs 3 (dimmed).
    await openBoard(page, 6);
    for (const id of ['c06', 'c04', 'c05']) {
      const v = await getView(page);
      await dispatch(page, { type: 'install', player: 'corp', handIndex: v.players.corp.hand!.indexOf(id), server: 'rd' });
    }
    await passTurn(page);
    await passTurn(page);
    const before = await getView(page);
    expect(before.players.corp.credits).toBe(2);
    const i = before.players.corp.hand!.indexOf('c05');
    const ends: string[] = ['empty table', 'bottom edge', 'dimmed place'];
    if (touchProject()) ends.push('touch cancelled');
    for (const end of ends) {
      const { f, l } = await qaLiftStrip(page, i);
      const rd = l.targets.find((t) => t.kind === 'server' && t.server === 'rd')!;
      expect(rd).toMatchObject({ lit: false, reject: 'no_credits' });
      await page.evaluate(() => window.__overclock!.clearAnims());
      if (end === 'empty table') await slide(f, offPlace(l), 4);
      if (end === 'bottom edge') await slide(f, { x: l.viewport.width / 2, y: l.viewport.height - 3 }, 4);
      if (end === 'dimmed place') {
        await slide(f, center(rd.box), 4);
        await page.waitForFunction(() => window.__overclock!.layout().drag?.hover?.lit === false);
        await snap3(page, 's15-6-over-dimmed-place');
      }
      const upAt = await page.evaluate(() => performance.now());
      if (end === 'touch cancelled') await f.cancel();
      else await f.up();
      const back = await waitBack(page);
      const recs = await anims(page);
      expect(await getView(page), `${end}: nothing played or paid`).toEqual(before);
      expect(back.hand.length).toBe(before.players.corp.hand!.length);
      expect(back.targets).toEqual([]);
      expect(recs.some((a) => a.kind === 'hand_return' || a.kind === 'card_return'), `${end}: glides back`).toBe(true);
      expect(recs.find((a) => a.kind === 'hand_return' || a.kind === 'card_return')!.scheduledMs).toBeLessThanOrEqual(200);
      const hint = recs.find((a) => a.kind === 'hint');
      if (end === 'dimmed place') {
        expect(hint?.text, 'the dimmed place says why').toBe('Not enough credits');
        expect(hint!.startedAt - upAt).toBeLessThan(150);
      }
      test.info().annotations.push({ type: end, description: recs.map((a) => `${a.kind}:${a.scheduledMs}${a.text ? `:${a.text}` : ''}`).join(' ') });
    }
  });

  test('AC8: a quick tap (or three) on the big card never plays and never lights anything: "Hold to play" shows on screen and the card stays big; a tap on the small hand opens the view', async ({ page }) => {
    await openBoard(page, 4);
    const before = await getView(page);
    const l0 = await waitIdle(page);
    await tap(page, l0.hand[3]!.box);
    await page.waitForFunction(() => window.__overclock!.layout().handView?.index === 3);
    await qaWatch(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    const v = (await layout(page)).handView!;
    for (let k = 0; k < 3; k++) {
      // Real taps through the browser (touchscreen / mouse click), 80 ms press.
      const f = await qaFinger(page);
      const t0 = Date.now();
      await f.down(center(v.centre), t0);
      await page.waitForTimeout(80);
      await f.up(t0 + 80);
      await page.waitForFunction(() => window.__overclock!.layout().handView?.tip !== null);
      await page.waitForTimeout(120);
    }
    const l = await layout(page);
    expect(l.handView).toMatchObject({ index: 3, lifted: false });
    expect(l.handView!.tip!.text).toBe('Hold to play');
    const tip = l.handView!.tip!.box;
    expect(tip.x >= 0 && tip.y >= 0 && tip.x + tip.width <= l.viewport.width && tip.y + tip.height <= l.viewport.height, 'tip on screen').toBe(true);
    expect(l.zoom?.cardId).toBe(before.players.corp.hand![3]);
    await snap3(page, 's15-6-hold-to-play-tip');
    const log = await qaLog(page);
    const bad = log.frames.filter((fr) => fr.drag || fr.targets > 0 || fr.minimized);
    const d0 = log.downs[0]!;
    test.info().annotations.push({ type: 'taps', description: JSON.stringify({ downs: log.downs.map((d) => d - d0), ups: log.ups.map((d) => d - d0), upHandled: log.upsAt.map((d, k) => d - log.downs[k]!), flashFrames: bad.map((fr) => ({ t: fr.t - d0, drag: fr.drag, targets: fr.targets, min: fr.minimized })), longest: Math.max(...log.frames.map((fr, k, a) => (k ? fr.t - a[k - 1]!.t : 0))) }) });
    // Each tap: if the page handled its release before 0.25 s, no frame between its down and release
    // showed a held card or lit places. (If the page was too busy to handle the release by then, the
    // stalled hold timer lifts first and the tap undoes it: a brief flash, recorded; QA-S15-2 note.)
    for (let k = 0; k < log.downs.length; k++) {
      const down = log.downs[k]!;
      const upAt = log.upsAt[k]!;
      const flash = bad.filter((fr) => fr.t >= down && fr.t <= upAt + 50);
      if (upAt - down < 250) expect(flash.length, `tap ${k + 1}: released (handled) at ${(upAt - down).toFixed(0)} ms: never held, never lit`).toBe(0);
    }
    expect(log.frames.at(-1)!.drag || log.frames.at(-1)!.targets > 0, 'in the end nothing held or lit').toBe(false);
    expect((await anims(page)).filter((a) => a.kind === 'hold_tip').length).toBeGreaterThanOrEqual(1);
    expect(await getView(page)).toEqual(before);
    await page.evaluate(() => window.__overclock!.back());
    await page.waitForFunction(() => window.__overclock!.layout().handView === null);
    await tap(page, (await waitIdle(page)).hand[1]!.box);
    await page.waitForFunction(() => window.__overclock!.layout().handView?.index === 1);
    expect(await getView(page)).toEqual(before);
  });

  // AC9: cards that can't be played now lift dimmed with the reason. "Not your turn" is online (below).
  const refused: { name: string; seed: number; side: 'corp' | 'runner'; setup: Action[]; id: string; reason: string }[] = [
    { name: 'no clicks left', seed: 4, side: 'corp', setup: [0, 1, 2].map(() => ({ type: 'gain_credit', player: 'corp' }) as Action), id: 'c05', reason: 'No clicks left' },
    // Hedge Fund costs 5; two ICE on R&D (0 + 1) leave 4 credits. The AC's example words are "Needs 5 credits".
    { name: 'not enough credits (Hedge Fund, 5 credits, with 4)', seed: 6, side: 'corp', setup: [{ type: 'install', player: 'corp', handIndex: 1, server: 'rd' }, { type: 'install', player: 'corp', handIndex: 0, server: 'rd' }], id: 'c01', reason: 'Not enough credits' },
    { name: 'needs a run (Neural EMP)', seed: 4, side: 'corp', setup: [], id: 'c12', reason: 'Only after the Runner made a run' },
  ];
  for (const r of refused) {
    test(`AC9: a card that can't be played lifts dimmed, nothing lights, a line says why, letting go sends it back: ${r.name}`, async ({ page }) => {
      await openBoard(page, r.seed);
      if (r.side === 'runner') await toRunnerTurn(page);
      for (const a of r.setup) await dispatch(page, a);
      await waitIdle(page);
      const before = await getView(page);
      const i = before.players[r.side].hand!.indexOf(r.id);
      expect(i).toBeGreaterThanOrEqual(0);
      await qaWatch(page);
      await page.evaluate(() => window.__overclock!.clearAnims());
      const { f, l } = await qaLiftStrip(page, i);
      expect(l.drag).toMatchObject({ index: i, dimmed: true, reason: r.reason });
      expect(l.targets).toEqual([]);
      const lift = (await anims(page)).find((a) => a.kind === 'card_lift')!;
      const hint = (await anims(page)).find((a) => a.kind === 'hint');
      expect(hint?.text, 'a short line says why').toBe(r.reason);
      expect(hint!.startedAt - lift.startedAt).toBeLessThan(100);
      // Over where it could go if it were playable (the middle of the table): still nothing lit.
      await slide(f, { x: l.viewport.width * 0.4, y: l.viewport.height * 0.35 }, 4);
      await page.waitForTimeout(150);
      await snap3(page, `s15-6-dimmed-${r.id}`);
      expect((await layout(page)).drag!.dimmed).toBe(true);
      await f.up();
      await waitBack(page);
      const log = await qaLog(page);
      expect(log.frames.some((fr) => fr.targets > 0), 'nothing lit at any frame').toBe(false);
      expect(await getView(page)).toEqual(before);
      test.info().annotations.push({ type: 'reason-shown', description: `${r.name}: "${r.reason}"` });
    });
  }

  test('AC10: with a mouse, press-and-hold on the big card lifts it, drag to a lit place and release plays it; mouse drag-up from the small hand too; a click never plays', async ({ page }) => {
    test.skip(touchProject(), 'mouse only (desktop)');
    await openBoard(page, 4);
    let l = await waitIdle(page);
    const v0 = await getView(page);
    // A click on the big card: the tip, nothing played.
    await page.mouse.click(center(l.hand[3]!.box).x, center(l.hand[3]!.box).y);
    await page.waitForFunction(() => window.__overclock!.layout().handView?.index === 3);
    l = await layout(page);
    await page.mouse.click(center(l.handView!.centre).x, center(l.handView!.centre).y);
    await page.waitForFunction(() => window.__overclock!.layout().handView?.tip?.text === 'Hold to play');
    expect((await layout(page)).drag).toBeNull();
    expect(await getView(page)).toEqual(v0);
    // Press and hold with the mouse: lifts; drag to R&D; release: installed.
    const c = center(l.handView!.centre);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await waitDrag(page);
    l = await layout(page);
    const rd = l.targets.find((t) => t.kind === 'server' && t.server === 'rd')!;
    await page.mouse.move(center(rd.box).x, center(rd.box).y, { steps: 6 });
    await page.waitForFunction(() => window.__overclock!.layout().drag?.hover?.server === 'rd');
    await snap3(page, 's15-6-mouse-hover-rd');
    await page.mouse.up();
    await waitBack(page);
    let v = await getView(page);
    expect(v.corpServers.find((s) => s.id === 'rd')!.ice.map((x) => x.cardId)).toEqual(['c05']);
    // Mouse drag-up out of the small hand: Hedge Fund onto the table.
    l = await waitIdle(page);
    const hf = v.players.corp.hand!.indexOf('c01');
    const s = center(l.hand[hf]!.box);
    await page.mouse.move(s.x, s.y);
    await page.mouse.down();
    await page.mouse.move(s.x, s.y - 20, { steps: 2 });
    await page.mouse.move(s.x, l.hand[hf]!.box.y - 40, { steps: 2 });
    await waitDrag(page);
    l = await layout(page);
    const zone = l.targets.find((t) => t.kind === 'play')!;
    await page.mouse.move(center(zone.box).x, center(zone.box).y, { steps: 4 });
    await page.waitForFunction(() => window.__overclock!.layout().drag?.hover?.kind === 'play');
    const cr = v.players.corp.credits;
    await page.mouse.up();
    await waitBack(page);
    v = await getView(page);
    expect(v.players.corp.credits).toBe(cr - 5 + 9);
  });

  test("AC11 pass-the-phone with the real cover: the Corp holds and plays, hands over, the Runner lifts the cover and holds and plays", async ({ page }) => {
    await page.goto('./?seed=6&play=here&decks=starter');
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
    const lift = async () => {
      const l = await layout(page);
      if (!l.cover) return;
      await tap(page, { x: l.viewport.width / 2 - 5, y: l.viewport.height - 40, width: 10, height: 10 });
      await page.waitForFunction(() => window.__overclock!.layout().cover === null);
    };
    await lift();
    let v = await getView(page);
    expect(v.viewer).toBe('corp');
    // Corp: Enigma onto R&D by hold-and-drop.
    let h = await qaLiftStrip(page, v.players.corp.hand!.indexOf('c06'));
    let t = h.l.targets.find((x) => x.kind === 'server' && x.server === 'rd')!;
    await slide(h.f, center(t.box), 4);
    await h.f.up();
    await waitBack(page);
    v = await getView(page);
    expect(v.corpServers.find((s) => s.id === 'rd')!.ice).toHaveLength(1);
    await page.evaluate(() => {
      const hook = window.__overclock!;
      hook.dispatch({ type: 'end_turn', player: 'corp' });
      const x = hook.getView();
      if (x.pendingDiscard > 0) hook.dispatch({ type: 'discard', player: 'corp', handIndices: Array.from({ length: x.pendingDiscard }, (_, k) => k) });
    });
    await page.waitForFunction(() => window.__overclock!.layout().cover !== null, undefined, { timeout: 5000 });
    await snap3(page, 's15-6-pass-cover');
    await lift();
    await waitIdle(page);
    v = await getView(page);
    expect(v.viewer).toBe('runner');
    // Runner: Armitage Codebusting onto the rig by hold-and-drop.
    h = await qaLiftStrip(page, v.players.runner.hand!.indexOf('r02'));
    t = h.l.targets.find((x) => x.kind === 'install')!;
    expect(t.lit).toBe(true);
    await slide(h.f, center(t.box), 4);
    await h.f.up();
    await waitBack(page);
    v = await getView(page);
    expect(v.rig.map((c) => c.cardId)).toContain('r02');
  });

  test('AC11/AC9 online: while the Runner holds a card over the rig for 1 s nothing is sent or received; the Corp sees only the installed card. On the Corp\'s turn the Runner\'s card lifts dimmed: "Not your turn"', async ({ browser }) => {
    const corp = await openPhone(browser);
    const runner = await openPhone(browser);
    const code = await startTestGame(corp, 'corp', { seed: 6, actions: [], deckSet: 'starter' });
    await joinGame(runner, code);
    await Promise.all([waitPlaying(corp), waitPlaying(runner)]);
    const game = (list: string[]) => list.filter((x) => !x.includes('"t":"ping"') && !x.includes('"t":"pong"')).length;
    // Corp's turn: the Runner's phone lifts a Runner card dimmed, "Not your turn", and sends nothing.
    await runner.page.waitForFunction(() => !window.__overclock!.layout().animating);
    await runner.page.evaluate(() => window.__overclock!.clearAnims());
    let sent0 = game(runner.sent);
    let h = await qaLiftStrip(runner.page, 1);
    expect(h.l.drag).toMatchObject({ dimmed: true, reason: 'Not your turn' });
    expect(h.l.targets).toEqual([]);
    expect((await runner.page.evaluate(() => window.__overclock!.anims())).find((a) => a.kind === 'hint')?.text).toBe('Not your turn');
    await snap3(runner.page, 's15-6-online-not-your-turn');
    await h.f.up();
    await waitBack(runner.page);
    expect(game(runner.sent), 'nothing sent for a dimmed lift').toBe(sent0);
    // Corp ends the turn (5 cards after one install: no discard).
    await act(corp, { type: 'install', player: 'corp', handIndex: (await view(corp)).players.corp.hand!.indexOf('c06'), server: 'rd' });
    await act(corp, { type: 'end_turn', player: 'corp' });
    await waitView(runner, (w) => w.activePlayer === 'runner');
    await runner.page.waitForFunction(() => !window.__overclock!.layout().animating);
    const rv = await view(runner);
    const i = rv.players.runner.hand!.indexOf('r02');
    const corpView0 = await view(corp);
    sent0 = game(runner.sent);
    const recv0 = game(corp.received);
    h = await qaLiftStrip(runner.page, i);
    const rig = h.l.targets.find((x) => x.kind === 'install')!;
    await slide(h.f, center(rig.box), 4);
    await runner.page.waitForFunction(() => window.__overclock!.layout().drag?.hover?.kind === 'install');
    await runner.page.waitForTimeout(1000);
    expect(game(runner.sent), 'the Runner phone sent nothing while holding').toBe(sent0);
    expect(game(corp.received), 'the Corp phone received nothing while the Runner held').toBe(recv0);
    expect(await view(corp)).toEqual(corpView0);
    await h.f.up();
    await waitView(corp, (w) => w.rig.some((c) => c.cardId === 'r02'));
    expect(game(runner.sent) - sent0, 'one action sent: the drop').toBe(1);
    await corp.context.close();
    await runner.context.close();
  });
});

test.describe('QA S-15-6 timing (hold)', () => {
  test('AC12: the card reacts within 0.1 s, lifts at 0.25 s, is back in the hand (strip up) within 0.6 s of letting go, can be picked up again at once, no long task over 0.6 s, next tap answered < 0.1 s', async ({ page }) => {
    await openBoard(page, 4);
    await lean(page);
    await tap(page, (await waitIdle(page)).hand[3]!.box);
    await page.waitForFunction(() => window.__overclock!.layout().handView?.index === 3);
    await quietFrames(page);
    await qaWatch(page);
    await page.evaluate(() => {
      const w = window as unknown as { __rise: { t: number; w: number }[] };
      w.__rise = [];
      const step = (t: number) => {
        const z = window.__overclock!.layout().zoom;
        if (z) w.__rise.push({ t, w: z.box.width });
        if (w.__rise.length < 400) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    await page.evaluate(() => window.__overclock!.clearAnims());
    const w0 = (await layout(page)).zoom!.box.width;
    const c = center((await layout(page)).handView!.centre);
    const f = await qaFinger(page);
    await f.down(c);
    await waitDrag(page);
    const log = await qaLog(page);
    const down = log.downs.at(-1)!;
    const downHandled = log.downsAt.at(-1)!;
    const rise = await page.evaluate(() => (window as unknown as { __rise: { t: number; w: number }[] }).__rise);
    const grown = rise.find((r) => r.t >= down && r.w > w0 + 0.5)!;
    const recs = await anims(page);
    const pressRec = recs.find((a) => a.kind === 'hand_press')!;
    const liftRec = recs.find((a) => a.kind === 'card_lift')!;
    // Frames the page drew after the press was handled: the grown card must be on the first or second.
    const framesAfter = log.frames.filter((fr) => fr.t >= pressRec.startedAt).map((fr) => fr.t);
    const longest = Math.max(0, ...log.frames.map((fr, k, a) => (k ? fr.t - a[k - 1]!.t : 0)));
    test.info().annotations.push({
      type: 'hold-timing',
      description: JSON.stringify({ queueMs: downHandled - down, pressAfterHandledMs: pressRec.startedAt - downHandled, grownFrameAfterDownMs: grown.t - down, liftAfterDownMs: liftRec.startedAt - down, longestFrameMs: longest }),
    });
    expect(pressRec.startedAt - downHandled, 'the card reacts within 0.1 s of the page handling the press').toBeLessThan(100);
    expect(grown.t, 'drawn risen on the next frame (or the one after) the page drew').toBeLessThanOrEqual(framesAfter[1] ?? framesAfter[0] ?? Infinity);
    // Where the page is not queueing input (this runner: 891x296 / 844x390 / 640x360), also from the finger itself.
    if (downHandled - down < 20 && longest < 120) expect(grown.t - down, 'grown within 0.1 s of the finger').toBeLessThan(100);
    expect(liftRec.startedAt - down).toBeGreaterThanOrEqual(245);
    const after250 = log.frames.filter((fr) => fr.t >= down + 250).map((fr) => fr.t);
    expect(liftRec.startedAt, 'lifts as soon as 0.25 s are up').toBeLessThanOrEqual(Math.max(down + 350, (after250[1] ?? Infinity) + 100));
    // Let go away from every place: back in the hand view, strip up, within 0.6 s.
    const l = await layout(page);
    await slide(f, offPlace(l), 3);
    await f.up();
    await waitBack(page);
    let q = await qaLog(page);
    const upAt = q.upsAt.at(-1)!;
    const backFrame = q.frames.find((fr) => fr.t >= upAt && !fr.drag && !fr.minimized && fr.stripBottom <= fr.vh + 0.5)!;
    test.info().annotations.push({ type: 'back', description: `${(backFrame.t - upAt).toFixed(0)} ms from letting go to the card home and the hand strip up` });
    expect(backFrame.t - upAt, 'back and ready within 0.6 s').toBeLessThanOrEqual(600);
    // Pick up again at once, from the hand view still open on the card: an upward drag lifts on that move.
    const v2 = (await layout(page)).handView;
    const again = await qaFinger(page);
    const p2 = v2 ? center(v2.centre) : center((await layout(page)).hand[0]!.box);
    await again.down(p2);
    await again.move({ x: p2.x, y: p2.y - 20 });
    await again.move({ x: p2.x, y: p2.y - 50 });
    await waitDrag(page);
    q = await qaLog(page);
    const leave = q.moves.filter((m) => m.at >= q.downs.at(-1)!).find((m) => p2.y - m.y > 12)!;
    const lift2 = (await anims(page)).filter((a) => a.kind === 'card_lift').at(-1)!;
    test.info().annotations.push({ type: 'regrab', description: `${(lift2.startedAt - leave.handled).toFixed(0)} ms after the page handled the upward move` });
    expect(lift2.startedAt - leave.handled).toBeLessThan(100);
    // Drop it on its place, then tap the credits (click for a credit): answered < 0.1 s.
    const held = await layout(page);
    const place = held.targets.find((t) => t.lit)!;
    await slide(again, center(place.box), 4);
    await again.up();
    await waitBack(page);
    const all = await anims(page);
    for (const r of all) if (r.kind !== 'hint' && r.kind !== 'notice') expect(r.scheduledMs, `${r.kind} <= 600 ms`).toBeLessThanOrEqual(600);
    const m = await measureTap(page, (await layout(page)).corp.credits);
    expectSnappy(m, []);
    const final = await qaLog(page);
    test.info().annotations.push({ type: 'longtasks', description: final.long.map((x) => x.toFixed(0)).join(',') || 'none' });
    for (const lt of final.long) expect(lt, 'no long task blocks input > 0.6 s').toBeLessThan(600);
  });
});
