// S-01-2: spend a click to gain a credit or draw a card, on both sides.
import { expect, test } from '@playwright/test';
import type { Side } from '@overclock/engine';
import {
  anims,
  dispatch,
  getView,
  inside,
  lastEvents,
  layout,
  measureTap,
  expectSnappy,
  openBoard,
  safeRect,
  tap,
  toRunnerTurn,
  waitFeedbackSettled,
  waitIdle,
} from './helpers';
import type { Page } from '@playwright/test';

async function openOn(page: Page, side: Side): Promise<void> {
  await openBoard(page);
  if (side === 'runner') await toRunnerTurn(page);
}

for (const side of ['corp', 'runner'] as const) {
  test.describe(`S-01-2 ${side} turn`, () => {
    test(`tapping the ${side}'s credits adds 1 with a quick pop and uses one click`, async ({ page }) => {
      await openOn(page, side);
      const before = await getView(page);
      const l = await layout(page);
      const m = await measureTap(page, l[side].credits);
      expect(m.view.players[side].credits).toBe(before.players[side].credits + 1);
      expect(m.view.players[side].clicks).toBe(before.players[side].clicks - 1);
      expect(m.events).toEqual([{ type: 'credit_gained', player: side, amount: 1 }]);
      expectSnappy(m, ['credit_pop']);
      const after = await waitIdle(page);
      expect(after.text[`${side}Credits`]).toBe(String(before.players[side].credits + 1));
      expect(after.text[`${side}Clicks`]).toBe(String(before.players[side].clicks - 1));
    });

    test(`tapping the ${side}'s deck flies a card into the hand and uses one click`, async ({ page }) => {
      await openOn(page, side);
      const before = await getView(page);
      const l = await layout(page);
      const m = await measureTap(page, l[side].deck);
      expect(m.view.players[side].handCount).toBe(before.players[side].handCount + 1);
      expect(m.view.players[side].clicks).toBe(before.players[side].clicks - 1);
      expect(m.view.players[side].deckCount).toBe(before.players[side].deckCount - 1);
      expect(m.events).toHaveLength(1);
      expect(m.events[0]).toMatchObject({ type: 'card_drawn', player: side });
      expectSnappy(m, ['draw_flight']);

      const after = await waitIdle(page);
      expect(after.hand).toHaveLength(l.hand.length + 1);
      expect(after.hand.at(-1)?.cardId).toBe((m.events[0] as { cardId?: string }).cardId);
      const landed = after.hand.at(-1)!.box;
      expect(inside(landed, after.handArea)).toBe(true);
      expect(after.text[`${side}Clicks`]).toBe(String(before.players[side].clicks - 1));
    });

    test(`with 0 clicks, the ${side}'s credits and deck do nothing but show "No clicks left"`, async ({ page }) => {
      await openOn(page, side);
      const clicks = (await getView(page)).players[side].clicks;
      for (let i = 0; i < clicks; i++) await dispatch(page, { type: 'gain_credit', player: side });
      const l = await waitIdle(page);
      const before = await getView(page);
      expect(before.players[side].clicks).toBe(0);

      for (const target of [l[side].credits, l[side].deck]) {
        // Each refused tap is measured on an idle board (the first tap's shake is over).
        await waitFeedbackSettled(page);
        const m = await measureTap(page, target);
        expect(m.events).toEqual([{ type: 'action_rejected', reason: 'no_clicks' }]);
        expect(m.view).toEqual(before);
        // Read the hint from the record made when it appeared (no polling of a transient state).
        const hint = m.anims.find((a) => a.kind === 'hint');
        expect(hint?.text).toBe('No clicks left');
        expect(hint!.startedAt - m.tapAt).toBeLessThan(100);
        const vp = { x: 0, y: 0, width: l.viewport.width, height: l.viewport.height };
        expect(inside(hint!.box!, safeRect(l))).toBe(true);
        // Small: much smaller than the screen.
        expect(hint!.box!.width * hint!.box!.height).toBeLessThan(vp.width * vp.height * 0.1);
        // Nothing else animated (no card, no pop).
        expect(m.anims.filter((a) => a.kind !== 'hint')).toEqual([]);
      }
      expect((await layout(page)).hand).toHaveLength(l.hand.length);
      // It goes away on its own.
      await page.waitForFunction(() => window.__overclock!.layout().hint === null, undefined, { timeout: 3000 });
    });

    test(`it is not the opponent's turn: tapping the top row does nothing`, async ({ page }) => {
      await openOn(page, side);
      const other = side === 'corp' ? 'runner' : 'corp';
      const l = await layout(page);
      expect(l.viewer).toBe(side);
      const view = await getView(page);
      const events = await lastEvents(page);
      await page.evaluate(() => window.__overclock!.clearAnims());
      await tap(page, l[other].deck);
      await tap(page, l[other].credits);
      await page.waitForTimeout(150);
      expect(await getView(page)).toEqual(view);
      expect(await lastEvents(page)).toEqual(events);
      expect(await anims(page)).toEqual([]);
    });

    test(`the waiting player's actions are refused with "Not your turn" (engine check through the match)`, async ({ page }) => {
      await openOn(page, side);
      const other = side === 'corp' ? 'runner' : 'corp';
      const view = await getView(page);
      await page.evaluate(() => window.__overclock!.clearAnims());
      for (const type of ['draw', 'gain_credit', 'end_turn'] as const) {
        expect(await dispatch(page, { type, player: other })).toEqual([{ type: 'action_rejected', reason: 'not_your_turn' }]);
      }
      expect(await getView(page)).toEqual(view);
      const hints = (await anims(page)).filter((a) => a.kind === 'hint');
      expect(hints.map((h) => h.text)).toEqual(['Not your turn', 'Not your turn', 'Not your turn']);
    });
  });
}

test('rapid taps are never blocked by the animation', async ({ page }) => {
  await openBoard(page);
  const l = await layout(page);
  for (let i = 0; i < 3; i++) await tap(page, l.corp.deck);
  const view = await getView(page);
  expect(view.players.corp.clicks).toBe(0);
  expect(view.players.corp.handCount).toBe(9);
  const after = await waitIdle(page);
  expect(after.hand).toHaveLength(9);
  expect(after.text.corpClicks).toBe('0');
});

test('the drawn card is mid-flight between deck and hand right after the tap', async ({ page }) => {
  await openBoard(page);
  const before = await layout(page);
  await tap(page, before.corp.deck);
  const mid = await layout(page);
  const settled = await waitIdle(page);
  expect(settled.hand).toHaveLength(before.hand.length + 1);
  // Either still flying, or (on a very slow frame) already landed: on the way from
  // the deck to its slot, never anywhere else (the deck may sit above the hand, as
  // on desktop, or beside it, as in the phone's rail).
  if (mid.animating) {
    const c = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    const fly = c(mid.hand.at(-1)!.box);
    const from = c(before.corp.deck);
    const to = c(settled.hand.at(-1)!.box);
    expect(fly.x).toBeGreaterThanOrEqual(Math.min(from.x, to.x) - 1);
    expect(fly.x).toBeLessThanOrEqual(Math.max(from.x, to.x) + 1);
    expect(fly.y).toBeGreaterThanOrEqual(Math.min(from.y, to.y) - 1);
    expect(fly.y).toBeLessThanOrEqual(Math.max(from.y, to.y) + 1);
  }
});
