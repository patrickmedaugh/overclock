// S-00-3: The game board.
import { expect, test } from '@playwright/test';
import { expectCleanLayout, layout, openBoard, waitIdle } from './helpers';

test.describe('S-00-3 board', () => {
  test('Corp side is at the top and Runner side at the bottom, each with deck, credits and clicks', async ({ page }) => {
    await openBoard(page);
    const l = await layout(page);
    const corpBottom = Math.max(...[l.corp.deck, l.corp.credits, l.corp.clicks].map((b) => b.y + b.height));
    const runnerTop = Math.min(...[l.runner.deck, l.runner.credits, l.runner.clicks].map((b) => b.y));
    expect(corpBottom).toBeLessThan(runnerTop);
    expect(corpBottom).toBeLessThan(l.viewport.height / 2);
    expect(runnerTop).toBeGreaterThan(l.viewport.height / 2);
    for (const b of [l.corp.deck, l.corp.credits, l.corp.clicks, l.runner.deck, l.runner.credits, l.runner.clicks]) {
      expect(b.width).toBeGreaterThan(0);
      expect(b.height).toBeGreaterThan(0);
    }
    // Counters show what the engine says.
    const view = await page.evaluate(() => window.__overclock!.getView());
    expect(l.text).toEqual({
      corpCredits: String(view.players.corp.credits),
      corpClicks: String(view.players.corp.clicks),
      runnerCredits: String(view.players.runner.credits),
      runnerClicks: String(view.players.runner.clicks),
    });
    // The Runner's opening hand is shown.
    expect(l.hand.map((h) => h.cardId)).toEqual(view.players.runner.hand);
  });

  test('nothing is cut off or overlapping on load', async ({ page }, testInfo) => {
    await openBoard(page);
    expectCleanLayout(await layout(page));
    await testInfo.attach('board', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('nothing is cut off or overlapping with a full hand', async ({ page }) => {
    await openBoard(page);
    await page.evaluate(() => {
      for (let i = 0; i < 4; i++) window.__overclock!.dispatch({ type: 'draw', player: 'runner' });
    });
    const l = await waitIdle(page);
    expect(l.hand).toHaveLength(9);
    expectCleanLayout(l);
  });

  test('re-lays out when the window is resized', async ({ page }) => {
    await openBoard(page);
    const before = page.viewportSize()!;
    const sizes = [
      { width: 360, height: 640 },
      { width: 1024, height: 700 },
      before,
    ];
    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.waitForFunction(
        ([w, h]) => {
          const v = window.__overclock!.layout().viewport;
          return v.width === w && v.height === h;
        },
        [size.width, size.height],
      );
      expectCleanLayout(await layout(page));
    }
  });
});
