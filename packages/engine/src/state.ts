import {
  CORP_CORE45_DECK,
  CORP_CORE_DECK,
  CORP_STARTER_DECK,
  RUNNER_CORE45_DECK,
  RUNNER_CORE_DECK,
  RUNNER_STARTER_DECK,
  checkDeck,
  getCard,
  type CardType,
  type CentralServerId,
  type DeckDef,
  type DeckList,
  type Effect,
  type ServerId,
  type Side,
} from '@overclock/cards';
import type { GameEvent } from './events';
import { seedToRng, shuffle } from './rng';

export type { CentralServerId, ServerId, Side };

export const SIDES: readonly Side[] = ['corp', 'runner'];

export const STARTING_CREDITS = 5;
export const STARTING_HAND_SIZE = 5;
export const MAX_HAND_SIZE = 5;
export const RUNNER_CLICKS_PER_TURN = 4;
export const CORP_CLICKS_PER_TURN = 3;
/** Base Runner memory limit (programs' `memory` must fit). Sprint 7: `memoryLimit(state)` adds rig `memoryBonus`. */
export const MEMORY_LIMIT = 4;
/**
 * Sprint 7: the rules version (Sprint 8: 2 — identities, core decks, DSL v3; Sprint 9: 3 — traces, tags,
 * link, meat damage, DSL v4; Sprint 10: 4 — advance stops at an agenda's requirement, Bank Job amount;
 * Sprint 12: 5 — 45-card decks by default, Accelerated Beta Test, Archived Memories, Experiential Data,
 * The Toolbox, Modded, Infiltration, DSL v5). Bump it whenever an old action log would replay
 * differently (a rules change); the online room expires a game whose log no longer replays.
 */
export const RULES_VERSION: number = 5;
/** Agenda points that win the game at once (stolen or scored). */
export const WINNING_POINTS = 7;

export const CENTRAL_SERVERS: readonly CentralServerId[] = ['hq', 'rd', 'archives'];

/** An installed card. `uid` is per instance ("i1", "i2", ...); `cardId` is the definition id. */
export interface Installed {
  readonly uid: string;
  readonly cardId: string;
  /** Corp cards: true once rezzed (face up for good). Runner cards are always face up (false here). */
  readonly rezzed: boolean;
  /** Advancement counters (Corp agendas and advanceable ICE; 0 otherwise). Public to both players. */
  readonly advancements: number;
  /** Sprint 7: credits on the card (Armitage Codebusting, Bank Job, recurring credits). Public. 0 by default. */
  readonly hostedCredits: number;
}

/** A Corp server. `ice[0]` is innermost; new ICE is pushed (outermost). */
export interface Server {
  readonly id: ServerId;
  readonly ice: readonly Installed[];
  readonly content: readonly Installed[];
}

/** One card in a discard pile. */
export interface DiscardEntry {
  readonly cardId: string;
  /** Played operations/events and all Runner discards are face up; Corp hand-limit discards are face down. */
  readonly faceUp: boolean;
}

/**
 * 'action': spend clicks / end turn. 'discard': hand-limit step. 'run': a run is in progress.
 * 'choice': a "when scored" choice waits on a player (`GameState.choice`). 'over': game finished.
 */
export type Phase = 'action' | 'discard' | 'run' | 'choice' | 'over';
export type WinReason = 'corp_decked' | 'agenda_points' | 'flatline';

/**
 * Where the run is. `approach`: the Corp may rez the approached ICE.
 * `encounter`: the Runner may break subroutines or let them through.
 * `continue`: the Runner just passed an ICE: continue or jack out.
 * `success` (Sprint 7): a successful run on a remote, before access, while the Runner has a usable
 *   `replacesAccess` ability (Bank Job): `activate` it, or `pass` (= Access cards).
 * `access`: the run was successful; the Runner deals with accessed cards.
 */
export type RunStep = 'approach' | 'encounter' | 'continue' | 'success' | 'access';

/** Where an accessed card came from. `remote` covers every remote server. */
export type AccessFrom = 'hq' | 'rd' | 'archives' | 'remote';

/**
 * One accessed card. Exactly one locator is set: `uid` (an installed card),
 * `handIndex` (HQ), `deckIndex` (R&D) or `archivesIndex` (Archives). Locators
 * are kept up to date when an earlier card of the same group leaves its zone.
 */
export interface AccessCard {
  readonly cardId: string;
  readonly from: AccessFrom;
  readonly uid?: string;
  readonly handIndex?: number;
  readonly deckIndex?: number;
  readonly archivesIndex?: number;
  /** Stolen (agendas) — stays listed so indices into the group are stable. */
  readonly stolen: boolean;
  /** Trashed by the Runner. */
  readonly trashed: boolean;
}

/** What is left to access after the current group, in order. */
export type AccessNext = { readonly kind: 'hq' } | { readonly kind: 'rd' } | { readonly kind: 'archives' } | { readonly kind: 'installed'; readonly uid: string };

export interface AccessState {
  /** The cards being looked at now (one card, or all of Archives at once). */
  readonly cards: readonly AccessCard[];
  /** Still to come. */
  readonly queue: readonly AccessNext[];
  /** R&D cards accessed so far and left in place (the next R&D access is `deck[rdSkip]`). */
  readonly rdSkip: number;
}

/** A run in progress (`phase === 'run'`). Plain JSON. */
export interface RunState {
  readonly server: ServerId;
  /** The run event that started it, if any. */
  readonly cardId?: string;
  /** Index into the server's `ice` of the current ICE (approached / encountered / just passed); -1 at the server. */
  readonly position: number;
  readonly step: RunStep;
  /** Subroutine indices broken on the current ICE. */
  readonly broken: readonly number[];
  /** Strength added to breakers (by uid) until the end of the current encounter. */
  readonly encounterBoost: Readonly<Record<string, number>>;
  /** Strength added to breakers (by uid) until the end of the run. */
  readonly runBoost: Readonly<Record<string, number>>;
  /** Inside Job: the next ICE encountered is bypassed. */
  readonly bypassNext: boolean;
  /** Additional R&D cards to access if the run is successful (The Maker's Eye). */
  readonly extraAccess: number;
  /** Set during the `access` step. */
  readonly access: AccessState | null;
  /**
   * Run-only credits from the Corp's bad publicity (set at run start). Runner
   * costs during the run are paid from these first; left-overs vanish when the run ends.
   */
  readonly tempCredits: number;
  /**
   * Sprint 8: the subroutine of the current ICE being resolved while an in-run choice is open
   * (`trash_target` / `prevent_trash`); null otherwise. On close it is reported and the rest fire.
   */
  readonly firing: number | null;
}

/**
 * What a choice is about. `free_rez`: Priority Requisition, rez one unrezzed installed ICE for free, or Skip.
 * Sprint 8 (inside a run, `resume: 'run'`): `trash_target` = the Corp picks which Runner card a
 * `trash_installed` subroutine trashes (mandatory); `prevent_trash` = the Runner may trash a preventer
 * (Sacrificial Construct) instead of `target`, or `pass` (let it be trashed).
 * Sprint 9: `trace_corp` = the Corp bids on a trace (`ChoiceState.trace`), then `trace_runner` = the
 * Runner bids. In a run `resume: 'run'` (`run.firing` = the trace subroutine); from an operation `resume: 'action'`.
 * Sprint 12 (`resume: 'action'`): `look_install` = Accelerated Beta Test, the Corp installs and rezzes ICE
 * from the cards set aside in `ChoiceState.looked` (`select`), Done (`pass`) trashes the rest face down;
 * `archives_pick` = Archived Memories, the Corp adds one Archives card to HQ (`select`, mandatory).
 */
export type ChoiceKind = 'free_rez' | 'trash_target' | 'prevent_trash' | 'trace_corp' | 'trace_runner' | 'look_install' | 'archives_pick';

/** Sprint 9: a trace in progress (on `ChoiceState.trace`). Plain JSON. */
export interface TraceState {
  /** The printed trace strength ("Trace 3"). */
  readonly base: number;
  /** base + the Corp's bid; null while the Corp bids. */
  readonly strength: number | null;
  /** The Corp's bid; null while the Corp bids. */
  readonly corpBid: number | null;
  /** What resolves if the trace succeeds (non-choice ops only). */
  readonly onSuccess: readonly Effect[];
}

/** An open choice (`phase === 'choice'`): `player` must decide before anything else happens. */
export interface ChoiceState {
  readonly kind: ChoiceKind;
  readonly player: Side;
  /** The card whose effect opened it (the scored agenda; Sprint 8: the ICE whose subroutine fired). */
  readonly cardId: string;
  /** Sprint 8, `prevent_trash`: the rig card that would be trashed. */
  readonly target?: string;
  /** Sprint 8: where the game goes on when it closes: the action phase, or the run it opened in. */
  readonly resume: 'action' | 'run';
  /** Sprint 9, `trace_corp` / `trace_runner`: the trace being bid on. */
  readonly trace?: TraceState;
  /**
   * Sprint 12, `look_install`: the card ids taken from the top of R&D (top first), still set aside
   * (installed ones leave the list). Only the Corp sees them.
   */
  readonly looked?: readonly string[];
  /** Sprint 12, `look_install`: the card types that may be installed from `looked` (ICE). */
  readonly types?: readonly CardType[];
  /** Sprint 12, `archives_pick`: the Archives index of the copy being played (never offered). */
  readonly ownIndex?: number;
}

export interface GameResult {
  readonly winner: Side;
  readonly reason: WinReason;
}

/** Sprint 5: one card accessed in the Runner's most recent run, in access order. */
export interface LastRunCard {
  readonly cardId: string;
  readonly from: AccessFrom;
}

/** Sprint 5: the Runner's most recent run (since its start), until the Runner's turn ends. */
export interface LastRun {
  readonly server: ServerId;
  /** Every card accessed, in access order (stolen, trashed or left alike). */
  readonly cards: readonly LastRunCard[];
}

/** One player's zones and counters. Card entries are card definition ids. */
export interface PlayerState {
  /** Top of deck is index 0. */
  readonly deck: readonly string[];
  readonly hand: readonly string[];
  /** Discard pile (Runner: Heap, all face up; Corp: Archives, mixed). Bottom is index 0. */
  readonly discard: readonly DiscardEntry[];
  readonly credits: number;
  readonly clicks: number;
  /** Agendas scored (Corp) or stolen (Runner), face up: card ids in order. */
  readonly scoreArea: readonly string[];
  /** Sprint 8: the identity card id (public; uid `id:corp` / `id:runner`), or null (starter decks). */
  readonly identity: string | null;
  /** Sprint 8: brain damage taken (Runner; always 0 for the Corp). Max hand size = 5 − this. */
  readonly brainDamage: number;
  /**
   * Sprint 8: the types of the cards this side installed this turn (reset for both sides at every
   * turn start). Drives "first time each turn" rules. Never in any view (it would reveal the types
   * of face-down Corp cards).
   */
  readonly installedThisTurn: readonly CardType[];
  /** Sprint 9: tags (Runner; always 0 for the Corp). Public. Stay until removed. */
  readonly tags: number;
}

/** Sprint 8: the fixed uid of each side's identity card (events, views). */
export const IDENTITY_UID: Readonly<Record<Side, string>> = { corp: 'id:corp', runner: 'id:runner' };

/**
 * Sprint 9: the fixed uid of the `index`-th card in `side`'s score area (`score:corp:0`, ...), used by
 * `activate` for scored-agenda abilities (Private Security Force) and in views.
 */
export function scoredUid(side: Side, index: number): string {
  return `score:${side}:${index}`;
}

/** Sprint 9: parses a scored uid (`scoredUid`); null if `uid` is not one. */
export function parseScoredUid(uid: string): { side: Side; index: number } | null {
  const m = /^score:(corp|runner):(0|[1-9][0-9]*)$/.exec(uid);
  return m ? { side: m[1] as Side, index: Number(m[2]) } : null;
}

/**
 * Sprint 9: the Runner's link = identity `link` + the `link` of every installed rig card
 * (Runner cards are always face up).
 */
export function runnerLink(state: GameState): number {
  const identity = state.players.runner.identity;
  let link = identity ? (getCard(identity)?.link ?? 0) : 0;
  for (const c of state.rig) link += getCard(c.cardId)?.link ?? 0;
  return link;
}

/** Sprint 8: `side`'s maximum hand size: 5 − brain damage (may go below 0: the Runner is flatlined at end of turn). */
export function maxHandSize(state: GameState, side: Side): number {
  return MAX_HAND_SIZE - state.players[side].brainDamage;
}

/**
 * Sprint 8: which decks a game uses. Sprint 12: `'core45'` (default; hot-seat and online): the 45-card
 * Haas-Bioroid and Kate decks with their identities. `'core'`: the 30-card Sprint 11 decks (now a frozen
 * test fixture, so seeded tests keep their situations). `'starter'`: the Sprint 7 15/17-card decks, no
 * identities (a frozen test fixture).
 */
export type DeckSet = 'core45' | 'core' | 'starter';

/**
 * Sprint 6: per-game rule options, fixed at `newGame` and stored in the state.
 * `rezWindow`: when the approach of an unrezzed ICE waits on the Corp.
 * - `'affordable'` (default, hot-seat): only when the Corp can pay the rez cost; otherwise the ICE is passed face down at once.
 * - `'always'` (online): always, so the Runner cannot tell an unaffordable ICE from a cheap one;
 *   `rez` is then rejected `no_credits` when unaffordable and the Corp's only legal move is `pass`.
 * `deckSet` (Sprint 8): see `DeckSet`.
 * `decks` (Sprint 13): a side given here is dealt this list instead of `deckSet`'s deck. The key exists
 * only when given (standard games keep today's state, so every golden hash stays). `newGame` throws
 * `Error('illegal_deck')` if a given deck fails `checkDeck` or its identity is the other side's.
 * An empty `decks` (no side given) is dropped, so `{decks: {}}` is a standard game.
 */
export interface GameOptions {
  readonly rezWindow: 'affordable' | 'always';
  readonly deckSet: DeckSet;
  readonly decks?: Partial<Record<Side, DeckDef>>;
}

export const DEFAULT_OPTIONS: GameOptions = { rezWindow: 'affordable', deckSet: 'core45' };

/**
 * `options` with every missing field set to its default (a detached copy). Sprint 12: an unknown deck set → `'core45'`.
 * Sprint 13: `decks` is kept (copied, sides in Corp, Runner order) only when at least one side is given.
 */
export function resolveOptions(options?: Partial<GameOptions>): GameOptions {
  const deckSet = options?.deckSet;
  const out: GameOptions = {
    rezWindow: options?.rezWindow === 'always' ? 'always' : 'affordable',
    deckSet: deckSet === 'starter' || deckSet === 'core' ? deckSet : 'core45',
  };
  const given = options?.decks;
  if (typeof given !== 'object' || given === null) return out;
  const decks: Partial<Record<Side, DeckDef>> = {};
  for (const side of SIDES) {
    const d = given[side];
    if (d === undefined) continue;
    // A malformed entry is kept recognisably wrong (no cards) so `newGame` refuses it.
    const ok = typeof d === 'object' && d !== null && typeof d.identity === 'string' && Array.isArray(d.cards);
    decks[side] = ok ? { identity: d.identity, cards: [...d.cards] } : { identity: '', cards: [] };
  }
  return Object.keys(decks).length > 0 ? { ...out, decks } : out;
}

/**
 * Sprint 13: whether `newGame` deals `deck` for `side`: it passes `checkDeck` (the editor's
 * "Ready to play") and its identity is `side`'s. Exactly what `newGame` checks before dealing.
 */
export function isPlayableDeck(deck: DeckDef, side: Side): boolean {
  if (typeof deck.identity !== 'string' || !Array.isArray(deck.cards) || !deck.cards.every((id) => typeof id === 'string')) return false;
  return getCard(deck.identity)?.side === side && checkDeck(deck).length === 0;
}

/** Sprint 12: the decks of a deck set (identity null for the starter decks). */
const DECKS: Readonly<Record<DeckSet, Readonly<Record<Side, { cards: DeckList; identity: string | null }>>>> = {
  core45: { corp: CORP_CORE45_DECK, runner: RUNNER_CORE45_DECK },
  core: { corp: CORP_CORE_DECK, runner: RUNNER_CORE_DECK },
  starter: { corp: { cards: CORP_STARTER_DECK, identity: null }, runner: { cards: RUNNER_STARTER_DECK, identity: null } },
};

/** Full game state. Plain JSON: serializable and structurally clonable. */
export interface GameState {
  readonly seed: number;
  /** mulberry32 state (uint32). The only source of randomness. */
  readonly rng: number;
  /** Counts player-turns: Corp 1, Runner 2, Corp 3, ... */
  readonly turn: number;
  readonly activePlayer: Side;
  readonly phase: Phase;
  readonly result: GameResult | null;
  readonly players: Readonly<Record<Side, PlayerState>>;
  /** Corp servers: hq, rd, archives, then remotes in creation order. */
  readonly servers: readonly Server[];
  /** Runner's installed cards, in install order. */
  readonly rig: readonly Installed[];
  /** Next installed-card instance number (uid `i${nextUid}`). */
  readonly nextUid: number;
  /** Next remote server number (`remote${nextRemote}`). */
  readonly nextRemote: number;
  /** The run in progress, or null. */
  readonly run: RunState | null;
  /** Turn number in which the Runner last *started* a run (Neural EMP), or null. */
  readonly lastRunTurn: number | null;
  /** The Corp's bad publicity (0 at start). */
  readonly badPublicity: number;
  /** The open choice (`phase === 'choice'`), or null. */
  readonly choice: ChoiceState | null;
  /**
   * Sprint 5: set to `{server, cards: []}` at `run_started` (replacing the previous one),
   * a card appended at each `card_accessed`, null when the Runner's turn ends.
   */
  readonly lastRun: LastRun | null;
  /** Sprint 6: rule options given to `newGame` (defaults filled in). */
  readonly options: GameOptions;
  /** Sprint 9: turn number of the Runner's most recent successful run (set at `run_successful`), or null (SEA Source). */
  readonly lastSuccessfulRunTurn: number | null;
}

export function opponentOf(side: Side): Side {
  return side === 'corp' ? 'runner' : 'corp';
}

export function clicksPerTurn(side: Side): number {
  return side === 'corp' ? CORP_CLICKS_PER_TURN : RUNNER_CLICKS_PER_TURN;
}

export function withPlayer(state: GameState, side: Side, patch: Partial<PlayerState>): GameState {
  return { ...state, players: { ...state.players, [side]: { ...state.players[side], ...patch } } };
}

/** Agenda points of a score area. */
export function pointsOf(scoreArea: readonly string[]): number {
  return scoreArea.reduce((sum, id) => sum + (getCard(id)?.agendaPoints ?? 0), 0);
}

/** Ends the game: `winner` wins for `reason` (phase 'over', any run cleared). */
export function endGame(state: GameState, winner: Side, reason: WinReason, events: GameEvent[]): GameState {
  events.push({ type: 'game_over', winner, reason });
  return { ...state, phase: 'over', result: { winner, reason }, run: null, choice: null };
}

/** If `side` has reached WINNING_POINTS, ends the game in its favour. */
export function checkPointsWin(state: GameState, side: Side, events: GameEvent[]): GameState {
  return pointsOf(state.players[side].scoreArea) >= WINNING_POINTS ? endGame(state, side, 'agenda_points', events) : state;
}

/** Moves the top card of `side`'s deck to its hand. Caller guarantees the deck is not empty. */
export function drawTop(state: GameState, side: Side): { state: GameState; cardId: string } {
  const me = state.players[side];
  const [cardId, ...rest] = me.deck as [string, ...string[]];
  return { state: withPlayer(state, side, { deck: rest, hand: [...me.hand, cardId] }), cardId };
}

/**
 * Starts `side`'s turn number `turn`: fresh clicks, action phase, then (Sprint 7) `beforeDraw`
 * ("when your turn begins" abilities), then the Corp's mandatory draw. If the Corp must draw
 * from an empty deck, the Runner wins immediately (RULES_SPEC "Winning").
 */
export function startTurn(
  state: GameState,
  side: Side,
  turn: number,
  beforeDraw?: (s: GameState, events: GameEvent[]) => GameState,
): { state: GameState; events: GameEvent[] } {
  const clicks = clicksPerTurn(side);
  let s: GameState = withPlayer({ ...state, turn, activePlayer: side, phase: 'action' }, side, { clicks });
  const events: GameEvent[] = [{ type: 'turn_started', player: side, turn, clicks }];
  // Sprint 8: "first time each turn" counts start afresh for both sides.
  s = withPlayer(withPlayer(s, 'corp', { installedThisTurn: [] }), 'runner', { installedThisTurn: [] });
  if (beforeDraw) s = beforeDraw(s, events);
  if (side === 'corp' && s.phase !== 'over') {
    if (s.players.corp.deck.length === 0) {
      s = endGame(s, 'runner', 'corp_decked', events);
    } else {
      const drawn = drawTop(s, 'corp');
      s = drawn.state;
      events.push({ type: 'card_drawn', player: 'corp', cardId: drawn.cardId });
    }
  }
  return { state: s, events };
}

function setupPlayer(deckList: DeckList, identity: string | null, rng: number): { player: PlayerState; rng: number } {
  const shuffled = shuffle(deckList, rng);
  return {
    player: {
      deck: shuffled.items.slice(STARTING_HAND_SIZE),
      hand: shuffled.items.slice(0, STARTING_HAND_SIZE),
      discard: [],
      credits: STARTING_CREDITS,
      clicks: 0,
      scoreArea: [],
      identity,
      brainDamage: 0,
      installedThisTurn: [],
      tags: 0,
    },
    rng: shuffled.rng,
  };
}

/**
 * Creates a new game. Same seed => identical decks and opening hands.
 * Starts on turn 1, the Corp's turn, with its start-of-turn draw already
 * taken (3 clicks, 6 cards in hand); the Runner has 0 clicks.
 * `options` (Sprint 6) default to DEFAULT_OPTIONS; `rezWindow` never changes the shuffle.
 * Sprint 8: `deckSet` picks the decks (Sprint 12 default `'core45'`: 45 cards each plus identities).
 * Sprint 13: a side in `decks` is dealt that list (in its given order) instead; throws
 * `Error('illegal_deck')` if it is not `isPlayableDeck` (the game refuses what the editor refuses).
 */
export function newGame(seed: number, options?: Partial<GameOptions>): GameState {
  const opts = resolveOptions(options);
  const rng0 = seedToRng(seed);
  const decks = { ...DECKS[opts.deckSet] };
  for (const side of SIDES) {
    const custom = opts.decks?.[side];
    if (custom === undefined) continue;
    if (!isPlayableDeck(custom, side)) throw new Error('illegal_deck');
    decks[side] = custom;
  }
  const corp = setupPlayer(decks.corp.cards, decks.corp.identity, rng0);
  const runner = setupPlayer(decks.runner.cards, decks.runner.identity, corp.rng);
  const base: GameState = {
    seed: rng0,
    rng: runner.rng,
    turn: 0,
    activePlayer: 'corp',
    phase: 'action',
    result: null,
    players: { corp: corp.player, runner: runner.player },
    servers: CENTRAL_SERVERS.map((id) => ({ id, ice: [], content: [] })),
    rig: [],
    nextUid: 1,
    nextRemote: 1,
    run: null,
    lastRunTurn: null,
    badPublicity: 0,
    choice: null,
    lastRun: null,
    options: opts,
    lastSuccessfulRunTurn: null,
  };
  return startTurn(base, 'corp', 1).state;
}
