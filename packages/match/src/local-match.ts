/**
 * The game host. Owns one game's full GameState and talks to the two seats
 * only through per-seat projections (viewFor / viewEvents). This is the same
 * contract a network game server will expose later: a seat submits an action
 * and gets back what each seat is allowed to see.
 */
import {
  apply,
  newGame,
  replay,
  RULES_VERSION,
  viewEvents,
  viewFor,
  type Action,
  type GameEvent,
  type GameOptions,
  type GameState,
  type PlayerView,
  type Side,
} from '@overclock/engine';
import { parseSavedGame, SAVE_FORMAT, type LoadFailure, type SavedGame } from './saved-game';

/** Sprint 11: `LocalMatch.load` result. */
export type LoadResult = { readonly ok: true; readonly match: LocalMatch } | { readonly ok: false; readonly reason: LoadFailure };

export interface SeatUpdate {
  readonly view: PlayerView;
  /** Already projected with viewEvents() for this seat. */
  readonly events: GameEvent[];
}

export type MatchUpdate = Record<Side, SeatUpdate>;

const SIDES: readonly Side[] = ['corp', 'runner'];

export class LocalMatch {
  readonly seed: number;
  /** Sprint 6: the rule options this game was created with (defaults filled in). */
  readonly options: GameOptions;
  private state: GameState;
  /** Sprint 11: accepted actions only (rejections never change the state, so they are not kept). */
  private readonly log: Action[] = [];

  constructor(seed: number, options?: Partial<GameOptions>) {
    this.seed = seed;
    this.state = newGame(seed, options);
    this.options = this.state.options;
  }

  /**
   * Sprint 6: rebuilds a match from its seed, its action log and the options it was
   * created with (`replay`). `actions()` of the result equals `actions`.
   */
  static restore(seed: number, actions: readonly Action[], options?: Partial<GameOptions>): LocalMatch {
    const m = new LocalMatch(seed, options);
    const copy = actions.map((a) => JSON.parse(JSON.stringify(a)) as Action);
    m.state = replay(seed, copy, m.options).state;
    m.log.push(...copy);
    return m;
  }

  /**
   * Sprint 6 (server): resumes a match from a `snapshot()` taken after `actions`, without
   * replaying. The caller guarantees the snapshot belongs to (seed, actions) and was written
   * by the same engine build; otherwise use `restore`.
   */
  static fromSnapshot(seed: number, state: GameState, actions: readonly Action[]): LocalMatch {
    const m = new LocalMatch(seed, state.options);
    m.state = JSON.parse(JSON.stringify(state)) as GameState;
    m.log.push(...actions.map((a) => JSON.parse(JSON.stringify(a)) as Action));
    return m;
  }

  /** Sprint 6 (server persistence only): a JSON copy of the full state. Never send it to a seat. */
  snapshot(): GameState {
    return JSON.parse(JSON.stringify(this.state)) as GameState;
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

    const result = apply(this.state, copy);
    this.state = result.state;
    if (result.events.some((e) => e.type === 'action_rejected')) return this.rejected(seat, [...result.events]);
    // Sprint 11: only accepted actions are logged, so a save never holds a move the rules refused.
    this.log.push(copy);

    const update = {} as Record<Side, SeatUpdate>;
    for (const s of SIDES) update[s] = { view: this.view(s), events: viewEvents(s, result.events) };
    return update;
  }

  /** Every accepted action, in order: `replay(seed, actions(), options)` rebuilds this game. */
  actions(): readonly Action[] {
    return this.log.map((a) => JSON.parse(JSON.stringify(a)) as Action);
  }

  /**
   * Sprint 11 (S-11-3): this game as a save (plain JSON, detached). Cheap: it copies the
   * accepted-action log, no state. Write it after the move's presentation, never in the tap path.
   */
  save(): SavedGame {
    return {
      format: SAVE_FORMAT,
      rulesVersion: RULES_VERSION,
      seed: this.seed,
      options: JSON.parse(JSON.stringify(this.options)) as GameOptions, // Sprint 13: deck lists too
      actions: this.actions(),
    };
  }

  /**
   * Sprint 11 (S-11-3): rebuilds a game from `save()` output (the object or its JSON string)
   * by replaying it under this build's rules. Never throws.
   * - `broken`: not a save (bad JSON or shape), or the replay crashed.
   * - `outdated`: `rulesVersion !== RULES_VERSION`, a newer save `format`, or any saved action
   *   is refused on replay (the rules changed without a version bump).
   * - `finished`: the replayed game is over.
   */
  static load(x: unknown): LoadResult {
    const saved = parseSavedGame(x);
    if (saved === 'broken' || saved === 'outdated') return { ok: false, reason: saved };
    if (saved.rulesVersion !== RULES_VERSION) return { ok: false, reason: 'outdated' };
    let m: LocalMatch;
    try {
      m = new LocalMatch(saved.seed, saved.options);
      let state = m.state;
      for (const a of saved.actions) {
        const r = apply(state, a);
        if (r.events.some((e) => e.type === 'action_rejected')) return { ok: false, reason: 'outdated' };
        state = r.state;
      }
      m.state = state;
    } catch {
      return { ok: false, reason: 'broken' };
    }
    if (m.state.phase === 'over' || m.state.result !== null) return { ok: false, reason: 'finished' };
    m.log.push(...saved.actions); // already a detached copy (parseSavedGame)
    return { ok: true, match: m };
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
