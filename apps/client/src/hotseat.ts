// Hot-seat on one device (owner answer 1B): the client stands in for two
// networked clients. It submits every action through the match host as the
// acting seat and always shows the active player's seat at the bottom. No
// rules here: who is active comes from the projected view, and events are
// only split for presentation (what the actor sees leave, then the flip).
//
// During a run the Runner stays at the bottom. When the run waits on the Corp
// (Rez / Don't rez at approach), the board shows the Corp seat's own run
// options (`Decision`) on the shared screen (owner answer Q1 A) and submits
// them as the Corp. The Runner seat's view is never merged with the Corp's.
//
// Sprint 11 (S-11-3): after every accepted move `onSaved` listeners hear of it
// (after the presentation went out), so the client can store `save()`; a saved
// game comes back with `HotSeat.restore(match)` (`LocalMatch.load`).
import type { Action, GameEvent, GameOptions, PlayerView, Side } from '@overclock/engine';
import { LocalMatch, type SavedGame } from '@overclock/match';
import { type Decision, Listeners, type Presentation, type Session, type SessionStatus } from './session';

export type { Decision, Presentation } from './session';

export class HotSeat implements Session {
  readonly kind = 'hotseat' as const;
  private readonly match: LocalMatch;
  private bottom: Side;
  private last: GameEvent[] = [];
  private readonly presented = new Listeners<Presentation>();
  private readonly saved = new Listeners<HotSeat>();
  /** Sprint 15: the waiting seat's projection of the active seat's moves this turn (for `missedEvents`). */
  private missed: GameEvent[] = [];

  /** Sprint 8: `options` (e.g. `{deckSet: 'starter'}` for legacy test boards) go to the match; default = core decks. */
  constructor(seed: number, options?: Partial<GameOptions>);
  /** Sprint 11: plays on an existing match (a restored save). */
  constructor(match: LocalMatch);
  constructor(seedOrMatch: number | LocalMatch, options?: Partial<GameOptions>) {
    this.match = typeof seedOrMatch === 'number' ? new LocalMatch(seedOrMatch, options) : seedOrMatch;
    // The active player sits at the bottom (during a run: the Runner; the Corp's decision shows as `decision()`).
    this.bottom = this.match.view('corp').activePlayer;
  }

  /** Sprint 11 (S-11-3): a saved game, loaded with `LocalMatch.load`. The bottom seat is the active player. */
  static restore(match: LocalMatch): HotSeat {
    return new HotSeat(match);
  }

  /** The seat that must act now: the other seat's decision if the game waits on it, else the bottom seat. */
  get toAct(): Side {
    return this.decision()?.seat ?? this.bottom;
  }

  /** Sprint 11: this game as a save (accepted moves only). */
  save(): SavedGame {
    return this.match.save();
  }

  /** True once the game has a result (its save is deleted, never offered as Continue). */
  over(): boolean {
    return this.match.view(this.bottom).result !== null;
  }

  /** Called after every accepted move, once its presentation went out (store `save()` then). */
  onSaved(cb: (game: HotSeat) => void): () => void {
    return this.saved.add(cb);
  }

  /** The seat drawn at the bottom (the active player). */
  get seat(): Side {
    return this.bottom;
  }

  view(): PlayerView {
    return this.match.view(this.bottom);
  }

  /**
   * The run decision of the seat that is not at the bottom, if the game waits on
   * it (the Corp's Rez / Don't rez during the Runner's run); otherwise null.
   */
  decision(): Decision | null {
    const mine = this.match.view(this.bottom);
    // Sprint 9: outside a run, a choice may wait on the other seat (SEA Source: the Runner's trace bid).
    const waiting = mine.run ? mine.run.waitingOn : (mine.choice?.waitingOn ?? null);
    if (!waiting || waiting === this.bottom) return null;
    const theirs = this.match.view(waiting);
    if (mine.run) return theirs.run ? { seat: waiting, run: theirs.run, choice: theirs.choice } : null;
    return theirs.choice ? { seat: waiting, run: null, choice: theirs.choice } : null;
  }

  /** The events of the last submit, as the submitting seat saw them. */
  lastEvents(): GameEvent[] {
    return this.last.slice();
  }

  onPresent(cb: (p: Presentation) => void): () => void {
    return this.presented.add(cb);
  }

  status(): SessionStatus {
    return { connection: 'local', opponent: 'here' };
  }

  /**
   * Submits as seat `action.player` (each seat may only act as itself). The
   * presentation goes to `onPresent` listeners at once and is also returned.
   */
  submit(action: Action): Presentation {
    const p = this.present(action);
    this.presented.emit(p);
    // Refused moves change nothing (and are never logged), so only accepted ones save.
    if (!this.last.some((e) => e.type === 'action_rejected')) this.saved.emit(this);
    return p;
  }

  private present(action: Action): Presentation {
    const actor = action.player;
    const update = this.match.submit(actor, action);
    const mine = update[actor];
    this.last = mine.events.slice();
    const shown = this.bottom;
    const next = update[shown].view.activePlayer;
    const endIdx = mine.events.findIndex((e) => e.type === 'turn_ended');
    const waiting: Side = shown === 'corp' ? 'runner' : 'corp';
    if (next === shown || endIdx < 0) {
      // Refused moves change nothing.
      if (!mine.events.some((e) => e.type === 'action_rejected')) this.missed.push(...update[waiting].events);
      // The other seat acted (the Corp's rez decision mid-run, or the test hook):
      // the bottom seat's own projection animates, plus the actor's rejection hint
      // (rejections go to the submitting seat only).
      const events = actor === shown ? mine.events : [...update[shown].events, ...mine.events.filter((e) => e.type === 'action_rejected')];
      return { kind: 'same', view: update[shown].view, events, decision: this.decision() };
    }
    this.bottom = next;
    const theirs = update[next].events;
    const theirEnd = theirs.findIndex((e) => e.type === 'turn_ended');
    const missedEvents = [...this.missed, ...theirs.slice(0, theirEnd + 1)];
    this.missed = [];
    return {
      missedEvents,
      kind: 'handoff',
      actor,
      actorView: mine.view,
      actorEvents: mine.events.slice(0, endIdx + 1),
      next,
      nextView: update[next].view,
      nextEvents: theirs.slice(theirEnd + 1),
    };
  }
}

/** `?seed=123` pins the deal (tests, bug reports); otherwise a fresh random one. */
export function seedFromUrl(search: string): number {
  const raw = new URLSearchParams(search).get('seed');
  const n = raw === null ? NaN : Number(raw);
  if (Number.isFinite(n)) return Math.trunc(n) >>> 0;
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
