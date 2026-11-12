/**
 * The game host. Owns one game's full GameState and talks to the two seats
 * only through per-seat projections (viewFor / viewEvents). This is the same
 * contract a network game server will expose later: a seat submits an action
 * and gets back what each seat is allowed to see.
 */
import {
  apply,
  newGame,
  viewEvents,
  viewFor,
  type Action,
  type GameEvent,
  type GameState,
  type PlayerView,
  type Side,
} from '@overclock/engine';

export interface SeatUpdate {
  readonly view: PlayerView;
  /** Already projected with viewEvents() for this seat. */
  readonly events: GameEvent[];
}

export type MatchUpdate = Record<Side, SeatUpdate>;

const SIDES: readonly Side[] = ['corp', 'runner'];

export class LocalMatch {
  readonly seed: number;
  private state: GameState;
  private readonly log: Action[] = [];

  constructor(seed: number) {
    this.seed = seed;
    this.state = newGame(seed);
  }

  view(seat: Side): PlayerView {
    return viewFor(seat, this.state);
  }

  /**
   * Submits `action` on behalf of `seat`. A seat may only act as itself:
   * `seat !== action.player` is rejected with invalid_action and the state is
   * unchanged. Rejections go to the submitting seat only; the other seat gets
   * `events: []`. Never throws.
   */
  submit(seat: Side, action: Action): MatchUpdate {
    const copy = seatAction(seat, action);
    if (copy === null) return this.rejected(seat, [{ type: 'action_rejected', reason: 'invalid_action' }]);

    // Everything that reaches the engine is logged (rejections are no-ops in replay).
    this.log.push(copy);
    const result = apply(this.state, copy);
    this.state = result.state;
    if (result.events.some((e) => e.type === 'action_rejected')) return this.rejected(seat, [...result.events]);

    const update = {} as Record<Side, SeatUpdate>;
    for (const s of SIDES) update[s] = { view: this.view(s), events: viewEvents(s, result.events) };
    return update;
  }

  /** Every action that reached the engine, in order: `replay(seed, actions())` rebuilds this game. */
  actions(): readonly Action[] {
    return this.log.map((a) => JSON.parse(JSON.stringify(a)) as Action);
  }

  private rejected(seat: Side, events: GameEvent[]): MatchUpdate {
    const other: Side = seat === 'corp' ? 'runner' : 'corp';
    return {
      [seat]: { view: this.view(seat), events },
      [other]: { view: this.view(other), events: [] },
    } as MatchUpdate;
  }
}

/**
 * A detached JSON copy of `action` if it is a JSON object acting for `seat`,
 * else null. Copying keeps later caller mutations out of the state and the log.
 */
function seatAction(seat: Side, action: unknown): Action | null {
  if (typeof action !== 'object' || action === null) return null;
  if ((action as { player?: unknown }).player !== seat) return null;
  try {
    return JSON.parse(JSON.stringify(action)) as Action;
  } catch {
    return null; // not plain JSON (e.g. a cycle)
  }
}
