// QA (Sprint 1) extra checks, written independently of the UI developer's specs:
// - S-01-3 AC1: End turn really looks brighter on screen at 0 clicks (pixels, not just the hook flag).
// - S-01-5 AC3: discards fly to the actor's own discard pile.
// - S-01-6 AC2: the notch / gesture-bar bands are empty on screen (pixels), and a zoomed card stays inside.
// - Snappiness: the longest turn change (4 discards, then the Corp's free draw) never keeps input away > 600ms.
// - The End turn double-tap guard refuses extra taps for 300ms (poke timestamps fixed at construction, Sprint 2 U1).
import { expect, test, type Page } from '@playwright/test';
import type { AnimRecord, Box } from './helpers';
import { anims, dispatch, getView, layout, measureTap, openBoard, pressAndHold, safeRect, tap, toRunnerTurn, waitIdle } from './helpers';

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
  firstOk?: number;
  events?: string[];
}

/**
 * Armed in the page before the Confirm tap, so test-runner latency adds nothing:
 * watches every frame for the Corp's board, and from `fromMs` after the Confirm
 * release (page clock) taps the Corp's deck every 4ms until the game answers it.
 */
async function watchTurnChange(page: Page, fromMs: number): Promise<void> {
  await page.evaluate(
    (fromMs) => {
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
            const b = l.corp.deck;
            if (l.viewer === 'corp') {
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
    fromMs,
  );
}

async function turnChangeResult(page: Page): Promise<Required<TurnChangeWatch>> {
  await page.waitForFunction(() => {
    const qa = (window as unknown as { __qa: TurnChangeWatch }).__qa;
    return qa.flipAt !== undefined && qa.firstOk !== undefined;
  }, undefined, { timeout: 5000 });
  return page.evaluate(() => (window as unknown as { __qa: Required<TurnChangeWatch> }).__qa);
}

// Round 2 (QA-S1-1 fix) and Sprint 2 U1 hardening: the End turn double-tap guard
// compares each tap's own timestamp with the timestamp of the tap that ended the
// last turn. These tests build their "extra taps" so that their timestamps are
// fixed, however slow the machine is: inside the ending tap's release, a
// synchronous loop constructs each poke (a PointerEvent's timeStamp is the moment
// it was constructed) at its offset. Once the next seat's board is up, the pokes
// are dispatched in order. That models a busy phone that delivers taps late, and
// the result no longer depends on how late the test's own timers run.

interface Poke {
  /** Timestamp of the poke's release, in ms after the release of the tap that ended the turn. */
  at: number;
  accepted: boolean;
  events: string[];
}

interface PokeRun {
  pokes: Poke[];
  /** End turn's box on the new board when the pokes were dispatched. */
  endTurn: Box | null;
  done: boolean;
}

/**
 * Armed before the tap that ends a turn (End turn or Confirm, at `at`). Builds one
 * tap on `at` per offset, stamped `offset` ms after that tap's release, and
 * dispatches them once `seat`'s board shows End turn. With `stopAtFirst`, stops
 * after the first tap the game acts on.
 */
async function armPokes(page: Page, at: Box, seat: 'corp' | 'runner', offsets: readonly number[], stopAtFirst: boolean): Promise<void> {
  await page.evaluate(
    ({ at, seat, offsets, stopAtFirst }) => {
      const w = window as unknown as { __pokes?: PokeRun };
      const run: PokeRun = { pokes: [], endTurn: null, done: false };
      w.__pokes = run;
      window.addEventListener(
        'pointerup',
        (e) => {
          // Runs after the game handled this release (its listener is capture-phase).
          const t0 = e.timeStamp;
          const canvas = document.querySelector('canvas')!;
          const r = canvas.getBoundingClientRect();
          const init = { bubbles: true, cancelable: true, pointerId: 11, pointerType: 'mouse', isPrimary: true, button: 0,
            clientX: r.left + at.x + at.width / 2, clientY: r.top + at.y + at.height / 2 };
          const built: [PointerEvent, PointerEvent][] = [];
          for (const ms of offsets) {
            while (performance.now() < t0 + ms) {
              // Busy-wait: the poke must be constructed (stamped) at this offset.
            }
            built.push([new PointerEvent('pointerdown', { ...init, buttons: 1 }), new PointerEvent('pointerup', { ...init, buttons: 0 })]);
          }
          const hook = window.__overclock!;
          const fire = () => {
            const l = hook.layout();
            if (l.viewer !== seat || !l.endTurn) {
              setTimeout(fire, 2);
              return;
            }
            run.endTurn = l.endTurn.box;
            for (const [down, up] of built) {
              const before = JSON.stringify(hook.lastEvents());
              canvas.dispatchEvent(down);
              canvas.dispatchEvent(up);
              const events = hook.lastEvents();
              const accepted = JSON.stringify(events) !== before;
              run.pokes.push({ at: up.timeStamp - t0, accepted, events: accepted ? events.map((x) => x.type) : [] });
              if (accepted && stopAtFirst) break;
            }
            run.done = true;
          };
          setTimeout(fire, 0);
        },
        { once: true },
      );
    },
    { at, seat, offsets, stopAtFirst },
  );
}

async function pokesResult(page: Page): Promise<PokeRun> {
  await page.waitForFunction(() => (window as unknown as { __pokes: PokeRun }).__pokes.done, undefined, { timeout: 5000 });
  return page.evaluate(() => (window as unknown as { __pokes: PokeRun }).__pokes);
}

/** The pokes (aimed at `aimed`'s center) land on End turn: same center, give or take a pixel (the button pops in scale). */
function expectSameSpot(endTurn: Box | null, aimed: Box): void {
  expect(endTurn, 'End turn shown when the pokes were sent').not.toBeNull();
  const c = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  expect(Math.abs(c(endTurn!).x - c(aimed).x)).toBeLessThanOrEqual(1);
  expect(Math.abs(c(endTurn!).y - c(aimed).y)).toBeLessThanOrEqual(1);
}

function flipRecord(m: { anims: AnimRecord[] }, after: AnimRecord[]): AnimRecord | undefined {
  return [...m.anims, ...after].find((a) => a.kind === 'turn_flip');
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
    await watchTurnChange(page, 600);
    const m = await measureTap(page, l.picker!.confirm.box);
    expect(m.view.activePlayer).toBe('corp');
    // Every animation the tap started is scheduled to end within its own budget.
    for (const a of m.anims) expect(a.scheduledMs, a.kind).toBeLessThanOrEqual(600);
    const change = m.anims.find((a) => a.kind === 'turn_change');
    expect(change?.scheduledMs, 'discard flight + flip scheduled within 600ms').toBeLessThanOrEqual(600);
    const qa = await turnChangeResult(page);
    // The flip is started by a timer at its scheduled time (not by animation
    // frames, which a GPU-less runner delivers late), without any tap.
    const flip = flipRecord(m, await anims(page));
    expect(flip?.text, 'the flip was started by its timer').toBe('timer');
    test.info().annotations.push({
      type: 'timing',
      description: JSON.stringify({ flipStartMs: flip!.startedAt - m.tapAt, flipSeenMs: qa.flipAt - m.tapAt, firstDeckDrawMs: qa.firstOk }),
    });
    // A tap on the Corp's deck 600ms after Confirm draws a card.
    expect(qa.events).toContain('card_drawn');
  });

  // QA-S1-1 (see docs/sprints/sprint-01-qa.md): End turn used to ignore taps until 300ms
  // after the flip, which itself waits for the discard flight (~650-755ms after Confirm).
  // Fixed: the guard counts from the Confirm tap (its timestamp).
  test("after a 4-card discard, the next player's End turn answers within 600ms of Confirm", async ({ page }) => {
    await openBoard(page);
    await toRunnerTurn(page);
    for (let i = 0; i < 4; i++) await dispatch(page, { type: 'draw', player: 'runner' });
    await dispatch(page, { type: 'end_turn', player: 'runner' });
    let l = await waitIdle(page);
    for (const i of [0, 1, 2, 3]) await tap(page, l.hand[i]!.box);
    l = await layout(page);
    const confirm = l.picker!.confirm.box;
    // End turn taps stamped 0, 10, 20 ... 600ms after Confirm, sent once the Corp's board is up.
    const offsets = Array.from({ length: 61 }, (_, k) => k * 10);
    await armPokes(page, confirm, 'corp', offsets, true);
    const m = await measureTap(page, confirm);
    const run = await pokesResult(page);
    const after = await anims(page);
    const first = run.pokes.find((p) => p.accepted);
    const flip = flipRecord(m, after);
    test.info().annotations.push({
      type: 'timing',
      description: JSON.stringify({ endTurnFirstAnswerMs: first?.at, refused: run.pokes.filter((p) => !p.accepted).length, flipStartMs: flip && flip.startedAt - m.tapAt }),
    });
    // The pokes hit the new seat's End turn (same spot as Confirm).
    expectSameSpot(run.endTurn, confirm);
    expect(first, 'some End turn tap within 600ms of Confirm was answered').toBeDefined();
    expect(first!.at, 'End turn answered within 600ms of Confirm').toBeLessThanOrEqual(600);
    expect(first!.events).toContain('discard_required');
    // The double-tap guard still held before that.
    for (const p of run.pokes.filter((x) => !x.accepted)) expect(p.at).toBeLessThan(300);
    expect(first!.at).toBeGreaterThanOrEqual(300);
    // Budget: discard flight + flip scheduled within 600ms, and the flip started by its timer.
    const change = m.anims.find((a) => a.kind === 'turn_change');
    expect(change?.scheduledMs).toBeLessThanOrEqual(600);
    expect(flip?.text).toBe('timer');
  });
});

const OFFSETS = [5, 40, 80, 120, 160, 200, 240, 270] as const;

test.describe('QA round 2: End turn double-tap guard', () => {
  test('extra End turn taps in the 300ms after ending a turn do nothing (no discard)', async ({ page }) => {
    await openBoard(page);
    await toRunnerTurn(page);
    await page.waitForTimeout(350);
    const l = await layout(page);
    const btn = l.endTurn!.box;
    await armPokes(page, btn, 'corp', OFFSETS, false);
    await tap(page, btn);
    const run = await pokesResult(page);
    await waitIdle(page);
    const v = await getView(page);
    test.info().annotations.push({ type: 'pokes', description: JSON.stringify(run.pokes.map((p) => [Math.round(p.at), p.accepted])) });
    expectSameSpot(run.endTurn, btn);
    expect(run.pokes, 'every extra tap was sent').toHaveLength(OFFSETS.length);
    run.pokes.forEach((p, k) => {
      expect(p.at, 'stamped at its offset').toBeGreaterThanOrEqual(OFFSETS[k]!);
      expect(p.at, 'stamped inside the guard').toBeLessThan(300);
      expect(p.accepted, `tap ${Math.round(p.at)}ms after End turn`).toBe(false);
    });
    // Only one turn ended, and the Corp's 6 cards did not open the hand-limit step.
    expect(v.activePlayer).toBe('corp');
    expect(v.turn).toBe(3);
    expect(v.pendingDiscard).toBe(0);
  });

  test('after a 4-card discard, extra taps on the Confirm / End turn spot in the next 300ms do nothing', async ({ page }) => {
    await openBoard(page);
    await toRunnerTurn(page);
    for (let i = 0; i < 4; i++) await dispatch(page, { type: 'draw', player: 'runner' });
    await dispatch(page, { type: 'end_turn', player: 'runner' });
    let l = await waitIdle(page);
    for (const i of [0, 1, 2, 3]) await tap(page, l.hand[i]!.box);
    l = await layout(page);
    const confirm = l.picker!.confirm.box;
    await armPokes(page, confirm, 'corp', OFFSETS, false);
    await tap(page, confirm);
    const run = await pokesResult(page);
    await waitIdle(page);
    const v = await getView(page);
    test.info().annotations.push({ type: 'pokes', description: JSON.stringify({ pokes: run.pokes.map((p) => [Math.round(p.at), p.accepted]), confirm, endTurn: run.endTurn }) });
    // On the discard path the Confirm button and the next seat's End turn share a spot.
    expectSameSpot(run.endTurn, confirm);
    expect(run.pokes).toHaveLength(OFFSETS.length);
    run.pokes.forEach((p, k) => {
      expect(p.at).toBeGreaterThanOrEqual(OFFSETS[k]!);
      expect(p.at).toBeLessThan(300);
      expect(p.accepted, `tap ${Math.round(p.at)}ms after Confirm`).toBe(false);
    });
    expect(v.activePlayer).toBe('corp');
    expect(v.turn).toBe(3);
    expect(v.pendingDiscard).toBe(0);
    expect(v.players.runner.handCount).toBe(5);
    expect(v.players.corp.handCount).toBe(6);
  });
});
