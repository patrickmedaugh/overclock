// S-00-4: Long-press a hand card to zoom it; release to let go.
import { getCard } from '@overclock/cards';
import { expect, test } from './fixtures';
import { inside, layout, openBoard, pressAndHold, safeRect, tap } from './helpers';

test.describe('S-00-4 zoom', () => {
  test('long-press zooms a hand card to readable size and release closes it', async ({ page }) => {
    await openBoard(page);
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
    const l = await layout(page);
    const release = await pressAndHold(page, l.hand[0]!.box);
    await release();
    await page.waitForTimeout(600);
    expect((await layout(page)).zoom).toBeNull();
  });

  test('a quick tap on a hand card does not zoom or change the game', async ({ page }) => {
    await openBoard(page);
    const l = await layout(page);
    const view = await page.evaluate(() => window.__overclock!.getView());
    await tap(page, l.hand[0]!.box);
    await page.waitForTimeout(500);
    expect((await layout(page)).zoom).toBeNull();
    expect(await page.evaluate(() => window.__overclock!.getView())).toEqual(view);
  });
});
