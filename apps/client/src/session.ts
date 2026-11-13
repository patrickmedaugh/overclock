// Sprint 6 (tech plan "Client"): the one interface the board talks to. A
// pass-the-phone game (`HotSeat`) and an online game (`OnlineMatch`, U3) both
// implement it. Neither holds rules: both only forward the engine's projected
// views and events (from the local match host or the server).
import type { Action, GameEvent, PlayerView, RunView, Side } from '@overclock/engine';

/**
 * A run decision that belongs to the seat *not* at the bottom (the Corp's rez
 * choice while the Runner is on screen): that seat's own run view, whose
 * `options` the board shows as buttons and submits as `seat`.
 */
export interface Decision {
  seat: Side;
  run: RunView;
}

/** What the board should animate for one change of the game. */
export type Presentation =
  /**
   * Same seat stays at the bottom: show `view` and animate `events` (the bottom
   * seat's projection, also when the other seat acted). `decision` is set while
   * the other seat must decide.
   */
  | { kind: 'same'; view: PlayerView; events: GameEvent[]; decision: Decision | null }
  /**
   * The turn passed (pass-the-phone only: the bottom seat changes). First the
   * actor's own events up to and including `turn_ended` animate in the actor's
   * view (e.g. their discards fly to the pile); then the board flips to `next`
   * and animates `nextEvents` (the new turn's start, e.g. the Corp's free draw)
   * in the new seat's view.
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

/** How the game is connected. A pass-the-phone game is always `local`. */
export type Connection = 'local' | 'connecting' | 'open' | 'reconnecting' | 'closed';

/** Whether the other player is connected (online only; `here` for pass-the-phone). */
export type Presence = 'none' | 'here' | 'away';

export interface SessionStatus {
  connection: Connection;
  opponent: Presence;
}

export interface Session {
  /** `hotseat`: both seats on this device. `online`: one seat here, the other on another phone. */
  readonly kind: 'hotseat' | 'online';
  /** The seat drawn at the bottom (pass-the-phone: the active player; online: this phone's seat). */
  readonly seat: Side;
  /** The bottom seat's projected view. */
  view(): PlayerView;
  /** The other seat's run decision shown on this board (pass-the-phone Corp rez choice), else null. */
  decision(): Decision | null;
  /**
   * Sends an action as seat `action.player`. What it changed arrives through
   * `onPresent` (synchronously for pass-the-phone, on the server's answer online).
   */
  submit(action: Action): void;
  /** Called with every change to show; returns an unsubscribe function. */
  onPresent(cb: (p: Presentation) => void): () => void;
  /** The events of the last submit, as the submitting seat saw them. */
  lastEvents(): GameEvent[];
  status(): SessionStatus;
}

/** Small listener list shared by the session implementations. */
export class Listeners<T> {
  private readonly list = new Set<(v: T) => void>();

  add(cb: (v: T) => void): () => void {
    this.list.add(cb);
    return () => this.list.delete(cb);
  }

  emit(v: T): void {
    for (const cb of [...this.list]) cb(v);
  }
}
