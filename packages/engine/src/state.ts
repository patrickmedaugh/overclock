import { CORP_STARTER_DECK, RUNNER_STARTER_DECK, getCard, type Side } from '@overclock/cards';
import type { GameEvent } from './events';
import { seedToRng, shuffle } from './rng';

export type { Side };

export const SIDES: readonly Side[] = ['corp', 'runner'];

export const STARTING_CREDITS = 5;
export const STARTING_HAND_SIZE = 5;
export const MAX_HAND_SIZE = 5;
export const RUNNER_CLICKS_PER_TURN = 4;
export const CORP_CLICKS_PER_TURN = 3;
/** The Runner's memory limit for programs. */
export const BASE_MEMORY = 4;

/** 'action': spend clicks / end turn. 'discard': hand-limit step. 'over': game finished. */
export type Phase = 'action' | 'discard' | 'over';
export type WinReason = 'corp_decked';

export interface GameResult {
  readonly winner: Side;
  readonly reason: WinReason;
}

/** The three central servers, then remotes (`remote-1`, `remote-2`, ...; numbers never reused). */
export type CentralServerId = 'hq' | 'rd' | 'archives';
export type RemoteServerId = `remote-${number}`;
export type ServerId = CentralServerId | RemoteServerId;

export const CENTRAL_SERVERS: readonly CentralServerId[] = ['hq', 'rd', 'archives'];

/** A card on the table. The uid ("i<n>") is given at install time, never at the deal. */
export interface Installed {
  readonly uid: string;
  readonly cardId: string;
  /** Rezzing comes in a later sprint: every installed Corp card is unrezzed (face down). */
  readonly rezzed: false;
}

export interface ServerState {
  readonly id: ServerId;
  /** ICE protecting the server: index 0 innermost, last entry outermost. */
  readonly ice: readonly Installed[];
  /**
   * Cards installed in the server. Remote: at most one agenda/asset plus any
   * upgrades. Central: upgrades only (HQ/R&D/Archives contents stay in hand/deck/discard).
   */
  readonly root: readonly Installed[];
}

export interface Rig {
  readonly program: readonly Installed[];
  readonly hardware: readonly Installed[];
  readonly resource: readonly Installed[];
}

/** A discard pile card. Face-down entries (Corp hand-limit discards) are hidden from the Runner. */
export interface DiscardEntry {
  readonly cardId: string;
  readonly faceUp: boolean;
}

/** One player's zones and counters. Card entries are card definition ids. */
export interface PlayerState {
  /** Top of deck is index 0. */
  readonly deck: readonly string[];
  readonly hand: readonly string[];
  /** Discard pile (Runner: Heap; Corp: Archives). Bottom is index 0. */
  readonly discard: readonly DiscardEntry[];
  readonly credits: number;
  readonly clicks: number;
}

export interface CorpState extends PlayerState {
  /** hq, rd, archives, then remotes in creation order. */
  readonly servers: readonly ServerState[];
}

export interface RunnerState extends PlayerState {
  readonly rig: Rig;
}

export interface Players {
  readonly corp: CorpState;
  readonly runner: RunnerState;
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
  /** Next installed-card uid number ("i<n>"). Starts at 1. */
  readonly nextUid: number;
  /** Next remote server number. Starts at 1; never reused. */
  readonly nextRemote: number;
  readonly players: Players;
}

export function opponentOf(side: Side): Side {
  return side === 'corp' ? 'runner' : 'corp';
}

export function clicksPerTurn(side: Side): number {
  return side === 'corp' ? CORP_CLICKS_PER_TURN : RUNNER_CLICKS_PER_TURN;
}

export function withPlayer(state: GameState, side: Side, patch: Partial<PlayerState>): GameState {
  const players: Players =
    side === 'corp'
      ? { ...state.players, corp: { ...state.players.corp, ...patch } }
      : { ...state.players, runner: { ...state.players.runner, ...patch } };
  return { ...state, players };
}

export function withCorp(state: GameState, patch: Partial<CorpState>): GameState {
  return { ...state, players: { ...state.players, corp: { ...state.players.corp, ...patch } } };
}

export function withRunner(state: GameState, patch: Partial<RunnerState>): GameState {
  return { ...state, players: { ...state.players, runner: { ...state.players.runner, ...patch } } };
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
    nextUid: 1,
    nextRemote: 1,
    players: {
      corp: { ...corp.player, servers: CENTRAL_SERVERS.map((id) => ({ id, ice: [], root: [] })) },
      runner: { ...runner.player, rig: { program: [], hardware: [], resource: [] } },
    },
  };
  return startTurn(base, 'corp', 1).state;
}

/** Memory used by the Runner's installed programs. */
export function memoryUsed(state: GameState): number {
  return state.players.runner.rig.program.reduce((sum, p) => sum + (getCard(p.cardId)?.memory ?? 0), 0);
}
