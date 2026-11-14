// S-00-4: Long-press a hand card to zoom it; release to let go.
// S-07-6: outside the discard picker a press on the hand opens the hand view
// (s07-hand.spec.ts), so the hold-to-zoom checks run where it still lives: the
// hand-limit discard picker. The last two tests cover the hand view's side.
import { type Page, expect, test } from '@playwright/test';
import { getCard } from '@overclock/cards';
import { dispatch, inside, layout, openBoard, pressAndHold, safeRect, tap, waitIdle } from './helpers';

/** The Corp ends turn 1 holding 6 cards: the discard picker is up. */
async function toDiscardPicker(page: Page): Promise<void> {
  await dispatch(page, { type: 'end_turn', player: 'corp' });
  await waitIdle(page);
  expect((await layout(page)).picker).not.toBeNull();
}

test.describe('S-00-4 zoom', () => {
  test('long-press zooms a hand card to readable size and release closes it', async ({ page }) => {
    await openBoard(page);
    await toDiscardPicker(page);
    const l = await layout(page);
    const target = l.hand[1]!;
    const release = await pressAndHold(page, target.box);
    await page.waitForFunction(
      (id) => {
        const z = window.__overclock!.layout().zoom;
        return z?.cardId === id && !window.__overclock!.layout().animating;
      },
      target.cardId,
    );
    // Let the zoom-in tween settle.
    await page.waitForTimeout(250);
    const zoomed = await layout(page);
    const z = zoomed.zoom!;
    expect(z.cardId).toBe(target.cardId);
    expect(z.box.width).toBeGreaterThan(target.box.width * 2.5);
    expect(inside(z.box, safeRect(zoomed))).toBe(true);

    // It shows the card's name, type, cost and rules text.
    const def = getCard(target.cardId)!;
    expect(z.texts).toContain(def.name);
    expect(z.texts).toContain(String(def.cost));
    expect(z.texts).toContain(def.text);
    expect(z.texts.some((t) => t.toLowerCase().includes(def.type))).toBe(true);

    await test.info().attach('zoom', { body: await page.screenshot(), contentType: 'image/png' });

    await release();
    await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
  });

  test('zooms only after the ~350ms long-press delay, not before', async ({ page }) => {
    await openBoard(page);
    await toDiscardPicker(page);
    const l = await layout(page);
    // Record (in the page) when the press started and when the zoom first appeared.
    await page.evaluate(() => {
      const w = window as unknown as { __downAt?: number; __zoomAt?: number };
      window.addEventListener('pointerdown', () => (w.__downAt = performance.now()), { capture: true, once: true });
      const poll = () => {
        if (window.__overclock!.layout().zoom && w.__downAt !== undefined) w.__zoomAt = performance.now();
        else requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
    const release = await pressAndHold(page, l.hand[0]!.box);
    await page.waitForFunction(() => (window as unknown as { __zoomAt?: number }).__zoomAt !== undefined);
    const delay = await page.evaluate(() => {
      const w = window as unknown as { __downAt: number; __zoomAt: number };
      return w.__zoomAt - w.__downAt;
    });
    test.info().annotations.push({ type: 'long-press-ms', description: String(Math.round(delay)) });
    expect(delay).toBeGreaterThanOrEqual(340);
    await release();
    await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
  });

  test('releasing early never zooms', async ({ page }) => {
    await openBoard(page);
    await toDiscardPicker(page);
    const l = await layout(page);
    const release = await pressAndHold(page, l.hand[0]!.box);
    await release();
    await page.waitForTimeout(600);
    expect((await layout(page)).zoom).toBeNull();
  });

  test('a quick tap on a hand card in the discard picker marks it and does not zoom', async ({ page }) => {
    await openBoard(page);
    await toDiscardPicker(page);
    const l = await layout(page);
    const view = await page.evaluate(() => window.__overclock!.getView());
    await tap(page, l.hand[0]!.box);
    await page.waitForTimeout(500);
    const after = await layout(page);
    expect(after.zoom).toBeNull();
    expect(after.handView).toBeNull();
    expect(after.hand[0]!.marked).toBe(true);
    expect(await page.evaluate(() => window.__overclock!.getView())).toEqual(view);
  });

  test('S-07-6: outside the picker a quick tap on a hand card opens the hand view and changes nothing in the game', async ({ page }) => {
    await openBoard(page);
    const l = await layout(page);
    const view = await page.evaluate(() => window.__overclock!.getView());
    await tap(page, l.hand[0]!.box);
    await page.waitForTimeout(500);
    const after = await layout(page);
    expect(after.handView).toMatchObject({ index: 0, cardId: l.hand[0]!.cardId, lifted: false });
    expect(after.zoom!.cardId).toBe(l.hand[0]!.cardId);
    expect(after.selected).toBeNull();
    expect(after.targets).toEqual([]);
    expect(await page.evaluate(() => window.__overclock!.getView())).toEqual(view);
  });

  test('S-07-6: holding a hand card opens the hand view on it after the long-press delay, and it stays open after lifting', async ({ page }) => {
    await openBoard(page);
    const l = await layout(page);
    const view = await page.evaluate(() => window.__overclock!.getView());
    const release = await pressAndHold(page, l.hand[1]!.box);
    await page.waitForFunction((id) => window.__overclock!.layout().handView?.cardId === id, l.hand[1]!.cardId);
    await release();
    await page.waitForTimeout(400);
    const after = await layout(page);
    expect(after.handView).toMatchObject({ index: 1, lifted: false });
    expect(after.zoom!.cardId).toBe(l.hand[1]!.cardId);
    expect(after.selected).toBeNull();
    expect(await page.evaluate(() => window.__overclock!.getView())).toEqual(view);
  });
});
