// Sprint 4 E5: properties over random full games with "when scored" bonuses, the
// free-rez choice and bad publicity: liveness (exactly the side the game waits on
// can act, the choice included), empty windows auto-pass (a choice opens only with
// face-down ICE to offer), hidden information, and determinism (replay).
import { getCard } from '@overclock/cards';
import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, replay, viewFor, waitingOn, type Action, type GameEvent, type GameState } from '../src/index';
import { liveness } from './helpers';
import { expectRunnerEventsClean, expectRunnerViewClean } from './hidden';

function prng(seed: number): (n: number) => number {
  let x = (seed * 40503 + 12345) >>> 0 || 3;
  return (n) => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x % n;
  };
}

/** Corp-favoured play so agendas get scored (and bonuses fire) often. */
function weight(a: Action): number {
  switch (a.type) {
    case 'score':
      return 40;
    case 'advance':
      return 30;
    case 'install':
      return 4;
    case 'run':
      return 2;
    case 'use_ability':
    case 'trash':
      return 4;
    case 'steal':
      return 10;
    case 'end_turn':
      return 1;
    default:
      return 2;
  }
}

const unrezzedIce = (s: GameState) => s.servers.flatMap((sv) => sv.ice.filter((c) => !c.rezzed).map((c) => c.uid));

interface Stats {
  choices: number;
  freeRezzes: number;
  skips: number;
  bpGained: number;
  tempGained: number;
  noWindowPr: number;
}

function playAndCheck(seed: number, stats: Stats): { actions: Action[]; final: GameState } {
  const pick = prng(seed);
  let s = newGame(seed);
  const actions: Action[] = [];
  for (let step = 0; step < 1200 && s.phase !== 'over'; step++) {
    const where = `seed ${seed} step ${step}`;
    // Liveness: exactly the side the game waits on can act.
    expect(liveness(s), where).toBe(waitingOn(s));
    expectRunnerViewClean(s, where);
    if (s.phase === 'choice') {
      // A choice only opens with face-down ICE to offer; options = one free rez each, then Skip.
      const ice = unrezzedIce(s);
      expect(ice.length, `${where}: a choice has something to offer`).toBeGreaterThan(0);
      expect(waitingOn(s)).toBe('corp');
      const v = viewFor('corp', s);
      expect(v.choice!.options.map((o) => o.action)).toEqual([...ice.map((uid) => ({ type: 'rez', player: 'corp', uid })), { type: 'pass', player: 'corp' }]);
      expect(v.choice!.options.every((o) => o.cost === 0 && o.reject === null)).toBe(true);
      expect(v.legalActions).toEqual(v.choice!.options.map((o) => o.action));
      expect(viewFor('runner', s).choice!.options).toEqual([]);
    } else {
      expect(s.choice, where).toBeNull();
    }
    if (s.phase !== 'run') expect(s.run, where).toBeNull();

    const me = waitingOn(s)!;
    const legal = legalActions(s, me);
    const w = legal.map(weight);
    let r = pick(w.reduce((x, y) => x + y, 0));
    let i = 0;
    while (r >= w[i]!) r -= w[i++]!;
    const action = legal[i]!;
    const before = s;
    const res = apply(s, action);
    expect(res.events.some((e) => e.type === 'action_rejected'), `${where}: legal ${action.type} accepted`).toBe(false);
    expectRunnerEventsClean(res.events, where);
    countAndCheck(before, res.state, res.events as GameEvent[], stats, where);
    actions.push(action);
    s = res.state;
  }
  return { actions, final: s };
}

function countAndCheck(before: GameState, after: GameState, events: GameEvent[], stats: Stats, where: string): void {
  for (const e of events) {
    if (e.type === 'choice_opened') stats.choices++;
    if (e.type === 'choice_closed' && e.skipped) stats.skips++;
    if (e.type === 'choice_closed' && !e.skipped) stats.freeRezzes++;
    if (e.type === 'bad_publicity_gained') stats.bpGained++;
    if (e.type === 'temp_credits_gained') stats.tempGained++;
    if (e.type === 'agenda_scored' && getCard(e.cardId)?.onScore?.some((x) => x.op === 'free_rez') && after.phase === 'action') {
      // Priority Requisition scored without a window: there was no face-down ICE.
      expect(unrezzedIce(after), `${where}: PR auto-passed only with no face-down ICE`).toEqual([]);
      stats.noWindowPr++;
    }
  }
  if (before.phase === 'choice' && events.some((e) => e.type === 'ice_rezzed')) {
    // The free rez costs nothing.
    expect(after.players.corp.credits, where).toBe(before.players.corp.credits);
    expect(events.some((e) => e.type === 'credits_spent'), where).toBe(false);
  }
}

describe('Sprint 4 properties over random games', () => {
  it('liveness, choice windows, hidden info and replay hold at every step (300 games)', () => {
    const stats: Stats = { choices: 0, freeRezzes: 0, skips: 0, bpGained: 0, tempGained: 0, noWindowPr: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const { actions, final } = playAndCheck(seed, stats);
      // Determinism: (seed, actions) rebuilds the same game.
      if (seed % 10 === 0) expect(replay(seed, actions).state, `seed ${seed} replay`).toEqual(final);
    }
    // The properties were really exercised.
    expect(stats.choices).toBeGreaterThan(10);
    expect(stats.freeRezzes).toBeGreaterThan(3);
    expect(stats.skips).toBeGreaterThan(0);
    expect(stats.bpGained).toBeGreaterThan(20);
    expect(stats.tempGained).toBeGreaterThan(20);
  }, 60_000);
});
