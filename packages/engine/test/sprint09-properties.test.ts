// Sprint 9 E7: properties over 300 random full core-deck games with the Sprint 9 cards (Hunter, Ichi 1.0,
// SEA Source, Access to Globalsec, Private Security Force): bids stay within the limits, a bid window
// opens only when the bid can matter (no empty windows), a skipped side bids 0, ties go to the Runner,
// tags never go below 0 and change only through `tags_changed`, hidden information, liveness, replay.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, runnerLink, viewFor, waitingOn, type Action, type GameEvent, type GameState } from '../src/index';
import { replay as engineReplay } from '../src/index';
import { coreGame, liveness } from './helpers';
import { expectRunnerEventsClean, expectRunnerViewClean } from './hidden';

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

/** Favour what reaches the Sprint 9 rules: runs into rezzed ICE, letting it fire, tags, PSF, SEA Source. */
function weight(s: GameState, a: Action): number {
  switch (a.type) {
    case 'run':
      return 14;
    case 'rez':
      return 14;
    case 'pass':
      return s.run?.step === 'encounter' ? 12 : 4;
    case 'install':
      return 10;
    case 'play':
      return 8;
    case 'advance':
      return 8;
    case 'score':
    case 'steal':
      return 20;
    case 'activate':
    case 'trash_resource':
      return 25;
    case 'remove_tag':
      return 4;
    case 'trace_bid':
    case 'choose':
      return 5;
    case 'end_turn':
      return 1;
    default:
      return 3;
  }
}

type Stats = Record<'traces' | 'corpWindows' | 'runnerWindows' | 'autoBids' | 'ties' | 'tagged' | 'removed' | 'trashedTagged' | 'meat' | 'sea' | 'ichiTrace' | 'link2', number>;
const newStats = (): Stats => ({ traces: 0, corpWindows: 0, runnerWindows: 0, autoBids: 0, ties: 0, tagged: 0, removed: 0, trashedTagged: 0, meat: 0, sea: 0, ichiTrace: 0, link2: 0 });

/** An open trace window is a real decision: its bid can change the result; its options are every amount 0..max. */
function checkTraceWindow(s: GameState, where: string, stats: Stats): void {
  const c = s.choice;
  if (s.phase !== 'choice' || !c) return;
  const isTrace = c.kind === 'trace_corp' || c.kind === 'trace_runner';
  expect(c.trace !== undefined, `${where}: trace state iff trace choice`).toBe(isTrace);
  if (!isTrace) return;
  const t = c.trace!;
  const link = runnerLink(s);
  const runnerMax = s.players.runner.credits + (s.run?.tempCredits ?? 0);
  if (c.kind === 'trace_corp') {
    expect(t.strength, where).toBeNull();
    expect(s.players.corp.credits, `${where}: Corp window with credits`).toBeGreaterThan(0);
    expect(t.base + s.players.corp.credits, `${where}: Corp window only when it can beat the link`).toBeGreaterThan(link);
  } else {
    const needed = (t.strength as number) - link;
    expect(needed, `${where}: Runner window only when the trace would succeed`).toBeGreaterThan(0);
    expect(needed, `${where}: Runner window only when he can reach it`).toBeLessThanOrEqual(runnerMax);
  }
  const v = viewFor(c.player, s);
  const max = c.player === 'corp' ? s.players.corp.credits : runnerMax;
  expect(v.choice!.options.map((o) => o.action), where).toEqual(Array.from({ length: max + 1 }, (_, credits) => ({ type: 'trace_bid', player: c.player, credits })));
  expect(v.choice!.trace).toMatchObject({ link, runnerMaxBid: runnerMax, corpMaxBid: s.players.corp.credits });
  for (const o of v.choice!.options) expect(apply(s, o.action).events.some((e) => e.type === 'action_rejected'), where).toBe(false);
  expect(viewFor(c.player === 'corp' ? 'runner' : 'corp', s).choice!.options, where).toEqual([]);
  if (c.kind === 'trace_corp') stats.corpWindows++;
  else stats.runnerWindows++;
}

/** The events of one action: bids within limits, auto bids only where the bid cannot matter, the resolution rule, tags. */
function checkEvents(before: GameState, after: GameState, events: readonly GameEvent[], where: string, stats: Stats): void {
  let corpSpent = 0;
  let trace: { base: number; link: number; strength?: number; runnerBid?: number } | null = null;
  let tags = before.players.runner.tags;
  const runnerMax = before.players.runner.credits + (before.run?.tempCredits ?? 0);
  // A trace continued from an earlier action (a bid answering an open window).
  if (before.choice?.trace) trace = { base: before.choice.trace.base, link: runnerLink(before), ...(before.choice.trace.strength !== null ? { strength: before.choice.trace.strength } : {}) };
  for (const e of events) {
    if (e.type === 'credits_spent' && e.player === 'corp') corpSpent += e.amount;
    if (e.type === 'trace_started') {
      trace = { base: e.base, link: e.link };
      expect(e.link, where).toBe(runnerLink(before));
      stats.traces++;
      if (e.link >= 2) stats.link2++;
    }
    if (e.type === 'trace_bid') {
      expect(trace, `${where}: bid inside a trace`).not.toBeNull();
      expect(e.credits, where).toBeGreaterThanOrEqual(0);
      if (e.player === 'corp') {
        const credits = before.players.corp.credits - (corpSpent - e.credits);
        expect(e.credits, `${where}: Corp bid within its credits`).toBeLessThanOrEqual(credits);
        expect(e.total, where).toBe(trace!.base + e.credits);
        trace!.strength = e.total;
        if (e.auto) {
          expect(e.credits, where).toBe(0);
          expect(credits === 0 || trace!.base + credits <= trace!.link, `${where}: Corp auto bid only when it cannot matter`).toBe(true);
          stats.autoBids++;
        }
      } else {
        expect(e.credits, `${where}: Runner bid within his credits`).toBeLessThanOrEqual(runnerMax);
        expect(e.total, where).toBe(trace!.link + e.credits);
        trace!.runnerBid = e.credits;
        if (e.auto) {
          const needed = (trace!.strength as number) - trace!.link;
          expect(e.credits, where).toBe(0);
          expect(needed <= 0 || needed > runnerMax, `${where}: Runner auto bid only when it cannot matter`).toBe(true);
          stats.autoBids++;
        }
      }
    }
    if (e.type === 'trace_resolved') {
      expect(e.strength, where).toBe(trace!.strength);
      expect(e.total, where).toBe(trace!.link + (trace!.runnerBid as number));
      expect(e.success, `${where}: success iff strength > link + bid`).toBe(e.strength > e.total);
      if (e.strength === e.total) stats.ties++;
      if (e.cardId === 'c21') stats.ichiTrace++;
      if (e.cardId === 'c22') stats.sea++;
      trace = null;
    }
    if (e.type === 'tags_changed') {
      tags += e.amount;
      expect(e.tags, where).toBe(tags);
      expect(e.tags, where).toBeGreaterThanOrEqual(0);
      if (e.amount > 0) stats.tagged++;
      else stats.removed++;
    }
    if (e.type === 'rig_card_trashed' && e.cause === 'tagged') stats.trashedTagged++;
    if (e.type === 'meat_damage') stats.meat++;
  }
  expect(after.players.runner.tags, `${where}: tags change only through tags_changed`).toBe(tags);
  expect(after.players.corp.tags, where).toBe(0);
}

function play(seed: number, stats: Stats, options: { rezWindow?: 'always' } = {}): { actions: Action[]; final: GameState } {
  const pick = prng(seed);
  let s = coreGame(seed, options);
  const actions: Action[] = [];
  for (let step = 0; step < 1200 && s.phase !== 'over'; step++) {
    const where = `seed ${seed} step ${step}`;
    expect(liveness(s), where).toBe(waitingOn(s));
    checkTraceWindow(s, where, stats);
    if (s.phase === 'choice' || step % 25 === 0) expectRunnerViewClean(s, where);
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
    checkEvents(s, res.state, res.events, where, stats);
    for (const side of ['corp', 'runner'] as const) expect(res.state.players[side].credits, where).toBeGreaterThanOrEqual(0);
    actions.push(action);
    s = res.state;
  }
  return { actions, final: s };
}

describe('Sprint 9 properties over random core-deck games', () => {
  it('300 games (pass-the-phone): bids within limits, no empty bid windows, ties to the Runner, tags ≥ 0, hidden info, replay', () => {
    const stats = newStats();
    for (let seed = 1; seed <= 300; seed++) {
      const { actions, final } = play(seed, stats);
      if (seed % 10 === 0) expect(engineReplay(seed, actions, { deckSet: 'core' }).state, `seed ${seed} replay`).toEqual(final);
    }
    // The new rules really happened.
    if (process.env.S9_STATS) console.log(JSON.stringify(stats));
    expect(stats.traces).toBeGreaterThan(50);
    expect(stats.corpWindows).toBeGreaterThan(10);
    expect(stats.runnerWindows).toBeGreaterThan(10);
    expect(stats.autoBids).toBeGreaterThan(10);
    expect(stats.ties).toBeGreaterThan(0);
    expect(stats.tagged).toBeGreaterThan(10);
    expect(stats.removed).toBeGreaterThan(0);
    expect(stats.trashedTagged).toBeGreaterThan(0);
    expect(stats.meat).toBeGreaterThan(0);
    expect(stats.sea).toBeGreaterThan(0);
    expect(stats.ichiTrace).toBeGreaterThan(0);
    expect(stats.link2).toBeGreaterThan(0);
  }, 600_000);

  it('60 online games (rezWindow always): the same properties', () => {
    const stats = newStats();
    for (let seed = 3001; seed <= 3060; seed++) {
      const { actions, final } = play(seed, stats, { rezWindow: 'always' });
      if (seed % 10 === 0) expect(engineReplay(seed, actions, { rezWindow: 'always', deckSet: 'core' }).state).toEqual(final);
    }
    expect(stats.traces).toBeGreaterThan(0);
  }, 300_000);
});
