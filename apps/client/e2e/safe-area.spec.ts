// S-01-6 / S-02-6: nothing under the notch, status bar or gesture bar.
// The safe-area probe's padding is overridden with an injected style, which
// is exactly how a notched phone reports its insets (env(safe-area-inset-*)).
// Phones are held sideways, so the notch is on the left or the right and the
// swipe bar along the bottom.
import { expect, test } from '@playwright/test';
import type { Insets } from './helpers';
import { dispatch, expectCleanLayout, layout, openBoard, playUntilGameOver, toBusyBoard, toRunnerTurn, waitIdle } from './helpers';

const SHAPES: [string, Partial<Insets>][] = [
  ['notch on the left + swipe bar', { left: 47, bottom: 21 }],
  ['notch on the right + swipe bar', { right: 47, bottom: 21 }],
  ['swipe bar only', { bottom: 21 }],
];

for (const [name, insets] of SHAPES) {
  test.describe(`S-01-6 / S-02-6 safe area: ${name}`, () => {
    test('the board, End turn and hand sit inside the safe area on both turns', async ({ page }) => {
      await openBoard(page, { insets });
      const l = await layout(page);
      expect(l.safeArea).toEqual({ top: 0, right: 0, bottom: 0, left: 0, ...insets });
      expectCleanLayout(l);
      expect(l.endTurn).not.toBeNull();
      await toRunnerTurn(page);
      expectCleanLayout(await layout(page));
    });

    test('the discard picker, hints and game-over panel stay inside too', async ({ page }) => {
      await openBoard(page, { insets });
      for (let i = 0; i < 3; i++) await dispatch(page, { type: 'draw', player: 'corp' });
      await dispatch(page, { type: 'end_turn', player: 'corp' });
      await dispatch(page, { type: 'draw', player: 'corp' }); // refused: shows a hint
      const picking = await waitIdle(page);
      expect(picking.picker).not.toBeNull();
      const hint = (await page.evaluate(() => window.__overclock!.anims())).find((a) => a.kind === 'hint');
      expect(hint?.text).toBe('Pick your discards first');
      expectCleanLayout({ ...picking, hint: { text: hint!.text!, box: hint!.box! } });
      await playUntilGameOver(page);
      const over = await waitIdle(page);
      expect(over.gameOver).not.toBeNull();
      expectCleanLayout(over);
    });

    test('the busy board stays inside the safe area on both sides of the table', async ({ page }) => {
      await openBoard(page, { insets, seed: 4 });
      await toBusyBoard(page, 4);
      const a = await layout(page);
      expectCleanLayout(a);
      await dispatch(page, { type: 'end_turn', player: a.viewer });
      const v = await page.evaluate(() => window.__overclock!.getView());
      if (v.pendingDiscard > 0) await dispatch(page, { type: 'discard', player: v.viewer, handIndices: Array.from({ length: v.pendingDiscard }, (_, i) => i) });
      const b = await waitIdle(page);
      expect(b.viewer).not.toBe(a.viewer);
      expectCleanLayout(b);
    });

    test('a small 640x360 phone still fits everything inside the safe area, with 44px targets', async ({ page }) => {
      await page.setViewportSize({ width: 640, height: 360 });
      await openBoard(page, { insets });
      const l = await layout(page);
      expect(l.viewport).toEqual({ width: 640, height: 360 });
      expectCleanLayout(l);
      for (const b of [l.corp.deck, l.corp.credits, l.endTurn!.box, ...l.hand.map((h) => h.box)]) {
        expect(b.width).toBeGreaterThanOrEqual(44);
        expect(b.height).toBeGreaterThanOrEqual(44);
      }
    });
  });
}
