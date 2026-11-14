// S-06-5: "Hand the phone over" in pass-the-phone mode. Pure: decides when a
// cover goes up and what it says, from what the session presented. No rules:
// it only reads who the presentation flips to and whether the other seat's
// run decision (the Corp's Rez / Don't rez) opened or closed.
import type { Side } from '@overclock/engine';
import type { Presentation } from './session';
import { SIDE_NAME } from './terms';

export interface CoverText {
  /** Who should hold the phone next. */
  to: Side;
  title: string;
  line: string;
}

/**
 * Owner request (2026-11-14): pass-and-play also runs on a desktop, so the cover
 * never says "phone": one line, "Pass to the Corp — tap when ready".
 */
export const COVER_LINE = '';

export function coverText(to: Side, back = false): CoverText {
  return { to, title: `Pass ${back ? 'back ' : ''}to the ${SIDE_NAME[to]} — tap when ready`, line: COVER_LINE };
}

/**
 * The cover to show after `p`, or null. `hadDecision`: the board showed the
 * other seat's run decision before `p`.
 * - the turn passed: to the next player;
 * - the Corp's rez decision opened mid-run: to the deciding seat;
 * - it closed again: back to the seat at the bottom (the Runner).
 */
export function coverFor(p: Presentation, hadDecision: Side | null): CoverText | null {
  if (p.kind === 'handoff') return coverText(p.next);
  const now = p.decision?.seat ?? null;
  if (now !== null && hadDecision === null) return coverText(now);
  if (now === null && hadDecision !== null) return coverText(p.view.viewer, true);
  return null;
}
