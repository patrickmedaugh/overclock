// S-02-6 (landscape phones): an upright phone shows "Turn your phone sideways" over
// the still-running game; turning it back shows the same board. Runs only in the
// `portrait` project (390x844, touch).
import { expect, test, type Page } from '@playwright/test';
import { dispatch, getView, layout, openBoard, waitIdle } from './helpers';

const PROMPT = 'Turn your phone sideways';
const UPRIGHT = { width: 390, height: 844 };
const SIDEWAYS = { width: 844, height: 390 };

/**
 * `setViewportSize` returns before the page's `resize` handler runs, so wait
 * until the game has laid out for `size` (and is idle) before reading the board.
 */
async function waitForViewport(page: Page, size: { width: number; height: number }) {
  await page.waitForFunction(
    ({ width, height }) => {
      const l = window.__overclock!.layout();
      return l.viewport.width === width && l.viewport.height === height && !l.animating;
    },
    size,
    { polling: 'raf' },
  );
  return waitIdle(page);
}

test.describe('S-02-6 turn your phone sideways', () => {
  test('an upright phone shows the prompt over the game, and it covers the whole screen', async ({ page }) => {
    await openBoard(page);
    const prompt = page.locator('#rotate');
    await expect(prompt).toBeVisible();
    await expect(prompt).toHaveText(PROMPT);
    const box = (await prompt.boundingBox())!;
    expect(box).toEqual({ x: 0, y: 0, ...UPRIGHT });
    // Taps land on the prompt, not on the game underneath.
    const hit = await page.evaluate(({ width, height }) => document.elementFromPoint(width / 2, height / 2)?.closest('#rotate') !== null, UPRIGHT);
    expect(hit).toBe(true);
    // The game itself is running underneath.
    expect((await getView(page)).activePlayer).toBe('corp');
  });

  test('turning the phone sideways hides the prompt at once and the game is playable', async ({ page }) => {
    await openBoard(page);
    await expect(page.locator('#rotate')).toBeVisible();
    await page.setViewportSize(SIDEWAYS);
    // Pure CSS: hidden on the same frame as the resize.
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('rotate')!).display)).toBe('none');
    await expect(page.locator('#rotate')).toBeHidden();
    const l = await waitForViewport(page, SIDEWAYS);
    expect(l.viewport).toEqual(SIDEWAYS);
    const hit = await page.evaluate(({ width, height }) => document.elementFromPoint(width / 2, height / 2)?.tagName, SIDEWAYS);
    expect(hit).toBe('CANVAS');
  });

  test('rotating upright and back keeps the same game and restores the same board', async ({ page }) => {
    await page.setViewportSize(SIDEWAYS);
    await openBoard(page);
    await waitForViewport(page, SIDEWAYS);
    // Some play first, so there is state to lose.
    await dispatch(page, { type: 'draw', player: 'corp' });
    await dispatch(page, { type: 'gain_credit', player: 'corp' });
    const before = await waitIdle(page);
    const viewBefore = await getView(page);
    await expect(page.locator('#rotate')).toBeHidden();

    await page.setViewportSize(UPRIGHT);
    await expect(page.locator('#rotate')).toBeVisible();
    // While upright, the game keeps its state (nothing reset or reloaded).
    expect(await getView(page)).toEqual(viewBefore);

    await page.setViewportSize(SIDEWAYS);
    await expect(page.locator('#rotate')).toBeHidden();
    const after = await waitForViewport(page, SIDEWAYS);
    expect(await getView(page)).toEqual(viewBefore);
    expect(after).toEqual(before);
    expect((await layout(page)).text.banner).toBe(before.text.banner);
  });

  test('desktop windows and tablets never show the prompt, even when tall', async ({ browser }) => {
    for (const opts of [
      { viewport: UPRIGHT, hasTouch: false, isMobile: false }, // narrow desktop window (mouse)
      { viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true }, // upright tablet
    ]) {
      const context = await browser.newContext(opts);
      const page = await context.newPage();
      await openBoard(page);
      await expect(page.locator('#rotate')).toBeHidden();
      await context.close();
    }
  });
});

test('the web app manifest asks for landscape', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = (await (await request.get(new URL(href!, page.url()).toString())).json()) as { orientation: string };
  expect(manifest.orientation).toBe('landscape');
});
