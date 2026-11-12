import { CORP_STARTER_DECK, RUNNER_STARTER_DECK, type Side } from '@overclock/cards';
import type { GameEvent } from './events';
import { seedToRng, shuffle } from './rng';

export type { Side };

export const SIDES: readonly Side[] = ['corp', 'runner'];

export const STARTING_CREDITS = 5;
export const STARTING_HAND_SIZE = 5;
export const MAX_HAND_SIZE = 5;
export const RUNNER_CLICKS_PER_TURN = 4;
export const CORP_CLICKS_PER_TURN = 3;
/** Runner memory limit (programs' `memory` must fit). Memory bonuses from cards are not built yet. */
export const MEMORY_LIMIT = 4;

/** Central servers, then remotes `remote1`, `remote2`, ... (numbers never reused). */
export type CentralServerId = 'hq' | 'rd' | 'archives';
export type ServerId = CentralServerId | `remote${number}`;
export const CENTRAL_SERVERS: readonly CentralServerId[] = ['hq', 'rd', 'archives'];

/** An installed card. `uid` is per instance ("i1", "i2", ...); `cardId` is the definition id. */
export interface Installed {
  readonly uid: string;
  readonly cardId: string;
  /** Always false in Sprint 2 (rezzing comes with runs). Runner cards are always face up. */
  readonly rezzed: boolean;
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

/** 'action': spend clicks / end turn. 'discard': hand-limit step. 'over': game finished. */
export type Phase = 'action' | 'discard' | 'over';
export type WinReason = 'corp_decked';

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
  };
  return startTurn(base, 'corp', 1).state;
}
