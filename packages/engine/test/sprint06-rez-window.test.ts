// Sprint 6 E2: GameOptions.rezWindow. 'always' (online) makes every approach of a face-down
// ICE wait on the Corp, so the Runner can't tell an unaffordable ICE from a cheap one
// (S-06-2 AC5). 'affordable' (default, hot-seat) is unchanged.
import { getCard } from '@overclock/cards';
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
  type GameOptions,
  type GameState,
  type PlayerView,
} from '../src/index';
import { act, board, liveness, rejection } from './helpers';

const always: GameOptions = { rezWindow: 'always' };
const runHq: Action = { type: 'run', player: 'runner', server: 'hq' };
const corpPass: Action = { type: 'pass', player: 'corp' };
const runnerPass: Action = { type: 'pass', player: 'runner' };

/** Runner's turn; HQ guarded by one face-down `ice` (uid i1); the Corp has `credits`. */
function guarded(ice: string, credits: number, options?: GameOptions): GameState {
  const s = board({ servers: { hq: { ice: [ice] } }, corpCredits: credits });
  return options ? { ...s, options } : s;
}

describe("Sprint 6: rezWindow 'always'", () => {
  it('newGame/replay store the options; default is affordable', () => {
    expect(newGame(3).options).toEqual({ rezWindow: 'affordable' });
    expect(newGame(3, always).options).toEqual(always);
    expect(newGame(3, {}).options).toEqual({ rezWindow: 'affordable' });
    expect(replay(3, [], always).state.options).toEqual(always);
    // Options never change the deal.
    const { options: _a, ...a } = newGame(3);
    const { options: _b, ...b } = newGame(3, always);
    expect(a).toEqual(b);
  });

  it('unaffordable face-down ICE: the approach waits on the Corp; rez shows and is rejected no_credits; only pass is legal', () => {
    const s = act(guarded('c07', 2, always), runHq).state; // Neural Katana costs 4
    expect(s.run?.step).toBe('approach');
    expect(waitingOn(s)).toBe('corp');
    expect(liveness(s)).toBe('corp');
    expect(hasMeaningfulResponse(s, 'corp')).toBe(true);
    expect(viewFor('runner', s).run?.waitingOn).toBe('corp');
    expect(viewFor('corp', s).run?.options).toEqual([
      { action: { type: 'rez', player: 'corp', uid: 'i1' }, cost: 4, reject: 'no_credits' },
      { action: corpPass, cost: 0, reject: null },
    ]);
    expect(viewFor('runner', s).run?.options).toEqual([]);
    expect(legalActions(s, 'corp')).toEqual([corpPass]);
    const r = apply(s, { type: 'rez', player: 'corp', uid: 'i1' });
    expect(rejection(r.events)).toBe('no_credits');
    expect(r.state).toBe(s);
    const passed = act(s, corpPass);
    expect(passed.events).toEqual([{ type: 'ice_passed', uid: 'i1' }]);
    expect(passed.state.run?.step).toBe('continue');
  });

  it('affordable face-down ICE: same as today (rez works)', () => {
    const s = act(guarded('c05', 2, always), runHq).state; // Ice Wall costs 1
    expect(s.run?.step).toBe('approach');
    expect(legalActions(s, 'corp')).toEqual([{ type: 'rez', player: 'corp', uid: 'i1' }, corpPass]);
    const r = act(s, { type: 'rez', player: 'corp', uid: 'i1' });
    expect(r.events.map((e) => e.type)).toEqual(['credits_spent', 'ice_rezzed', 'ice_encountered']);
  });

  it('rezzed ICE is still encountered without a Corp decision', () => {
    const s = act(guarded('+c07', 0, always), runHq).state;
    expect(s.run?.step).toBe('encounter');
    expect(waitingOn(s)).toBe('runner');
  });

  it("default ('affordable') is unchanged: unaffordable ICE is passed face down at once", () => {
    const r = act(guarded('c07', 2), runHq);
    expect(r.state.run?.step).toBe('continue');
    expect(r.events.map((e) => e.type)).toEqual(['run_started', 'ice_approached', 'ice_passed']);
  });

  /** Runner's views and projected events through: run on HQ, Corp Don't rez, Continue, access, Done. */
  function runnerSide(ice: string, options?: GameOptions): { views: PlayerView[]; events: GameEvent[][] } {
    let s = guarded(ice, 2, options);
    const views: PlayerView[] = [viewFor('runner', s)];
    const events: GameEvent[][] = [];
    const step = (a: Action) => {
      const r = act(s, a);
      s = r.state;
      views.push(viewFor('runner', s));
      events.push(viewEvents('runner', r.events));
    };
    step(runHq);
    if (s.run?.step === 'approach') step(corpPass);
    while (s.phase === 'run') step(runnerPass);
    return { views, events };
  }

  it('S-06-2 AC5: the Runner sees exactly the same for cheap and unaffordable face-down ICE', () => {
    const cheap = runnerSide('c05', always); // Ice Wall, 1 credit: the Corp could rez
    for (const ice of ['c04', 'c06', 'c07']) {
      // Wall of Static 3, Enigma 3, Neural Katana 4: the Corp (2 credits) can't
      expect(runnerSide(ice, always), ice).toEqual(cheap);
    }
    // Control: today's hot-seat rule does show the difference (the Runner passes at once).
    expect(runnerSide('c07')).not.toEqual(runnerSide('c05'));
  });

  it('replay with the same options rebuilds an always-game; the Corp pass is part of the log', () => {
    const seed = 77;
    let s = newGame(seed, always);
    const log: Action[] = [];
    // Corp: install ICE on HQ, then credits until the turn ends; Runner: run HQ.
    const play = (a: Action) => {
      log.push(a);
      s = act(s, a).state;
    };
    const iceIndex = s.players.corp.hand.findIndex((id) => ['c04', 'c05', 'c06', 'c07'].includes(id));
    expect(iceIndex).toBeGreaterThanOrEqual(0);
    play({ type: 'install', player: 'corp', handIndex: iceIndex, server: 'hq' });
    while (s.players.corp.clicks > 0) play({ type: 'gain_credit', player: 'corp' });
    play({ type: 'end_turn', player: 'corp' });
    if (s.phase === 'discard') play({ type: 'discard', player: 'corp', handIndices: [0] });
    play(runHq);
    expect(s.run?.step).toBe('approach');
    play(corpPass);
    expect(replay(seed, log, always).state).toEqual(s);
  });
});

describe("Sprint 6: random games with rezWindow 'always'", () => {
  function prng(seed: number): (n: number) => number {
    let x = (seed * 2654435761) >>> 0 || 7;
    return (n) => {
      x ^= x << 13;
      x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      return x % n;
    };
  }

  it('liveness holds, every face-down approach waits on the Corp, unaffordable ones offer only pass; replay is exact', () => {
    let unaffordable = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const pick = prng(seed);
      let s = newGame(seed, always);
      const log: Action[] = [];
      for (let i = 0; i < 400 && s.phase !== 'over'; i++) {
        const who = liveness(s) as 'corp' | 'runner';
        const legal = legalActions(s, who);
        // Prefer runs so approaches happen often.
        const runs = legal.filter((a) => a.type === 'run');
        const a = runs.length > 0 && pick(3) === 0 ? runs[pick(runs.length)]! : legal[pick(legal.length)]!;
        const r = apply(s, a);
        expect(rejection(r.events), JSON.stringify(a)).toBeNull();
        r.events.forEach((e, k) => {
          if (e.type !== 'ice_approached') return;
          const before = s.servers.flatMap((sv) => sv.ice).find((c) => c.uid === e.uid);
          // A face-down ICE is never passed in the action that approached it: the Corp decides first.
          if (before && !before.rezzed) expect(r.events.slice(k).some((x) => x.type === 'ice_passed' && x.uid === e.uid)).toBe(false);
        });
        s = r.state;
        log.push(a);
        if (s.run?.step === 'approach') {
          const ice = s.servers.find((sv) => sv.id === s.run!.server)!.ice[s.run.position]!;
          expect(ice.rezzed).toBe(false);
          const cost = getCard(ice.cardId)?.cost ?? Number.NaN;
          if (s.players.corp.credits < cost) {
            unaffordable++;
            expect(legalActions(s, 'corp')).toEqual([corpPass]);
          }
        }
      }
      expect(replay(seed, log, always).state).toEqual(s);
    }
    expect(unaffordable).toBeGreaterThan(5);
  });
});

