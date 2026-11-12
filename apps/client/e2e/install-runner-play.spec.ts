// S-02-3 (Runner installs programs, hardware, resources) and S-02-4 (play
// money and draw cards: Hedge Fund, Anonymous Tip, Easy Mark, Diesel),
// tapped on screen.
import { getCard } from '@overclock/cards';
import type { Action, PlayerView, Side } from '@overclock/engine';
import { type Page, expect, test } from '@playwright/test';
import {
  dispatch,
  expectSnappy,
  findSeed,
  getView,
  layout,
  measureTap,
  openBoard,
  pick,
  planTo,
  pressAndHold,
  replayOnPage,
  tap,
  toRunnerTurn,
  typeOf,
  waitIdle,
} from './helpers';

const hand = (v: PlayerView, s: Side) => v.players[s].hand ?? [];

/** Ends `side`'s turn (discarding the last cards over the limit). */
async function pass(page: Page, side: Side): Promise<void> {
  await dispatch(page, { type: 'end_turn', player: side });
  const v = await getView(page);
  if (v.pendingDiscard > 0) {
    const n = v.players[side].handCount;
    await dispatch(page, { type: 'discard', player: side, handIndices: Array.from({ length: v.pendingDiscard }, (_, k) => n - v.pendingDiscard + k) });
  }
  await waitIdle(page);
}

/** Tries seeds until `until` is reachable with `choose`. */
function planSomeSeed(choose: (v: PlayerView) => Action | null, until: (v: PlayerView) => boolean): { seed: number; actions: Action[] } {
  for (let seed = 1; seed < 300; seed++) {
    try {
      return { seed, actions: planTo(seed, choose, until) };
    } catch {
      // next seed
    }
  }
  throw new Error('scenario not reachable');
}

test.describe('S-02-3 Runner: install programs, hardware and resources', () => {
  const seed = findSeed((_c, r) => r.some((id) => typeOf(id) === 'program' && getCard(id)!.cost <= 5));

  test('a program lights "Install · N credits"; tapping it puts it face up in the rig, pays, uses a click and counts memory', async ({ page }) => {
    await openBoard(page, seed);
    await toRunnerTurn(page);
    const v0 = await getView(page);
    const i = hand(v0, 'runner').findIndex((id) => typeOf(id) === 'program' && getCard(id)!.cost <= 5);
    const id = hand(v0, 'runner')[i]!;
    const def = getCard(id)!;
    let l = await pick(page, i);
    const price = def.cost === 0 ? 'free' : `${def.cost} ${def.cost === 1 ? 'credit' : 'credits'}`;
    expect(l.targets.map((t) => t.label)).toEqual([`Install · ${price}`]);
    expect(l.memory.text).toBe('Memory 0/4');

    const m = await measureTap(page, l.targets[0]!.box);
    expect(m.view.rig.map((c) => c.cardId)).toEqual([id]);
    expect(m.view.players.runner.credits).toBe(v0.players.runner.credits - def.cost);
    expect(m.view.players.runner.clicks).toBe(v0.players.runner.clicks - 1);
    expect(m.view.memory).toEqual({ used: def.memory, limit: 4 });
    expectSnappy(m, ['install_flight']);
    l = await waitIdle(page);
    expect(l.rig).toHaveLength(1);
    expect(l.rig[0]!.faceUp).toBe(true);
    expect(l.rig[0]!.cardId).toBe(id);
    expect(l.memory.text).toBe(`Memory ${def.memory}/4`);
    expect(l.text.runnerCredits).toBe(String(v0.players.runner.credits - def.cost));

    // Hold it to read it.
    const release = await pressAndHold(page, l.rig[0]!.box);
    await page.waitForFunction((cid) => window.__overclock!.layout().zoom?.cardId === cid, id);
    expect((await layout(page)).zoom!.texts).toContain(def.name);
    await release();

    // S-02-3: on the Corp's turn the Runner's cards are face up.
    await pass(page, 'runner');
    const corp = await layout(page);
    expect(corp.viewer).toBe('corp');
    expect(corp.rig.map((c) => [c.cardId, c.faceUp])).toEqual([[id, true]]);
    expect(corp.memory.text).toBe(`Memory ${def.memory}/4`);
  });

  test('a card you cannot afford shows only "Not enough credits" and nothing changes', async ({ page }) => {
    // The Runner installs its priciest affordable cards (drawing otherwise) until one is out of reach.
    const plan = planSomeSeed(
      (v) => {
        if (v.viewer !== 'runner') return null;
        const opts = v.handOptions.flat().filter((o) => o.action.type === 'install' && o.reject === null);
        opts.sort((a, b) => b.cost - a.cost);
        if (opts[0] && opts[0].cost > 0) return opts[0].action;
        return v.players.runner.deckCount > 0 ? { type: 'draw', player: 'runner' } : null;
      },
      (v) => v.viewer === 'runner' && v.phase === 'action' && v.players.runner.clicks > 0 && v.handOptions.flat().some((o) => o.reject === 'no_credits' && o.action.type === 'install'),
    );
    await openBoard(page, plan.seed);
    await replayOnPage(page, plan.actions);
    const before = await getView(page);
    const i = before.handOptions.findIndex((list) => list.some((o) => o.reject === 'no_credits' && o.action.type === 'install'));
    const l = await pick(page, i);
    expect(l.targets).toHaveLength(1);
    expect(l.targets[0]!.reject).toBe('no_credits');
    expect(l.targets[0]!.label).toMatch(/^Install · \d+ credits?$/);
    const m = await measureTap(page, l.targets[0]!.box);
    expect(m.events).toEqual([{ type: 'action_rejected', reason: 'no_credits' }]);
    expect(m.view).toEqual(before);
    expect(m.anims.find((a) => a.kind === 'hint')?.text).toBe('Not enough credits');
  });
});

test.describe('S-02-4 play money and draw cards', () => {
  test('Hedge Fund: Play · 5 credits; gain 9 with a pop, one click, face up in Archives for both players', async ({ page }) => {
    const seed = findSeed((c) => c.includes('c01'));
    await openBoard(page, seed);
    const v0 = await getView(page);
    expect(v0.players.corp.credits).toBe(5);
    const i = hand(v0, 'corp').indexOf('c01');
    const l = await pick(page, i);
    expect(l.targets.map((t) => t.label)).toEqual(['Play · 5 credits']);
    const m = await measureTap(page, l.targets[0]!.box);
    expect(m.events.map((e) => e.type)).toEqual(['credits_spent', 'card_played', 'credit_gained']);
    expect(m.view.players.corp.credits).toBe(9);
    expect(m.view.players.corp.clicks).toBe(v0.players.corp.clicks - 1);
    expect(m.view.players.corp.discard.at(-1)).toBe('c01');
    expectSnappy(m, ['play_flight', 'credit_pop']);
    const after = await waitIdle(page);
    expect(after.text.corpCredits).toBe('9');
    expect(after.text.corpDiscard).toBe('1');
    expect(after.hand).toHaveLength(v0.players.corp.handCount - 1);
    await pass(page, 'corp');
    const runner = await getView(page);
    expect(runner.viewer).toBe('runner');
    // Face up to the Runner (hand-limit discards after it would be face down: null).
    expect(runner.players.corp.discard[0]).toBe('c01');
  });

  test('Anonymous Tip: free, draws 3 with the usual flights', async ({ page }) => {
    const seed = findSeed((c) => c.includes('c02'));
    await openBoard(page, seed);
    const v0 = await getView(page);
    const l = await pick(page, hand(v0, 'corp').indexOf('c02'));
    expect(l.targets.map((t) => t.label)).toEqual(['Play · free']);
    const m = await measureTap(page, l.targets[0]!.box);
    expect(m.events.filter((e) => e.type === 'card_drawn')).toHaveLength(3);
    expect(m.view.players.corp.handCount).toBe(v0.players.corp.handCount + 2);
    expect(m.view.players.corp.credits).toBe(v0.players.corp.credits);
    expectSnappy(m, ['play_flight', 'draw_flight']);
    const after = await waitIdle(page);
    expect(after.hand.map((h) => h.cardId)).toEqual(hand(await getView(page), 'corp'));
  });

  test('Easy Mark: free, gain 3', async ({ page }) => {
    const seed = findSeed((_c, r) => r.includes('r01'));
    await openBoard(page, seed);
    await toRunnerTurn(page);
    const v0 = await getView(page);
    const l = await pick(page, hand(v0, 'runner').indexOf('r01'));
    expect(l.targets.map((t) => t.label)).toEqual(['Play · free']);
    const m = await measureTap(page, l.targets[0]!.box);
    expect(m.view.players.runner.credits).toBe(v0.players.runner.credits + 3);
    expect(m.view.players.runner.clicks).toBe(v0.players.runner.clicks - 1);
    expect(m.view.players.runner.discard.at(-1)).toBe('r01');
    expectSnappy(m, ['play_flight', 'credit_pop']);
  });

  test('Diesel: draws 3; the hand is then over 5, so End turn opens the discard step', async ({ page }) => {
    const seed = findSeed((_c, r) => r.includes('r03'));
    await openBoard(page, seed);
    await toRunnerTurn(page);
    const v0 = await getView(page);
    expect(v0.players.runner.handCount).toBe(5);
    let l = await pick(page, hand(v0, 'runner').indexOf('r03'));
    const m = await measureTap(page, l.targets[0]!.box);
    expect(m.events.filter((e) => e.type === 'card_drawn')).toHaveLength(3);
    expect(m.view.players.runner.handCount).toBe(7);
    expectSnappy(m, ['play_flight', 'draw_flight']);
    l = await waitIdle(page);
    expect(l.hand).toHaveLength(7);
    await tap(page, l.endTurn!.box);
    l = await waitIdle(page);
    expect(l.picker).not.toBeNull();
    expect(l.picker!.remaining).toBe(2);
    expect((await getView(page)).pendingDiscard).toBe(2);
  });

  test('a card you cannot afford: only "Not enough credits", nothing changes', async ({ page }) => {
    // The Corp spends on ICE (drawing otherwise) until Hedge Fund is out of reach.
    const plan = planSomeSeed(
      (v) => {
        if (v.viewer !== 'corp') return null;
        const ice = v.handOptions.flat().filter((o) => o.action.type === 'install' && o.reject === null && o.cost > 0);
        if (ice[0]) return ice[0].action;
        const free = v.handOptions.flat().find((o) => o.action.type === 'install' && o.reject === null && typeOf(hand(v, 'corp')[o.action.handIndex]) === 'ice');
        if (free) return free.action;
        return v.players.corp.deckCount > 3 ? { type: 'draw', player: 'corp' } : null;
      },
      (v) => v.viewer === 'corp' && v.phase === 'action' && v.players.corp.clicks > 0 && hand(v, 'corp').some((id, k) => id === 'c01' && v.handOptions[k]![0]!.reject === 'no_credits'),
    );
    await openBoard(page, plan.seed);
    await replayOnPage(page, plan.actions);
    const before = await getView(page);
    const l = await pick(page, hand(before, 'corp').indexOf('c01'));
    expect(l.targets.map((t) => [t.label, t.reject])).toEqual([['Play · 5 credits', 'no_credits']]);
    const m = await measureTap(page, l.targets[0]!.box);
    expect(m.events).toEqual([{ type: 'action_rejected', reason: 'no_credits' }]);
    expect(m.view).toEqual(before);
    expect(m.anims.find((a) => a.kind === 'hint')?.text).toBe('Not enough credits');
  });

  for (const [side, id] of [
    ['corp', 'c12'],
    ['runner', 'r11'],
  ] as const) {
    test(`${getCard(id)!.name} needs runs: tapping it says "Needs runs (coming soon)" and spends nothing`, async ({ page }) => {
      const seed = findSeed((c, r) => (side === 'corp' ? c : r).includes(id));
      await openBoard(page, seed);
      if (side === 'runner') await toRunnerTurn(page);
      const before = await getView(page);
      const l0 = await layout(page);
      const m = await measureTap(page, l0.hand[hand(before, side).indexOf(id)]!.box);
      expect(m.view).toEqual(before);
      expect(m.anims.find((a) => a.kind === 'hint')?.text).toBe('Needs runs (coming soon)');
      expect((await layout(page)).targets).toEqual([]);
    });
  }
});
