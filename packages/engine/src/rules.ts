/**
 * The validation table: the single place that decides whether an action is
 * legal. Used by both `apply` and `legalActions`, so they can never disagree.
 *
 * Each action type lists its checks in order; the first one that fails gives
 * the rejection reason. The shared prefix is the same for every action:
 *   invalid_action (shape) -> game_over -> not_your_turn -> wrong_phase -> no_clicks
 * then: draw deck_empty; discard bad_discard;
 *   install bad_card -> bad_target -> slot_taken -> no_memory -> no_credits;
 *   play bad_card -> needs_runs -> no_credits.
 * `RULES` is a `Record` over every ActionType, so a new action without an
 * entry is a type error.
 */
import { getCard, type CardDef, type CardType } from '@overclock/cards';
import type { ActionOf, ActionType, Action } from './actions';
import type { RejectReason } from './events';
import { BASE_MEMORY, MAX_HAND_SIZE, memoryUsed, type GameState, type Phase, type ServerId, type ServerState, type Side } from './state';

/** A check sees the state and a not-yet-trusted action of its type (shape is checked first). */
type Check<T extends ActionType> = (state: GameState, action: ActionOf<T>) => RejectReason | null;

type RuleTable = { readonly [T in ActionType]: readonly Check<T>[] };

function isSide(x: unknown): x is Side {
  return x === 'corp' || x === 'runner';
}

// ---- shared checks (in precedence order) -----------------------------------

const playerShape = (_s: GameState, a: Action): RejectReason | null => (isSide(a.player) ? null : 'invalid_action');

const notOver = (s: GameState): RejectReason | null => (s.phase === 'over' ? 'game_over' : null);

const yourTurn = (s: GameState, a: Action): RejectReason | null =>
  s.activePlayer === a.player ? null : 'not_your_turn';

const inPhase =
  (phase: Phase) =>
  (s: GameState): RejectReason | null =>
    s.phase === phase ? null : 'wrong_phase';

const hasClick = (s: GameState, a: Action): RejectReason | null =>
  s.players[a.player].clicks > 0 ? null : 'no_clicks';

// ---- action-specific checks -------------------------------------------------

const deckNotEmpty = (s: GameState, a: Action): RejectReason | null =>
  s.players[a.player].deck.length > 0 ? null : 'deck_empty';

const indicesShape = (_s: GameState, a: ActionOf<'discard'>): RejectReason | null => {
  const idx: unknown = a.handIndices;
  return Array.isArray(idx) && idx.every((i) => Number.isInteger(i)) ? null : 'invalid_action';
};

/** Exactly hand - 5 distinct indices, each inside the hand. */
const validDiscard = (s: GameState, a: ActionOf<'discard'>): RejectReason | null => {
  const handSize = s.players[a.player].hand.length;
  const idx = a.handIndices;
  if (idx.length !== discardCount(handSize)) return 'bad_discard';
  if (new Set(idx).size !== idx.length) return 'bad_discard';
  if (idx.some((i) => i < 0 || i >= handSize)) return 'bad_discard';
  return null;
};

const handIndexShape = (_s: GameState, a: ActionOf<'install' | 'play'>): RejectReason | null =>
  Number.isInteger(a.handIndex) ? null : 'invalid_action';

const serverShape = (_s: GameState, a: ActionOf<'install'>): RejectReason | null =>
  a.server === undefined || typeof a.server === 'string' ? null : 'invalid_action';

/** The card at `handIndex` in the acting player's hand (undefined if out of range). */
export function handCard(s: GameState, a: ActionOf<'install' | 'play'>): CardDef | undefined {
  const id = s.players[a.player].hand[a.handIndex];
  return id === undefined ? undefined : getCard(id);
}

/** Card types each side can install. */
const INSTALLABLE: Readonly<Record<Side, readonly CardType[]>> = {
  corp: ['agenda', 'asset', 'upgrade', 'ice'],
  runner: ['program', 'hardware', 'resource'],
};

export function findServer(s: GameState, id: ServerId): ServerState | undefined {
  return s.players.corp.servers.find((x) => x.id === id);
}

const isCentral = (id: ServerId): boolean => id === 'hq' || id === 'rd' || id === 'archives';
/** Agendas and assets share a remote's single slot. */
const isSlotCard = (c: CardDef | undefined): boolean => c?.type === 'agenda' || c?.type === 'asset';

const installableCard = (s: GameState, a: ActionOf<'install'>): RejectReason | null => {
  const card = handCard(s, a);
  return card && card.side === a.player && INSTALLABLE[a.player].includes(card.type) ? null : 'bad_card';
};

/** Runner: no server. Corp: a known server or 'new'; agendas/assets only into remotes. */
const validTarget = (s: GameState, a: ActionOf<'install'>): RejectReason | null => {
  if (a.player === 'runner') return a.server === undefined ? null : 'bad_target';
  if (a.server === undefined) return 'bad_target';
  if (a.server === 'new') return null;
  const server = findServer(s, a.server);
  if (!server) return 'bad_target';
  return isSlotCard(handCard(s, a)) && isCentral(server.id) ? 'bad_target' : null;
};

/** A remote holds at most one agenda or asset (upgrades are unlimited). */
const slotFree = (s: GameState, a: ActionOf<'install'>): RejectReason | null => {
  if (a.player !== 'corp' || a.server === undefined || a.server === 'new' || !isSlotCard(handCard(s, a))) return null;
  const server = findServer(s, a.server);
  return server?.root.some((c) => isSlotCard(getCard(c.cardId))) ? 'slot_taken' : null;
};

/**
 * Credits an install costs. Corp ICE: 1 per ICE already protecting the target
 * ('new' = 0). Other Corp cards: 0 (rez costs come later). Runner: the card's cost.
 * Only meaningful once the structural checks have passed.
 */
export function installCost(s: GameState, a: ActionOf<'install'>): number {
  const card = handCard(s, a);
  if (!card) return 0;
  if (a.player === 'runner') return card.cost;
  if (card.type !== 'ice' || a.server === undefined || a.server === 'new') return 0;
  return findServer(s, a.server)?.ice.length ?? 0;
}

/** Programs need `memory` free (limit BASE_MEMORY). */
const memoryFree = (s: GameState, a: ActionOf<'install'>): RejectReason | null => {
  const card = handCard(s, a);
  if (a.player !== 'runner' || card?.type !== 'program') return null;
  return memoryUsed(s) + (card.memory ?? 0) <= BASE_MEMORY ? null : 'no_memory';
};

const canAffordInstall = (s: GameState, a: ActionOf<'install'>): RejectReason | null =>
  s.players[a.player].credits >= installCost(s, a) ? null : 'no_credits';

/** Only your own operations (Corp) and events (Runner) can be played. */
const playableCard = (s: GameState, a: ActionOf<'play'>): RejectReason | null => {
  const card = handCard(s, a);
  const type = a.player === 'corp' ? 'operation' : 'event';
  return card && card.side === a.player && card.type === type ? null : 'bad_card';
};

/** Cards that need runs can't be played until runs are built. */
const notNeedingRuns = (s: GameState, a: ActionOf<'play'>): RejectReason | null =>
  handCard(s, a)?.needs === 'runs' ? 'needs_runs' : null;

const canAffordPlay = (s: GameState, a: ActionOf<'play'>): RejectReason | null =>
  s.players[a.player].credits >= (handCard(s, a)?.cost ?? 0) ? null : 'no_credits';

export const RULES: RuleTable = {
  draw: [playerShape, notOver, yourTurn, inPhase('action'), hasClick, deckNotEmpty],
  gain_credit: [playerShape, notOver, yourTurn, inPhase('action'), hasClick],
  end_turn: [playerShape, notOver, yourTurn, inPhase('action')],
  discard: [playerShape, indicesShape, notOver, yourTurn, inPhase('discard'), validDiscard],
  install: [
    playerShape,
    handIndexShape,
    serverShape,
    notOver,
    yourTurn,
    inPhase('action'),
    hasClick,
    installableCard,
    validTarget,
    slotFree,
    memoryFree,
    canAffordInstall,
  ],
  play: [
    playerShape,
    handIndexShape,
    notOver,
    yourTurn,
    inPhase('action'),
    hasClick,
    playableCard,
    notNeedingRuns,
    canAffordPlay,
  ],
};

/** How many cards a hand of `handSize` must discard at end of turn. */
export function discardCount(handSize: number): number {
  return Math.max(0, handSize - MAX_HAND_SIZE);
}

/**
 * The structural part of each row: checks that say a place can never take the
 * card (as opposed to "not now": clicks, credits, memory, needs_runs).
 * `handOptions` leaves out places that fail these.
 */
export const STRUCTURAL: { readonly [T in 'install' | 'play']: readonly Check<T>[] } = {
  install: [installableCard, validTarget, slotFree],
  play: [playableCard],
};

function isKnownType(t: unknown): t is ActionType {
  return typeof t === 'string' && Object.prototype.hasOwnProperty.call(RULES, t);
}

/**
 * Why `action` is illegal in `state`, or null if it is legal. Accepts untyped
 * input (JSON from a client or a replay log) and never throws.
 */
export function rejectionFor(state: GameState, action: unknown): RejectReason | null {
  if (typeof action !== 'object' || action === null) return 'invalid_action';
  const type = (action as { type?: unknown }).type;
  if (!isKnownType(type)) return 'invalid_action';
  const checks = RULES[type] as readonly Check<ActionType>[];
  for (const check of checks) {
    const reason = check(state, action as Action);
    if (reason) return reason;
  }
  return null;
}

/** The first structural failure for an install/play (see STRUCTURAL), or null. */
export function structuralRejection(state: GameState, action: ActionOf<'install' | 'play'>): RejectReason | null {
  const checks = STRUCTURAL[action.type] as readonly Check<'install' | 'play'>[];
  for (const check of checks) {
    const reason = check(state, action);
    if (reason) return reason;
  }
  return null;
}
