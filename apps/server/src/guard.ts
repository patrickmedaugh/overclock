/**
 * Sprint 14 (S-14-2 AC6): the wrong-guess guard, pure (clock injected). One guard per caller,
 * keyed by a SHA-256 of the caller's IP (`guardKey`; the raw IP is never stored). The Durable
 * Object `GuessGuard` (do.ts) keeps one `GuardState` and calls these functions.
 *
 * - Every `sync` is an **attempt**: it is counted as a wrong code *before* the locker answers
 *   (atomic in the guard, so many guesses sent at once can't slip past the limit) and the count
 *   is reset by `right` when the code turned out to be right.
 * - 5 wrong codes in a row are free; the 5th starts a wait of 60 s, each further wrong code
 *   doubles it, up to 1 hour. While waiting, every attempt is refused before the locker is asked
 *   (so a waiting caller learns nothing).
 * - New lockers (`new`): at most 10 per hour per caller.
 * - A guard untouched for a day forgets everything (and the DO deletes its storage).
 */
import { sha256Hex } from './hash';

export const GUARD_FREE_WRONG = 5;
export const GUARD_BASE_WAIT_MS = 60_000;
export const GUARD_MAX_WAIT_MS = 60 * 60_000;
export const GUARD_NEW_PER_HOUR = 10;
export const GUARD_NEW_WINDOW_MS = 60 * 60_000;
/** After this long without a call, the guard starts fresh. */
export const GUARD_FORGET_MS = 24 * 60 * 60_000;

export interface GuardState {
  /** Wrong codes in a row (an attempt counts until `right` resets it). */
  readonly wrong: number;
  /** ms since epoch; attempts before this are refused. 0 = none. */
  readonly lockedUntil: number;
  /** Times of recent `new` calls (within the last hour). */
  readonly news: readonly number[];
  /** Last call (for forgetting). */
  readonly seenAt: number;
}

export const FRESH_GUARD: GuardState = { wrong: 0, lockedUntil: 0, news: [], seenAt: 0 };

export type GuardAnswer = { readonly ok: true; readonly state: GuardState } | { readonly ok: false; readonly state: GuardState; readonly retryAfterMs: number };

/** The guard's key for a caller: never the raw IP. */
export function guardKey(ip: string): string {
  return sha256Hex(`overclock-guess-guard:${ip}`);
}

/** How long to wait after the `wrong`-th wrong code in a row (0 = free). */
export function waitAfter(wrong: number): number {
  if (wrong < GUARD_FREE_WRONG) return 0;
  const n = wrong - GUARD_FREE_WRONG;
  return n >= 6 ? GUARD_MAX_WAIT_MS : Math.min(GUARD_MAX_WAIT_MS, GUARD_BASE_WAIT_MS * 2 ** n);
}

function current(s: GuardState | undefined, now: number): GuardState {
  if (!s || now - s.seenAt > GUARD_FORGET_MS) return FRESH_GUARD;
  return s;
}

/** A `sync` is about to ask a locker: refuse while waiting, else count it as wrong until `right`. */
export function attempt(prev: GuardState | undefined, now: number): GuardAnswer {
  const s = current(prev, now);
  if (s.lockedUntil > now) return { ok: false, state: { ...s, seenAt: now }, retryAfterMs: s.lockedUntil - now };
  const wrong = s.wrong + 1;
  const wait = waitAfter(wrong);
  return { ok: true, state: { ...s, wrong, lockedUntil: wait > 0 ? now + wait : 0, seenAt: now } };
}

/** The code was right: the wrong count and any wait are cleared. */
export function right(prev: GuardState | undefined, now: number): GuardState {
  const s = current(prev, now);
  return { ...s, wrong: 0, lockedUntil: 0, seenAt: now };
}

/** A `new` locker: at most GUARD_NEW_PER_HOUR per hour. */
export function newLocker(prev: GuardState | undefined, now: number): GuardAnswer {
  const s = current(prev, now);
  const news = s.news.filter((t) => now - t < GUARD_NEW_WINDOW_MS);
  if (news.length >= GUARD_NEW_PER_HOUR) {
    return { ok: false, state: { ...s, news, seenAt: now }, retryAfterMs: news[0]! + GUARD_NEW_WINDOW_MS - now };
  }
  return { ok: true, state: { ...s, news: [...news, now], seenAt: now } };
}
