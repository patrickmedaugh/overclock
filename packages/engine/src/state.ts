import { CORP_STARTER_DECK, RUNNER_STARTER_DECK, type Side } from '@overclock/cards';
import { seedToRng, shuffle } from './rng';

export type { Side };

export const SIDES: readonly Side[] = ['corp', 'runner'];

export const STARTING_CREDITS = 5;
export const STARTING_HAND_SIZE = 5;
export const RUNNER_CLICKS_PER_TURN = 4;
export const CORP_CLICKS_PER_TURN = 3;

/** One player's zones and counters. Card entries are card definition ids. */
export interface PlayerState {
  /** Top of deck is index 0. */
  readonly deck: readonly string[];
  readonly hand: readonly string[];
  readonly credits: number;
  readonly clicks: number;
}

/** Full game state. Plain JSON: serializable and structurally clonable. */
export interface GameState {
  readonly seed: number;
  /** mulberry32 state (uint32). The only source of randomness. */
  readonly rng: number;
  readonly turn: number;
  readonly activePlayer: Side;
  readonly players: { readonly corp: PlayerState; readonly runner: PlayerState };
}

function setupPlayer(deckList: readonly string[], rng: number): { player: PlayerState; rng: number } {
  const shuffled = shuffle(deckList, rng);
  return {
    player: {
      deck: shuffled.items.slice(STARTING_HAND_SIZE),
      hand: shuffled.items.slice(0, STARTING_HAND_SIZE),
      credits: STARTING_CREDITS,
      clicks: 0,
    },
    rng: shuffled.rng,
  };
}

/**
 * Creates a new game. Same seed => identical decks and opening hands.
 * Sprint 0: starts on the Runner's turn with 4 clicks (see DECISIONS.md).
 */
export function newGame(seed: number): GameState {
  const rng0 = seedToRng(seed);
  const corp = setupPlayer(CORP_STARTER_DECK, rng0);
  const runner = setupPlayer(RUNNER_STARTER_DECK, corp.rng);
  return {
    seed: rng0,
    rng: runner.rng,
    turn: 1,
    activePlayer: 'runner',
    players: {
      corp: corp.player,
      runner: { ...runner.player, clicks: RUNNER_CLICKS_PER_TURN },
    },
  };
}
