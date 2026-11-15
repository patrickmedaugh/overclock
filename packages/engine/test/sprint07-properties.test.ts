// Sprint 7 E7: properties over 300 random full games that use the new cards (rez assets,
// PAD Campaign, Akitaro Watanabe, Armitage Codebusting, Cyberfeeder, Bank Job, Akamatsu Mem
// Chip, Ice Wall advancing, empty remotes): every legalActions entry is accepted (sampled: all
// of them every few steps), options' `reject` equals apply, hidden information, liveness, no
// empty `success` window, no empty remote between runs, hosted credits sane, memory within the
// limit, and determinism (replay).
import { getCard } from '@overclock/cards';
import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, replay, viewFor, waitingOn, type Action, type GameEvent, type GameState } from '../src/index';
import { memoryLimit, memoryUsed } from '../src/rules';
import { liveness } from './helpers';
import { expectRunnerEventsClean, expectRunnerViewClean } from './hidden';

function prng(seed: number): (n: number) => number {
  let x = (seed * 7919 + 104729) >>> 0 || 5;
  return (n) => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x % n;
  };
}

/** Favour the Sprint 7 moves so they happen often. */
function weight(s: GameState, a: Action): number {
  switch (a.type) {
    case 'rez':
      return s.phase === 'action' ? 25 : 6;
    case 'activate':
      return 25;
    case 'advance':
      return 8;
    case 'score':
    case 'steal':
      return 20;
    case 'install':
      return 10;
    case 'run':
      return 6;
    case 'use_ability':
      return 6;
    case 'trash':
      return 5;
    case 'end_turn':
      return 1;
    default:
      return 3;
  }
}

interface Stats {
  cardRezzed: number;
  turnStart: number;
  clickAbility: number;
  successfulRun: number;
  accessReplaced: number;
  successPassed: number;
  serverRemoved: number;
  hostedPaid: number;
  rigTrashed: number;
  iceAdvanced: number;
  memoryFive: number;
}

const isRemote = (id: string) => id.startsWith('remote');

function checkState(s: GameState, where: string, stats: Stats): void {
  expect(liveness(s), where).toBe(waitingOn(s));
  expectRunnerViewClean(s, where);
  // No empty success window: the step exists only on a remote with a usable option.
  if (s.run?.step === 'success') {
    expect(isRemote(s.run.server), `${where}: success only on remotes`).toBe(true);
    const opts = viewFor('runner', s).run!.options;
    expect(opts.some((o) => o.action.type === 'activate' && o.reject === null), `${where}: success offers a usable card`).toBe(true);
    expect(opts.at(-1)).toEqual({ action: { type: 'pass', player: 'runner' }, cost: 0, reject: null });
  }
  // Between runs (and choices) no remote is empty.
  if (!s.run) {
    for (const sv of s.servers) if (isRemote(sv.id)) expect(sv.ice.length + sv.content.length, `${where}: empty ${sv.id}`).toBeGreaterThan(0);
  }
  for (const c of [...s.rig, ...s.servers.flatMap((sv) => [...sv.ice, ...sv.content])]) {
    expect(c.hostedCredits, where).toBeGreaterThanOrEqual(0);
    const def = getCard(c.cardId)!;
    if (def.recurringCredits) expect(c.hostedCredits, where).toBeLessThanOrEqual(def.recurringCredits.amount);
    if (def.trashWhenEmpty) expect(c.hostedCredits, `${where}: ${c.cardId} empty but installed`).toBeGreaterThan(0);
  }
  expect(memoryUsed(s), where).toBeLessThanOrEqual(memoryLimit(s));
  if (memoryLimit(s) === 5) stats.memoryFive++;
  for (const side of ['corp', 'runner'] as const) expect(s.players[side].credits, where).toBeGreaterThanOrEqual(0);
  expect(s.run?.tempCredits ?? 0, where).toBeGreaterThanOrEqual(0);
}

/** Every option's `reject` is what apply answers; every legal action is accepted. */
function checkOptions(s: GameState, where: string): void {
  for (const side of ['corp', 'runner'] as const) {
    const v = viewFor(side, s);
    const options = [...Object.values(v.installedOptions).flat(), ...(v.run?.options ?? [])];
    for (const o of options) {
      const r = apply(s, o.action);
      const reason = r.events.find((e) => e.type === 'action_rejected');
      expect(reason && reason.type === 'action_rejected' ? reason.reason : null, `${where}: ${JSON.stringify(o.action)}`).toBe(o.reject);
    }
    for (const a of legalActions(s, side)) {
      expect(apply(s, a).events.some((e) => e.type === 'action_rejected'), `${where}: legal ${JSON.stringify(a)}`).toBe(false);
    }
  }
}

function count(before: GameState, events: readonly GameEvent[], stats: Stats): void {
  for (const e of events) {
    if (e.type === 'card_rezzed') stats.cardRezzed++;
    if (e.type === 'ability_triggered' && e.trigger === 'turn_start') stats.turnStart++;
    if (e.type === 'ability_triggered' && e.trigger === 'click') stats.clickAbility++;
    if (e.type === 'ability_triggered' && e.trigger === 'successful_run') stats.successfulRun++;
    if (e.type === 'run_ended' && e.outcome === 'access_replaced') stats.accessReplaced++;
    if (e.type === 'server_removed') stats.serverRemoved++;
    if (e.type === 'credits_spent' && (e.hosted ?? 0) > 0) stats.hostedPaid++;
    if (e.type === 'rig_card_trashed') stats.rigTrashed++;
    if (e.type === 'card_advanced' && before.servers.some((sv) => sv.ice.some((c) => c.uid === e.uid))) stats.iceAdvanced++;
  }
  if (before.run?.step === 'success' && events[0]?.type !== 'ability_triggered') stats.successPassed++;
}

function play(seed: number, stats: Stats, options: { rezWindow?: 'always' } = {}): { actions: Action[]; final: GameState } {
  const pick = prng(seed);
  let s = newGame(seed, options);
  const actions: Action[] = [];
  for (let step = 0; step < 1500 && s.phase !== 'over'; step++) {
    const where = `seed ${seed} step ${step}`;
    checkState(s, where, stats);
    if (step % 7 === 0 || s.run?.step === 'success' || s.phase === 'choice') checkOptions(s, where);
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
    count(s, res.events, stats);
    actions.push(action);
    s = res.state;
  }
  checkState(s, `seed ${seed} end`, stats);
  return { actions, final: s };
}

describe('Sprint 7 properties over random games', () => {
  it('300 games (pass-the-phone): legal = accepted, options agree, hidden info, liveness, windows, invariants, replay', () => {
    const stats: Stats = {
      cardRezzed: 0,
      turnStart: 0,
      clickAbility: 0,
      successfulRun: 0,
      accessReplaced: 0,
      successPassed: 0,
      serverRemoved: 0,
      hostedPaid: 0,
      rigTrashed: 0,
      iceAdvanced: 0,
      memoryFive: 0,
    };
    for (let seed = 1; seed <= 300; seed++) {
      const { actions, final } = play(seed, stats);
      if (seed % 10 === 0) {
        expect(replay(seed, actions).state, `seed ${seed} replay`).toEqual(final);
        expect(replay(seed, JSON.parse(JSON.stringify(actions)) as Action[]).state).toEqual(JSON.parse(JSON.stringify(final)));
      }
    }
    // The new rules really happened.
    expect(stats.cardRezzed).toBeGreaterThan(50);
    expect(stats.turnStart).toBeGreaterThan(50);
    expect(stats.clickAbility).toBeGreaterThan(50);
    expect(stats.successfulRun).toBeGreaterThan(5);
    expect(stats.accessReplaced).toBe(stats.successfulRun);
    expect(stats.successPassed).toBeGreaterThan(0);
    expect(stats.serverRemoved).toBeGreaterThan(20);
    expect(stats.hostedPaid).toBeGreaterThan(5);
    expect(stats.rigTrashed).toBeGreaterThan(5);
    expect(stats.iceAdvanced).toBeGreaterThan(10);
    expect(stats.memoryFive).toBeGreaterThan(0);
  }, 300_000);

  it('60 online games (rezWindow always): the same properties', () => {
    const stats = {
      cardRezzed: 0,
      turnStart: 0,
      clickAbility: 0,
      successfulRun: 0,
      accessReplaced: 0,
      successPassed: 0,
      serverRemoved: 0,
      hostedPaid: 0,
      rigTrashed: 0,
      iceAdvanced: 0,
      memoryFive: 0,
    };
    for (let seed = 1001; seed <= 1060; seed++) {
      const { actions, final } = play(seed, stats, { rezWindow: 'always' });
      if (seed % 10 === 0) expect(replay(seed, actions, { rezWindow: 'always' }).state).toEqual(final);
    }
    expect(stats.cardRezzed).toBeGreaterThan(0);
    expect(stats.successfulRun).toBeGreaterThan(0);
  }, 300_000);
});
