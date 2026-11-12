/**
 * The validation table: the single place that decides whether an action is
 * legal. Used by both `apply` and `legalActions`, so they can never disagree.
 *
 * Each action type lists its checks in order; the first one that fails gives
 * the rejection reason. The order is the same for every action:
 *   invalid_action (shape) -> game_over -> not_your_turn -> wrong_phase
 *   -> no_clicks -> deck_empty / bad_discard
 *   (install/play: -> no_clicks -> bad_card -> bad_target -> not_implemented
 *    -> no_credits -> no_memory)
 * `RULES` is a `Record` over every ActionType, so a new action without an
 * entry is a type error.
 */
import type { ActionOf, ActionType, Action } from './actions';
import type { RejectReason } from './events';
import { getCard, type CardDef, type CardType } from '@overclock/cards';
import { CENTRAL_SERVERS, MAX_HAND_SIZE, MEMORY_LIMIT, type GameState, type Phase, type Server, type Side } from './state';

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

/** Card types each side may install / play. */
const INSTALLABLE: Readonly<Record<Side, readonly CardType[]>> = {
  corp: ['agenda', 'asset', 'upgrade', 'ice'],
  runner: ['program', 'hardware', 'resource'],
};
const PLAYABLE: Readonly<Record<Side, readonly CardType[]>> = { corp: ['operation'], runner: ['event'] };

/** The definition of `player`'s hand card at `handIndex`, or undefined if out of range / unknown. */
export function handCard(s: GameState, player: Side, handIndex: number): CardDef | undefined {
  const id = s.players[player].hand[handIndex];
  return id === undefined ? undefined : getCard(id);
}

/** Server by id (own-property safe), or undefined. */
export function findServer(s: GameState, id: unknown): Server | undefined {
  return s.servers.find((sv) => sv.id === id);
}

const cardFor =
  (allowed: Readonly<Record<Side, readonly CardType[]>>) =>
  (s: GameState, a: ActionOf<'install' | 'play'>): RejectReason | null => {
    const card = handCard(s, a.player, a.handIndex);
    return card && card.side === a.player && allowed[a.player].includes(card.type) ? null : 'bad_card';
  };

export const installCardCheck = cardFor(INSTALLABLE);
const playCardCheck = cardFor(PLAYABLE);

/** Corp: agenda/asset -> a remote without agenda/asset, or 'new'; upgrade/ICE -> any server or 'new'. Runner: no server. */
export const installTargetCheck = (s: GameState, a: ActionOf<'install'>): RejectReason | null => {
  if (a.player === 'runner') return a.server === undefined ? null : 'bad_target';
  if (a.server === 'new') return null;
  const server = findServer(s, a.server);
  if (!server) return 'bad_target';
  const card = handCard(s, a.player, a.handIndex) as CardDef;
  if (card.type === 'agenda' || card.type === 'asset') {
    if ((CENTRAL_SERVERS as readonly string[]).includes(server.id)) return 'bad_target';
    const taken = server.content.some((c) => {
      const t = getCard(c.cardId)?.type;
      return t === 'agenda' || t === 'asset';
    });
    if (taken) return 'bad_target';
  }
  return null;
};

/** Effects the engine resolves today (E1 stub: run/damage effects arrive in E3-E5). */
const BUILT_EFFECTS: ReadonlySet<string> = new Set(['gain_credits', 'draw']);

const builtYet = (s: GameState, a: ActionOf<'install' | 'play'>): RejectReason | null => {
  const card = handCard(s, a.player, a.handIndex);
  if (!card) return null;
  if (card.needs || card.playIf) return 'not_implemented';
  return (card.onPlay ?? []).every((e) => BUILT_EFFECTS.has(e.op)) ? null : 'not_implemented';
};

/** E1 stub for Sprint 3 actions not built yet. */
const notYet = (): RejectReason => 'not_implemented';

/**
 * Credits an install costs. Corp ICE: 1 per ICE already on the server ('new' = 0);
 * other Corp installs: 0. Runner: the card's cost. Assumes card and target are valid.
 */
export function installCost(s: GameState, a: ActionOf<'install'>): number {
  const card = handCard(s, a.player, a.handIndex);
  if (!card) return 0;
  if (a.player === 'runner') return card.cost;
  if (card.type !== 'ice' || a.server === 'new') return 0;
  return findServer(s, a.server)?.ice.length ?? 0;
}

/** Credits a play costs: the card's cost. */
export function playCost(s: GameState, a: ActionOf<'play'>): number {
  return handCard(s, a.player, a.handIndex)?.cost ?? 0;
}

const canAffordInstall = (s: GameState, a: ActionOf<'install'>): RejectReason | null =>
  s.players[a.player].credits >= installCost(s, a) ? null : 'no_credits';

const canAffordPlay = (s: GameState, a: ActionOf<'play'>): RejectReason | null =>
  s.players[a.player].credits >= playCost(s, a) ? null : 'no_credits';

const memoryFits = (s: GameState, a: ActionOf<'install'>): RejectReason | null => {
  const card = handCard(s, a.player, a.handIndex);
  if (!card || card.type !== 'program') return null;
  return memoryUsed(s) + (card.memory ?? 0) <= MEMORY_LIMIT ? null : 'no_memory';
};

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
    installCardCheck,
    installTargetCheck,
    builtYet,
    canAffordInstall,
    memoryFits,
  ],
  play: [playerShape, handIndexShape, notOver, yourTurn, inPhase('action'), hasClick, playCardCheck, builtYet, canAffordPlay],
  run: [playerShape, notOver, notYet],
  rez: [playerShape, notOver, notYet],
  pass: [playerShape, notOver, notYet],
  jack_out: [playerShape, notOver, notYet],
  use_ability: [playerShape, notOver, notYet],
  steal: [playerShape, notOver, notYet],
  trash: [playerShape, notOver, notYet],
  advance: [playerShape, notOver, notYet],
  score: [playerShape, notOver, notYet],
};

/** Memory used by the Runner's installed programs (card data `memory`). */
export function memoryUsed(state: GameState): number {
  return state.rig.reduce((sum, c) => sum + (getCard(c.cardId)?.memory ?? 0), 0);
}

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
