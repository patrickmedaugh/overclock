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
import { getCard, type BreakerAbility, type CardAbility, type CardDef, type CardType, type Effect, type PlayCondition } from '@overclock/cards';
import {
  CENTRAL_SERVERS,
  IDENTITY_UID,
  MAX_HAND_SIZE,
  MEMORY_LIMIT,
  maxHandSize,
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

/** Exactly hand − max hand size (Sprint 8: 5 − brain damage) distinct indices, each inside the hand. */
const validDiscard = (s: GameState, a: ActionOf<'discard'>): RejectReason | null => {
  const handSize = s.players[a.player].hand.length;
  const idx = a.handIndices;
  if (idx.length !== discardCount(handSize, maxHandSize(s, a.player))) return 'bad_discard';
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

const ALL_STEPS: RunStep[] = ['approach', 'encounter', 'continue', 'success', 'access'];

const isInt = (x: unknown) => Number.isInteger(x);

const runServerShape = (_s: GameState, a: ActionOf<'run'>): RejectReason | null =>
  typeof a.server === 'string' ? null : 'invalid_action';

const runTarget = (s: GameState, a: ActionOf<'run'>): RejectReason | null =>
  a.player === 'runner' && findServer(s, a.server) ? null : 'bad_target';

const rezUidShape = (_s: GameState, a: ActionOf<'rez'>): RejectReason | null =>
  typeof a.uid === 'string' ? null : 'invalid_action';

/** Sprint 7: an installed Corp card with its server and zone, or undefined. */
export function corpInstalled(s: GameState, uid: unknown): { installed: Installed; server: Server; zone: 'ice' | 'content' } | undefined {
  for (const server of s.servers) {
    const ice = server.ice.find((c) => c.uid === uid);
    if (ice) return { installed: ice, server, zone: 'ice' };
    const content = server.content.find((c) => c.uid === uid);
    if (content) return { installed: content, server, zone: 'content' };
  }
  return undefined;
}

/**
 * Sprint 7: an installed Corp card's rez cost. ICE: printed cost minus every rezzed
 * `iceRezDiscount` among the cards of the server it protects (Akitaro Watanabe), never below 0.
 * Other cards: printed cost. The only price used by options, the rez window and `no_credits`.
 */
export function rezCost(s: GameState, card: Installed): number {
  const cost = getCard(card.cardId)?.cost ?? 0;
  const where = corpInstalled(s, card.uid);
  if (!where || where.zone !== 'ice') return cost;
  const discount = where.server.content.reduce((sum, c) => sum + (c.rezzed ? (getCard(c.cardId)?.iceRezDiscount ?? 0) : 0), 0);
  return Math.max(0, cost - discount);
}

/** Every unrezzed installed Corp ICE: servers in order, then ICE index order (innermost first). */
export function unrezzedIce(s: GameState): Installed[] {
  return s.servers.flatMap((sv) => sv.ice.filter((c) => !c.rezzed));
}

/** Sprint 7: the Corp's unrezzed asset/upgrade `uid` (rezzable in its action phase), or undefined. */
export function rezzableCard(s: GameState, uid: unknown): Installed | undefined {
  const where = corpInstalled(s, uid);
  if (!where || where.zone !== 'content' || where.installed.rezzed) return undefined;
  const type = getCard(where.installed.cardId)?.type;
  return type === 'asset' || type === 'upgrade' ? where.installed : undefined;
}

/**
 * `rez` is answered in the approach step, an open `free_rez` choice, or (Sprint 7) the Corp's action
 * phase. Sprint 8: any other choice (`trash_target`, `prevent_trash`) is `wrong_phase`.
 */
const rezPhase = (s: GameState): RejectReason | null => {
  if (s.phase === 'choice') return s.choice?.kind === 'free_rez' ? null : 'wrong_phase';
  if (s.phase === 'action') return null;
  return s.phase === 'run' && s.run?.step === 'approach' ? null : 'wrong_phase';
};

/**
 * `free_rez` choice: any unrezzed installed ICE. Run: the approached ICE, still unrezzed.
 * Action phase (Sprint 7): the Corp's unrezzed asset/upgrade (ICE: bad_target). An asset/upgrade
 * named during a run or a choice is `wrong_phase` (it can be rezzed, just not now).
 */
const rezTarget = (s: GameState, a: ActionOf<'rez'>): RejectReason | null => {
  if (s.phase === 'action') return a.player === 'corp' && rezzableCard(s, a.uid) ? null : 'bad_target';
  let ok: boolean;
  if (s.phase === 'choice') ok = unrezzedIce(s).some((c) => c.uid === a.uid);
  else {
    const ice = currentIce(s);
    ok = !!ice && ice.uid === a.uid && !ice.rezzed;
  }
  if (ok) return null;
  return rezzableCard(s, a.uid) ? 'wrong_phase' : 'bad_target';
};

/** The free-rez choice costs nothing; otherwise the card's `rezCost`. */
const canAffordRez = (s: GameState, a: ActionOf<'rez'>): RejectReason | null => {
  if (s.phase === 'choice') return null;
  const card = s.phase === 'action' ? (rezzableCard(s, a.uid) as Installed) : (currentIce(s) as Installed);
  return s.players.corp.credits >= rezCost(s, card) ? null : 'no_credits';
};

/** `rez`/`pass` also answer an open choice (Priority Requisition: rez one ICE for free, or Skip). */
const atStepOrChoice =
  (...steps: RunStep[]) =>
  (s: GameState): RejectReason | null =>
    s.phase === 'choice' && s.choice ? null : atStep(...steps)(s);

/**
 * Leave it / Done is refused while an agenda that must be stolen is shown. Sprint 8: `pass` in a
 * `trash_target` choice is refused too (the Corp must pick).
 */
const passAllowed = (s: GameState): RejectReason | null => {
  if (s.phase === 'choice') return s.choice?.kind === 'trash_target' ? 'bad_target' : null;
  return s.run?.step === 'access' && unstolenAgendaShown(s) ? 'bad_target' : null;
};

/**
 * Shape: uid string, integer ability, `sub` absent or an integer. Sprint 8: `subs` absent or an
 * array of integers, never together with `sub`, and only for a `count: 2` break ability of the
 * named card (when it is a breaker with that ability; otherwise the target check answers).
 */
const abilityShape = (s: GameState, a: ActionOf<'use_ability'>): RejectReason | null => {
  if (typeof a.uid !== 'string' || !isInt(a.ability) || !(a.sub === undefined || isInt(a.sub))) return 'invalid_action';
  const subs: unknown = a.subs;
  if (subs === undefined) return null;
  if (!Array.isArray(subs) || !subs.every(isInt) || a.sub !== undefined) return 'invalid_action';
  const ability = breakerCard(s, a.uid)?.card.abilities?.[a.ability];
  if (ability && !(ability.op === 'break' && ability.count === 2)) return 'invalid_action';
  return null;
};

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
    if (ability.iceType !== iceCard.subtype) return undefined;
    const count = (iceCard.subroutines ?? []).length;
    const ok = (i: number) => i >= 0 && i < count && !s.run?.broken.includes(i);
    if (ability.count === 2) {
      // Sprint 8: "break up to 2": 1–2 distinct unbroken subroutines, ascending.
      const subs = a.subs;
      if (a.sub !== undefined || !subs || subs.length < 1 || subs.length > 2) return undefined;
      if (!subs.every(ok) || (subs.length === 2 && !((subs[0] as number) < (subs[1] as number)))) return undefined;
    } else if (a.sub === undefined || !ok(a.sub)) {
      return undefined;
    }
  } else if (a.sub !== undefined || a.subs !== undefined) {
    return undefined;
  }
  return ability;
}

/** Sprint 8: the subroutine indices a (validated) break names: `subs`, or `[sub]`. */
export function breakSubs(a: ActionOf<'use_ability'>): number[] {
  return a.subs ? [...a.subs] : a.sub !== undefined ? [a.sub] : [];
}

const abilityTargetCheck = (s: GameState, a: ActionOf<'use_ability'>): RejectReason | null =>
  abilityTarget(s, a) ? null : 'bad_target';

/** The ICE's strength: printed + advancements × `strengthPerAdvancement` (Sprint 7: Ice Wall). */
export function iceStrength(ice: Installed): number {
  const card = getCard(ice.cardId);
  return (card?.strength ?? 0) + ice.advancements * (card?.strengthPerAdvancement ?? 0);
}

const strongEnough = (s: GameState, a: ActionOf<'use_ability'>): RejectReason | null => {
  if (abilityTarget(s, a)?.op !== 'break') return null;
  return breakerStrength(s, a.uid) >= iceStrength(currentIce(s) as Installed) ? null : 'too_weak';
};

/** What the Runner can spend now: its credits plus, during a run, the run-only credits (bad publicity). */
export function runnerSpendable(s: GameState): number {
  return s.players.runner.credits + (s.run?.tempCredits ?? 0);
}

/** Sprint 7: who pays `amount` for an icebreaker ability. `own` may exceed the Runner's credits (then unaffordable). */
export interface BreakerPayment {
  /** Recurring credits usable for icebreakers, rig order. */
  readonly hosted: readonly { readonly uid: string; readonly amount: number }[];
  /** Run-only credits (bad publicity). */
  readonly temp: number;
  /** The Runner's own credits. */
  readonly own: number;
}

/**
 * Sprint 7: an icebreaker ability is paid from recurring credits for icebreakers first (rig
 * order, Cyberfeeder), then run-only credits, then the Runner's own credits.
 */
export function breakerPayment(s: GameState, amount: number): BreakerPayment {
  let left = Math.max(0, amount);
  const hosted: { uid: string; amount: number }[] = [];
  for (const c of s.rig) {
    if (left === 0) break;
    if (getCard(c.cardId)?.recurringCredits?.for !== 'icebreaker' || c.hostedCredits <= 0) continue;
    const n = Math.min(left, c.hostedCredits);
    hosted.push({ uid: c.uid, amount: n });
    left -= n;
  }
  const temp = Math.min(left, s.run?.tempCredits ?? 0);
  return { hosted, temp, own: left - temp };
}

const canAffordAbility = (s: GameState, a: ActionOf<'use_ability'>): RejectReason | null =>
  breakerPayment(s, abilityTarget(s, a)?.cost ?? 0).own <= s.players.runner.credits ? null : 'no_credits';

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
  runnerSpendable(s) >= trashCost(accessCard(s, a.card) as AccessCard) ? null : 'no_credits';

/**
 * Credits an install costs before discounts. Corp ICE: 1 per ICE already on the server ('new' = 0);
 * other Corp installs: 0. Runner: the card's cost. Assumes card and target are valid.
 */
export function installBaseCost(s: GameState, a: ActionOf<'install'>): number {
  const card = handCard(s, a.player, a.handIndex);
  if (!card) return 0;
  if (a.player === 'runner') return card.cost;
  if (card.type !== 'ice' || a.server === 'new') return 0;
  return findServer(s, a.server)?.ice.length ?? 0;
}

/** Sprint 8: an active source of `side`: its identity, or one of its face-up installed cards. */
export interface ActiveSource {
  readonly uid: string;
  readonly cardId: string;
  readonly card: CardDef;
}

/**
 * Sprint 8: `side`'s active sources, in order: the identity, then face-up installed cards (Corp:
 * rezzed cards, servers order, ICE then content; Runner: rig order). A face-down Corp card never is one (P1).
 */
export function activeSources(s: GameState, side: Side): ActiveSource[] {
  const out: ActiveSource[] = [];
  const id = s.players[side].identity;
  const idCard = id !== null ? getCard(id) : undefined;
  if (id !== null && idCard) out.push({ uid: IDENTITY_UID[side], cardId: id, card: idCard });
  const installed = side === 'corp' ? s.servers.flatMap((sv) => [...sv.ice, ...sv.content]).filter((c) => c.rezzed) : s.rig;
  for (const c of installed) {
    const card = getCard(c.cardId);
    if (card) out.push({ uid: c.uid, cardId: c.cardId, card });
  }
  return out;
}

/** Sprint 8: "first … each turn" holds for `types` (absent = any type): `side` installed nothing of them this turn. */
export function firstInstallOf(s: GameState, side: Side, types: readonly CardType[] | undefined): boolean {
  const done = s.players[side].installedThisTurn;
  return types === undefined ? done.length === 0 : !done.some((t) => types.includes(t));
}

/** Sprint 8: the install discounts that apply to installing `card` for `side` now (sources in order, amounts > 0). */
export function installDiscounts(s: GameState, side: Side, card: CardDef): { source: ActiveSource; amount: number }[] {
  const out: { source: ActiveSource; amount: number }[] = [];
  for (const source of activeSources(s, side)) {
    const d = source.card.installDiscount;
    if (!d || d.amount <= 0 || !d.types.includes(card.type) || !firstInstallOf(s, side, d.types)) continue;
    out.push({ source, amount: d.amount });
  }
  return out;
}

/**
 * Credits an install costs: `installBaseCost` minus every applying install discount (Sprint 8:
 * Kate), never below 0. The only price used by options, `no_credits` and the payment.
 */
export function installCost(s: GameState, a: ActionOf<'install'>): number {
  const base = installBaseCost(s, a);
  const card = handCard(s, a.player, a.handIndex);
  if (!card) return base;
  const off = installDiscounts(s, a.player, card).reduce((sum, d) => sum + d.amount, 0);
  return Math.max(0, base - off);
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

/** Sprint 7: what `advance` may target: the Corp's installed agenda, or its `advanceable` ICE (face up or down). */
export function advanceTarget(s: GameState, uid: unknown): Installed | undefined {
  const agenda = installedAgenda(s, uid);
  if (agenda) return agenda;
  const where = corpInstalled(s, uid);
  return where?.zone === 'ice' && getCard(where.installed.cardId)?.advanceable ? where.installed : undefined;
}

/** Credits an advance costs. */
export const ADVANCE_COST = 1;

const ownAgenda = (s: GameState, a: ActionOf<'score'>): RejectReason | null =>
  a.player === 'corp' && installedAgenda(s, a.uid) ? null : 'bad_target';

const ownAdvanceable = (s: GameState, a: ActionOf<'advance'>): RejectReason | null =>
  a.player === 'corp' && advanceTarget(s, a.uid) ? null : 'bad_target';

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
  return memoryUsed(s) + (card.memory ?? 0) <= memoryLimit(s) ? null : 'no_memory';
};

/** Sprint 7: the Runner's memory limit: 4 + every rig card's `memoryBonus` (Akamatsu Mem Chip). */
export function memoryLimit(state: GameState): number {
  return state.rig.reduce((sum, c) => sum + (getCard(c.cardId)?.memoryBonus ?? 0), MEMORY_LIMIT);
}

const activateShape = (_s: GameState, a: ActionOf<'activate'>): RejectReason | null =>
  typeof a.uid === 'string' && isInt(a.ability) ? null : 'invalid_action';

/** Sprint 7: `player`'s own installed, face-up card `uid` (Runner: rig; Corp: rezzed), or undefined. */
export function ownFaceUpCard(s: GameState, player: Side, uid: unknown): Installed | undefined {
  if (player === 'runner') return s.rig.find((c) => c.uid === uid);
  const c = corpInstalled(s, uid)?.installed;
  return c?.rezzed ? c : undefined;
}

/** Sprint 7: the card and ability an `activate` names, when both exist (own face-up card). */
export function activateTarget(s: GameState, a: ActionOf<'activate'>): { installed: Installed; card: CardDef; ability: CardAbility } | undefined {
  const installed = ownFaceUpCard(s, a.player, a.uid);
  const card = installed && getCard(installed.cardId);
  const ability = card?.cardAbilities?.[a.ability];
  return installed && card && ability ? { installed, card, ability } : undefined;
}

const activateTargetCheck = (s: GameState, a: ActionOf<'activate'>): RejectReason | null => (activateTarget(s, a) ? null : 'bad_target');

/** `click`: the player's own action phase; `successful_run_remote`: run step `success`. */
const activatePhase = (s: GameState, a: ActionOf<'activate'>): RejectReason | null => {
  const when = activateTarget(s, a)!.ability.when;
  if (when === 'click') return s.phase === 'action' && s.activePlayer === a.player ? null : 'wrong_phase';
  return s.phase === 'run' && s.run?.step === 'success' ? null : 'wrong_phase';
};

const activateClicks = (s: GameState, a: ActionOf<'activate'>): RejectReason | null =>
  s.players[a.player].clicks >= activateTarget(s, a)!.ability.clicks ? null : 'no_clicks';

/** `requires: 'hosted_credits'`: only while the card holds credits. */
export function abilityUsable(installed: Installed, ability: CardAbility): boolean {
  return ability.requires !== 'hosted_credits' || installed.hostedCredits > 0;
}

const activateCondition = (s: GameState, a: ActionOf<'activate'>): RejectReason | null => {
  const t = activateTarget(s, a)!;
  return abilityUsable(t.installed, t.ability) ? null : 'condition_not_met';
};

const activateCredits = (s: GameState, a: ActionOf<'activate'>): RejectReason | null =>
  s.players[a.player].credits >= activateTarget(s, a)!.ability.credits ? null : 'no_credits';

/** Sprint 7: credits an ability's `take_credits` (Sprint 8: and `gain_credits`) effects give now (undefined: none). */
export function abilityGain(installed: Installed, ability: CardAbility): number | undefined {
  let gain: number | undefined;
  let left = installed.hostedCredits;
  for (const e of ability.effects) {
    if (e.op === 'gain_credits') {
      // Sprint 8: Melange Mining Corp., Magnum Opus ("Gain {gain} credits").
      gain = (gain ?? 0) + e.amount;
      continue;
    }
    if (e.op !== 'take_credits') continue;
    const n = e.amount === 'all' ? left : Math.min(e.amount, left);
    left -= n;
    gain = (gain ?? 0) + n;
  }
  return gain;
}

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
  rez: [playerShape, rezUidShape, notOver, decides, rezPhase, rezTarget, canAffordRez],
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
  advance: [playerShape, uidShape, notOver, yourTurn, inPhase('action'), hasClick, ownAdvanceable, canAffordAdvance],
  score: [playerShape, uidShape, notOver, yourTurn, inPhase('action'), ownAgenda, enoughCounters],
  activate: [playerShape, activateShape, notOver, decides, activateTargetCheck, activatePhase, activateClicks, activateCondition, activateCredits],
  choose: [playerShape, chooseShape, notOver, decides, choosePhase, chooseTarget],
};

/** Memory used by the Runner's installed programs (card data `memory`). */
export function memoryUsed(state: GameState): number {
  return state.rig.reduce((sum, c) => sum + (getCard(c.cardId)?.memory ?? 0), 0);
}

/** How many cards a hand of `handSize` must discard at end of turn (Sprint 8: down to `max`, never below 0 cards). */
export function discardCount(handSize: number, max: number = MAX_HAND_SIZE): number {
  return Math.max(0, handSize - Math.max(0, max));
}

// ---- Sprint 8: choices inside a run ---------------------------------------------------

/** The effect of the subroutine an in-run choice is resolving (`run.firing`), if any. */
export function firingEffect(s: GameState): Effect | undefined {
  const ice = currentIce(s);
  const firing = s.run?.firing;
  if (!ice || firing === null || firing === undefined) return undefined;
  return getCard(ice.cardId)?.subroutines?.[firing]?.effect;
}

/** Rig cards a `trash_installed` effect may trash (rig order). */
export function trashCandidates(s: GameState, effect: Effect | undefined): Installed[] {
  if (effect?.op !== 'trash_installed') return [];
  const types: readonly CardType[] = effect.types;
  return s.rig.filter((c) => {
    const t = getCard(c.cardId)?.type;
    return t !== undefined && types.includes(t);
  });
}

/** Rig cards that may be trashed instead of rig card `target` (`trashPrevention` covers its type; not itself), rig order. */
export function trashPreventers(s: GameState, target: string): Installed[] {
  const t = getCard(s.rig.find((c) => c.uid === target)?.cardId ?? '')?.type;
  if (t === undefined) return [];
  return s.rig.filter((c) => c.uid !== target && (getCard(c.cardId)?.trashPrevention?.types ?? []).includes(t));
}

/** The uids `choose` may name in the open choice (trash_target: candidates; prevent_trash: preventers). */
export function chooseTargets(s: GameState): string[] {
  const c = s.choice;
  if (s.phase !== 'choice' || !c) return [];
  if (c.kind === 'trash_target') return trashCandidates(s, firingEffect(s)).map((x) => x.uid);
  if (c.kind === 'prevent_trash' && c.target !== undefined) return trashPreventers(s, c.target).map((x) => x.uid);
  return [];
}

function chooseShape(_s: GameState, a: ActionOf<'choose'>): RejectReason | null {
  return typeof a.uid === 'string' ? null : 'invalid_action';
}

function choosePhase(s: GameState): RejectReason | null {
  return s.phase === 'choice' && (s.choice?.kind === 'trash_target' || s.choice?.kind === 'prevent_trash') ? null : 'wrong_phase';
}

function chooseTarget(s: GameState, a: ActionOf<'choose'>): RejectReason | null {
  return chooseTargets(s).includes(a.uid) ? null : 'bad_target';
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
