// Types for the Playwright test hook (`window.__overclock`).
// Shared by the client (src) and the e2e specs, so keep this file type-only.
import type { Action, GameEvent, PlayerView } from '@overclock/engine';

/** Axis-aligned box in CSS pixels, relative to the page viewport. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SideLayout {
  deck: Box;
  credits: Box;
  clicks: Box;
}

export interface LayoutSnapshot {
  viewport: { width: number; height: number };
  corp: SideLayout;
  runner: SideLayout;
  /** The area reserved for the Runner's hand. */
  handArea: Box;
  /** Rendered hand cards, left to right (back row first when wrapped). */
  hand: { cardId: string; box: Box }[];
  /** Text shown in each counter, so tests can read the canvas. */
  text: {
    corpCredits: string;
    corpClicks: string;
    runnerCredits: string;
    runnerClicks: string;
  };
  /** The transient hint toast, if one is visible. */
  hint: { text: string; box: Box } | null;
  /** The long-press zoomed card, if one is open, with every text it renders. */
  zoom: { cardId: string; box: Box; texts: string[] } | null;
  /** True while any tween is running (never blocks input). */
  animating: boolean;
}

export interface OverclockTestHook {
  getView(): PlayerView;
  dispatch(action: Action): GameEvent[];
  lastEvents(): GameEvent[];
  layout(): LayoutSnapshot;
}

declare global {
  interface Window {
    __overclock?: OverclockTestHook;
  }
}
