// S-01-4: both players on one screen, active player's side at the bottom.
// Plus the board-wide layout checks (on screen, no overlaps) from Sprint 0.
import { expect, test } from '@playwright/test';
import { dispatch, expectCleanLayout, getView, isPhoneProject, layout, openBoard, toRunnerTurn, waitIdle } from './helpers';
import type { LayoutSnapshot } from './helpers';
import type { PlayerView } from '@overclock/engine';

function rowBottom(l: LayoutSnapshot, s: 'corp' | 'runner'): number {
  return Math.max(...[l[s].deck, l[s].credits, l[s].clicks, l[s].discard].map((b) => b.y + b.height));
}
function rowTop(l: LayoutSnapshot, s: 'corp' | 'runner'): number {
  return Math.min(...[l[s].deck, l[s].credits, l[s].clicks, l[s].discard, l[s].label].map((b) => b.y));
}

/** Active side at the bottom, its hand face up, opponent hand as a count only. */
function expectActiveAtBottom(l: LayoutSnapshot, view: PlayerView): void {
  const me = view.activePlayer;
  const them = me === 'corp' ? 'runner' : 'corp';
  expect(view.viewer).toBe(me);
  expect(l.viewer).toBe(me);
  expect(rowBottom(l, them)).toBeLessThan(rowTop(l, me));
  expect(rowTop(l, me)).toBeGreaterThan(l.viewport.height / 2);
  // Viewer's hand face up, in engine order.
  expect(l.hand.map((h) => h.cardId)).toEqual(view.players[me].hand);
  // Opponent: count only, no card ids.
  expect(view.players[them].hand).toBeNull();
  const n = view.players[them].handCount;
  expect(l.text[`${them}Hand`]).toBe(`${n} ${n === 1 ? 'card' : 'cards'} in hand`);
  // Every counter shows what the engine says.
  for (const s of ['corp', 'runner'] as const) {
    expect(l.text[`${s}Credits`]).toBe(String(view.players[s].credits));
    expect(l.text[`${s}Clicks`]).toBe(String(view.players[s].clicks));
    expect(l.text[`${s}Discard`]).toBe(String(view.players[s].discardCount));
  }
}

test.describe('S-01-4 active player at the bottom', () => {
  test('Corp turn: Corp at the bottom with its hand, Runner on top as a count', async ({ page }) => {
    await openBoard(page);
    const l = await layout(page);
    const view = await getView(page);
    expect(view.activePlayer).toBe('corp');
    expectActiveAtBottom(l, view);
  });

  test('Runner turn: the board flips straight away, no cover screen', async ({ page }) => {
    await openBoard(page);
    await toRunnerTurn(page);
    const l = await layout(page);
    const view = await getView(page);
    expect(view.activePlayer).toBe('runner');
    expectActiveAtBottom(l, view);
    expect(l.gameOver).toBeNull();
    expect(l.zoom).toBeNull();
    expect(l.endTurn?.enabled).toBe(true);
    // And back to the Corp.
    await dispatch(page, { type: 'end_turn', player: 'runner' });
    const back = await waitIdle(page);
    const v2 = await getView(page);
    expect(v2.activePlayer).toBe('corp');
    expectActiveAtBottom(back, v2);
  });
});

test.describe('board layout', () => {
  test('nothing is cut off or overlapping on load', async ({ page }, testInfo) => {
    await openBoard(page);
    expectCleanLayout(await layout(page));
    await testInfo.attach('board', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('nothing is cut off or overlapping with a full hand and in the discard picker', async ({ page }) => {
    await openBoard(page);
    for (let i = 0; i < 3; i++) await dispatch(page, { type: 'draw', player: 'corp' });
    const full = await waitIdle(page);
    expect(full.hand).toHaveLength(9);
    expectCleanLayout(full);
    await dispatch(page, { type: 'end_turn', player: 'corp' });
    const picking = await waitIdle(page);
    expect(picking.picker).not.toBeNull();
    expectCleanLayout(picking);
  });

  test('re-lays out when the window is resized (incl. a small phone)', async ({ page }) => {
    // Resizes retire baked card textures: a texture freed while still in use
    // would throw on a later render, so collect page errors.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openBoard(page);
    const handBefore = (await getView(page)).players.corp.handCount;
    const before = page.viewportSize()!;
    // Phones are only played sideways; a 1024x700 touch screen is tablet-sized (desktop layout).
    const small = isPhoneProject() ? { width: 640, height: 360 } : { width: 360, height: 640 };
    for (const size of [small, { width: 1024, height: 700 }, before]) {
      await page.setViewportSize(size);
      await page.waitForFunction(
        ([w, h]) => {
          const v = window.__overclock!.layout().viewport;
          return v.width === w && v.height === h;
        },
        [size.width, size.height],
      );
      const l = await layout(page);
      expectCleanLayout(l);
      expect(l.endTurn!.box.height).toBeGreaterThanOrEqual(44);
    }
    // The board still plays after the resizes: draw, then End turn.
    await dispatch(page, { type: 'draw', player: 'corp' });
    await dispatch(page, { type: 'end_turn', player: 'corp' });
    const after = await waitIdle(page);
    const view = await getView(page);
    expect(view.players.corp.handCount).toBe(handBefore + 1);
    expect(after.hand).toHaveLength(handBefore + 1);
    expect(after.text.corpHand).toBe(`${handBefore + 1} cards in hand`);
    // Over the hand limit, so End turn opened the discard step.
    expect(view.pendingDiscard).toBeGreaterThan(0);
    expect(after.picker).not.toBeNull();
    expectCleanLayout(after);
    expect(errors).toEqual([]);
  });
});
