import { describe, expect, it } from 'vitest';
import { BASE_MEMORY, newGame, viewFor } from '../src/index';

describe('Sprint 2 board state (servers, rig, counters)', () => {
  it('a new game has the three central servers, an empty rig and counters at 1', () => {
    const g = newGame(1);
    expect(g.nextUid).toBe(1);
    expect(g.nextRemote).toBe(1);
    expect(g.players.corp.servers).toEqual([
      { id: 'hq', ice: [], root: [] },
      { id: 'rd', ice: [], root: [] },
      { id: 'archives', ice: [], root: [] },
    ]);
    expect(g.players.runner.rig).toEqual({ program: [], hardware: [], resource: [] });
    expect(BASE_MEMORY).toBe(4);
  });

  it('both views show the centrals (remote: null) and the empty rig with memory 0/4', () => {
    for (const p of ['corp', 'runner'] as const) {
      const v = viewFor(p, newGame(1));
      expect(v.servers).toEqual([
        { id: 'hq', remote: null, ice: [], root: [] },
        { id: 'rd', remote: null, ice: [], root: [] },
        { id: 'archives', remote: null, ice: [], root: [] },
      ]);
      expect(v.rig).toEqual({ program: [], hardware: [], resource: [], memory: { used: 0, limit: 4 } });
    }
  });

  it('state stays plain JSON', () => {
    const g = newGame(9);
    expect(JSON.parse(JSON.stringify(g))).toEqual(g);
  });
});
