// S-04-1: a small build date shows in a corner of the board (web and app), so
// the owner can tell which version they have. It never covers anything.
import { expect, test } from '@playwright/test';
import { dispatch, expectCleanLayout, inside, layout, openBoard, safeRect, startRun, toBusyBoard, toRunnerTurn, waitIdle } from './helpers';

const BUILT = /^Built \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/;

test.describe('S-04-1 build date', () => {
  test('shows small, inside the safe area, without covering anything, on both turns', async ({ page }) => {
    await openBoard(page, { insets: { left: 30, bottom: 16 } });
    const l = await layout(page);
    expect(l.buildLabel?.text).toMatch(BUILT);
    const b = l.buildLabel!.box;
    expect(inside(b, safeRect(l))).toBe(true);
    // Small: a corner note, not a headline.
    expect(b.height).toBeLessThanOrEqual(24);
    expectCleanLayout(l);
    await toRunnerTurn(page);
    const r = await layout(page);
    expect(r.buildLabel?.text).toBe(l.buildLabel!.text);
    expectCleanLayout(r);
    await test.info().attach('build-date', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('stays clear on a busy board and during a run', async ({ page }) => {
    await openBoard(page, 4);
    await toBusyBoard(page, 4);
    const busy = await layout(page);
    expectCleanLayout(busy);
    expect(busy.buildLabel).not.toBeNull();
    if (busy.viewer === 'corp') {
      await dispatch(page, { type: 'end_turn', player: 'corp' });
      const v = await page.evaluate(() => window.__overclock!.getView());
      if (v.pendingDiscard > 0) await dispatch(page, { type: 'discard', player: 'corp', handIndices: Array.from({ length: v.pendingDiscard }, (_, i) => i) });
      await waitIdle(page);
    }
    const l = await startRun(page, 'hq');
    expect(l.run).not.toBeNull();
    expectCleanLayout(l);
  });
});
