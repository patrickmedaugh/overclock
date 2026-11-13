// S-04-2: the phone's Back button (owner answer A: "Leave the game?" with
// Leave / Stay) and redrawing every card after the GPU drops its surface.
// The web build drives Back through the test hook (`back()`), which runs the
// same handler the app's Back button does.
import { type Page, expect, test } from '@playwright/test';
import { type Box, expectCleanLayout, getView, inside, layout, openBoard, playUntilGameOver, pressAndHold, safeRect, tap, waitIdle } from './helpers';
import { pixelStats } from './pixels';

const back = (page: Page) => page.evaluate(() => window.__overclock!.back());
const exits = (page: Page) => page.evaluate(() => window.__overclock!.exitRequests());

function button(l: Awaited<ReturnType<typeof layout>>, label: string): Box {
  const b = l.dialog?.buttons.find((x) => x.label === label);
  expect(b, `${label} button`).toBeDefined();
  return b!.box;
}

test.describe('S-04-2 Back button', () => {
  test('during a game Back asks "Leave the game?"; Stay keeps the game exactly as it was', async ({ page }) => {
    await openBoard(page, { seed: 1, insets: { left: 30, bottom: 16 } });
    const view = await getView(page);
    expect(await back(page)).toBe('ask_leave');
    const l = await layout(page);
    expect(l.dialog?.title).toBe('Leave the game?');
    expect(l.dialog?.buttons.map((b) => b.label).sort()).toEqual(['Leave', 'Stay']);
    expect(inside(l.dialog!.box, safeRect(l))).toBe(true);
    for (const b of l.dialog!.buttons) {
      expect(inside(b.box, l.dialog!.box)).toBe(true);
      expect(b.box.width).toBeGreaterThanOrEqual(44);
      expect(b.box.height).toBeGreaterThanOrEqual(44);
    }
    await test.info().attach('leave-dialog', { body: await page.screenshot(), contentType: 'image/png' });

    // The board under the question takes no taps: a tap there means Stay.
    await tap(page, l.corp.deck);
    await page.waitForFunction(() => window.__overclock!.layout().dialog === null);
    expect(await getView(page)).toEqual(view);
    // A tap on the panel's text does nothing.
    expect(await back(page)).toBe('ask_leave');
    const d = (await layout(page)).dialog!;
    await tap(page, { x: d.box.x + d.box.width / 2 - 10, y: d.box.y + 4, width: 20, height: 12 });
    await page.waitForTimeout(200);
    expect((await layout(page)).dialog).not.toBeNull();
    expect(await getView(page)).toEqual(view);

    await tap(page, button(l, 'Stay'));
    await page.waitForFunction(() => window.__overclock!.layout().dialog === null);
    expect(await getView(page)).toEqual(view);
    expect(await exits(page)).toBe(0);
    // The game goes on.
    await tap(page, (await layout(page)).corp.credits);
    await page.waitForFunction((c) => window.__overclock!.getView().players.corp.credits === c + 1, view.players.corp.credits);
  });

  test('Back again (or a tap beside the question) means Stay', async ({ page }) => {
    await openBoard(page, 1);
    expect(await back(page)).toBe('ask_leave');
    expect(await back(page)).toBe('close_dialog');
    expect((await layout(page)).dialog).toBeNull();
    expect(await back(page)).toBe('ask_leave');
    const l = await layout(page);
    // Beside the panel: the top-left corner of the screen.
    await tap(page, { x: 2, y: 2, width: 20, height: 20 });
    await page.waitForFunction(() => window.__overclock!.layout().dialog === null);
    expect(await exits(page)).toBe(0);
    expect(l.dialog).not.toBeNull();
  });

  test('Leave closes the app', async ({ page }) => {
    await openBoard(page, 1);
    await back(page);
    await tap(page, button(await layout(page), 'Leave'));
    await expect.poll(() => exits(page)).toBe(1);
    expect((await layout(page)).dialog).toBeNull();
  });

  test('with a card zoomed, Back closes the zoom (no question)', async ({ page }) => {
    await openBoard(page, 1);
    const l = await layout(page);
    const release = await pressAndHold(page, l.hand[0]!.box);
    await page.waitForFunction(() => window.__overclock!.layout().zoom !== null);
    expect(await back(page)).toBe('close_zoom');
    await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
    expect((await layout(page)).dialog).toBeNull();
    await release();
    await page.waitForTimeout(100);
    expect((await layout(page)).selected).toBeNull();
  });

  test('on the game-over screen Back closes the app', async ({ page }) => {
    await openBoard(page, 1);
    await playUntilGameOver(page);
    expect((await waitIdle(page)).gameOver).not.toBeNull();
    expect(await back(page)).toBe('exit');
    expect(await exits(page)).toBe(1);
    expect((await layout(page)).dialog).toBeNull();
  });

  test('the question stays clear on a turned phone (relaid out on resize)', async ({ page }) => {
    await openBoard(page, 1);
    await back(page);
    const vp = page.viewportSize()!;
    await page.setViewportSize({ width: vp.width - 60, height: vp.height });
    await page.waitForFunction((w) => window.__overclock!.layout().viewport.width === w, vp.width - 60);
    const l = await layout(page);
    expect(l.dialog).not.toBeNull();
    expect(inside(l.dialog!.box, safeRect(l))).toBe(true);
    expectCleanLayout(l);
  });
});

test.describe('S-04-2 every card is drawn again after the GPU drops its surface', () => {
  test('after a WebGL context loss and restore, the hand and the board are not blank', async ({ page }) => {
    await openBoard(page, 1);
    const l = await waitIdle(page);
    const rects = [...l.hand.map((h) => h.box), l.corp.deck];
    const before = await pixelStats(page, rects);
    for (const s of before) expect(s.spread).toBeGreaterThan(8);

    const restored = await page.evaluate(async () => {
      const canvas = document.querySelector('#app canvas') as HTMLCanvasElement;
      const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
      const ext = gl?.getExtension('WEBGL_lose_context');
      if (!gl || !ext) return 'no extension';
      const lost = new Promise((r) => canvas.addEventListener('webglcontextlost', r, { once: true }));
      ext.loseContext();
      await lost;
      // Restoring is allowed only once the loss event has been fully handled.
      await new Promise((r) => setTimeout(r, 100));
      const back = new Promise((r) => canvas.addEventListener('webglcontextrestored', r, { once: true }));
      ext.restoreContext();
      await back;
      return 'restored';
    });
    expect(restored).toBe('restored');
    // A few frames to draw.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(200);
    const after = await pixelStats(page, rects);
    after.forEach((s, i) => {
      expect(s.spread, `card ${i} has a picture (not blank)`).toBeGreaterThan(8);
      expect(Math.abs(s.mean - before[i]!.mean), `card ${i} looks as before`).toBeLessThan(12);
    });
    await test.info().attach('after-restore', { body: await page.screenshot(), contentType: 'image/png' });
    // Still playable.
    const view = await getView(page);
    await tap(page, (await layout(page)).corp.credits);
    await page.waitForFunction((c) => window.__overclock!.getView().players.corp.credits === c + 1, view.players.corp.credits);
  });
});
