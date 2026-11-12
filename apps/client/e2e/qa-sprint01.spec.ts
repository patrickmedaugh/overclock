// QA (Sprint 1) extra checks, written independently of the UI developer's specs:
// - S-01-3 AC1: End turn really looks brighter on screen at 0 clicks (pixels, not just the hook flag).
// - S-01-5 AC3: discards fly to the actor's own discard pile.
// - S-01-6 AC2: the notch / gesture-bar bands are empty on screen (pixels), and a zoomed card stays inside.
// - Snappiness: the longest turn change (4 discards, then the Corp's free draw) never keeps input away > 600ms.
import { expect, test, type Page } from '@playwright/test';
import type { Box } from './helpers';
import { dispatch, getView, layout, measureTap, openBoard, pressAndHold, safeRect, tap, toRunnerTurn, waitIdle } from './helpers';

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
    test.info().annotations.push({ type: 'timing', description: JSON.stringify({ flipMs: qa.flipAt - m.tapAt, endTurnFirstAnswerMs: qa.firstOk }) });
    expect(qa.events).toContain('discard_required');
    expect(qa.firstOk, 'End turn answered within 600ms of Confirm').toBeLessThanOrEqual(600);
  });
});

// Round 2 (QA-S1-1 fix): the End turn double-tap guard now counts from the tap that
// ended the last turn. Check that extra taps in the next 300ms still do nothing, so a
// fast double (or triple) tap cannot end two turns. On the discard path the Confirm
// button and the next seat's End turn sit in the same spot.

interface Poke {
  /** ms after the release of the tap that ended the turn (page clock). */
  at: number;
  accepted: boolean;
}

/**
 * Armed before the tap that ends a turn. From that tap's release, taps the spot `at`
 * (and End turn, wherever it is once shown) at each of `offsets` ms, recording when
 * each tap really happened and whether the game acted on it.
 */
async function pokeAfterTap(page: Page, at: Box, offsets: readonly number[]): Promise<void> {
  await page.evaluate(
    ([at, offsets]) => {
      const w = window as unknown as { __pokes?: Poke[] };
      const pokes: Poke[] = [];
      w.__pokes = pokes;
      window.addEventListener(
        'pointerup',
        (e) => {
          const t0 = e.timeStamp;
          const canvas = document.querySelector('canvas')!;
          const r = canvas.getBoundingClientRect();
          const hook = window.__overclock!;
          const hit = (b: { x: number; y: number; width: number; height: number }) => {
            const init = { bubbles: true, cancelable: true, pointerId: 11, pointerType: 'mouse', isPrimary: true, button: 0,
              clientX: r.left + b.x + b.width / 2, clientY: r.top + b.y + b.height / 2 };
            const before = JSON.stringify(hook.lastEvents());
            const when = performance.now() - t0;
            canvas.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
            canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
            pokes.push({ at: when, accepted: JSON.stringify(hook.lastEvents()) !== before });
          };
          for (const ms of offsets) {
            setTimeout(() => {
              hit(at);
              const b = hook.layout().endTurn?.box;
              if (b) hit(b);
            }, Math.max(0, t0 + ms - performance.now()));
          }
        },
        { once: true },
      );
    },
    [at, offsets] as const,
  );
}

const OFFSETS = [5, 40, 80, 120, 160, 200, 240, 270] as const;

async function pokesResult(page: Page): Promise<Poke[]> {
  await page.waitForFunction((n) => ((window as unknown as { __pokes: Poke[] }).__pokes.length >= n), OFFSETS.length);
  await page.waitForTimeout(100);
  return page.evaluate(() => (window as unknown as { __pokes: Poke[] }).__pokes);
}

test.describe('QA round 2: End turn double-tap guard', () => {
  test('extra End turn taps in the 300ms after ending a turn do nothing (no discard)', async ({ page }) => {
    await openBoard(page);
    await toRunnerTurn(page);
    await page.waitForTimeout(350);
    const l = await layout(page);
    const btn = l.endTurn!.box;
    await pokeAfterTap(page, btn, OFFSETS);
    await tap(page, btn);
    const pokes = await pokesResult(page);
    await waitIdle(page);
    const v = await getView(page);
    test.info().annotations.push({ type: 'pokes', description: JSON.stringify(pokes.map((p) => [Math.round(p.at), p.accepted])) });
    for (const p of pokes.filter((x) => x.at < 300)) expect(p.accepted, `tap ${Math.round(p.at)}ms after End turn`).toBe(false);
    expect(pokes.filter((x) => x.at < 300).length, 'extra taps landed inside the guard').toBeGreaterThanOrEqual(1);
    // Only one turn ended. (A tap that the timers delivered after 300ms is a new, allowed
    // tap: on the Corp's 6 cards it opens the hand-limit step, which is not a turn end.)
    expect(v.activePlayer).toBe('corp');
    expect(v.turn).toBe(3);
    if (!pokes.some((p) => p.accepted)) expect(v.pendingDiscard).toBe(0);
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
    await pokeAfterTap(page, confirm, OFFSETS);
    await tap(page, confirm);
    const pokes = await pokesResult(page);
    await waitIdle(page);
    const v = await getView(page);
    const after = await layout(page);
    test.info().annotations.push({ type: 'pokes', description: JSON.stringify({ pokes: pokes.map((p) => [Math.round(p.at), p.accepted]), confirm, endTurn: after.endTurn?.box }) });
    for (const p of pokes.filter((x) => x.at < 300)) expect(p.accepted, `tap ${Math.round(p.at)}ms after Confirm`).toBe(false);
    expect(pokes.filter((x) => x.at < 300).length, 'extra taps landed inside the guard').toBeGreaterThanOrEqual(1);
    expect(v.activePlayer).toBe('corp');
    expect(v.turn).toBe(3);
    if (!pokes.some((p) => p.accepted)) expect(v.pendingDiscard).toBe(0);
    expect(v.players.runner.handCount).toBe(5);
    expect(v.players.corp.handCount).toBe(6);
  });
});
