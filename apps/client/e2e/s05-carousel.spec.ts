// S-05-3 (owner answer A, carousel): while a hand card is held so it zooms, the
// cards either side show smaller behind it; sliding moves the zoom and the
// cards behind slide past with it. QA-S4-1: the hand's zoom faces are drawn
// ahead while the finger is down, so a slide never waits for one.
import { type Page, expect, test } from '@playwright/test';
import { type Box, center, getView, holdAt, layout, openBoard, tap, waitZoom } from './helpers';
import { pixelStats } from './pixels';

type Zoom = NonNullable<Awaited<ReturnType<typeof layout>>['zoom']>;

async function zoomNow(page: Page): Promise<Zoom> {
  const z = (await layout(page)).zoom;
  expect(z).not.toBeNull();
  return z!;
}

const cx = (b: Box) => b.x + b.width / 2;

/** The carousel's final offsets and hand indices, left to right. */
const slots = (z: Zoom) => z.carousel.map((c) => [c.offset, c.index]);

/** Neighbours of hand slot `i` in a hand of `n`: [offset, index] pairs, left to right. */
function expected(i: number, n: number): number[][] {
  const out: number[][] = [];
  for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) if (k !== i) out.push([k - i, k]);
  return out;
}

test.describe('S-05-3 hand carousel', () => {
  test('holding a hand card shows its neighbours smaller behind the zoom, drawn ahead of time', async ({ page }) => {
    await openBoard(page, 1);
    const l = await layout(page);
    const n = l.hand.length;
    expect(n).toBeGreaterThanOrEqual(5);
    const h = await holdAt(page, l.hand[2]!.box);
    await waitZoom(page, l.hand[2]!.cardId);
    await page.waitForTimeout(300); // zoom-in finished
    const z = await zoomNow(page);
    expect(slots(z)).toEqual(expected(2, n));
    expect(z.carousel.map((c) => c.cardId)).toEqual(expected(2, n).map(([, k]) => l.hand[k!]!.cardId));
    for (const c of z.carousel) {
      // Smaller than the zoomed card, further out the further away, on its side of it.
      expect(c.box.height).toBeLessThan(z.box.height * 0.8);
      expect(Math.sign(cx(c.box) - cx(z.box))).toBe(Math.sign(c.offset));
      // Partly visible beside the zoomed card (not hidden behind it).
      const out = c.offset < 0 ? z.box.x - c.box.x : c.box.x + c.box.width - (z.box.x + z.box.width);
      expect(out).toBeGreaterThan(c.box.width * 0.2);
    }
    const near = z.carousel.find((c) => c.offset === 1)!;
    const far = z.carousel.find((c) => c.offset === 2)!;
    expect(far.box.height).toBeLessThan(near.box.height);
    // Pre-drawn: the real zoom faces, not stand-ins, by now.
    await page.waitForFunction(() => window.__overclock!.layout().zoom!.carousel.every((c) => c.full));
    // On screen: the visible strip of each neighbour is a drawn card, not the dimmed table.
    const strips = z.carousel.map((c) => {
      const w = c.box.width * 0.15;
      const x = c.offset < 0 ? c.box.x + 2 : c.box.x + c.box.width - w - 2;
      return { x, y: c.box.y + c.box.height * 0.3, width: w, height: c.box.height * 0.4 };
    });
    const stats = await pixelStats(page, strips);
    for (const s of stats) expect(s.spread).toBeGreaterThan(4);
    await test.info().attach('carousel', { body: await page.screenshot(), contentType: 'image/png' });
    await h.release();
  });

  test('sliding moves the zoom on and the cards behind slide past with it', async ({ page }) => {
    await openBoard(page, 1);
    const l = await layout(page);
    const n = l.hand.length;
    const h = await holdAt(page, l.hand[1]!.box);
    await waitZoom(page, l.hand[1]!.cardId);
    await page.waitForTimeout(300);
    const before = await zoomNow(page);
    expect(slots(before)).toEqual(expected(1, n));
    await page.evaluate(() => window.__overclock!.clearAnims());
    const c = center(l.hand[2]!.box);
    await h.move(c.x, c.y);
    await waitZoom(page, l.hand[2]!.cardId);
    await page.waitForTimeout(250); // any slide finished
    const after = await zoomNow(page);
    expect(slots(after)).toEqual(expected(2, n));
    // The card that was zoomed is now the left neighbour; the right neighbours moved one slot in.
    const was = after.carousel.find((x) => x.index === 1)!;
    expect(was.offset).toBe(-1);
    expect(cx(was.box)).toBeLessThan(cx(after.box));
    const b3 = before.carousel.find((x) => x.index === 3)!;
    const a3 = after.carousel.find((x) => x.index === 3)!;
    expect(a3.offset).toBe(1);
    expect(cx(a3.box)).toBeLessThan(cx(b3.box));
    expect(a3.box.height).toBeGreaterThan(b3.box.height);
    const slide = (await page.evaluate(() => window.__overclock!.anims())).filter((a) => a.kind === 'carousel_slide');
    expect(slide.map((a) => a.text)).toEqual([l.hand[2]!.cardId]);
    // ≤ 120ms when it slides; 0 when drawing frames is slow here and it jumps.
    expect(slide[0]!.scheduledMs).toBeLessThanOrEqual(120);
    await h.release();
  });

  test('at the first or last card the zoom stays on it and only the cards that exist show', async ({ page }) => {
    await openBoard(page, 1);
    const l = await layout(page);
    const n = l.hand.length;
    const h = await holdAt(page, l.hand[0]!.box);
    await waitZoom(page, l.hand[0]!.cardId);
    expect(slots(await zoomNow(page))).toEqual(expected(0, n));
    const vw = page.viewportSize()!.width;
    const y = center(l.hand[0]!.box).y;
    await h.move(vw - 2, y);
    await waitZoom(page, l.hand[n - 1]!.cardId);
    await h.move(vw - 1, y + 4);
    await page.waitForTimeout(150);
    let z = await zoomNow(page);
    expect(z.cardId).toBe(l.hand[n - 1]!.cardId);
    expect(slots(z)).toEqual(expected(n - 1, n));
    await h.move(1, y);
    await waitZoom(page, l.hand[0]!.cardId);
    await page.waitForTimeout(150);
    z = await zoomNow(page);
    expect(slots(z)).toEqual(expected(0, n));
    await h.release();
  });

  test('lifting the finger closes the zoom and the carousel, with nothing played or spent', async ({ page }) => {
    await openBoard(page, 1);
    const l = await layout(page);
    const before = await getView(page);
    const h = await holdAt(page, l.hand[1]!.box);
    await waitZoom(page, l.hand[1]!.cardId);
    const c = center(l.hand[3]!.box);
    await h.move(c.x, c.y);
    await waitZoom(page, l.hand[3]!.cardId);
    await h.release();
    await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
    await page.waitForTimeout(300);
    const after = await layout(page);
    expect(after.selected).toBeNull();
    expect(after.targets).toEqual([]);
    expect(await getView(page)).toEqual(before);
  });

  test('a quick tap on a hand card still picks it', async ({ page }) => {
    await openBoard(page, 1);
    const l = await layout(page);
    const view = await getView(page);
    const i = view.handOptions.findIndex((o) => o.some((x) => x.reject === null));
    expect(i).toBeGreaterThanOrEqual(0);
    await tap(page, l.hand[i]!.box);
    await page.waitForFunction((k) => window.__overclock!.layout().selected === k, i);
    expect((await layout(page)).zoom).toBeNull();
  });
});
