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
import type { Action, GameEvent, PlayerView, Side } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';
import { type Decision, Listeners, type Presentation, type Session, type SessionStatus } from './session';

export type { Decision, Presentation } from './session';

export class HotSeat implements Session {
  readonly kind = 'hotseat' as const;
  private readonly match: LocalMatch;
  private bottom: Side;
  private last: GameEvent[] = [];
  private readonly presented = new Listeners<Presentation>();

  constructor(seed: number) {
    this.match = new LocalMatch(seed);
    this.bottom = this.match.view('corp').activePlayer;
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
    const waiting = this.match.view(this.bottom).run?.waitingOn;
    if (!waiting || waiting === this.bottom) return null;
    const run = this.match.view(waiting).run;
    return run ? { seat: waiting, run } : null;
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
    if (next === shown || endIdx < 0) {
      // The other seat acted (the Corp's rez decision mid-run, or the test hook):
      // the bottom seat's own projection animates, plus the actor's rejection hint
      // (rejections go to the submitting seat only).
      const events = actor === shown ? mine.events : [...update[shown].events, ...mine.events.filter((e) => e.type === 'action_rejected')];
      return { kind: 'same', view: update[shown].view, events, decision: this.decision() };
    }
    this.bottom = next;
    const theirs = update[next].events;
    const theirEnd = theirs.findIndex((e) => e.type === 'turn_ended');
    return {
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
