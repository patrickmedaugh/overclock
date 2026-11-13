// Sprint 5 E2 (S-05-2): `subroutine_resolved{iceUid, cardId, outcome}` after each fired
// subroutine's own effect events, before whatever ends the run / game. Public.
import { describe, expect, it } from 'vitest';
import { viewEvents, type Action, type GameEvent, type GameState, type ServerId } from '../src/index';
import { act, board, type BoardSpec } from './helpers';

const runOn = (server: ServerId): Action => ({ type: 'run', player: 'runner', server });
const letFire: Action = { type: 'pass', player: 'runner' };
const use = (uid: string, ability: number, sub?: number): Action =>
  sub === undefined ? { type: 'use_ability', player: 'runner', uid, ability } : { type: 'use_ability', player: 'runner', uid, ability, sub };
const resolved = (iceUid: string, cardId: string, sub: number, op: string, amount: number) => ({
  type: 'subroutine_resolved',
  iceUid,
  cardId,
  outcome: { sub, op, amount },
});

function encounterOn(spec: BoardSpec, patch: Partial<GameState> = {}): GameState {
  const s = act({ ...board(spec), ...patch }, runOn('hq')).state;
  expect(s.run?.step).toBe('encounter');
  return s;
}

const types = (events: readonly GameEvent[]) => events.map((e) => e.type);

describe('S-05-2: subroutine_resolved', () => {
  it('Enigma with clicks: lose_clicks 1, then end_run 0, before run_ended', () => {
    const r = act(encounterOn({ servers: { hq: { ice: ['+c06'] } }, runnerClicks: 4 }), letFire);
    expect(r.events).toEqual([
      { type: 'subroutine_fired', iceUid: 'i1', sub: 0 },
      { type: 'clicks_lost', player: 'runner', amount: 1 },
      resolved('i1', 'c06', 0, 'lose_clicks', 1),
      { type: 'subroutine_fired', iceUid: 'i1', sub: 1 },
      resolved('i1', 'c06', 1, 'end_run', 0),
      { type: 'run_ended', server: 'hq', outcome: 'ended_by_ice' },
    ]);
  });

  it('Enigma with no click left: lose_clicks amount 0 (actual), no clicks_lost', () => {
    const r = act(encounterOn({ servers: { hq: { ice: ['+c06'] } }, runnerClicks: 1 }), letFire);
    expect(r.events).toEqual([
      { type: 'subroutine_fired', iceUid: 'i1', sub: 0 },
      resolved('i1', 'c06', 0, 'lose_clicks', 0),
      { type: 'subroutine_fired', iceUid: 'i1', sub: 1 },
      resolved('i1', 'c06', 1, 'end_run', 0),
      { type: 'run_ended', server: 'hq', outcome: 'ended_by_ice' },
    ]);
  });

  it('Neural Katana: net_damage 3 after the net_damage event; the run goes on (ICE passed)', () => {
    const r = act(encounterOn({ servers: { hq: { ice: ['+c07'] } }, runnerHand: ['r01', 'r02', 'r03', 'r09', 'r12'] }), letFire);
    expect(types(r.events)).toEqual(['subroutine_fired', 'net_damage', 'subroutine_resolved', 'ice_passed']);
    expect(r.events[2]).toEqual(resolved('i1', 'c07', 0, 'net_damage', 3));
  });

  it('Neural Katana flatline: subroutine_resolved before run_ended and game_over', () => {
    const r = act(encounterOn({ servers: { hq: { ice: ['+c07'] } }, runnerHand: ['r01'] }), letFire);
    expect(r.events).toEqual([
      { type: 'subroutine_fired', iceUid: 'i1', sub: 0 },
      { type: 'net_damage', amount: 3, cardIds: ['r01'] },
      resolved('i1', 'c07', 0, 'net_damage', 3),
      { type: 'run_ended', server: 'hq', outcome: 'flatline' },
      { type: 'game_over', winner: 'corp', reason: 'flatline' },
    ]);
  });

  it('Ice Wall and Wall of Static: end_run 0', () => {
    for (const ice of ['c05', 'c04']) {
      const r = act(encounterOn({ servers: { hq: { ice: [`+${ice}`] } } }), letFire);
      expect(r.events).toEqual([
        { type: 'subroutine_fired', iceUid: 'i1', sub: 0 },
        resolved('i1', ice, 0, 'end_run', 0),
        { type: 'run_ended', server: 'hq', outcome: 'ended_by_ice' },
      ]);
    }
  });

  it('a broken subroutine does not fire and gets no subroutine_resolved', () => {
    // i1 Gordian Blade; Enigma i2. Break "End the run" (sub 1); sub 0 fires.
    const s = act(encounterOn({ rig: ['r05'], servers: { hq: { ice: ['+c06'] } } }), use('i1', 0, 1)).state;
    const r = act(s, letFire);
    expect(r.events.filter((e) => e.type === 'subroutine_resolved')).toEqual([resolved('i2', 'c06', 0, 'lose_clicks', 1)]);
  });

  it('the run-end bookkeeping (strength drop, run-only credits) comes after subroutine_resolved', () => {
    // i1 Corroder pumped +1 for this encounter, then Wall of Static (i2) fires; bad publicity 1.
    const s = act(encounterOn({ rig: ['r04'], servers: { hq: { ice: ['+c04'] } }, runnerCredits: 0 }, { badPublicity: 1 }), use('i1', 1)).state;
    const r = act(s, letFire);
    expect(types(r.events)).toEqual(['subroutine_fired', 'subroutine_resolved', 'strength_changed', 'run_ended']);
    const withTemp = act(encounterOn({ servers: { hq: { ice: ['+c04'] } } }, { badPublicity: 1 }), letFire);
    expect(types(withTemp.events)).toEqual(['subroutine_fired', 'subroutine_resolved', 'temp_credits_lost', 'run_ended']);
  });

  it('is public: both seats get it unchanged', () => {
    const r = act(encounterOn({ servers: { hq: { ice: ['+c06'] } } }), letFire);
    const mine = r.events.filter((e) => e.type === 'subroutine_resolved');
    expect(mine).toHaveLength(2);
    for (const side of ['corp', 'runner'] as const) expect(viewEvents(side, mine)).toEqual(mine);
  });
});
