// planBusyBoard: the S-02-5 busy board (3 remotes x 2 ICE, 4 Runner installs)
// is reachable with legal actions for any seed, deterministically.
import { replay, viewFor } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { LocalMatch, planBusyBoard } from '../src/index';

function check(seed: number): void {
  const plan = planBusyBoard(seed);
  const m = new LocalMatch(seed);
  for (const a of plan.actions) {
    const u = m.submit(a.player, a);
    expect(u[a.player].events.some((e) => e.type === 'action_rejected'), `seed ${seed}: ${JSON.stringify(a)}`).toBe(false);
  }
  const v = m.view('runner');
  const remotes = v.corpServers.filter((s) => s.id.startsWith('remote'));
  expect(remotes.map((s) => s.id)).toEqual(['remote1', 'remote2', 'remote3']);
  for (const s of remotes) expect(s.ice.length, `seed ${seed} ${s.id}`).toBe(2);
  expect(v.rig).toHaveLength(4);
  expect(v.phase).not.toBe('over');
  expect(v.activePlayer).toBe(plan.activePlayer);
  expect(v.turn).toBe(plan.turn);
}

describe('planBusyBoard(seed)', () => {
  it('reaches the busy board with accepted actions for seeds 1..300', () => {
    for (let seed = 1; seed <= 300; seed++) check(seed);
  });

  it('works for large and odd seeds too (the page may use any seed)', () => {
    for (const seed of [0, 4294967295, 123456789, 2 ** 31, 77777]) check(seed);
  });

  it('is deterministic and replays through the engine to the same state', () => {
    const a = planBusyBoard(42);
    expect(planBusyBoard(42)).toEqual(a);
    const s = replay(42, a.actions).state;
    expect(viewFor('corp', s).corpServers.filter((x) => x.id.startsWith('remote'))).toHaveLength(3);
    expect(s.rig).toHaveLength(4);
  });

  it('the plan is plain JSON (it is sent to the page through the test hook)', () => {
    const a = planBusyBoard(7);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('accepts a smaller goal', () => {
    const p = planBusyBoard(3, { remotes: 1, icePerRemote: 1, runnerInstalls: 1 });
    const s = replay(3, p.actions).state;
    expect(s.servers.filter((x) => x.id.startsWith('remote'))).toHaveLength(1);
  });
});
