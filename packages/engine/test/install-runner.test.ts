import { describe, expect, it } from 'vitest';
import { apply, newGame, viewFor, type Action, type GameState, type InstallTarget } from '../src/index';
import { clone, finishTurn, run, withClicks, withHand, withPlayer } from './helpers';

// r04 Corroder (program 2, 1 MU), r05 Gordian Blade (program 4, 1 MU), r06 Ninja (program 4, 1 MU),
// r09 Akamatsu Mem Chip (hardware 1), r10 Wyldside (resource 3), r12 Data Dealer (resource 0), r01 Easy Mark (event).
const install = (handIndex: number): Action => ({ type: 'install', player: 'runner', handIndex });

/** Runner turn 2 with a chosen hand, 4 clicks and `credits`. */
const runnerWith = (hand: string[], credits = 5): GameState =>
  withPlayer(withHand(finishTurn(newGame(12)).state, 'runner', hand), 'runner', { credits });

function expectRejected(state: GameState, action: Action, reason: string): void {
  const before = clone(state);
  const r = apply(state, action);
  expect(r.events).toEqual([{ type: 'action_rejected', reason }]);
  expect(r.state).toBe(state);
  expect(state).toEqual(before);
}

describe('S-02-3 AC2: installing pays the cost, uses a click, card face up in the rig', () => {
  it('program: credits_spent then card_installed; rig.program holds it', () => {
    const s = runnerWith(['r04', 'r01']);
    const r = apply(s, install(0));
    expect(r.events).toEqual([
      { type: 'credits_spent', player: 'runner', amount: 2 },
      { type: 'card_installed', player: 'runner', uid: 'i1', handIndex: 0, cardId: 'r04', slot: 'program', index: 0 },
    ]);
    expect(r.state.players.runner).toMatchObject({ credits: 3, clicks: 3, hand: ['r01'] });
    expect(r.state.players.runner.rig.program).toEqual([{ uid: 'i1', cardId: 'r04', rezzed: false }]);
  });

  it('hardware and resources go to their rows; a 0-cost card spends nothing', () => {
    const r = run(runnerWith(['r09', 'r12', 'r10']), [install(0), install(0), install(0)]);
    expect(r.state.players.runner.rig).toEqual({
      program: [],
      hardware: [{ uid: 'i1', cardId: 'r09', rezzed: false }],
      resource: [
        { uid: 'i2', cardId: 'r12', rezzed: false },
        { uid: 'i3', cardId: 'r10', rezzed: false },
      ],
    });
    expect(r.state.players.runner.credits).toBe(5 - 1 - 0 - 3);
    expect(r.events.filter((e) => e.type === 'credits_spent')).toEqual([
      { type: 'credits_spent', player: 'runner', amount: 1 },
      { type: 'credits_spent', player: 'runner', amount: 3 },
    ]);
    expect(r.events.filter((e) => e.type === 'card_installed').map((e) => 'slot' in e && [e.slot, e.index])).toEqual([
      ['hardware', 0],
      ['resource', 0],
      ['resource', 1],
    ]);
  });
});

describe('S-02-3 AC3: not enough credits', () => {
  it('no_credits, nothing changes', () => {
    expectRejected(runnerWith(['r05'], 3), install(0), 'no_credits');
  });
});

describe('S-02-3 AC4/AC5: memory', () => {
  it('memory used/limit in both views', () => {
    const s = run(runnerWith(['r04', 'r05', 'r09'], 20), [install(0), install(0), install(0)]).state;
    for (const p of ['corp', 'runner'] as const) expect(viewFor(p, s).rig.memory).toEqual({ used: 2, limit: 4 });
  });

  it('a full memory refuses another program (no_memory); hardware/resources still install', () => {
    let s = run(runnerWith(['r04', 'r04', 'r04', 'r04', 'r06', 'r09'], 20), [install(0), install(0), install(0), install(0)]).state;
    expect(viewFor('runner', s).rig.memory).toEqual({ used: 4, limit: 4 });
    s = withClicks(s, 'runner', 2);
    expectRejected(s, install(0), 'no_memory');
    expect(run(s, [install(1)]).state.players.runner.rig.hardware).toHaveLength(1);
  });

  it('no_memory comes before no_credits', () => {
    let s = run(runnerWith(['r04', 'r04', 'r04', 'r04', 'r06'], 20), [install(0), install(0), install(0), install(0)]).state;
    s = withPlayer(s, 'runner', { clicks: 1, credits: 0 });
    expectRejected(s, install(0), 'no_memory');
  });
});

describe('install validation (Runner)', () => {
  it('bad_target: the Runner names a server', () => {
    const s = runnerWith(['r04']);
    for (const server of ['new', 'hq', 'remote-1'] as InstallTarget[]) {
      expectRejected(s, { type: 'install', player: 'runner', handIndex: 0, server }, 'bad_target');
    }
  });

  it('bad_card: event, or out of range', () => {
    const s = runnerWith(['r01', 'r04']);
    expectRejected(s, install(0), 'bad_card');
    expectRejected(s, install(2), 'bad_card');
  });

  it('bad_card beats bad_target; no_clicks beats bad_card', () => {
    const s = runnerWith(['r01']);
    expectRejected(s, { type: 'install', player: 'runner', handIndex: 0, server: 'new' }, 'bad_card');
    expectRejected(withClicks(s, 'runner', 0), install(5), 'no_clicks');
  });
});

describe('S-02-3 AC6: the rig is face up to the Corp', () => {
  it('Corp view shows rig card ids, face up', () => {
    const s = run(runnerWith(['r04', 'r09', 'r12']), [install(0), install(0), install(0)]).state;
    const cv = viewFor('corp', s);
    expect(cv.rig).toEqual({
      program: [{ uid: 'i1', cardId: 'r04', faceUp: true }],
      hardware: [{ uid: 'i2', cardId: 'r09', faceUp: true }],
      resource: [{ uid: 'i3', cardId: 'r12', faceUp: true }],
      memory: { used: 1, limit: 4 },
    });
    expect(viewFor('runner', s).rig).toEqual(cv.rig);
  });
});
