import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, viewFor, type GameState, type Side } from '../src/index';
import { discard, draw, endTurn, finishTurn, run, withHand } from './helpers';

const HAND7 = ['c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07'];
const RHAND7 = ['r01', 'r02', 'r03', 'r04', 'r05', 'r06', 'r07'];

/** `side` is active with a 7-card hand and has just tapped End turn. */
function inDiscardStep(side: Side): GameState {
  const g = newGame(31);
  const s = side === 'corp' ? withHand(g, 'corp', HAND7) : withHand(finishTurn(g).state, 'runner', RHAND7);
  return run(s, [endTurn(side)]).state;
}

describe('S-01-5 AC1: end_turn with more than 5 cards asks for a discard', () => {
  it.each(['corp', 'runner'] as const)('%s: discard_required{count}, phase discard, clicks 0, same turn', (side) => {
    const g = newGame(31);
    const s = side === 'corp' ? withHand(g, 'corp', HAND7) : withHand(finishTurn(g).state, 'runner', RHAND7);
    const { state, events } = apply(s, endTurn(side));
    expect(events).toEqual([{ type: 'discard_required', player: side, count: 2 }]);
    expect(state.phase).toBe('discard');
    expect(state.activePlayer).toBe(side);
    expect(state.turn).toBe(s.turn);
    expect(state.players[side].clicks).toBe(0);
    expect(state.players[side].hand).toEqual(s.players[side].hand);
  });

  it('the Corp on turn 1 (6 cards, after its free draw) must discard 1', () => {
    expect(apply(newGame(1), endTurn('corp')).events).toEqual([
      { type: 'discard_required', player: 'corp', count: 1 },
    ]);
  });

  it('pendingDiscard tells the active viewer how many to pick (opponent sees 0)', () => {
    const s = inDiscardStep('runner');
    expect(viewFor('runner', s).pendingDiscard).toBe(2);
    expect(viewFor('corp', s).pendingDiscard).toBe(0);
    expect(viewFor('runner', newGame(1)).pendingDiscard).toBe(0);
  });

  it('during the step only discard is legal (one representative: the last N cards)', () => {
    const s = inDiscardStep('corp');
    expect(legalActions(s, 'corp')).toEqual([{ type: 'discard', player: 'corp', handIndices: [5, 6] }]);
    expect(legalActions(s, 'runner')).toEqual([]);
    for (const a of [draw('corp'), endTurn('corp'), { type: 'gain_credit', player: 'corp' } as const]) {
      const r = apply(s, a);
      expect(r.events).toEqual([{ type: 'action_rejected', reason: 'wrong_phase' }]);
      expect(r.state).toBe(s);
    }
  });
});

/** Discard entries: Runner discards face up, Corp hand-limit discards face down. */
const up = (...ids: string[]) => ids.map((cardId) => ({ cardId, faceUp: true }));
const down = (...ids: string[]) => ids.map((cardId) => ({ cardId, faceUp: false }));

describe('S-01-5 AC3: confirming the discard moves the cards and ends the turn', () => {
  it('Runner: cards go face up to the heap in ascending index order, then the turn passes', () => {
    const s = inDiscardStep('runner');
    const { state, events } = apply(s, discard('runner', [4, 1]));
    expect(events.slice(0, 3)).toEqual([
      { type: 'cards_discarded', player: 'runner', count: 2, handIndices: [1, 4], cardIds: ['r02', 'r05'] },
      { type: 'turn_ended', player: 'runner' },
      { type: 'turn_started', player: 'corp', turn: s.turn + 1, clicks: 3 },
    ]);
    expect(events[3]?.type).toBe('card_drawn');
    expect(state.players.runner.hand).toEqual(['r01', 'r03', 'r04', 'r06', 'r07']);
    expect(state.players.runner.discard).toEqual(up('r02', 'r05'));
    expect(state.activePlayer).toBe('corp');
    expect(state.phase).toBe('action');
  });

  it('Corp: cards go to Archives; the turn passes to the Runner', () => {
    const s = inDiscardStep('corp');
    const { state, events } = apply(s, discard('corp', [0, 6]));
    expect(events).toEqual([
      { type: 'cards_discarded', player: 'corp', count: 2, handIndices: [0, 6], cardIds: ['c01', 'c07'] },
      { type: 'turn_ended', player: 'corp' },
      { type: 'turn_started', player: 'runner', turn: 2, clicks: 4 },
    ]);
    expect(state.players.corp.hand).toEqual(['c02', 'c03', 'c04', 'c05', 'c06']);
    expect(state.players.corp.discard).toEqual(down('c01', 'c07'));
  });

  it('discards stack on top of the existing pile (bottom = index 0)', () => {
    let s = inDiscardStep('corp');
    s = run(s, [discard('corp', [0, 1])]).state; // pile: c01 c02
    s = finishTurn(s).state; // Runner turn
    s = run(withHand(s, 'corp', HAND7.slice().reverse()), [endTurn('corp'), discard('corp', [0, 1])]).state;
    expect(s.players.corp.discard).toEqual(down('c01', 'c02', 'c07', 'c06'));
  });

  it('duplicate copies are handled by index (indices, not card ids)', () => {
    const g = withHand(newGame(2), 'corp', ['c01', 'c01', 'c01', 'c01', 'c01', 'c01']);
    const s = run(g, [endTurn('corp'), discard('corp', [3])]).state;
    expect(s.players.corp.hand).toEqual(['c01', 'c01', 'c01', 'c01', 'c01']);
    expect(s.players.corp.discard).toEqual(down('c01'));
  });
});

describe('S-01-5: bad discards are rejected (bad_discard), state unchanged', () => {
  const s = inDiscardStep('runner');
  it.each([
    ['too few', [0]],
    ['too many', [0, 1, 2]],
    ['none', []],
    ['duplicates', [3, 3]],
    ['out of range (high)', [0, 7]],
    ['out of range (negative)', [-1, 0]],
  ])('%s', (_name, idx) => {
    const r = apply(s, discard('runner', idx));
    expect(r.events).toEqual([{ type: 'action_rejected', reason: 'bad_discard' }]);
    expect(r.state).toBe(s);
  });

  it('non-integer indices are malformed (invalid_action)', () => {
    for (const idx of [[0.5, 1], ['0', '1'], null, 'x']) {
      const r = apply(s, { type: 'discard', player: 'runner', handIndices: idx } as never);
      expect(r.events).toEqual([{ type: 'action_rejected', reason: 'invalid_action' }]);
      expect(r.state).toBe(s);
    }
  });
});

describe('S-01-5 AC4: 5 or fewer cards skips the discard step', () => {
  it.each([0, 3, 5])('%i cards: end_turn passes the turn immediately', (n) => {
    const s = withHand(newGame(8), 'corp', HAND7.slice(0, n));
    const { state, events } = apply(s, endTurn('corp'));
    expect(events.map((e) => e.type)).toEqual(['turn_ended', 'turn_started']);
    expect(state.activePlayer).toBe('runner');
  });

  it('discard outside the step is wrong_phase', () => {
    const r = apply(newGame(8), discard('corp', [0]));
    expect(r.events).toEqual([{ type: 'action_rejected', reason: 'wrong_phase' }]);
  });
});
