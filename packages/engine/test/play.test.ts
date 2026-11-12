// S-02-4: play operations (Corp) and events (Runner) with the card DSL v0.
import { describe, expect, it } from 'vitest';
import { apply, newGame, viewEvents, viewFor, type GameState } from '../src/index';
import { clone, endTurn, finishTurn, install, play, rejection, run, withCredits, withDeck, withHand } from './helpers';

function corp(hand: string[], credits = 5): GameState {
  return withCredits(withHand(newGame(31), 'corp', hand), 'corp', credits);
}

function runner(hand: string[], credits = 5): GameState {
  return withCredits(withHand(finishTurn(newGame(31)).state, 'runner', hand), 'runner', credits);
}

describe('S-02-4 AC1/AC2: the four playable cards', () => {
  it('Hedge Fund: 5 credits -> pay 5, gain 9 = 9; 1 click; face up on Archives', () => {
    const s = corp(['c01', 'c05']);
    const { state, events } = apply(s, play('corp', 0));
    expect(events).toEqual([
      { type: 'credits_spent', player: 'corp', amount: 5 },
      { type: 'card_played', player: 'corp', cardId: 'c01', handIndex: 0 },
      { type: 'credit_gained', player: 'corp', amount: 9 },
    ]);
    expect(state.players.corp).toMatchObject({ credits: 9, clicks: 2, hand: ['c05'] });
    expect(state.players.corp.discard).toEqual([{ cardId: 'c01', faceUp: true }]);
  });

  it('Anonymous Tip: free, draws 3', () => {
    const s = corp(['c02']);
    const deck = s.players.corp.deck.slice(0, 3);
    const { state, events } = apply(s, play('corp', 0));
    expect(events).toEqual([
      { type: 'card_played', player: 'corp', cardId: 'c02', handIndex: 0 },
      ...deck.map((cardId) => ({ type: 'card_drawn', player: 'corp', cardId })),
    ]);
    expect(state.players.corp.hand).toEqual(deck);
    expect(state.players.corp.credits).toBe(5);
  });

  it('Easy Mark: free, gain 3', () => {
    const { state, events } = apply(runner(['r01']), play('runner', 0));
    expect(events).toEqual([
      { type: 'card_played', player: 'runner', cardId: 'r01', handIndex: 0 },
      { type: 'credit_gained', player: 'runner', amount: 3 },
    ]);
    expect(state.players.runner).toMatchObject({ credits: 8, clicks: 3, hand: [] });
    expect(state.players.runner.discard).toEqual([{ cardId: 'r01', faceUp: true }]);
  });

  it('Diesel: free, draws 3', () => {
    const s = runner(['r03', 'r06']);
    const deck = s.players.runner.deck.slice(0, 3);
    const { state, events } = apply(s, play('runner', 0));
    expect(events.map((e) => e.type)).toEqual(['card_played', 'card_drawn', 'card_drawn', 'card_drawn']);
    expect(state.players.runner.hand).toEqual(['r06', ...deck]);
  });

  it('draw effects stop at an empty deck (short deck): no loss, game goes on', () => {
    const corpShort = withDeck(corp(['c02']), 'corp', ['c04', 'c06']);
    const c = apply(corpShort, play('corp', 0));
    expect(c.events.filter((e) => e.type === 'card_drawn')).toHaveLength(2);
    expect(c.state.players.corp.hand).toEqual(['c04', 'c06']);
    expect(c.state.phase).toBe('action');

    const runnerEmpty = withDeck(runner(['r03']), 'runner', []);
    const r = apply(runnerEmpty, play('runner', 0));
    expect(rejection(r.events)).toBeNull();
    expect(r.events).toEqual([{ type: 'card_played', player: 'runner', cardId: 'r03', handIndex: 0 }]);
    expect(r.state.phase).toBe('action');
  });

  it('plays duplicates by hand index', () => {
    const { state, events } = apply(corp(['c05', 'c01', 'c01'], 6), play('corp', 2));
    expect(events[1]).toEqual({ type: 'card_played', player: 'corp', cardId: 'c01', handIndex: 2 });
    expect(state.players.corp.hand).toEqual(['c05', 'c01']);
  });
});

describe('S-02-4 AC2: played cards are face up to both players', () => {
  it('a played operation shows in the Runner view of Archives; hand-limit discards stay face down', () => {
    // Corp: discard 1 face down at the hand limit, then next turn play Hedge Fund.
    let s = run(withHand(newGame(31), 'corp', ['c05', 'c04', 'c06', 'c07', 'c08', 'c09']), [
      endTurn('corp'),
      { type: 'discard', player: 'corp', handIndices: [0] },
    ]).state;
    s = finishTurn(s).state; // Runner turn ends; Corp turn 3
    s = withCredits(withHand(s, 'corp', ['c01']), 'corp', 5);
    const r = apply(s, play('corp', 0));
    expect(viewFor('runner', r.state).players.corp.discard).toEqual([null, 'c01']);
    expect(viewFor('corp', r.state).players.corp.discard).toEqual(['c05', 'c01']);
    // The play event itself names the card for the Runner (face up), without the hand index.
    expect(viewEvents('runner', r.events)).toEqual([
      { type: 'credits_spent', player: 'corp', amount: 5 },
      { type: 'card_played', player: 'corp', cardId: 'c01' },
      { type: 'credit_gained', player: 'corp', amount: 9 },
    ]);
  });

  it('Runner events go face up to the Heap, seen by the Corp', () => {
    const r = apply(runner(['r01']), play('runner', 0));
    expect(viewFor('corp', r.state).players.runner.discard).toEqual(['r01']);
    expect(viewEvents('corp', r.events)[0]).toEqual({ type: 'card_played', player: 'runner', cardId: 'r01' });
  });

  it('Anonymous Tip draws are hidden from the Runner like any Corp draw', () => {
    const r = apply(corp(['c02']), play('corp', 0));
    expect(viewEvents('runner', r.events)).toEqual([
      { type: 'card_played', player: 'corp', cardId: 'c02' },
      { type: 'card_drawn', player: 'corp' },
      { type: 'card_drawn', player: 'corp' },
      { type: 'card_drawn', player: 'corp' },
    ]);
  });
});

describe('S-02-4 AC3/AC4: refusals', () => {
  it('AC3: Hedge Fund with 4 credits -> no_credits, nothing changes', () => {
    const s = corp(['c01'], 4);
    const before = clone(s);
    const r = apply(s, play('corp', 0));
    expect(r.events).toEqual([{ type: 'action_rejected', reason: 'no_credits' }]);
    expect(s).toEqual(before);
  });

  it('AC4: cards that need runs are not_implemented and nothing is spent (Neural EMP, The Maker\'s Eye, Inside Job)', () => {
    for (const [s, p] of [
      [corp(['c12'], 9), 'corp'],
      [runner(['r07'], 9), 'runner'],
      [runner(['r11'], 9), 'runner'],
    ] as const) {
      const before = clone(s);
      const r = apply(s, play(p, 0));
      expect(r.events).toEqual([{ type: 'action_rejected', reason: 'not_implemented' }]);
      expect(s).toEqual(before);
    }
  });

  it('only operations/events can be played; installables are bad_card', () => {
    expect(rejection(apply(corp(['c05']), play('corp', 0)).events)).toBe('bad_card');
    expect(rejection(apply(runner(['r06']), play('runner', 0)).events)).toBe('bad_card');
    expect(rejection(apply(runner(['r06']), play('runner', 1)).events)).toBe('bad_card');
  });
});

describe('S-02-4 AC5: hand limit after a played card', () => {
  it('Diesel takes the Runner from 5 to 7 cards; End turn asks to discard 2', () => {
    const s = runner(['r03', 'r04', 'r05', 'r06', 'r09']);
    const after = run(s, [play('runner', 0)]).state;
    expect(after.players.runner.hand).toHaveLength(7);
    const r = apply(after, endTurn('runner'));
    expect(r.events).toEqual([{ type: 'discard_required', player: 'runner', count: 2 }]);
    expect(viewFor('runner', r.state).pendingDiscard).toBe(2);
  });

  it('Anonymous Tip on Corp turn 1 (6 cards) leaves 8; End turn asks to discard 3', () => {
    const s = withHand(newGame(31), 'corp', ['c02', 'c04', 'c05', 'c06', 'c07', 'c08']);
    const after = run(s, [play('corp', 0)]).state;
    expect(after.players.corp.hand).toHaveLength(8);
    expect(apply(after, endTurn('corp')).events).toEqual([{ type: 'discard_required', player: 'corp', count: 3 }]);
  });

  it('installing lowers the hand: 6 cards, install 1 -> no discard step', () => {
    const s = withHand(newGame(31), 'corp', ['c05', 'c04', 'c06', 'c07', 'c08', 'c09']);
    const after = run(s, [install('corp', 0, 'hq')]).state;
    expect(apply(after, endTurn('corp')).events[0]).toEqual({ type: 'turn_ended', player: 'corp' });
  });
});
