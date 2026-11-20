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
import { isPlayableDeck, type Action, type GameOptions, type Side } from '@overclock/engine';
import type { DeckDef } from '@overclock/cards';

/**
 * The save layout version. Bump it only if the JSON layout below changes.
 * Sprint 13: 1 → 2 (`options.decks` may hold the dealt deck lists). Format-1 saves still load
 * (read as format 2 without `decks`); an older build reading a format-2 save calls it `outdated`.
 */
export const SAVE_FORMAT = 2;

/** Sprint 13: the oldest save layout this build still reads. */
const OLDEST_SAVE_FORMAT = 1;

/** Sprint 13: most cards a saved deck list may hold (a sanity cap; real decks are ~45–50). */
export const MAX_SAVED_DECK_CARDS = 200;

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
 * Sprint 13: a save's `options.decks` as a detached copy holding only the given sides, `undefined`
 * when absent or no side is given, or `'broken'`: a bad shape (identity string, at most
 * MAX_SAVED_DECK_CARDS string ids), or a deck the game would refuse (`isPlayableDeck`, i.e.
 * `checkDeck` plus the identity's side).
 */
function parseDecks(x: unknown): Partial<Record<Side, DeckDef>> | undefined | 'broken' {
  if (x === undefined) return undefined;
  if (!isObj(x)) return 'broken';
  const out: Partial<Record<Side, DeckDef>> = {};
  for (const side of ['corp', 'runner'] as const) {
    const d = x[side];
    if (d === undefined) continue;
    if (!isObj(d) || typeof d.identity !== 'string' || !Array.isArray(d.cards) || d.cards.length > MAX_SAVED_DECK_CARDS) return 'broken';
    if (!d.cards.every((id): id is string => typeof id === 'string')) return 'broken';
    const deck: DeckDef = { identity: d.identity, cards: [...d.cards] };
    if (!isPlayableDeck(deck, side)) return 'broken';
    out[side] = deck;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Checks the JSON shape of a save (`x` may be the parsed object or the raw JSON string).
 * Returns a detached copy, or why it can't be used. Replay checks are `LocalMatch.load`'s job.
 * Sprint 13: reads formats 1 and 2 and always returns the current format (a format-1 save is a
 * format-2 save without `decks`); saved deck lists must be playable, else `broken`.
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
  if (typeof data.format !== 'number' || !Number.isInteger(data.format) || data.format < OLDEST_SAVE_FORMAT) return 'broken';
  if (typeof data.rulesVersion !== 'number' || !Number.isInteger(data.rulesVersion)) return 'broken';
  if (!isUint32(data.seed) || !isOptions(data.options)) return 'broken';
  if (!Array.isArray(data.actions) || !data.actions.every(isAction)) return 'broken';
  // Sprint 13: only format 2 has deck lists (a format-1 save never had any; any such field is ignored, as Sprint 12 did).
  const decks = data.format >= 2 ? parseDecks(data.options.decks) : undefined;
  if (decks === 'broken') return 'broken';
  const options: GameOptions = { rezWindow: data.options.rezWindow, deckSet: data.options.deckSet, ...(decks ? { decks } : {}) };
  try {
    return JSON.parse(
      JSON.stringify({
        format: SAVE_FORMAT,
        rulesVersion: data.rulesVersion,
        seed: data.seed,
        options,
        actions: data.actions,
      }),
    ) as SavedGame;
  } catch {
    return 'broken';
  }
}
