// S-05-3 / QA-S4-1: when the held finger slides to another hand card, the new
// zoom face is on screen within 0.1 s (input time to the drawn frame), the
// face was drawn ahead of time (no drawing on the spot), and the carousel
// slide never holds up the next move. Timing story: run it repeated and at 6x
// CPU slow-down (E2E_CPU_THROTTLE=6), per docs/TESTING.md.
import { expect, test } from '@playwright/test';
import { center, holdAt, layout, openBoard, waitZoom } from './helpers';

test('slide to the next card: new face on screen < 100 ms after the move, drawn ahead', async ({ page }) => {
  await openBoard(page, 1);
  const hand = (await layout(page)).hand;
  expect(hand.length).toBeGreaterThanOrEqual(5);
  const h = await holdAt(page, hand[0]!.box);
  await waitZoom(page, hand[0]!.cardId);
  // The hold delay plus this pause: the pre-draw has finished.
  await page.waitForFunction(() => window.__overclock!.layout().zoom!.carousel.every((c) => c.full));
  await page.waitForTimeout(200);
  // The first animation frame (after Pixi's render callback, registered earlier) in which a new zoom_swap is logged.
  await page.evaluate(() => {
    const w = window as unknown as { __t: { t: number; n: number }[] };
    w.__t = [];
    let seen = 0;
    const loop = () => {
      const n = window.__overclock!.anims().filter((a) => a.kind === 'zoom_swap').length;
      if (n !== seen) {
        seen = n;
        w.__t.push({ t: performance.now(), n });
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.__overclock!.clearAnims();
    seen = 0;
  });
  const path = [1, 2, 3, 4, 3, 2, 1, 0, 1, 2];
  const gaps: number[] = [];
  for (const k of path) {
    const n = await page.evaluate(() => (window as unknown as { __t: unknown[] }).__t.length);
    const c = center(hand[k]!.box);
    await h.move(c.x, c.y);
    await waitZoom(page, hand[k]!.cardId);
    await page.waitForFunction((m) => (window as unknown as { __t: unknown[] }).__t.length > m, n);
    gaps.push(
      await page.evaluate(() => {
        const swap = window.__overclock!.anims().filter((a) => a.kind === 'zoom_swap').at(-1)!;
        return (window as unknown as { __t: { t: number }[] }).__t.at(-1)!.t - swap.inputAt!;
      }),
    );
  }
  const swaps = (await page.evaluate(() => window.__overclock!.anims())).filter((a) => a.kind === 'zoom_swap');
  expect(swaps.map((s) => s.text)).toEqual(path.map((k) => hand[k]!.cardId));
  // QA-S4-1: every face was drawn ahead (none on the spot).
  expect(swaps.map((s) => s.predrawn)).toEqual(path.map(() => true));
  test.info().annotations.push({ type: 'zoom-frame-ms', description: gaps.map((g) => g.toFixed(1)).join(',') });
  for (const g of gaps) expect(g).toBeLessThan(100);
  await h.release();
});
