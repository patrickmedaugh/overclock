// S-01-6: nothing under the notch, status bar or gesture bar.
// The safe-area probe's padding is overridden with an injected style, which
// is exactly how a notched phone reports its insets (env(safe-area-inset-*)).
import { expect, test } from '@playwright/test';
import type { Insets } from './helpers';
import { dispatch, expectCleanLayout, layout, openBoard, playUntilGameOver, toRunnerTurn, waitIdle } from './helpers';

// Sideways phones (S-02-6): the notch is on the left or the right, the swipe
// bar at the bottom. The upright shapes stay for desktop/tablet windows.
const SHAPES: [string, Partial<Insets>][] = [
  // Upright shapes (@upright: not run on the sideways phone projects, see playwright.config.ts).
  ['iPhone notch + home bar @upright', { top: 47, bottom: 34 }],
  ['Android status bar + gesture bar @upright', { top: 24, bottom: 48 }],
  ['sideways Android, status bar + gesture bar', { top: 24, bottom: 20 }],
  ['sideways, notch on the left + swipe bar', { left: 47, bottom: 21 }],
  ['sideways, notch on the right + swipe bar', { right: 47, bottom: 21 }],
  ['sideways iPhone, both sides + home bar', { left: 47, right: 47, bottom: 21 }],
];

/** The small phone: sideways on the phone projects and for sideways shapes; a 360x640 window for upright shapes on desktop. */
function smallPhone(insets: Partial<Insets>): { width: number; height: number } {
  const upright = (insets.top ?? 0) + (insets.bottom ?? 0) > 50;
  return test.info().project.use.hasTouch || !upright ? { width: 640, height: 360 } : { width: 360, height: 640 };
}

for (const [name, insets] of SHAPES) {
  test.describe(`S-01-6 safe area: ${name}`, () => {
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

    test('a small phone (640x360 sideways; 360x640 window on desktop) still fits everything inside the safe area', async ({ page }) => {
      const size = smallPhone(insets);
      await page.setViewportSize(size);
      await openBoard(page, { insets });
      const l = await layout(page);
      expect(l.viewport).toEqual(size);
      expectCleanLayout(l);
      for (const b of [l.corp.deck, l.corp.credits, l.endTurn!.box]) {
        expect(b.width).toBeGreaterThanOrEqual(44);
        expect(b.height).toBeGreaterThanOrEqual(44);
      }
    });
  });
}
