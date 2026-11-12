// Types for the Playwright test hook (`window.__overclock`).
// Shared by the client (src) and the e2e specs, so keep this file type-only.
import type { Action, GameEvent, PlayerView, RejectReason, Side } from '@overclock/engine';

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

export interface LayoutSnapshot {
  viewport: { width: number; height: number };
  /** Safe-area insets the layout used (env(safe-area-inset-*), read from #safe-probe). */
  safeArea: Insets;
  /** The seat drawn at the bottom (the active player in hot-seat). */
  viewer: Side;
  corp: SideLayout;
  runner: SideLayout;
  /** The area reserved for the viewer's hand. */
  handArea: Box;
  /** Rendered hand cards (the viewer's), in hand order. `marked` = picked for discard; `selected` = picked to play / install. */
  hand: { cardId: string; box: Box; marked: boolean; selected: boolean }[];
  /** Board arrangement: `landscape` on sideways phones, `column` on desktop. */
  mode: 'landscape' | 'column';
  /** The Corp's servers (HQ, R&D, Archives, Server 1...), as drawn. */
  servers: ServerSnapshot[];
  /** The Runner's installed cards, in install order. */
  rig: InstalledSnapshot[];
  /** The Runner's memory counter ("Memory 2/4"). */
  memory: { text: string; box: Box };
  /** Lit targets while a hand card is picked (install spots, Play button); empty otherwise. */
  targets: TargetSnapshot[];
  /** Text shown on screen, so tests can read the canvas. */
  text: {
    banner: string;
    corpCredits: string;
    corpClicks: string;
    runnerCredits: string;
    runnerClicks: string;
    /** Hand-count text in each side's label, e.g. "6 cards in hand". */
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
  /** The long-press zoomed card, if one is open, with every text it renders. */
  zoom: { cardId: string; box: Box; texts: string[] } | null;
  /** True while any event animation runs (never blocks input). */
  animating: boolean;
}

/** An installed card as drawn: `cardId` is what the viewer's view holds (null = hidden from them). */
export interface InstalledSnapshot {
  uid: string;
  cardId: string | null;
  /** Drawn face up (false: a card back). */
  faceUp: boolean;
  /** Tap / hold box. */
  box: Box;
  /** Drawn bounds (ICE: the sideways card). */
  drawn: Box;
}

export interface ServerSnapshot {
  id: string;
  /** "HQ", "R&D", "Archives", "Server 1", ... */
  label: string;
  /** The whole column. */
  box: Box;
  /** Index 0 innermost. */
  ice: InstalledSnapshot[];
  content: InstalledSnapshot[];
}

export interface TargetSnapshot {
  box: Box;
  /** e.g. "Server 1 · 2 credits", "New server · free", "Install · 3 credits", "Play · 5 credits". */
  label: string;
  lit: boolean;
  /** What the engine would answer (null = allowed). */
  reject: RejectReason | null;
  action: Action;
}

export type AnimKind =
  | 'draw_flight'
  | 'credit_pop'
  | 'discard_flight'
  | 'turn_change'
  | 'hint'
  | 'install_flight'
  | 'play_flight'
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
