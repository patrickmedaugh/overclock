import { getCard } from '@overclock/cards';
import type { Action, PlayerView } from '@overclock/engine';

/**
 * Free-rez choice (Priority Requisition): rez the costliest offered ICE (the
 * biggest saving; first offered on a tie), else Skip. Reads only the view: the
 * Corp's own ICE ids are visible to it.
 */
function chooseFreeRez(view: PlayerView): Action | null {
  const offered = (view.choice?.options ?? []).filter((o) => o.reject === null).map((o) => o.action);
  const ice = view.corpServers.flatMap((sv) => sv.ice);
  const costOf = (uid: string) => getCard(ice.find((c) => c.uid === uid)?.cardId ?? '')?.cost ?? 0;
  let best: Action | null = null;
  for (const a of offered) {
    if (a.type === 'rez' && (best === null || (best.type === 'rez' && costOf(a.uid) > costOf(best.uid)))) best = a;
  }
  return best ?? offered.find((a) => a.type === 'pass') ?? null;
}

/**
 * Stub AI. Sees only the PlayerView (no cheating) and picks the first legal
 * action, or null when it has nothing to do. In a free-rez choice it rezzes
 * the costliest offered ICE, else skips.
 */
export function chooseAction(view: PlayerView): Action | null {
  if (view.choice && view.choice.options.length > 0) return chooseFreeRez(view);
  return view.legalActions[0] ?? null;
}
