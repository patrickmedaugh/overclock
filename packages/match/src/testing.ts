/**
 * Test helpers for Node-side e2e setup (`@overclock/match/testing`). Not used
 * by the product: the client must not import this.
 *
 * `planBusyBoard(seed)` plays a game with a `LocalMatch` (the same host the
 * page uses) and returns the action list that reaches the Sprint 2 "busy
 * board": 3 remote servers with 2 ICE each, and 4 Runner installs. The page,
 * started with the same seed, reaches the same board by dispatching these
 * actions in order (deterministic for a seed). It plays only through seat
 * views, like a player would.
 */
import { getCard } from '@overclock/cards';
import type { Action, PlayerView, Side } from '@overclock/engine';
import { LocalMatch } from './local-match';

export interface BusyBoardGoal {
  /** Remote servers wanted. */
  readonly remotes: number;
  /** ICE wanted on each of those remotes. */
  readonly icePerRemote: number;
  /** Runner installed cards wanted. */
  readonly rig: number;
}

export const BUSY_BOARD: BusyBoardGoal = { remotes: 3, icePerRemote: 2, rig: 4 };

export interface BusyBoardPlan {
  readonly seed: number;
  /** Every action, in order, for `submit(action.player, action)`. All are accepted. */
  readonly actions: Action[];
  /** Whose turn it is after the last action. */
  readonly activePlayer: Side;
}

const typeOf = (id: string) => getCard(id)?.type;

function remotes(v: PlayerView) {
  return v.corpServers.filter((s) => s.id.startsWith('remote'));
}

/** True when the goal is reached (seen from either seat: counts are public). */
export function busyBoardReached(v: PlayerView, goal: BusyBoardGoal = BUSY_BOARD): boolean {
  const r = remotes(v);
  return (
    r.length >= goal.remotes &&
    r.slice(0, goal.remotes).every((s) => s.ice.length >= goal.icePerRemote) &&
    v.rig.length >= goal.rig
  );
}

/** Keep-priority of a hand card while discarding (higher = keep). */
function keepScore(id: string, side: Side): number {
  const t = typeOf(id);
  if (side === 'corp') return t === 'ice' ? 3 : t === 'agenda' || t === 'asset' ? 2 : 0;
  return t === 'program' || t === 'hardware' || t === 'resource' ? 2 : 0;
}

function discardChoice(v: PlayerView): Action {
  const hand = v.players[v.viewer].hand ?? [];
  const order = hand.map((id, i) => ({ i, k: keepScore(id, v.viewer) })).sort((a, b) => a.k - b.k || a.i - b.i);
  return { type: 'discard', player: v.viewer, handIndices: order.slice(0, v.pendingDiscard).map((o) => o.i) };
}

/** A basic action: draw while the deck lasts (keeping a margin for the Corp's turn draws), else gain a credit. */
function basic(v: PlayerView, wantDraw: boolean): Action {
  const me = v.players[v.viewer];
  const canDraw = v.legalActions.some((a) => a.type === 'draw');
  const margin = v.viewer === 'corp' ? 3 : 0;
  if (wantDraw && canDraw && me.deckCount > margin) return { type: 'draw', player: v.viewer };
  return { type: 'gain_credit', player: v.viewer };
}

function corpMove(v: PlayerView, goal: BusyBoardGoal): Action {
  const me = v.players.corp;
  if (me.clicks === 0) return { type: 'end_turn', player: 'corp' };
  const r = remotes(v);
  const opts = v.handOptions.flatMap((list, i) => list.map((o) => ({ ...o, id: (me.hand ?? [])[i] ?? '' })));
  const serverOf = (a: Action) => (a.type === 'install' ? a.server : undefined);

  // 1. ICE onto the first goal remote that still needs ICE, or a new remote while we have too few.
  const needy = r.slice(0, goal.remotes).filter((s) => s.ice.length < goal.icePerRemote).map((s) => s.id as string);
  const iceTargets = [...needy, ...(r.length < goal.remotes ? ['new'] : [])];
  for (const target of iceTargets) {
    const o = opts.find((x) => typeOf(x.id) === 'ice' && serverOf(x.action) === target);
    if (o?.reject === null) return o.action;
    if (o?.reject === 'no_credits') return { type: 'gain_credit', player: 'corp' };
  }
  // 2. An agenda/asset into an empty goal remote (nice to have: servers with something to protect).
  const emptyRemote = r.slice(0, goal.remotes).find((s) => s.content.length === 0)?.id;
  const content = opts.find(
    (x) => x.reject === null && (typeOf(x.id) === 'agenda' || typeOf(x.id) === 'asset') && serverOf(x.action) === emptyRemote,
  );
  if (content) return content.action;
  // 3. Look for more ICE.
  return basic(v, iceTargets.length > 0);
}

function runnerMove(v: PlayerView, goal: BusyBoardGoal): Action {
  const me = v.players.runner;
  if (me.clicks === 0 || v.rig.length >= goal.rig) return { type: 'end_turn', player: 'runner' };
  const installs = v.handOptions.flat().filter((o) => o.action.type === 'install');
  const ok = installs.find((o) => o.reject === null);
  if (ok) return ok.action;
  if (installs.some((o) => o.reject === 'no_credits')) return { type: 'gain_credit', player: 'runner' };
  return basic(v, true);
}

/**
 * Plans the busy board for `seed`. Throws if the goal is not reached within
 * `maxActions` (e.g. the Corp would run out of cards first).
 */
export function planBusyBoard(seed: number, goal: BusyBoardGoal = BUSY_BOARD, maxActions = 400): BusyBoardPlan {
  const match = new LocalMatch(seed);
  for (let n = 0; n < maxActions; n++) {
    const v = match.view(match.view('corp').activePlayer);
    if (busyBoardReached(v, goal)) {
      return { seed, actions: [...match.actions()], activePlayer: v.activePlayer };
    }
    if (v.phase === 'over') break;
    const action =
      v.phase === 'discard' ? discardChoice(v) : v.viewer === 'corp' ? corpMove(v, goal) : runnerMove(v, goal);
    const u = match.submit(v.viewer, action);
    const rejected = u[v.viewer].events.find((e) => e.type === 'action_rejected');
    if (rejected) throw new Error(`planBusyBoard(${seed}): ${JSON.stringify(action)} rejected: ${JSON.stringify(rejected)}`);
  }
  throw new Error(`planBusyBoard(${seed}): busy board not reached`);
}
