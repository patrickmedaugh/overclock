// Local game session: owns the engine state for this browser tab and exposes
// only the Runner's view. All rules live in @overclock/engine.
import { type Action, type GameEvent, type GameState, type PlayerView, type Side, apply, newGame, viewEvents, viewFor } from '@overclock/engine';

export class Session {
  private state: GameState;
  private events: GameEvent[] = [];

  constructor(
    seed: number,
    readonly viewer: Side = 'runner',
  ) {
    this.state = newGame(seed);
  }

  view(): PlayerView {
    return viewFor(this.viewer, this.state);
  }

  lastEvents(): GameEvent[] {
    return this.events.slice();
  }

  /** Sends an action to the engine; returns the events as the viewer may see them. */
  dispatch(action: Action): GameEvent[] {
    const result = apply(this.state, action);
    this.state = result.state;
    this.events = viewEvents(this.viewer, result.events);
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
