/**
 * The validation table: the single place that decides whether an action is
 * legal. Used by both `apply` and `legalActions`, so they can never disagree.
 *
 * Each action type lists its checks in order; the first one that fails gives
 * the rejection reason. The order is the same for every action:
 *   invalid_action (shape) -> game_over -> not_your_turn -> wrong_phase
 *   -> no_clicks -> deck_empty / bad_discard
 *   -> bad_card -> bad_target -> not_implemented -> no_credits -> no_memory
 * `RULES` is a `Record` over every ActionType, so a new action without an
 * entry is a type error.
 */
import type { ActionOf, ActionType, Action } from './actions';
import type { RejectReason } from './events';
import { getCard, type CardDef } from '@overclock/cards';
import { MAX_HAND_SIZE, MEMORY_LIMIT, type GameState, type Phase, type Server, type ServerId, type Side } from './state';

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

const serverShape = (_s: GameState, a: ActionOf<'install'>): RejectReason | null => {
  const server: unknown = a.server;
  return server === undefined || typeof server === 'string' ? null : 'invalid_action';
};

// ---- install / play: card, target, cost -------------------------------------

/** The card definition at `handIndex` in `player`'s hand, if any. */
export function handCard(s: GameState, player: Side, handIndex: number): CardDef | undefined {
  const id = s.players[player].hand[handIndex];
  return id === undefined ? undefined : getCard(id);
}

export function isPlayable(card: CardDef): boolean {
  return card.type === 'operation' || card.type === 'event';
}

export function findServer(s: GameState, id: string): Server | undefined {
  return s.servers.find((x) => x.id === id);
}

function isRemote(server: Server): boolean {
  return server.id.startsWith('remote');
}

/** True if `server` already holds an agenda or an asset (one per remote). */
function holdsAgendaOrAsset(server: Server): boolean {
  return server.content.some((c) => {
    const t = getCard(c.cardId)?.type;
    return t === 'agenda' || t === 'asset';
  });
}

/**
 * Whether `card` may be installed by `player` at `server` (ignoring turn,
 * clicks, credits and memory). Corp: agenda/asset -> a remote with no
 * agenda/asset, or 'new'; upgrade and ICE -> any server or 'new'. Runner: no
 * server may be named.
 */
export function targetAllowed(s: GameState, player: Side, card: CardDef, server: string | undefined): boolean {
  if (player === 'runner') return server === undefined;
  if (server === undefined) return false;
  if (server === 'new') return true;
  const target = findServer(s, server);
  if (!target) return false;
  if (card.type === 'agenda' || card.type === 'asset') return isRemote(target) && !holdsAgendaOrAsset(target);
  return true; // ICE and upgrades go anywhere
}

/** Credits an install costs. Corp ICE: 1 per ICE already on the server; other Corp cards: 0; Runner: card cost. */
export function installCost(s: GameState, player: Side, card: CardDef, server: ServerId | 'new' | undefined): number {
  if (player === 'runner') return card.cost;
  if (card.type !== 'ice' || server === undefined || server === 'new') return 0;
  return findServer(s, server)?.ice.length ?? 0;
}

/** Memory used by the Runner's installed programs. */
export function memoryUsed(state: GameState): number {
  return state.rig.reduce((sum, c) => sum + (getCard(c.cardId)?.memory ?? 0), 0);
}

const installableCard = (s: GameState, a: ActionOf<'install'>): RejectReason | null => {
  const card = handCard(s, a.player, a.handIndex);
  return card && card.side === a.player && !isPlayable(card) ? null : 'bad_card';
};

const playableCard = (s: GameState, a: ActionOf<'play'>): RejectReason | null => {
  const card = handCard(s, a.player, a.handIndex);
  return card && card.side === a.player && isPlayable(card) ? null : 'bad_card';
};

// The checks below run after the card check, so the card exists.
const cardOf = (s: GameState, a: ActionOf<'install' | 'play'>): CardDef => handCard(s, a.player, a.handIndex) as CardDef;

const validTarget = (s: GameState, a: ActionOf<'install'>): RejectReason | null =>
  targetAllowed(s, a.player, cardOf(s, a), a.server) ? null : 'bad_target';

const implemented = (s: GameState, a: ActionOf<'install' | 'play'>): RejectReason | null =>
  cardOf(s, a).needs === undefined ? null : 'not_implemented';

const affordInstall = (s: GameState, a: ActionOf<'install'>): RejectReason | null =>
  s.players[a.player].credits >= installCost(s, a.player, cardOf(s, a), a.server) ? null : 'no_credits';

const affordPlay = (s: GameState, a: ActionOf<'play'>): RejectReason | null =>
  s.players[a.player].credits >= cardOf(s, a).cost ? null : 'no_credits';

const memoryRoom = (s: GameState, a: ActionOf<'install'>): RejectReason | null => {
  const card = cardOf(s, a);
  if (card.type !== 'program') return null;
  return memoryUsed(s) + (card.memory ?? 0) <= MEMORY_LIMIT ? null : 'no_memory';
};

const ACT = [notOver, yourTurn, inPhase('action'), hasClick] as const;

export const RULES: RuleTable = {
  draw: [playerShape, ...ACT, deckNotEmpty],
  gain_credit: [playerShape, ...ACT],
  end_turn: [playerShape, notOver, yourTurn, inPhase('action')],
  discard: [playerShape, indicesShape, notOver, yourTurn, inPhase('discard'), validDiscard],
  install: [playerShape, handIndexShape, serverShape, ...ACT, installableCard, validTarget, implemented, affordInstall, memoryRoom],
  play: [playerShape, handIndexShape, ...ACT, playableCard, implemented, affordPlay],
};

/** How many cards a hand of `handSize` must discard at end of turn. */
export function discardCount(handSize: number): number {
  return Math.max(0, handSize - MAX_HAND_SIZE);
}

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
