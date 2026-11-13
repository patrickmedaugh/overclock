// QA (Sprint 3), written independently of the engine developer's tests.
// Random full games with runs (own PRNG and own action bias, so runs, rezzes and
// breaks happen often), checking at every state:
// - S-03-1 AC7 / risk "hidden cards stay hidden": the Runner's view and its projected
//   events carry a Corp card id only where the Runner may know it (rezzed ICE, face-up
//   Archives, score areas, played operations, and the cards it is accessing right now).
// - S-03-3 AC1 / snappiness "empty windows auto-pass": the Corp is only ever asked to
//   rez when the ICE is face down and it can pay, and then it has a real choice
//   (Rez and Don't rez). Approach never waits on the Runner; an encounter only stops on
//   rezzed ICE with an unbroken subroutine; Continue only after a piece of ICE.
// - S-03-2 AC4: points equal the agendas in the score areas, and 7 ends the game at once.
import { getCard } from '@overclock/cards';
import { describe, expect, it } from 'vitest';
import {
  WINNING_POINTS,
  apply,
  legalActions,
  newGame,
  viewEvents,
  viewFor,
  waitingOn,
  type Action,
  type GameEvent,
  type GameState,
} from '../src/index';

function prng(seed: number): (n: number) => number {
  let s = (seed * 2246822519) >>> 0 || 7;
  return (n) => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s % n;
  };
}

function weight(a: Action): number {
  switch (a.type) {
    case 'run':
      return 4;
    case 'rez':
      return 3;
    case 'use_ability':
      return 4;
    case 'install':
      return 3;
    case 'advance':
      return 3;
    case 'score':
      return 10;
    case 'steal':
      return 10;
    case 'trash':
      return 2;
    default:
      return 1;
  }
}

const isCorpId = (x: unknown): x is string => typeof x === 'string' && /^c\d\d$/.test(x);

/** Every Corp card id anywhere in a JSON value. */
function corpIds(value: unknown, out: string[] = []): string[] {
  if (isCorpId(value)) out.push(value);
  else if (Array.isArray(value)) for (const v of value) corpIds(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) corpIds(v, out);
  return out;
}

/** The Runner's view hides every Corp card the Runner may not know right now. */
function checkRunnerView(s: GameState, where: string): void {
  const v = viewFor('runner', s);
  expect(v.players.corp.hand, `${where}: Corp hand hidden`).toBeNull();
  const accessingUids = new Set((s.run?.access?.cards ?? []).map((c) => c.uid).filter(Boolean));
  for (const sv of s.servers) {
    const vsv = v.corpServers.find((x) => x.id === sv.id)!;
    for (const zone of ['ice', 'content'] as const) {
      sv[zone].forEach((c, i) => {
        const seen = vsv[zone][i]!;
        const may = c.rezzed || accessingUids.has(c.uid);
        if (!may) expect(seen.cardId, `${where}: face-down ${sv.id} ${zone} ${c.uid} hidden`).toBeNull();
        else if (c.rezzed) expect(seen.cardId).toBe(c.cardId);
      });
    }
  }
  s.players.corp.discard.forEach((d, i) => {
    expect(v.players.corp.discard[i], `${where}: Archives entry ${i}`).toBe(d.faceUp ? d.cardId : null);
  });
  expect(v.players.corp.deckCount).toBe(s.players.corp.deck.length);
  if (s.run && v.run) {
    const ice = s.run.position >= 0 ? s.servers.find((x) => x.id === s.run!.server)!.ice[s.run.position] : undefined;
    if (ice && !ice.rezzed) {
      expect(v.run.ice?.cardId ?? null, `${where}: unrezzed current ICE hidden`).toBeNull();
      expect(v.run.ice?.subroutines ?? []).toEqual([]);
    }
    // Access: exactly the cards being accessed now.
    expect((v.run.access?.cards ?? []).map((c) => c.cardId)).toEqual((s.run.access?.cards ?? []).map((c) => c.cardId));
    // Run options (the Runner's) never name the ICE.
    expect(corpIds(v.run.options)).toEqual([]);
  }
  // Nothing else in the view may hold a Corp id: count the ids the Runner may know.
  const known: string[] = [
    ...s.servers.flatMap((sv) => [...sv.ice, ...sv.content].filter((c) => c.rezzed || accessingUids.has(c.uid)).map((c) => c.cardId)),
    ...s.players.corp.discard.filter((d) => d.faceUp).map((d) => d.cardId),
    ...s.players.corp.scoreArea,
    ...s.players.runner.scoreArea,
  ];
  // Rezzed current ICE / accessed cards appear twice (board + run view); compare as sets.
  const allowed = new Set([...known, ...(s.run?.access?.cards ?? []).map((c) => c.cardId)]);
  for (const id of corpIds(v)) expect(allowed.has(id), `${where}: Runner view holds ${id} (${getCard(id)?.name})`).toBe(true);
}

/** Runner-projected events carry Corp ids only in public events or the cards being accessed. */
function checkRunnerEvents(before: GameState, after: GameState, events: readonly GameEvent[], where: string): void {
  const accessed = new Set((after.run?.access?.cards ?? []).map((c) => c.cardId));
  for (const e of viewEvents('runner', events)) {
    const ids = corpIds(e);
    if (ids.length === 0) continue;
    switch (e.type) {
      case 'ice_rezzed':
      case 'agenda_stolen':
      case 'agenda_scored':
      case 'card_trashed':
      case 'card_played':
        break; // public
      case 'card_accessed':
        // Either still on screen, or it was accessed and the run already ended in this same action.
        if (after.run) expect(accessed.has(e.cardId!), `${where}: accessed ${e.cardId} is in the access list`).toBe(true);
        break;
      default:
        throw new Error(`${where}: Runner event ${JSON.stringify(e)} holds a Corp card id`);
    }
  }
  void before;
}

/** Decision windows: nobody is asked unless they have a real choice. */
function checkWindows(s: GameState, where: string): void {
  if (s.phase !== 'run' || !s.run) return;
  const run = s.run;
  const who = waitingOn(s);
  const ice = run.position >= 0 ? s.servers.find((x) => x.id === run.server)!.ice[run.position] : undefined;
  if (run.step === 'approach') {
    expect(who, `${where}: approach waits on the Corp`).toBe('corp');
    expect(ice && !ice.rezzed, `${where}: approach only stops for face-down ICE`).toBe(true);
    expect(s.players.corp.credits, `${where}: approach only stops when the Corp can pay`).toBeGreaterThanOrEqual(getCard(ice!.cardId)!.cost);
    const types = legalActions(s, 'corp').map((a) => a.type).sort();
    expect(types, `${where}: Rez and Don't rez`).toEqual(['pass', 'rez']);
  }
  if (run.step === 'encounter') {
    expect(who).toBe('runner');
    expect(ice?.rezzed, `${where}: only rezzed ICE is encountered`).toBe(true);
    const subs = getCard(ice!.cardId)!.subroutines ?? [];
    expect(subs.some((_, i) => !run.broken.includes(i)), `${where}: an unbroken subroutine remains`).toBe(true);
    expect(run.bypassNext, `${where}: no pending bypass at an encounter stop`).toBe(false);
  }
  if (run.step === 'continue') {
    expect(who).toBe('runner');
    expect(ice, `${where}: Continue only after a piece of ICE`).toBeDefined();
    expect(legalActions(s, 'runner').map((a) => a.type).sort()).toEqual(['jack_out', 'pass']);
  }
  if (run.step === 'access') {
    expect(who).toBe('runner');
    expect(run.access!.cards.length, `${where}: an access stop shows at least one card`).toBeGreaterThan(0);
    expect(legalActions(s, 'runner').some((a) => a.type === 'jack_out'), `${where}: no jack out at access`).toBe(false);
  }
}

const points = (ids: readonly string[]) => ids.reduce((n, id) => n + (getCard(id)?.agendaPoints ?? 0), 0);

describe('QA Sprint 3: random games with runs', () => {
  it('hidden info, decision windows and the 7-point win hold at every step (150 games)', () => {
    const stats = { runs: 0, rezzes: 0, breaks: 0, accesses: 0, steals: 0, scores: 0, over: { agenda_points: 0, flatline: 0, corp_decked: 0 } };
    for (let seed = 1; seed <= 150; seed++) {
      const pick = prng(seed);
      let s = newGame(seed);
      for (let step = 0; step < 1500 && s.phase !== 'over'; step++) {
        const where = `seed ${seed} step ${step}`;
        checkRunnerView(s, where);
        checkWindows(s, where);
        const me = waitingOn(s)!;
        const legal = legalActions(s, me);
        expect(legal.length, `${where}: ${me} can act`).toBeGreaterThan(0);
        const w = legal.map(weight);
        let r = pick(w.reduce((x, y) => x + y, 0));
        let i = 0;
        while (r >= w[i]!) r -= w[i++]!;
        const a = legal[i]!;
        const res = apply(s, a);
        expect(res.events.some((e) => e.type === 'action_rejected'), `${where}: legal ${a.type} accepted`).toBe(false);
        checkRunnerEvents(s, res.state, res.events, where);
        for (const e of res.events) {
          if (e.type === 'run_started') stats.runs++;
          if (e.type === 'ice_rezzed') stats.rezzes++;
          if (e.type === 'subroutine_broken') stats.breaks++;
          if (e.type === 'card_accessed') stats.accesses++;
          if (e.type === 'agenda_stolen') stats.steals++;
          if (e.type === 'agenda_scored') stats.scores++;
        }
        s = res.state;
        // Points and the win.
        const cp = points(s.players.corp.scoreArea);
        const rp = points(s.players.runner.scoreArea);
        expect(viewFor('corp', s).players.runner.points).toBe(rp);
        expect(viewFor('runner', s).players.corp.points).toBe(cp);
        if (cp >= WINNING_POINTS || rp >= WINNING_POINTS) {
          expect(s.phase, `${where}: 7 points ends the game at once`).toBe('over');
          expect(s.result).toEqual({ winner: rp >= WINNING_POINTS ? 'runner' : 'corp', reason: 'agenda_points' });
        }
        if (s.phase !== 'over' && s.phase !== 'run') expect(s.run).toBeNull();
      }
      if (s.result) stats.over[s.result.reason]++;
    }
    // The property was really exercised.
    expect(stats.runs).toBeGreaterThan(500);
    expect(stats.rezzes).toBeGreaterThan(50);
    expect(stats.breaks).toBeGreaterThan(10);
    expect(stats.steals).toBeGreaterThan(20);
    expect(stats.scores).toBeGreaterThan(20);
    expect(stats.over.agenda_points + stats.over.flatline + stats.over.corp_decked).toBeGreaterThan(100);
  }, 60_000); // ~2–8s; a long timeout so a busy CI runner cannot turn it red (architect, 2026-11-13). Assertions unchanged.
});
