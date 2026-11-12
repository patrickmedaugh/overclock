import { type Page, expect, test } from '@playwright/test';
import { getCard } from '@overclock/cards';
import type { Action, GameEvent, PlayerView, Side } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';
// Node-side e2e setup only (packages/engine/README.md, "Test-only"); the game itself never imports it.
// eslint-disable-next-line no-restricted-imports
import { planBusyBoard } from '@overclock/match/testing';
import type { AnimRecord, Box, EndTurnClock, InputStamp, Insets, LayoutSnapshot } from '../src/hook-types';

export type { AnimRecord, Box, EndTurnClock, InputStamp, Insets, LayoutSnapshot };

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

/** Named boxes for every board element (not counting hand cards). */
export function boardElements(l: LayoutSnapshot): [string, Box][] {
  const out: [string, Box][] = [];
  for (const s of ['corp', 'runner'] as const) {
    for (const k of ['deck', 'credits', 'clicks', 'discard', 'label'] as const) out.push([`${s} ${k}`, l[s][k]]);
  }
  if (l.endTurn) out.push(['End turn', l.endTurn.box]);
  if (l.picker) out.push(['Confirm', l.picker.confirm.box]);
  return out;
}

/** Asserts every element is inside the safe area and no two elements overlap. */
export function expectCleanLayout(l: LayoutSnapshot): void {
  const safe = safeRect(l);
  const elements = boardElements(l);
  const hand = l.hand.map((h, i): [string, Box] => [`hand card ${i} (${h.cardId})`, h.box]);
  const extras: [string, Box][] = [];
  if (l.hint) extras.push(['hint', l.hint.box]);
  if (l.gameOver) extras.push(['game over', l.gameOver.box]);
  for (const [name, b] of [...elements, ...hand, ...extras]) {
    expect(inside(b, safe), `${name} ${JSON.stringify(b)} is inside the safe area ${JSON.stringify(safe)}`).toBe(true);
  }
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const [an, a] = elements[i]!;
      const [bn, b] = elements[j]!;
      expect(overlaps(a, b), `${an} overlaps ${bn}`).toBe(false);
    }
    for (const [hn, h] of hand) {
      expect(overlaps(elements[i]![1], h), `${elements[i]![0]} overlaps ${hn}`).toBe(false);
    }
  }
  // Hand cards may only overlap when there are too many to fit; with <= 10
  // cards they sit side by side.
  if (hand.length <= 10) {
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
 * Plays the Sprint 2 "busy board" through the hook: 3 remote servers with 2
 * ICE each and 4 Runner cards installed (actions planned by the match host's
 * test helper for the same seed). Then hands the turn to `side` if asked
 * (discarding the last cards over the hand limit). Leaves the board idle.
 */
export async function toBusyBoard(page: Page, opts: { seed?: number; side?: Side } = {}): Promise<void> {
  const seed = opts.seed ?? 1;
  const plan = planBusyBoard(seed);
  await page.evaluate((actions) => {
    const hook = window.__overclock!;
    for (const a of actions) {
      const events = hook.dispatch(a);
      const refused = events.find((e) => e.type === 'action_rejected');
      if (refused) throw new Error(`busy board: ${JSON.stringify(a)} refused: ${JSON.stringify(refused)}`);
    }
  }, plan.actions);
  if (opts.side && opts.side !== plan.activePlayer) {
    await page.evaluate((me) => {
      const hook = window.__overclock!;
      hook.dispatch({ type: 'end_turn', player: me });
      const v = hook.getView();
      if (v.pendingDiscard > 0) {
        const n = v.players[me].handCount;
        hook.dispatch({ type: 'discard', player: me, handIndices: Array.from({ length: v.pendingDiscard }, (_, k) => n - v.pendingDiscard + k) });
      }
    }, plan.activePlayer);
  }
  await waitIdle(page);
  if (opts.side) expect((await getView(page)).activePlayer).toBe(opts.side);
}

// ---- Sprint 2 scenarios (Node side, through the same match host the page uses) ----

export type CardType = NonNullable<ReturnType<typeof getCard>>['type'];
export const typeOf = (id: string | null | undefined): CardType | undefined => (id ? getCard(id)?.type : undefined);

/** First seed (from 1) whose opening hands satisfy `pred` (Corp hand after its free draw, Runner's 5). */
export function findSeed(pred: (corp: readonly string[], runner: readonly string[]) => boolean, max = 3000): number {
  for (let seed = 1; seed <= max; seed++) {
    const m = new LocalMatch(seed);
    if (pred(m.view('corp').players.corp.hand ?? [], m.view('runner').players.runner.hand ?? [])) return seed;
  }
  throw new Error('no seed found');
}

/**
 * Plays a game with a LocalMatch for `seed`, asking `choose` for each move of
 * the active seat (null = end turn; discards keep the first cards) until
 * `until(view)` holds. Returns the actions, to replay on the page.
 */
export function planTo(seed: number, choose: (v: PlayerView) => Action | null, until: (v: PlayerView) => boolean, max = 300): Action[] {
  const m = new LocalMatch(seed);
  for (let n = 0; n < max; n++) {
    const v = m.view(m.view('corp').activePlayer);
    if (until(v)) return [...m.actions()];
    if (v.phase === 'over') break;
    const me = v.viewer;
    let a: Action;
    if (v.phase === 'discard') {
      const k = v.players[me].handCount;
      a = { type: 'discard', player: me, handIndices: Array.from({ length: v.pendingDiscard }, (_, i) => k - v.pendingDiscard + i) };
    } else a = (v.players[me].clicks > 0 ? choose(v) : null) ?? { type: 'end_turn', player: me };
    const u = m.submit(me, a);
    const refused = u[me].events.find((e) => e.type === 'action_rejected');
    if (refused) throw new Error(`planTo(${seed}): ${JSON.stringify(a)} refused: ${JSON.stringify(refused)}`);
  }
  throw new Error(`planTo(${seed}): not reached`);
}

/** Dispatches planned actions on the page (all must be accepted) and waits until idle. */
export async function replayOnPage(page: Page, actions: readonly Action[]): Promise<void> {
  await page.evaluate((list) => {
    const hook = window.__overclock!;
    for (const a of list) {
      const refused = hook.dispatch(a).find((e) => e.type === 'action_rejected');
      if (refused) throw new Error(`${JSON.stringify(a)} refused: ${JSON.stringify(refused)}`);
    }
  }, actions);
  await waitIdle(page);
}

/** Taps the hand card at `index` and waits for the board to settle. */
export async function pick(page: Page, index: number): Promise<LayoutSnapshot> {
  const l = await waitIdle(page);
  await tap(page, l.hand[index]!.box);
  return layout(page);
}

/** Every tappable / drawn element of a Sprint 2 board: inside the safe area, no overlaps, targets >= 44. */
export function expectCleanTable(l: LayoutSnapshot): void {
  const safe = safeRect(l);
  const items: [string, Box][] = [];
  for (const s of l.servers) {
    expect(inside(s.box, safe), `${s.label} column inside the safe area`).toBe(true);
    for (const [k, c] of s.ice.entries()) items.push([`${s.label} ICE ${k}`, c.box]);
    for (const [k, c] of s.content.entries()) items.push([`${s.label} card ${k}`, c.box]);
  }
  for (const [k, c] of l.rig.entries()) items.push([`rig ${k}`, c.box]);
  for (const [name, b] of items) {
    expect(inside(b, safe), `${name} ${JSON.stringify(b)} inside the safe area`).toBe(true);
    expect(b.width, `${name} width`).toBeGreaterThanOrEqual(44);
    expect(b.height, `${name} height`).toBeGreaterThanOrEqual(44);
  }
  const others: [string, Box][] = [...boardElements(l), ...l.hand.map((h, i): [string, Box] => [`hand ${i}`, h.box]), ['memory', l.memory.box]];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) expect(overlaps(items[i]![1], items[j]![1]), `${items[i]![0]} overlaps ${items[j]![0]}`).toBe(false);
    for (const [on, ob] of others) expect(overlaps(items[i]![1], ob), `${items[i]![0]} overlaps ${on}`).toBe(false);
  }
  expect(inside(l.memory.box, safe)).toBe(true);
}
