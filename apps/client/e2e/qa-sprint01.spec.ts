// QA (Sprint 1) extra checks, written independently of the UI developer's specs:
// - S-01-3 AC1: End turn really looks brighter on screen at 0 clicks (pixels, not just the hook flag).
// - S-01-5 AC3: discards fly to the actor's own discard pile.
// - S-01-6 AC2: the notch / gesture-bar bands are empty on screen (pixels), and a zoomed card stays inside.
// - Snappiness: the longest turn change (4 discards, then the Corp's free draw) never keeps input away > 600ms.
import { expect, test, type Page } from '@playwright/test';
import type { Box } from './helpers';
import { center, dispatch, getView, layout, measureTap, openBoard, pressAndHold, safeRect, sendTap, tap, toRunnerTurn, waitEndTurnArmed, waitIdle } from './helpers';

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

interface TurnChangeWatch {
  flipAt?: number;
  /** ms from the Confirm release (event timestamp) to the first answered tap (wall clock). */
  firstOk?: number;
  /** performance.now() of the first answered tap. */
  firstOkAt?: number;
  events?: string[];
}

/**
 * Armed in the page before the Confirm tap, so test-runner latency adds nothing:
 * watches every frame for the Corp's board, and from `fromMs` after the Confirm
 * release (page clock) taps `target` every 4ms until the game answers it.
 */
async function watchTurnChange(page: Page, target: 'deck' | 'endTurn', fromMs: number): Promise<void> {
  await page.evaluate(
    ([target, fromMs]) => {
      const w = window as unknown as { __qa?: TurnChangeWatch };
      const qa: TurnChangeWatch = {};
      w.__qa = qa;
      const tick = () => {
        if (window.__overclock!.layout().viewer === 'corp') qa.flipAt = performance.now();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      window.addEventListener(
        'pointerup',
        (e) => {
          const confirmAt = e.timeStamp;
          const poke = () => {
            const hook = window.__overclock!;
            const l = hook.layout();
            const b = target === 'deck' ? l.corp.deck : l.endTurn?.box;
            if (b && l.viewer === 'corp') {
              const canvas = document.querySelector('canvas')!;
              const r = canvas.getBoundingClientRect();
              const init = { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'mouse', isPrimary: true, button: 0,
                clientX: r.left + b.x + b.width / 2, clientY: r.top + b.y + b.height / 2 };
              const at = performance.now();
              const before = JSON.stringify(hook.lastEvents());
              canvas.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
              canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
              const after = hook.lastEvents();
              if (JSON.stringify(after) !== before && !after.some((x) => x.type === 'action_rejected')) {
                qa.firstOk = at - confirmAt;
                qa.firstOkAt = at;
                qa.events = after.map((x) => x.type);
                return;
              }
            }
            if (performance.now() - confirmAt < 3000) setTimeout(poke, 4);
          };
          setTimeout(poke, Math.max(0, confirmAt + fromMs - performance.now()));
        },
        { once: true },
      );
    },
    [target, fromMs] as const,
  );
}

async function turnChangeResult(page: Page): Promise<Required<TurnChangeWatch>> {
  await page.waitForFunction(() => {
    const qa = (window as unknown as { __qa: TurnChangeWatch }).__qa;
    return qa.flipAt !== undefined && qa.firstOk !== undefined;
  }, undefined, { timeout: 5000 });
  return page.evaluate(() => (window as unknown as { __qa: Required<TurnChangeWatch> }).__qa);
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
    test.info().annotations.push({
      type: 'timing',
      description: JSON.stringify({ flipMs: qa.flipAt - m.tapAt, firstDeckDrawMs: qa.firstOk }),
    });
    // The new seat is on screen, without any tap, no later than 600ms after Confirm.
    expect(qa.flipAt - m.tapAt, 'board flipped within 600ms').toBeLessThanOrEqual(600);
    // A tap on the Corp's deck 600ms after Confirm draws a card.
    expect(qa.events).toContain('card_drawn');
  });

  // QA-S1-1 (see docs/sprints/sprint-01-qa.md): End turn used to ignore taps until 300ms
  // after the flip, which itself waits for the discard flight (~650-755ms after Confirm).
  // Fixed: the guard now counts from the Confirm tap.
  // Sprint 2 T0: the 600ms is checked on the game's clock (guard and flip times it
  // schedules, from when it handled Confirm); the wall-clock first answer is an
  // annotation, since GPU-less runners add frame delays that are not the game's.
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
    const m = await measureTap(page, l.picker!.confirm.box);
    const qa = await turnChangeResult(page);
    const due = Math.max(m.clock.armedAt, m.clock.flipDueAt);
    test.info().annotations.push({
      type: 'timing',
      description: JSON.stringify({
        queueMs: m.handledAt - m.tapAt,
        armedMs: m.clock.armedAt - m.handledAt,
        flipDueMs: m.clock.flipDueAt - m.handledAt,
        flipMs: qa.flipAt - m.handledAt,
        endTurnFirstAnswerMs: qa.firstOkAt - m.handledAt,
      }),
    });
    expect(Number.isFinite(m.handledAt), 'Confirm reached the game').toBe(true);
    expect(m.view.activePlayer).toBe('corp');
    expect(due - m.handledAt, 'End turn is due (flipped and armed) within 600ms of Confirm').toBeLessThanOrEqual(600);
    // Answered by a tap after it is due (and none before: the guard and the hidden button refuse those).
    expect(qa.firstOkAt, 'End turn answered by a tap after it is due').toBeGreaterThanOrEqual(due);
    expect(qa.events).toContain('discard_required');
  });
});

// Round 2 (QA-S1-1 fix): the End turn double-tap guard now counts from the tap that
// ended the last turn. Check that extra taps in the next 300ms still do nothing, so a
// fast double (or triple) tap cannot end two turns. On the discard path the Confirm
// button and the next seat's End turn sit in the same spot.
//
// Sprint 3 S-03-6 (no timers, no reruns): every tap goes through the browser's input
// pipeline (CDP) with an explicit "made at" time, and the game judges End turn taps
// by that time (DECISIONS 2026-11-12: the guard judges taps by when they were made).
// So a page stall can delay *when* a tap is handled, but not *when it was made*:
// the taps below are made 50, 150, 250 and 295ms after the ending tap, and just
// after `armedAt`, on every run. Each is sent once real time has passed its stamp
// and the next seat's End turn shows (the flip), so it really reaches the button and
// the guard is what refuses it. The 295ms tap is held back until the guard has
// opened, so it is also handled late (the slow-phone double tap). Everything is
// asserted from the event times the page recorded.

/** A tap the page saw, read in the window's pointer listeners (performance.now() clock). */
interface Seen {
  /** DOM event time of the release (when the tap was made). */
  ts: number;
  /** performance.now() right after the game handled it. */
  handled: number;
  /** The game handled this release on the End turn / Confirm button. */
  reached: boolean;
  /** The game did something (its last events changed between press and release). */
  accepted: boolean;
}

/** Taps made this long after the ending tap count as "late in the guard window". */
const LATE_FROM_MS = 150;
/** When the extra taps are made, ms after the ending tap; the last is held back until the guard opens. */
const IN_WINDOW_MS = [50, 150, 250, 295];
/** The tap after the guard is made this long after `armedAt`. */
const AFTER_GUARD_MS = 10;

/** Records every tap the page sees from now on. */
async function recordTaps(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __seen: Seen[] };
    w.__seen = [];
    let before = '';
    // Capture phase on window: runs before the game sees the press.
    window.addEventListener('pointerdown', () => (before = JSON.stringify(window.__overclock!.lastEvents())), true);
    // Bubble phase on window: runs after the game's capture-phase release handler.
    window.addEventListener('pointerup', (e) => {
      const hook = window.__overclock!;
      const input = hook.lastInput();
      w.__seen.push({
        ts: e.timeStamp,
        handled: performance.now(),
        reached: !!input && input.eventAt === e.timeStamp && input.target === 'button:action',
        accepted: JSON.stringify(hook.lastEvents()) !== before,
      });
    });
  });
}

function until(wallMs: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, wallMs - Date.now() + 1)));
}

/**
 * `spot` (from the scenario) is where the tap that ends the turn goes. Ends the turn
 * there, then makes the extra taps on the next seat's End turn (and on `spot` too
 * where that is elsewhere, as on desktop) and checks the guard.
 */
async function checkGuard(page: Page, spot: Box): Promise<void> {
  await recordTaps(page);
  const t0 = Date.now();
  await sendTap(page, spot, { madeAt: t0 });
  // The turn has passed and the next seat's End turn shows (after any discard flight).
  await page.waitForFunction(
    () => {
      const hook = window.__overclock!;
      return (window as unknown as { __seen: Seen[] }).__seen.length >= 1 && hook.getView().activePlayer === 'corp' && hook.layout().endTurn !== null;
    },
    undefined,
    { polling: 'raf' },
  );
  const s = await page.evaluate(() => ({
    madeAt: (window as unknown as { __seen: Seen[] }).__seen[0]!.ts,
    clock: window.__overclock!.endTurn(),
    next: window.__overclock!.layout().endTurn!.box,
  }));
  const guardMs = s.clock.armedAt - s.madeAt;
  // Counted from when the ending tap was made (its event time), which is also how
  // every later tap is judged.
  expect(guardMs, 'End turn stays guarded >= 300ms after the ending tap').toBeGreaterThanOrEqual(300);
  const same = Math.abs(center(spot).x - center(s.next).x) < 1 && Math.abs(center(spot).y - center(s.next).y) < 1;
  // What is tapped, in order: per in-window time, `spot` (if elsewhere) then End turn; then End turn after the guard.
  const plan: { ms: number; onEndTurn: boolean }[] = [
    ...IN_WINDOW_MS.flatMap((ms) => [...(same ? [] : [{ ms, onEndTurn: false }]), { ms, onEndTurn: true }]),
    { ms: guardMs + AFTER_GUARD_MS, onEndTurn: true },
  ];
  for (const { ms, onEndTurn } of plan) {
    // Sent once real time has passed the stamp; the last in-window time only once the guard has opened.
    await until(t0 + (ms === IN_WINDOW_MS.at(-1) ? guardMs + 5 : ms));
    await sendTap(page, onEndTurn ? s.next : spot, { madeAt: t0 + ms });
  }
  await waitIdle(page);

  const seen = await page.evaluate(() => (window as unknown as { __seen: Seen[] }).__seen);
  const rel = (t: number) => Math.round((t - s.madeAt) * 10) / 10;
  test.info().annotations.push({
    type: 'guard',
    description: JSON.stringify({
      armedMs: rel(s.clock.armedAt),
      flipDueMs: rel(s.clock.flipDueAt),
      taps: seen.slice(1).map((p) => [rel(p.ts), rel(p.handled), p.reached, p.accepted]),
    }),
  });

  const ending = seen[0]!;
  const taps = seen.slice(1);
  expect(ending.accepted, 'the ending tap ended the turn').toBe(true);
  expect(taps.length, 'every extra tap reached the page').toBe(plan.length);
  // Chrome made each tap when we said (within 2ms), so the windows below are what was asked for.
  taps.forEach((p, i) => expect(Math.abs(rel(p.ts) - plan[i]!.ms), `tap ${i + 1} made ${plan[i]!.ms}ms after the ending tap`).toBeLessThanOrEqual(2));

  const early = taps.filter((p) => p.ts < s.clock.armedAt);
  expect(early.length, 'taps made inside the guard').toBe(plan.length - 1);
  for (const p of early) expect(p.accepted, `tap made ${rel(p.ts)}ms after the ending tap (guard until ${rel(s.clock.armedAt)}ms)`).toBe(false);
  // The guard, not a hidden button, refused them: each one aimed at End turn reached it.
  taps.forEach((p, i) => {
    if (plan[i]!.onEndTurn) expect(p.reached, `tap made ${rel(p.ts)}ms after the ending tap reached End turn`).toBe(true);
  });
  expect(early.filter((p) => p.reached && p.ts - s.madeAt >= LATE_FROM_MS).length, `End turn taps made in [${LATE_FROM_MS}ms, armedAt)`).toBeGreaterThanOrEqual(1);
  expect(early.some((p) => p.reached && p.handled >= s.clock.armedAt), 'a tap made inside the guard was handled after it opened').toBe(true);

  const after = taps.at(-1)!;
  expect(after.ts, 'the last tap was made after the guard').toBeGreaterThanOrEqual(s.clock.armedAt);
  expect(after.reached && after.accepted, 'a tap after the guard is answered').toBe(true);
}

test.describe('QA round 2: End turn double-tap guard', () => {
  test('extra End turn taps in the 300ms after ending a turn do nothing (no discard)', async ({ page }) => {
    await openBoard(page);
    await toRunnerTurn(page);
    await waitEndTurnArmed(page);
    await checkGuard(page, (await layout(page)).endTurn!.box);
    const v = await getView(page);
    // Only one turn ended: the tap after the guard was the Corp's End turn, which opens
    // its hand-limit step (6 cards), not a turn end.
    expect(v.activePlayer).toBe('corp');
    expect(v.turn).toBe(3);
    expect(v.pendingDiscard).toBe(1);
  });

  test('after a 4-card discard, extra taps on the Confirm / End turn spot in the next 300ms do nothing', async ({ page }) => {
    await openBoard(page);
    await toRunnerTurn(page);
    for (let i = 0; i < 4; i++) await dispatch(page, { type: 'draw', player: 'runner' });
    await dispatch(page, { type: 'end_turn', player: 'runner' });
    let l = await waitIdle(page);
    for (const i of [0, 1, 2, 3]) await tap(page, l.hand[i]!.box);
    l = await layout(page);
    await checkGuard(page, l.picker!.confirm.box);
    const v = await getView(page);
    expect(v.activePlayer).toBe('corp');
    expect(v.turn).toBe(3);
    expect(v.pendingDiscard).toBe(1);
    expect(v.players.runner.handCount).toBe(5);
    expect(v.players.corp.handCount).toBe(6);
  });
});
