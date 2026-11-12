// S-01-1: Corp goes first and turns alternate. S-01-3: End turn.
import { expect, test } from '@playwright/test';
import {
  dispatch,
  expectCleanLayout,
  expectSnappy,
  getView,
  layout,
  measureTap,
  openBoard,
  playUntilGameOver,
  sendTap,
  tap,
  toRunnerTurn,
  waitEndTurnArmed,
  waitIdle,
} from './helpers';

test.describe('S-01-1 turn order', () => {
  test('a new game starts on the Corp turn with 3 clicks and 6 cards (free draw taken)', async ({ page }) => {
    await openBoard(page);
    const l = await layout(page);
    const view = await getView(page);
    expect(view.activePlayer).toBe('corp');
    expect(view.turn).toBe(1);
    expect(view.players.corp.clicks).toBe(3);
    expect(view.players.corp.handCount).toBe(6);
    expect(l.hand).toHaveLength(6);
    expect(l.text.corpClicks).toBe('3');
    // Obvious whose turn it is and how many clicks are left.
    expect(l.text.banner).toBe('TURN 1 · CORP · 3 clicks left');
  });

  test('after the Corp ends, the Runner has 4 clicks and no free card', async ({ page }) => {
    await openBoard(page);
    const runnerHand = (await getView(page)).players.runner.handCount;
    // Corp: End turn -> hand limit (6 cards) -> pick one -> Confirm.
    let l = await layout(page);
    await tap(page, l.endTurn!.box);
    l = await waitIdle(page);
    expect(l.picker?.label).toBe('Discard 1');
    await tap(page, l.hand[0]!.box);
    l = await layout(page);
    await tap(page, l.picker!.confirm.box);
    l = await waitIdle(page);
    const view = await getView(page);
    expect(view.activePlayer).toBe('runner');
    expect(view.turn).toBe(2);
    expect(view.players.runner.clicks).toBe(4);
    expect(view.players.runner.handCount).toBe(runnerHand);
    expect(l.hand).toHaveLength(runnerHand);
    expect(l.text.runnerClicks).toBe('4');
    expect(l.text.banner).toBe('TURN 2 · RUNNER · 4 clicks left');
  });

  test('after the Runner ends, the Corp gets 3 fresh clicks and draws its free card', async ({ page }) => {
    await openBoard(page);
    await toRunnerTurn(page);
    const corpBefore = (await getView(page)).players.corp;
    await waitEndTurnArmed(page);
    const l = await layout(page);
    const m = await measureTap(page, l.endTurn!.box);
    expect(m.view.activePlayer).toBe('corp');
    expect(m.view.turn).toBe(3);
    expect(m.view.players.corp.clicks).toBe(3);
    expect(m.view.players.corp.handCount).toBe(corpBefore.handCount + 1);
    expect(m.view.players.corp.deckCount).toBe(corpBefore.deckCount - 1);
    // The free draw flies in after the flip.
    expect(m.anims.some((a) => a.kind === 'draw_flight')).toBe(true);
    const after = await waitIdle(page);
    expect(after.hand.map((h) => h.cardId)).toEqual(m.view.players.corp.hand);
    expect(after.text.banner).toBe('TURN 3 · CORP · 3 clicks left');
  });

  test('when the Corp must draw from an empty deck, the Runner wins', async ({ page }) => {
    await openBoard(page);
    await playUntilGameOver(page);
    const l = await waitIdle(page);
    const view = await getView(page);
    expect(view.result).toEqual({ winner: 'runner', reason: 'corp_decked' });
    expect(l.gameOver?.text).toBe('Runner wins: R&D is empty');
    expect(l.endTurn).toBeNull();
    expectCleanLayout(l);
    // Nothing more can be done.
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, l[l.viewer].credits);
    expect((await getView(page)).players[l.viewer].credits).toBe(view.players[l.viewer].credits);
    const hint = (await page.evaluate(() => window.__overclock!.anims())).find((a) => a.kind === 'hint');
    expect(hint?.text).toBe('The game is over');
  });
});

test.describe('S-01-3 End turn', () => {
  test('End turn is there and glows brighter once all clicks are used', async ({ page }) => {
    await openBoard(page);
    let l = await layout(page);
    expect(l.endTurn).toMatchObject({ label: 'End turn', enabled: true, glowing: false });
    expect(l.endTurn!.box.height).toBeGreaterThanOrEqual(44);
    await tap(page, l.corp.credits);
    await tap(page, l.corp.credits);
    l = await layout(page);
    expect(l.endTurn!.glowing).toBe(false);
    await tap(page, l.corp.credits);
    l = await layout(page);
    expect(l.endTurn).toMatchObject({ enabled: true, glowing: true });
  });

  test('the turn does not end by itself after the last click', async ({ page }) => {
    await openBoard(page);
    await toRunnerTurn(page);
    const l = await layout(page);
    for (let i = 0; i < 4; i++) await tap(page, l.runner.deck);
    await page.waitForTimeout(1000);
    const view = await getView(page);
    expect(view.activePlayer).toBe('runner');
    expect(view.turn).toBe(2);
    expect(view.players.runner.clicks).toBe(0);
    expect((await layout(page)).endTurn?.glowing).toBe(true);
  });

  test('ending with clicks left ends the turn anyway (leftover clicks are lost)', async ({ page }) => {
    await openBoard(page);
    await toRunnerTurn(page);
    await waitEndTurnArmed(page);
    const l = await layout(page);
    expect((await getView(page)).players.runner.clicks).toBe(4);
    const m = await measureTap(page, l.endTurn!.box);
    expect(m.view.activePlayer).toBe('corp');
    expect(m.view.players.runner.clicks).toBe(0);
  });

  test('the turn change is fast, with no extra screen, and the next player can act at once', async ({ page }) => {
    await openBoard(page);
    await toRunnerTurn(page);
    await waitEndTurnArmed(page);
    const l = await layout(page);
    const m = await measureTap(page, l.endTurn!.box);
    // Flipped to the Corp inside the same tap.
    expect(m.view.viewer).toBe('corp');
    expectSnappy(m, ['turn_change', 'draw_flight']);
    // No cover screen or picker in between.
    const now = await layout(page);
    expect(now.viewer).toBe('corp');
    expect(now.picker).toBeNull();
    expect(now.zoom).toBeNull();
    // Tap the Corp's deck right away, without waiting for the flip.
    const hand = m.view.players.corp.handCount;
    await tap(page, now.corp.deck);
    expect((await getView(page)).players.corp.handCount).toBe(hand + 1);
  });

  test('turn change with a 4-card discard is still scheduled within 600ms', async ({ page }) => {
    await openBoard(page);
    for (let i = 0; i < 3; i++) await dispatch(page, { type: 'draw', player: 'corp' });
    await dispatch(page, { type: 'end_turn', player: 'corp' });
    let l = await waitIdle(page);
    expect(l.picker?.remaining).toBe(4);
    for (let i = 0; i < 4; i++) await tap(page, l.hand[i]!.box);
    l = await layout(page);
    const m = await measureTap(page, l.picker!.confirm.box);
    expect(m.view.viewer).toBe('runner');
    expectSnappy(m, ['discard_flight', 'turn_change']);
  });

  test('a tap on the deck while the discards still fly away does not spend the next player\'s click', async ({ page }) => {
    await openBoard(page);
    await dispatch(page, { type: 'end_turn', player: 'corp' });
    const l = await waitIdle(page);
    const deck = l.corp.deck;
    // Confirm the discard and tap the (still Corp) deck in the same task, so
    // no frame can run the flip in between: the board still shows the Corp.
    const result = await page.evaluate((d) => {
      const hook = window.__overclock!;
      hook.dispatch({ type: 'discard', player: 'corp', handIndices: [5] });
      const shownBefore = hook.layout().viewer;
      const canvas = document.querySelector('canvas')!;
      const r = canvas.getBoundingClientRect();
      const init = { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0,
        clientX: r.left + d.x + d.width / 2, clientY: r.top + d.y + d.height / 2 };
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
      return { shownBefore, shownAfter: hook.layout().viewer, view: hook.getView() };
    }, deck);
    expect(result.shownBefore).toBe('corp');
    // The tap skipped ahead to the Runner's board instead of drawing for the Runner.
    expect(result.shownAfter).toBe('runner');
    expect(result.view.activePlayer).toBe('runner');
    expect(result.view.players.runner.clicks).toBe(4);
  });

  // QA-S3-6: the second tap really lands on the Corp's End turn inside the guard,
  // so a broken guard would open the Corp's hand-limit step (6 cards) and this
  // goes red. Taps carry the time they were made (like the guard specs), so a
  // slow test machine cannot push the second one out of the guard window.
  test('a double tap on End turn ends only one turn', async ({ page }) => {
    await openBoard(page);
    await toRunnerTurn(page);
    await waitEndTurnArmed(page);
    const spot = (await layout(page)).endTurn!.box;
    await page.evaluate(() => {
      const w = window as unknown as { __taps: { ts: number; onButton: boolean }[] };
      w.__taps = [];
      window.addEventListener('pointerup', (e) => {
        const input = window.__overclock!.lastInput();
        w.__taps.push({ ts: e.timeStamp, onButton: !!input && input.eventAt === e.timeStamp && input.target === 'button:action' });
      });
    });
    const t0 = Date.now();
    await sendTap(page, spot, { madeAt: t0 });
    // The turn has passed and the Corp's End turn shows (desktop moves it with the seat).
    await page.waitForFunction(() => window.__overclock!.getView().activePlayer === 'corp' && window.__overclock!.layout().endTurn !== null, undefined, {
      polling: 'raf',
    });
    const next = (await layout(page)).endTurn!.box;
    const guardMs = await page.evaluate(() => {
      const w = window as unknown as { __taps: { ts: number }[] };
      return window.__overclock!.endTurn().armedAt - w.__taps[0]!.ts;
    });
    expect(guardMs, 'End turn stays guarded >= 300ms after the ending tap').toBeGreaterThanOrEqual(300);
    // Made 120ms after the first tap, but delivered only once the guard has opened
    // (as on a phone whose page was busy): the guard must judge it by when it was made.
    const secondMs = 120;
    await new Promise((r) => setTimeout(r, Math.max(0, t0 + guardMs + 5 - Date.now() + 1)));
    await sendTap(page, next, { madeAt: t0 + secondMs });
    await waitIdle(page);
    const taps = await page.evaluate(() => (window as unknown as { __taps: { ts: number; onButton: boolean }[] }).__taps);
    expect(taps.length, 'both taps reached the page').toBe(2);
    expect(taps.every((t) => t.onButton), 'both taps landed on End turn').toBe(true);
    expect(Math.abs(taps[1]!.ts - taps[0]!.ts - secondMs), `the second tap was made ${secondMs}ms after the first`).toBeLessThanOrEqual(2);
    const view = await getView(page);
    expect(view.activePlayer).toBe('corp');
    expect(view.turn).toBe(3);
    // Only one turn ended: the Corp's End turn was refused (no hand-limit step, clicks untouched).
    expect(view.phase).toBe('action');
    expect(view.pendingDiscard).toBe(0);
    expect(view.players.corp.clicks).toBe(3);
  });
});
