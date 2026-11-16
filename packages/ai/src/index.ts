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
 * Sprint 9, trace bids (all numbers public in `choice.trace`). Corp: the least bid that beats the
 * Runner's best answer (strength > link + his max bid), else 0 (no point paying). Runner: `needed`
 * (the bid that ties = escapes; the window only opens when he can afford it), else 0.
 */
function chooseTraceBid(view: PlayerView, offered: readonly Action[]): Action | null {
  const t = view.choice?.trace;
  if (!t) return null;
  const want = view.choice!.kind === 'trace_corp' ? Math.max(0, t.link + t.runnerMaxBid + 1 - t.base) : t.needed;
  const pick = (n: number) => offered.find((a) => a.type === 'trace_bid' && a.credits === n);
  return pick(want) ?? pick(0) ?? null;
}

/**
 * Stub AI. Sees only the PlayerView (no cheating) and picks the first legal
 * action, or null when it has nothing to do. In a free-rez choice it rezzes
 * the costliest offered ICE, else skips; Sprint 8: in a `trash_target` choice it
 * trashes the costliest program, in a `prevent_trash` choice it saves the card; Sprint 9: trace bids
 * (`chooseTraceBid`) and tag actions (`chooseTagAction`: PSF, trash a resource, remove a tag).
 */
export function chooseAction(view: PlayerView): Action | null {
  if (view.choice && view.choice.options.length > 0) {
    const offered = view.choice.options.filter((o) => o.reject === null).map((o) => o.action);
    if (view.choice.kind === 'trash_target') return chooseTrashTarget(view, offered);
    if (view.choice.kind === 'prevent_trash') return choosePrevent(offered);
    if (view.choice.kind === 'trace_corp' || view.choice.kind === 'trace_runner') return chooseTraceBid(view, offered);
    return chooseFreeRez(view, offered);
  }
  return chooseTagAction(view) ?? view.legalActions[0] ?? null;
}

/** Credits needed to keep before removing a tag (the 2-credit cost plus a 2-credit cushion). */
const REMOVE_TAG_MIN_CREDITS = 4;

/**
 * Sprint 9, tags (action phase only, from the legal actions in the view). Corp: use a scored agenda's
 * ability (Private Security Force: meat damage) first, else trash the Runner's costliest resource
 * (first listed on a tie). Runner: remove a tag while he has ≥ 4 credits and a click.
 */
function chooseTagAction(view: PlayerView): Action | null {
  const legal = view.legalActions;
  if (view.viewer === 'corp') {
    const scored = legal.find((a) => a.type === 'activate' && a.uid.startsWith('score:'));
    if (scored) return scored;
    const costOf = (uid: string) => getCard(view.rig.find((c) => c.uid === uid)?.cardId ?? '')?.cost ?? 0;
    let best: Action | null = null;
    for (const a of legal) {
      if (a.type === 'trash_resource' && (best === null || (best.type === 'trash_resource' && costOf(a.uid) > costOf(best.uid)))) best = a;
    }
    return best;
  }
  const remove = legal.find((a) => a.type === 'remove_tag');
  return remove && view.players.runner.credits >= REMOVE_TAG_MIN_CREDITS ? remove : null;
}
