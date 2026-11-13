// S-04-3: hold a hand card so it zooms, then slide the finger to read the rest
// of the hand. Lifting closes the zoom and picks nothing (owner answer A).
import { type Page, expect, test } from '@playwright/test';
import { type Box, center, getView, layout, openBoard, tap } from './helpers';

function isTouch(): boolean {
  return test.info().project.use.hasTouch === true;
}

interface Hold {
  /** Moves the held finger / mouse to x, y (CSS px). */
  move(x: number, y: number): Promise<void>;
  release(): Promise<void>;
}

/** Presses `b` (touch on the phone projects, mouse on desktop) and keeps it down. */
async function hold(page: Page, b: Box): Promise<Hold> {
  const { x, y } = center(b);
  if (isTouch()) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    return {
      move: async (mx, my) => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: mx, y: my }] });
      },
      release: async () => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
      },
    };
  }
  await page.mouse.move(x, y);
  await page.mouse.down();
  return {
    move: (mx, my) => page.mouse.move(mx, my),
    release: () => page.mouse.up(),
  };
}

async function waitZoom(page: Page, cardId: string): Promise<void> {
  await page.waitForFunction((id) => window.__overclock!.layout().zoom?.cardId === id, cardId);
}

/** Index of the outlined hand card (-1: none). */
async function outlined(page: Page): Promise<number> {
  return (await layout(page)).hand.findIndex((h) => h.outlined);
}

/** Opens the board and holds the first hand card until it zooms. */
async function holdFirst(page: Page): Promise<{ h: Hold; hand: { cardId: string; box: Box }[] }> {
  await openBoard(page, 1);
  const l = await layout(page);
  expect(l.hand.length).toBeGreaterThanOrEqual(4);
  const h = await hold(page, l.hand[0]!.box);
  await waitZoom(page, l.hand[0]!.cardId);
  expect(await outlined(page)).toBe(0);
  return { h, hand: l.hand };
}

test.describe('S-04-3 hold and slide through the hand', () => {
  test('a quick tap still picks the card to play', async ({ page }) => {
    await openBoard(page, 1);
    const l = await layout(page);
    const view = await getView(page);
    const i = view.handOptions.findIndex((o) => o.some((x) => x.reject === null));
    expect(i).toBeGreaterThanOrEqual(0);
    await tap(page, l.hand[i]!.box);
    await page.waitForFunction((n) => window.__overclock!.layout().selected === n, i);
    expect((await layout(page)).zoom).toBeNull();
  });

  test('sliding moves the zoom to the card under the finger and outlines it', async ({ page }) => {
    const { h, hand } = await holdFirst(page);
    for (const k of [1, 2, 3, 2]) {
      const c = center(hand[k]!.box);
      // Partway up the card, as a thumb would be: y does not matter.
      await h.move(c.x, c.y - hand[k]!.box.height * 0.3);
      await waitZoom(page, hand[k]!.cardId);
      expect(await outlined(page)).toBe(k);
      const z = (await layout(page)).zoom!;
      expect(z.textOverflow).toBe(false);
    }
    await test.info().attach('slide', { body: await page.screenshot(), contentType: 'image/png' });
    await h.release();
  });

  test('past the first or last card the zoom stays on it', async ({ page }) => {
    const { h, hand } = await holdFirst(page);
    const last = hand.length - 1;
    const vw = page.viewportSize()!.width;
    const y = center(hand[0]!.box).y;
    await h.move(vw - 2, y);
    await waitZoom(page, hand[last]!.cardId);
    expect(await outlined(page)).toBe(last);
    await h.move(vw - 1, y + 5);
    await page.waitForTimeout(100);
    expect(await outlined(page)).toBe(last);
    await h.move(1, y);
    await waitZoom(page, hand[0]!.cardId);
    expect(await outlined(page)).toBe(0);
    await h.release();
  });

  test('lifting after a slide closes the zoom and picks or spends nothing', async ({ page }) => {
    const { h, hand } = await holdFirst(page);
    const before = await getView(page);
    const c = center(hand[2]!.box);
    await h.move(c.x, c.y);
    await waitZoom(page, hand[2]!.cardId);
    await h.release();
    await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
    await page.waitForTimeout(300);
    const after = await layout(page);
    expect(after.zoom).toBeNull();
    expect(after.selected).toBeNull();
    expect(after.targets.length).toBe(0);
    expect(after.hand.some((x) => x.outlined)).toBe(false);
    expect(await getView(page)).toEqual(before);
  });

  test('the zoom changes in under 0.1 seconds after the finger moves', async ({ page }) => {
    const { h, hand } = await holdFirst(page);
    // When each move reached the page (DOM event time) and when the next frame after it ran.
    await page.evaluate(() => {
      const w = window as unknown as { __moves: number[] };
      w.__moves = [];
      window.addEventListener('pointermove', (e) => w.__moves.push(e.timeStamp), { capture: true });
    });
    await page.evaluate(() => window.__overclock!.clearAnims());
    const gaps: number[] = [];
    for (const k of [1, 2, 3, 1]) {
      const c = center(hand[k]!.box);
      await h.move(c.x, c.y);
      await waitZoom(page, hand[k]!.cardId);
    }
    const swaps = (await page.evaluate(() => window.__overclock!.anims())).filter((a) => a.kind === 'zoom_swap');
    const moves = await page.evaluate(() => (window as unknown as { __moves: number[] }).__moves);
    expect(swaps.map((s) => s.text)).toEqual([1, 2, 3, 1].map((k) => hand[k]!.cardId));
    for (const s of swaps) {
      // The swap's own input stamp is a real move the page saw.
      expect(moves).toContain(s.inputAt);
      gaps.push(s.startedAt - s.inputAt!);
    }
    test.info().annotations.push({ type: 'zoom-swap-ms', description: gaps.map((g) => g.toFixed(1)).join(',') });
    for (const g of gaps) expect(g).toBeLessThan(100);
    await h.release();
  });
});
