import type { Action, PlayerView } from '@overclock/engine';

/**
 * Sprint 0 stub AI. Sees only the PlayerView (no cheating) and picks the
 * first legal action, or null when it has nothing to do.
 */
export function chooseAction(view: PlayerView): Action | null {
  return view.legalActions[0] ?? null;
}
