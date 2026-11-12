import { describe, expect, it } from 'vitest';
import { Session, seedFromUrl } from '../src/session';

describe('Session (interim LocalMatch bridge)', () => {
  it('submits through the match and shows the active seat view (Corp first)', () => {
    const s = new Session(7);
    const before = s.view();
    expect(before.viewer).toBe('corp');
    expect(before.players.runner.hand).toBeNull();
    const events = s.dispatch({ type: 'draw', player: 'corp' });
    expect(events[0]?.type).toBe('card_drawn');
    expect(s.view().players.corp.handCount).toBe(before.players.corp.handCount + 1);
    expect(s.lastEvents()).toEqual(events);
  });

  it('reads ?seed= from the URL', () => {
    expect(seedFromUrl('?seed=123')).toBe(123);
    expect(Number.isInteger(seedFromUrl(''))).toBe(true);
  });
});
