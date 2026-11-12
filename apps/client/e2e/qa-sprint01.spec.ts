// QA (Sprint 1) extra checks, written independently of the UI developer's specs:
// - S-01-3 AC1: End turn really looks brighter on screen at 0 clicks (pixels, not just the hook flag).
// - S-01-5 AC3: discards fly to the actor's own discard pile.
// - S-01-6 AC2: the notch / gesture-bar bands are empty on screen (pixels), and a zoomed card stays inside.
// - Snappiness: the longest turn change (4 discards, then the Corp's free draw) never keeps input away > 600ms.
import { expect, test, type Page } from './fixtures';
import type { Box } from './helpers';
import { dispatch, getView, lastEvents, layout, measureTap, openBoard, pressAndHold, safeRect, tap, toRunnerTurn, waitEndTurnArmed, waitIdle } from './helpers';

interface Stats {
  mean: number;
  brightFrac: number;
}

/** Luminance stats of a CSS-pixel rect in a screenshot, decoded in a blank page (the game page has a strict CSP). */
async function regionStats(page: Page, rect: Box): Promise<Stats> {
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const png = await page.screenshot();
  const helper = await page.context().newPage();
  try {
    return await helper.evaluate(
      async ({ b64, rect, dpr }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const cv = document.createElement('canvas');
        cv.width = img.width;
        cv.height = img.height;
        const g = cv.getContext('2d')!;
        g.drawImage(img, 0, 0);
        const w = Math.max(1, Math.round(rect.width * dpr));
        const h = Math.max(1, Math.round(rect.height * dpr));
        const d = g.getImageData(Math.round(rect.x * dpr), Math.round(rect.y * dpr), w, h).data;
        let sum = 0;
        let bright = 0;
        for (let i = 0; i < d.length; i += 4) {
          const lum = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
          sum += lum;
          if (lum > 90) bright++;
        }
        const n = d.length / 4;
        return { mean: sum / n, brightFrac: bright / n };
      },
      { b64: png.toString('base64'), rect, dpr },
    );
  } finally {
    await helper.close();
  }
}

test.describe('QA S-01-3 End turn glow (pixels)', () => {
  test('the End turn button is clearly brighter on screen once all clicks are used', async ({ page }) => {
    await openBoard(page);
    let l = await waitIdle(page);
    const box = l.endTurn!.box;
    const before = await regionStats(page, box);
    for (let i = 0; i < 3; i++) await dispatch(page, { type: 'gain_credit', player: 'corp' });
    l = await waitIdle(page);
    expect(l.endTurn!.box).toEqual(box);
    // Let the glow settle (it may fade in).
    await page.waitForTimeout(400);
    const after = await regionStats(page, box);
    test.info().annotations.push({ type: 'glow', description: JSON.stringify({ before, after }) });
    expect(after.mean).toBeGreaterThan(before.mean * 2);
    expect(after.brightFrac).toBeGreaterThan(before.brightFrac + 0.3);
  });
});

test.describe('QA S-01-5 discard flight', () => {
  test("Confirm flies the picked cards to the actor's own discard pile, whose count then goes up", async ({ page }) => {
    await openBoard(page);
    await toRunnerTurn(page);
    await dispatch(page, { type: 'draw', player: 'runner' });
    await dispatch(page, { type: 'draw', player: 'runner' });
    await dispatch(page, { type: 'end_turn', player: 'runner' });
    let l = await waitIdle(page);
    const pile = l.runner.discard;
    expect(l.text.runnerDiscard).toBe('0');
    await tap(page, l.hand[0]!.box);
    await tap(page, l.hand[4]!.box);
    l = await layout(page);
    const m = await measureTap(page, l.picker!.confirm.box);
    const flight = m.anims.find((a) => a.kind === 'discard_flight');
    expect(flight?.box).toEqual(pile);
    const after = await waitIdle(page);
    expect(after.viewer).toBe('corp');
    expect(after.text.runnerDiscard).toBe('2');
    expect((await getView(page)).players.runner.discardCount).toBe(2);
  });
});

const SHAPES: [string, { top: number; bottom: number }][] = [
  ['iPhone notch + home bar', { top: 47, bottom: 34 }],
  ['Android status bar + gesture bar', { top: 24, bottom: 48 }],
];

for (const [name, insets] of SHAPES) {
  test.describe(`QA S-01-6 safe area pixels: ${name}`, () => {
    test('nothing is drawn in the notch / gesture-bar bands, on the board and in the picker', async ({ page }) => {
      await openBoard(page, { insets });
      const vp = (await layout(page)).viewport;
      const bands: Box[] = [
        { x: 0, y: 0, width: vp.width, height: insets.top },
        { x: 0, y: vp.height - insets.bottom, width: vp.width, height: insets.bottom },
      ];
      // Board, then the hand-limit picker with a full hand.
      for (const step of ['board', 'picker'] as const) {
        if (step === 'picker') {
          for (let i = 0; i < 3; i++) await dispatch(page, { type: 'draw', player: 'corp' });
          await dispatch(page, { type: 'end_turn', player: 'corp' });
        }
        await waitIdle(page);
        await page.waitForTimeout(200);
        for (const band of bands) {
          const s = await regionStats(page, band);
          test.info().annotations.push({ type: `${step} band`, description: JSON.stringify({ band, s }) });
          // Only the dark backdrop (and its faint grid lines) may show there.
          expect(s.brightFrac, `${step}: no bright pixels in ${JSON.stringify(band)}`).toBe(0);
          expect(s.mean).toBeLessThan(20);
        }
      }
    });

    test('a long-press zoomed card stays inside the safe area', async ({ page }) => {
      await openBoard(page, { insets });
      const l = await layout(page);
      const release = await pressAndHold(page, l.hand.at(-1)!.box);
      await page.waitForFunction(() => window.__overclock!.layout().zoom !== null);
      await waitIdle(page);
      const z = (await layout(page)).zoom!;
      await release();
      const safe = safeRect(l);
      expect(z.box.y).toBeGreaterThanOrEqual(safe.y);
      expect(z.box.y + z.box.height).toBeLessThanOrEqual(safe.y + safe.height);
      expect(z.box.x).toBeGreaterThanOrEqual(safe.x);
      expect(z.box.x + z.box.width).toBeLessThanOrEqual(safe.x + safe.width);
    });
  });
}

// ---- timing on the game's own clock -------------------------------------------------
// Budgets below are measured from the timestamps the game itself reports through the test
// hook (`lastInput().handledAt`, `turnClock.endTurnArmedAt`, `turnClock.flipDueAt`, all on
// the page's performance.now() clock), not from test-runner or frame wall-clock deltas,
// which on GPU-less / slow CI runners include delays the game does not control. Wall-clock
// numbers are kept as annotations. See docs/DECISIONS.md "e2e timing (Sprint 2 task 0)".

/** One synthetic tap delivered in the page, on the page clock. */
interface Poke {
  /** performance.now() when the tap was sent. */
  t: number;
  accepted: boolean;
  /** Sent by a timer (not the synchronous first poke or the final check). */
  timed: boolean;
  /** The next seat's board was on screen when the tap was sent. */
  flipped: boolean;
}

/**
 * Installs `window.__qaPoke(box)` (after each page load): sends pointerdown + pointerup on
 * the canvas at the box centre, returns when it was sent and whether the game acted on it
 * (its last events changed).
 */
async function installPoker(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __qaPoke?: (b: Box) => { t: number; accepted: boolean } };
    w.__qaPoke = (b) => {
      const hook = window.__overclock!;
      const canvas = document.querySelector('canvas')!;
      const r = canvas.getBoundingClientRect();
      const init = { bubbles: true, cancelable: true, pointerId: 11, pointerType: 'mouse', isPrimary: true, button: 0,
        clientX: r.left + b.x + b.width / 2, clientY: r.top + b.y + b.height / 2 };
      const before = JSON.stringify(hook.lastEvents());
      const t = performance.now();
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
      return { t, accepted: JSON.stringify(hook.lastEvents()) !== before };
    };
  });
}

/** What the page recorded around the tap that ended a turn. */
interface TurnWatch {
  /** The game's `lastInput()` for that tap (page clock). */
  eventAt?: number;
  handledAt?: number;
  /** Wall clock: first animation frame that saw the next seat's board. */
  flipAt?: number;
  pokes: Poke[];
  /** Timer rounds still to run (guard tests). */
  roundsLeft?: number;
  error?: string;
}

interface TurnClock {
  endTurnArmedAt: number;
  flipDueAt: number;
}

async function turnClock(page: Page): Promise<TurnClock> {
  return (await layout(page)).turnClock;
}

/**
 * Armed in the page before the Confirm tap, so test-runner latency adds nothing: notes the
 * game's own handling time of the Confirm release, watches every frame for the Corp's board,
 * and from `fromMs` after that handling time taps `target` every 4ms until the game answers.
 */
async function watchTurnChange(page: Page, target: 'deck' | 'endTurn', fromMs: number): Promise<void> {
  await installPoker(page);
  await page.evaluate(
    ([target, fromMs]) => {
      const w = window as unknown as { __qa?: TurnWatch; __qaPoke: (b: Box) => { t: number; accepted: boolean } };
      const qa: TurnWatch = { pokes: [] };
      w.__qa = qa;
      const hook = window.__overclock!;
      const tick = () => {
        if (hook.layout().viewer === 'corp') qa.flipAt = performance.now();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      window.addEventListener(
        'pointerup',
        (e) => {
          const input = hook.lastInput();
          if (!input || input.eventAt !== e.timeStamp) {
            qa.error = `the game did not handle the Confirm tap: ${JSON.stringify(input)} vs ${e.timeStamp}`;
            return;
          }
          qa.eventAt = input.eventAt;
          qa.handledAt = input.handledAt;
          const poke = () => {
            const l = hook.layout();
            const b = target === 'deck' ? l.corp.deck : l.endTurn?.box;
            if (b && l.viewer === 'corp') {
              const p = w.__qaPoke(b);
              qa.pokes.push({ ...p, timed: true, flipped: true });
              if (p.accepted) return;
            }
            if (performance.now() - input.handledAt < 3000) setTimeout(poke, 4);
          };
          setTimeout(poke, Math.max(0, input.handledAt + fromMs - performance.now()));
        },
        { once: true },
      );
    },
    [target, fromMs] as const,
  );
}

async function turnChangeResult(page: Page): Promise<TurnWatch & { handledAt: number; eventAt: number; flipAt: number }> {
  await page.waitForFunction(() => {
    const qa = (window as unknown as { __qa: TurnWatch }).__qa;
    return qa.error !== undefined || (qa.flipAt !== undefined && qa.pokes.some((p) => p.accepted));
  }, undefined, { timeout: 5000 });
  const qa = await page.evaluate(() => (window as unknown as { __qa: TurnWatch }).__qa);
  if (qa.error) throw new Error(qa.error);
  return qa as TurnWatch & { handledAt: number; eventAt: number; flipAt: number };
}

test.describe('QA snappiness: longest turn change', () => {
  test('Runner discards 4, then the Corp turn starts with its free draw: the next player can act within 600ms', async ({ page }) => {
    await openBoard(page);
    await toRunnerTurn(page);
    for (let i = 0; i < 4; i++) await dispatch(page, { type: 'draw', player: 'runner' });
    await dispatch(page, { type: 'end_turn', player: 'runner' });
    let l = await waitIdle(page);
    expect(l.picker?.remaining).toBe(4);
    for (const i of [0, 1, 2, 3]) await tap(page, l.hand[i]!.box);
    l = await layout(page);
    await watchTurnChange(page, 'deck', 600);
    const m = await measureTap(page, l.picker!.confirm.box);
    expect(m.view.activePlayer).toBe('corp');
    // Every animation the tap started is scheduled to end within its own budget.
    for (const a of m.anims) expect(a.scheduledMs, a.kind).toBeLessThanOrEqual(600);
    const qa = await turnChangeResult(page);
    const clock = await turnClock(page);
    const ok = qa.pokes.find((p) => p.accepted)!;
    test.info().annotations.push({
      type: 'timing',
      description: JSON.stringify({
        queueMs: qa.handledAt - qa.eventAt,
        flipDueMs: clock.flipDueAt - qa.handledAt,
        wallFlipMs: qa.flipAt - qa.handledAt,
        firstDeckDrawMs: ok.t - qa.handledAt,
      }),
    });
    // The game shows the new seat, without any tap, no later than 600ms after Confirm.
    expect(clock.flipDueAt - qa.handledAt, 'board flip scheduled within 600ms').toBeLessThanOrEqual(600);
    // A tap on the Corp's deck from 600ms after Confirm draws a card.
    expect(ok.t - qa.handledAt).toBeGreaterThanOrEqual(600);
    expect((await lastEvents(page)).map((e) => e.type)).toContain('card_drawn');
  });

  // QA-S1-1 (see docs/sprints/sprint-01-qa.md): End turn used to ignore taps until 300ms
  // after the flip, which itself waits for the discard flight (~650-755ms after Confirm).
  // Fixed: the guard now counts from the Confirm tap.
  test('after a 4-card discard, the next player\'s End turn answers within 600ms of Confirm', async ({ page }) => {
    await openBoard(page);
    await toRunnerTurn(page);
    for (let i = 0; i < 4; i++) await dispatch(page, { type: 'draw', player: 'runner' });
    await dispatch(page, { type: 'end_turn', player: 'runner' });
    let l = await waitIdle(page);
    for (const i of [0, 1, 2, 3]) await tap(page, l.hand[i]!.box);
    l = await layout(page);
    // Tap End turn every few ms from the moment of Confirm until it answers.
    await watchTurnChange(page, 'endTurn', 0);
    await measureTap(page, l.picker!.confirm.box);
    const qa = await turnChangeResult(page);
    const clock = await turnClock(page);
    const readyAt = Math.max(clock.endTurnArmedAt, clock.flipDueAt);
    const ok = qa.pokes.find((p) => p.accepted)!;
    test.info().annotations.push({
      type: 'timing',
      description: JSON.stringify({
        queueMs: qa.handledAt - qa.eventAt,
        armedMs: clock.endTurnArmedAt - qa.handledAt,
        flipDueMs: clock.flipDueAt - qa.handledAt,
        wallFlipMs: qa.flipAt - qa.handledAt,
        wallFirstAnswerMs: ok.t - qa.handledAt,
        pokes: qa.pokes.length,
      }),
    });
    // The game's own schedule: End turn is on screen and armed within 600ms of Confirm.
    expect(readyAt - qa.handledAt, 'End turn ready within 600ms of Confirm').toBeLessThanOrEqual(600);
    // And the game keeps that promise: no tap after it is ignored. The first tap sent once
    // the board shows the Corp and the schedule has passed is answered (taps before the
    // board is on screen only wait for the frame; no wall-clock budget is asserted on that).
    const firstReady = qa.pokes.find((p) => p.t >= readyAt);
    expect(firstReady, 'a tap was sent after End turn was ready').toBeDefined();
    expect(firstReady!.accepted, `End turn tap ${Math.round(firstReady!.t - qa.handledAt)}ms after Confirm answered`).toBe(true);
    for (const p of qa.pokes.filter((x) => x.t < clock.endTurnArmedAt)) expect(p.accepted, 'tap inside the guard ignored').toBe(false);
    expect((await lastEvents(page)).map((e) => e.type)).toContain('discard_required');
  });
});

// Round 2 (QA-S1-1 fix): the End turn double-tap guard now counts from the tap that
// ended the last turn. Check that extra taps in the next 300ms still do nothing, so a
// fast double (or triple) tap cannot end two turns. On the discard path the Confirm
// button and the next seat's End turn sit in the same spot.
//
// Each scenario taps the spot once synchronously inside the release that ended the turn,
// then by timers; timers on a slow runner can fire late, so a scenario only counts when
// at least one timed tap landed late in the guard window ([150ms, armedAt)). Otherwise the
// whole scenario is rerun on a freshly loaded page, up to GUARD_ATTEMPTS times, then the
// test fails. It never passes with no tap inside the guard.

/** Timer offsets (ms after the game handled the turn-ending tap). */
const OFFSETS = [40, 80, 120, 160, 190, 220, 250, 275] as const;
const GUARD_ATTEMPTS = 3;
const LATE_IN_GUARD_MS = 150;

/**
 * Armed before the tap that ends a turn. From that tap's release, taps the spot `at` (and
 * End turn, wherever it is once shown): once synchronously in the same pointerup dispatch,
 * then at each of OFFSETS, recording when each tap really happened and whether the game
 * acted on it.
 */
async function pokeAfterTap(page: Page, at: Box): Promise<void> {
  await installPoker(page);
  await page.evaluate(
    ([at, offsets]) => {
      const w = window as unknown as { __qa?: TurnWatch; __qaPoke: (b: Box) => { t: number; accepted: boolean } };
      const qa: TurnWatch = { pokes: [], roundsLeft: offsets.length };
      w.__qa = qa;
      const hook = window.__overclock!;
      const round = (timed: boolean) => {
        const flipped = hook.layout().viewer === 'corp';
        qa.pokes.push({ ...w.__qaPoke(at), timed, flipped });
        const b = hook.layout().endTurn?.box;
        if (b) qa.pokes.push({ ...w.__qaPoke(b), timed, flipped });
      };
      window.addEventListener(
        'pointerup',
        (e) => {
          // Read before poking: each poke is a new input.
          const input = hook.lastInput();
          if (!input || input.eventAt !== e.timeStamp) {
            qa.error = `the game did not handle the turn-ending tap: ${JSON.stringify(input)} vs ${e.timeStamp}`;
            return;
          }
          qa.eventAt = input.eventAt;
          qa.handledAt = input.handledAt;
          round(false);
          for (const ms of offsets) {
            setTimeout(() => {
              round(true);
              qa.roundsLeft!--;
            }, Math.max(0, input.handledAt + ms - performance.now()));
          }
        },
        { once: true },
      );
    },
    [at, OFFSETS] as const,
  );
}

interface GuardResult {
  qa: TurnWatch & { handledAt: number; eventAt: number };
  clock: TurnClock;
}

/**
 * Runs one guard scenario: `setup` loads the board and returns the spot of the tap that
 * ends the turn. Returns null when no timed tap landed late in the guard (rerun it).
 */
async function guardAttempt(page: Page, setup: () => Promise<Box>): Promise<GuardResult | null> {
  const at = await setup();
  await pokeAfterTap(page, at);
  await tap(page, at);
  await page.waitForFunction(() => {
    const qa = (window as unknown as { __qa: TurnWatch }).__qa;
    return qa.error !== undefined || qa.roundsLeft === 0;
  });
  await waitIdle(page);
  // Past the guard on the page clock, End turn must answer again: tap it once if no
  // timer tap already did.
  await page.evaluate(async () => {
    const hook = window.__overclock!;
    const w = window as unknown as { __qa: TurnWatch; __qaPoke: (b: Box) => { t: number; accepted: boolean } };
    const armedAt = hook.layout().turnClock.endTurnArmedAt;
    while (performance.now() < armedAt) await new Promise((r) => requestAnimationFrame(r));
    if (w.__qa.pokes.some((p) => p.accepted && p.t >= armedAt)) return;
    const b = hook.layout().endTurn?.box;
    if (b) w.__qa.pokes.push({ ...w.__qaPoke(b), timed: false, flipped: hook.layout().viewer === 'corp' });
  });
  const qa = await page.evaluate(() => (window as unknown as { __qa: TurnWatch }).__qa);
  if (qa.error) throw new Error(qa.error);
  const clock = await turnClock(page);
  const r = qa as GuardResult['qa'];
  const lateTimed = r.pokes.filter((p) => p.timed && p.t - r.handledAt >= LATE_IN_GUARD_MS && p.t < clock.endTurnArmedAt);
  test.info().annotations.push({
    type: 'pokes',
    description: JSON.stringify({
      queueMs: r.handledAt - r.eventAt,
      armedMs: clock.endTurnArmedAt - r.handledAt,
      pokes: r.pokes.map((p) => [Math.round(p.t - r.handledAt), p.accepted, p.timed ? 'timer' : 'sync/final']),
      lateInGuard: lateTimed.length,
    }),
  });
  return lateTimed.length > 0 ? { qa: r, clock } : null;
}

/** Reruns the scenario until one counts (see above), at most GUARD_ATTEMPTS times. */
async function guardScenario(page: Page, setup: () => Promise<Box>): Promise<GuardResult> {
  for (let attempt = 1; attempt <= GUARD_ATTEMPTS; attempt++) {
    const r = await guardAttempt(page, setup);
    test.info().annotations.push({ type: 'guard attempt', description: `${attempt}: ${r ? 'counted' : 'no timed tap landed late in the guard, rerun'}` });
    if (r) return r;
  }
  throw new Error(`no timed tap landed in [${LATE_IN_GUARD_MS}ms, armedAt) in ${GUARD_ATTEMPTS} attempts: the guard was not exercised`);
}

/** The guard held: every tap before armedAt did nothing, the first one after it worked. */
function expectGuardHeld({ qa, clock }: GuardResult, what: string): void {
  expect(clock.endTurnArmedAt - qa.handledAt, 'guard lasts at least 300ms after the tap').toBeGreaterThanOrEqual(300);
  const inside = qa.pokes.filter((p) => p.t < clock.endTurnArmedAt);
  expect(inside.some((p) => !p.timed), 'the synchronous tap landed inside the guard').toBe(true);
  for (const p of inside) expect(p.accepted, `tap ${Math.round(p.t - qa.handledAt)}ms after ${what}`).toBe(false);
  const after = qa.pokes.filter((p) => p.t >= clock.endTurnArmedAt);
  expect(after.some((p) => p.accepted), 'a tap after the guard ends is answered').toBe(true);
}

test.describe('QA round 2: End turn double-tap guard', () => {
  test('extra End turn taps in the 300ms after ending a turn do nothing (no discard)', async ({ page }) => {
    const r = await guardScenario(page, async () => {
      await openBoard(page);
      await toRunnerTurn(page);
      await waitEndTurnArmed(page);
      return (await layout(page)).endTurn!.box;
    });
    expectGuardHeld(r, 'End turn');
    // Only one turn ended. The tap after the guard is a new, allowed End turn: on the
    // Corp's 6 cards it opens the hand-limit step, which is not a turn end.
    const v = await getView(page);
    expect(v.activePlayer).toBe('corp');
    expect(v.turn).toBe(3);
    expect(v.pendingDiscard).toBe(1);
  });

  test('after a 4-card discard, extra taps on the Confirm / End turn spot in the next 300ms do nothing', async ({ page }) => {
    const r = await guardScenario(page, async () => {
      await openBoard(page);
      await toRunnerTurn(page);
      for (let i = 0; i < 4; i++) await dispatch(page, { type: 'draw', player: 'runner' });
      await dispatch(page, { type: 'end_turn', player: 'runner' });
      let l = await waitIdle(page);
      for (const i of [0, 1, 2, 3]) await tap(page, l.hand[i]!.box);
      l = await layout(page);
      return l.picker!.confirm.box;
    });
    expectGuardHeld(r, 'Confirm');
    const v = await getView(page);
    expect(v.activePlayer).toBe('corp');
    expect(v.turn).toBe(3);
    expect(v.pendingDiscard).toBe(1);
    expect(v.players.runner.handCount).toBe(5);
    expect(v.players.corp.handCount).toBe(6);
  });
});
