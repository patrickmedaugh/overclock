import type { Action } from './actions';
import { apply, choiceOptions, handOptions, installedOptions, legalActions, runStartOptions, runStepOptions } from './apply';
import type { GameEvent, RejectReason, SubOutcome } from './events';
import { getCard } from '@overclock/cards';
import { breakerCard, breakerStrength, currentIce, discardCount, iceStrength, memoryLimit, memoryUsed, waitingOn } from './rules';
import {
  IDENTITY_UID,
  maxHandSize,
  pointsOf,
  type AccessFrom,
  type ChoiceKind,
  type GameResult,
  type GameState,
  type Installed,
  type Phase,
  type PlayerState,
  type RunStep,
  type ServerId,
  type Side,
  type WinReason,
} from './state';

export interface PlayerSideView {
  readonly deckCount: number;
  readonly handCount: number;
  /** Card ids in hand, only for the viewing player; null for the opponent. */
  readonly hand: readonly string[] | null;
  readonly credits: number;
  readonly clicks: number;
  readonly discardCount: number;
  /** Discard pile, bottom = index 0. An entry is null when it is face down to the viewer. */
  readonly discard: readonly (string | null)[];
  /** Score area (face up, both see it): agenda card ids in the order scored/stolen. */
  readonly scored: readonly string[];
  /** Agenda points in the score area. */
  readonly points: number;
  /** Sprint 8: the side's identity card (public; `uid` = `id:corp` / `id:runner`), or null (starter decks). */
  readonly identity: { readonly uid: string; readonly cardId: string } | null;
  /** Sprint 8: maximum hand size (5 − brain damage; may be below 0 just before a flatline). */
  readonly maxHandSize: number;
  /** Sprint 8: brain damage taken (Runner; 0 for the Corp). */
  readonly brainDamage: number;
}

/** An installed card as one player sees it. */
export interface InstalledView {
  readonly uid: string;
  /** null when the card is face down to the viewer (the Runner, for every unrezzed Corp card). */
  readonly cardId: string | null;
  readonly faceUp: boolean;
  /** Advancement counters (both players see the number, even on a face-down card). */
  readonly advancements: number;
  /** Sprint 7: credits on the card (Armitage Codebusting, Bank Job, Cyberfeeder). Public. */
  readonly hostedCredits: number;
}

export interface ServerView {
  readonly id: ServerId;
  /** Index 0 is innermost; the last entry is outermost. */
  readonly ice: readonly InstalledView[];
  readonly content: readonly InstalledView[];
}

/**
 * One offered way to use a hand card, with its engine-computed price.
 * `reject` is exactly what `apply` would answer (null = legal now).
 */
export interface CardOption {
  readonly action: Action;
  /** Credits it costs. */
  readonly cost: number;
  readonly reject: RejectReason | null;
  /** Sprint 7: clicks an `activate` option costs, only when > 0 (other actions' click cost is implied by their type). */
  readonly clicks?: number;
  /** Sprint 7: credits it gives the player (`activate` of a `take_credits` ability), only when set. */
  readonly gain?: number;
  /** Sprint 7: breaker options only, only when non-empty: the cards whose credits pay part of `cost` (e.g. Cyberfeeder). */
  readonly hostedPay?: readonly { readonly uid: string; readonly amount: number }[];
  /** Sprint 8: install options only, only when > 0: credits an install discount (Kate) takes off; `cost` is already lowered. */
  readonly discount?: number;
}

/** The current ICE during a run, as the viewer sees it. */
export interface RunIceView {
  /** null for the Runner while the ICE is unrezzed. */
  readonly cardId: string | null;
  /** Printed strength; null when the viewer cannot see the card. */
  readonly strength: number | null;
  /** In printed order; empty when the viewer cannot see the card. */
  readonly subroutines: readonly { readonly text: string; readonly broken: boolean }[];
}

/** One accessed card in the current access group. */
export interface AccessCardView {
  /** null only in the Corp's view of an R&D card (deck order is hidden from the Corp too). */
  readonly cardId: string | null;
  readonly from: AccessFrom;
  /** Already stolen (stays listed so `steal`/`trash` indices are stable). */
  readonly stolen: boolean;
  /** The installed card's uid when accessed from a server (remote or a central's upgrade), else null. */
  readonly uid: string | null;
}

/** A run in progress, as one player sees it. */
export interface RunView {
  readonly server: ServerId;
  /** Index into the server's ICE of the current ICE; -1 once at the server (access). */
  readonly position: number;
  readonly step: RunStep;
  /** Who must decide now: the Corp at `approach`, otherwise the Runner. */
  readonly waitingOn: Side;
  /** The ICE being approached / encountered / just passed; null at the server. */
  readonly iceUid: string | null;
  readonly ice: RunIceView | null;
  /** Current strength of each installed icebreaker (boosts included), by uid. */
  readonly breakerStrength: Readonly<Record<string, number>>;
  /** Set during the `access` step. */
  readonly access: { readonly cards: readonly AccessCardView[] } | null;
  /** Additional R&D cards accessed if the run succeeds (The Maker's Eye). */
  readonly extraAccess: number;
  /** Inside Job: the next ICE encountered will be bypassed. */
  readonly bypassPending: boolean;
  /** The viewer's offered moves at this step, with engine `cost` and `reject` (empty when not the viewer's decision). */
  readonly options: readonly CardOption[];
  /** The Runner's run-only credits left (from bad publicity; both players see it). 0 when none. */
  readonly tempCredits: number;
  /**
   * Sprint 5: what `pass` ("let it fire") would do now. Non-null only in the Runner's view at
   * step `encounter` with rezzed ICE while `pass` is offered. Computed by the real resolution
   * on a throw-away copy of the state.
   */
  readonly letFire: LetFireView | null;
  /**
   * Sprint 8 (QA-S8-2): what breaking every unbroken subroutine of the encountered ICE would
   * cost, per icebreaker that can do it with the Runner's credits now: raise strength as
   * needed, then break. Computed like `letFire`, by playing the breaker's own offered
   * options (break when one is accepted, else pump) on a throw-away copy of the state.
   * Runner's view at `encounter` with rezzed ICE only; `[]` otherwise or when none can.
   */
  readonly breakAll: readonly BreakAllView[];
}

/** Sprint 8: one icebreaker's full break of the encountered ICE (credits; hosted credits included). */
export interface BreakAllView {
  readonly uid: string;
  /** Total price: `strengthCredits + breakCredits`. */
  readonly credits: number;
  /** Spent raising strength first (0 when already strong enough). */
  readonly strengthCredits: number;
  readonly breakCredits: number;
}

/** Sprint 5: the preview of letting the encountered ICE fire. */
export interface LetFireView {
  readonly iceCardId: string;
  /** What `pass` would resolve, in order, stopping after the one that ends the run/game. */
  readonly outcomes: readonly SubOutcome[];
  /** 'run' = ended by the ICE, 'game' = flatline, null = the run goes on (`[]` = all broken). */
  readonly ends: 'run' | 'game' | null;
}

/** Sprint 5: the Runner's most recent run, as the Runner sees it. */
export interface LastRunView {
  readonly server: ServerId;
  readonly cards: readonly { readonly cardId: string; readonly from: AccessFrom }[];
}

/** An open choice (phase 'choice'), as one player sees it. */
export interface ChoiceView {
  readonly kind: ChoiceKind;
  /** Who must decide (the Corp for `free_rez`). */
  readonly waitingOn: Side;
  /** The card whose effect opened it (the scored agenda; Sprint 8: the rezzed ICE whose subroutine fired; public). */
  readonly cardId: string;
  /** Sprint 8, `prevent_trash` only: the rig card that would be trashed. */
  readonly target?: string;
  /**
   * The deciding viewer's options: `free_rez` = one `rez` (cost 0) per unrezzed installed ICE uid
   * (servers in `corpServers` order, then ICE index order), then `pass` (= Skip). Sprint 8:
   * `trash_target` = one `choose` per candidate (rig order); `prevent_trash` = one `choose` per
   * preventer (rig order), then `pass` (let it be trashed). Empty for the other player.
   */
  readonly options: readonly CardOption[];
}

/** What one player may see. Deck order is never included. */
export interface PlayerView {
  readonly viewer: Side;
  /** Counts player-turns: Corp 1, Runner 2, Corp 3, ... */
  readonly turn: number;
  readonly activePlayer: Side;
  readonly phase: Phase;
  /** > 0 only for the active viewer during 'discard': discard any this many distinct hand indices. */
  readonly pendingDiscard: number;
  readonly result: { readonly winner: Side; readonly reason: WinReason } | null;
  readonly players: Readonly<Record<Side, PlayerSideView>>;
  /** Corp servers: hq, rd, archives, then remotes in creation order. */
  readonly corpServers: readonly ServerView[];
  /** Runner's installed cards (face up to both), install order. */
  readonly rig: readonly InstalledView[];
  /** Runner memory used by installed programs, and the limit (Sprint 7: 4 + rig `memoryBonus`). */
  readonly memory: { readonly used: number; readonly limit: number };
  /** Per viewer hand index: every offered action for that card (bad_card/bad_target never listed). */
  readonly handOptions: readonly (readonly CardOption[])[];
  /** Runner only: one `run` option per server (Corp: empty). */
  readonly runOptions: readonly CardOption[];
  /**
   * Per own installed card uid, listed off-turn too with the reason in `reject`. Corp: agenda `advance`
   * and (once it has enough counters) `score`; advanceable ICE `advance` (Sprint 7); unrezzed
   * asset/upgrade `rez` (Sprint 7). Runner (Sprint 7): `activate` per `click` ability.
   * Never lists anything for the other side's cards.
   */
  readonly installedOptions: Readonly<Record<string, readonly CardOption[]>>;
  /** The run in progress, or null. */
  readonly run: RunView | null;
  /** The Corp's bad publicity (both players see it). */
  readonly badPublicity: number;
  /** The open choice (phase 'choice'), or null. */
  readonly choice: ChoiceView | null;
  /** Actions the viewer may take now (so the AI/client never need the full state). */
  readonly legalActions: readonly Action[];
  /**
   * Sprint 5: the cards accessed in the Runner's most recent run. Runner's view only, only
   * when no run is in progress and at least one card was accessed; always null for the Corp.
   */
  readonly lastRun: LastRunView | null;
}

function sideView(state: GameState, side: Side, viewer: Side): PlayerSideView {
  const p: PlayerState = state.players[side];
  return {
    deckCount: p.deck.length,
    handCount: p.hand.length,
    hand: side === viewer ? p.hand.slice() : null,
    credits: p.credits,
    clicks: p.clicks,
    discardCount: p.discard.length,
    // The owner sees their whole pile; the opponent sees only face-up entries.
    discard: p.discard.map((d) => (side === viewer || d.faceUp ? d.cardId : null)),
    scored: p.scoreArea.slice(),
    points: pointsOf(p.scoreArea),
    identity: p.identity !== null ? { uid: IDENTITY_UID[side], cardId: p.identity } : null,
    maxHandSize: maxHandSize(state, side),
    brainDamage: p.brainDamage,
  };
}

function corpCardView(c: Installed, viewer: Side): InstalledView {
  return {
    uid: c.uid,
    cardId: viewer === 'corp' || c.rezzed ? c.cardId : null,
    faceUp: c.rezzed,
    advancements: c.advancements,
    hostedCredits: c.hostedCredits,
  };
}

function copyResult(r: GameResult | null): PlayerView['result'] {
  return r ? { winner: r.winner, reason: r.reason } : null;
}

/**
 * What `pass` ("let it fire") would do now, for the Runner at an encounter with rezzed ICE
 * while `pass` is offered; else null. Runs the real `pass` on the (immutable) state and keeps
 * only the public outcome: the result is thrown away, the real state and RNG are untouched.
 */
function letFireView(state: GameState, viewer: Side, options: readonly CardOption[]): LetFireView | null {
  const run = state.run;
  const ice = currentIce(state);
  if (viewer !== 'runner' || !run || run.step !== 'encounter' || !ice?.rezzed) return null;
  const pass = options.find((o) => o.action.type === 'pass' && o.reject === null);
  if (!pass) return null;
  const { events } = apply(state, pass.action);
  const outcomes: SubOutcome[] = [];
  let ends: LetFireView['ends'] = null;
  for (const e of events) {
    if (e.type === 'subroutine_resolved') outcomes.push({ sub: e.outcome.sub, op: e.outcome.op, amount: e.outcome.amount });
    else if (e.type === 'game_over') ends = 'game';
    else if (e.type === 'run_ended' && ends === null) ends = 'run';
  }
  return { iceCardId: ice.cardId, outcomes, ends };
}

/** A breaker option that breaks (names subroutines) rather than raises strength. */
function isBreak(a: Action): boolean {
  return a.type === 'use_ability' && (a.sub !== undefined || a.subs !== undefined);
}

/**
 * Sprint 8 (QA-S8-2): per breaker with options at this encounter, the price of breaking every
 * unbroken subroutine: play its own offered options on throw-away states (break when one is
 * accepted, preferring the one that breaks the most; else raise strength) until all are broken.
 */
function breakAllView(state: GameState, viewer: Side, options: readonly CardOption[]): BreakAllView[] {
  const ice = currentIce(state);
  if (viewer !== 'runner' || !state.run || state.run.step !== 'encounter' || !ice?.rezzed) return [];
  if (state.run.broken.length >= (getCard(ice.cardId)?.subroutines?.length ?? 0)) return [];
  const subs = getCard(ice.cardId)?.subroutines?.length ?? 0;
  const uids: string[] = [];
  for (const o of options) if (o.action.type === 'use_ability' && !uids.includes(o.action.uid)) uids.push(o.action.uid);
  const out: BreakAllView[] = [];
  for (const uid of uids) {
    let s = state;
    let strengthCredits = 0;
    let breakCredits = 0;
    let broken = state.run.broken.length;
    let done = broken >= subs;
    for (let guard = 0; guard < 40 && !done; guard++) {
      const run = s.run;
      if (!run || run.step !== 'encounter') break;
      const mine = runStepOptions(s, 'runner').filter((o) => o.action.type === 'use_ability' && o.action.uid === uid);
      // This breaker can't break this ICE at all: no plan.
      if (!mine.some((o) => isBreak(o.action))) break;
      const size = (o: CardOption) => (o.action.type === 'use_ability' ? (o.action.subs?.length ?? 1) : 0);
      const brk = mine.filter((o) => isBreak(o.action) && o.reject === null).sort((a, b) => size(b) - size(a))[0];
      const pump = mine.find((o) => !isBreak(o.action) && o.reject === null);
      const next = brk ?? pump;
      if (!next) break;
      const r = apply(s, next.action);
      if (r.events.some((e) => e.type === 'action_rejected')) break;
      if (brk) breakCredits += next.cost;
      else strengthCredits += next.cost;
      broken += r.events.filter((e) => e.type === 'subroutine_broken').length;
      done = broken >= subs;
      s = r.state;
    }
    if (done && strengthCredits + breakCredits > 0) out.push({ uid, credits: strengthCredits + breakCredits, strengthCredits, breakCredits });
  }
  return out;
}

function runView(state: GameState, viewer: Side): RunView | null {
  const run = state.run;
  if (!run) return null;
  const ice = currentIce(state);
  let iceView: RunIceView | null = null;
  if (ice) {
    const visible = viewer === 'corp' || ice.rezzed;
    const subs = getCard(ice.cardId)?.subroutines ?? [];
    iceView = {
      cardId: visible ? ice.cardId : null,
      strength: visible ? iceStrength(ice) : null,
      subroutines: visible ? subs.map((sub, i) => ({ text: sub.text, broken: run.broken.includes(i) })) : [],
    };
  }
  const breakers: Record<string, number> = {};
  for (const c of state.rig) if (breakerCard(state, c.uid)) breakers[c.uid] = breakerStrength(state, c.uid);
  const options = runStepOptions(state, viewer);
  return {
    server: run.server,
    position: run.position,
    step: run.step,
    waitingOn: waitingOn(state) as Side,
    iceUid: ice?.uid ?? null,
    ice: iceView,
    breakerStrength: breakers,
    access: run.access
      ? {
          cards: run.access.cards.map((c) => ({
            // Deck order is hidden from the Corp too.
            cardId: viewer === 'corp' && c.from === 'rd' ? null : c.cardId,
            from: c.from,
            stolen: c.stolen,
            uid: c.uid ?? null,
          })),
        }
      : null,
    extraAccess: run.extraAccess,
    bypassPending: run.bypassNext,
    options,
    tempCredits: run.tempCredits,
    letFire: letFireView(state, viewer, options),
    breakAll: breakAllView(state, viewer, options),
  };
}

function choiceView(state: GameState, viewer: Side): ChoiceView | null {
  const c = state.choice;
  if (state.phase !== 'choice' || !c) return null;
  return {
    kind: c.kind,
    waitingOn: c.player,
    cardId: c.cardId,
    ...(c.target !== undefined ? { target: c.target } : {}),
    options: choiceOptions(state, viewer),
  };
}

/** Runner only, only between runs, only when the most recent run accessed something. */
function lastRunView(state: GameState, viewer: Side): LastRunView | null {
  const last = state.lastRun;
  if (viewer !== 'runner' || state.run || !last || last.cards.length === 0) return null;
  return { server: last.server, cards: last.cards.map((c) => ({ cardId: c.cardId, from: c.from })) };
}

export function viewFor(player: Side, state: GameState): PlayerView {
  const pendingDiscard =
    state.phase === 'discard' && state.activePlayer === player
      ? discardCount(state.players[player].hand.length, maxHandSize(state, player))
      : 0;
  return {
    viewer: player,
    turn: state.turn,
    activePlayer: state.activePlayer,
    phase: state.phase,
    pendingDiscard,
    result: copyResult(state.result),
    players: {
      corp: sideView(state, 'corp', player),
      runner: sideView(state, 'runner', player),
    },
    corpServers: state.servers.map((s) => ({
      id: s.id,
      ice: s.ice.map((c) => corpCardView(c, player)),
      content: s.content.map((c) => corpCardView(c, player)),
    })),
    rig: state.rig.map((c) => ({ uid: c.uid, cardId: c.cardId, faceUp: true, advancements: c.advancements, hostedCredits: c.hostedCredits })),
    memory: { used: memoryUsed(state), limit: memoryLimit(state) },
    handOptions: handOptions(state, player),
    runOptions: runStartOptions(state, player),
    installedOptions: installedOptions(state, player),
    run: runView(state, player),
    badPublicity: state.badPublicity,
    choice: choiceView(state, player),
    legalActions: legalActions(state, player),
    lastRun: lastRunView(state, player),
  };
}

/** Projects one event for `player`, removing what they may not see. */
function viewEvent(player: Side, e: GameEvent): GameEvent {
  if (!('player' in e)) return viewNeutralEvent(player, e);
  if (e.player === player) return e;
  if (e.type === 'card_drawn') return { type: 'card_drawn', player: e.player };
  if (e.type === 'cards_discarded') {
    const base = { type: 'cards_discarded', player: e.player, count: e.count } as const;
    // Runner discards are face up; Corp discards go face down to Archives.
    return e.player === 'runner' && e.cardIds ? { ...base, cardIds: e.cardIds.slice() } : base;
  }
  if (e.type === 'card_installed') {
    const { handIndex: _hidden, cardId, ...rest } = e;
    // Corp installs are face down: the Runner never learns the card id.
    return e.player === 'runner' && cardId !== undefined ? { ...rest, cardId } : rest;
  }
  if (e.type === 'card_played') {
    const { handIndex: _hidden, ...rest } = e;
    return rest;
  }
  return e;
}

/** Events without a `player` field that still hide something from one side. */
function viewNeutralEvent(player: Side, e: GameEvent): GameEvent {
  // R&D order is hidden from the Corp too: it learns that a card was accessed, not which.
  if (e.type === 'card_accessed' && e.from === 'rd' && player === 'corp') {
    const { cardId: _hidden, ...rest } = e;
    return rest;
  }
  return e;
}

/** Projects events for `player`, hiding information they may not see. */
export function viewEvents(player: Side, events: readonly GameEvent[]): GameEvent[] {
  return events.map((e) => viewEvent(player, e));
}
