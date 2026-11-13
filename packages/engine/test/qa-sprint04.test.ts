// QA Sprint 4 (written by QA, not the developers): independent probes of S-04-4.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewFor, type Action, type GameState } from '../src/index';
import { act, board, corpBoard, run, type BoardSpec } from './helpers';

const withBp = (spec: BoardSpec, bp: number): GameState => ({ ...board(spec), badPublicity: bp });
const runOn = (server: string): Action => ({ type: 'run', player: 'runner', server }) as Action;
const score = (uid: string): Action => ({ type: 'score', player: 'corp', uid });

describe('QA S-04-4 AC2: run-only credits are for the run only', () => {
  it('cannot pay for the run event that starts the run (Inside Job, 2 credits, with 1 own + 1 bad publicity)', () => {
    const s = withBp({ runnerHand: ['r11', 'r01'], runnerCredits: 1 }, 1);
    const opts = viewFor('runner', s).handOptions[0]!;
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) expect(o.reject).toBe('no_credits');
    expect(apply(s, { type: 'play', player: 'runner', handIndex: 0, server: 'hq' } as Action).events).toEqual([
      { type: 'action_rejected', reason: 'no_credits' },
    ]);
  });

  it('runner with 0 own credits and 2 bad publicity breaks Wall of Static with Corroder (pump + break) only from run credits', () => {
    // Corroder strength 2, Wall of Static strength 3: 1 to pump, 1 to break.
    let s = act(withBp({ rig: ['r04'], servers: { remote1: { ice: ['+c04'] } }, runnerCredits: 0 }, 2), runOn('remote1')).state;
    expect(s.run!.step).toBe('encounter');
    expect(s.run!.tempCredits).toBe(2);
    const legal = legalActions(s, 'runner');
    expect(legal).toContainEqual({ type: 'use_ability', player: 'runner', uid: 'i1', ability: 1 });
    s = act(s, { type: 'use_ability', player: 'runner', uid: 'i1', ability: 1 }).state;
    const r = act(s, { type: 'use_ability', player: 'runner', uid: 'i1', ability: 0, sub: 0 });
    expect(r.state.players.runner.credits).toBe(0);
    expect(r.state.players.runner.credits).toBeGreaterThanOrEqual(0);
    if (r.state.run) expect(r.state.run.tempCredits).toBe(0);
  });

  it('left-over run credits never reach the Runner\'s own credits (jack out after one ICE)', () => {
    const s0 = withBp({ servers: { remote1: { ice: ['c05'] } }, runnerCredits: 3, corpCredits: 0 }, 3);
    let r = act(s0, runOn('remote1'));
    // Face-down ICE the Corp cannot rez is passed; Runner may continue or jack out.
    const all = [...r.events];
    r = act(r.state, { type: 'jack_out', player: 'runner' });
    all.push(...r.events);
    expect(r.state.run).toBeNull();
    expect(r.state.players.runner.credits).toBe(3);
    expect(all).toContainEqual({ type: 'temp_credits_lost', amount: 3 });
  });
});

describe('QA S-04-4 AC4: stealing via The Maker\'s Eye (R&D) gives the Corp nothing', () => {
  it('Hostile Takeover on top of R&D stolen with The Maker\'s Eye', () => {
    const s = board({ runnerHand: ['r07', 'r01'], corpDeck: ['c08', 'c10', 'c01'], corpCredits: 2, servers: { hq: { ice: ['c04'] } } });
    let r = act(s, { type: 'play', player: 'runner', handIndex: 0 });
    r = run(r.state, [{ type: 'steal', player: 'runner', card: 0 }]);
    // Second card: Priority Requisition, also stolen; with face-down ICE on HQ no choice may open.
    r = run(r.state, [{ type: 'steal', player: 'runner', card: 0 }]);
    expect(r.state.players.runner.scoreArea).toEqual(['c08', 'c10']);
    expect(r.state.players.corp.credits).toBe(2);
    expect(r.state.badPublicity).toBe(0);
    expect(r.state.choice).toBeNull();
    expect(r.state.phase).not.toBe('choice');
  });
});

describe('QA S-04-4 AC1/AC3: scoring in a real Corp turn', () => {
  it('Hostile Takeover scored with 0 credits: +7 credits, bad publicity 1, then the turn goes on with its clicks', () => {
    const s = corpBoard(['c08'], { ready: ['i1'], credits: 0, clicks: 2 });
    const r = act(s, score('i1'));
    expect(r.state.players.corp.credits).toBe(7);
    expect(r.state.badPublicity).toBe(1);
    expect(r.state.players.corp.clicks).toBe(2);
    expect(legalActions(r.state, 'corp')).toContainEqual({ type: 'gain_credit', player: 'corp' });
  });

  it('Priority Requisition: both players\' views agree on the waiting side; Runner sees no ICE names', () => {
    const s = corpBoard(['c06', 'c10'], { ready: ['i2'], credits: 0 });
    const r = act(s, score('i2'));
    expect(r.state.phase).toBe('choice');
    const rv = viewFor('runner', r.state);
    expect(rv.choice).toMatchObject({ kind: 'free_rez', waitingOn: 'corp' });
    expect(JSON.stringify(rv)).not.toContain('c06');
    expect(legalActions(r.state, 'runner')).toEqual([]);
    const done = act(r.state, { type: 'rez', player: 'corp', uid: 'i1' });
    expect(done.state.players.corp.credits).toBe(0);
    expect(viewFor('runner', done.state).choice).toBeNull();
    // The rezzed Enigma is now public.
    expect(JSON.stringify(viewFor('runner', done.state))).toContain('c06');
  });
});
