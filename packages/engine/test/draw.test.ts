import { describe, expect, it } from 'vitest';
import { apply, newGame, type GameState, type Side } from '../src/index';
import { clone, deepFreeze, draw, finishTurn, run, withClicks, withDeck } from './helpers';

/** A state where `side` is active with full clicks. */
function turnOf(side: Side): GameState {
  const g = newGame(2024);
  return side === 'corp' ? g : finishTurn(g).state;
}

describe.each(['corp', 'runner'] as const)('S-01-2 AC2: draw on the %s turn', (side) => {
  it('moves the top card to hand, spends 1 click, emits card_drawn', () => {
    const before = turnOf(side);
    const other = side === 'corp' ? 'runner' : 'corp';
    const top = before.players[side].deck[0];
    const { state, events } = apply(before, draw(side));

    expect(state).not.toBe(before);
    expect(state.players[side].hand).toEqual([...before.players[side].hand, top]);
    expect(state.players[side].deck).toEqual(before.players[side].deck.slice(1));
    expect(state.players[side].clicks).toBe(before.players[side].clicks - 1);
    expect(state.players[side].credits).toBe(before.players[side].credits);
    expect(state.players[other]).toEqual(before.players[other]);
    expect(state.activePlayer).toBe(side);
    expect(events).toEqual([{ type: 'card_drawn', player: side, cardId: top }]);
  });

  it('can draw once per click, then is out of clicks', () => {
    const before = turnOf(side);
    const clicks = before.players[side].clicks;
    const { state } = run(before, Array.from({ length: clicks }, () => draw(side)));
    expect(state.players[side].clicks).toBe(0);
    expect(state.players[side].hand).toHaveLength(before.players[side].hand.length + clicks);
    expect(apply(state, draw(side)).events).toEqual([{ type: 'action_rejected', reason: 'no_clicks' }]);
  });

  it('S-01-2 AC3: 0 clicks -> no_clicks, state unchanged', () => {
    const before = withClicks(turnOf(side), side, 0);
    const snapshot = clone(before);
    const { state, events } = apply(before, draw(side));
    expect(events).toEqual([{ type: 'action_rejected', reason: 'no_clicks' }]);
    expect(state).toBe(before);
    expect(state).toEqual(snapshot);
  });

  it('empty deck: click-draw is rejected with deck_empty and nothing is lost', () => {
    const before = withDeck(turnOf(side), side, []);
    const { state, events } = apply(before, draw(side));
    expect(events).toEqual([{ type: 'action_rejected', reason: 'deck_empty' }]);
    expect(state).toBe(before);
  });

  it('S-01-2 AC4: off-turn draw is rejected with not_your_turn', () => {
    const before = turnOf(side === 'corp' ? 'runner' : 'corp');
    const { state, events } = apply(before, draw(side));
    expect(events).toEqual([{ type: 'action_rejected', reason: 'not_your_turn' }]);
    expect(state).toBe(before);
  });
});

describe('purity', () => {
  it('apply never mutates its input (deep-frozen state, success and rejection)', () => {
    const before = deepFreeze(newGame(11));
    const snapshot = clone(before);
    expect(() => apply(before, draw('corp'))).not.toThrow();
    expect(() => apply(before, draw('runner'))).not.toThrow();
    expect(() => apply(before, { type: 'end_turn', player: 'corp' })).not.toThrow();
    const zero = deepFreeze(withClicks(newGame(11), 'corp', 0));
    expect(() => apply(zero, draw('corp'))).not.toThrow();
    expect(before).toEqual(snapshot);
  });

  it('same state + same action => same result', () => {
    const s = newGame(8);
    expect(apply(s, draw('corp'))).toEqual(apply(s, draw('corp')));
  });
});
