// Sprint 3 E6 safety net: random legal games with lots of runs.
// - The Runner's view and events never name a face-down Corp card, except cards
//   in its current access list and in revealing events (accessed, rezzed, ...).
// - The Corp never learns which R&D card was accessed.
// - Liveness: outside 'over', exactly one side has legal actions, the one waitingOn names.
// - Replay determinism: (seed, actions) rebuilds the same game, JSON round trip included.
import { describe, expect, it } from 'vitest';
import {
  apply,
  hasMeaningfulResponse,
  legalActions,
  newGame,
  replay,
  viewEvents,
  viewFor,
  waitingOn,
  type Action,
  type GameEvent,
  type GameState,
} from '../src/index';
import { liveness } from './helpers';
import { expectRunnerEventsClean, expectRunnerViewClean } from './hidden';

function picker(seed: number): (n: number) => number {
  let x = (seed * 2654435761) >>> 0;
  return (n) => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x % n;
  };
}

/** Picks a legal action, strongly preferring runs, rezzes, breaks and run events so runs happen a lot. */
function choose(s: GameState, pick: (n: number) => number): Action {
  const me = waitingOn(s)!;
  const acts = legalActions(s, me);
  const runny = acts.filter(
    (a) =>
      a.type === 'run' ||
      a.type === 'rez' ||
      a.type === 'use_ability' ||
      a.type === 'steal' ||
      a.type === 'trash' ||
      a.type === 'advance' ||
      a.type === 'score' ||
      a.type === 'install' ||
      (a.type === 'play' && s.players[me].hand[a.handIndex] !== undefined),
  );
  let a = (runny.length > 0 && pick(4) > 0 ? runny[pick(runny.length)] : acts[pick(acts.length)])!;
  if (a.type === 'discard') {
    const hand = s.players[me].hand.map((_, k) => k);
    const chosen: number[] = [];
    while (chosen.length < a.handIndices.length) chosen.push(hand.splice(pick(hand.length), 1)[0]!);
    a = { ...a, handIndices: chosen };
  }
  return a;
}

function randomGame(seed: number, steps: number, each?: (s: GameState, a: Action, events: readonly GameEvent[], i: number) => void) {
  const pick = picker(seed);
  let s = newGame(seed);
  const log: Action[] = [];
  for (let i = 0; i < steps && s.phase !== 'over'; i++) {
    const a = choose(s, pick);
    const r = apply(s, a);
    expect(r.events.find((e) => e.type === 'action_rejected'), `seed ${seed} step ${i} ${JSON.stringify(a)}`).toBeUndefined();
    log.push(a);
    s = r.state;
    each?.(s, a, r.events, i);
  }
  return { state: s, log };
}

describe('E6 property tests over random games with runs', () => {
  it('hidden information, R&D privacy and liveness hold at every step (60 games)', () => {
    const seen = { runs: 0, rezzes: 0, accesses: 0, rdAccesses: 0, steals: 0, trashes: 0, breaks: 0, damage: 0, scores: 0, over: 0 };
    for (let seed = 1; seed <= 60; seed++) {
      const { state } = randomGame(seed, 400, (s, _a, events, i) => {
        const where = `seed ${seed} step ${i}`;
        expectRunnerEventsClean(events, where, s);
        expectRunnerViewClean(s, where);
        // The Corp never sees which R&D card was accessed (events or view).
        for (const e of viewEvents('corp', events)) {
          if (e.type === 'card_accessed' && e.from === 'rd') expect(e, where).not.toHaveProperty('cardId');
        }
        for (const c of viewFor('corp', s).run?.access?.cards ?? []) if (c.from === 'rd') expect(c.cardId, where).toBeNull();
        // Liveness: exactly one side can act, and it is the one the game waits on.
        const side = liveness(s);
        expect(side, where).toBe(waitingOn(s));
        if (side) expect(hasMeaningfulResponse(s, side)).toBe(true);
        for (const e of events) {
          if (e.type === 'run_started') seen.runs++;
          if (e.type === 'ice_rezzed') seen.rezzes++;
          if (e.type === 'card_accessed') seen.accesses++;
          if (e.type === 'card_accessed' && e.from === 'rd') seen.rdAccesses++;
          if (e.type === 'agenda_stolen') seen.steals++;
          if (e.type === 'card_trashed') seen.trashes++;
          if (e.type === 'subroutine_broken') seen.breaks++;
          if (e.type === 'net_damage') seen.damage++;
          if (e.type === 'agenda_scored') seen.scores++;
        }
      });
      if (state.phase === 'over') seen.over++;
    }
    // The properties were really exercised.
    expect(seen.runs).toBeGreaterThan(500);
    expect(seen.rezzes).toBeGreaterThan(30);
    expect(seen.accesses).toBeGreaterThan(300);
    expect(seen.rdAccesses).toBeGreaterThan(50);
    expect(seen.steals).toBeGreaterThan(20);
    expect(seen.breaks).toBeGreaterThan(5);
    expect(seen.damage).toBeGreaterThan(0);
    expect(seen.over).toBeGreaterThan(20);
  });

  it('replay(seed, actions) rebuilds games with runs exactly (JSON round trip too)', () => {
    for (const seed of [3, 8, 21]) {
      const { state, log } = randomGame(seed, 300);
      expect(log.some((a) => a.type === 'run')).toBe(true);
      const a = replay(seed, log);
      expect(a.state).toEqual(state);
      expect(replay(seed, JSON.parse(JSON.stringify(log)) as Action[])).toEqual(a);
      expect(JSON.parse(JSON.stringify(a.state))).toEqual(a.state); // state stays plain JSON mid-run too
    }
  });

  it('every legal action in a run is accepted, and handOptions/runOptions/installedOptions/run.options agree with apply', () => {
    for (const seed of [4, 5]) {
      randomGame(seed, 200, (s, _a, _e, i) => {
        if (i % 3 !== 0) return;
        for (const p of ['corp', 'runner'] as const) {
          const v = viewFor(p, s);
          const opts = [...v.handOptions.flat(), ...v.runOptions, ...Object.values(v.installedOptions).flat(), ...(v.run?.options ?? [])];
          for (const o of opts) {
            const r = apply(s, o.action).events.find((e) => e.type === 'action_rejected');
            expect(r && r.type === 'action_rejected' ? r.reason : null, `seed ${seed} step ${i} ${JSON.stringify(o.action)}`).toBe(o.reject);
          }
        }
      });
    }
  });
});
