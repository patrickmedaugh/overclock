import type { Action, InstallTarget } from './actions';
import { legalActions } from './apply';
import type { GameEvent, RejectReason } from './events';
import { discardCount } from './rules';
import {
  BASE_MEMORY,
  memoryUsed,
  type GameResult,
  type GameState,
  type Installed,
  type Phase,
  type PlayerState,
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
  /** Discard pile, bottom = index 0. null = face down to this viewer (Corp hand-limit discards, seen by the Runner). */
  readonly discard: readonly (string | null)[];
}

/** An installed card as one viewer sees it. */
export interface InstalledView {
  readonly uid: string;
  /** null when the card is face down to this viewer (the Runner looking at Corp cards). */
  readonly cardId: string | null;
  readonly faceUp: boolean;
}

export interface ServerView {
  readonly id: ServerId;
  /** Remote number ("Server N"), or null for HQ / R&D / Archives. */
  readonly remote: number | null;
  /** index 0 innermost, last outermost. */
  readonly ice: readonly InstalledView[];
  readonly root: readonly InstalledView[];
}

export interface RigView {
  readonly program: readonly InstalledView[];
  readonly hardware: readonly InstalledView[];
  readonly resource: readonly InstalledView[];
  readonly memory: { readonly used: number; readonly limit: number };
}

/** One place a hand card can go, priced by the engine. */
export interface PlaceOption {
  /** A server, 'new' (create a remote), 'rig' (Runner install) or 'play' (operation/event). */
  readonly place: InstallTarget | 'rig' | 'play';
  /** Credits it would cost. */
  readonly cost: number;
  /** Send this verbatim to take the option. */
  readonly action: Action;
  /** Why it would be refused right now (no_clicks / no_credits / no_memory / needs_runs), or null if legal. */
  readonly reason: RejectReason | null;
}

/** Where the hand card at `handIndex` can go. Structurally impossible places are left out. */
export interface HandOption {
  readonly handIndex: number;
  readonly places: readonly PlaceOption[];
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
  /** The Corp's servers: hq, rd, archives, then remotes in creation order. */
  readonly servers: readonly ServerView[];
  /** The Runner's installed cards (face up to both). */
  readonly rig: RigView;
  /** Actions the viewer may take now (so the AI/client never need the full state). */
  readonly legalActions: readonly Action[];
  /** Active viewer in the action phase only (else []): one entry per hand card, in hand order. */
  readonly handOptions: readonly HandOption[];
}

function sideView(p: PlayerState, side: Side, viewer: Side): PlayerSideView {
  return {
    deckCount: p.deck.length,
    handCount: p.hand.length,
    hand: side === viewer ? p.hand.slice() : null,
    credits: p.credits,
    clicks: p.clicks,
    discardCount: p.discard.length,
    discard: p.discard.map((d) => (d.faceUp || side === viewer ? d.cardId : null)),
  };
}

function copyResult(r: GameResult | null): PlayerView['result'] {
  return r ? { winner: r.winner, reason: r.reason } : null;
}

/** Corp cards are face down (not rezzed yet): only the Corp sees their ids. */
function corpInstalled(c: Installed, viewer: Side): InstalledView {
  return { uid: c.uid, cardId: viewer === 'corp' ? c.cardId : null, faceUp: c.rezzed };
}

/** Rig cards are face up to both players. */
function rigInstalled(c: Installed): InstalledView {
  return { uid: c.uid, cardId: c.cardId, faceUp: true };
}

function remoteNumber(id: ServerId): number | null {
  return id.startsWith('remote-') ? Number(id.slice('remote-'.length)) : null;
}

export function viewFor(player: Side, state: GameState): PlayerView {
  const pendingDiscard =
    state.phase === 'discard' && state.activePlayer === player
      ? discardCount(state.players[player].hand.length)
      : 0;
  const rig = state.players.runner.rig;
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
    servers: state.players.corp.servers.map((s) => ({
      id: s.id,
      remote: remoteNumber(s.id),
      ice: s.ice.map((c) => corpInstalled(c, player)),
      root: s.root.map((c) => corpInstalled(c, player)),
    })),
    rig: {
      program: rig.program.map(rigInstalled),
      hardware: rig.hardware.map(rigInstalled),
      resource: rig.resource.map(rigInstalled),
      memory: { used: memoryUsed(state), limit: BASE_MEMORY },
    },
    legalActions: legalActions(state, player),
    handOptions: [],
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
  return e;
}

/** Projects events for `player`, hiding information they may not see. */
export function viewEvents(player: Side, events: readonly GameEvent[]): GameEvent[] {
  return events.map((e) => viewEvent(player, e));
}
