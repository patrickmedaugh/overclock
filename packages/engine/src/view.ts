import type { Action } from './actions';
import { handOptions, legalActions } from './apply';
import type { GameEvent, RejectReason } from './events';
import { discardCount, memoryUsed } from './rules';
import {
  MEMORY_LIMIT,
  type DiscardEntry,
  type GameResult,
  type GameState,
  type Installed,
  type Phase,
  type PlayerState,
  type Server,
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
  /**
   * Discard pile, bottom = index 0. An entry is null when that card is face
   * down to the viewer (Corp hand-limit discards in Archives, seen by the Runner).
   */
  readonly discard: readonly (string | null)[];
}

/** An installed card as one player sees it. */
export interface InstalledView {
  readonly uid: string;
  /** null when the viewer may not know the card (every unrezzed Corp card, for the Runner). */
  readonly cardId: string | null;
  /** Whether the card is face up on the table (Runner cards: always; Corp cards: when rezzed). */
  readonly faceUp: boolean;
}

export interface ServerView {
  readonly id: ServerId;
  /** Index 0 innermost, last = outermost. */
  readonly ice: readonly InstalledView[];
  readonly content: readonly InstalledView[];
}

/**
 * One thing the viewer could do with one hand card. Lists every target the
 * card may be offered for (wrong-type cards and disallowed servers are left
 * out); `reject` is why it can't be done right now (e.g. no_credits,
 * no_memory, not_implemented, no_clicks, not_your_turn), or null if legal.
 */
export interface CardOption {
  readonly action: Action;
  /** Credits this action costs (clicks are always 1). */
  readonly cost: number;
  readonly reject: RejectReason | null;
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
  /** Actions the viewer may take now (so the AI/client never need the full state). */
  readonly legalActions: readonly Action[];
  /** Corp servers: hq, rd, archives, then remotes in creation order. */
  readonly corpServers: readonly ServerView[];
  /** Runner's installed cards, in install order (face up to both). */
  readonly rig: readonly InstalledView[];
  /** Runner's program memory. */
  readonly memory: { readonly used: number; readonly limit: number };
  /** Per viewer hand index: the options for that card. Empty arrays for cards with none. */
  readonly handOptions: readonly (readonly CardOption[])[];
}

/** A discard entry as `viewer` sees it: the owner sees everything, the opponent only face-up cards. */
function discardEntryView(e: DiscardEntry, side: Side, viewer: Side): string | null {
  return side === viewer || e.faceUp ? e.cardId : null;
}

function installedView(c: Installed, side: Side, viewer: Side): InstalledView {
  // Runner cards are installed face up. Corp cards are face down until rezzed.
  const faceUp = side === 'runner' || c.rezzed;
  return { uid: c.uid, cardId: faceUp || side === viewer ? c.cardId : null, faceUp };
}

function serverView(s: Server, viewer: Side): ServerView {
  return {
    id: s.id,
    ice: s.ice.map((c) => installedView(c, 'corp', viewer)),
    content: s.content.map((c) => installedView(c, 'corp', viewer)),
  };
}

function sideView(p: PlayerState, side: Side, viewer: Side): PlayerSideView {
  return {
    deckCount: p.deck.length,
    handCount: p.hand.length,
    hand: side === viewer ? p.hand.slice() : null,
    credits: p.credits,
    clicks: p.clicks,
    discardCount: p.discard.length,
    discard: p.discard.map((e) => discardEntryView(e, side, viewer)),
  };
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
    legalActions: legalActions(state, player),
    corpServers: state.servers.map((s) => serverView(s, player)),
    rig: state.rig.map((c) => installedView(c, 'runner', player)),
    memory: { used: memoryUsed(state), limit: MEMORY_LIMIT },
    handOptions: handOptions(state, player),
  };
}

/** Projects one event for `player`, removing what they may not see. */
function viewEvent(player: Side, e: GameEvent): GameEvent {
  if (!('player' in e) || e.player === player) return e;
  if (e.type === 'card_drawn') return { type: 'card_drawn', player: e.player };
  if (e.type === 'card_installed') {
    const { handIndex: _h, cardId, ...rest } = e;
    // Corp installs are face down: the Runner learns where, not what.
    return e.player === 'corp' || cardId === undefined ? rest : { ...rest, cardId };
  }
  if (e.type === 'card_played') return { type: 'card_played', player: e.player, cardId: e.cardId };
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
