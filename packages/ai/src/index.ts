import { getCard } from '@overclock/cards';
import type { Action, PlayerView } from '@overclock/engine';

/**
 * Free-rez choice (Priority Requisition): rez the costliest offered ICE (the
 * biggest saving; first offered on a tie), else Skip. Reads only the view: the
 * Corp's own ICE ids are visible to it.
 */
function chooseFreeRez(view: PlayerView, offered: readonly Action[]): Action | null {
  const ice = view.corpServers.flatMap((sv) => sv.ice);
  const costOf = (uid: string) => getCard(ice.find((c) => c.uid === uid)?.cardId ?? '')?.cost ?? 0;
  let best: Action | null = null;
  for (const a of offered) {
    if (a.type === 'rez' && (best === null || (best.type === 'rez' && costOf(a.uid) > costOf(best.uid)))) best = a;
  }
  return best ?? offered.find((a) => a.type === 'pass') ?? null;
}

/**
 * Sprint 8, `trash_target` (Rototurret): trash the Runner's costliest offered program (the rig is
 * public; first offered on a tie).
 */
function chooseTrashTarget(view: PlayerView, offered: readonly Action[]): Action | null {
  const costOf = (uid: string) => getCard(view.rig.find((c) => c.uid === uid)?.cardId ?? '')?.cost ?? 0;
  let best: Action | null = null;
  for (const a of offered) {
    if (a.type === 'choose' && (best === null || (best.type === 'choose' && costOf(a.uid) > costOf(best.uid)))) best = a;
  }
  return best;
}

/** Sprint 8, `prevent_trash` (Sacrificial Construct): always save the card (first offered preventer), else let it go. */
function choosePrevent(offered: readonly Action[]): Action | null {
  return offered.find((a) => a.type === 'choose') ?? offered.find((a) => a.type === 'pass') ?? null;
}

/**
 * Stub AI. Sees only the PlayerView (no cheating) and picks the first legal
 * action, or null when it has nothing to do. In a free-rez choice it rezzes
 * the costliest offered ICE, else skips; Sprint 8: in a `trash_target` choice it
 * trashes the costliest program, in a `prevent_trash` choice it saves the card.
 */
export function chooseAction(view: PlayerView): Action | null {
  if (view.choice && view.choice.options.length > 0) {
    const offered = view.choice.options.filter((o) => o.reject === null).map((o) => o.action);
    if (view.choice.kind === 'trash_target') return chooseTrashTarget(view, offered);
    if (view.choice.kind === 'prevent_trash') return choosePrevent(offered);
    return chooseFreeRez(view, offered);
  }
  return view.legalActions[0] ?? null;
}
