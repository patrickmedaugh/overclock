import { describe, expect, it } from 'vitest';
import { apply, newGame, type GameState, type Side } from '../src/index';
import { clone, finishTurn, gainCredit, run, withClicks } from './helpers';

function turnOf(side: Side): GameState {
  const g = newGame(77);
  return side === 'corp' ? g : finishTurn(g).state;
}

describe.each(['corp', 'runner'] as const)('S-01-2 AC1: gain_credit on the %s turn', (side) => {
  it('+1 credit, 1 click spent, credit_gained event; nothing else changes', () => {
    const before = turnOf(side);
    const me = before.players[side];
    const { state, events } = apply(before, gainCredit(side));
    expect(events).toEqual([{ type: 'credit_gained', player: side, amount: 1 }]);
    expect(state.players[side]).toEqual({ ...me, credits: me.credits + 1, clicks: me.clicks - 1 });
    const other = side === 'corp' ? 'runner' : 'corp';
    expect(state.players[other]).toEqual(before.players[other]);
    expect(state.activePlayer).toBe(side);
  });

  it('spending every click on credits gives +clicks credits', () => {
    const before = turnOf(side);
    const clicks = before.players[side].clicks;
    const { state } = run(before, Array.from({ length: clicks }, () => gainCredit(side)));
    expect(state.players[side].credits).toBe(before.players[side].credits + clicks);
    expect(state.players[side].clicks).toBe(0);
  });

  it('S-01-2 AC3: 0 clicks -> no_clicks, state unchanged', () => {
    const before = withClicks(turnOf(side), side, 0);
    const snapshot = clone(before);
    const { state, events } = apply(before, gainCredit(side));
    expect(events).toEqual([{ type: 'action_rejected', reason: 'no_clicks' }]);
    expect(state).toBe(before);
    expect(state).toEqual(snapshot);
  });

  it('S-01-2 AC4: off-turn gain_credit is rejected with not_your_turn', () => {
    const before = turnOf(side === 'corp' ? 'runner' : 'corp');
    const { state, events } = apply(before, gainCredit(side));
    expect(events).toEqual([{ type: 'action_rejected', reason: 'not_your_turn' }]);
    expect(state).toBe(before);
  });
});
