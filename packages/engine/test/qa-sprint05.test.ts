// QA Sprint 5 (written by QA, not the developers): independent probes of S-05-1 and S-05-2.
// Cross-checks the engine's own record against the event stream it emits, over random games.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, viewFor, waitingOn, type Action, type GameState } from '../src/index';
import { act, board } from './helpers';

function prng(seed: number): (n: number) => number {
  let x = (seed * 40503 + 99991) >>> 0 || 3;
  return (n) => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x % n;
  };
}

function weight(a: Action): number {
  if (a.type === 'run') return 10;
  if (a.type === 'rez') return 5;
  if (a.type === 'end_turn') return 1;
  return 3;
}

describe('QA S-05-1 Last run, from the events', () => {
  it('between runs the Runner sees exactly the cards accessed since the last run_started (none -> null); cleared by the Runner\'s turn_ended; the Corp never sees it', () => {
    let shown = 0;
    let cleared = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const pick = prng(seed);
      let s: GameState = newGame(seed);
      // Built only from events: the accesses of the most recent run, or null once the Runner's turn ended.
      let expected: { server: string; cards: { cardId: string; from: string }[] } | null = null;
      for (let step = 0; step < 500 && s.phase !== 'over'; step++) {
        const where = `seed ${seed} step ${step}`;
        const rv = viewFor('runner', s);
        expect(viewFor('corp', s).lastRun, `${where}: Corp`).toBeNull();
        expect(JSON.stringify(viewFor('corp', s)), `${where}: no lastRun key content for the Corp`).not.toMatch(/"lastRun":\{/);
        if (s.run) expect(rv.lastRun, `${where}: hidden during a run`).toBeNull();
        else {
          const want = expected && expected.cards.length > 0 ? expected : null;
          expect(rv.lastRun, where).toEqual(want);
          if (want) shown++;
        }
        const me = waitingOn(s)!;
        const legal = legalActions(s, me);
        const w = legal.map(weight);
        let r = pick(w.reduce((x, y) => x + y, 0));
        let i = 0;
        while (r >= w[i]!) r -= w[i++]!;
        const res = apply(s, legal[i]!);
        for (const e of res.events) {
          if (e.type === 'run_started') expected = { server: e.server, cards: [] };
          else if (e.type === 'card_accessed') expected!.cards.push({ cardId: e.cardId!, from: e.from });
          else if (e.type === 'turn_ended' && e.player === 'runner') {
            if (expected) cleared++;
            expected = null;
          }
        }
        s = res.state;
      }
    }
    expect(shown).toBeGreaterThan(200);
    expect(cleared).toBeGreaterThan(50);
  }, 60_000);
});

describe('QA S-05-2 the preview and the report agree', () => {
  it('Wall of Static: preview says the run ends, pass emits subroutine_resolved then run_ended(ended_by_ice); the Corp gets no preview', () => {
    const s = act(board({ servers: { hq: { ice: ['+c04'] } } }), { type: 'run', player: 'runner', server: 'hq' }).state;
    expect(s.run?.step).toBe('encounter');
    const lf = viewFor('runner', s).run!.letFire!;
    expect(lf).toEqual({ iceCardId: 'c04', outcomes: [{ sub: 0, op: 'end_run', amount: 0 }], ends: 'run' });
    expect(viewFor('corp', s).run?.letFire ?? null).toBeNull();
    const { events } = apply(s, { type: 'pass', player: 'runner' });
    const types = events.map((e) => e.type);
    expect(types.indexOf('subroutine_resolved')).toBeGreaterThanOrEqual(0);
    expect(types.indexOf('subroutine_resolved')).toBeLessThan(types.indexOf('run_ended'));
    expect(events.find((e) => e.type === 'run_ended')).toMatchObject({ outcome: 'ended_by_ice' });
  });
});
