// S-05-1 (Last run, U4): after a run that found cards, a Last run button on the
// right of the board shows them again (hold one to read it). Tapping outside or
// Back closes the strip. It goes away when the Runner's turn ends, and the Corp
// seat never has it.
import { type Page, expect, test } from '@playwright/test';
import { expectCleanLayout, getView, holdAt, inside, layout, openBoard, overlaps, safeRect, tap, toStep, waitIdle, waitZoom } from './helpers';

async function toAfterAccess(page: Page): Promise<string[]> {
  await openBoard(page, 1);
  await toStep(page, 1, 'runner_after_access');
  const v = await getView(page);
  expect(v.lastRun).not.toBeNull();
  expect(v.lastRun!.cards.length).toBeGreaterThanOrEqual(2);
  return v.lastRun!.cards.map((c) => c.cardId);
}

test.describe('S-05-1 Last run', () => {
  test('the button is on the right of the board; tapping it shows the cards the run found, in order', async ({ page }) => {
    const ids = await toAfterAccess(page);
    let l = await layout(page);
    expectCleanLayout(l);
    const btn = l.lastRun.button!;
    expect(btn.label).toBe('Last run');
    expect(Math.min(btn.box.width, btn.box.height)).toBeGreaterThanOrEqual(44);
    expect(inside(btn.box, safeRect(l))).toBe(true);
    expect(btn.box.x + btn.box.width / 2).toBeGreaterThan(l.viewport.width / 2);
    await tap(page, btn.box);
    l = await layout(page);
    const strip = l.lastRun.strip!;
    expect(strip.title).toBe('Last run: Archives');
    expect(strip.cards.map((c) => c.cardId)).toEqual(ids);
    for (const c of strip.cards) expect(inside(c.box, safeRect(l))).toBe(true);
    // Non-blocking: the strip leaves the button, End turn and the hand free.
    for (const b of [btn.box, l.endTurn!.box, ...l.hand.map((h) => h.box)]) expect(overlaps(strip.box, b)).toBe(false);
    await test.info().attach('last run', { body: await page.screenshot(), contentType: 'image/png' });
    // Tapping the button again closes it.
    await tap(page, btn.box);
    expect((await layout(page)).lastRun.strip).toBeNull();
  });

  test('hold a card in the strip to read it; lifting changes nothing', async ({ page }) => {
    const ids = await toAfterAccess(page);
    let l = await layout(page);
    await tap(page, l.lastRun.button!.box);
    l = await layout(page);
    const before = await getView(page);
    const card = l.lastRun.strip!.cards[1]!;
    const h = await holdAt(page, card.box);
    await waitZoom(page, ids[1]!);
    expect((await layout(page)).zoom!.textOverflow).toBe(false);
    await h.release();
    await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
    expect(await getView(page)).toEqual(before);
    expect((await layout(page)).lastRun.strip).not.toBeNull();
  });

  test('a tap outside closes it (and still does its job); Back closes it too', async ({ page }) => {
    await toAfterAccess(page);
    let l = await layout(page);
    await tap(page, l.lastRun.button!.box);
    const credits = (await getView(page)).players.runner.credits;
    l = await layout(page);
    await tap(page, l.runner.credits);
    await page.waitForFunction(() => window.__overclock!.layout().lastRun.strip === null);
    expect((await getView(page)).players.runner.credits).toBe(credits + 1);
    l = await waitIdle(page);
    if (l.lastRun.button) {
      await tap(page, l.lastRun.button.box);
      expect(await page.evaluate(() => window.__overclock!.back())).toBe('close_panel');
      expect((await layout(page)).lastRun.strip).toBeNull();
    }
  });

  test('after End turn it is gone, and the Corp seat never shows it', async ({ page }) => {
    await toAfterAccess(page);
    let l = await layout(page);
    await tap(page, l.lastRun.button!.box);
    // Spend the turn, then End turn (hand-limit discards if any).
    await page.evaluate(() => {
      const hook = window.__overclock!;
      let v = hook.getView();
      while (v.activePlayer === 'runner' && v.players.runner.clicks > 0) {
        hook.dispatch({ type: 'gain_credit', player: 'runner' });
        v = hook.getView();
      }
    });
    l = await waitIdle(page);
    await tap(page, l.endTurn!.box);
    await page.waitForTimeout(400);
    let v = await getView(page);
    if (v.pendingDiscard > 0) {
      await page.evaluate((n) => window.__overclock!.dispatch({ type: 'discard', player: 'runner', handIndices: [...Array(n).keys()] }), v.pendingDiscard);
    }
    l = await waitIdle(page);
    v = await getView(page);
    expect(v.viewer).toBe('corp');
    expect(v.lastRun).toBeNull();
    expect(l.lastRun).toEqual({ button: null, strip: null });
    await test.info().attach('corp seat', { body: await page.screenshot(), contentType: 'image/png' });
  });
});
