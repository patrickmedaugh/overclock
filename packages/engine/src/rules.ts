/**
 * The validation table: the single place that decides whether an action is
 * legal. Used by both `apply` and `legalActions`, so they can never disagree.
 *
 * Each action type lists its checks in order; the first one that fails gives
 * the rejection reason. The order is the same for every action:
 *   invalid_action (shape) -> game_over -> not_your_turn -> wrong_phase
 *   -> no_clicks -> deck_empty / bad_discard
 *   (install/play: -> no_clicks -> bad_card -> bad_target -> not_implemented
 *    -> condition_not_met (play) -> no_credits -> no_memory)
 *   (run decisions: -> wrong_phase -> bad_target -> too_weak -> no_credits;
 *    `not_your_turn` there means "not the deciding side", see `waitingOn`)
 * `RULES` is a `Record` over every ActionType, so a new action without an
 * entry is a type error.
 */
import type { ActionOf, ActionType, Action } from './actions';
import type { RejectReason } from './events';
import { getCard, type BreakerAbility, type CardDef, type CardType, type Effect, type PlayCondition } from '@overclock/cards';
import {
  CENTRAL_SERVERS,
  MAX_HAND_SIZE,
  MEMORY_LIMIT,
  type GameState,
  type AccessCard,
  type Installed,
  type Phase,
  type RunState,
  type RunStep,
  type Server,
  type Side,
} from './state';

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

const serverShape = (_s: GameState, a: ActionOf<'install' | 'play'>): RejectReason | null => {
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

/** `server` only for run events with no fixed server (then required and existing); absent otherwise. */
const playTarget = (s: GameState, a: ActionOf<'play'>): RejectReason | null => {
  if (!openRunEffect(handCard(s, a.player, a.handIndex))) return a.server === undefined ? null : 'bad_target';
  return findServer(s, a.server) ? null : 'bad_target';
};

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

const builtYet = (s: GameState, a: ActionOf<'install' | 'play'>): RejectReason | null =>
  handCard(s, a.player, a.handIndex)?.needs ? 'not_implemented' : null;

/** Card `playIf` conditions. `runner_ran_last_turn`: a run was started in the previous turn (the Runner's). */
const PLAY_CONDITIONS: Readonly<Record<PlayCondition, (s: GameState) => boolean>> = {
  runner_ran_last_turn: (s) => s.lastRunTurn !== null && s.lastRunTurn === s.turn - 1,
};

const playCondition = (s: GameState, a: ActionOf<'play'>): RejectReason | null => {
  const cond = handCard(s, a.player, a.handIndex)?.playIf;
  return cond === undefined || PLAY_CONDITIONS[cond](s) ? null : 'condition_not_met';
};

// ---- runs: pure queries -------------------------------------------------------

/**
 * Who the game waits on: the open choice's player; the run's decider (Corp at
 * approach, else Runner); else the active player; null when over.
 */
export function waitingOn(s: GameState): Side | null {
  if (s.phase === 'over') return null;
  if (s.phase === 'choice' && s.choice) return s.choice.player;
  if (s.phase === 'run' && s.run) return s.run.step === 'approach' ? 'corp' : 'runner';
  return s.activePlayer;
}

/** The current ICE of the run (approached / encountered / just passed), or undefined at the server. */
export function currentIce(s: GameState, run: RunState | null = s.run): Installed | undefined {
  if (!run || run.position < 0) return undefined;
  return findServer(s, run.server)?.ice[run.position];
}

/** A `run` effect with no fixed server (the player names it when playing), if the card has one. */
export function openRunEffect(card: CardDef | undefined): Extract<Effect, { op: 'run' }> | undefined {
  const e = card?.onPlay?.find((x) => x.op === 'run');
  return e && e.op === 'run' && e.server === undefined ? e : undefined;
}

/** The breaker card of rig card `uid`, if it is an installed icebreaker. */
export function breakerCard(s: GameState, uid: unknown): { installed: Installed; card: CardDef } | undefined {
  const installed = s.rig.find((c) => c.uid === uid);
  const card = installed && getCard(installed.cardId);
  return installed && card?.abilities ? { installed, card } : undefined;
}

/** A breaker's current strength: printed + boosts for this encounter and this run. */
export function breakerStrength(s: GameState, uid: string): number {
  const b = breakerCard(s, uid);
  const base = b?.card.strength ?? 0;
  return base + (s.run?.encounterBoost[uid] ?? 0) + (s.run?.runBoost[uid] ?? 0);
}

/** The ICE type a breaker breaks (from its break ability). */
export function breakerIceType(card: CardDef): string | undefined {
  return card.abilities?.find((a) => a.op === 'break')?.iceType;
}

/** Credits to trash an accessed card (its trash cost). */
export function trashCost(card: AccessCard): number {
  return getCard(card.cardId)?.trashCost ?? 0;
}

const isAgenda = (c: AccessCard) => getCard(c.cardId)?.type === 'agenda';
const taken = (c: AccessCard) => c.stolen || c.trashed;

/** True when the shown access group still holds an agenda that must be stolen. */
export function unstolenAgendaShown(s: GameState): boolean {
  return (s.run?.access?.cards ?? []).some((c) => isAgenda(c) && !taken(c));
}

// ---- runs: checks -------------------------------------------------------------

const decides = (s: GameState, a: Action): RejectReason | null => (waitingOn(s) === a.player ? null : 'not_your_turn');

const atStep =
  (...steps: RunStep[]) =>
  (s: GameState): RejectReason | null =>
    s.phase === 'run' && s.run && steps.includes(s.run.step) ? null : 'wrong_phase';

const ALL_STEPS: RunStep[] = ['approach', 'encounter', 'continue', 'access'];

const isInt = (x: unknown) => Number.isInteger(x);

const runServerShape = (_s: GameState, a: ActionOf<'run'>): RejectReason | null =>
  typeof a.server === 'string' ? null : 'invalid_action';

const runTarget = (s: GameState, a: ActionOf<'run'>): RejectReason | null =>
  a.player === 'runner' && findServer(s, a.server) ? null : 'bad_target';

const rezUidShape = (_s: GameState, a: ActionOf<'rez'>): RejectReason | null =>
  typeof a.uid === 'string' ? null : 'invalid_action';

/** The approached ICE's rez cost (its card cost; discounts are not built yet). */
export function rezCost(ice: Installed): number {
  return getCard(ice.cardId)?.cost ?? 0;
}

/** Every unrezzed installed Corp ICE: servers in order, then ICE index order (innermost first). */
export function unrezzedIce(s: GameState): Installed[] {
  return s.servers.flatMap((sv) => sv.ice.filter((c) => !c.rezzed));
}

/** `free_rez` choice: any unrezzed installed ICE. Run: the approached ICE, still unrezzed. */
const rezTarget = (s: GameState, a: ActionOf<'rez'>): RejectReason | null => {
  if (s.phase === 'choice') return unrezzedIce(s).some((c) => c.uid === a.uid) ? null : 'bad_target';
  const ice = currentIce(s);
  return ice && ice.uid === a.uid && !ice.rezzed ? null : 'bad_target';
};

/** The free-rez choice costs nothing. */
const canAffordRez = (s: GameState): RejectReason | null =>
  s.phase === 'choice' || s.players.corp.credits >= rezCost(currentIce(s) as Installed) ? null : 'no_credits';

/** `rez`/`pass` also answer an open choice (Priority Requisition: rez one ICE for free, or Skip). */
const atStepOrChoice =
  (...steps: RunStep[]) =>
  (s: GameState): RejectReason | null =>
    s.phase === 'choice' && s.choice ? null : atStep(...steps)(s);

/** Leave it / Done is refused while an agenda that must be stolen is shown. */
const passAllowed = (s: GameState): RejectReason | null =>
  s.run?.step === 'access' && unstolenAgendaShown(s) ? 'bad_target' : null;

const abilityShape = (_s: GameState, a: ActionOf<'use_ability'>): RejectReason | null =>
  typeof a.uid === 'string' && isInt(a.ability) && (a.sub === undefined || isInt(a.sub)) ? null : 'invalid_action';

/** The ability being used, when the breaker, ability and (for breaks) subroutine are all valid targets. */
export function abilityTarget(s: GameState, a: ActionOf<'use_ability'>): BreakerAbility | undefined {
  const b = breakerCard(s, a.uid);
  const ice = currentIce(s);
  const iceCard = ice && getCard(ice.cardId);
  if (!b || !iceCard || b.installed.uid !== a.uid) return undefined;
  // A breaker of the wrong kind can do nothing here (its pump would be pointless).
  if (breakerIceType(b.card) !== iceCard.subtype) return undefined;
  const ability = b.card.abilities?.[a.ability];
  if (!ability) return undefined;
  if (ability.op === 'break') {
    const subs = iceCard.subroutines ?? [];
    if (a.sub === undefined || a.sub < 0 || a.sub >= subs.length) return undefined;
    if (s.run?.broken.includes(a.sub)) return undefined;
    if (ability.iceType !== iceCard.subtype) return undefined;
  } else if (a.sub !== undefined) {
    return undefined;
  }
  return ability;
}

const abilityTargetCheck = (s: GameState, a: ActionOf<'use_ability'>): RejectReason | null =>
  abilityTarget(s, a) ? null : 'bad_target';

/** The ICE's strength (printed; advancement bonuses are not built yet). */
export function iceStrength(ice: Installed): number {
  return getCard(ice.cardId)?.strength ?? 0;
}

const strongEnough = (s: GameState, a: ActionOf<'use_ability'>): RejectReason | null => {
  if (abilityTarget(s, a)?.op !== 'break') return null;
  return breakerStrength(s, a.uid) >= iceStrength(currentIce(s) as Installed) ? null : 'too_weak';
};

const canAffordAbility = (s: GameState, a: ActionOf<'use_ability'>): RejectReason | null =>
  s.players.runner.credits >= (abilityTarget(s, a)?.cost ?? 0) ? null : 'no_credits';

const cardShape = (_s: GameState, a: ActionOf<'steal' | 'trash'>): RejectReason | null =>
  isInt(a.card) ? null : 'invalid_action';

/** The shown access card at index `card`, if it is still there to deal with. */
export function accessCard(s: GameState, card: number): AccessCard | undefined {
  const c = s.run?.access?.cards[card];
  return c && !taken(c) ? c : undefined;
}

const stealTarget = (s: GameState, a: ActionOf<'steal'>): RejectReason | null => {
  const c = accessCard(s, a.card);
  return c && isAgenda(c) ? null : 'bad_target';
};

const trashTarget = (s: GameState, a: ActionOf<'trash'>): RejectReason | null => {
  const c = accessCard(s, a.card);
  if (!c || isAgenda(c) || c.from === 'archives') return 'bad_target';
  return getCard(c.cardId)?.trashCost === undefined ? 'bad_target' : null;
};

const canAffordTrash = (s: GameState, a: ActionOf<'trash'>): RejectReason | null =>
  s.players.runner.credits >= trashCost(accessCard(s, a.card) as AccessCard) ? null : 'no_credits';

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

const uidShape = (_s: GameState, a: ActionOf<'advance' | 'score'>): RejectReason | null =>
  typeof a.uid === 'string' ? null : 'invalid_action';

/** The Corp's installed agenda `uid` (agendas only ever sit in server content), or undefined. */
export function installedAgenda(s: GameState, uid: unknown): Installed | undefined {
  for (const sv of s.servers) {
    const c = sv.content.find((x) => x.uid === uid);
    if (c) return getCard(c.cardId)?.type === 'agenda' ? c : undefined;
  }
  return undefined;
}

/** Credits an advance costs. */
export const ADVANCE_COST = 1;

const ownAgenda = (s: GameState, a: ActionOf<'advance' | 'score'>): RejectReason | null =>
  a.player === 'corp' && installedAgenda(s, a.uid) ? null : 'bad_target';

const canAffordAdvance = (s: GameState, a: ActionOf<'advance'>): RejectReason | null =>
  s.players[a.player].credits >= ADVANCE_COST ? null : 'no_credits';

/** Counters at least the agenda's advancement requirement (not offered otherwise: bad_target). */
const enoughCounters = (s: GameState, a: ActionOf<'score'>): RejectReason | null => {
  const c = installedAgenda(s, a.uid) as Installed;
  return c.advancements >= (getCard(c.cardId)?.advancementRequirement ?? 0) ? null : 'bad_target';
};

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
  play: [
    playerShape,
    handIndexShape,
    serverShape,
    notOver,
    yourTurn,
    inPhase('action'),
    hasClick,
    playCardCheck,
    playTarget,
    builtYet,
    playCondition,
    canAffordPlay,
  ],
  run: [playerShape, runServerShape, notOver, yourTurn, inPhase('action'), hasClick, runTarget],
  rez: [playerShape, rezUidShape, notOver, decides, atStepOrChoice('approach'), rezTarget, canAffordRez],
  pass: [playerShape, notOver, decides, atStepOrChoice(...ALL_STEPS), passAllowed],
  jack_out: [playerShape, notOver, decides, atStep('continue')],
  use_ability: [
    playerShape,
    abilityShape,
    notOver,
    decides,
    atStep('encounter'),
    abilityTargetCheck,
    strongEnough,
    canAffordAbility,
  ],
  steal: [playerShape, cardShape, notOver, decides, atStep('access'), stealTarget],
  trash: [playerShape, cardShape, notOver, decides, atStep('access'), trashTarget, canAffordTrash],
  advance: [playerShape, uidShape, notOver, yourTurn, inPhase('action'), hasClick, ownAgenda, canAffordAdvance],
  score: [playerShape, uidShape, notOver, yourTurn, inPhase('action'), ownAgenda, enoughCounters],
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
