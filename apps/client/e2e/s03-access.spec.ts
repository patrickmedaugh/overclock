// S-03-1 AC2-AC5 (access: HQ, R&D, Archives; Steal, Trash, Leave it, Done; points for both players).
// Runner's first turn (Corp ended turn 1 discarding its 6th card face down):
// seed 1: HQ shows Anonymous Tip, R&D's top card is Private Security Force (2 points),
//         Archives holds PAD Campaign (face down until accessed).
// seed 2: R&D's top card is Akitaro Watanabe (upgrade, trash 3).
// seed 3: Archives holds Hostile Takeover (1 point).
import { getCard } from '@overclock/cards';
import { expect, test } from '@playwright/test';
import { expectCleanLayout, expectSnappy, getView, measureTap, openBoard, passTurn, runButtonOf, startRun, toRunnerTurn, waitIdle } from './helpers';

const name = (id: string | null) => (id ? getCard(id)?.name : null);

test.describe('S-03-1 access', () => {
  test('HQ: one card from the Corp\'s hand, shown large; Done puts it back and the Corp\'s hand and deck are untouched', async ({ page }) => {
    await openBoard(page, 1);
    await toRunnerTurn(page);
    const before = await getView(page);
    const l = await startRun(page, 'hq');
    expect(l.run).toMatchObject({ step: 'access', stepLabel: 'Access HQ' });
    expect(l.run!.access!.cards.map((c) => name(c.cardId))).toEqual(['Anonymous Tip']);
    // Large: well over the table cards' size.
    const card = l.run!.access!.cards[0]!.box;
    expect(card.height).toBeGreaterThan(l.servers[0]!.root!.height * 1.5);
    expect(l.run!.buttons.map((b) => [b.label, b.lit])).toEqual([['Done', true]]);
    expectCleanLayout(l);
    await test.info().attach('access HQ', { body: await page.screenshot(), contentType: 'image/png' });
    const m = await measureTap(page, runButtonOf(l, 'Done').box);
    expect(m.events.map((e) => e.type)).toEqual(['run_ended']);
    expect(m.view.players.corp.handCount).toBe(before.players.corp.handCount);
    expect(m.view.players.corp.deckCount).toBe(before.players.corp.deckCount);
    expect(m.view.players.corp.discardCount).toBe(before.players.corp.discardCount);
    expect((await waitIdle(page)).run).toBeNull();
  });

  test('R&D: the top card; an agenda offers only Steal, which scores it and both players see "Runner 2 points"', async ({ page }) => {
    await openBoard(page, 1);
    await toRunnerTurn(page);
    const before = await getView(page);
    let l = await startRun(page, 'rd');
    expect(l.score.runner.text).toBe('Runner 0 points');
    expect(l.score.corp.text).toBe('Corp 0 points');
    expect(l.run!.access!.cards.map((c) => name(c.cardId))).toEqual(['Private Security Force']);
    expect(l.run!.buttons.map((b) => b.label)).toEqual(['Steal']);
    const m = await measureTap(page, runButtonOf(l, 'Steal').box);
    expect(m.events.map((e) => e.type)).toEqual(['agenda_stolen', 'run_ended']);
    expect(m.view.players.runner.points).toBe(2);
    expect(m.view.players.runner.scored).toEqual(['c09']);
    expect(m.view.players.corp.deckCount).toBe(before.players.corp.deckCount - 1);
    expectSnappy(m, ['score_flight']);
    l = await waitIdle(page);
    expect(l.score.runner.text).toBe('Runner 2 points');
    // The Corp sees it too.
    await passTurn(page);
    const c = await waitIdle(page);
    expect(c.viewer).toBe('corp');
    expect(c.score.runner.text).toBe('Runner 2 points');
    expect(c.score.corp.text).toBe('Corp 0 points');
    expectCleanLayout(c);
  });

  test('a card with a trash cost: "Trash · 3 credits" destroys it into Archives face up', async ({ page }) => {
    await openBoard(page, 2);
    await toRunnerTurn(page);
    const before = await getView(page);
    const l = await startRun(page, 'rd');
    expect(l.run!.access!.cards.map((c) => name(c.cardId))).toEqual(['Akitaro Watanabe']);
    expect(l.run!.buttons.map((b) => [b.label, b.lit])).toEqual([
      ['Trash · 3 credits', true],
      ['Leave it', true],
    ]);
    const m = await measureTap(page, runButtonOf(l, 'Trash · 3 credits').box);
    expect(m.events.map((e) => e.type)).toEqual(['credits_spent', 'card_trashed', 'run_ended']);
    expect(m.view.players.runner.credits).toBe(before.players.runner.credits - 3);
    expect(m.view.players.corp.discard.at(-1)).toBe('c11');
    expectSnappy(m, ['trash_flight']);
  });

  test('Leave it puts the card back where it was', async ({ page }) => {
    await openBoard(page, 2);
    await toRunnerTurn(page);
    const before = await getView(page);
    const l = await startRun(page, 'rd');
    const m = await measureTap(page, runButtonOf(l, 'Leave it').box);
    expect(m.events.map((e) => e.type)).toEqual(['run_ended']);
    expect(m.view.players.corp.deckCount).toBe(before.players.corp.deckCount);
    expect(m.view.players.runner.credits).toBe(before.players.runner.credits);
  });

  test('Archives: every card at once, turned face up for good', async ({ page }) => {
    await openBoard(page, 1);
    await toRunnerTurn(page);
    expect((await getView(page)).players.corp.discard).toEqual([null]);
    const l = await startRun(page, 'archives');
    expect(l.run).toMatchObject({ server: 'archives', step: 'access' });
    expect(l.run!.access!.cards.map((c) => name(c.cardId))).toEqual(['PAD Campaign']);
    // Nothing can be trashed in Archives.
    expect(l.run!.buttons.map((b) => b.label)).toEqual(['Done']);
    await measureTap(page, runButtonOf(l, 'Done').box);
    await waitIdle(page);
    expect((await getView(page)).players.corp.discard).toEqual(['c03']);
  });

  test('an agenda in Archives can be stolen: "Runner 1 point"', async ({ page }) => {
    await openBoard(page, 3);
    await toRunnerTurn(page);
    const l = await startRun(page, 'archives');
    expect(l.run!.access!.cards.map((c) => name(c.cardId))).toEqual(['Hostile Takeover']);
    await measureTap(page, runButtonOf(l, 'Steal').box);
    const after = await waitIdle(page);
    expect(after.score.runner.text).toBe('Runner 1 point');
    expect(after.run).toBeNull();
  });
});
