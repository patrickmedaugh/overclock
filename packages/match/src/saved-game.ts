/**
 * Sprint 11 (S-11-3): a saved pass-the-phone game. Plain JSON, rebuilt by replay
 * (`LocalMatch.load`): the seed, the options the game was created with, and every
 * **accepted** action in order. No game state is stored, so a save never depends on
 * the shape of `GameState`, only on the rules (`RULES_VERSION`).
 *
 * Rule for contributors: any engine or card-data change that can change the result of
 * replaying a saved action list must bump `RULES_VERSION` (the golden save fixture in
 * `test/saved-game.test.ts` fails CI otherwise).
 */
import type { Action, GameOptions, Side } from '@overclock/engine';

/** The save layout version. Bump it only if the JSON layout below changes. */
export const SAVE_FORMAT = 1;

export interface SavedGame {
  readonly format: typeof SAVE_FORMAT;
  /** The engine's `RULES_VERSION` the game was played under. */
  readonly rulesVersion: number;
  readonly seed: number;
  /** The options the game was created with (defaults filled in). */
  readonly options: GameOptions;
  /** Every accepted action, in order. */
  readonly actions: readonly Action[];
}

/**
 * Why a save can't be continued:
 * - `broken`: not a save (bad JSON, wrong shape, or replay crashed).
 * - `outdated`: made under other rules (`rulesVersion` differs, a newer `format`, or an action
 *   the current rules refuse on replay). Owner Q3 A: show a plain note, start a new game.
 * - `finished`: the replayed game is over (never offered as Continue).
 */
export type LoadFailure = 'broken' | 'outdated' | 'finished';

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isSide = (x: unknown): x is Side => x === 'corp' || x === 'runner';
const isUint32 = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 0xffffffff;
/** Shape only: an object with a string `type` and a side `player` (the engine checks the rest on replay). */
const isAction = (x: unknown): x is Action => isObj(x) && typeof x.type === 'string' && isSide(x.player);
const isOptions = (x: unknown): x is GameOptions =>
  isObj(x) &&
  (x.rezWindow === 'affordable' || x.rezWindow === 'always') &&
  (x.deckSet === 'core45' || x.deckSet === 'core' || x.deckSet === 'starter'); // Sprint 12: + 'core45'

/**
 * Checks the JSON shape of a save (`x` may be the parsed object or the raw JSON string).
 * Returns a detached copy, or why it can't be used. Replay checks are `LocalMatch.load`'s job.
 */
export function parseSavedGame(x: unknown): SavedGame | 'broken' | 'outdated' {
  let data = x;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      return 'broken';
    }
  }
  if (!isObj(data)) return 'broken';
  // A save from a newer build's layout: not ours to read, but it was a real save.
  if (typeof data.format === 'number' && Number.isInteger(data.format) && data.format > SAVE_FORMAT) return 'outdated';
  if (data.format !== SAVE_FORMAT) return 'broken';
  if (typeof data.rulesVersion !== 'number' || !Number.isInteger(data.rulesVersion)) return 'broken';
  if (!isUint32(data.seed) || !isOptions(data.options)) return 'broken';
  if (!Array.isArray(data.actions) || !data.actions.every(isAction)) return 'broken';
  try {
    return JSON.parse(
      JSON.stringify({
        format: SAVE_FORMAT,
        rulesVersion: data.rulesVersion,
        seed: data.seed,
        options: { rezWindow: data.options.rezWindow, deckSet: data.options.deckSet },
        actions: data.actions,
      }),
    ) as SavedGame;
  } catch {
    return 'broken';
  }
}
