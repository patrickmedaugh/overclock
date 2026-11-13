import { CORP_STARTER_DECK, RUNNER_STARTER_DECK, getCard, type CentralServerId, type ServerId, type Side } from '@overclock/cards';
import type { GameEvent } from './events';
import { seedToRng, shuffle } from './rng';

export type { CentralServerId, ServerId, Side };

export const SIDES: readonly Side[] = ['corp', 'runner'];

export const STARTING_CREDITS = 5;
export const STARTING_HAND_SIZE = 5;
export const MAX_HAND_SIZE = 5;
export const RUNNER_CLICKS_PER_TURN = 4;
export const CORP_CLICKS_PER_TURN = 3;
/** Runner memory limit (programs' `memory` must fit). Memory bonuses from cards are not built yet. */
export const MEMORY_LIMIT = 4;
/** Agenda points that win the game at once (stolen or scored). */
export const WINNING_POINTS = 7;

export const CENTRAL_SERVERS: readonly CentralServerId[] = ['hq', 'rd', 'archives'];

/** An installed card. `uid` is per instance ("i1", "i2", ...); `cardId` is the definition id. */
export interface Installed {
  readonly uid: string;
  readonly cardId: string;
  /** Corp cards: true once rezzed (face up for good). Runner cards are always face up (false here). */
  readonly rezzed: boolean;
  /** Advancement counters (Corp agendas; 0 otherwise). Public to both players. */
  readonly advancements: number;
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
 * `access`: the run was successful; the Runner deals with accessed cards.
 */
export type RunStep = 'approach' | 'encounter' | 'continue' | 'access';

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
}

/** What a choice is about. `free_rez`: Priority Requisition, rez one unrezzed installed ICE for free, or Skip. */
export type ChoiceKind = 'free_rez';

/** An open choice (`phase === 'choice'`): `player` must decide before anything else happens. */
export interface ChoiceState {
  readonly kind: ChoiceKind;
  readonly player: Side;
  /** The card whose effect opened it (the scored agenda). */
  readonly cardId: string;
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
}

/**
 * Sprint 6: per-game rule options, fixed at `newGame` and stored in the state.
 * `rezWindow`: when the approach of an unrezzed ICE waits on the Corp.
 * - `'affordable'` (default, hot-seat): only when the Corp can pay the rez cost; otherwise the ICE is passed face down at once.
 * - `'always'` (online): always, so the Runner cannot tell an unaffordable ICE from a cheap one;
 *   `rez` is then rejected `no_credits` when unaffordable and the Corp's only legal move is `pass`.
 */
export interface GameOptions {
  readonly rezWindow: 'affordable' | 'always';
}

export const DEFAULT_OPTIONS: GameOptions = { rezWindow: 'affordable' };

/** `options` with every missing field set to its default (a detached copy). */
export function resolveOptions(options?: Partial<GameOptions>): GameOptions {
  return { rezWindow: options?.rezWindow === 'always' ? 'always' : 'affordable' };
}

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
 * Starts `side`'s turn number `turn`: fresh clicks, action phase, then the
 * Corp's mandatory draw. If the Corp must draw from an empty deck, the Runner
 * wins immediately (RULES_SPEC "Winning").
 */
export function startTurn(state: GameState, side: Side, turn: number): { state: GameState; events: GameEvent[] } {
  const clicks = clicksPerTurn(side);
  let s: GameState = withPlayer({ ...state, turn, activePlayer: side, phase: 'action' }, side, { clicks });
  const events: GameEvent[] = [{ type: 'turn_started', player: side, turn, clicks }];
  if (side === 'corp') {
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

function setupPlayer(deckList: readonly string[], rng: number): { player: PlayerState; rng: number } {
  const shuffled = shuffle(deckList, rng);
  return {
    player: {
      deck: shuffled.items.slice(STARTING_HAND_SIZE),
      hand: shuffled.items.slice(0, STARTING_HAND_SIZE),
      discard: [],
      credits: STARTING_CREDITS,
      clicks: 0,
      scoreArea: [],
    },
    rng: shuffled.rng,
  };
}

/**
 * Creates a new game. Same seed => identical decks and opening hands.
 * Starts on turn 1, the Corp's turn, with its start-of-turn draw already
 * taken (3 clicks, 6 cards in hand); the Runner has 0 clicks.
 * `options` (Sprint 6) default to DEFAULT_OPTIONS; they never change the shuffle.
 */
export function newGame(seed: number, options?: Partial<GameOptions>): GameState {
  const rng0 = seedToRng(seed);
  const corp = setupPlayer(CORP_STARTER_DECK, rng0);
  const runner = setupPlayer(RUNNER_STARTER_DECK, corp.rng);
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
    options: resolveOptions(options),
  };
  return startTurn(base, 'corp', 1).state;
}
