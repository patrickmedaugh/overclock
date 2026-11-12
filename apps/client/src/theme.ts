// Neon cyberpunk theme (owner choice, Sprint 0): near-black background,
// glowing cyan for the Runner, magenta for the Corp.
import type { Side } from '@overclock/engine';

export const theme = {
  bg: 0x07060d,
  bgTop: 0x120a1f,
  bgBottom: 0x041016,
  grid: 0x1b2a3a,
  panel: 0x0d0f1a,
  text: 0xe8f6ff,
  textDim: 0x7d8aa3,
  runner: 0x19e6ff,
  runnerDeep: 0x063845,
  corp: 0xff2bd6,
  corpDeep: 0x45093c,
  warn: 0xffc04a,
  credit: 0xffd36b,
  fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, system-ui, sans-serif',
  monoFamily: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
} as const;

export function sideColor(side: Side): number {
  return side === 'runner' ? theme.runner : theme.corp;
}

export function sideDeep(side: Side): number {
  return side === 'runner' ? theme.runnerDeep : theme.corpDeep;
}

/** Timing budget (ms). Nothing here may block input; see CLAUDE.md snappiness budget. */
export const timing = {
  drawFlight: 250,
  handShift: 180,
  pressFeedback: 60,
  zoomIn: 120,
  zoomOut: 90,
  longPress: 350,
  hintIn: 120,
  hintVisible: 1100,
  hintFade: 200,
  creditPop: 200,
  creditFloat: 300,
  /** Hand-limit discards fly to the pile; each extra card starts this much later. */
  discardFlight: 250,
  discardStagger: 15,
  /** The board fades in for the new seat after a turn change. */
  flip: 200,
  /** The new turn's draw starts this far into the flip. */
  drawAfterFlip: 100,
  gameOverIn: 250,
  /** End turn ignores taps this long after a new turn is shown (stops a double tap ending two turns). */
  endTurnGuard: 300,
} as const;
