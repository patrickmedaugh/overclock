// Sprint 15 E1 (S-15-2 AC2, S-15-3 AC4, S-15-4 AC2/AC5): the movement planner over whole seeded
// games, both seats, every batch of events a screen receives:
// - no card flies face up to a seat that may not know it: a face-up Corp card on the Runner's
//   screen is never one held only in HQ / R&D / face down (before *and* after the batch), a Corp
//   install never flies face up to the Runner unless it is rezzed when it lands, and a face-up
//   Runner card on the Corp's screen is never one held only in the Stack / Grip (`hiddenRunnerIds`);
// - a face shown in flight comes from that seat's own projected events (never invented);
// - the projected events themselves are clean (`runnerEventLeaks` / `corpEventLeaks`);
// - every batch ends within 600 ms (`motionSpan`), a ripple of several cards within 500 ms, and
//   at most 4 cards are in the air; the same holds for the pass-the-phone catch-up (the other
//   seat's events of a whole stretch of turns, played as one ripple).
// The checker has teeth: planning the Runner's screen from the *Corp's* events is caught.
import { getCard } from '@overclock/cards';
import type { Action, GameEvent, GameState, PlayerView, Side } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';
import { corpEventLeaks, hiddenRunnerIds, runnerEventLeaks } from '@overclock/match/testing';
import { describe, expect, it } from 'vitest';
import { MOTION, motionSpan, planMotion, type Flight } from '../src/motion';

const GAMES = 30;
const MAX_STEPS = 2500;
const SIDES: readonly Side[] = ['corp', 'runner'];
const DECK_SETS = ['core45', 'core', 'starter'] as const;

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

const installedCorp = (s: GameState) => s.servers.flatMap((sv) => [...sv.ice, ...sv.content]);

/** Corp card ids the Runner must not see in `s`: only in HQ, R&D, face down installed or face down in Archives. */
function hiddenCorpIds(s: GameState): Set<string> {
  const corp = s.players.corp;
  const installed = installedCorp(s);
  const open = new Set<string>([
    ...installed.filter((c) => c.rezzed).map((c) => c.cardId),
    ...corp.discard.filter((d) => d.faceUp).map((d) => d.cardId),
    ...corp.scoreArea,
    ...s.players.runner.scoreArea,
    ...(s.run?.access?.cards.map((c) => c.cardId) ?? []),
    ...(s.lastRun?.cards.map((c) => c.cardId) ?? []),
  ]);
  if (corp.identity) open.add(corp.identity);
  const places = [...corp.hand, ...corp.deck, ...installed.filter((c) => !c.rezzed).map((c) => c.cardId), ...corp.discard.filter((d) => !d.faceUp).map((d) => d.cardId)];
  return new Set(places.filter((id) => !open.has(id)));
}

/** Problems with `flights` planned for `viewer` from one batch that led from `before` to `after`. */
function flightLeaks(viewer: Side, flights: readonly Flight[], events: readonly GameEvent[], before: GameState, after: GameState): string[] {
  const out: string[] = [];
  const said = JSON.stringify(events);
  const hiddenCorp = viewer === 'runner' ? [hiddenCorpIds(before), hiddenCorpIds(after)] : null;
  const hiddenRunner = viewer === 'corp' ? hiddenRunnerIds(after) : null;
  for (const f of flights) {
    if (f.cardId === null) continue;
    if (!said.includes(`"${f.cardId}"`)) out.push(`${f.kind}: face ${f.cardId} is not in ${viewer}'s events`);
    const side = getCard(f.cardId)?.side;
    if (side === undefined) {
      out.push(`${f.kind}: unknown card ${f.cardId}`);
      continue;
    }
    if (side === viewer) continue; // a seat knows its own cards
    if (hiddenCorp && hiddenCorp[0]!.has(f.cardId) && hiddenCorp[1]!.has(f.cardId)) out.push(`${f.kind}: Corp card ${f.cardId} flies face up to the Runner but is hidden`);
    if (viewer === 'runner' && f.to.at === 'installed') {
      const uid = f.to.uid;
      const c = installedCorp(after).find((x) => x.uid === uid);
      if (c && !(c.rezzed && c.cardId === f.cardId)) out.push(`${f.kind}: face-down install ${uid} flies face up (${f.cardId}) to the Runner`);
    }
    if (hiddenRunner?.has(f.cardId)) out.push(`${f.kind}: Runner card ${f.cardId} flies face up to the Corp but is only in the Stack/Grip`);
  }
  return out;
}

/** Budget problems of one batch. */
function budget(flights: readonly Flight[]): string[] {
  const out: string[] = [];
  const span = motionSpan(flights);
  if (span > 600) out.push(`batch takes ${span} ms (> 600)`);
  // A ripple (more than one card moving) ends within 500 ms.
  const cards = flights.filter((f) => f.kind !== 'showcase').length;
  if (cards > 1 && span > MOTION.batchMs) out.push(`ripple of ${cards} cards takes ${span} ms (> ${MOTION.batchMs})`);
  if (cards > 1) {
    // At most 4 cards in the air at any moment.
    for (const f of flights) {
      const t = f.delayMs;
      const inAir = flights.filter((g) => g.kind !== 'showcase' && g.durationMs > 0 && g.delayMs <= t && t < g.delayMs + g.durationMs).length;
      if (inAir > MOTION.maxInAir) out.push(`${inAir} cards in the air at ${t} ms`);
    }
  }
  return out;
}

interface Totals {
  batches: number;
  faceUp: number;
  faceDown: number;
  kinds: Map<string, number>;
  /** Face-down flights of the other side's cards, per viewer (proves hidden cards were in play). */
  hiddenFlown: Record<Side, number>;
  catchUps: number;
  teeth: number;
  over: number;
}

function playGame(game: number, t: Totals): string[] {
  const problems: string[] = [];
  const pick = prng(game);
  const deckSet = DECK_SETS[game % DECK_SETS.length]!;
  const m = new LocalMatch(1000 + game * 37, { deckSet });
  let before = m.snapshot();
  const views: Record<Side, PlayerView> = { corp: m.view('corp'), runner: m.view('runner') };
  // Pass-the-phone catch-up: each seat's events while the other seat acted.
  const missed: Record<Side, GameEvent[]> = { corp: [], runner: [] };
  for (let step = 0; step < MAX_STEPS && before.phase !== 'over'; step++) {
    const who: Side = views.corp.legalActions.length > 0 ? 'corp' : 'runner';
    const legal = views[who].legalActions;
    if (legal.length === 0) break;
    const runs = legal.filter((a) => a.type === 'run');
    const a: Action = runs.length > 0 && pick(3) === 0 ? runs[pick(runs.length)]! : legal[pick(legal.length)]!;
    // The seat about to act sees what it missed first (one ripple, as after the pass cover lifts).
    if (missed[who].length > 0) {
      const f = planMotion(who, missed[who]);
      t.catchUps++;
      for (const p of budget(f)) problems.push(`game ${game} step ${step} ${who} catch-up: ${p}`);
      missed[who] = [];
    }
    const upd = m.submit(who, a);
    const after = m.snapshot();
    t.batches++;
    for (const side of SIDES) {
      const { events, view } = upd[side];
      views[side] = view;
      if (side !== who) missed[side].push(...events);
      const leaks = side === 'runner' ? runnerEventLeaks(events, after) : corpEventLeaks(events, after);
      for (const p of leaks) problems.push(`game ${game} step ${step} ${side} events: ${p}`);
      const flights = planMotion(side, events);
      for (const p of [...flightLeaks(side, flights, events, before, after), ...budget(flights)]) problems.push(`game ${game} step ${step} ${side} ${a.type}: ${p}`);
      for (const f of flights) {
        t.kinds.set(f.kind, (t.kinds.get(f.kind) ?? 0) + 1);
        if (f.cardId === null) {
          t.faceDown++;
          if (f.side !== side) t.hiddenFlown[side]++;
        } else t.faceUp++;
      }
    }
    // Teeth: the Runner's screen planned from the Corp's projection (which names the Corp's own
    // hidden cards) must be caught by the same checker.
    if (flightLeaks('runner', planMotion('runner', upd.corp.events), upd.corp.events, before, after).length > 0) t.teeth++;
    before = after;
  }
  if (before.phase === 'over') t.over++;
  return problems;
}

describe('S-15 movement: no hidden card flies face up, every batch within budget', () => {
  it(`${GAMES} seeded games, both seats, every batch and every pass-the-phone catch-up`, () => {
    const t: Totals = { batches: 0, faceUp: 0, faceDown: 0, kinds: new Map(), hiddenFlown: { corp: 0, runner: 0 }, catchUps: 0, teeth: 0, over: 0 };
    const problems: string[] = [];
    for (let game = 1; game <= GAMES; game++) problems.push(...playGame(game, t));
    expect(problems.slice(0, 20)).toEqual([]);

    // The games really exercised the movement (not a vacuous pass).
    // (2026-11-20: 3,458 batches, 30 of 30 games to game over, 1,814 face-up and 814 face-down flights.)
    expect(t.batches).toBeGreaterThan(2000);
    expect(t.over).toBeGreaterThan(GAMES / 2);
    for (const kind of ['draw', 'install', 'play', 'showcase', 'discard', 'trash', 'score', 'steal']) {
      expect(t.kinds.get(kind) ?? 0, `flights of kind ${kind}`).toBeGreaterThan(0);
    }
    // Hidden cards moved on both screens (face down), and the face-up ones were checked.
    expect(t.hiddenFlown.runner, 'Corp cards flown face down to the Runner').toBeGreaterThan(300);
    expect(t.hiddenFlown.corp, 'Runner cards flown face down to the Corp').toBeGreaterThan(50);
    expect(t.faceUp).toBeGreaterThan(1000);
    expect(t.catchUps).toBeGreaterThan(500);
    // The checker catches a planner fed the other seat's events.
    expect(t.teeth).toBeGreaterThan(100);
  });
});
