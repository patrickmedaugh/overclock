import { describe, expect, it } from 'vitest';
import { apply, newGame, replay, type Action } from '../src/index';

describe('replay from (seed, actions[])', () => {
  it('reproduces the exact same state and events as playing live', () => {
    const actions: Action[] = Array.from({ length: 6 }, () => ({ type: 'draw', player: 'runner' }));
    let live = newGame(777);
    const liveEvents = [];
    for (const a of actions) {
      const r = apply(live, a);
      live = r.state;
      liveEvents.push(...r.events);
    }
    const replayed = replay(777, actions);
    expect(replayed.state).toEqual(live);
    expect(replayed.events).toEqual(liveEvents);
    // 4 draws, then 2 no_clicks rejections.
    expect(replayed.events.filter((e) => e.type === 'card_drawn')).toHaveLength(4);
    expect(replayed.events.slice(4)).toEqual([
      { type: 'action_rejected', reason: 'no_clicks' },
      { type: 'action_rejected', reason: 'no_clicks' },
    ]);
  });
});
