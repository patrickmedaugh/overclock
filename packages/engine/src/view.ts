import type { Action } from './actions';
import { handOptions, installedOptions, legalActions } from './apply';
import type { GameEvent, RejectReason } from './events';
import { discardCount, memoryUsed } from './rules';
import {
  MEMORY_LIMIT,
  pointsOf,
  type AccessFrom,
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
}

/** An installed card as one player sees it. */
export interface InstalledView {
  readonly uid: string;
  /** null when the card is face down to the viewer (the Runner, for every unrezzed Corp card). */
  readonly cardId: string | null;
  readonly faceUp: boolean;
  /** Advancement counters (both players see the number, even on a face-down card). */
  readonly advancements: number;
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
  readonly cost: number;
  readonly reject: RejectReason | null;
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
  /** Runner memory used by installed programs, and the limit. */
  readonly memory: { readonly used: number; readonly limit: number };
  /** Per viewer hand index: every offered action for that card (bad_card/bad_target never listed). */
  readonly handOptions: readonly (readonly CardOption[])[];
  /** Runner only: one `run` option per server (Corp: empty). */
  readonly runOptions: readonly CardOption[];
  /** Corp only: per installed agenda uid, `advance` and (once it has enough counters) `score` (Runner: empty). */
  readonly installedOptions: Readonly<Record<string, readonly CardOption[]>>;
  /** The run in progress, or null. */
  readonly run: RunView | null;
  /** Actions the viewer may take now (so the AI/client never need the full state). */
  readonly legalActions: readonly Action[];
}

function sideView(p: PlayerState, side: Side, viewer: Side): PlayerSideView {
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
  };
}

function corpCardView(c: Installed, viewer: Side): InstalledView {
  return { uid: c.uid, cardId: viewer === 'corp' || c.rezzed ? c.cardId : null, faceUp: c.rezzed, advancements: c.advancements };
}

function copyResult(r: GameResult | null): PlayerView['result'] {
  return r ? { winner: r.winner, reason: r.reason } : null;
}

export function viewFor(player: Side, state: GameState): PlayerView {
  const pendingDiscard =
    state.phase === 'discard' && state.activePlayer === player
      ? discardCount(state.players[player].hand.length)
      : 0;
  return {
    viewer: player,
    turn: state.turn,
    activePlayer: state.activePlayer,
    phase: state.phase,
    pendingDiscard,
    result: copyResult(state.result),
    players: {
      corp: sideView(state.players.corp, 'corp', player),
      runner: sideView(state.players.runner, 'runner', player),
    },
    corpServers: state.servers.map((s) => ({
      id: s.id,
      ice: s.ice.map((c) => corpCardView(c, player)),
      content: s.content.map((c) => corpCardView(c, player)),
    })),
    rig: state.rig.map((c) => ({ uid: c.uid, cardId: c.cardId, faceUp: true, advancements: c.advancements })),
    memory: { used: memoryUsed(state), limit: MEMORY_LIMIT },
    handOptions: handOptions(state, player),
    runOptions: [],
    installedOptions: installedOptions(state, player),
    run: null,
    legalActions: legalActions(state, player),
  };
}

/** Projects one event for `player`, removing what they may not see. */
function viewEvent(player: Side, e: GameEvent): GameEvent {
  if (!('player' in e) || e.player === player) return e;
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

/** Projects events for `player`, hiding information they may not see. */
export function viewEvents(player: Side, events: readonly GameEvent[]): GameEvent[] {
  return events.map((e) => viewEvent(player, e));
}
