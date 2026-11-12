// Interim bridge (Sprint 1, engine-dev): keeps the Sprint 0 Session API that
// main.ts uses, backed by the LocalMatch host. ui-dev replaces this with the
// hot-seat flow from the Sprint 1 tech plan. All rules live in the engine.
import type { Action, GameEvent, PlayerView, Side } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';

export class Session {
  private readonly match: LocalMatch;
  private events: GameEvent[] = [];

  constructor(seed: number) {
    this.match = new LocalMatch(seed);
  }

  /** Hot-seat: the seat whose turn it is. */
  get viewer(): Side {
    return this.match.view('corp').activePlayer;
  }

  view(): PlayerView {
    return this.match.view(this.viewer);
  }

  lastEvents(): GameEvent[] {
    return this.events.slice();
  }

  /** Submits as seat `action.player`; returns the events as that seat may see them. */
  dispatch(action: Action): GameEvent[] {
    const update = this.match.submit(action.player, action);
    this.events = update[action.player].events;
    return this.events.slice();
  }
}

/** `?seed=123` pins the deal (tests, bug reports); otherwise a fresh random one. */
export function seedFromUrl(search: string): number {
  const raw = new URLSearchParams(search).get('seed');
  const n = raw === null ? NaN : Number(raw);
  if (Number.isFinite(n)) return Math.trunc(n) >>> 0;
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
