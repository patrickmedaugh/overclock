// Sprint 12 E5 (S-12-5 AC3): properties over 300 random games on the 45-card decks (plus 60 online-rules
// games). Every legal move is accepted and every offered option's `reject` is what apply answers; liveness;
// no hidden Corp card in the Runner's view or events (looked-at cards, face-down Archives picks, exposes);
// and every new card does what its text says:
// - 45 cards per side stay in the game (decks, hands, piles, score areas, the table, set-aside looked cards);
// - ICE strength = printed + counters + face-up Experiential Data in its server (board and run);
// - The Toolbox: 0..2 credits; memory limit and link include it;
// - Accelerated Beta Test: 1..3 looked-at cards, each install is free and face up, Done sends the rest face down;
// - Archived Memories: never offers its own copy; the pick goes to HQ;
// - Modded: one click, pays exactly its option's price; Infiltration's expose changes nothing on the board.
import { getCard } from '@overclock/cards';
import { describe, expect, it } from 'vitest';
import { apply, legalActions, replay as engineReplay, viewFor, waitingOn, type Action, type GameEvent, type GameState, type Side } from '../src/index';
import { liveness, rejection } from './helpers';
import { expectRunnerEventsClean, expectRunnerViewClean } from './hidden';
import { newGame as engineNewGame } from '../src/index';

function prng(seed: number): (n: number) => number {
  let x = (seed * 2654435761 + 1013904223) >>> 0 || 7;
  return (n) => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x % n;
  };
}

const NEW_PLAYS = new Set(['c24', 'r20', 'r21']);

/** Favour the new cards, scoring, installs and runs, so the new rules come up often. */
function weight(s: GameState, a: Action, me: Side): number {
  switch (a.type) {
    case 'play': {
      const id = s.players[me].hand[a.handIndex] ?? '';
      return NEW_PLAYS.has(id) ? 40 : 6;
    }
    case 'score':
      return 40;
    case 'advance':
      return 25;
    case 'install': {
      const id = s.players[me].hand[a.handIndex] ?? '';
      return id === 'c23' || id === 'c25' || id === 'r19' ? 30 : 10;
    }
    case 'rez':
      return 10;
    case 'run':
      return 10;
    case 'select':
      return 20;
    case 'use_ability':
      return 12;
    case 'steal':
      return 20;
    case 'pass':
      return s.phase === 'choice' ? 5 : s.run?.step === 'encounter' ? 6 : 4;
    case 'end_turn':
      return 1;
    default:
      return 3;
  }
}

interface Stats {
  looks: number;
  abtInstalls: number;
  trashedFaceDown: number;
  amPicks: number;
  amFaceDown: number;
  edEncounters: number;
  toolboxPays: number;
  moddeds: number;
  exposes: number;
  gains: number;
}

const DECK = 45;

/** Every card of `side` in the game, counted once. */
function cardsOf(s: GameState, side: Side): number {
  const p = s.players[side];
  const mine = (id: string) => getCard(id)?.side === side;
  const installed = side === 'corp' ? s.servers.flatMap((sv) => [...sv.ice, ...sv.content]).length : s.rig.length;
  const scored = [...s.players.corp.scoreArea, ...s.players.runner.scoreArea].filter(mine).length;
  return p.deck.length + p.hand.length + p.discard.length + installed + scored + (side === 'corp' ? (s.choice?.looked?.length ?? 0) : 0);
}

/** Independent ICE strength: printed + counters × per-counter + rezzed Experiential Data in its server. */
function expectedStrength(s: GameState, serverId: string, uid: string): number {
  const sv = s.servers.find((x) => x.id === serverId)!;
  const ice = sv.ice.find((c) => c.uid === uid)!;
  const card = getCard(ice.cardId)!;
  const ed = sv.content.filter((c) => c.rezzed && c.cardId === 'c25').length;
  return (card.strength ?? 0) + ice.advancements * (card.strengthPerAdvancement ?? 0) + ed;
}

function checkInvariants(s: GameState, where: string, stats: Stats): void {
  expect(cardsOf(s, 'corp'), `${where}: 45 Corp cards`).toBe(DECK);
  expect(cardsOf(s, 'runner'), `${where}: 45 Runner cards`).toBe(DECK);
  for (const viewer of ['corp', 'runner'] as const) {
    const v = viewFor(viewer, s);
    for (const sv of v.corpServers) {
      for (const c of sv.ice) {
        if (c.cardId === null) expect(c.strength, where).toBeUndefined();
        else expect(c.strength, `${where}: ${c.uid} strength`).toBe(expectedStrength(s, sv.id, c.uid));
      }
      for (const c of sv.content) expect(c.strength, where).toBeUndefined();
    }
    if (v.run?.ice?.strength !== null && v.run?.ice?.strength !== undefined) {
      expect(v.run.ice.strength, where).toBe(expectedStrength(s, s.run!.server, v.run.iceUid!));
    }
  }
  const toolboxes = s.rig.filter((c) => c.cardId === 'r19');
  for (const t of toolboxes) {
    expect(t.hostedCredits, where).toBeGreaterThanOrEqual(0);
    expect(t.hostedCredits, where).toBeLessThanOrEqual(2);
  }
  const v = viewFor('runner', s);
  const chips = s.rig.filter((c) => c.cardId === 'r09').length;
  expect(v.memory.limit, `${where}: memory limit`).toBe(4 + chips + 2 * toolboxes.length);
  const globalsec = s.rig.filter((c) => c.cardId === 'r18').length;
  expect(v.players.runner.link, `${where}: link`).toBe(1 + globalsec + 2 * toolboxes.length);
  if (s.choice?.kind === 'look_install') {
    expect(s.choice.looked!.length, where).toBeGreaterThanOrEqual(1);
    expect(s.choice.looked!.length, where).toBeLessThanOrEqual(3);
  }
  if (s.choice?.kind === 'archives_pick') {
    const opts = viewFor('corp', s).choice!.options;
    expect(opts.map((o) => (o.action as { card: number }).card), where).not.toContain(s.choice.ownIndex);
    expect(s.players.corp.discard[s.choice.ownIndex!]?.cardId, where).toBe('c24');
  }
  if (s.run?.step === 'encounter') {
    const ice = s.servers.find((sv) => sv.id === s.run!.server)!.ice[s.run.position];
    if (ice && s.servers.find((sv) => sv.id === s.run!.server)!.content.some((c) => c.rezzed && c.cardId === 'c25')) stats.edEncounters++;
  }
}

/** Every offered option's `reject` is what apply answers (hand, run, choice, installed options). */
function checkOptions(s: GameState, me: Side, where: string): void {
  const v = viewFor(me, s);
  const all = [...v.handOptions.flat(), ...(v.run?.options ?? []), ...(v.choice?.options ?? []), ...Object.values(v.installedOptions).flat()];
  for (const o of all) expect(rejection(apply(s, o.action).events), `${where}: ${JSON.stringify(o.action)}`).toBe(o.reject);
  const legal = legalActions(s, me);
  for (const o of all) if (o.reject === null) expect(legal, where).toContainEqual(o.action);
}

/** What the move did with the new cards. */
function checkMove(before: GameState, a: Action, events: readonly GameEvent[], after: GameState, where: string, stats: Stats): void {
  if (events.some((e) => e.type === 'cards_looked_at')) stats.looks++;
  if (a.type === 'select' && before.choice?.kind === 'look_install') {
    stats.abtInstalls++;
    const inst = events.find((e) => e.type === 'card_installed');
    expect(inst, where).toBeDefined();
    const uid = (inst as { uid: string }).uid;
    const placed = after.servers.flatMap((sv) => sv.ice).find((c) => c.uid === uid)!;
    expect(placed.rezzed, `${where}: installed face up`).toBe(true);
    expect(events.some((e) => e.type === 'credits_spent'), `${where}: ignoring all costs`).toBe(false);
    expect(after.players.corp.clicks, where).toBe(before.players.corp.clicks);
  }
  if (a.type === 'pass' && before.choice?.kind === 'look_install') {
    const n = before.choice.looked!.length;
    stats.trashedFaceDown += n;
    expect(after.players.corp.discard.slice(-n), where).toEqual(before.choice.looked!.map((cardId) => ({ cardId, faceUp: false })));
  }
  if (a.type === 'select' && before.choice?.kind === 'archives_pick') {
    stats.amPicks++;
    const entry = before.players.corp.discard[a.card]!;
    if (!entry.faceUp) stats.amFaceDown++;
    expect(after.players.corp.hand.at(-1), where).toBe(entry.cardId);
    expect(after.players.corp.discard.length, where).toBe(before.players.corp.discard.length - 1);
  }
  if (a.type === 'play' && a.player === 'runner' && before.players.runner.hand[a.handIndex] === 'r20' && a.installIndex !== undefined) {
    stats.moddeds++;
    const o = viewFor('runner', before).handOptions[a.handIndex]!.find((x) => JSON.stringify(x.action) === JSON.stringify(a))!;
    expect(after.players.runner.clicks, `${where}: Modded costs one click`).toBe(before.players.runner.clicks - 1);
    expect(after.players.runner.credits, `${where}: Modded pays its option's price`).toBe(before.players.runner.credits - o.cost);
    expect(after.rig.length, where).toBe(before.rig.length + 1);
  }
  if (a.type === 'play' && a.player === 'runner' && before.players.runner.hand[a.handIndex] === 'r21') {
    if (a.mode === 1) {
      stats.exposes++;
      expect(after.servers, `${where}: expose changes nothing on the board`).toEqual(before.servers);
      expect(after.players.corp, where).toEqual(before.players.corp);
      expect(events.filter((e) => e.type === 'card_exposed'), where).toHaveLength(1);
    } else {
      stats.gains++;
      expect(after.players.runner.credits, where).toBe(before.players.runner.credits + 2);
    }
  }
  if (events.some((e) => e.type === 'hosted_credits_changed' && before.rig.some((c) => c.uid === e.uid && c.cardId === 'r19') && a.type === 'use_ability')) stats.toolboxPays++;
}

function play(seed: number, stats: Stats, options: { rezWindow?: 'always' } = {}): { actions: Action[]; final: GameState } {
  const pick = prng(seed);
  let s = engineNewGame(seed, options); // the default deck set: core45
  expect(s.options.deckSet).toBe('core45');
  const actions: Action[] = [];
  for (let step = 0; step < 900 && s.phase !== 'over'; step++) {
    const where = `seed ${seed} step ${step}`;
    expect(liveness(s), where).toBe(waitingOn(s));
    checkInvariants(s, where, stats);
    const me = waitingOn(s)!;
    if (step % 3 === 0 || s.phase === 'choice') checkOptions(s, me, where);
    const legal = legalActions(s, me);
    const w = legal.map((a) => weight(s, a, me));
    let r = pick(w.reduce((x, y) => x + y, 0));
    let i = 0;
    while (r >= w[i]!) r -= w[i++]!;
    const action = legal[i]!;
    const res = apply(s, action);
    expect(res.events.some((e) => e.type === 'action_rejected'), `${where}: legal ${JSON.stringify(action)} accepted`).toBe(false);
    expectRunnerEventsClean(res.events, where, res.state);
    expectRunnerViewClean(res.state, where);
    checkMove(s, action, res.events, res.state, where, stats);
    actions.push(action);
    s = res.state;
  }
  return { actions, final: s };
}

const fresh = (): Stats => ({ looks: 0, abtInstalls: 0, trashedFaceDown: 0, amPicks: 0, amFaceDown: 0, edEncounters: 0, toolboxPays: 0, moddeds: 0, exposes: 0, gains: 0 });

describe('Sprint 12 properties over random 45-card games', () => {
  it('300 games (pass-the-phone): legal = accepted, options agree, liveness, no hidden id leaks, card invariants, replay', () => {
    const stats = fresh();
    for (let seed = 1; seed <= 300; seed++) {
      const { actions, final } = play(seed, stats);
      if (seed % 10 === 0) expect(engineReplay(seed, actions).state, `seed ${seed} replay`).toEqual(final);
    }
    if (process.env.S12_STATS) console.log(JSON.stringify(stats));
    for (const [k, n] of Object.entries(stats)) expect(n, k).toBeGreaterThan(0);
    expect(stats.looks).toBeGreaterThan(50);
    expect(stats.abtInstalls).toBeGreaterThan(20);
    expect(stats.amFaceDown).toBeGreaterThan(5);
  }, 900_000);

  it('60 online games (rezWindow always): the same properties', () => {
    const stats = fresh();
    for (let seed = 2001; seed <= 2060; seed++) {
      const { actions, final } = play(seed, stats, { rezWindow: 'always' });
      if (seed % 10 === 0) expect(engineReplay(seed, actions, { rezWindow: 'always' }).state).toEqual(final);
    }
    expect(stats.looks + stats.amPicks + stats.moddeds + stats.exposes).toBeGreaterThan(20);
  }, 600_000);
});
