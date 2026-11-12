// Types for the Playwright test hook (`window.__overclock`).
// Shared by the client (src) and the e2e specs, so keep this file type-only.
import type { Action, GameEvent, PlayerView, Side } from '@overclock/engine';

/** Axis-aligned box in CSS pixels, relative to the page viewport. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Distances (CSS px) from each screen edge covered by a notch / status bar / gesture bar. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** One side's widgets, wherever they are drawn (top or bottom row). */
export interface SideLayout {
  deck: Box;
  credits: Box;
  clicks: Box;
  discard: Box;
  label: Box;
}

/** An installed card as drawn. */
export interface InstalledSnapshot {
  uid: string;
  /** null when it is face down to the viewer (the view never told the client what it is). */
  cardId: string | null;
  faceUp: boolean;
  /** Drawn bounds (ICE: sideways, wider than tall). */
  box: Box;
}

export interface ServerSnapshot {
  id: string;
  /** On-screen name: "HQ", "R&D", "Archives", "Server 1", ... */
  label: string;
  /** The whole column (tap target while lit). */
  box: Box;
  labelBox: Box;
  /** HQ marker / R&D deck / Archives pile (central servers). */
  root: Box | null;
  /** ICE, index 0 innermost. */
  ice: InstalledSnapshot[];
  content: InstalledSnapshot[];
}

/** A place a picked hand card can go, lit while the card is picked. */
export interface TargetSnapshot {
  kind: 'server' | 'new_server' | 'install' | 'play';
  /** For server targets. */
  server?: string;
  box: Box;
  /** The price label, e.g. "Install · 1 credit". */
  label: string;
  /** Bright (the engine would accept it) vs dim (shown with its price, refused with a hint). */
  lit: boolean;
  /** The engine's reason it would be refused (from view.handOptions). */
  reject: string | null;
}

export interface LayoutSnapshot {
  /** 'landscape' on sideways phones, 'portrait' (the column) elsewhere. */
  mode: 'landscape' | 'portrait';
  viewport: { width: number; height: number };
  /** Safe-area insets the layout used (env(safe-area-inset-*), read from #safe-probe). */
  safeArea: Insets;
  /** The seat drawn at the bottom (the active player in hot-seat). */
  viewer: Side;
  corp: SideLayout;
  runner: SideLayout;
  /** The area reserved for the viewer's hand. */
  handArea: Box;
  /** Rendered hand cards (the viewer's), in hand order. `marked` = picked for discard, `selected` = picked to play. */
  hand: { cardId: string; box: Box; marked: boolean; selected: boolean }[];
  /** Corp servers in view order (hq, rd, archives, remotes). */
  servers: ServerSnapshot[];
  /** The Runner's installed cards, install order. */
  rig: InstalledSnapshot[];
  memory: { used: number; limit: number; text: string; box: Box };
  /** Lit targets for the picked hand card (empty when none is picked). */
  targets: TargetSnapshot[];
  /** Hand index picked to play, or null. */
  selected: number | null;
  /** Every board text on screen (labels, counters, buttons; not card faces). */
  labels: string[];
  /** Text shown on screen, so tests can read the canvas. */
  text: {
    banner: string;
    corpCredits: string;
    corpClicks: string;
    runnerCredits: string;
    runnerClicks: string;
    /** Hand-count text in each side's label, e.g. "6 cards in HQ", "5 cards in Grip". */
    corpHand: string;
    runnerHand: string;
    /** Count badge on each discard pile. */
    corpDiscard: string;
    runnerDiscard: string;
  };
  /** End turn button; null while the discard picker shows or the game is over. */
  endTurn: { box: Box; label: string; glowing: boolean; enabled: boolean } | null;
  /** Hand-limit discard picker, when the viewer must discard. */
  picker: { remaining: number; label: string; confirm: { box: Box; enabled: boolean } } | null;
  gameOver: { text: string; box: Box } | null;
  /** The transient hint toast, if one is visible. */
  hint: { text: string; box: Box } | null;
  /**
   * The long-press zoomed card, if one is open, with every text it renders.
   * cardId is null for a face-down card the viewer may not see. `textOverflow`
   * is true if any text runs outside the card.
   */
  zoom: { cardId: string | null; box: Box; texts: string[]; textOverflow: boolean } | null;
  /** True while any event animation runs (never blocks input). */
  animating: boolean;
}

export type AnimKind =
  | 'draw_flight'
  | 'credit_pop'
  | 'discard_flight'
  | 'turn_change'
  | 'hint'
  /** A hand card flies to its server / the Runner's row. */
  | 'install_flight'
  /** An operation/event flies to its owner's discard pile. */
  | 'play_flight'
  /** A new remote server's column appears. */
  | 'server_open';

/** Logged when an animation or hint starts. */
export interface AnimRecord {
  kind: AnimKind;
  /** performance.now() when it was started (same clock as event.timeStamp). */
  startedAt: number;
  /** Total scheduled duration including stagger delays (ms). Hints never block input. */
  scheduledMs: number;
  /** Hint text. */
  text?: string;
  /** Where it was shown (hints: the toast's final box). */
  box?: Box;
}

/** Timestamps (performance.now() clock) of the last pointer release handled by a target. */
export interface InputStamp {
  /** The DOM event's timeStamp (when the browser saw the release). */
  eventAt: number;
  /** When the game's input handler started on it; budgets count from here. */
  handledAt: number;
}

/** The game's own End turn clock (performance.now() timestamps; 0 before the first turn change). */
export interface EndTurnClock {
  /** End turn ignores taps before this (double-tap guard). */
  armedAt: number;
  /** When the last turn change's board flip is scheduled (after any discard flight). */
  flipDueAt: number;
}

export interface OverclockTestHook {
  /** The bottom seat's view. */
  getView(): PlayerView;
  /** Submits as seat `action.player`; returns that seat's projected events. */
  dispatch(action: Action): GameEvent[];
  lastEvents(): GameEvent[];
  layout(): LayoutSnapshot;
  anims(): AnimRecord[];
  clearAnims(): void;
  /** The last pointer release a game target handled (null before the first). */
  lastInput(): InputStamp | null;
  endTurn(): EndTurnClock;
}

declare global {
  interface Window {
    __overclock?: OverclockTestHook;
  }
}
