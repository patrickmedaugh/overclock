// S-01-5: hand limit, discard down to 5.
import { expect, test } from '@playwright/test';
import { dispatch, getView, lastEvents, layout, measureTap, openBoard, pressAndHold, tap, toRunnerTurn, waitEndTurnArmed, waitIdle } from './helpers';
import type { Page } from '@playwright/test';

/** Corp draws 2 (8 cards) and taps End turn: must discard 3. */
async function openPicker(page: Page) {
  await openBoard(page);
  await dispatch(page, { type: 'draw', player: 'corp' });
  await dispatch(page, { type: 'draw', player: 'corp' });
  const l = await waitIdle(page);
  await tap(page, l.endTurn!.box);
  return waitIdle(page);
}

test.describe('S-01-5 discard down to 5', () => {
  test('ending with more than 5 cards asks you to pick, showing how many are left', async ({ page }) => {
    const l = await openPicker(page);
    const view = await getView(page);
    expect(view.pendingDiscard).toBe(3);
    expect(l.picker).toMatchObject({ remaining: 3, label: 'Discard 3', confirm: { enabled: false } });
    expect(l.endTurn).toBeNull();
    expect(l.picker!.confirm.box.height).toBeGreaterThanOrEqual(44);
    expect(l.hand.every((h) => !h.marked)).toBe(true);
  });

  test('tap marks a card, tap again un-marks it; you cannot pick more than asked', async ({ page }) => {
    let l = await openPicker(page);
    await tap(page, l.hand[1]!.box);
    l = await layout(page);
    expect(l.hand.map((h) => h.marked)).toEqual([false, true, false, false, false, false, false, false]);
    expect(l.picker?.label).toBe('Discard 2');
    await tap(page, l.hand[1]!.box);
    l = await layout(page);
    expect(l.hand.some((h) => h.marked)).toBe(false);
    expect(l.picker?.label).toBe('Discard 3');

    for (const i of [0, 2, 4]) await tap(page, l.hand[i]!.box);
    l = await layout(page);
    expect(l.picker).toMatchObject({ remaining: 0, confirm: { enabled: true } });
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, l.hand[6]!.box);
    l = await layout(page);
    expect(l.hand[6]!.marked).toBe(false);
    expect(l.hand.filter((h) => h.marked)).toHaveLength(3);
    const hint = (await page.evaluate(() => window.__overclock!.anims())).find((a) => a.kind === 'hint');
    expect(hint?.text).toBe('Enough picked. Tap one to undo.');
    // Picking is screen-only: nothing was sent to the game.
    expect((await getView(page)).pendingDiscard).toBe(3);
  });

  test('long-press still zooms a card while picking, without marking it', async ({ page }) => {
    const l = await openPicker(page);
    const target = l.hand[2]!;
    const release = await pressAndHold(page, target.box);
    await page.waitForFunction((id) => window.__overclock!.layout().zoom?.cardId === id, target.cardId);
    await release();
    await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
    const after = await layout(page);
    expect(after.hand[2]!.marked).toBe(false);
    expect(after.picker?.remaining).toBe(3);
  });

  test('Confirm sends the picked cards to the discard pile and ends the turn', async ({ page }) => {
    let l = await openPicker(page);
    const picked = [0, 3, 7];
    const ids = picked.map((i) => l.hand[i]!.cardId);
    // Confirm before picking enough only explains what is missing.
    await tap(page, l.picker!.confirm.box);
    expect((await getView(page)).activePlayer).toBe('corp');
    for (const i of picked) await tap(page, l.hand[i]!.box);
    l = await layout(page);
    const m = await measureTap(page, l.picker!.confirm.box);
    expect(m.events[0]).toEqual({ type: 'cards_discarded', player: 'corp', count: 3, handIndices: picked, cardIds: ids });
    expect(m.events.map((e) => e.type)).toEqual(['cards_discarded', 'turn_ended', 'turn_started']);
    expect(m.anims.find((a) => a.kind === 'discard_flight')).toBeTruthy();
    // The turn passed to the Runner and the Corp's pile count went up (shown at the top now).
    expect(m.view.activePlayer).toBe('runner');
    expect(m.view.players.corp.discardCount).toBe(3);
    expect(m.view.players.corp.handCount).toBe(5);
    const after = await waitIdle(page);
    expect(after.viewer).toBe('runner');
    expect(after.text.corpDiscard).toBe('3');
    expect(after.text.corpHand).toBe('5 cards in HQ');
    expect(after.picker).toBeNull();
  });

  test('with 5 or fewer cards nothing is asked and the turn just ends', async ({ page }) => {
    await openBoard(page);
    await toRunnerTurn(page);
    expect((await getView(page)).players.runner.handCount).toBe(5);
    await waitEndTurnArmed(page);
    const l = await layout(page);
    await tap(page, l.endTurn!.box);
    const events = await lastEvents(page);
    expect(events.some((e) => e.type === 'discard_required')).toBe(false);
    expect((await getView(page)).activePlayer).toBe('corp');
    expect((await waitIdle(page)).picker).toBeNull();
  });

  test("the Runner's discards are face up to the Corp", async ({ page }) => {
    await openBoard(page);
    await toRunnerTurn(page);
    await dispatch(page, { type: 'draw', player: 'runner' });
    await dispatch(page, { type: 'end_turn', player: 'runner' });
    let l = await waitIdle(page);
    const id = l.hand[0]!.cardId;
    await tap(page, l.hand[0]!.box);
    l = await layout(page);
    await tap(page, l.picker!.confirm.box);
    l = await waitIdle(page);
    const view = await getView(page);
    expect(view.viewer).toBe('corp');
    expect(view.players.runner.discard).toEqual([id]);
    expect(l.text.runnerDiscard).toBe('1');
  });
});
