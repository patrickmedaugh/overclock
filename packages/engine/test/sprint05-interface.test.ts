// Sprint 5 interface (E1): the new fields exist with their resting values.
import { describe, expect, it } from 'vitest';
import { newGame, viewFor } from '../src/index';

describe('Sprint 5 interface', () => {
  it('a new game has no last run, and neither view shows one', () => {
    const s = newGame(1);
    expect(s.lastRun).toBeNull();
    expect(viewFor('runner', s).lastRun).toBeNull();
    expect(viewFor('corp', s).lastRun).toBeNull();
  });

  it('lastRun survives a JSON round trip (plain JSON state)', () => {
    const s = newGame(2);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
