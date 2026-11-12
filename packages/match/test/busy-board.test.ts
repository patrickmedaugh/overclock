import { replay, viewFor } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { LocalMatch } from '../src/index';
import { BUSY_BOARD, busyBoardReached, planBusyBoard } from '../src/testing';

describe('planBusyBoard (e2e setup helper)', () => {
  it.each([1, 2, 7, 42, 12345])('seed %i: reaches 3 remotes x 2 ICE and 4 Runner installs, every action accepted', (seed) => {
    const plan = planBusyBoard(seed);
    const m = new LocalMatch(seed);
    for (const a of plan.actions) {
      const u = m.submit(a.player, a);
      expect(u[a.player].events.some((e) => e.type === 'action_rejected')).toBe(false);
    }
    const v = m.view('corp');
    expect(busyBoardReached(v)).toBe(true);
    const remotes = v.corpServers.filter((s) => s.id.startsWith('remote'));
    expect(remotes.map((s) => s.id).slice(0, 3)).toEqual(['remote1', 'remote2', 'remote3']);
    for (const s of remotes.slice(0, 3)) expect(s.ice.length).toBeGreaterThanOrEqual(BUSY_BOARD.icePerRemote);
    expect(v.rig.length).toBeGreaterThanOrEqual(4);
    expect(v.phase).toBe('action');
    expect(v.activePlayer).toBe(plan.activePlayer);
    // Same board from (seed, actions) alone.
    expect(viewFor('corp', replay(seed, plan.actions).state)).toEqual(v);
  });

  it('is deterministic for a seed', () => {
    expect(planBusyBoard(9)).toEqual(planBusyBoard(9));
  });
});
