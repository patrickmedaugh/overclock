// Hot-seat on one device (owner answer 1B): the client stands in for two
// networked clients. It submits every action through the match host as the
// acting seat and always shows the active player's seat at the bottom. No
// rules here: who is active comes from the projected view, and events are
// only split for presentation (what the actor sees leave, then the flip).
import type { Action, GameEvent, PlayerView, Side } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';

/** What the board should animate for one submitted action. */
export type Presentation =
  /** Same seat stays at the bottom: show `view` and animate `events`. */
  | { kind: 'same'; view: PlayerView; events: GameEvent[] }
  /**
   * The turn passed. First the actor's own events up to and including
   * `turn_ended` animate in the actor's view (e.g. their discards fly to the
   * pile); then the board flips to `next` and animates `nextEvents` (the new
   * turn's start, e.g. the Corp's free draw) in the new seat's view.
   */
  | {
      kind: 'handoff';
      actor: Side;
      actorView: PlayerView;
      actorEvents: GameEvent[];
      next: Side;
      nextView: PlayerView;
      nextEvents: GameEvent[];
    };

export class HotSeat {
  private readonly match: LocalMatch;
  private bottom: Side;
  private last: GameEvent[] = [];

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

  /** The events of the last submit, as the submitting seat saw them. */
  lastEvents(): GameEvent[] {
    return this.last.slice();
  }

  /** Submits as seat `action.player` (each seat may only act as itself). */
  submit(action: Action): Presentation {
    const actor = action.player;
    const update = this.match.submit(actor, action);
    const mine = update[actor];
    this.last = mine.events.slice();
    const shown = this.bottom;
    const next = update[shown].view.activePlayer;
    const endIdx = mine.events.findIndex((e) => e.type === 'turn_ended');
    if (next === shown || endIdx < 0) {
      // A seat that is not at the bottom (only possible through the test hook
      // or, later, the network) still gets its rejection hint shown.
      const events = actor === shown ? mine.events : mine.events.filter((e) => e.type === 'action_rejected');
      return { kind: 'same', view: update[shown].view, events };
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
