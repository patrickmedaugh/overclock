// Sprint 10 E2/E3: properties over 300 random full core-deck games. Advance cap: no installed agenda ever
// holds more counters than its requirement, an agenda at its limit is never offered Advance and refuses it,
// Ice Wall still advances past any number. Replay holds.
import { getCard } from '@overclock/cards';
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewFor, waitingOn, type Action, type GameState } from '../src/index';
import { replay as engineReplay } from '../src/index';
import { coreGame, liveness, rejection } from './helpers';
import { expectRunnerEventsClean } from './hidden';

function prng(seed: number): (n: number) => number {
  let x = (seed * 2246822519 + 3266489917) >>> 0 || 5;
  return (n) => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x % n;
  };
}

/** Favour advancing (to reach the cap often) and runs on remotes. */
function weight(s: GameState, a: Action): number {
  switch (a.type) {
    case 'advance':
      return 30;
    case 'install':
      return 10;
    case 'run':
      return 12;
    case 'score':
      return 2; // leave agendas sitting at their limit for a while
    case 'steal':
      return 20;
    case 'activate':
      return 10;
    case 'rez':
      return 8;
    case 'pass':
      return s.run?.step === 'encounter' ? 8 : 4;
    case 'end_turn':
      return 1;
    default:
      return 3;
  }
}

interface Stats {
  atLimit: number;
  refusedAtLimit: number;
  iceWallPastTwo: number;
}

/** Every installed agenda: counters ≤ requirement; at the limit Advance is neither listed nor accepted. */
function checkAgendas(s: GameState, where: string, stats: Stats): void {
  for (const sv of s.servers) {
    for (const c of sv.content) {
      const card = getCard(c.cardId);
      if (card?.type !== 'agenda') continue;
      const need = card.advancementRequirement ?? 0;
      expect(c.advancements, `${where}: ${c.uid} counters ≤ requirement`).toBeLessThanOrEqual(need);
      if (c.advancements < need) continue;
      stats.atLimit++;
      const adv: Action = { type: 'advance', player: 'corp', uid: c.uid };
      expect(legalActions(s, 'corp'), where).not.toContainEqual(adv);
      expect((viewFor('corp', s).installedOptions[c.uid] ?? []).map((o) => o.action.type), where).not.toContain('advance');
      if (s.phase === 'action' && s.activePlayer === 'corp' && s.players.corp.clicks > 0) {
        expect(rejection(apply(s, adv).events), where).toBe('condition_not_met');
        stats.refusedAtLimit++;
      }
    }
    for (const c of sv.ice) if (c.advancements > 2) stats.iceWallPastTwo++;
  }
}

function play(seed: number, stats: Stats, options: { rezWindow?: 'always' } = {}): { actions: Action[]; final: GameState } {
  const pick = prng(seed);
  let s = coreGame(seed, options);
  const actions: Action[] = [];
  for (let step = 0; step < 1000 && s.phase !== 'over'; step++) {
    const where = `seed ${seed} step ${step}`;
    expect(liveness(s), where).toBe(waitingOn(s));
    checkAgendas(s, where, stats);
    const me = waitingOn(s)!;
    const legal = legalActions(s, me);
    const w = legal.map((a) => weight(s, a));
    let r = pick(w.reduce((x, y) => x + y, 0));
    let i = 0;
    while (r >= w[i]!) r -= w[i++]!;
    const action = legal[i]!;
    const res = apply(s, action);
    expect(res.events.some((e) => e.type === 'action_rejected'), `${where}: legal ${JSON.stringify(action)} accepted`).toBe(false);
    expectRunnerEventsClean(res.events, where, res.state);
    actions.push(action);
    s = res.state;
  }
  checkAgendas(s, `seed ${seed} end`, stats);
  return { actions, final: s };
}

describe('Sprint 10 properties over random core-deck games', () => {
  it('300 games: an agenda never goes past its requirement; at the limit Advance is never offered and is refused; replay', () => {
    const stats: Stats = { atLimit: 0, refusedAtLimit: 0, iceWallPastTwo: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const { actions, final } = play(seed, stats);
      if (seed % 10 === 0) expect(engineReplay(seed, actions).state, `seed ${seed} replay`).toEqual(final);
    }
    if (process.env.S10_STATS) console.log(JSON.stringify(stats));
    expect(stats.atLimit).toBeGreaterThan(100);
    expect(stats.refusedAtLimit).toBeGreaterThan(50);
    expect(stats.iceWallPastTwo).toBeGreaterThan(0);
  }, 600_000);
});
