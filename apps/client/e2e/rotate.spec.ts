// S-02-6 AC3: an upright phone shows "Turn your phone sideways" instead of the
// board, and turning the phone brings the game straight back where it was.
// Runs in an upright 390x844 touch context (the only spec that uses one).
import { type Page, expect, test } from '@playwright/test';
import { expectCleanLayout, getView, layout, openBoard, tap, waitIdle } from './helpers';

const UPRIGHT = { width: 390, height: 844 };
const SIDEWAYS = { width: 844, height: 390 };

async function waitViewport(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.waitForFunction(
    ([w, h]) => window.innerWidth === w && window.innerHeight === h,
    [size.width, size.height],
  );
}

test.describe('S-02-6 upright phone', () => {
  test.use({ viewport: UPRIGHT, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  test.skip(() => test.info().project.name !== 'phone', 'one upright phone run is enough');

  test('upright shows "Turn your phone sideways"; turning it shows the board, ready to play', async ({ page }) => {
    await openBoard(page);
    const prompt = page.locator('#rotate');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('Turn your phone sideways');
    const before = await getView(page);
    expect((await layout(page)).rotatePrompt).toBe(true);
    // Taps under the prompt never reach the game.
    await page.touchscreen.tap(195, 422);
    await page.touchscreen.tap(300, 700);
    expect(await getView(page)).toEqual(before);

    await page.setViewportSize(SIDEWAYS);
    await waitViewport(page, SIDEWAYS);
    await expect(prompt).toBeHidden();
    const l = await waitIdle(page);
    expect(l.rotatePrompt).toBe(false);
    expect(l.mode).toBe('phone');
    expect(l.viewport).toEqual(SIDEWAYS);
    expect(l.hand.map((h) => h.cardId)).toEqual(before.players.corp.hand);
    expectCleanLayout(l);
    // And it plays: tap the deck.
    await tap(page, l.corp.deck);
    expect((await getView(page)).players.corp.handCount).toBe(before.players.corp.handCount + 1);
  });

  test('turning upright mid-game and back keeps the game exactly where it was', async ({ page }) => {
    await page.setViewportSize(SIDEWAYS);
    await openBoard(page);
    let l = await layout(page);
    expect(l.rotatePrompt).toBe(false);
    await tap(page, l.corp.deck);
    await tap(page, l.corp.credits);
    const view = await getView(page);
    const handIds = (await waitIdle(page)).hand.map((h) => h.cardId);

    await page.setViewportSize(UPRIGHT);
    await waitViewport(page, UPRIGHT);
    await expect(page.locator('#rotate')).toBeVisible();
    expect((await layout(page)).rotatePrompt).toBe(true);
    expect(await getView(page)).toEqual(view);

    await page.setViewportSize(SIDEWAYS);
    await waitViewport(page, SIDEWAYS);
    await expect(page.locator('#rotate')).toBeHidden();
    l = await waitIdle(page);
    expect(await getView(page)).toEqual(view);
    expect(l.hand.map((h) => h.cardId)).toEqual(handIds);
    expect(l.text.corpCredits).toBe(String(view.players.corp.credits));
    expect(l.text.corpClicks).toBe(String(view.players.corp.clicks));
    expectCleanLayout(l);
  });
});

test.describe('S-02-6 computers are never asked to turn', () => {
  test('a narrow upright desktop window keeps the desktop board, no prompt', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'desktop (mouse) only');
    await page.setViewportSize(UPRIGHT);
    await openBoard(page);
    await expect(page.locator('#rotate')).toBeHidden();
    const l = await layout(page);
    expect(l.mode).toBe('desktop');
    expect(l.rotatePrompt).toBe(false);
    expectCleanLayout(l);
  });
});
