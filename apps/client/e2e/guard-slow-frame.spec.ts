// Ported from sprint-02-run-1005-superseded (28a0d9e); the second tap goes to where
// the next seat's End turn is, so it also covers desktop (its button moves with the seat).
//
// Architect review, Sprint 2 (regression): the End turn double-tap guard judges a
// tap by when it was made, not by when the page got round to handling it.
//
// Bug: the guard compared the time the game *handled* a tap with `armedAt`. On a
// slow phone the turn change's first frames can keep the page busy for longer than
// the 300ms guard; the second tap of a double tap, made ~150ms after the first, was
// then handled after `armedAt`, accepted, and ended the next player's turn too.
//
// Deterministic setup: the page is kept busy for 450ms right after the tap that ends
// the turn (standing in for slow frames), and the runner sends the second tap
// through the browser's input pipeline while it is busy. Touch input on every
// project: touch is delivered with the next frame, like on a phone.
import { expect, test, type Page } from '@playwright/test';
import { getView, layout, openBoard, sendTap, toRunnerTurn, waitEndTurnArmed, waitIdle } from './helpers';

interface Release {
  ts: number;
  handled: number;
  reached: boolean;
}

/** Ends the Runner's turn with a real tap, then taps the Corp's End turn `secondMs` later while the page is busy. */
async function doubleTapWhileBusy(page: Page, secondMs: number): Promise<{ first: Release; second: Release; armedAt: number }> {
  await openBoard(page);
  // Where the Corp's End turn will be once the turn has passed (the column layout
  // on desktop moves it with the seat; sideways phones keep it in place).
  const next = (await layout(page)).endTurn!.box;
  await toRunnerTurn(page);
  await waitEndTurnArmed(page);
  const spot = (await layout(page)).endTurn!.box;
  await page.evaluate(() => {
    const w = window as unknown as { __rel: Release[] };
    w.__rel = [];
    window.addEventListener('pointerup', (e) => {
      const input = window.__overclock!.lastInput();
      w.__rel.push({ ts: e.timeStamp, handled: performance.now(), reached: !!input && input.eventAt === e.timeStamp });
      if (w.__rel.length === 1) {
        const until = performance.now() + 450;
        while (performance.now() < until) {
          // busy: slow turn-change frames
        }
      }
    });
  });
  const first = sendTap(page, spot, { touch: true });
  await new Promise((r) => setTimeout(r, secondMs));
  const second = sendTap(page, next, { touch: true });
  await Promise.all([first, second]);
  await waitIdle(page);
  const out = await page.evaluate(() => ({
    rel: (window as unknown as { __rel: Release[] }).__rel,
    armedAt: window.__overclock!.endTurn().armedAt,
  }));
  test.info().annotations.push({
    type: 'guard',
    description: JSON.stringify(out.rel.map((r) => [Math.round(r.ts - out.rel[0]!.ts), Math.round(r.handled - out.rel[0]!.ts), r.reached])),
  });
  expect(out.rel.length, 'both taps reached the page').toBe(2);
  const [a, b] = out.rel as [Release, Release];
  expect(a.reached && b.reached, 'both taps reached a game target').toBe(true);
  // The scenario really happened: the second tap was handled after the guard opened.
  expect(b.handled, 'the second tap waited behind the busy page past the guard').toBeGreaterThanOrEqual(out.armedAt);
  return { first: a, second: b, armedAt: out.armedAt };
}

test.describe('End turn double-tap guard on a busy page (architect regression)', () => {
  test.use({ hasTouch: true });

  test('a second tap made inside the guard stays refused even when handled after it: only one turn ends', async ({ page }) => {
    const { first, second, armedAt } = await doubleTapWhileBusy(page, 150);
    expect(second.ts - first.ts, 'the second tap was made inside the 300ms guard').toBeLessThan(300);
    expect(second.ts).toBeLessThan(armedAt);
    const v = await getView(page);
    expect(v.activePlayer).toBe('corp');
    expect(v.turn).toBe(3);
    // The Corp's End turn was not pressed: no hand-limit step, all clicks left.
    expect(v.phase).toBe('action');
    expect(v.pendingDiscard).toBe(0);
    expect(v.players.corp.clicks).toBe(3);
  });

  test('control: a second tap made after the guard is answered, even when handled late', async ({ page }) => {
    const { second, armedAt } = await doubleTapWhileBusy(page, 400);
    expect(second.ts, 'the second tap was made after the guard').toBeGreaterThanOrEqual(armedAt);
    const v = await getView(page);
    // The Corp's End turn was pressed: with 6 cards it opens the hand-limit step.
    expect(v.activePlayer).toBe('corp');
    expect(v.phase).toBe('discard');
    expect(v.pendingDiscard).toBe(1);
  });
});
