import { describe, expect, it } from 'vitest';
import { apply, newGame, replay, type Action, type GameEvent } from '../src/index';
import { discard, draw, endTurn, gainCredit } from './helpers';

describe('replay from (seed, actions[])', () => {
  const actions: Action[] = [
    draw('corp'),
    gainCredit('corp'),
    draw('runner'), // rejected: not_your_turn (no-op in replay)
    endTurn('corp'), // 7 cards -> discard 2
    discard('corp', [1, 3]),
    draw('runner'),
    draw('runner'),
    draw('runner'),
    draw('runner'),
    draw('runner'), // rejected: no_clicks
    endTurn('runner'), // 9 cards -> discard 4
    discard('runner', [0, 2, 4, 6]),
    gainCredit('corp'),
  ];

  it('reproduces the exact same state and events as playing live, across turns and discards', () => {
    let live = newGame(777);
    const liveEvents: GameEvent[] = [];
    for (const a of actions) {
      const r = apply(live, a);
      live = r.state;
      liveEvents.push(...r.events);
    }
    const replayed = replay(777, actions);
    expect(replayed.state).toEqual(live);
    expect(replayed.events).toEqual(liveEvents);
    expect(replayed.events.filter((e) => e.type === 'action_rejected')).toEqual([
      { type: 'action_rejected', reason: 'not_your_turn' },
      { type: 'action_rejected', reason: 'no_clicks' },
    ]);
    expect(replayed.state).toMatchObject({ turn: 3, activePlayer: 'corp', phase: 'action' });
    expect(replayed.state.players.corp.clicks).toBe(2);
    expect(replayed.state.players.runner.discard).toHaveLength(4);
    expect(replayed.state.players.corp.discard).toHaveLength(2);
  });

  it('the action log survives a JSON round trip (server storage)', () => {
    const viaJson = JSON.parse(JSON.stringify(actions)) as Action[];
    expect(replay(777, viaJson)).toEqual(replay(777, actions));
  });
});
