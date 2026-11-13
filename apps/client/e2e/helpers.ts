import { type CDPSession, type Page, expect, test } from '@playwright/test';
import type { Action, GameEvent, PlayerView } from '@overclock/engine';
import { getCard } from '@overclock/cards';
import { type StepGoal, type StepPlan, planBusyBoard, planToStep } from '@overclock/match/testing';
import type { AnimRecord, Box, EndTurnClock, InputStamp, Insets, LayoutSnapshot, TargetSnapshot } from '../src/hook-types';

export type { AnimRecord, Box, EndTurnClock, InputStamp, Insets, LayoutSnapshot, TargetSnapshot };

/**
 * `E2E_CPU_THROTTLE=6` slows the page's CPU 6x (Chrome DevTools
 * `Emulation.setCPUThrottlingRate`) to prove the timing tests hold on a slow
 * runner. Applied to every page `openBoard` opens.
 */
const CPU_THROTTLE = Number(process.env.E2E_CPU_THROTTLE ?? '1');

async function throttle(page: Page): Promise<void> {
  if (!(CPU_THROTTLE > 1)) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
}

export interface OpenOptions {
  seed?: number;
  /** Simulated notch / gesture bar: overrides #safe-probe's env() padding. */
  insets?: Partial<Insets>;
}

/** Opens the board with a fixed deal and waits until the test hook is live. */
export async function openBoard(page: Page, opts: OpenOptions | number = {}): Promise<void> {
  const o = typeof opts === 'number' ? { seed: opts } : opts;
  if (o.insets) {
    const i = { top: 0, right: 0, bottom: 0, left: 0, ...o.insets };
    // Same read path as a real notched phone: only the probe's padding changes.
    await page.addInitScript((css) => {
      document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.textContent = css;
        document.head.appendChild(s);
      });
    }, `#safe-probe { padding: ${i.top}px ${i.right}px ${i.bottom}px ${i.left}px !important; }`);
  }
  await throttle(page);
  await page.goto(`./?seed=${o.seed ?? 1}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
}

export function layout(page: Page): Promise<LayoutSnapshot> {
  return page.evaluate(() => window.__overclock!.layout());
}

export function getView(page: Page): Promise<PlayerView> {
  return page.evaluate(() => window.__overclock!.getView());
}

export function lastEvents(page: Page): Promise<GameEvent[]> {
  return page.evaluate(() => window.__overclock!.lastEvents());
}

export function dispatch(page: Page, action: Action): Promise<GameEvent[]> {
  return page.evaluate((a) => window.__overclock!.dispatch(a), action);
}

export function anims(page: Page): Promise<AnimRecord[]> {
  return page.evaluate(() => window.__overclock!.anims());
}

export async function waitIdle(page: Page): Promise<LayoutSnapshot> {
  await page.waitForFunction(() => !window.__overclock!.layout().animating, undefined, { polling: 'raf' });
  return layout(page);
}

/**
 * Plays through the hook to the start of the Runner's first turn (Corp
 * discards its 6th card). Leaves the board idle.
 */
export async function toRunnerTurn(page: Page): Promise<void> {
  await dispatch(page, { type: 'end_turn', player: 'corp' });
  await dispatch(page, { type: 'discard', player: 'corp', handIndices: [5] });
  await waitIdle(page);
  expect((await getView(page)).activePlayer).toBe('runner');
}

/** End turn ignores taps briefly after the tap that ended the last turn (double-tap guard). */
export async function waitEndTurnArmed(page: Page): Promise<void> {
  await page.waitForTimeout(350);
}

export function center(b: Box): { x: number; y: number } {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Touch input when the Playwright project emulates a touch screen (phones), else the mouse. */
function isTouch(): boolean {
  return test.info().project.use.hasTouch === true;
}

/** A real tap: touchscreen on the phone projects, mouse click on desktop. */
export async function tap(page: Page, b: Box): Promise<void> {
  const { x, y } = center(b);
  if (isTouch()) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

const cdpSessions = new WeakMap<Page, Promise<CDPSession>>();

/**
 * A real tap through the browser's input pipeline (touch on the phone projects,
 * mouse on desktop), sent at once: the browser stamps it now even if the page is
 * busy, and the page handles it whenever it can. The promise settles once the
 * page has handled it. Used to tap "during" slow frames, which page timers can't.
 * `touch` overrides the project's input kind (touch needs a context with hasTouch).
 *
 * `madeAt` (wall clock, ms since the epoch, i.e. a `Date.now()` value) stamps the
 * tap as made at that moment: Chrome uses a CDP input event's `timestamp` as the
 * DOM `event.timeStamp` (verified for touch and mouse, also while the page is busy;
 * see DECISIONS 2026-11-12 S-03-6). Only pass a moment that has already passed.
 */
export function sendTap(page: Page, b: Box, opts: { touch?: boolean; madeAt?: number } = {}): Promise<void> {
  const { x, y } = center(b);
  let cdp = cdpSessions.get(page);
  if (!cdp) {
    cdp = page.context().newCDPSession(page);
    cdpSessions.set(page, cdp);
  }
  const touch = opts.touch ?? isTouch();
  const stamp = opts.madeAt === undefined ? {} : { timestamp: opts.madeAt / 1000 };
  return cdp.then(async (s) => {
    const sent = touch
      ? [
          s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }], ...stamp }),
          s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], ...stamp }),
        ]
      : [
          s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, ...stamp }),
          s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, ...stamp }),
        ];
    await Promise.all(sent);
  });
}

export function endTurnClock(page: Page): Promise<EndTurnClock> {
  return page.evaluate(() => window.__overclock!.endTurn());
}

/** What the page saw at the release of a measured tap. */
export interface TapMeasure {
  /** pointerup event timestamp (includes any input queueing delay). */
  tapAt: number;
  /** When the game's input handler started on this release (budgets count from here). */
  handledAt: number;
  /** When the game state was read, right after the game handled the release. */
  stateAt: number;
  /** The End turn clock right after the tap. */
  clock: EndTurnClock;
  /** The bottom seat's view at that moment. */
  view: PlayerView;
  events: GameEvent[];
  /** Animation records started by this tap. */
  anims: AnimRecord[];
}

/**
 * Taps `b` and captures the game state inside the same pointerup dispatch:
 * a bubble-phase window listener runs after the game's capture-phase
 * handler, so it sees exactly what the tap did, timed on the page's clock.
 */
export async function measureTap(page: Page, b: Box): Promise<TapMeasure> {
  await page.evaluate(() => {
    const w = window as unknown as { __m?: unknown };
    w.__m = undefined;
    window.__overclock!.clearAnims();
    window.addEventListener(
      'pointerup',
      (e) => {
        const hook = window.__overclock!;
        const stateAt = performance.now();
        const input = hook.lastInput();
        w.__m = {
          tapAt: e.timeStamp,
          // NaN: this release never reached a game target (fails expectSnappy).
          handledAt: input && input.eventAt === e.timeStamp ? input.handledAt : NaN,
          stateAt,
          clock: hook.endTurn(),
          view: hook.getView(),
          events: hook.lastEvents(),
        };
      },
      { once: true },
    );
  });
  await tap(page, b);
  await page.waitForFunction(() => (window as unknown as { __m?: unknown }).__m !== undefined);
  const m = await page.evaluate(() => (window as unknown as { __m: Omit<TapMeasure, 'anims'> }).__m);
  return { ...m, anims: await anims(page) };
}

/**
 * The snappiness budget for one tap: state changed < 100ms after the game
 * started handling the release (`handledAt`), every animation it caused
 * started < 100ms after that and is scheduled for <= 600ms. The browser's
 * input-queue delay (`handledAt - tapAt`: the page was busy drawing a frame
 * when the release came in) and wall-clock landing are annotations only
 * (GPU-less CI runners add render latency that is not the game's budget).
 */
export function expectSnappy(m: TapMeasure, kinds: AnimRecord['kind'][]): void {
  test.info().annotations.push({
    type: 'timing',
    description: JSON.stringify({
      queueMs: m.handledAt - m.tapAt,
      stateMs: m.stateAt - m.handledAt,
      anims: m.anims.map((a) => ({ kind: a.kind, startMs: a.startedAt - m.handledAt, scheduledMs: a.scheduledMs })),
    }),
  });
  expect(Number.isFinite(m.handledAt), 'the tap reached a game target').toBe(true);
  expect(m.stateAt - m.handledAt, 'state updated within 100ms of the tap').toBeLessThan(100);
  for (const kind of kinds) {
    const recs = m.anims.filter((a) => a.kind === kind);
    expect(recs.length, `${kind} animation started`).toBeGreaterThan(0);
    for (const r of recs) {
      expect(r.startedAt - m.handledAt, `${kind} started within 100ms of the tap`).toBeLessThan(100);
      expect(r.scheduledMs, `${kind} scheduled within the 600ms budget`).toBeLessThanOrEqual(600);
    }
  }
}

/**
 * Presses and holds on a box. Returns a function that releases it.
 * Phone uses raw touch events (CDP) so it exercises the real touch path.
 */
export async function pressAndHold(page: Page, b: Box): Promise<() => Promise<void>> {
  const { x, y } = center(b);
  if (isTouch()) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    return async () => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    };
  }
  await page.mouse.move(x, y);
  await page.mouse.down();
  return async () => {
    await page.mouse.up();
  };
}

export function inside(b: Box, r: Box): boolean {
  const eps = 0.5;
  return b.width > 0 && b.height > 0 && b.x >= r.x - eps && b.y >= r.y - eps && b.x + b.width <= r.x + r.width + eps && b.y + b.height <= r.y + r.height + eps;
}

export function overlaps(a: Box, b: Box): boolean {
  const eps = 0.5;
  return a.x + eps < b.x + b.width && b.x + eps < a.x + a.width && a.y + eps < b.y + b.height && b.y + eps < a.y + a.height;
}

/** The safe rect (viewport minus notch / gesture-bar insets). */
export function safeRect(l: LayoutSnapshot): Box {
  const i = l.safeArea;
  return { x: i.left, y: i.top, width: l.viewport.width - i.left - i.right, height: l.viewport.height - i.top - i.bottom };
}

/** Name tag of a fanned server's installed cards: those may overlap each other only. */
const FANNED = 'fanned ';

/** Both boxes are installed cards of the same fanned server. */
function sameFan(a: string, b: string): boolean {
  const fan = (n: string) => (n.includes(` ${FANNED}card `) ? n.slice(0, n.lastIndexOf(' card ')) : null);
  const fa = fan(a);
  return fa !== null && fa === fan(b);
}

/** Named boxes for every board element (not counting hand cards). */
export function boardElements(l: LayoutSnapshot): [string, Box][] {
  const out: [string, Box][] = [];
  for (const s of ['corp', 'runner'] as const) {
    for (const k of ['deck', 'credits', 'clicks', 'discard', 'label'] as const) out.push([`${s} ${k}`, l[s][k]]);
  }
  for (const srv of l.servers) {
    out.push([`${srv.label} name`, srv.labelBox]);
    // The HQ marker (R&D and Archives are the Corp's deck / discard above) is
    // always checked: nothing may cover it (QA-S2-2).
    if (srv.id === 'hq' && srv.root) out.push(['HQ marker', srv.root]);
    // A crowded server fans its installed cards (past the busy board): they may
    // overlap each other (see FANNED), but nothing else.
    const fanned = srv.content.some((c, i) => i > 0 && overlaps(srv.content[i - 1]!.box, c.box));
    srv.content.forEach((c, i) => out.push([`${srv.label} ${fanned ? FANNED : ''}card ${i}`, c.box]));
    srv.ice.forEach((c, i) => out.push([`${srv.label} ICE ${i}`, c.box]));
  }
  l.rig.forEach((c, i) => out.push([`rig card ${i}`, c.box]));
  out.push(['memory', l.memory.box]);
  for (const s of ['corp', 'runner'] as const) if (l.score[s].box.width > 0) out.push([`${s} score`, l.score[s].box]);
  if (l.runButton) out.push(['Run button', l.runButton.box]);
  if (l.run) {
    l.run.buttons.forEach((b, i) => out.push([`run button ${i} "${b.label}"`, b.box]));
  }
  if (l.endTurn) out.push(['End turn', l.endTurn.box]);
  if (l.picker) out.push(['Confirm', l.picker.confirm.box]);
  // S-04-1: the small build date in a corner.
  if (l.buildLabel) out.push(['build date', l.buildLabel.box]);
  return out;
}

/**
 * Asserts every element is inside the safe area and no two elements overlap.
 * Hand cards sit side by side while they fit; past that they overlap like a
 * fanned hand, but at least 44px of each card stays visible (tappable).
 */
export function expectCleanLayout(l: LayoutSnapshot): void {
  const safe = safeRect(l);
  const elements = boardElements(l);
  const hand = l.hand.map((h, i): [string, Box] => [`hand card ${i} (${h.cardId})`, h.box]);
  const extras: [string, Box][] = [];
  if (l.hint) extras.push(['hint', l.hint.box]);
  if (l.gameOver) extras.push(['game over', l.gameOver.box]);
  for (const srv of l.servers) extras.push([`${srv.label} column`, srv.box]);
  for (const [name, b] of [...elements, ...hand, ...extras]) {
    expect(inside(b, safe), `${name} ${JSON.stringify(b)} is inside the safe area ${JSON.stringify(safe)}`).toBe(true);
  }
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const [an, a] = elements[i]!;
      const [bn, b] = elements[j]!;
      if (sameFan(an, bn)) {
        // Fanned like a hand: each card still shows a strip of itself.
        if (j === i + 1) expect(Math.abs(b.x - a.x), `${bn} shows a strip past ${an}`).toBeGreaterThanOrEqual(Math.min(a.width * 0.35, 20) - 0.5);
        continue;
      }
      expect(overlaps(a, b), `${an} ${JSON.stringify(a)} overlaps ${bn} ${JSON.stringify(b)}`).toBe(false);
    }
    for (const [hn, h] of hand) {
      expect(overlaps(elements[i]![1], h), `${elements[i]![0]} overlaps ${hn}`).toBe(false);
    }
  }
  // A hint toast never covers a board element or a hand card (QA-S2-1).
  if (l.hint) {
    for (const [n, b] of [...elements, ...hand]) expect(overlaps(l.hint.box, b), `hint "${l.hint.text}" ${JSON.stringify(l.hint.box)} overlaps ${n}`).toBe(false);
  }
  for (let i = 1; i < hand.length; i++) {
    const a = hand[i - 1]![1];
    const b = hand[i]![1];
    if (Math.abs(a.y - b.y) < 0.5) expect(b.x - a.x, `${hand[i]![0]} shows at least 44px`).toBeGreaterThanOrEqual(44 - 0.5);
  }
  // Up to 5 cards always sit side by side.
  if (hand.length <= 5) {
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        expect(overlaps(hand[i]![1], hand[j]![1]), `${hand[i]![0]} overlaps ${hand[j]![0]}`).toBe(false);
      }
    }
  }
}

/** Drives the game through the hook (test-only, uses the view's legal actions) until it ends. */
export async function playUntilGameOver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const hook = window.__overclock!;
    for (let guard = 0; guard < 500; guard++) {
      const v = hook.getView();
      if (v.result) return;
      const me = v.viewer;
      if (v.pendingDiscard > 0) {
        const n = v.players[me].handCount;
        const idx = Array.from({ length: v.pendingDiscard }, (_, k) => n - v.pendingDiscard + k);
        hook.dispatch({ type: 'discard', player: me, handIndices: idx });
      } else if (me === 'corp' && v.legalActions.some((a) => a.type === 'draw')) {
        hook.dispatch({ type: 'draw', player: me });
      } else {
        hook.dispatch({ type: 'end_turn', player: me });
      }
    }
    throw new Error('game did not end');
  });
}

/**
 * Plays the page (opened with `seed`) to the S-02-5 busy board: 3 remote servers
 * with 2 ICE each and 4 Runner installs. The action list is planned in Node by
 * driving a LocalMatch with the same seed (`@overclock/match/testing`), then
 * dispatched through the test hook. Leaves the board idle.
 */
export async function toBusyBoard(page: Page, seed: number): Promise<void> {
  const plan = planBusyBoard(seed);
  const rejected = await page.evaluate((actions) => {
    const hook = window.__overclock!;
    for (const a of actions) {
      const events = hook.dispatch(a);
      const r = events.find((e) => e.type === 'action_rejected');
      if (r) return JSON.stringify({ a, r });
    }
    return null;
  }, plan.actions);
  expect(rejected).toBeNull();
  await waitIdle(page);
  expect((await getView(page)).activePlayer).toBe(plan.activePlayer);
}

/** Taps a lit target from the layout snapshot. */
export function targetOf(l: LayoutSnapshot, kind: TargetSnapshot['kind'], server?: string): TargetSnapshot {
  const t = l.targets.find((x) => x.kind === kind && (server === undefined || x.server === server));
  if (!t) throw new Error(`no ${kind} target${server ? ` for ${server}` : ''} in ${JSON.stringify(l.targets.map((x) => [x.kind, x.server]))}`);
  return t;
}

/** Index of the first hand card whose id satisfies `pred`, or -1. */
export function handIndexOf(l: LayoutSnapshot, pred: (cardId: string) => boolean): number {
  return l.hand.findIndex((h) => pred(h.cardId));
}

/** Hand index of the first card named `name` (real card names, from @overclock/cards). */
export function handIndexByName(l: LayoutSnapshot, name: string): number {
  const i = l.hand.findIndex((h) => getCard(h.cardId)?.name === name);
  if (i < 0) throw new Error(`${name} not in hand: ${l.hand.map((h) => getCard(h.cardId)?.name).join(', ')}`);
  return i;
}

/** Taps the hand card named `name` and returns the layout with its targets lit. */
export async function pickCard(page: Page, name: string): Promise<LayoutSnapshot> {
  const l = await layout(page);
  const i = handIndexByName(l, name);
  await tap(page, l.hand[i]!.box);
  const after = await layout(page);
  expect(after.selected, `${name} is picked`).toBe(i);
  return after;
}

/** A point on empty board (no card, button or target): right of the Corp's last column. */
export function emptySpot(l: LayoutSnapshot): Box {
  const cols = [...l.servers.map((s) => s.box), ...l.targets.filter((t) => t.kind === 'new_server').map((t) => t.box)];
  const right = Math.max(...cols.map((b) => b.x + b.width));
  const col = cols[0]!;
  return { x: right + 20, y: col.y + col.height / 2 - 5, width: 10, height: 10 };
}

/** Ends the active seat's turn through the hook, discarding the first cards if asked. */
export async function passTurn(page: Page): Promise<void> {
  await page.evaluate(() => {
    const hook = window.__overclock!;
    const v = hook.getView();
    hook.dispatch({ type: 'end_turn', player: v.viewer });
    const w = hook.getView();
    if (w.pendingDiscard > 0) hook.dispatch({ type: 'discard', player: w.viewer, handIndices: Array.from({ length: w.pendingDiscard }, (_, i) => i) });
  });
  await waitIdle(page);
}

/**
 * Plays the page (opened with `seed`) to a Sprint 3 step (`@overclock/match/testing`
 * planToStep): each planned action is dispatched through the hook as its own player
 * (the Corp's rez decisions happen during the Runner's turn). Leaves the board idle.
 */
export async function toStep(page: Page, seed: number, goal: StepGoal): Promise<StepPlan> {
  const plan = planToStep(seed, goal);
  const rejected = await page.evaluate((actions) => {
    const hook = window.__overclock!;
    for (const a of actions) {
      const events = hook.dispatch(a);
      const r = events.find((e) => e.type === 'action_rejected');
      if (r) return JSON.stringify({ a, r });
    }
    return null;
  }, plan.actions);
  expect(rejected).toBeNull();
  await waitIdle(page);
  const v = await getView(page);
  expect(v.activePlayer).toBe(plan.activePlayer);
  return plan;
}

/** The run panel button whose label matches, from the layout snapshot. */
export function runButtonOf(l: LayoutSnapshot, label: string | RegExp): NonNullable<LayoutSnapshot['run']>['buttons'][number] {
  const b = l.run?.buttons.find((x) => (typeof label === 'string' ? x.label === label : label.test(x.label)));
  if (!b) throw new Error(`no run button ${String(label)} in ${JSON.stringify(l.run?.buttons.map((x) => x.label))}`);
  return b;
}

/** Taps Run, then the lit server `server`; returns the layout after the run started. */
export async function startRun(page: Page, server: string): Promise<LayoutSnapshot> {
  let l = await layout(page);
  expect(l.runButton, 'the Run button shows').not.toBeNull();
  await tap(page, l.runButton!.box);
  l = await layout(page);
  await tap(page, targetOf(l, 'run', server).box);
  return waitIdle(page);
}
