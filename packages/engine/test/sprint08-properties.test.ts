// Sprint 8 E8: properties over 300 random full games on the core decks (identities, 30 cards,
// Adonis/Melange/Biotic Labor, Viktor/Heimdall brain damage, Rototurret + Sacrificial Construct
// choices inside a run, Battering Ram multi-break): every legal action is accepted (all of them
// every few steps and in every choice), options' `reject` equals apply, hidden information
// (installedThisTurn never in a view), liveness (no empty windows, in-run choices included),
// invariants, and determinism (replay).
import { getCard } from '@overclock/cards';
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewFor, waitingOn, type Action, type GameEvent, type GameState } from '../src/index';
import { maxHandSize } from '../src/state';
import { memoryLimit, memoryUsed } from '../src/rules';
import { replay as engineReplay } from '../src/index';
import { coreGame, liveness } from './helpers';
import { expectRunnerEventsClean, expectRunnerViewClean } from './hidden';

function prng(seed: number): (n: number) => number {
  let x = (seed * 7907 + 15485863) >>> 0 || 3;
  return (n) => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x % n;
  };
}

/** Favour the moves that reach the Sprint 8 rules (runs into rezzed ICE, letting it fire, rezzing). */
function weight(s: GameState, a: Action): number {
  switch (a.type) {
    case 'rez':
      return s.phase === 'action' ? 20 : 12;
    case 'activate':
      return 15;
    case 'choose':
      return 10;
    case 'score':
    case 'steal':
      return 20;
    case 'install':
      return 12;
    case 'play':
      return 6;
    case 'run':
      return 10;
    case 'use_ability':
      // Battering Ram's two-at-once break needs Heimdall 1.0 and three pumps: favour breakers.
      return a.subs?.length === 2 ? 60 : 12;
    case 'pass':
      return s.run?.step === 'encounter' ? 6 : 4;
    case 'advance':
      return 6;
    case 'end_turn':
      return 1;
    default:
      return 3;
  }
}

type Stats = Record<
  | 'hbTrigger'
  | 'kateDiscount'
  | 'onRez'
  | 'corpTrashed'
  | 'clicksGained'
  | 'brainDamage'
  | 'trashTarget'
  | 'preventTrash'
  | 'prevented'
  | 'rigTrashedByIce'
  | 'multiBreak'
  | 'corpClickAbility'
  | 'flatline',
  number
>;

const newStats = (): Stats => ({
  hbTrigger: 0,
  kateDiscount: 0,
  onRez: 0,
  corpTrashed: 0,
  clicksGained: 0,
  brainDamage: 0,
  trashTarget: 0,
  preventTrash: 0,
  prevented: 0,
  rigTrashedByIce: 0,
  multiBreak: 0,
  corpClickAbility: 0,
  flatline: 0,
});

const isRemote = (id: string) => id.startsWith('remote');

function checkState(s: GameState, where: string): void {
  expect(liveness(s), where).toBe(waitingOn(s));
  expectRunnerViewClean(s, where);
  for (const viewer of ['corp', 'runner'] as const) expect(JSON.stringify(viewFor(viewer, s)), where).not.toMatch(/installedThisTurn/);
  expect(s.players.corp.brainDamage, where).toBe(0);
  expect(s.players.runner.brainDamage, where).toBeGreaterThanOrEqual(0);
  if (s.phase === 'choice') {
    expect(s.choice, where).not.toBeNull();
    // Sprint 9 (engine-dev): a trace from an operation (SEA Source) is a choice outside a run (resume 'action').
    const actionTrace = (s.choice!.kind === 'trace_corp' || s.choice!.kind === 'trace_runner') && s.run === null;
    if (actionTrace) {
      expect(s.choice!.resume, where).toBe('action');
      expect(viewFor(s.choice!.player, s).choice!.options.length, where).toBeGreaterThan(0);
    } else if (s.choice!.kind !== 'free_rez') {
      // An in-run choice keeps the run; the sub being resolved is recorded; the deciding side has a move.
      expect(s.choice!.resume, where).toBe('run');
      expect(s.run?.step, where).toBe('encounter');
      expect(s.run?.firing, where).not.toBeNull();
      expect(viewFor(s.choice!.player, s).choice!.options.length, where).toBeGreaterThan(0);
      expect(viewFor('runner', s).run, `${where}: run stays in view`).not.toBeNull();
    }
  } else if (s.run) {
    expect(s.run.firing, `${where}: firing only during a choice`).toBeNull();
  }
  if (!s.run) {
    for (const sv of s.servers) if (isRemote(sv.id)) expect(sv.ice.length + sv.content.length, `${where}: empty ${sv.id}`).toBeGreaterThan(0);
  }
  for (const c of [...s.rig, ...s.servers.flatMap((sv) => [...sv.ice, ...sv.content])]) {
    expect(c.hostedCredits, where).toBeGreaterThanOrEqual(0);
    const def = getCard(c.cardId)!;
    // An emptied trash-when-empty card is gone (Corp ones only once face up: Adonis gets its credits when rezzed).
    if (def.trashWhenEmpty && (def.side === 'runner' || c.rezzed)) expect(c.hostedCredits, `${where}: ${c.cardId} empty but installed`).toBeGreaterThan(0);
    // P1: a face-down Corp card never holds credits.
    if (def.side === 'corp' && !c.rezzed) expect(c.hostedCredits, `${where}: face-down ${c.cardId} holds credits`).toBe(0);
  }
  expect(memoryUsed(s), where).toBeLessThanOrEqual(memoryLimit(s));
  for (const side of ['corp', 'runner'] as const) expect(s.players[side].credits, where).toBeGreaterThanOrEqual(0);
}

/** Every option's `reject` is what apply answers; every legal action is accepted. */
function checkOptions(s: GameState, where: string): void {
  for (const side of ['corp', 'runner'] as const) {
    const v = viewFor(side, s);
    const options = [...v.handOptions.flat(), ...Object.values(v.installedOptions).flat(), ...(v.run?.options ?? []), ...(v.choice?.options ?? [])];
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

function count(before: GameState, action: Action, events: readonly GameEvent[], stats: Stats): void {
  let broken = 0;
  for (const e of events) {
    if (e.type === 'ability_triggered' && e.uid === 'id:corp') stats.hbTrigger++;
    if (e.type === 'ability_triggered' && e.uid === 'id:runner') stats.kateDiscount++;
    if (e.type === 'ability_triggered' && e.trigger === 'rez') stats.onRez++;
    if (e.type === 'ability_triggered' && e.trigger === 'click' && before.activePlayer === 'corp') stats.corpClickAbility++;
    if (e.type === 'corp_card_trashed') stats.corpTrashed++;
    if (e.type === 'clicks_gained') stats.clicksGained++;
    if (e.type === 'brain_damage') stats.brainDamage++;
    if (e.type === 'choice_opened' && e.kind === 'trash_target') stats.trashTarget++;
    if (e.type === 'choice_opened' && e.kind === 'prevent_trash') stats.preventTrash++;
    if (e.type === 'trash_prevented') stats.prevented++;
    if (e.type === 'rig_card_trashed' && before.run) stats.rigTrashedByIce++;
    if (e.type === 'subroutine_broken') broken++;
    if (e.type === 'game_over' && e.reason === 'flatline') stats.flatline++;
  }
  // Battering Ram breaks (any size; two at once needs Heimdall 1.0 rezzed, rare at random: unit-tested).
  if (action.type === 'use_ability' && action.subs !== undefined && broken > 0) stats.multiBreak++;
}

function play(seed: number, stats: Stats, options: { rezWindow?: 'always' } = {}): { actions: Action[]; final: GameState } {
  const pick = prng(seed);
  let s = coreGame(seed, options);
  const actions: Action[] = [];
  for (let step = 0; step < 1500 && s.phase !== 'over'; step++) {
    const where = `seed ${seed} step ${step}`;
    checkState(s, where);
    if (step % 7 === 0 || s.phase === 'choice') checkOptions(s, where);
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
    count(s, action, res.events, stats);
    // After the Runner's turn ends (discard done), his hand fits his maximum.
    if (res.events.some((e) => e.type === 'turn_ended' && e.player === 'runner')) {
      expect(res.state.players.runner.hand.length, `${where}: hand within max`).toBeLessThanOrEqual(Math.max(0, maxHandSize(res.state, 'runner')));
    }
    actions.push(action);
    s = res.state;
  }
  checkState(s, `seed ${seed} end`);
  return { actions, final: s };
}

describe('Sprint 8 properties over random core-deck games', () => {
  it('300 games (pass-the-phone): legal = accepted, options agree, hidden info, liveness incl. in-run choices, invariants, replay', () => {
    const stats = newStats();
    for (let seed = 1; seed <= 300; seed++) {
      const { actions, final } = play(seed, stats);
      if (seed % 10 === 0) {
        expect(engineReplay(seed, actions, { deckSet: 'core' }).state, `seed ${seed} replay`).toEqual(final);
        expect(engineReplay(seed, JSON.parse(JSON.stringify(actions)) as Action[], { deckSet: 'core' }).state).toEqual(JSON.parse(JSON.stringify(final)));
      }
    }
    // The new rules really happened.
    expect(stats.hbTrigger).toBeGreaterThan(100);
    expect(stats.kateDiscount).toBeGreaterThan(50);
    expect(stats.onRez).toBeGreaterThan(10);
    expect(stats.corpTrashed).toBeGreaterThan(0);
    expect(stats.clicksGained).toBeGreaterThan(10);
    expect(stats.brainDamage).toBeGreaterThan(10);
    expect(stats.trashTarget).toBeGreaterThan(0);
    expect(stats.preventTrash).toBeGreaterThan(0);
    expect(stats.rigTrashedByIce).toBeGreaterThan(5);
    expect(stats.multiBreak).toBeGreaterThan(0);
    expect(stats.corpClickAbility).toBeGreaterThan(10);
    expect(stats.flatline).toBeGreaterThan(0);
  }, 600_000);

  it('60 online games (rezWindow always): the same properties', () => {
    const stats = newStats();
    for (let seed = 2001; seed <= 2060; seed++) {
      const { actions, final } = play(seed, stats, { rezWindow: 'always' });
      if (seed % 10 === 0) expect(engineReplay(seed, actions, { rezWindow: 'always', deckSet: 'core' }).state).toEqual(final);
    }
    expect(stats.hbTrigger).toBeGreaterThan(0);
    expect(stats.brainDamage).toBeGreaterThan(0);
  }, 300_000);
});
