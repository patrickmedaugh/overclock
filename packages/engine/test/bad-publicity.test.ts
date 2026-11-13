// Sprint 4 E4: bad publicity gives the Runner run-only credits (S-04-4 AC2; RULES_SPEC "Bad publicity").
import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, viewEvents, viewFor, waitingOn, type Action, type GameEvent, type GameState } from '../src/index';
import { act, board, run, type BoardSpec } from './helpers';

const runOn = (server: string): Action => ({ type: 'run', player: 'runner', server }) as Action;
const pass: Action = { type: 'pass', player: 'runner' };
const jackOut: Action = { type: 'jack_out', player: 'runner' };
const steal = (card: number): Action => ({ type: 'steal', player: 'runner', card });
const trash = (card: number): Action => ({ type: 'trash', player: 'runner', card });
const ability = (uid: string, n: number, sub?: number): Action =>
  sub === undefined ? { type: 'use_ability', player: 'runner', uid, ability: n } : { type: 'use_ability', player: 'runner', uid, ability: n, sub };

/** A Runner turn on a hand-built board with the Corp at `bp` bad publicity. */
const withBp = (spec: BoardSpec, bp: number): GameState => ({ ...board(spec), badPublicity: bp });

const types = (events: readonly GameEvent[]) => events.map((e) => e.type);

describe('S-04-4 AC2: run-only credits at run start', () => {
  it('1 per bad publicity: temp_credits_gained right after run_started; own credits unchanged; both views show it', () => {
    const s = withBp({ corpHand: ['c01'], runnerCredits: 5 }, 2);
    const r = act(s, runOn('hq'));
    expect(r.events.slice(0, 2)).toEqual([
      { type: 'run_started', server: 'hq' },
      { type: 'temp_credits_gained', amount: 2 },
    ]);
    expect(r.state.run!.tempCredits).toBe(2);
    expect(r.state.players.runner.credits).toBe(5);
    expect(viewFor('runner', r.state).run!.tempCredits).toBe(2);
    expect(viewFor('corp', r.state).run!.tempCredits).toBe(2);
    expect(viewEvents('corp', r.events)).toContainEqual({ type: 'temp_credits_gained', amount: 2 });
  });

  it('a run event (The Maker\'s Eye) gets them too', () => {
    const s = withBp({ runnerHand: ['r07'], corpDeck: ['c01', 'c02', 'c03'] }, 1);
    const r = act(s, { type: 'play', player: 'runner', handIndex: 0 });
    expect(types(r.events).slice(0, 4)).toEqual(['credits_spent', 'card_played', 'run_started', 'temp_credits_gained']);
  });

  it('no bad publicity: no event, tempCredits 0', () => {
    const r = act(withBp({ corpHand: ['c01'] }, 0), runOn('hq'));
    expect(types(r.events)).not.toContain('temp_credits_gained');
    expect(r.state.run!.tempCredits).toBe(0);
    expect(viewFor('runner', r.state).run!.tempCredits).toBe(0);
  });
});

describe('S-04-4 AC2: paying during the run — run-only credits first, affordability counts both', () => {
  it('trash PAD Campaign (4) with 3 credits + 1 run-only: offered, paid 1 run-only + 3 own', () => {
    const s = act(withBp({ servers: { remote1: { content: ['c03'] } }, runnerCredits: 3 }, 1), runOn('remote1')).state;
    expect(viewFor('runner', s).run!.options).toContainEqual({ action: trash(0), cost: 4, reject: null });
    expect(legalActions(s, 'runner')).toContainEqual(trash(0));
    const r = act(s, trash(0));
    expect(r.events[0]).toEqual({ type: 'credits_spent', player: 'runner', amount: 4, temp: 1 });
    expect(r.state.players.runner.credits).toBe(0);
    // Nothing left over: no temp_credits_lost.
    expect(types(r.events)).not.toContain('temp_credits_lost');
    expect(r.state.phase).toBe('action');
  });

  it('the same trash without bad publicity, or with too little in total: no_credits (option and apply agree)', () => {
    for (const [bp, credits] of [
      [0, 3],
      [1, 2],
    ] as const) {
      const s = act(withBp({ servers: { remote1: { content: ['c03'] } }, runnerCredits: credits }, bp), runOn('remote1')).state;
      expect(viewFor('runner', s).run!.options).toContainEqual({ action: trash(0), cost: 4, reject: 'no_credits' });
      expect(apply(s, trash(0)).events).toEqual([{ type: 'action_rejected', reason: 'no_credits' }]);
    }
  });

  it('pump and break: the first credit comes from run-only credits, the next from own credits', () => {
    // i1 Corroder (strength 2) vs i2 rezzed Wall of Static (strength 3).
    let s = act(withBp({ rig: ['r04'], servers: { remote1: { ice: ['+c04'] } }, runnerCredits: 5 }, 1), runOn('remote1')).state;
    expect(s.run!.step).toBe('encounter');
    let r = act(s, ability('i1', 1));
    expect(r.events[0]).toEqual({ type: 'credits_spent', player: 'runner', amount: 1, temp: 1 });
    expect(r.state.players.runner.credits).toBe(5);
    expect(r.state.run!.tempCredits).toBe(0);
    s = r.state;
    r = act(s, ability('i1', 0, 0));
    expect(r.events[0]).toEqual({ type: 'credits_spent', player: 'runner', amount: 1 });
    expect(r.state.players.runner.credits).toBe(4);
  });

  it('with only run-only credits (0 own), a break is affordable', () => {
    const s = act(withBp({ rig: ['r04'], servers: { remote1: { ice: ['+c05'] } }, runnerCredits: 0 }, 1), runOn('remote1')).state;
    expect(viewFor('runner', s).run!.options).toContainEqual({ action: ability('i1', 0, 0), cost: 1, reject: null });
    const r = act(s, ability('i1', 0, 0));
    expect(r.events[0]).toEqual({ type: 'credits_spent', player: 'runner', amount: 1, temp: 1 });
    expect(r.state.players.runner.credits).toBe(0);
  });
});

describe('S-04-4 AC2: left-over run-only credits vanish at every run end', () => {
  const lostThenEnded = (events: readonly GameEvent[], amount: number, outcome: string) => {
    const i = events.findIndex((e) => e.type === 'run_ended');
    expect(i).toBeGreaterThan(0);
    expect(events[i - 1]).toEqual({ type: 'temp_credits_lost', amount });
    expect(events[i]).toMatchObject({ type: 'run_ended', outcome });
  };

  it('accessed (Done on an HQ card)', () => {
    const r = run(withBp({ corpHand: ['c01'], runnerCredits: 5 }, 1), [runOn('hq'), pass]);
    lostThenEnded(r.events, 1, 'accessed');
    expect(r.state.players.runner.credits).toBe(5);
    expect(r.state.run).toBeNull();
    expect(viewFor('runner', r.state).run).toBeNull();
  });

  it('accessed with nothing to access (empty remote: the run ends at once)', () => {
    const r = run(withBp({ servers: { remote1: {} } }, 1), [runOn('remote1')]);
    expect(types(r.events)).toEqual(['run_started', 'temp_credits_gained', 'run_successful', 'temp_credits_lost', 'run_ended']);
  });

  it('jacked out, after spending part of them', () => {
    const s = withBp({ rig: ['r04'], servers: { remote1: { ice: ['+c05'] } }, runnerCredits: 5 }, 3);
    const r = run(s, [runOn('remote1'), ability('i1', 0, 0), jackOut]);
    lostThenEnded(r.events, 2, 'jacked_out');
    expect(r.state.players.runner.credits).toBe(5);
  });

  it('ended by ICE (Wall of Static let through)', () => {
    const r = run(withBp({ servers: { remote1: { ice: ['+c04'] } } }, 1), [runOn('remote1'), pass]);
    lostThenEnded(r.events, 1, 'ended_by_ice');
  });

  it('flatline (Neural Katana, 3 net damage, 2 cards in the Grip): lost before run_ended, then game over', () => {
    const r = run(withBp({ servers: { remote1: { ice: ['+c07'] } }, runnerHand: ['r01', 'r03'] }, 1), [runOn('remote1'), pass]);
    lostThenEnded(r.events, 1, 'flatline');
    expect(r.events.at(-1)).toEqual({ type: 'game_over', winner: 'corp', reason: 'flatline' });
  });

  it('a steal that wins the game', () => {
    const s = board({ servers: { remote1: { content: ['c08'] } } });
    const six: GameState = { ...s, badPublicity: 1, players: { ...s.players, runner: { ...s.players.runner, scoreArea: ['c10', 'c09', 'c08'] } } };
    const r = run(six, [runOn('remote1'), steal(0)]);
    lostThenEnded(r.events, 1, 'accessed');
    expect(r.events.at(-1)).toEqual({ type: 'game_over', winner: 'runner', reason: 'agenda_points' });
  });

  it('the next run gets a fresh amount (left-overs do not carry over)', () => {
    let s = withBp({ corpHand: ['c01'] }, 2);
    s = run(s, [runOn('hq'), pass]).state;
    const r = act(s, runOn('hq'));
    expect(r.events[1]).toEqual({ type: 'temp_credits_gained', amount: 2 });
  });
});

describe('E4 property: run-only credits only exist in runs; credits never go negative', () => {
  function prng(seed: number): (n: number) => number {
    let x = (seed * 2654435761) >>> 0 || 1;
    return (n) => {
      x ^= x << 13;
      x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      return x % n;
    };
  }
  const weight = (a: Action) => (a.type === 'run' ? 6 : a.type === 'use_ability' || a.type === 'trash' ? 5 : a.type === 'score' || a.type === 'steal' ? 10 : a.type === 'advance' ? 3 : 1);

  it('random games with the Corp at 1-3 bad publicity (80 games)', () => {
    let spentTemp = 0;
    let lost = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const pick = prng(seed);
      let s: GameState = { ...newGame(seed), badPublicity: 1 + (seed % 3) };
      let runTemp = 0;
      for (let step = 0; step < 800 && s.phase !== 'over'; step++) {
        const where = `seed ${seed} step ${step}`;
        const me = waitingOn(s)!;
        const legal = legalActions(s, me);
        expect(legal.length, where).toBeGreaterThan(0);
        const w = legal.map(weight);
        let r = pick(w.reduce((x, y) => x + y, 0));
        let i = 0;
        while (r >= w[i]!) r -= w[i++]!;
        const res = apply(s, legal[i]!);
        expect(types(res.events), where).not.toContain('action_rejected');
        for (const e of res.events) {
          if (e.type === 'temp_credits_gained') runTemp = e.amount;
          if (e.type === 'credits_spent' && e.temp !== undefined) {
            expect(e.player).toBe('runner');
            expect(e.temp, where).toBeGreaterThan(0);
            expect(e.temp, where).toBeLessThanOrEqual(e.amount);
            runTemp -= e.temp;
            spentTemp += e.temp;
          }
          if (e.type === 'temp_credits_lost') {
            expect(e.amount, where).toBe(runTemp);
            lost++;
          }
          if (e.type === 'run_ended') runTemp = 0;
        }
        s = res.state;
        expect(s.players.runner.credits, where).toBeGreaterThanOrEqual(0);
        expect(s.players.corp.credits, where).toBeGreaterThanOrEqual(0);
        if (s.phase === 'run') {
          expect(s.run!.tempCredits, where).toBe(runTemp);
          expect(s.run!.tempCredits, where).toBeGreaterThanOrEqual(0);
          expect(s.run!.tempCredits, where).toBeLessThanOrEqual(s.badPublicity);
        } else {
          expect(s.run, where).toBeNull();
          expect(viewFor('runner', s).run, where).toBeNull();
          expect(runTemp, where).toBe(0);
        }
      }
    }
    // The property was really exercised.
    expect(spentTemp).toBeGreaterThan(20);
    expect(lost).toBeGreaterThan(100);
  }, 60_000);
});
