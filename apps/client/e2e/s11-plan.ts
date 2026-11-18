// Sprint 11 (U1): a real game (core decks) planned to "the Runner encounters a rezzed
// ICE alone on a remote with these breakers installed and at least N credits". The plain
// Ice Wall + Battering Ram + Gordian Blade case now uses engine-dev's planner goal
// `ice_wall_ram_gordian` (@overclock/match/testing); this local planner stays for the shapes
// that goal does not cover: Ice Wall with Battering Ram and Corroder (two barrier breakers on
// one panel), and Heimdall 1.0 with 7 credits (enough to break all three subroutines).
// Only plays legal actions through LocalMatch (the same engine as the page), so the
// page replays them exactly: no rules here.
import { getCard } from '@overclock/cards';
import type { Action, PlayerView, Side } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';

export interface EncounterGoal {
  /** The ICE met, alone on a remote, rezzed. */
  ice: string;
  /** Rig cards installed first, in order. */
  rig: readonly string[];
  /** The Runner's credits at least, when the run starts. */
  credits: number;
}

/** Two barrier breakers on one panel. */
export const ICE_WALL_RAM_CORRODER: EncounterGoal = { ice: 'c05', rig: ['r17', 'r04'], credits: 5 };
/** Enough credits to pump Battering Ram to 6 (3) and break all three subroutines (2 + 2). */
export const HEIMDALL_RAM_RICH: EncounterGoal = { ice: 'c18', rig: ['r17'], credits: 7 };

export interface EncounterPlan {
  seed: number;
  actions: Action[];
  /** The ICE's server and uid. */
  server: string;
  iceUid: string;
}

const HEDGE_FUND = 'c01';
const MONEY = ['r14', 'r01']; // Sure Gamble, Easy Mark

const decider = (v: PlayerView): Side => v.choice?.waitingOn ?? v.run?.waitingOn ?? v.activePlayer;
const rigHas = (v: PlayerView, id: string) => v.rig.some((c) => c.cardId === id);
const legal = (v: PlayerView, pred: (a: Action) => boolean) => v.legalActions.find(pred);

/** Corp view: ICE `id` alone on a remote (no advancements). */
function loneIce(corp: PlayerView, id: string) {
  for (const s of corp.corpServers) {
    if (!s.id.startsWith('remote') || s.ice.length !== 1) continue;
    const ice = s.ice[0]!;
    if (ice.cardId === id && ice.advancements === 0) return { server: s.id, ice };
  }
  return undefined;
}

function reached(goal: EncounterGoal, corp: PlayerView, runner: PlayerView): boolean {
  const r = runner.run;
  return (
    r?.step === 'encounter' &&
    r.ice?.cardId === goal.ice &&
    goal.rig.every((id) => rigHas(runner, id)) &&
    runner.players.runner.credits >= goal.credits &&
    corp.run?.iceUid === r.iceUid &&
    r.options.some((o) => o.action.type === 'pass' && o.reject === null)
  );
}

function discard(v: PlayerView, keep: (id: string) => number): Action {
  const hand = v.players[v.viewer].hand ?? [];
  const order = hand.map((id, i) => ({ i, k: keep(id) })).sort((a, b) => a.k - b.k || a.i - b.i);
  return { type: 'discard', player: v.viewer, handIndices: order.slice(0, v.pendingDiscard).map((o) => o.i) };
}

function corpMove(goal: EncounterGoal, v: PlayerView): Action {
  const ICE = goal.ice;
  const me = v.players.corp;
  if (v.choice) return v.choice.options.find((o) => o.action.type === 'pass')?.action ?? v.choice.options[0]!.action;
  if (v.run) {
    const rez = v.run.options.find((o) => o.action.type === 'rez' && o.reject === null);
    if (rez && v.run.ice?.cardId === ICE) return rez.action;
    return { type: 'pass', player: 'corp' };
  }
  if (v.phase === 'discard') return discard(v, (id) => (id === ICE ? 3 : id === HEDGE_FUND ? 2 : 0));
  if (me.clicks === 0) return { type: 'end_turn', player: 'corp' };
  const hand = me.hand ?? [];
  if (!loneIce(v, ICE)) {
    const i = hand.indexOf(ICE);
    const install = i >= 0 ? legal(v, (a) => a.type === 'install' && a.handIndex === i && a.server === 'new') : undefined;
    if (install) return install;
    if (me.deckCount > 1) return { type: 'draw', player: 'corp' };
    return { type: 'gain_credit', player: 'corp' };
  }
  // Enough to rez the ICE when the Runner comes (Hedge Fund when it pays).
  if (me.credits < (getCard(ICE)?.cost ?? 1)) {
    const i = hand.indexOf(HEDGE_FUND);
    const fund = i >= 0 && me.credits >= 5 ? legal(v, (a) => a.type === 'play' && a.handIndex === i) : undefined;
    return fund ?? { type: 'gain_credit', player: 'corp' };
  }
  return { type: 'end_turn', player: 'corp' };
}

function runnerMove(goal: EncounterGoal, v: PlayerView, corp: PlayerView): Action {
  const me = v.players.runner;
  if (v.choice) return v.choice.options.find((o) => o.action.type === 'pass')?.action ?? v.choice.options[0]!.action;
  if (v.run) {
    const steal = v.run.options.find((o) => o.action.type === 'steal' && o.reject === null);
    return steal?.action ?? { type: 'pass', player: 'runner' };
  }
  if (v.phase === 'discard') return discard(v, (id) => (goal.rig.includes(id) ? 3 : MONEY.includes(id) ? 1 : 0));
  if (me.clicks === 0) return { type: 'end_turn', player: 'runner' };
  const hand = me.hand ?? [];
  const gain: Action = { type: 'gain_credit', player: 'runner' };
  for (const id of goal.rig) {
    if (rigHas(v, id)) continue;
    const i = hand.indexOf(id);
    if (i < 0) return me.deckCount > 0 ? { type: 'draw', player: 'runner' } : gain;
    return legal(v, (a) => a.type === 'install' && a.handIndex === i) ?? gain;
  }
  if (me.credits < goal.credits) {
    const i = hand.findIndex((id) => MONEY.includes(id));
    return (i >= 0 ? legal(v, (a) => a.type === 'play' && a.handIndex === i) : undefined) ?? gain;
  }
  const wall = loneIce(corp, goal.ice);
  const canRez = wall && (wall.ice.faceUp || corp.players.corp.credits >= (getCard(goal.ice)?.cost ?? 1));
  return wall && canRez ? { type: 'run', player: 'runner', server: wall.server } : { type: 'end_turn', player: 'runner' };
}

/** Plans seed `seed` (core decks) to `goal`'s encounter; throws if not reached. */
export function planEncounter(seed: number, goal: EncounterGoal, maxActions = 600): EncounterPlan {
  const match = new LocalMatch(seed, { deckSet: 'core' });
  for (let n = 0; n < maxActions; n++) {
    const corp = match.view('corp');
    const runner = match.view('runner');
    if (reached(goal, corp, runner)) return { seed, actions: [...match.actions()], server: runner.run!.server, iceUid: runner.run!.iceUid! };
    if (corp.phase === 'over') break;
    const side = decider(corp);
    const action = side === 'corp' ? corpMove(goal, corp) : runnerMove(goal, runner, corp);
    const u = match.submit(side, action);
    const rejected = u[side].events.find((e) => e.type === 'action_rejected');
    if (rejected) throw new Error(`planEncounter(${seed}, ${goal.ice}): ${JSON.stringify(action)} rejected: ${JSON.stringify(rejected)}`);
  }
  throw new Error(`planEncounter(${seed}, ${goal.ice}): not reached`);
}
