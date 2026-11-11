// S-00-4: Draw a card (tap the deck) and the "no clicks" hint.
import { expect, test } from '@playwright/test';
import { layout, openBoard, tap, waitIdle } from './helpers';

test.describe('S-00-4 draw', () => {
  test('tapping the Runner deck flies a card into the hand quickly and uses one click', async ({ page }) => {
    await openBoard(page);
    const before = await layout(page);
    const viewBefore = await page.evaluate(() => window.__overclock!.getView());

    // In the page: when the release happened (event timestamp, so any
    // queueing delay counts), when the game state reflected the draw (a
    // bubble listener runs after the game's own capture listener), and when
    // the flight landed.
    await page.evaluate(() => {
      const w = window as unknown as { __tapAt?: number; __stateAt?: number };
      const hand0 = window.__overclock!.getView().players.runner.handCount;
      window.addEventListener(
        'pointerup',
        (e) => {
          w.__tapAt = e.timeStamp;
          if (window.__overclock!.getView().players.runner.handCount === hand0 + 1) w.__stateAt = performance.now();
        },
        { once: true },
      );
    });
    await tap(page, before.runner.deck);
    const timing = await page.evaluate(
      () =>
        new Promise<{ stateMs: number; landedMs: number }>((resolve) => {
          const w = window as unknown as { __tapAt?: number; __stateAt?: number };
          const hook = window.__overclock!;
          const check = () => {
            if (w.__tapAt !== undefined && w.__stateAt !== undefined && !hook.layout().animating) {
              resolve({ stateMs: w.__stateAt - w.__tapAt, landedMs: performance.now() - w.__tapAt });
            } else requestAnimationFrame(check);
          };
          check();
        }),
    );
    test.info().annotations.push({ type: 'timing', description: JSON.stringify(timing) });
    // Tap response well under 100ms; the whole flight within the 600ms budget.
    expect(timing.stateMs).toBeLessThan(100);
    expect(timing.landedMs).toBeLessThan(600);

    const after = await layout(page);
    const view = await page.evaluate(() => window.__overclock!.getView());
    const events = await page.evaluate(() => window.__overclock!.lastEvents());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'card_drawn', player: 'runner' });
    expect(view.players.runner.handCount).toBe(viewBefore.players.runner.handCount + 1);
    expect(view.players.runner.clicks).toBe(viewBefore.players.runner.clicks - 1);
    expect(view.players.runner.deckCount).toBe(viewBefore.players.runner.deckCount - 1);
    expect(after.text.runnerClicks).toBe(String(viewBefore.players.runner.clicks - 1));
    expect(after.hand).toHaveLength(before.hand.length + 1);
    const drawnId = (events[0] as { cardId?: string }).cardId;
    expect(after.hand.at(-1)?.cardId).toBe(drawnId);
    // The new card landed inside the hand area.
    const landed = after.hand.at(-1)!.box;
    expect(landed.y).toBeGreaterThanOrEqual(after.handArea.y - 1);
    expect(landed.y + landed.height).toBeLessThanOrEqual(after.handArea.y + after.handArea.height + 1);
  });

  test('the card is mid-flight between deck and hand right after the tap', async ({ page }) => {
    await openBoard(page);
    const before = await layout(page);
    await tap(page, before.runner.deck);
    const mid = await layout(page);
    // Either still flying, or (on a very slow frame) already landed: never stuck at the deck.
    const settled = await waitIdle(page);
    expect(settled.hand).toHaveLength(before.hand.length + 1);
    if (mid.animating) {
      const flying = mid.hand.at(-1)!.box;
      const landed = settled.hand.at(-1)!.box;
      expect(flying.y).toBeLessThanOrEqual(landed.y + 1);
    }
  });

  test('rapid taps are never blocked by the animation', async ({ page }) => {
    await openBoard(page);
    const l = await layout(page);
    for (let i = 0; i < 4; i++) await tap(page, l.runner.deck);
    const view = await page.evaluate(() => window.__overclock!.getView());
    expect(view.players.runner.clicks).toBe(0);
    expect(view.players.runner.handCount).toBe(9);
    const after = await waitIdle(page);
    expect(after.hand).toHaveLength(9);
    expect(after.text.runnerClicks).toBe('0');
  });

  test('with 0 clicks, tapping the deck draws nothing and shows a "No clicks left" hint', async ({ page }) => {
    await openBoard(page);
    await page.evaluate(() => {
      for (let i = 0; i < 4; i++) window.__overclock!.dispatch({ type: 'draw', player: 'runner' });
    });
    const before = await waitIdle(page);
    const viewBefore = await page.evaluate(() => window.__overclock!.getView());
    expect(viewBefore.players.runner.clicks).toBe(0);
    expect(before.hint).toBeNull();

    await tap(page, before.runner.deck);
    const events = await page.evaluate(() => window.__overclock!.lastEvents());
    expect(events).toEqual([{ type: 'action_rejected', reason: 'no_clicks' }]);
    const view = await page.evaluate(() => window.__overclock!.getView());
    expect(view).toEqual(viewBefore);

    const shown = (await (
      await page.waitForFunction(() => {
        const l = window.__overclock!.layout();
        return l.hint?.text === 'No clicks left' ? l : null;
      })
    ).jsonValue())!;
    expect(shown.hand).toHaveLength(before.hand.length);
    const hint = shown.hint!.box;
    expect(hint.x).toBeGreaterThanOrEqual(0);
    expect(hint.x + hint.width).toBeLessThanOrEqual(shown.viewport.width);
    // Small: much smaller than the screen.
    expect(hint.width * hint.height).toBeLessThan(shown.viewport.width * shown.viewport.height * 0.1);

    // It goes away on its own (briefly shown).
    await page.waitForFunction(() => window.__overclock!.layout().hint === null, undefined, { timeout: 3000 });
  });
});
