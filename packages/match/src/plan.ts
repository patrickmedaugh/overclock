/**
 * Setup planners for tests and demos (Node or browser). They drive a
 * `LocalMatch` with ordinary legal actions and return the action list, so a
 * test can replay it into the real page (through the test hook) and reach the
 * same board for the same seed. No rules live here: every price, target and
 * memory check comes from the engine's `handOptions` / `legalActions`.
 */
import { getCard, type CardDef } from '@overclock/cards';
import type { Action, CardOption, PlayerView, ServerView, Side } from '@overclock/engine';
import { LocalMatch } from './local-match';

export interface BusyBoardGoal {
  /** Remote servers the Corp opens. Default 3. */
  readonly remotes: number;
  /** ICE in front of each of those remotes. Default 2. */
  readonly icePerRemote: number;
  /** Cards installed in the Runner's rig. Default 4. */
  readonly runnerInstalls: number;
}

export interface BusyBoardPlan {
  /** Submit in order, each as seat `action.player`. All are accepted by the engine. */
  readonly actions: readonly Action[];
  /** The seat whose turn it is after the last action. */
  readonly activePlayer: Side;
  readonly turn: number;
}

const DEFAULT_GOAL: BusyBoardGoal = { remotes: 3, icePerRemote: 2, runnerInstalls: 4 };
const MAX_ACTIONS = 400;

function cardOf(id: string | undefined): CardDef | undefined {
  return id === undefined ? undefined : getCard(id);
}

function remotes(view: PlayerView): readonly ServerView[] {
  return view.corpServers.filter((s) => s.id.startsWith('remote'));
}

function goalMet(corp: PlayerView, goal: BusyBoardGoal): boolean {
  const r = remotes(corp);
  return (
    r.length >= goal.remotes &&
    r.slice(0, goal.remotes).every((s) => s.ice.length >= goal.icePerRemote) &&
    corp.rig.length >= goal.runnerInstalls
  );
}

function legalOption(view: PlayerView, pred: (o: CardOption, card: CardDef | undefined) => boolean): Action | null {
  const hand = view.players[view.viewer].hand ?? [];
  for (const [i, options] of view.handOptions.entries()) {
    for (const o of options) if (o.reject === null && pred(o, cardOf(hand[i]))) return o.action;
  }
  return null;
}

const installTo = (o: CardOption): string | undefined => (o.action.type === 'install' ? o.action.server : undefined);

/** The Corp's next step toward the busy board, or null to end the turn. */
function corpStep(view: PlayerView, goal: BusyBoardGoal): Action | null {
  const me = view.players.corp;
  if (me.clicks === 0) return null;
  const r = remotes(view);
  const needIce = r.slice(0, goal.remotes).find((s) => s.ice.length < goal.icePerRemote);
  if (needIce || r.length < goal.remotes) {
    // 1. Fill an open remote with ICE (outermost price is what handOptions says).
    if (needIce) {
      const a = legalOption(view, (o, c) => c?.type === 'ice' && installTo(o) === needIce.id);
      if (a) return a;
    }
    // 2. Open a new remote: with an agenda/asset if we have one (a fuller board), else with ICE.
    if (r.length < goal.remotes) {
      const a =
        legalOption(view, (o, c) => (c?.type === 'agenda' || c?.type === 'asset') && installTo(o) === 'new') ??
        legalOption(view, (o, c) => c?.type === 'ice' && installTo(o) === 'new');
      if (a) return a;
    }
    // 3. ICE in hand but too dear: take a credit. Otherwise look for ICE.
    const hand = me.hand ?? [];
    const iceInHand = hand.some((id) => cardOf(id)?.type === 'ice');
    const can = (t: Action['type']) => view.legalActions.some((a) => a.type === t);
    if (!iceInHand && can('draw') && me.deckCount > 1) return { type: 'draw', player: 'corp' };
    if (can('gain_credit')) return { type: 'gain_credit', player: 'corp' };
  }
  return null;
}

/** The Runner's next step toward the busy board, or null to end the turn. */
function runnerStep(view: PlayerView, goal: BusyBoardGoal): Action | null {
  const me = view.players.runner;
  if (me.clicks === 0 || view.rig.length >= goal.runnerInstalls) return null;
  // Hardware/resources first (they need no memory), then the cheapest.
  const hand = me.hand ?? [];
  const installs = view.handOptions
    .flatMap((opts, i) => opts.map((o) => ({ o, card: cardOf(hand[i]), program: cardOf(hand[i])?.type === 'program' })))
    .filter(({ o }) => o.action.type === 'install');
  const ready = installs
    .filter(({ o }) => o.reject === null)
    .sort((a, b) => Number(a.program) - Number(b.program) || a.o.cost - b.o.cost)[0];
  if (ready) return ready.o.action;
  // no_credits is reported before no_memory, so only wait for cards that will also fit.
  const fits = (card: CardDef | undefined) => (card?.memory ?? 0) + view.memory.used <= view.memory.limit;
  const waitingForCredits = installs.some(({ o, card }) => o.reject === 'no_credits' && fits(card));
  const can = (t: Action['type']) => view.legalActions.some((a) => a.type === t);
  // Events with a matching effect beat the basic click (Easy Mark: +3, Diesel: draw 3).
  const event = (op: 'gain_credits' | 'draw') => legalOption(view, (o, c) => o.action.type === 'play' && !!c?.onPlay?.some((e) => e.op === op));
  if (waitingForCredits) return event('gain_credits') ?? (can('gain_credit') ? { type: 'gain_credit', player: 'runner' } : null);
  return event('draw') ?? (can('draw') ? { type: 'draw', player: 'runner' } : can('gain_credit') ? { type: 'gain_credit', player: 'runner' } : null);
}

/** A one-line summary for error messages. */
function progress(v: PlayerView): string {
  const ice = remotes(v).map((s) => s.ice.length).join('/');
  return `turn ${v.turn}, remote ICE ${ice || 'none'}, rig ${v.rig.length}, Runner credits ${v.players.runner.credits}`;
}

/** Hand-limit discard: keep the cards the plan needs (ICE / openers for the Corp, installables for the Runner). */
function discardFor(view: PlayerView): Action {
  const me = view.viewer;
  const hand = view.players[me].hand ?? [];
  const keep = (id: string): number => {
    const t = cardOf(id)?.type;
    if (me === 'corp') return t === 'ice' ? 2 : t === 'agenda' || t === 'asset' ? 1 : 0;
    return t === 'program' || t === 'hardware' || t === 'resource' ? 1 : 0;
  };
  const order = hand.map((id, i) => ({ i, k: keep(id) })).sort((a, b) => a.k - b.k || b.i - a.i);
  const handIndices = order.slice(0, view.pendingDiscard).map((x) => x.i);
  return { type: 'discard', player: me, handIndices };
}

/**
 * Plans the actions that take a new game with `seed` to the Sprint 2 "busy
 * board": the Corp has 3 remote servers with 2 ICE each (plus an agenda or
 * asset inside when it had one to open the server with) and the Runner has 4
 * installed cards. Deterministic for a seed. Stops as soon as the board is
 * reached (either seat may be active then). Throws if it can't be reached
 * within 400 actions (it is tested over many seeds).
 */
export function planBusyBoard(seed: number, goal: Partial<BusyBoardGoal> = {}): BusyBoardPlan {
  const g: BusyBoardGoal = { ...DEFAULT_GOAL, ...goal };
  const match = new LocalMatch(seed);
  const actions: Action[] = [];
  const submit = (seat: Side, a: Action): void => {
    const u = match.submit(seat, a);
    const rejected = u[seat].events.find((e) => e.type === 'action_rejected');
    if (rejected) throw new Error(`planBusyBoard(${seed}): ${JSON.stringify(a)} rejected: ${JSON.stringify(rejected)}`);
    actions.push(a);
  };

  while (!goalMet(match.view('corp'), g)) {
    if (actions.length >= MAX_ACTIONS) {
      throw new Error(`planBusyBoard(${seed}): busy board not reached (${progress(match.view('corp'))})`);
    }
    const seat = match.view('corp').activePlayer;
    const view = match.view(seat);
    if (view.phase === 'over') throw new Error(`planBusyBoard(${seed}): game ended first (${progress(view)})`);
    if (view.phase === 'discard') {
      submit(seat, discardFor(view));
      continue;
    }
    const step = seat === 'corp' ? corpStep(view, g) : runnerStep(view, g);
    submit(seat, step ?? { type: 'end_turn', player: seat });
  }
  const end = match.view('corp');
  return { actions, activePlayer: end.activePlayer, turn: end.turn };
}
