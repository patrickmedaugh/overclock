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
import type { Action, DeckSet, GameOptions, PlayerView, Side } from '@overclock/engine';
import { LocalMatch } from './local-match';

/** Sprint 6: pure hidden-information checks (server leak test, Node-side e2e). */
export { runnerEventLeaks, runnerViewLeaks } from './hidden-checks';

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
  /** Sprint 8: the deck set the plan was made with (create the game with the same one). */
  readonly deckSet: DeckSet;
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
 * `maxActions` (e.g. the Corp would run out of cards first). Sprint 8: `deckSet`
 * defaults to `'starter'` (the Sprint 2–7 fixture decks).
 */
export function planBusyBoard(seed: number, goal: BusyBoardGoal = BUSY_BOARD, maxActions = 400, deckSet: DeckSet = 'starter'): BusyBoardPlan {
  const match = new LocalMatch(seed, { deckSet });
  for (let n = 0; n < maxActions; n++) {
    const v = match.view(match.view('corp').activePlayer);
    if (busyBoardReached(v, goal)) {
      return { seed, deckSet, actions: [...match.actions()], activePlayer: v.activePlayer };
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
 * Sprint 4 ("when scored" bonuses, bad publicity):
 * - `corp_score_hostile_takeover`: Corp's action step, an installed Hostile Takeover ready to
 *   score (scoring it does not win). `info: {uid, cardId, server}`.
 * - `corp_score_priority_requisition`: Corp's action step, an installed Priority Requisition
 *   ready to score (scoring it does not win) and at least one face-down ICE installed, so
 *   scoring opens the free-rez choice. `info: {uid, cardId, server, iceUid}` (iceUid = the
 *   first offered ICE).
 * - `runner_run_with_bad_publicity`: Runner's action step with a click left, the Corp has bad
 *   publicity (Hostile Takeover scored) and cards in HQ, so a run on HQ stops at access with
 *   the run-only credits shown. `info: {server: 'hq', badPublicity}`.
 * Sprint 5 (ICE outcome, Last run):
 * - `enigma_encounter`: the Runner encounters a rezzed Enigma (the only ICE on its remote) with
 *   at least 1 click and `pass` (let it fire) offered. `info: {server, iceUid}`.
 * - `neural_katana_encounter`: the same with Neural Katana and at least 3 cards in the Grip
 *   (3 net damage does not flatline). `info: {server, iceUid}`.
 * - `runner_at_access`: the access step of a run on Archives showing at least 2 cards at once.
 *   `info: {server: 'archives', count}`.
 * - `runner_after_access`: Runner's action step after that run (Done tapped, agendas stolen),
 *   `lastRun` lists at least 2 cards, at least 1 click left. `info: {server: 'archives', count}`.
 * Sprint 7 (card abilities; see packages/engine/README.md for the seeds that work):
 * - `corp_rez_asset`: Corp's action step, a face-down PAD Campaign installed and Rez legal
 *   (≥ 2 credits). `info: {uid, cardId, server, cost}`.
 * - `runner_approach_akitaro`: a run waits on the Corp at a face-down Wall of Static in a server
 *   with a face-up Akitaro Watanabe; the Corp has exactly 1 credit, the Rez option costs 1
 *   (S-07-2 AC4 + AC5). `info: {server, iceUid, akitaroUid, cost, corpCredits}`.
 * - `runner_armitage`: Runner's action step, ≥ 1 click, Armitage Codebusting installed with
 *   12 credits on it. `info: {uid, credits}`.
 * - `runner_cyberfeeder_ice_wall`: the Runner encounters a rezzed Ice Wall (no counters) with
 *   Corroder and Cyberfeeder (1 credit on it) installed and 0 credits of his own.
 *   `info: {server, iceUid, breakerUid, cyberfeederUid}`.
 * - `runner_bank_job_remote`: Runner's action step, ≥ 1 click, Bank Job installed with 8 credits,
 *   a remote with no ICE holding a card (a run there gets in). `info: {bankJobUid, server, credits}`.
 * - `corp_ice_wall`: Corp's action step, ≥ 2 clicks and ≥ 3 credits (2 advances + a rez), an
 *   installed Ice Wall with no counters alone on a remote; the Runner has Corroder installed and
 *   ≥ 2 credits (S-07-5 AC1 + AC2). `info: {uid, server, breakerUid}`.
 * - `remote_last_card`: Runner's action step, ≥ 1 click, ≥ 2 remotes, one with no ICE holding
 *   exactly one agenda whose steal does not win (S-07-1). `info: {server, uid, cardId, otherServer}`.
 */
export type StepGoal =
  | 'corp_rez_prompt'
  | 'wall_of_static_encounter'
  | 'agenda_one_advance'
  | 'corp_one_score_from_win'
  | 'runner_one_steal_from_win'
  | 'corp_score_hostile_takeover'
  | 'corp_score_priority_requisition'
  | 'runner_run_with_bad_publicity'
  | 'enigma_encounter'
  | 'neural_katana_encounter'
  | 'runner_at_access'
  | 'runner_after_access'
  | 'corp_rez_asset'
  | 'runner_approach_akitaro'
  | 'runner_armitage'
  | 'runner_cyberfeeder_ice_wall'
  | 'runner_bank_job_remote'
  | 'corp_ice_wall'
  | 'remote_last_card'
  // Sprint 8 (core decks)
  | 'corp_first_install'
  | 'runner_kate_discount'
  | 'corp_rez_adonis'
  | 'adonis_before_corp_turn'
  | 'corp_melange'
  | 'corp_biotic_labor'
  | 'viktor_encounter'
  | 'heimdall_corroder_encounter'
  | 'heimdall_ram_encounter'
  /** Sprint 9: unreachable (Neural Katana left the core deck); `planToStep` throws. Use `pipeline_hunter_encounter`. */
  | 'pipeline_katana_encounter'
  | 'runner_magnum_opus'
  | 'runner_sure_gamble'
  | 'rototurret_two_programs'
  /** Sprint 9: replaces `pipeline_katana_encounter` (Pipeline pumps 3 times to break Hunter). */
  | 'pipeline_hunter_encounter'
  // Sprint 9 (core decks; `SPRINT9_GOALS`)
  | 'hunter_encounter'
  | 'hunter_corp_broke'
  | 'trace_tie'
  | 'runner_tagged_corp_turn'
  | 'runner_tagged_own_turn'
  | 'psf_scored_tagged'
  | 'ichi_two_programs'
  | 'sea_source_ready'
  | 'sea_source_not_ready'
  | 'globalsec_installed'
  | 'globalsec_two_installed'
  // Sprint 10 (core decks; `SPRINT10_GOALS`)
  | 'agenda_at_requirement'
  | 'agenda_one_short'
  | 'ice_wall_advanced'
  | 'corp_two_scored'
  | 'runner_two_stolen'
  | 'psf_installed_unscored'
  | 'runner_tagged_full_rig'
  | 'remote_single_card_no_ice'
  | 'runner_must_discard'
  | 'corp_must_discard';

export const STEP_GOALS: readonly StepGoal[] = [
  'corp_rez_prompt',
  'wall_of_static_encounter',
  'agenda_one_advance',
  'corp_one_score_from_win',
  'runner_one_steal_from_win',
  'corp_score_hostile_takeover',
  'corp_score_priority_requisition',
  'runner_run_with_bad_publicity',
  'enigma_encounter',
  'neural_katana_encounter',
  'runner_at_access',
  'runner_after_access',
  'corp_rez_asset',
  'runner_approach_akitaro',
  'runner_armitage',
  'runner_cyberfeeder_ice_wall',
  'runner_bank_job_remote',
  'corp_ice_wall',
  'remote_last_card',
];

/**
 * Sprint 8 goals, planned on the core decks (identities, 30 cards); seed lists in the README.
 * - `corp_first_install`: Corp's action step with all 3 clicks (nothing installed this turn) and a
 *   legal install of a hand card into a new remote. `info: {handIndex, cardId}`.
 * - `runner_kate_discount`: Runner's action step with all 4 clicks, Corroder and a resource in the
 *   Grip, ≥ 3 credits. `info: {corroderIndex, resourceIndex, resourceId}`.
 * - `corp_rez_adonis`: Corp's action step, a face-down Adonis Campaign with Rez legal (4 credits).
 *   `info: {uid, server, cost}`.
 * - `adonis_before_corp_turn`: Runner's action step (no run), a face-up Adonis Campaign holding
 *   ≥ 3 credits (End turn → the Corp's turn begins with +3). `info: {uid, server, credits}`.
 * - `corp_melange`: Corp's action step with 3 clicks and a face-up Melange Mining Corp.
 *   `info: {uid, server}`.
 * - `corp_biotic_labor`: Corp's action step with 3 clicks, Biotic Labor in HQ, playing it legal.
 *   `info: {handIndex}`.
 * - `viktor_encounter`: the Runner encounters a rezzed Viktor 1.0 (alone on a remote) with no code
 *   gate breaker, ≥ 2 Grip cards, `pass` offered. `info: {server, iceUid}`.
 * - `heimdall_corroder_encounter`: … a rezzed Heimdall 1.0, Corroder installed, ≥ 7 credits.
 *   `info: {server, iceUid, breakerUid}`.
 * - `heimdall_ram_encounter`: … a rezzed Heimdall 1.0, Battering Ram installed, ≥ 5 credits.
 *   `info: {server, iceUid, breakerUid}`.
 * - `pipeline_katana_encounter`: Sprint 9: **retired** (Neural Katana left the core deck); `planToStep` throws.
 * - `pipeline_hunter_encounter` (Sprint 9, replaces it): … a rezzed Hunter, Pipeline installed, ≥ 7 credits
 *   (3 × 2 to reach strength 4, then 1 to break). `info: {server, iceUid, breakerUid}`.
 * - `runner_magnum_opus`: Runner's action step (no run), ≥ 1 click, Magnum Opus installed. `info: {uid}`.
 * - `runner_sure_gamble`: Runner's action step, ≥ 1 click, exactly 5 credits, Sure Gamble in the
 *   Grip. `info: {handIndex}`.
 * - `rototurret_two_programs`: the Runner encounters a rezzed Rototurret with ≥ 2 programs
 *   installed (`pass` → the Corp's `trash_target` choice). `info: {server, iceUid, programs}`
 *   (comma-separated uids, rig order) and `construct` (Sacrificial Construct's uid, or '' when not
 *   installed: then no `prevent_trash`).
 */
export const SPRINT8_GOALS: readonly StepGoal[] = [
  'corp_first_install',
  'runner_kate_discount',
  'corp_rez_adonis',
  'adonis_before_corp_turn',
  'corp_melange',
  'corp_biotic_labor',
  'viktor_encounter',
  'heimdall_corroder_encounter',
  'heimdall_ram_encounter',
  'pipeline_hunter_encounter',
  'runner_magnum_opus',
  'runner_sure_gamble',
  'rototurret_two_programs',
];

/** Sprint 7 goals (their own seed lists in the README). */
export const SPRINT7_GOALS: readonly StepGoal[] = [
  'corp_rez_asset',
  'runner_approach_akitaro',
  'runner_armitage',
  'runner_cyberfeeder_ice_wall',
  'runner_bank_job_remote',
  'corp_ice_wall',
  'remote_last_card',
];

/**
 * Sprint 9 goals (core decks; seeds in the README). Hunter is always alone on a new remote; the
 * Runner (Kate, link 1) runs only that server, so nothing else is stolen.
 * - `hunter_encounter`: the Runner encounters a rezzed Hunter, no sentry breaker, link 1, ≥ 4 credits;
 *   the Corp has ≥ 2 credits (let it fire → the Corp's bid window). `info: {server, iceUid, corpCredits, runnerCredits}`.
 * - `hunter_corp_broke`: the same with the Corp at exactly 0 credits and the Runner at ≥ 2 (let it fire →
 *   the Corp bids 0 at once, straight to the Runner's window). Same `info`.
 * - `trace_tie`: Hunter's trace waits on the Runner's bid (`trace_runner` in the run) with 1 ≤ needed ≤
 *   his max: bidding `needed` ties (escapes), one less gets him tagged. `info: {server, iceUid, needed, strength, link}`.
 * - `runner_tagged_corp_turn`: Corp's action step with 3 clicks and ≥ 2 credits, the Runner tagged with
 *   Armitage Codebusting installed. `info: {armitageUid, tags}`.
 * - `runner_tagged_own_turn`: Runner's action step (no run), tagged, ≥ 1 click, ≥ 2 credits. `info: {tags}`.
 * - `psf_scored_tagged`: Corp's action step with 3 clicks, Private Security Force in its score area, the
 *   Runner tagged. `info: {uid, grip}`: `uid` = `score:corp:<i>`; `grip` = the Runner's Grip size ('0' = the next use flatlines).
 * - `ichi_two_programs`: the Runner encounters a rezzed Ichi 1.0 with ≥ 2 programs installed. `info: {server,
 *   iceUid, programs, construct}` (as `rototurret_two_programs`).
 * - `sea_source_ready`: Corp's action step with 3 clicks and ≥ 3 credits, SEA Source in HQ and playable (a
 *   successful run last turn). `info: {handIndex}`.
 * - `sea_source_not_ready`: the same, but the Runner made no successful run last turn (dimmed). `info: {handIndex}`.
 * - `globalsec_installed` / `globalsec_two_installed`: Runner's action step, ≥ 1 click, exactly 1 / 2 Access to
 *   Globalsec installed (link 2 / 3), Hunter installed on a remote the Corp can rez (or face up).
 *   `info: {uids, link, hunterServer}`.
 */
export const SPRINT9_GOALS: readonly StepGoal[] = [
  'hunter_encounter',
  'hunter_corp_broke',
  'trace_tie',
  'runner_tagged_corp_turn',
  'runner_tagged_own_turn',
  'psf_scored_tagged',
  'ichi_two_programs',
  'sea_source_ready',
  'sea_source_not_ready',
  'globalsec_installed',
  'globalsec_two_installed',
];

/**
 * Sprint 10 goals (core decks; seeds in the README). The Runner never runs unless the goal needs it.
 * - `agenda_at_requirement`: Corp's action step, ≥ 1 click, ≥ 1 credit, an installed agenda with exactly its
 *   requirement in counters (options: only Score). `info: {uid, server, cardId, advancements}`.
 * - `agenda_one_short`: the same with one counter short (options: only Advance, legal). Same `info`.
 * - `ice_wall_advanced`: Corp's action step, ≥ 1 click, ≥ 1 credit, an installed Ice Wall with ≥ 1 counter,
 *   Advance legal. `info: {uid, server, advancements}`.
 * - `corp_two_scored`: Corp's action step, ≥ 1 click, ≥ 2 agendas in the Corp score area, one of them Private
 *   Security Force. `info: {count, points, scored (ids, comma-separated), psfUid: 'score:corp:<i>'}`.
 * - `runner_two_stolen`: Runner's action step (no run), ≥ 1 click, ≥ 2 agendas in his score area.
 *   `info: {count, points, scored}`.
 * - `psf_installed_unscored`: Corp's action step, ≥ 1 click, ≥ 1 credit, Private Security Force installed with
 *   < 4 counters (Advance legal). `info: {uid, server, advancements}`.
 * - `runner_tagged_full_rig`: Runner's action step (no run), tagged, ≥ 4 rig cards including exactly one Access
 *   to Globalsec (link 2). `info: {tags, link, rig (count), globalsecUid}`.
 * - `remote_single_card_no_ice`: Runner's action step, ≥ 1 click, a remote with no ICE holding exactly one card
 *   the Runner can take (an agenda whose steal does not win, or a card he can afford to trash), with another
 *   remote after it in server order. `info: {server, uid, cardId, kind: 'steal' | 'trash', otherServer}`.
 * - `runner_must_discard` / `corp_must_discard`: that side's discard step at the end of its turn, ≥ 2 cards to
 *   discard. `info: {count, hand}` (`hand` = hand size).
 */
export const SPRINT10_GOALS: readonly StepGoal[] = [
  'agenda_at_requirement',
  'agenda_one_short',
  'ice_wall_advanced',
  'corp_two_scored',
  'runner_two_stolen',
  'psf_installed_unscored',
  'runner_tagged_full_rig',
  'remote_single_card_no_ice',
  'runner_must_discard',
  'corp_must_discard',
];

export interface StepPlan {
  readonly seed: number;
  readonly goal: StepGoal;
  /** Sprint 8: the deck set the plan was made with (create the game with the same options). */
  readonly deckSet: DeckSet;
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
  return v.choice?.waitingOn ?? v.run?.waitingOn ?? v.activePlayer;
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

/** Face-down ICE installed (Corp view). */
function faceDownIce(v: PlayerView) {
  return corpInstalled(v).filter((c) => c.zone === 'ice' && !c.faceUp);
}

/** Sprint 4 goals: the agenda each one works on. */
const BONUS_TARGET: Partial<Record<StepGoal, string>> = {
  corp_score_hostile_takeover: 'c08',
  corp_score_priority_requisition: 'c10',
  runner_run_with_bad_publicity: 'c08',
};

/** An installed `cardId` agenda ready to score whose points do not win yet (Corp view). */
function readyBonus(v: PlayerView, cardId: string) {
  return agendas(v).find((a) => a.cardId === cardId && a.advancements >= a.need && v.players.corp.points + a.points < WIN);
}

/** Encounter goals: the ICE each one wants the Runner to meet (rezzed). */
const ENCOUNTER_TARGET: Partial<Record<StepGoal, string>> = {
  wall_of_static_encounter: 'c04',
  enigma_encounter: 'c06',
  neural_katana_encounter: 'c07',
  runner_cyberfeeder_ice_wall: 'c05',
};

// ---- Sprint 7 helpers ----

/** The first rig card with `cardId`. */
const rigCard = (v: PlayerView, cardId: string) => v.rig.find((c) => c.cardId === cardId);

/** Corp view: the server holding a face-up Akitaro Watanabe, and the face-down Wall of Static protecting it. */
function akitaroSetup(corp: PlayerView) {
  const sv = corp.corpServers.find((s) => s.content.some((c) => c.cardId === 'c11' && c.faceUp));
  const akitaro = sv?.content.find((c) => c.cardId === 'c11');
  const wall = sv?.ice.find((c) => c.cardId === 'c04' && !c.faceUp);
  return { sv, akitaro, wall };
}

/** Remotes with no ICE and exactly one card (Corp view). */
function lonelyRemotes(corp: PlayerView) {
  return remotes(corp).filter((s) => s.ice.length === 0 && s.content.length === 1);
}

/** Corp view: an Ice Wall with no counters alone on a remote. */
function loneIceWall(corp: PlayerView) {
  for (const s of remotes(corp)) {
    if (s.ice.length === 1 && s.ice[0]!.cardId === 'c05' && s.ice[0]!.advancements === 0) return { server: s.id, ice: s.ice[0]! };
  }
  return undefined;
}

/** Sprint 5: the Runner meets rezzed `iceId` with a click left and `pass` (let it fire) offered. */
function letFireEncounter(runner: PlayerView, iceId: string): boolean {
  return (
    runner.run?.step === 'encounter' &&
    runner.run.ice?.cardId === iceId &&
    runner.players.runner.clicks >= 1 &&
    runner.run.options.some((o) => o.action.type === 'pass' && o.reject === null)
  );
}

/** Sprint 5 Archives goals: how many cards Archives must show at once. */
const ARCHIVES_MIN = 2;

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
    case 'corp_score_hostile_takeover':
      return corp.phase === 'action' && corp.activePlayer === 'corp' && readyBonus(corp, 'c08') !== undefined;
    case 'corp_score_priority_requisition':
      return (
        corp.phase === 'action' &&
        corp.activePlayer === 'corp' &&
        readyBonus(corp, 'c10') !== undefined &&
        faceDownIce(corp).length > 0
      );
    case 'runner_run_with_bad_publicity':
      return (
        runner.phase === 'action' &&
        runner.activePlayer === 'runner' &&
        runner.players.runner.clicks >= 1 &&
        runner.badPublicity >= 1 &&
        runner.players.corp.handCount > 0
      );
    case 'enigma_encounter':
      return letFireEncounter(runner, 'c06');
    case 'neural_katana_encounter':
      return letFireEncounter(runner, 'c07') && runner.players.runner.handCount >= 3;
    case 'runner_at_access':
      return runner.run?.step === 'access' && runner.run.server === 'archives' && (runner.run.access?.cards.length ?? 0) >= ARCHIVES_MIN;
    case 'runner_after_access':
      return (
        runner.phase === 'action' &&
        runner.activePlayer === 'runner' &&
        runner.run === null &&
        runner.players.runner.clicks >= 1 &&
        (runner.lastRun?.cards.length ?? 0) >= ARCHIVES_MIN
      );
    case 'corp_rez_asset':
      return corp.phase === 'action' && corp.activePlayer === 'corp' && padRez(corp) !== undefined;
    case 'runner_approach_akitaro': {
      const { wall } = akitaroSetup(corp);
      const rez = corp.run?.options.find((o) => o.action.type === 'rez');
      return (
        corp.run?.step === 'approach' &&
        corp.run.waitingOn === 'corp' &&
        wall !== undefined &&
        corp.run.iceUid === wall.uid &&
        corp.players.corp.credits === 1 &&
        rez?.cost === 1 &&
        rez.reject === null
      );
    }
    case 'runner_armitage':
      return (
        runner.phase === 'action' &&
        runner.activePlayer === 'runner' &&
        runner.run === null &&
        runner.players.runner.clicks >= 1 &&
        (rigCard(runner, 'r02')?.hostedCredits ?? 0) === 12
      );
    case 'runner_cyberfeeder_ice_wall':
      return (
        runner.run?.step === 'encounter' &&
        runner.run.ice?.cardId === 'c05' &&
        runner.run.ice.strength === 1 &&
        rigCard(runner, 'r04') !== undefined &&
        (rigCard(runner, 'r08')?.hostedCredits ?? 0) >= 1 &&
        runner.players.runner.credits === 0
      );
    case 'runner_bank_job_remote':
      return (
        runner.phase === 'action' &&
        runner.activePlayer === 'runner' &&
        runner.run === null &&
        runner.players.runner.clicks >= 1 &&
        (rigCard(runner, 'r10')?.hostedCredits ?? 0) === 8 &&
        remotes(corp).some((s) => s.ice.length === 0 && s.content.length > 0)
      );
    case 'corp_ice_wall':
      return (
        corp.phase === 'action' &&
        corp.activePlayer === 'corp' &&
        corp.players.corp.clicks >= 2 &&
        corp.players.corp.credits >= 3 &&
        loneIceWall(corp) !== undefined &&
        rigCard(runner, 'r04') !== undefined &&
        runner.players.runner.credits >= 2
      );
    case 'remote_last_card':
      return (
        runner.phase === 'action' &&
        runner.activePlayer === 'runner' &&
        runner.run === null &&
        runner.players.runner.clicks >= 1 &&
        remotes(corp).length >= 2 &&
        lastCardTarget(corp, runner) !== undefined
      );
    default:
      return coreReached(goal, views);
  }
}

// ---- Sprint 8 (core decks) ------------------------------------------------------------

/** Encounter goals: the ICE (alone on a new remote), the rig the Runner needs, his credits and Grip. */
interface CoreEncounter {
  readonly ice: string;
  readonly rig: readonly string[];
  /** Install this many programs (any), Rototurret. */
  readonly programs?: number;
  readonly credits: number;
  readonly hand: number;
}

const CORE_ENCOUNTER: Partial<Record<StepGoal, CoreEncounter>> = {
  viktor_encounter: { ice: 'c17', rig: [], credits: 0, hand: 2 },
  heimdall_corroder_encounter: { ice: 'c18', rig: ['r04'], credits: 7, hand: 0 },
  heimdall_ram_encounter: { ice: 'c18', rig: ['r17'], credits: 5, hand: 0 },
  pipeline_hunter_encounter: { ice: 'c20', rig: ['r16'], credits: 7, hand: 0 },
  rototurret_two_programs: { ice: 'c19', rig: [], programs: 2, credits: 0, hand: 0 },
  ichi_two_programs: { ice: 'c21', rig: [], programs: 2, credits: 0, hand: 0 },
};

const isProgram = (id: string | null | undefined) => typeOf(id ?? '') === 'program';
const isResource = (id: string | null | undefined) => typeOf(id ?? '') === 'resource';
const corpAction = (corp: PlayerView) => corp.phase === 'action' && corp.activePlayer === 'corp';
const runnerAction = (runner: PlayerView) => runner.phase === 'action' && runner.activePlayer === 'runner' && runner.run === null;

/** Corp view: the first installed card `cardId` (with its server). */
const corpCard = (corp: PlayerView, cardId: string) => corpInstalled(corp).find((c) => c.cardId === cardId);

function coreEncounterReached(goal: StepGoal, corp: PlayerView, runner: PlayerView): boolean {
  const spec = CORE_ENCOUNTER[goal]!;
  const r = runner.run;
  if (r?.step !== 'encounter' || r.ice?.cardId !== spec.ice || !runner.run!.options.some((o) => o.action.type === 'pass' && o.reject === null)) return false;
  if (corp.run?.iceUid !== r.iceUid) return false;
  if (!spec.rig.every((id) => rigCard(runner, id))) return false;
  if (spec.programs !== undefined && runner.rig.filter((c) => isProgram(c.cardId)).length < spec.programs) return false;
  if (goal === 'viktor_encounter' && runner.rig.some((c) => card(c.cardId)?.subtype === 'breaker_code_gate')) return false;
  return runner.players.runner.credits >= spec.credits && runner.players.runner.handCount >= spec.hand;
}

function coreReached(goal: StepGoal, views: Views): boolean {
  const { corp, runner } = views;
  if (CORE_ENCOUNTER[goal]) return coreEncounterReached(goal, corp, runner);
  if (SPRINT9_GOALS.includes(goal)) return s9Reached(goal, views);
  if (SPRINT10_GOALS.includes(goal)) return s10Reached(goal, views);
  const hand = (v: PlayerView) => v.players[v.viewer].hand ?? [];
  switch (goal) {
    case 'corp_first_install':
      return corpAction(corp) && corp.players.corp.clicks === 3 && firstInstall(corp) !== undefined;
    case 'runner_kate_discount': {
      const h = hand(runner);
      return runnerAction(runner) && runner.players.runner.clicks === 4 && h.includes('r04') && h.some(isResource) && runner.players.runner.credits >= 3;
    }
    case 'corp_rez_adonis': {
      const a = corpInstalled(corp).find((c) => c.cardId === 'c14' && !c.faceUp);
      return corpAction(corp) && a !== undefined && corp.installedOptions[a.uid]?.some((o) => o.action.type === 'rez' && o.reject === null) === true;
    }
    case 'adonis_before_corp_turn':
      return runnerAction(runner) && corpInstalled(corp).some((c) => c.cardId === 'c14' && c.faceUp && c.hostedCredits >= 3);
    case 'corp_melange':
      return corpAction(corp) && corp.players.corp.clicks === 3 && corpInstalled(corp).some((c) => c.cardId === 'c15' && c.faceUp);
    case 'corp_biotic_labor':
      return corpAction(corp) && corp.players.corp.clicks === 3 && bioticPlay(corp) !== undefined;
    case 'runner_magnum_opus':
      return runnerAction(runner) && runner.players.runner.clicks >= 1 && rigCard(runner, 'r15') !== undefined;
    case 'runner_sure_gamble':
      return runnerAction(runner) && runner.players.runner.clicks >= 1 && runner.players.runner.credits === 5 && hand(runner).includes('r14');
    default:
      return false;
  }
}

/** Corp view: a legal install of a hand card into a new remote (the first one offered). */
function firstInstall(corp: PlayerView) {
  return corp.legalActions.find((a) => a.type === 'install' && a.server === 'new');
}

/** Corp view: playing Biotic Labor, when legal. */
function bioticPlay(corp: PlayerView) {
  const i = (corp.players.corp.hand ?? []).indexOf('c16');
  return i >= 0 ? corp.legalActions.find((a) => a.type === 'play' && a.handIndex === i) : undefined;
}

function coreInfo(goal: StepGoal, views: Views): Record<string, string> {
  const { corp, runner } = views;
  if (SPRINT9_GOALS.includes(goal) && !CORE_ENCOUNTER[goal]) return s9Info(goal, views);
  if (SPRINT10_GOALS.includes(goal)) return s10Info(goal, views);
  if (CORE_ENCOUNTER[goal]) {
    const r = runner.run!;
    const info: Record<string, string> = { server: r.server, iceUid: r.iceUid ?? '' };
    const breaker = CORE_ENCOUNTER[goal]!.rig[0];
    if (breaker) info.breakerUid = rigCard(runner, breaker)!.uid;
    if (goal === 'rototurret_two_programs' || goal === 'ichi_two_programs') {
      info.programs = runner.rig.filter((c) => isProgram(c.cardId)).map((c) => c.uid).join(',');
      info.construct = rigCard(runner, 'r12')?.uid ?? '';
    }
    return info;
  }
  switch (goal) {
    case 'corp_first_install': {
      const a = firstInstall(corp)!;
      const i = a.type === 'install' ? a.handIndex : -1;
      return { handIndex: String(i), cardId: (corp.players.corp.hand ?? [])[i] ?? '' };
    }
    case 'runner_kate_discount': {
      const h = runner.players.runner.hand ?? [];
      const ri = h.findIndex(isResource);
      return { corroderIndex: String(h.indexOf('r04')), resourceIndex: String(ri), resourceId: h[ri] ?? '' };
    }
    case 'corp_rez_adonis': {
      const a = corpInstalled(corp).find((c) => c.cardId === 'c14' && !c.faceUp)!;
      return { uid: a.uid, server: a.server, cost: String(corp.installedOptions[a.uid]!.find((o) => o.action.type === 'rez')!.cost) };
    }
    case 'adonis_before_corp_turn': {
      const a = corpInstalled(corp).find((c) => c.cardId === 'c14' && c.faceUp && c.hostedCredits >= 3)!;
      return { uid: a.uid, server: a.server, credits: String(a.hostedCredits) };
    }
    case 'corp_melange': {
      const m = corpInstalled(corp).find((c) => c.cardId === 'c15' && c.faceUp)!;
      return { uid: m.uid, server: m.server };
    }
    case 'corp_biotic_labor': {
      const a = bioticPlay(corp)!;
      return { handIndex: String(a.type === 'play' ? a.handIndex : -1) };
    }
    case 'runner_magnum_opus':
      return { uid: rigCard(runner, 'r15')!.uid };
    case 'runner_sure_gamble':
      return { handIndex: String((runner.players.runner.hand ?? []).indexOf('r14')) };
    default:
      return {};
  }
}

/** Sprint 8: answer a choice the plan did not aim for: the first offered legal move (Skip for free rez). */
function choiceAnswer(v: PlayerView): Action {
  const opts = (v.choice?.options ?? []).filter((o) => o.reject === null).map((o) => o.action);
  return opts.find((a) => a.type === 'pass') ?? opts[0] ?? { type: 'pass', player: v.viewer };
}

/** Sprint 8 Corp policies (core decks, outside runs). */
function corpCoreMove(goal: StepGoal, v: PlayerView): Action {
  const me = v.players.corp;
  const enc = CORE_ENCOUNTER[goal];
  const want: Record<string, number> = enc ? { [enc.ice]: 3, c01: 2 } : goal === 'corp_biotic_labor' ? { c16: 3, c01: 2 } : { c14: 3, c15: 3, c01: 2 };
  if (v.phase === 'discard') return discardKeeping(v, (id) => want[id] ?? 0);
  const end: Action = { type: 'end_turn', player: 'corp' };
  const gain: Action = { type: 'gain_credit', player: 'corp' };
  const installNewOf = (id: string): Action | undefined => {
    const i = handIdx(v, (x) => x === id);
    return i >= 0 ? installNew(v, i) : undefined;
  };
  const fund = (): Action | undefined => {
    const i = handIdx(v, (x) => x === 'c01');
    return i >= 0 && me.credits >= 5 ? legal(v, (a) => a.type === 'play' && a.handIndex === i) : undefined;
  };
  const rezIt = (uid: string) => v.installedOptions[uid]?.find((o) => o.action.type === 'rez' && o.reject === null)?.action;
  if (enc) {
    if (me.clicks === 0) return end;
    const ice = corpInstalled(v).find((c) => c.zone === 'ice' && c.cardId === enc.ice);
    if (!ice) return installNewOf(enc.ice) ?? basicMove(v, 1);
    const cost = card(enc.ice)?.cost ?? 0;
    if (!ice.faceUp && me.credits < cost) return fund() ?? gain;
    return end;
  }
  switch (goal) {
    case 'corp_first_install':
      return end; // reached at the start of a Corp turn
    case 'corp_rez_adonis': {
      if (me.clicks === 0) return end;
      if (!corpCard(v, 'c14')) return installNewOf('c14') ?? basicMove(v, 2);
      return fund() ?? gain;
    }
    case 'adonis_before_corp_turn': {
      const a = corpCard(v, 'c14');
      if (a && !a.faceUp) return rezIt(a.uid) ?? (me.clicks > 0 ? (fund() ?? gain) : end);
      if (me.clicks === 0 || a) return end;
      return installNewOf('c14') ?? basicMove(v, 2);
    }
    case 'corp_melange': {
      const m = corpCard(v, 'c15');
      if (m && !m.faceUp) return rezIt(m.uid) ?? (me.clicks > 0 ? gain : end);
      if (me.clicks === 0 || m) return end;
      return installNewOf('c15') ?? basicMove(v, 2);
    }
    case 'corp_biotic_labor': {
      if (me.clicks === 0) return end;
      if (handIdx(v, (x) => x === 'c16') >= 0) return me.credits < 4 ? (fund() ?? gain) : end;
      return basicMove(v, 2);
    }
    default:
      return end; // Runner-side goals: the Corp stays out of the way
  }
}

/** Sprint 8 Runner policies (core decks, outside runs). */
function runnerCoreMove(goal: StepGoal, v: PlayerView, views: Views): Action {
  const me = v.players.runner;
  const hand = me.hand ?? [];
  const enc = CORE_ENCOUNTER[goal];
  const keep = (id: string) => {
    if (enc) return enc.rig.includes(id) || (enc.programs && isProgram(id)) || id === 'r12' ? 3 : id === 'r14' || id === 'r01' ? 1 : 0;
    if (goal === 'runner_kate_discount') return id === 'r04' || isResource(id) ? 3 : 0;
    if (goal === 'runner_sure_gamble') return id === 'r14' ? 3 : 0;
    if (goal === 'runner_magnum_opus') return id === 'r15' ? 3 : 0;
    return 0;
  };
  if (v.phase === 'discard') return discardKeeping(v, keep);
  const end: Action = { type: 'end_turn', player: 'runner' };
  if (me.clicks === 0) return end;
  const draw: Action = me.deckCount > 0 ? { type: 'draw', player: 'runner' } : end;
  const gain: Action = { type: 'gain_credit', player: 'runner' };
  const installOf = (pred: (id: string) => boolean): Action | undefined => {
    const i = hand.findIndex(pred);
    return i >= 0 ? (installNew(v, i) ?? gain) : undefined;
  };
  const money = (): Action => {
    const i = hand.findIndex((id) => id === 'r14' || id === 'r01');
    const play = i >= 0 ? legal(v, (a) => a.type === 'play' && a.handIndex === i) : undefined;
    return play ?? gain;
  };
  if (enc) {
    for (const id of enc.rig) {
      if (rigCard(v, id)) continue;
      return installOf((x) => x === id) ?? draw;
    }
    const programs = v.rig.filter((c) => isProgram(c.cardId)).length;
    if (enc.programs !== undefined && programs < enc.programs) {
      const fits = installOf((x) => isProgram(x) && legal(v, (a) => a.type === 'install' && hand[a.handIndex] === x) !== undefined);
      if (fits) return fits;
      if (hand.some(isProgram)) return gain;
      return draw;
    }
    if (enc.programs !== undefined && !rigCard(v, 'r12') && hand.includes('r12')) return installOf((x) => x === 'r12')!;
    if (me.handCount < enc.hand) return draw;
    if (me.credits < enc.credits) return money();
    const corp = views.corp;
    const ice = corpInstalled(corp).find((c) => c.zone === 'ice' && c.cardId === enc.ice);
    const corpCanRez = ice && (ice.faceUp || corp.players.corp.credits >= (card(enc.ice)?.cost ?? 99));
    return ice && corpCanRez ? { type: 'run', player: 'runner', server: ice.server } : end;
  }
  switch (goal) {
    case 'runner_kate_discount':
      // Never install: the goal is the start of a turn with Corroder and a resource in the Grip.
      if (hand.includes('r04') && hand.some(isResource)) return me.credits < 3 ? gain : end;
      return draw;
    case 'runner_sure_gamble':
      return hand.includes('r14') ? end : draw;
    case 'runner_magnum_opus':
      if (rigCard(v, 'r15')) return end;
      return hand.includes('r15') ? (installOf((x) => x === 'r15') ?? gain) : draw;
    default:
      return end; // Corp-side goals: the Runner stays out of the way
  }
}

/** A face-down PAD Campaign whose Rez is legal now (Corp view). */
function padRez(corp: PlayerView) {
  const pad = corpInstalled(corp).find((c) => c.cardId === 'c03' && !c.faceUp);
  const opt = pad ? corp.installedOptions[pad.uid]?.find((o) => o.action.type === 'rez') : undefined;
  return pad && opt?.reject === null ? { pad, cost: opt.cost } : undefined;
}

/** An ICE-less remote holding exactly one agenda whose steal does not win. */
function lastCardTarget(corp: PlayerView, runner: PlayerView) {
  for (const s of lonelyRemotes(corp)) {
    const c = s.content[0]!;
    const def = card(c.cardId);
    if (def?.type === 'agenda' && runner.players.runner.points + (def.agendaPoints ?? 0) < WIN) return { server: s.id, card: c };
  }
  return undefined;
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
    case 'corp_score_hostile_takeover': {
      const a = readyBonus(corp, 'c08')!;
      return { uid: a.uid, cardId: a.cardId!, server: a.server };
    }
    case 'corp_score_priority_requisition': {
      const a = readyBonus(corp, 'c10')!;
      return { uid: a.uid, cardId: a.cardId!, server: a.server, iceUid: faceDownIce(corp)[0]!.uid };
    }
    case 'runner_run_with_bad_publicity':
      return { server: 'hq', badPublicity: String(runner.badPublicity) };
    case 'enigma_encounter':
    case 'neural_katana_encounter':
      return { server: runner.run!.server, iceUid: runner.run!.iceUid ?? '' };
    case 'runner_at_access':
      return { server: 'archives', count: String(runner.run!.access!.cards.length) };
    case 'runner_after_access':
      return { server: runner.lastRun!.server, count: String(runner.lastRun!.cards.length) };
    case 'corp_rez_asset': {
      const { pad, cost } = padRez(corp)!;
      return { uid: pad.uid, cardId: 'c03', server: pad.server, cost: String(cost) };
    }
    case 'runner_approach_akitaro': {
      const { sv, akitaro, wall } = akitaroSetup(corp);
      return { server: sv!.id, iceUid: wall!.uid, akitaroUid: akitaro!.uid, cost: '1', corpCredits: '1' };
    }
    case 'runner_armitage':
      return { uid: rigCard(runner, 'r02')!.uid, credits: '12' };
    case 'runner_cyberfeeder_ice_wall':
      return {
        server: runner.run!.server,
        iceUid: runner.run!.iceUid ?? '',
        breakerUid: rigCard(runner, 'r04')!.uid,
        cyberfeederUid: rigCard(runner, 'r08')!.uid,
      };
    case 'runner_bank_job_remote': {
      const s = remotes(corp).find((x) => x.ice.length === 0 && x.content.length > 0)!;
      return { bankJobUid: rigCard(runner, 'r10')!.uid, server: s.id, credits: '8' };
    }
    case 'corp_ice_wall': {
      const w = loneIceWall(corp)!;
      return { uid: w.ice.uid, server: w.server, breakerUid: rigCard(runner, 'r04')!.uid };
    }
    case 'remote_last_card': {
      const t = lastCardTarget(corp, runner)!;
      const other = remotes(corp).find((s) => s.id !== t.server)!;
      return { server: t.server, uid: t.card.uid, cardId: t.card.cardId!, otherServer: other.id };
    }
    default:
      return coreInfo(goal, views);
  }
}

const isAgendaId = (id: string) => typeOf(id) === 'agenda';

// -- per-goal policies (both seats; may read both views: a test helper, not an AI) --

/**
 * Sprint 4 goals: work on one agenda (Hostile Takeover or Priority Requisition): install it,
 * advance it (Hedge Fund for money), make sure face-down ICE is on the table for Priority
 * Requisition, and for the bad-publicity goal score Hostile Takeover and pass the turn.
 */
function corpBonusMove(goal: StepGoal, v: PlayerView, target: string): Action {
  const me = v.players.corp;
  if (v.phase === 'discard') {
    return discardKeeping(v, (id) => (id === target ? 3 : typeOf(id) === 'ice' && goal === 'corp_score_priority_requisition' ? 2 : id === 'c01' ? 1 : 0));
  }
  if (me.clicks === 0) return { type: 'end_turn', player: 'corp' };
  if (goal === 'runner_run_with_bad_publicity') {
    if (v.badPublicity >= 1) return { type: 'end_turn', player: 'corp' };
    const ready = readyBonus(v, target);
    if (ready) return { type: 'score', player: 'corp', uid: ready.uid };
  }
  if (goal === 'corp_score_priority_requisition' && faceDownIce(v).length === 0) {
    const i = handIdx(v, (id) => typeOf(id) === 'ice');
    const install = i >= 0 ? installNew(v, i) : undefined;
    if (install) return install;
  }
  const fund = handIdx(v, (id) => id === 'c01');
  if (fund >= 0 && me.credits >= 5 && me.credits < 10) return { type: 'play', player: 'corp', handIndex: fund };
  const working = agendas(v)
    .filter((a) => a.cardId === target && a.advancements < a.need)
    .sort((a, b) => b.advancements - a.advancements)[0];
  if (working) return me.credits >= 1 ? { type: 'advance', player: 'corp', uid: working.uid } : { type: 'gain_credit', player: 'corp' };
  if (!readyBonus(v, target)) {
    const i = handIdx(v, (id) => id === target);
    const install = i >= 0 ? installNew(v, i) : undefined;
    if (install) return install;
  }
  return basicMove(v, 3);
}

/**
 * Sprint 5 encounter goals: install `iceId` alone on a new remote, keep enough credits to rez it,
 * then pass the turn. Draws down to 1 card (the next turn's draw), so even a single copy in the
 * last R&D position is found (installed on the turn it is drawn).
 */
function corpEncounterMove(v: PlayerView, iceId: string): Action {
  const me = v.players.corp;
  if (v.phase === 'discard') return discardKeeping(v, (id) => (id === iceId ? 2 : 0));
  if (me.clicks === 0) return { type: 'end_turn', player: 'corp' };
  const ice = corpInstalled(v).find((c) => c.zone === 'ice' && c.cardId === iceId);
  if (ice) {
    if (!ice.faceUp && me.credits < (card(iceId)?.cost ?? 0)) return { type: 'gain_credit', player: 'corp' };
    return { type: 'end_turn', player: 'corp' };
  }
  const i = handIdx(v, (id) => id === iceId);
  const install = i >= 0 ? installNew(v, i) : undefined;
  if (install) return install;
  return basicMove(v, 1);
}

/** Sprint 5 Archives goals: fill Archives (operations played, non-agendas discarded first); never install. */
function corpArchivesMove(v: PlayerView): Action {
  const me = v.players.corp;
  if (v.phase === 'discard') return discardKeeping(v, (id) => (isAgendaId(id) ? 2 : 0));
  if (me.clicks === 0) return { type: 'end_turn', player: 'corp' };
  const play = legal(v, (a) => a.type === 'play');
  if (play) return play;
  return basicMove(v, 3);
}

/** Sprint 7: cards each goal's seats keep when discarding. */
const KEEP7: Partial<Record<StepGoal, Readonly<Record<string, number>>>> = {
  corp_rez_asset: { c03: 3 },
  runner_approach_akitaro: { c11: 3, c04: 3, c08: 1, c09: 1, c10: 1 },
  corp_ice_wall: { c05: 3 },
  remote_last_card: { c08: 2, c09: 2, c10: 2 },
  runner_bank_job_remote: { c08: 2, c09: 2, c10: 2, c03: 2 },
  runner_armitage: { r02: 3 },
  runner_cyberfeeder_ice_wall: { r08: 3, r04: 3, r09: 2, r02: 2, r10: 2 },
};

const keepFor = (goal: StepGoal) => (id: string) => KEEP7[goal]?.[id] ?? 0;

/** Sprint 7 Corp policies (outside runs). */
function corpSprint7Move(goal: StepGoal, v: PlayerView): Action {
  const me = v.players.corp;
  if (v.phase === 'discard') return discardKeeping(v, keepFor(goal));
  const end: Action = { type: 'end_turn', player: 'corp' };
  const installNewOf = (pred: (id: string) => boolean): Action | undefined => {
    const i = handIdx(v, pred);
    return i >= 0 ? installNew(v, i) : undefined;
  };
  if (goal === 'runner_approach_akitaro') {
    const aki = corpInstalled(v).find((c) => c.cardId === 'c11');
    if (aki && !aki.faceUp) {
      const rez = v.installedOptions[aki.uid]?.find((o) => o.action.type === 'rez' && o.reject === null);
      if (rez) return rez.action; // no click needed
    }
    if (me.clicks === 0) return end;
    // Spare clicks keep the Corp's credits at `target` (2 before Akitaro is face up, then 1: S-07-2 AC5),
    // spending extra credits on advances, and look for the cards.
    const target = aki?.faceUp ? 1 : 2;
    const spare = (): Action => {
      if (me.credits > target) {
        const adv = legal(v, (x) => x.type === 'advance');
        if (adv) return adv;
        const agenda = installNewOf(isAgendaId);
        if (agenda) return agenda;
      }
      if (me.credits < target) return { type: 'gain_credit', player: 'corp' };
      return me.deckCount > 1 ? { type: 'draw', player: 'corp' } : end;
    };
    if (!aki) return installNewOf((id) => id === 'c11') ?? spare();
    if (!aki.faceUp) return { type: 'gain_credit', player: 'corp' };
    const { sv, wall } = akitaroSetup(v);
    if (!wall) {
      const i = handIdx(v, (id) => id === 'c04');
      const there = i >= 0 ? legal(v, (x) => x.type === 'install' && x.handIndex === i && x.server === sv!.id) : undefined;
      return there ?? spare();
    }
    // Ready: end the turn at exactly 1 credit.
    return me.credits === 1 ? end : spare();
  }
  if (me.clicks === 0) return end;
  switch (goal) {
    case 'corp_rez_asset': {
      if (corpInstalled(v).some((c) => c.cardId === 'c03' && !c.faceUp)) return { type: 'gain_credit', player: 'corp' };
      return installNewOf((id) => id === 'c03') ?? basicMove(v, 2);
    }
    case 'corp_ice_wall': {
      if (!loneIceWall(v)) return installNewOf((id) => id === 'c05') ?? basicMove(v, 2);
      return me.credits < 3 ? { type: 'gain_credit', player: 'corp' } : end;
    }
    case 'remote_last_card':
      return installNewOf((id) => isAgendaId(id)) ?? basicMove(v, 1);
    case 'runner_bank_job_remote':
      if (remotes(v).some((s) => s.ice.length === 0 && s.content.length > 0)) return end;
      return installNewOf((id) => isAgendaId(id) || id === 'c03') ?? basicMove(v, 2);
    default:
      return end; // runner_armitage: the Corp stays out of the way
  }
}

/** Sprint 7 Runner policies (outside runs). */
function runnerSprint7Move(goal: StepGoal, v: PlayerView, views: Views): Action {
  const me = v.players.runner;
  if (v.phase === 'discard') return discardKeeping(v, keepFor(goal));
  const end: Action = { type: 'end_turn', player: 'runner' };
  if (me.clicks === 0) return end;
  /** Installs the first of `ids` not in the rig yet (gaining credits for it), or draws to find it; null when all are in. */
  const want = (ids: string[]): Action | null => {
    for (const id of ids) {
      if (rigCard(v, id)) continue;
      const i = handIdx(v, (x) => x === id);
      if (i < 0) return me.deckCount > 0 ? { type: 'draw', player: 'runner' } : end;
      return installNew(v, i) ?? { type: 'gain_credit', player: 'runner' };
    }
    return null;
  };
  const corp = views.corp;
  switch (goal) {
    case 'runner_armitage':
      return want(['r02']) ?? end;
    case 'runner_bank_job_remote':
      return want(['r10']) ?? end;
    case 'corp_ice_wall':
      return want(['r04']) ?? (me.credits < 2 ? { type: 'gain_credit', player: 'runner' } : end);
    case 'runner_cyberfeeder_ice_wall': {
      const w = want(['r08', 'r04']);
      if (w) return w;
      if (me.credits > 0) {
        // Spend down to 0 own credits (AC: no credits of his own) on a card costing what is left or less.
        const drain = legal(v, (a) => a.type === 'install' && (card((me.hand ?? [])[a.handIndex])?.cost ?? 0) > 0);
        if (drain) return drain;
        return me.deckCount > 0 ? { type: 'draw', player: 'runner' } : end;
      }
      const ice = corpInstalled(corp).find((c) => c.zone === 'ice' && c.cardId === 'c05' && c.advancements === 0);
      const corpCanRez = ice && (ice.faceUp || corp.players.corp.credits >= 1);
      return ice && corpCanRez ? { type: 'run', player: 'runner', server: ice.server } : end;
    }
    case 'runner_approach_akitaro': {
      const { sv, wall } = akitaroSetup(corp);
      return sv && wall && corp.players.corp.credits === 1 ? { type: 'run', player: 'runner', server: sv.id } : end;
    }
    default:
      return end; // Corp-side goals and remote_last_card: the Runner stays out of the way
  }
}

function corpMoveFor(goal: StepGoal, v: PlayerView): Action {
  if (SPRINT8_GOALS.includes(goal) || CORE_ENCOUNTER[goal]) {
    if (v.choice) return choiceAnswer(v);
    if (v.run) {
      const rezIt = v.run.options.find((o) => o.action.type === 'rez' && o.reject === null);
      const wanted = CORE_ENCOUNTER[goal]?.ice;
      if (wanted && rezIt && v.run.ice?.cardId === wanted) return rezIt.action;
      return defaultRunMove(v);
    }
    return corpCoreMove(goal, v);
  }
  const me = v.players.corp;
  // A free-rez choice the plan did not aim for: Skip (keeps ICE face down).
  if (v.choice) return { type: 'pass', player: 'corp' };
  const bonusTarget = BONUS_TARGET[goal];
  if (bonusTarget && !v.run) return corpBonusMove(goal, v, bonusTarget);
  if (v.run) {
    if (goal === 'corp_rez_prompt') return { type: 'pass', player: 'corp' }; // unreachable: the goal stops here
    const rezIt = v.run.options.find((o) => o.action.type === 'rez' && o.reject === null);
    const wantedIce = ENCOUNTER_TARGET[goal];
    if (wantedIce && rezIt && v.run.ice?.cardId === wantedIce) return rezIt.action;
    return defaultRunMove(v);
  }
  if (goal === 'enigma_encounter' || goal === 'neural_katana_encounter' || goal === 'runner_cyberfeeder_ice_wall') {
    return corpEncounterMove(v, ENCOUNTER_TARGET[goal]!);
  }
  if (SPRINT7_GOALS.includes(goal)) return corpSprint7Move(goal, v);
  if (goal === 'runner_at_access' || goal === 'runner_after_access') return corpArchivesMove(v);
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
  if (SPRINT8_GOALS.includes(goal) || CORE_ENCOUNTER[goal]) {
    if (v.choice) return choiceAnswer(v);
    if (v.run) return defaultRunMove(v);
    return runnerCoreMove(goal, v, views);
  }
  if (v.run) {
    if (goal === 'wall_of_static_encounter' && v.run.step === 'encounter') return { type: 'pass', player: 'runner' };
    return defaultRunMove(v);
  }
  if (SPRINT7_GOALS.includes(goal)) return runnerSprint7Move(goal, v, views);
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

  if (goal === 'enigma_encounter' || goal === 'neural_katana_encounter') {
    const iceId = ENCOUNTER_TARGET[goal]!;
    if (goal === 'neural_katana_encounter' && me.handCount < 3 && me.deckCount > 0) return { type: 'draw', player: 'runner' };
    const ice = corpInstalled(corpView).find((c) => c.zone === 'ice' && c.cardId === iceId);
    const corpCanRez = ice && (ice.faceUp || corpView.players.corp.credits >= (card(iceId)?.cost ?? 99));
    // Run with 2+ clicks so at least one is left at the encounter.
    if (ice && corpCanRez && me.clicks >= 2) return { type: 'run', player: 'runner', server: ice.server };
    return { type: 'end_turn', player: 'runner' };
  }

  if (goal === 'runner_at_access' || goal === 'runner_after_access') {
    if (v.players.corp.discardCount >= ARCHIVES_MIN && me.clicks >= 2) return { type: 'run', player: 'runner', server: 'archives' };
    return { type: 'end_turn', player: 'runner' };
  }

  // Corp-side goals: the Runner stays out of the way.
  return { type: 'end_turn', player: 'runner' };
}

/** Sprint 8: the deck set a goal is planned on when the options name none (Sprint 3–7 goals: `'starter'`). */
export function goalDeckSet(goal: StepGoal): DeckSet {
  return (STEP_GOALS as readonly StepGoal[]).includes(goal) ? 'starter' : 'core';
}

/**
 * Plans a real game from `newGame(seed)` to `goal` (see `StepGoal`). The page,
 * started with the same seed, reaches the same situation by dispatching
 * `actions` in order (each as its own `player`). Throws if the goal is not
 * reached within `maxActions` or the game ends first. Sprint 8: `options.deckSet`
 * defaults to `goalDeckSet(goal)` (legacy goals: `'starter'`); `plan.deckSet` says which.
 */
export function planToStep(seed: number, goal: StepGoal, maxActions = 1500, options?: Partial<GameOptions>): StepPlan {
  if (goal === 'pipeline_katana_encounter') {
    throw new Error('planToStep: pipeline_katana_encounter is retired (Sprint 9: Neural Katana left the core deck); use pipeline_hunter_encounter');
  }
  const deckSet = options?.deckSet ?? goalDeckSet(goal);
  const match = new LocalMatch(seed, { ...options, deckSet });
  for (let n = 0; n < maxActions; n++) {
    const views: Views = { corp: match.view('corp'), runner: match.view('runner') };
    if (stepReached(goal, views)) {
      return {
        seed,
        goal,
        deckSet,
        actions: [...match.actions()],
        waitingOn: decider(views.corp),
        activePlayer: views.corp.activePlayer,
        info: stepInfo(goal, views),
      };
    }
    if (views.corp.phase === 'over') break;
    const side = decider(views.corp);
    const v = views[side];
    const action = SPRINT10_GOALS.includes(goal)
      ? side === 'corp'
        ? s10CorpMove(goal, v)
        : s10RunnerMove(goal, v, views)
      : SPRINT9_GOALS.includes(goal) && !CORE_ENCOUNTER[goal]
        ? side === 'corp'
          ? s9CorpMove(goal, v)
          : s9RunnerMove(goal, v, views)
        : side === 'corp'
          ? corpMoveFor(goal, v)
          : runnerMoveFor(goal, v, views);
    const u = match.submit(side, action);
    const rejected = u[side].events.find((e) => e.type === 'action_rejected');
    if (rejected) throw new Error(`planToStep(${seed}, ${goal}): ${JSON.stringify(action)} rejected: ${JSON.stringify(rejected)}`);
  }
  const end = match.view('runner');
  throw new Error(
    `planToStep(${seed}, ${goal}): not reached (turn ${end.turn}, phase ${end.phase}, result ${JSON.stringify(end.result)}, ` +
      `Runner hand ${JSON.stringify(end.players.runner.hand)}, rig ${JSON.stringify(end.rig.map((c) => c.cardId))}, credits ${end.players.runner.credits}, ` +
      `deck ${end.players.runner.deckCount}, heap ${JSON.stringify(end.players.runner.discard)})`,
  );
}

// ---- Sprint 9 (core decks): traces, tags, Private Security Force, SEA Source, Access to Globalsec ----

const HUNTER = 'c20';
const PSF = 'c09';
const SEA = 'c22';
const GLOBALSEC = 'r18';
const ARMITAGE = 'r02';

/** Goals that need Hunter installed on a new remote (alone). */
const S9_HUNTER: readonly StepGoal[] = [
  'hunter_encounter',
  'hunter_corp_broke',
  'trace_tie',
  'runner_tagged_corp_turn',
  'runner_tagged_own_turn',
  'psf_scored_tagged',
  'globalsec_installed',
  'globalsec_two_installed',
];
/** Goals where the Runner runs Hunter to get tagged. */
const S9_TAG: readonly StepGoal[] = ['runner_tagged_corp_turn', 'runner_tagged_own_turn', 'psf_scored_tagged'];

/** The installed Hunter (Corp view), if any. */
const hunterOf = (corp: PlayerView) => corpInstalled(corp).find((c) => c.zone === 'ice' && c.cardId === HUNTER);

/** Credits the Corp should hold before the Runner comes, per goal (Hunter face down: + its rez cost 1). */
function s9CorpCredits(goal: StepGoal, corp: PlayerView): { min: number; exact?: number } {
  const h = hunterOf(corp);
  const rez = h && !h.faceUp ? 1 : 0;
  if (goal === 'hunter_corp_broke') return { min: rez, exact: rez };
  if (goal === 'hunter_encounter' || goal === 'trace_tie') return { min: 2 + rez };
  if (goal === 'runner_tagged_corp_turn') return { min: 2 + rez };
  if (goal === 'sea_source_ready') return { min: 3 };
  return { min: rez };
}

/** The Runner's view at an encounter with a rezzed `iceId`, `pass` offered (and the Corp's view agrees). */
function encounterWith(corp: PlayerView, runner: PlayerView, iceId: string): boolean {
  const r = runner.run;
  return (
    r?.step === 'encounter' &&
    r.ice?.cardId === iceId &&
    corp.run?.iceUid === r.iceUid &&
    runner.choice === null &&
    r.options.some((o) => o.action.type === 'pass' && o.reject === null)
  );
}

const sentryBreaker = (v: PlayerView) => v.rig.some((c) => card(c.cardId)?.subtype === 'breaker_sentry');
const globalsecs = (v: PlayerView) => v.rig.filter((c) => c.cardId === GLOBALSEC);
const scoredPsf = (corp: PlayerView) => corp.players.corp.scored.indexOf(PSF);
/** Corp view: SEA Source's hand index and its play option. */
function seaOption(corp: PlayerView) {
  const i = (corp.players.corp.hand ?? []).indexOf(SEA);
  return i < 0 ? undefined : { i, opt: corp.handOptions[i]?.find((o) => o.action.type === 'play') };
}

function s9Reached(goal: StepGoal, views: Views): boolean {
  const { corp, runner } = views;
  const rp = runner.players.runner;
  const cp = corp.players.corp;
  switch (goal) {
    case 'hunter_encounter':
      return encounterWith(corp, runner, HUNTER) && !sentryBreaker(runner) && rp.link === 1 && rp.credits >= 4 && cp.credits >= 2;
    case 'hunter_corp_broke':
      return encounterWith(corp, runner, HUNTER) && !sentryBreaker(runner) && rp.link === 1 && rp.credits >= 2 && cp.credits === 0;
    case 'trace_tie': {
      const c = runner.choice;
      const t = c?.trace;
      return c?.kind === 'trace_runner' && c.cardId === HUNTER && runner.run !== null && t !== undefined && t.needed >= 1 && t.needed <= t.runnerMaxBid;
    }
    case 'runner_tagged_corp_turn':
      return corpAction(corp) && cp.clicks === 3 && cp.credits >= 2 && rp.tags >= 1 && rigCard(corp, ARMITAGE) !== undefined;
    case 'runner_tagged_own_turn':
      return runnerAction(runner) && rp.clicks >= 1 && rp.credits >= 2 && rp.tags >= 1;
    case 'psf_scored_tagged':
      return corpAction(corp) && cp.clicks === 3 && rp.tags >= 1 && scoredPsf(corp) >= 0;
    case 'sea_source_ready': {
      const sea = seaOption(corp);
      return corpAction(corp) && cp.clicks === 3 && cp.credits >= 3 && sea?.opt?.reject === null;
    }
    case 'sea_source_not_ready': {
      const sea = seaOption(corp);
      return corpAction(corp) && cp.clicks === 3 && sea?.opt?.reject === 'condition_not_met';
    }
    case 'globalsec_installed':
    case 'globalsec_two_installed': {
      const want = goal === 'globalsec_installed' ? 1 : 2;
      const h = hunterOf(corp);
      return runnerAction(runner) && rp.clicks >= 1 && globalsecs(runner).length === want && h !== undefined && (h.faceUp || cp.credits >= 1);
    }
    default:
      return false;
  }
}

function s9Info(goal: StepGoal, views: Views): Record<string, string> {
  const { corp, runner } = views;
  switch (goal) {
    case 'hunter_encounter':
    case 'hunter_corp_broke': {
      const r = runner.run!;
      return { server: r.server, iceUid: r.iceUid ?? '', corpCredits: String(corp.players.corp.credits), runnerCredits: String(runner.players.runner.credits) };
    }
    case 'trace_tie': {
      const t = runner.choice!.trace!;
      const r = runner.run!;
      return { server: r.server, iceUid: r.iceUid ?? '', needed: String(t.needed), strength: String(t.strength), link: String(t.link) };
    }
    case 'runner_tagged_corp_turn':
      return { armitageUid: rigCard(corp, ARMITAGE)!.uid, tags: String(runner.players.runner.tags) };
    case 'runner_tagged_own_turn':
      return { tags: String(runner.players.runner.tags) };
    case 'psf_scored_tagged':
      return { uid: `score:corp:${scoredPsf(corp)}`, grip: String(runner.players.runner.handCount) };
    case 'sea_source_ready':
    case 'sea_source_not_ready':
      return { handIndex: String(seaOption(corp)!.i) };
    case 'globalsec_installed':
    case 'globalsec_two_installed':
      return { uids: globalsecs(runner).map((c) => c.uid).join(','), link: String(runner.players.runner.link), hunterServer: hunterOf(corp)!.server };
    default:
      return {};
  }
}

/** A trace bid from the offered options: `want` clamped to what is offered (0 if nothing else). */
function bidOf(v: PlayerView, want: number): Action {
  const opts = (v.choice?.options ?? []).filter((o) => o.reject === null).map((o) => o.action);
  const max = Math.max(0, ...opts.map((a) => (a.type === 'trace_bid' ? a.credits : 0)));
  const n = Math.max(0, Math.min(want, max));
  return opts.find((a) => a.type === 'trace_bid' && a.credits === n) ?? opts[0] ?? { type: 'pass', player: v.viewer };
}

/** Sprint 9 Corp policies. */
function s9CorpMove(goal: StepGoal, v: PlayerView): Action {
  const me = v.players.corp;
  if (v.choice) {
    if (v.choice.kind === 'trace_corp') {
      // trace_tie: a bid that leaves the Runner able to tie (needed ≤ his max); else bid 0.
      const t = v.choice.trace!;
      return bidOf(v, goal === 'trace_tie' ? Math.min(2, t.runnerMaxBid + t.link - t.base) : 0);
    }
    return choiceAnswer(v);
  }
  if (v.run) {
    const rezIt = v.run.options.find((o) => o.action.type === 'rez' && o.reject === null);
    if (rezIt && v.run.ice?.cardId === HUNTER) return rezIt.action;
    return defaultRunMove(v);
  }
  const keep = (id: string) => (id === HUNTER || id === SEA ? 3 : id === PSF ? 2 : isAgendaId(id) ? 1 : 0);
  if (v.phase === 'discard') return discardKeeping(v, keep);
  const end: Action = { type: 'end_turn', player: 'corp' };
  if (me.clicks === 0) return end;
  const gain: Action = { type: 'gain_credit', player: 'corp' };
  const draw = (margin: number): Action => basicMove(v, margin);
  const installNewOf = (pred: (id: string) => boolean): Action | undefined => {
    const i = handIdx(v, pred);
    return i >= 0 ? installNew(v, i) : undefined;
  };
  if (goal === 'sea_source_ready' || goal === 'sea_source_not_ready') {
    // Agendas go into new remotes (never run), so none is discarded to Archives (the Runner runs Archives).
    const agenda = installNewOf(isAgendaId);
    if (agenda) return agenda;
    if (handIdx(v, (x) => x === SEA) < 0) return draw(1);
    return me.credits < 3 ? gain : end;
  }
  if (!S9_HUNTER.includes(goal)) return end;
  const hunter = hunterOf(v);
  if (!hunter) return installNewOf((x) => x === HUNTER) ?? draw(2);
  const want = s9CorpCredits(goal, v);
  if (goal === 'psf_scored_tagged' && scoredPsf(v) < 0) {
    const psf = corpInstalled(v).find((c) => c.cardId === PSF);
    if (!psf) return installNewOf((x) => x === PSF) ?? draw(2);
    if (psf.advancements >= 4) return { type: 'score', player: 'corp', uid: psf.uid };
    if (me.credits >= want.min + 1) return { type: 'advance', player: 'corp', uid: psf.uid };
    return gain;
  }
  if (want.exact !== undefined && me.credits > want.exact) {
    // hunter_corp_broke: burn credits by advancing an installed agenda (never scored; the Runner never runs it).
    // Sprint 10: only one below its requirement (advance stops there); else install another.
    const agenda = agendas(v).find((a) => a.advancements < a.need);
    if (agenda) return { type: 'advance', player: 'corp', uid: agenda.uid };
    return installNewOf(isAgendaId) ?? draw(2);
  }
  if (me.credits < want.min) return gain;
  return end;
}

/** Sprint 9 Runner policies. */
function s9RunnerMove(goal: StepGoal, v: PlayerView, views: Views): Action {
  const me = v.players.runner;
  if (v.choice) return v.choice.kind === 'trace_runner' ? bidOf(v, 0) : choiceAnswer(v);
  if (v.run) return defaultRunMove(v);
  const hand = me.hand ?? [];
  const wantRig: string[] = goal === 'runner_tagged_corp_turn' ? [ARMITAGE] : goal === 'globalsec_installed' ? [GLOBALSEC] : goal === 'globalsec_two_installed' ? [GLOBALSEC, GLOBALSEC] : [];
  const keep = (id: string) => (wantRig.includes(id) ? 3 : id === 'r14' || id === 'r01' ? 1 : 0);
  if (v.phase === 'discard') return discardKeeping(v, keep);
  const end: Action = { type: 'end_turn', player: 'runner' };
  if (me.clicks === 0) return end;
  const draw: Action = me.deckCount > 0 ? { type: 'draw', player: 'runner' } : end;
  const gain: Action = { type: 'gain_credit', player: 'runner' };
  const corp = views.corp;
  // Install the rig the goal needs (Armitage / Access to Globalsec), drawing until found.
  const have = (id: string) => v.rig.filter((c) => c.cardId === id).length;
  for (const id of new Set(wantRig)) {
    if (have(id) >= wantRig.filter((x) => x === id).length) continue;
    const i = hand.indexOf(id);
    if (i < 0) return draw;
    return installNew(v, i) ?? gain;
  }
  if (goal === 'sea_source_ready') return me.clicks >= 1 ? { type: 'run', player: 'runner', server: 'archives' } : end;
  if (goal === 'sea_source_not_ready' || goal === 'globalsec_installed' || goal === 'globalsec_two_installed') return end;
  const hunter = hunterOf(corp);
  if (!hunter) return end;
  const cp = corp.players.corp;
  const want = s9CorpCredits(goal, corp);
  const corpReady = want.exact !== undefined ? cp.credits === want.exact : cp.credits >= want.min;
  const runHunter: Action = { type: 'run', player: 'runner', server: hunter.server };
  if (S9_TAG.includes(goal)) {
    if (me.tags > 0) return end; // tagged: wait for the Corp's turn (own-turn goal is reached before this)
    if (me.clicks < 2 || me.credits < 2) return me.credits < 2 ? gain : end;
    return corpReady ? runHunter : end;
  }
  // Hunter encounter goals: enough credits for the Runner's window, then run when the Corp is ready.
  const credits = goal === 'hunter_corp_broke' ? 2 : 4;
  if (me.credits < credits) return gain;
  return corpReady ? runHunter : end;
}

// ---- Sprint 10 (core decks): advance cap, scored piles, stats column, lanes, discard step ----

const ICE_WALL = 'c05';
const HEDGE_FUND = 'c01';

/** Corp view: an installed agenda with exactly `need - short` counters and the matching options. */
function agendaAt(corp: PlayerView, short: 0 | 1) {
  return agendas(corp).find((a) => {
    if (a.advancements !== a.need - short) return false;
    const opts = corp.installedOptions[a.uid] ?? [];
    const want = short === 0 ? 'score' : 'advance';
    return opts.length === 1 && opts[0]!.action.type === want && opts[0]!.reject === null;
  });
}

/** Corp view: an installed Ice Wall with ≥ 1 counter and Advance legal. */
function advancedIceWall(corp: PlayerView) {
  return corpInstalled(corp).find(
    (c) => c.cardId === ICE_WALL && c.advancements >= 1 && (corp.installedOptions[c.uid] ?? []).some((o) => o.action.type === 'advance' && o.reject === null),
  );
}

/** Corp view: an installed, unscored PSF below its requirement with Advance legal. */
function unscoredPsf(corp: PlayerView) {
  return corpInstalled(corp).find(
    (c) => c.cardId === PSF && c.advancements < 4 && (corp.installedOptions[c.uid] ?? []).some((o) => o.action.type === 'advance' && o.reject === null),
  );
}

/** Corp view: remotes in server order with no ICE and exactly one card the Runner can take, another remote after it. */
function singleCardTarget(corp: PlayerView, runner: PlayerView) {
  const rs = remotes(corp);
  const rp = runner.players.runner;
  for (let i = 0; i < rs.length - 1; i++) {
    const sv = rs[i]!;
    if (sv.ice.length > 0 || sv.content.length !== 1) continue;
    const c = sv.content[0]!;
    const def = card(c.cardId);
    if (!def) continue;
    if (def.type === 'agenda') {
      if (rp.points + (def.agendaPoints ?? 0) < WIN) return { server: sv.id, card: c, kind: 'steal' as const, other: rs[i + 1]!.id };
    } else if (def.trashCost !== undefined && rp.credits >= def.trashCost) {
      return { server: sv.id, card: c, kind: 'trash' as const, other: rs[i + 1]!.id };
    }
  }
  return undefined;
}

const discardStep = (v: PlayerView, side: Side) => v.phase === 'discard' && v.activePlayer === side && v.pendingDiscard >= 2;

function s10Reached(goal: StepGoal, views: Views): boolean {
  const { corp, runner } = views;
  const cp = corp.players.corp;
  const rp = runner.players.runner;
  const corpReady = corpAction(corp) && cp.clicks >= 1;
  switch (goal) {
    case 'agenda_at_requirement':
      return corpReady && cp.credits >= 1 && agendaAt(corp, 0) !== undefined;
    case 'agenda_one_short':
      return corpReady && cp.credits >= 1 && agendaAt(corp, 1) !== undefined;
    case 'ice_wall_advanced':
      return corpReady && cp.credits >= 1 && advancedIceWall(corp) !== undefined;
    case 'corp_two_scored':
      return corpReady && cp.scored.length >= 2 && cp.scored.includes(PSF);
    case 'runner_two_stolen':
      return runnerAction(runner) && rp.clicks >= 1 && rp.scored.length >= 2;
    case 'psf_installed_unscored':
      return corpReady && cp.credits >= 1 && unscoredPsf(corp) !== undefined;
    case 'runner_tagged_full_rig':
      return runnerAction(runner) && rp.tags >= 1 && runner.rig.length >= 4 && globalsecs(runner).length === 1;
    case 'remote_single_card_no_ice':
      return runnerAction(runner) && rp.clicks >= 1 && singleCardTarget(corp, runner) !== undefined;
    case 'runner_must_discard':
      return discardStep(runner, 'runner');
    case 'corp_must_discard':
      return discardStep(corp, 'corp');
    default:
      return false;
  }
}

function s10Info(goal: StepGoal, views: Views): Record<string, string> {
  const { corp, runner } = views;
  switch (goal) {
    case 'agenda_at_requirement':
    case 'agenda_one_short': {
      const a = agendaAt(corp, goal === 'agenda_at_requirement' ? 0 : 1)!;
      return { uid: a.uid, server: a.server, cardId: a.cardId!, advancements: String(a.advancements) };
    }
    case 'ice_wall_advanced': {
      const w = advancedIceWall(corp)!;
      return { uid: w.uid, server: w.server, advancements: String(w.advancements) };
    }
    case 'psf_installed_unscored': {
      const p = unscoredPsf(corp)!;
      return { uid: p.uid, server: p.server, advancements: String(p.advancements) };
    }
    case 'corp_two_scored': {
      const cp = corp.players.corp;
      return { count: String(cp.scored.length), points: String(cp.points), scored: cp.scored.join(','), psfUid: `score:corp:${cp.scored.indexOf(PSF)}` };
    }
    case 'runner_two_stolen': {
      const rp = runner.players.runner;
      return { count: String(rp.scored.length), points: String(rp.points), scored: rp.scored.join(',') };
    }
    case 'runner_tagged_full_rig':
      return {
        tags: String(runner.players.runner.tags),
        link: String(runner.players.runner.link),
        rig: String(runner.rig.length),
        globalsecUid: globalsecs(runner)[0]!.uid,
      };
    case 'remote_single_card_no_ice': {
      const t = singleCardTarget(corp, runner)!;
      return { server: t.server, uid: t.card.uid, cardId: t.card.cardId!, kind: t.kind, otherServer: t.other };
    }
    case 'runner_must_discard':
    case 'corp_must_discard': {
      const v = goal === 'runner_must_discard' ? runner : corp;
      return { count: String(v.pendingDiscard), hand: String(v.players[v.viewer].handCount) };
    }
    default:
      return {};
  }
}

/** Sprint 10 agenda work: score what is ready (unless the goal wants it sitting), advance, install, money. */
function s10AgendaMove(goal: StepGoal, v: PlayerView): Action {
  const me = v.players.corp;
  const gain: Action = { type: 'gain_credit', player: 'corp' };
  const scoring = goal === 'corp_two_scored';
  const mine = agendas(v);
  if (scoring) {
    const ready = mine.find((a) => a.advancements >= a.need && me.points + a.points < WIN);
    if (ready) return { type: 'score', player: 'corp', uid: ready.uid };
  }
  const stopAt = (a: { need: number }) => (goal === 'agenda_one_short' ? a.need - 1 : a.need);
  const working = mine.filter((a) => a.advancements < stopAt(a)).sort((a, b) => b.advancements - a.advancements)[0];
  const fund = handIdx(v, (id) => id === HEDGE_FUND);
  if (working) {
    if (me.credits >= 1) return { type: 'advance', player: 'corp', uid: working.uid };
    if (fund >= 0 && me.credits >= 5) return { type: 'play', player: 'corp', handIndex: fund };
    return gain;
  }
  // corp_two_scored: PSF first; Priority Requisition only once a PSF is scored (two PRs + PSF would win).
  const wanted = (id: string) => (scoring ? id === PSF || (id === 'c10' && me.scored.includes(PSF)) : isAgendaId(id));
  const order = (v.players.corp.hand ?? [])
    .map((id, i) => ({ i, id, need: card(id)?.advancementRequirement ?? 99 }))
    .filter((x) => wanted(x.id))
    .sort((a, b) => a.need - b.need);
  for (const x of order) {
    const install = installNew(v, x.i);
    if (install) return install;
  }
  if (fund >= 0 && me.credits >= 5 && me.credits < 10) return { type: 'play', player: 'corp', handIndex: fund };
  return basicMove(v, 2);
}

/** Sprint 10 Corp policies. */
function s10CorpMove(goal: StepGoal, v: PlayerView): Action {
  if (goal === 'runner_tagged_full_rig') return s9CorpMove('runner_tagged_own_turn', v);
  const me = v.players.corp;
  if (v.choice) return choiceAnswer(v);
  if (v.run) return defaultRunMove(v);
  const keepIds: Record<string, number> =
    goal === 'ice_wall_advanced' ? { [ICE_WALL]: 3, [HEDGE_FUND]: 1 } : goal === 'psf_installed_unscored' || goal === 'corp_two_scored' ? { [PSF]: 3, c10: 2, [HEDGE_FUND]: 1 } : {};
  if (v.phase === 'discard') return discardKeeping(v, (id) => keepIds[id] ?? (isAgendaId(id) ? 2 : id === HEDGE_FUND ? 1 : 0));
  const end: Action = { type: 'end_turn', player: 'corp' };
  if (me.clicks === 0) return end;
  const installNewOf = (pred: (id: string) => boolean): Action | undefined => {
    const i = handIdx(v, pred);
    return i >= 0 ? installNew(v, i) : undefined;
  };
  switch (goal) {
    case 'agenda_at_requirement':
    case 'agenda_one_short':
    case 'corp_two_scored':
      return s10AgendaMove(goal, v);
    case 'ice_wall_advanced': {
      const wall = corpInstalled(v).find((c) => c.cardId === ICE_WALL);
      if (!wall) return installNewOf((id) => id === ICE_WALL) ?? basicMove(v, 2);
      return me.credits >= 1 ? { type: 'advance', player: 'corp', uid: wall.uid } : { type: 'gain_credit', player: 'corp' };
    }
    case 'psf_installed_unscored':
      return installNewOf((id) => id === PSF) ?? basicMove(v, 2);
    case 'runner_two_stolen':
      // Agendas into new, unprotected remotes (the Runner steals them).
      return installNewOf(isAgendaId) ?? basicMove(v, 1);
    case 'remote_single_card_no_ice':
      // One agenda or asset per new remote, no ICE.
      return installNewOf((id) => isAgendaId(id) || typeOf(id) === 'asset') ?? basicMove(v, 2);
    case 'corp_must_discard':
      return legal(v, (a) => a.type === 'draw') ?? end;
    default:
      return end;
  }
}

/** Sprint 10 Runner policies. */
function s10RunnerMove(goal: StepGoal, v: PlayerView, views: Views): Action {
  const me = v.players.runner;
  if (v.choice) return v.choice.kind === 'trace_runner' ? bidOf(v, 0) : choiceAnswer(v);
  if (v.run) return defaultRunMove(v);
  if (v.phase === 'discard') return discardKeeping(v, (id) => (id === GLOBALSEC ? 3 : typeOf(id) === 'event' ? 0 : 1));
  const end: Action = { type: 'end_turn', player: 'runner' };
  if (me.clicks === 0) return end;
  const corp = views.corp;
  switch (goal) {
    case 'runner_must_discard':
      return legal(v, (a) => a.type === 'draw') ?? end;
    case 'runner_two_stolen': {
      const target = agendas(corp).find((a) => a.iceless && me.points + a.points < WIN);
      return target ? { type: 'run', player: 'runner', server: target.server } : end;
    }
    case 'runner_tagged_full_rig': {
      if (me.tags === 0) {
        // Exactly one Access to Globalsec, then any 3 more rig cards; then get tagged by Hunter (link 2 < Trace 3).
        const hand = me.hand ?? [];
        const installable = (i: number) => installNew(v, i);
        if (globalsecs(v).length === 0) {
          const g = hand.indexOf(GLOBALSEC);
          if (g < 0) return legal(v, (a) => a.type === 'draw') ?? { type: 'gain_credit', player: 'runner' };
          return installable(g) ?? { type: 'gain_credit', player: 'runner' };
        }
        if (v.rig.length < 4) {
          for (let i = 0; i < hand.length; i++) {
            if (hand[i] === GLOBALSEC) continue;
            const a = installable(i);
            if (a) return a;
          }
          if (me.credits < 3) return { type: 'gain_credit', player: 'runner' };
          return legal(v, (a) => a.type === 'draw') ?? { type: 'gain_credit', player: 'runner' };
        }
      }
      return s9RunnerMove('runner_tagged_own_turn', v, views);
    }
    default:
      return end;
  }
}
