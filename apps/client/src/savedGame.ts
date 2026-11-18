// Sprint 11 (S-11-3, U2): the pass-the-phone save on this device. One slot in
// localStorage (`overclock.hotseat.v1`) holding `LocalMatch.save()` output: the
// seed, the options and the accepted moves. The game is rebuilt by replaying
// them (`LocalMatch.load`), so no rules live here. Every storage call is
// wrapped: private browsing, a full disk or a blocked storage never stops a game.
import type { Side } from '@overclock/engine';
import { LocalMatch, type SavedGame } from '@overclock/match';
import type { StoreLike } from './online';

export const HOTSEAT_KEY = 'overclock.hotseat.v1';

/** What the start screen can offer for the saved pass-the-phone game. */
export type HotSeatSave =
  | { kind: 'none' }
  /** A game to continue: `turn` is whose turn it is (the start screen's small line). */
  | { kind: 'ready'; match: LocalMatch; turn: Side }
  /** Saved under other rules (owner Q3 A): Continue shows a plain note and the save is dropped. */
  | { kind: 'outdated' };

/**
 * Reads the saved pass-the-phone game. A broken or finished save is deleted and
 * never offered (a finished game has no Continue).
 */
export function readHotSeatSave(storage: StoreLike | null): HotSeatSave {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(HOTSEAT_KEY) ?? null;
  } catch {
    return { kind: 'none' };
  }
  if (raw === null) return { kind: 'none' };
  const r = LocalMatch.load(raw);
  if (r.ok) return { kind: 'ready', match: r.match, turn: r.match.view('corp').activePlayer };
  if (r.reason === 'outdated') return { kind: 'outdated' };
  forgetHotSeatSave(storage);
  return { kind: 'none' };
}

/** Stores `saved` (one slot: it replaces any older save). False if storage refused it. */
export function writeHotSeatSave(storage: StoreLike | null, saved: SavedGame): boolean {
  if (!storage) return false;
  try {
    storage.setItem(HOTSEAT_KEY, JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
}

export function forgetHotSeatSave(storage: StoreLike | null): void {
  try {
    storage?.removeItem(HOTSEAT_KEY);
  } catch {
    // storage unavailable: nothing to forget
  }
}

/** The game being saved: its save, and whether it is over (then the save is deleted instead). */
export interface Saveable {
  save(): SavedGame;
  over(): boolean;
}

/**
 * Writes the save after a move, off the tap path: `mark()` only notes the game;
 * the write runs on the next macrotask (after the move's presentation and its
 * first frame were queued). Several moves in one task write once. `flush()` writes
 * now (the page is being hidden or closed).
 */
export class SaveWriter {
  private pending: Saveable | null = null;
  private timer: unknown = null;
  /** Writes done (test hook / unit tests). */
  writes = 0;

  constructor(
    private readonly storage: StoreLike | null,
    private readonly schedule: (fn: () => void) => unknown = (fn) => setTimeout(fn, 0),
  ) {}

  mark(game: Saveable): void {
    this.pending = game;
    if (this.timer === null) this.timer = this.schedule(() => this.flush());
  }

  flush(): void {
    this.timer = null;
    const game = this.pending;
    this.pending = null;
    if (!game) return;
    this.writes++;
    try {
      if (game.over()) forgetHotSeatSave(this.storage);
      else writeHotSeatSave(this.storage, game.save());
    } catch {
      // never let a save break the game
    }
  }
}
