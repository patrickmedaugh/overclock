import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, type Action } from '../src/index';
import { clone, deepFreeze, withRunnerClicks, withRunnerDeck } from './helpers';

const draw: Action = { type: 'draw', player: 'runner' };

describe('draw (S-00-5 AC2: returns new state and a card_drawn event)', () => {
  it('moves the top card to hand, spends 1 click, emits card_drawn', () => {
    const before = newGame(2024);
    const top = before.players.runner.deck[0];
    const { state, events } = apply(before, draw);

    expect(state).not.toBe(before);
    expect(state.players.runner.hand).toEqual([...before.players.runner.hand, top]);
    expect(state.players.runner.deck).toEqual(before.players.runner.deck.slice(1));
    expect(state.players.runner.clicks).toBe(before.players.runner.clicks - 1);
    expect(state.players.runner.credits).toBe(before.players.runner.credits);
    expect(state.players.corp).toEqual(before.players.corp);
    expect(events).toEqual([{ type: 'card_drawn', player: 'runner', cardId: top }]);
  });

  it('four draws use all four clicks', () => {
    let s = newGame(5);
    for (let i = 0; i < 4; i++) s = apply(s, draw).state;
    expect(s.players.runner.clicks).toBe(0);
    expect(s.players.runner.hand).toHaveLength(9);
  });
});

describe('draw rejections (S-00-4 AC2: 0 clicks -> nothing drawn, "no clicks")', () => {
  it('0 clicks: rejected with no_clicks, nothing drawn, state unchanged', () => {
    const before = withRunnerClicks(newGame(3), 0);
    const snapshot = clone(before);
    const { state, events } = apply(before, draw);
    expect(events).toEqual([{ type: 'action_rejected', reason: 'no_clicks' }]);
    expect(state).toBe(before);
    expect(state).toEqual(snapshot);
  });

  it('empty deck: rejected with deck_empty', () => {
    const before = withRunnerDeck(newGame(3), []);
    const { state, events } = apply(before, draw);
    expect(events).toEqual([{ type: 'action_rejected', reason: 'deck_empty' }]);
    expect(state).toBe(before);
  });

  it('not the active player: rejected with not_your_turn', () => {
    const before = newGame(3);
    const { state, events } = apply(before, { type: 'draw', player: 'corp' });
    expect(events).toEqual([{ type: 'action_rejected', reason: 'not_your_turn' }]);
    expect(state).toBe(before);
  });

  it('malformed actions are rejected with invalid_action instead of throwing', () => {
    const before = newGame(3);
    for (const bad of [null, {}, { type: 'nope', player: 'runner' }, { type: 'draw', player: 'x' }]) {
      const { state, events } = apply(before, bad as unknown as Action);
      expect(events).toEqual([{ type: 'action_rejected', reason: 'invalid_action' }]);
      expect(state).toBe(before);
    }
  });
});

describe('purity', () => {
  it('apply never mutates its input (deep-frozen state, success and rejection)', () => {
    const before = deepFreeze(newGame(11));
    const snapshot = clone(before);
    expect(() => apply(before, draw)).not.toThrow();
    expect(() => apply(before, { type: 'draw', player: 'corp' })).not.toThrow();
    const zero = deepFreeze(withRunnerClicks(newGame(11), 0));
    expect(() => apply(zero, draw)).not.toThrow();
    expect(before).toEqual(snapshot);
  });

  it('same state + same action => same result', () => {
    const s = newGame(8);
    expect(apply(s, draw)).toEqual(apply(s, draw));
  });
});

describe('legalActions', () => {
  it('Runner with clicks and cards may draw', () => {
    expect(legalActions(newGame(1), 'runner')).toEqual([draw]);
  });

  it('nothing is legal with 0 clicks, an empty deck, or off-turn', () => {
    expect(legalActions(withRunnerClicks(newGame(1), 0), 'runner')).toEqual([]);
    expect(legalActions(withRunnerDeck(newGame(1), []), 'runner')).toEqual([]);
    expect(legalActions(newGame(1), 'corp')).toEqual([]);
  });

  it('every legal action is accepted by apply', () => {
    const s = newGame(4);
    for (const a of legalActions(s, 'runner')) {
      expect(apply(s, a).events.some((e) => e.type === 'action_rejected')).toBe(false);
    }
  });
});
