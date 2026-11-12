import { describe, expect, it } from 'vitest';
import { apply, newGame, viewFor, type Action, type GameState, type Side } from '../src/index';
import { clone, finishTurn, run, withClicks, withDeck, withHand, withPlayer } from './helpers';

// Corp: c01 Hedge Fund (5: gain 9), c02 Anonymous Tip (0: draw 3), c12 Neural EMP (needs runs), c08 agenda.
// Runner: r01 Easy Mark (0: gain 3), r03 Diesel (0: draw 3), r07 The Maker's Eye / r11 Inside Job (need runs), r04 program.
const play = (player: Side, handIndex: number): Action => ({ type: 'play', player, handIndex });

const corpWith = (hand: string[], credits = 5): GameState => withPlayer(withHand(newGame(13), 'corp', hand), 'corp', { credits });
const runnerWith = (hand: string[], credits = 5): GameState =>
  withPlayer(withHand(finishTurn(newGame(13)).state, 'runner', hand), 'runner', { credits });

function expectRejected(state: GameState, action: Action, reason: string): void {
  const before = clone(state);
  const r = apply(state, action);
  expect(r.events).toEqual([{ type: 'action_rejected', reason }]);
  expect(r.state).toBe(state);
  expect(state).toEqual(before);
}

describe('S-02-4 AC2: play resolves, uses a click, goes face up on the discard pile', () => {
  it('Hedge Fund: 5 credits -> pay 5, gain 9 = 9; events in order', () => {
    const s = corpWith(['c08', 'c01']);
    const r = apply(s, play('corp', 1));
    expect(r.events).toEqual([
      { type: 'credits_spent', player: 'corp', amount: 5 },
      { type: 'card_played', player: 'corp', handIndex: 1, cardId: 'c01', cost: 5 },
      { type: 'credit_gained', player: 'corp', amount: 9 },
      { type: 'card_resolved', player: 'corp', cardId: 'c01' },
    ]);
    expect(r.state.players.corp).toMatchObject({ credits: 9, clicks: 2, hand: ['c08'] });
    expect(r.state.players.corp.discard).toEqual([{ cardId: 'c01', faceUp: true }]);
  });

  it('played Corp operations are face up in Archives for the Runner too (next to face-down discards)', () => {
    let s = run(corpWith(['c01', 'c08', 'c08', 'c08', 'c08', 'c08', 'c08']), [play('corp', 0), { type: 'end_turn', player: 'corp' }]).state;
    s = run(s, [{ type: 'discard', player: 'corp', handIndices: [0] }]).state;
    expect(s.players.corp.discard).toEqual([
      { cardId: 'c01', faceUp: true },
      { cardId: 'c08', faceUp: false },
    ]);
    expect(viewFor('runner', s).players.corp.discard).toEqual(['c01', null]);
    expect(viewFor('corp', s).players.corp.discard).toEqual(['c01', 'c08']);
  });

  it('Anonymous Tip: free, draws 3 (after the card leaves the hand)', () => {
    const s = withDeck(corpWith(['c02', 'c08']), 'corp', ['c04', 'c05', 'c06', 'c07']);
    const r = apply(s, play('corp', 0));
    expect(r.events).toEqual([
      { type: 'card_played', player: 'corp', handIndex: 0, cardId: 'c02', cost: 0 },
      { type: 'card_drawn', player: 'corp', cardId: 'c04' },
      { type: 'card_drawn', player: 'corp', cardId: 'c05' },
      { type: 'card_drawn', player: 'corp', cardId: 'c06' },
      { type: 'card_resolved', player: 'corp', cardId: 'c02' },
    ]);
    expect(r.state.players.corp).toMatchObject({ hand: ['c08', 'c04', 'c05', 'c06'], deck: ['c07'], credits: 5, clicks: 2 });
  });

  it('Diesel with a short deck draws what is there, no loss', () => {
    const s = withDeck(runnerWith(['r03']), 'runner', ['r04']);
    const r = apply(s, play('runner', 0));
    expect(r.events.filter((e) => e.type === 'card_drawn')).toEqual([{ type: 'card_drawn', player: 'runner', cardId: 'r04' }]);
    expect(r.state.phase).toBe('action');
    expect(r.state.result).toBeNull();
    const empty = apply(withDeck(runnerWith(['r03']), 'runner', []), play('runner', 0));
    expect(empty.events.map((e) => e.type)).toEqual(['card_played', 'card_resolved']);
  });

  it('Easy Mark: free, +3 credits, face up in the Heap', () => {
    const r = apply(runnerWith(['r01']), play('runner', 0));
    expect(r.events).toEqual([
      { type: 'card_played', player: 'runner', handIndex: 0, cardId: 'r01', cost: 0 },
      { type: 'credit_gained', player: 'runner', amount: 3 },
      { type: 'card_resolved', player: 'runner', cardId: 'r01' },
    ]);
    expect(r.state.players.runner).toMatchObject({ credits: 8, clicks: 3 });
    expect(viewFor('corp', r.state).players.runner.discard).toEqual(['r01']);
  });

});

describe('S-02-4 AC3: can not afford', () => {
  it('Hedge Fund with 4 credits: no_credits, nothing changes', () => {
    expectRejected(corpWith(['c01'], 4), play('corp', 0), 'no_credits');
  });
});

describe('S-02-4 AC4: cards that need runs', () => {
  it('needs_runs and nothing is spent, even when also unaffordable', () => {
    expectRejected(corpWith(['c12']), play('corp', 0), 'needs_runs');
    expectRejected(corpWith(['c12'], 0), play('corp', 0), 'needs_runs');
    expectRejected(runnerWith(['r07']), play('runner', 0), 'needs_runs');
    expectRejected(runnerWith(['r11'], 0), play('runner', 0), 'needs_runs');
  });
});

describe('S-02-4 AC5: a played card pushes the hand over 5 -> hand-limit step at end of turn', () => {
  it('Diesel to 7 cards, then end_turn asks for 2 discards', () => {
    const s = withDeck(runnerWith(['r03', 'r04', 'r05', 'r06', 'r09']), 'runner', ['r10', 'r12', 'r02']);
    const r = run(s, [play('runner', 0), { type: 'end_turn', player: 'runner' }]);
    expect(r.state.players.runner.hand).toHaveLength(7);
    expect(r.events.at(-1)).toEqual({ type: 'discard_required', player: 'runner', count: 2 });
    expect(r.state.phase).toBe('discard');
    expect(viewFor('runner', r.state).pendingDiscard).toBe(2);
  });
});

describe('play validation', () => {
  it('bad_card: an installable card, an out-of-range index', () => {
    expectRejected(corpWith(['c08']), play('corp', 0), 'bad_card');
    expectRejected(corpWith(['c01']), play('corp', 1), 'bad_card');
    expectRejected(runnerWith(['r04']), play('runner', 0), 'bad_card');
  });

  it('invalid_action for a non-integer handIndex; no_clicks before bad_card', () => {
    expectRejected(corpWith(['c01']), { type: 'play', player: 'corp', handIndex: 'x' } as unknown as Action, 'invalid_action');
    expectRejected(corpWith(['c01']), { type: 'play', player: 'corp' } as unknown as Action, 'invalid_action');
    expectRejected(withClicks(corpWith(['c08']), 'corp', 0), play('corp', 0), 'no_clicks');
    expectRejected(corpWith(['c01']), play('runner', 0), 'not_your_turn');
  });
});
