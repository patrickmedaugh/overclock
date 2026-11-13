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

// ---- Sprint 3: planToStep -----------------------------------------------------------

/**
 * Game situations the Sprint 3 e2e tests start from (all reached by playing a
 * real game from `newGame(seed)` through seat views; the planner drives both
 * seats like a hot-seat player who knows both hands):
 * - `corp_rez_prompt`: a run waits on the Corp's Rez / Don't rez for face-down ICE it can pay for.
 * - `wall_of_static_encounter`: the Runner encounters a rezzed Wall of Static with Corroder
 *   installed and at least 2 credits (1 to raise strength, 1 to break).
 * - `agenda_one_advance`: Corp's turn (action step, a click and a credit left), an installed
 *   agenda one advancement short of its requirement.
 * - `corp_one_score_from_win`: Corp's turn, an installed agenda ready to score that brings the
 *   Corp to 7 points. Not every seed gets there: 7 points needs Priority Requisition (the other
 *   agendas total 6), and when it lies deep in R&D the Corp runs out of cards first (about 4 in
 *   5 of seeds 1-100 work; e.g. 1, 2, 3, 4, 5, 7, 10, 12, 12345 do).
 * - `runner_one_steal_from_win`: Runner's turn with a click left, a remote with no ICE holding
 *   an agenda that brings the Runner to 7 points if stolen.
 */
export type StepGoal =
  | 'corp_rez_prompt'
  | 'wall_of_static_encounter'
  | 'agenda_one_advance'
  | 'corp_one_score_from_win'
  | 'runner_one_steal_from_win';

export const STEP_GOALS: readonly StepGoal[] = [
  'corp_rez_prompt',
  'wall_of_static_encounter',
  'agenda_one_advance',
  'corp_one_score_from_win',
  'runner_one_steal_from_win',
];

export interface StepPlan {
  readonly seed: number;
  readonly goal: StepGoal;
  /** Every action, in order, for `submit(action.player, action)`. All are accepted. */
  readonly actions: Action[];
  /** Whose decision it is after the last action (the run's decider during a run). */
  readonly waitingOn: Side;
  /** Whose turn it is after the last action. */
  readonly activePlayer: Side;
  /** Goal-specific uids/servers the e2e needs (e.g. the ICE, breaker, agenda, server). */
  readonly info: Readonly<Record<string, string>>;
}

interface Views {
  readonly corp: PlayerView;
  readonly runner: PlayerView;
}

const WIN = 7;
const card = (id: string | null | undefined) => (id ? getCard(id) : undefined);

function decider(v: PlayerView): Side {
  return v.run?.waitingOn ?? v.activePlayer;
}

/** Corp's installed cards with the server they are in (Corp view: ids visible). */
function corpInstalled(v: PlayerView) {
  return v.corpServers.flatMap((sv) =>
    [...sv.ice.map((c) => ({ ...c, zone: 'ice' as const })), ...sv.content.map((c) => ({ ...c, zone: 'content' as const }))].map((c) => ({
      ...c,
      server: sv.id,
    })),
  );
}

/** Installed agendas (Corp view) with their requirement and points. */
function agendas(v: PlayerView) {
  return corpInstalled(v)
    .filter((c) => card(c.cardId)?.type === 'agenda')
    .map((c) => ({
      ...c,
      need: card(c.cardId)?.advancementRequirement ?? 0,
      points: card(c.cardId)?.agendaPoints ?? 0,
      iceless: (v.corpServers.find((sv) => sv.id === c.server)?.ice.length ?? 0) === 0,
    }));
}

function legal(v: PlayerView, pred: (a: Action) => boolean): Action | undefined {
  return v.legalActions.find(pred);
}

/** The hand index of the first card in `v`'s hand matching `pred`, or -1. */
function handIdx(v: PlayerView, pred: (id: string) => boolean): number {
  return (v.players[v.viewer].hand ?? []).findIndex(pred);
}

/** A legal install of hand card `i` into a new server (Corp) or the rig (Runner). */
function installNew(v: PlayerView, i: number): Action | undefined {
  return legal(v, (a) => a.type === 'install' && a.handIndex === i && (v.viewer === 'runner' || a.server === 'new'));
}

/** Discard: keep cards scored by `keep` (higher = keep), drop the rest first. */
function discardKeeping(v: PlayerView, keep: (id: string) => number): Action {
  const hand = v.players[v.viewer].hand ?? [];
  const order = hand.map((id, i) => ({ i, k: keep(id) })).sort((a, b) => a.k - b.k || a.i - b.i);
  return { type: 'discard', player: v.viewer, handIndices: order.slice(0, v.pendingDiscard).map((o) => o.i) };
}

/** Draw while the deck has more than `margin` cards, else gain a credit; end the turn at 0 clicks. */
function basicMove(v: PlayerView, margin: number, wantDraw = true): Action {
  const me = v.players[v.viewer];
  if (me.clicks === 0) return { type: 'end_turn', player: v.viewer };
  if (wantDraw && me.deckCount > margin && legal(v, (a) => a.type === 'draw')) return { type: 'draw', player: v.viewer };
  return { type: 'gain_credit', player: v.viewer };
}

/** Default run decisions: Corp doesn't rez; Runner lets things through, continues, steals, leaves. */
function defaultRunMove(v: PlayerView): Action {
  const opts = (v.run?.options ?? []).filter((o) => o.reject === null).map((o) => o.action);
  return opts.find((a) => a.type === 'steal') ?? { type: 'pass', player: v.viewer };
}

/** True when `goal` holds (both seat views). */
export function stepReached(goal: StepGoal, views: Views): boolean {
  const { corp, runner } = views;
  if (corp.phase === 'over') return false;
  switch (goal) {
    case 'corp_rez_prompt':
      return corp.run?.step === 'approach' && corp.run.waitingOn === 'corp' && corp.run.options.some((o) => o.action.type === 'rez' && o.reject === null);
    case 'wall_of_static_encounter':
      return (
        runner.run?.step === 'encounter' &&
        runner.run.ice?.cardId === 'c04' &&
        runner.rig.some((c) => c.cardId === 'r04') &&
        runner.players.runner.credits >= 2
      );
    case 'agenda_one_advance':
      return (
        corp.phase === 'action' &&
        corp.activePlayer === 'corp' &&
        corp.players.corp.clicks >= 1 &&
        corp.players.corp.credits >= 1 &&
        agendas(corp).some((a) => a.advancements === a.need - 1)
      );
    case 'corp_one_score_from_win':
      return (
        corp.phase === 'action' &&
        corp.activePlayer === 'corp' &&
        agendas(corp).some((a) => a.advancements >= a.need && corp.players.corp.points + a.points >= WIN)
      );
    case 'runner_one_steal_from_win':
      return (
        runner.phase === 'action' &&
        runner.activePlayer === 'runner' &&
        runner.players.runner.clicks >= 1 &&
        agendas(corp).some((a) => a.iceless && runner.players.runner.points + a.points >= WIN)
      );
  }
}

function stepInfo(goal: StepGoal, views: Views): Record<string, string> {
  const { corp, runner } = views;
  switch (goal) {
    case 'corp_rez_prompt':
    case 'wall_of_static_encounter': {
      const r = corp.run!;
      const info: Record<string, string> = { server: r.server, iceUid: r.iceUid ?? '' };
      const breaker = runner.rig.find((c) => c.cardId === 'r04');
      if (goal === 'wall_of_static_encounter' && breaker) info.breakerUid = breaker.uid;
      return info;
    }
    case 'agenda_one_advance': {
      const a = agendas(corp).find((x) => x.advancements === x.need - 1)!;
      return { uid: a.uid, cardId: a.cardId!, server: a.server };
    }
    case 'corp_one_score_from_win': {
      const a = agendas(corp).find((x) => x.advancements >= x.need && corp.players.corp.points + x.points >= WIN)!;
      return { uid: a.uid, cardId: a.cardId!, server: a.server };
    }
    case 'runner_one_steal_from_win': {
      const a = agendas(corp).find((x) => x.iceless && runner.players.runner.points + x.points >= WIN)!;
      return { uid: a.uid, cardId: a.cardId!, server: a.server };
    }
  }
}

const isAgendaId = (id: string) => typeOf(id) === 'agenda';

// -- per-goal policies (both seats; may read both views: a test helper, not an AI) --

function corpMoveFor(goal: StepGoal, v: PlayerView): Action {
  const me = v.players.corp;
  if (v.run) {
    if (goal === 'corp_rez_prompt') return { type: 'pass', player: 'corp' }; // unreachable: the goal stops here
    const rezIt = v.run.options.find((o) => o.action.type === 'rez' && o.reject === null);
    if (goal === 'wall_of_static_encounter' && rezIt && v.run.ice?.cardId === 'c04') return rezIt.action;
    return defaultRunMove(v);
  }
  if (v.phase === 'discard') {
    const keep = (id: string) =>
      goal === 'wall_of_static_encounter' ? (id === 'c04' ? 2 : 0) : goal === 'corp_rez_prompt' ? (typeOf(id) === 'ice' ? 2 : 0) : isAgendaId(id) ? 2 : id === 'c01' ? 1 : 0;
    return discardKeeping(v, keep);
  }
  if (me.clicks === 0) return { type: 'end_turn', player: 'corp' };
  const installed = corpInstalled(v);

  if (goal === 'corp_rez_prompt' || goal === 'wall_of_static_encounter') {
    const wanted = (id: string | null) => (goal === 'wall_of_static_encounter' ? id === 'c04' : typeOf(id ?? '') === 'ice');
    const ice = installed.find((c) => c.zone === 'ice' && !c.faceUp && wanted(c.cardId));
    if (ice) {
      // Keep enough credits to rez it when the Runner comes; then let the Runner play.
      if (me.credits < (card(ice.cardId)?.cost ?? 0)) return { type: 'gain_credit', player: 'corp' };
      return { type: 'end_turn', player: 'corp' };
    }
    const i = handIdx(v, wanted);
    const install = i >= 0 ? installNew(v, i) : undefined;
    if (install) return install;
    return basicMove(v, 2);
  }

  // Agenda goals: score (when it can't win yet), advance, install agendas, economy, draw.
  const mine = agendas(v);
  if (goal === 'corp_one_score_from_win' || goal === 'agenda_one_advance') {
    if (goal === 'corp_one_score_from_win') {
      const ready = mine.find((a) => a.advancements >= a.need);
      if (ready) return { type: 'score', player: 'corp', uid: ready.uid };
    }
    // Hedge Fund first whenever affordable (+4 credits for a click beats clicking for credits).
    const fund = handIdx(v, (id) => id === 'c01');
    if (fund >= 0 && me.credits >= 5) return { type: 'play', player: 'corp', handIndex: fund };
    const target = mine
      .filter((a) => a.advancements < (goal === 'agenda_one_advance' ? a.need - 1 : a.need))
      .sort((a, b) => b.advancements - a.advancements || a.need - b.need)[0];
    if (target) {
      if (me.credits >= 1) return { type: 'advance', player: 'corp', uid: target.uid };
      const hf = handIdx(v, (id) => id === 'c01');
      if (hf >= 0 && me.credits >= 5) return { type: 'play', player: 'corp', handIndex: hf };
      return { type: 'gain_credit', player: 'corp' };
    }
    const hand = v.players.corp.hand ?? [];
    const order = hand
      .map((id, i) => ({ i, need: card(id)?.advancementRequirement ?? 99 }))
      .filter((x) => isAgendaId(hand[x.i] ?? ''))
      .sort((a, b) => a.need - b.need);
    for (const x of order) {
      const install = installNew(v, x.i);
      if (install) return install;
    }
    const hf = handIdx(v, (id) => id === 'c01');
    if (hf >= 0 && me.credits >= 5 && me.credits < 8) return { type: 'play', player: 'corp', handIndex: hf };
    // Nothing to work on: look for agendas, but never draw the deck down to a loss.
    return basicMove(v, 3);
  }

  // runner_one_steal_from_win: the Corp installs agendas into new, unprotected remotes.
  const i = handIdx(v, isAgendaId);
  const install = i >= 0 ? installNew(v, i) : undefined;
  if (install) return install;
  return basicMove(v, 1);
}

function runnerMoveFor(goal: StepGoal, v: PlayerView, views: Views): Action {
  const me = v.players.runner;
  if (v.run) {
    if (goal === 'wall_of_static_encounter' && v.run.step === 'encounter') return { type: 'pass', player: 'runner' };
    return defaultRunMove(v);
  }
  if (v.phase === 'discard') return discardKeeping(v, (id) => (id === 'r04' ? 2 : typeOf(id) === 'program' ? 1 : 0));
  if (me.clicks === 0) return { type: 'end_turn', player: 'runner' };
  const corpView = views.corp;

  if (goal === 'corp_rez_prompt') {
    const target = corpInstalled(corpView).find(
      (c) => c.zone === 'ice' && !c.faceUp && corpView.players.corp.credits >= (card(c.cardId)?.cost ?? 99),
    );
    if (target) return { type: 'run', player: 'runner', server: target.server };
    return { type: 'end_turn', player: 'runner' };
  }

  if (goal === 'wall_of_static_encounter') {
    const hasCorroder = v.rig.some((c) => c.cardId === 'r04');
    if (!hasCorroder) {
      const i = handIdx(v, (id) => id === 'r04');
      if (i >= 0) {
        const install = installNew(v, i);
        return install ?? { type: 'gain_credit', player: 'runner' };
      }
      return basicMove(v, 0);
    }
    const wall = corpInstalled(corpView).find((c) => c.cardId === 'c04');
    const corpCanRez = wall && (wall.faceUp || corpView.players.corp.credits >= 3);
    if (wall && corpCanRez && me.credits >= 2) return { type: 'run', player: 'runner', server: wall.server };
    if (me.credits < 2) return { type: 'gain_credit', player: 'runner' };
    return { type: 'end_turn', player: 'runner' };
  }

  if (goal === 'runner_one_steal_from_win') {
    const target = agendas(corpView).find((a) => a.iceless && me.points + a.points < WIN);
    if (target) return { type: 'run', player: 'runner', server: target.server };
    return { type: 'end_turn', player: 'runner' };
  }

  // Corp-side goals: the Runner stays out of the way.
  return { type: 'end_turn', player: 'runner' };
}

/**
 * Plans a real game from `newGame(seed)` to `goal` (see `StepGoal`). The page,
 * started with the same seed, reaches the same situation by dispatching
 * `actions` in order (each as its own `player`). Throws if the goal is not
 * reached within `maxActions` or the game ends first.
 */
export function planToStep(seed: number, goal: StepGoal, maxActions = 1500): StepPlan {
  const match = new LocalMatch(seed);
  for (let n = 0; n < maxActions; n++) {
    const views: Views = { corp: match.view('corp'), runner: match.view('runner') };
    if (stepReached(goal, views)) {
      return {
        seed,
        goal,
        actions: [...match.actions()],
        waitingOn: decider(views.corp),
        activePlayer: views.corp.activePlayer,
        info: stepInfo(goal, views),
      };
    }
    if (views.corp.phase === 'over') break;
    const side = decider(views.corp);
    const v = views[side];
    const action = side === 'corp' ? corpMoveFor(goal, v) : runnerMoveFor(goal, v, views);
    const u = match.submit(side, action);
    const rejected = u[side].events.find((e) => e.type === 'action_rejected');
    if (rejected) throw new Error(`planToStep(${seed}, ${goal}): ${JSON.stringify(action)} rejected: ${JSON.stringify(rejected)}`);
  }
  throw new Error(`planToStep(${seed}, ${goal}): not reached`);
}
