import { CORP_STARTER_DECK, RUNNER_STARTER_DECK, type CentralServerId, type ServerId, type Side } from '@overclock/cards';
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

/** 'action': spend clicks / end turn. 'discard': hand-limit step. 'run': a run is in progress. 'over': game finished. */
export type Phase = 'action' | 'discard' | 'run' | 'over';
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
}

export interface GameResult {
  readonly winner: Side;
  readonly reason: WinReason;
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
      const result: GameResult = { winner: 'runner', reason: 'corp_decked' };
      s = { ...s, phase: 'over', result };
      events.push({ type: 'game_over', winner: result.winner, reason: result.reason });
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
 */
export function newGame(seed: number): GameState {
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
  };
  return startTurn(base, 'corp', 1).state;
}
