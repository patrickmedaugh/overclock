// S-01-5: hand limit, discard down to 5. Sprint 10 (S-10-5): the discard step opens the hand
// big with a tap, like everywhere else; a tap on the big card marks it (no holding).
import { expect, test } from '@playwright/test';
import { center, closeDiscardView, dispatch, getView, lastEvents, layout, markDiscard, measureTap, openBoard, outsideHandView, pressAndHold, tap, toRunnerTurn, waitEndTurnArmed, waitIdle } from './helpers';
import type { Box } from './helpers';
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

  test('tap the hand: it opens big; tap the big card to mark it, again to un-mark; you cannot pick more than asked', async ({ page }) => {
    let l = await openPicker(page);
    await tap(page, l.hand[1]!.box);
    l = await layout(page);
    // A tap opens the hand big on that card; it marks nothing yet.
    expect(l.discardView).toMatchObject({ index: 1, stamped: false, marked: [] });
    l = await markDiscard(page, [1]);
    expect(l.hand.map((h) => h.marked)).toEqual([false, true, false, false, false, false, false, false]);
    expect(l.discardView).toMatchObject({ stamped: true, marked: [1], confirm: { label: 'Discard 3', lit: false } });
    expect(l.picker?.label).toBe('Discard 2');
    l = await markDiscard(page, [1]);
    expect(l.hand.some((h) => h.marked)).toBe(false);
    expect(l.picker?.label).toBe('Discard 3');

    l = await markDiscard(page, [0, 2, 4]);
    expect(l.picker).toMatchObject({ remaining: 0, confirm: { enabled: true } });
    expect(l.discardView!.confirm).toMatchObject({ label: 'Discard 3', lit: true });
    await tap(page, outsideHandView(l));
    await page.waitForFunction(() => window.__overclock!.layout().discardView === null);
    l = await layout(page);
    await tap(page, l.hand[6]!.box);
    await page.waitForFunction(() => window.__overclock!.layout().discardView?.index === 6);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, (await layout(page)).handView!.centre);
    l = await layout(page);
    expect(l.hand[6]!.marked).toBe(false);
    expect(l.hand.filter((h) => h.marked)).toHaveLength(3);
    const hint = (await page.evaluate(() => window.__overclock!.anims())).find((a) => a.kind === 'hint');
    expect(hint?.text).toBe('Enough picked. Tap one to undo.');
    // Picking is screen-only: nothing was sent to the game.
    expect((await getView(page)).pendingDiscard).toBe(3);
  });

  test('a hold opens the same big view (no hold-and-slide strip), without marking the card', async ({ page }) => {
    const l = await openPicker(page);
    const target = l.hand[2]!;
    const release = await pressAndHold(page, target.box);
    await page.waitForFunction((id) => window.__overclock!.layout().zoom?.cardId === id, target.cardId);
    await release();
    const after = await waitIdle(page);
    // It stays open after the finger lifts, like the hand view.
    expect(after.discardView).toMatchObject({ index: 2, marked: [] });
    expect(after.hand[2]!.marked).toBe(false);
    expect(after.picker?.remaining).toBe(3);
  });

  test('the big view\'s own "Discard 3" sends the marked cards (lit only at the asked count)', async ({ page }) => {
    let l = await openPicker(page);
    const ids = [1, 5, 6].map((i) => l.hand[i]!.cardId);
    l = await markDiscard(page, [1, 5]);
    expect(l.discardView!.confirm).toMatchObject({ label: 'Discard 3', lit: false });
    expect(Math.min(l.discardView!.confirm.box.width, l.discardView!.confirm.box.height)).toBeGreaterThanOrEqual(44);
    // Not enough yet: it only says so.
    await tap(page, l.discardView!.confirm.box);
    expect((await getView(page)).pendingDiscard).toBe(3);
    l = await markDiscard(page, [6]);
    expect(l.discardView!.confirm.lit).toBe(true);
    const m = await measureTap(page, l.discardView!.confirm.box);
    expect(m.events[0]).toEqual({ type: 'cards_discarded', player: 'corp', count: 3, handIndices: [1, 5, 6], cardIds: ids });
    expect(m.view.activePlayer).toBe('runner');
  });

  test('Confirm sends the picked cards to the discard pile and ends the turn', async ({ page }) => {
    let l = await openPicker(page);
    const picked = [0, 3, 7];
    const ids = picked.map((i) => l.hand[i]!.cardId);
    // Confirm before picking enough only explains what is missing.
    await tap(page, l.picker!.confirm.box);
    expect((await getView(page)).activePlayer).toBe('corp');
    await markDiscard(page, picked);
    l = await closeDiscardView(page);
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
    await markDiscard(page, [0]);
    l = await closeDiscardView(page);
    await tap(page, l.picker!.confirm.box);
    l = await waitIdle(page);
    const view = await getView(page);
    expect(view.viewer).toBe('corp');
    expect(view.players.runner.discard).toEqual([id]);
    expect(l.text.runnerDiscard).toBe('1');
  });

  // QA-S3-7: "hold to read" must be judged by when the finger went down and came up,
  // not by when the page's 350ms timer got to run. The page is frozen for 600ms right
  // after the finger goes down (a slow phone); the release is stamped 30ms after the press.
  for (const late of [false, true]) {
    const when = late ? 'delivered after the page wakes (the hold timer runs first)' : 'queued during the freeze';
    test(`a quick tap still picks a card when the page freezes for 600ms in the middle of it, release ${when} (QA-S3-7)`, async ({ page }) => {
      let l = await openPicker(page);
      // S-10-5: the card is marked with a tap on the big card (the view opened by a tap on the hand).
      await tap(page, l.hand[1]!.box);
      await page.waitForFunction(() => window.__overclock!.layout().discardView?.index === 1);
      l = await layout(page);
      await page.evaluate(() => {
        const w = window as unknown as { __press: Press };
        w.__press = { downTs: 0, upTs: 0, upHandled: 0 };
        window.addEventListener(
          'pointerdown',
          (e) => {
            w.__press.downTs = e.timeStamp;
            const until = performance.now() + 600;
            while (performance.now() < until) {
              // frozen: a slow phone
            }
          },
          { once: true },
        );
        window.addEventListener(
          'pointerup',
          (e) => {
            w.__press.upTs = e.timeStamp;
            w.__press.upHandled = performance.now();
          },
          { once: true },
        );
      });
      const beforeUp = late
        ? () =>
            page
              .waitForFunction(() => {
                const p = (window as unknown as { __press: Press }).__press;
                // Past the freeze and the hold time after it, whichever order the page's
                // own pointerdown handlers ran in.
                return p.downTs > 0 && performance.now() - p.downTs > 1100;
              })
              .then(() => undefined)
        : undefined;
      await stampedTap(page, l.handView!.centre, 30, beforeUp);
      await page.waitForFunction(() => (window as unknown as { __press: Press }).__press.upHandled > 0);
      await page.waitForTimeout(400);
      const press = await page.evaluate(() => (window as unknown as { __press: Press }).__press);
      expect(press.upTs - press.downTs, 'the finger was down for 30ms').toBeLessThan(60);
      expect(press.upHandled - press.downTs, 'the page handled the release after the 350ms hold time').toBeGreaterThan(550);
      l = await layout(page);
      expect(l.hand[1]!.marked, 'the tap picked the card').toBe(true);
      expect(l.picker?.label).toBe('Discard 2');
      expect(l.discardView?.marked, 'marked once, the view still open').toEqual([1]);
    });
  }
});

interface Press {
  downTs: number;
  upTs: number;
  upHandled: number;
}

/**
 * A tap whose press and release are stamped `heldMs` apart (Chrome uses a CDP input
 * event's `timestamp` as the DOM `event.timeStamp`). The release is sent once real time
 * has passed its stamp (and `beforeUp` has settled), without waiting for the page to
 * handle the press.
 */
async function stampedTap(page: Page, b: Box, heldMs: number, beforeUp?: () => Promise<void>): Promise<void> {
  const { x, y } = center(b);
  const cdp = await page.context().newCDPSession(page);
  const touch = test.info().project.use.hasTouch === true;
  const t0 = Date.now();
  const at = (ms: number) => ({ timestamp: (t0 + ms) / 1000 });
  const down = touch
    ? cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }], ...at(0) })
    : cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, ...at(0) });
  await new Promise((r) => setTimeout(r, Math.max(0, t0 + heldMs - Date.now() + 1)));
  if (beforeUp) await beforeUp();
  const up = touch
    ? cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], ...at(heldMs) })
    : cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, ...at(heldMs) });
  await Promise.all([down, up]);
  await cdp.detach();
}
