import { describe, expect, it } from 'vitest';
import { Session, seedFromUrl } from '../src/session';

describe('Session', () => {
  it('passes actions to the engine and exposes only the Runner view', () => {
    const s = new Session(7);
    const before = s.view();
    expect(before.viewer).toBe('runner');
    expect(before.players.corp.hand).toBeNull();
    const events = s.dispatch({ type: 'draw', player: 'runner' });
    expect(events[0]?.type).toBe('card_drawn');
    expect(s.view().players.runner.handCount).toBe(before.players.runner.handCount + 1);
    expect(s.lastEvents()).toEqual(events);
  });

  it('reads ?seed= from the URL', () => {
    expect(seedFromUrl('?seed=123')).toBe(123);
    expect(Number.isInteger(seedFromUrl(''))).toBe(true);
  });
});
