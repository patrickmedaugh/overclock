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

export interface LayoutSnapshot {
  /** 'phone' = sideways phone layout (touch, short side <= 500px); 'desktop' = the portrait column. */
  mode: 'phone' | 'desktop';
  /** True while an upright phone shows "Turn your phone sideways" instead of the board. */
  rotatePrompt: boolean;
  viewport: { width: number; height: number };
  /** Safe-area insets the layout used (env(safe-area-inset-*), read from #safe-probe). */
  safeArea: Insets;
  /** The seat drawn at the bottom (the active player in hot-seat). */
  viewer: Side;
  corp: SideLayout;
  runner: SideLayout;
  /** The area reserved for the viewer's hand. */
  handArea: Box;
  /** Rendered hand cards (the viewer's), in hand order. `marked` = picked for discard. */
  hand: { cardId: string; box: Box; marked: boolean }[];
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

/**
 * `turn_change` is logged at the tap that passes the turn (scheduledMs = discard
 * flight + flip); `turn_flip` when the new seat's board actually starts fading in,
 * with `text` = what started it: 'now' (no discards), 'timer' (at the scheduled
 * time) or 'skip' (a tap skipped ahead).
 */
export type AnimKind = 'draw_flight' | 'credit_pop' | 'discard_flight' | 'turn_change' | 'turn_flip' | 'hint';

/** Logged when an animation or hint starts. */
export interface AnimRecord {
  kind: AnimKind;
  /** performance.now() when it was started (same clock as event.timeStamp). */
  startedAt: number;
  /** Total scheduled duration including stagger delays (ms). Hints never block input. */
  scheduledMs: number;
  /** Hint text; for `turn_flip`, what started it. */
  text?: string;
  /** Where it was shown (hints: the toast's final box). */
  box?: Box;
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
}

declare global {
  interface Window {
    __overclock?: OverclockTestHook;
  }
}
