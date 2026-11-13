/**
 * Runs (RULES_SPEC § Runs): the step-by-step walk through a server's ICE, the
 * encounter (breakers, subroutines), access, and the card effects runs need
 * (damage, click loss, end the run, start a run). Every function takes the
 * state and an `events` list to append to, and returns the new state; nothing
 * is mutated. The engine auto-passes steps nobody can decide (see README).
 */
import { getCard, type Effect } from '@overclock/cards';
import type { ActionOf } from './actions';
import type { GameEvent, RunOutcome, SubOutcome } from './events';
import { nextInt } from './rng';
import {
  abilityTarget,
  accessCard,
  breakerCard,
  breakerStrength,
  currentIce,
  findServer,
  rezCost,
  trashCost,
  unrezzedIce,
} from './rules';
import {
  CENTRAL_SERVERS,
  WINNING_POINTS,
  drawTop,
  endGame,
  pointsOf,
  withPlayer,
  type AccessCard,
  type AccessFrom,
  type AccessNext,
  type AccessState,
  type ChoiceState,
  type GameState,
  type Installed,
  type RunState,
  type ServerId,
  type Side,
} from './state';

type Events = GameEvent[];

function setRun(s: GameState, patch: Partial<RunState>): GameState {
  return { ...s, run: { ...(s.run as RunState), ...patch } };
}

function theRun(s: GameState): RunState {
  return s.run as RunState;
}

/** Every installed breaker's current strength, for emitting changes. */
function strengths(s: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of s.rig) if (breakerCard(s, c.uid)) out[c.uid] = breakerStrength(s, c.uid);
  return out;
}

/** Applies `patch` to the run and emits `strength_changed` for every breaker whose strength moved. */
function changeBoosts(s: GameState, patch: Partial<RunState>, events: Events): GameState {
  const before = strengths(s);
  const next = setRun(s, patch);
  const after = strengths(next);
  for (const uid of Object.keys(after)) {
    if (after[uid] !== before[uid]) events.push({ type: 'strength_changed', uid, strength: after[uid] as number });
  }
  return next;
}

// ---- start / end ----------------------------------------------------------------

export interface RunOptions {
  readonly cardId?: string;
  readonly extraAccess?: number;
  readonly bypassFirst?: boolean;
}

/** Starts a run on `server` (the caller has paid the click / played the event). */
export function startRun(state: GameState, server: ServerId, opts: RunOptions, events: Events): GameState {
  const iceCount = findServer(state, server)?.ice.length ?? 0;
  const run: RunState = {
    server,
    ...(opts.cardId !== undefined ? { cardId: opts.cardId } : {}),
    position: iceCount - 1,
    step: 'approach',
    broken: [],
    encounterBoost: {},
    runBoost: {},
    bypassNext: opts.bypassFirst ?? false,
    extraAccess: opts.extraAccess ?? 0,
    access: null,
    // Bad publicity: 1 run-only credit each.
    tempCredits: state.badPublicity,
  };
  // Sprint 5: the Last run record starts afresh (replacing the previous one).
  const s: GameState = { ...state, phase: 'run', lastRunTurn: state.turn, run, lastRun: { server, cards: [] } };
  events.push(opts.cardId !== undefined ? { type: 'run_started', server, cardId: opts.cardId } : { type: 'run_started', server });
  if (run.tempCredits > 0) events.push({ type: 'temp_credits_gained', amount: run.tempCredits });
  // No ICE: straight in (no Continue stop before the first ICE).
  return iceCount === 0 ? succeed(s, events) : approach(s, events);
}

/**
 * Ends the run: boosts drop back, unspent run-only credits vanish, `run_ended`,
 * back to the action phase (the Runner keeps its clicks).
 */
export function endRun(state: GameState, outcome: RunOutcome, events: Events): GameState {
  const run = theRun(state);
  const s = changeBoosts(state, { encounterBoost: {}, runBoost: {} }, events);
  if (run.tempCredits > 0) events.push({ type: 'temp_credits_lost', amount: run.tempCredits });
  events.push({ type: 'run_ended', server: run.server, outcome });
  return { ...s, phase: 'action', run: null };
}

// ---- the walk ---------------------------------------------------------------------

/**
 * Approach the ICE at the current position: rezzed → encounter; Corp can pay (or, Sprint 6,
 * `options.rezWindow === 'always'`) → ask; else passed face down.
 */
function approach(state: GameState, events: Events): GameState {
  const run = theRun(state);
  const ice = currentIce(state) as Installed;
  events.push({ type: 'ice_approached', uid: ice.uid, position: run.position });
  const s = setRun(state, { step: 'approach', broken: [] });
  if (ice.rezzed) return encounter(s, events);
  if (s.options.rezWindow === 'always' || s.players.corp.credits >= rezCost(ice)) return s;
  return passIce(s, events);
}

/** Encounter the (rezzed) current ICE. Inside Job's bypass, or nothing left to break, passes it at once. */
function encounter(state: GameState, events: Events): GameState {
  const ice = currentIce(state) as Installed;
  events.push({ type: 'ice_encountered', uid: ice.uid });
  let s = setRun(state, { step: 'encounter', broken: [] });
  if (theRun(s).bypassNext) {
    s = setRun(s, { bypassNext: false });
    events.push({ type: 'ice_bypassed', uid: ice.uid });
    return passIce(s, events);
  }
  if ((getCard(ice.cardId)?.subroutines ?? []).length === 0) return passIce(s, events);
  return s;
}

/** The current ICE is passed: encounter boosts drop, then the Runner's Continue / Jack out stop. */
function passIce(state: GameState, events: Events): GameState {
  const ice = currentIce(state) as Installed;
  const s = changeBoosts(state, { encounterBoost: {} }, events);
  events.push({ type: 'ice_passed', uid: ice.uid });
  return setRun(s, { step: 'continue' });
}

/** Continue: the next ICE inward, or into the server. */
function continueRun(state: GameState, events: Events): GameState {
  const run = theRun(state);
  if (run.position > 0) return approach(setRun(state, { position: run.position - 1 }), events);
  return succeed(state, events);
}

/**
 * The actual size of what `effect` will do from `state` (a fired subroutine's `SubOutcome.amount`):
 * clicks really lost ("if able"), net damage (printed), credits gained, cards drawn; 0 for `end_run`.
 */
function outcomeAmount(state: GameState, effect: Effect, owner: Side): number {
  switch (effect.op) {
    case 'lose_clicks':
      return Math.min(effect.amount, state.players.runner.clicks);
    case 'draw':
      return Math.min(effect.count, state.players[owner].deck.length);
    case 'net_damage':
    case 'gain_credits':
    case 'bad_publicity':
      return effect.amount;
    default:
      return 0;
  }
}

/**
 * Let it through: every unbroken subroutine fires in order until one ends the run (or the game).
 * Each fired subroutine: `subroutine_fired`, its effect's own events, `subroutine_resolved`, then
 * whatever ends the run / game (Sprint 5).
 */
function letThrough(state: GameState, events: Events): GameState {
  const ice = currentIce(state) as Installed;
  const subs = getCard(ice.cardId)?.subroutines ?? [];
  let s = state;
  for (let i = 0; i < subs.length; i++) {
    if (theRun(s).broken.includes(i)) continue;
    const effect = (subs[i] as { effect: Effect }).effect;
    const outcome: SubOutcome = { sub: i, op: effect.op, amount: outcomeAmount(s, effect, 'corp') };
    let reported = false;
    const report = () => {
      if (reported) return;
      reported = true;
      events.push({ type: 'subroutine_resolved', iceUid: ice.uid, cardId: ice.cardId, outcome });
    };
    events.push({ type: 'subroutine_fired', iceUid: ice.uid, sub: i });
    s = resolveEffect(s, effect, 'corp', events, { beforeEnd: report });
    report();
    if (s.phase !== 'run') return s; // the run (or the game) ended
  }
  return passIce(s, events);
}

// ---- access -----------------------------------------------------------------------

const fromOf = (server: ServerId): AccessFrom =>
  (CENTRAL_SERVERS as readonly string[]).includes(server) ? (server as AccessFrom) : 'remote';

/** The run is successful: build the access queue and show the first group. */
function succeed(state: GameState, events: Events): GameState {
  const run = theRun(state);
  events.push({ type: 'run_successful', server: run.server });
  const server = findServer(state, run.server);
  const installed: AccessNext[] = (server?.content ?? []).map((c) => ({ kind: 'installed', uid: c.uid }));
  let queue: AccessNext[];
  if (run.server === 'hq') queue = [{ kind: 'hq' }, ...installed];
  else if (run.server === 'rd') queue = [...Array.from({ length: 1 + run.extraAccess }, () => ({ kind: 'rd' }) as const), ...installed];
  else if (run.server === 'archives') queue = [{ kind: 'archives' }, ...installed];
  else queue = installed;
  const s = setRun(state, { position: -1, step: 'access', access: { cards: [], queue, rdSkip: 0 } });
  return nextAccess(s, events);
}

/** Shows the next non-empty access group, or ends the run when nothing is left. */
function nextAccess(state: GameState, events: Events): GameState {
  let s = state;
  const run = theRun(s);
  const access = run.access as AccessState;
  const queue = [...access.queue];
  while (queue.length > 0) {
    const next = queue.shift() as AccessNext;
    const corp = s.players.corp;
    let cards: AccessCard[] = [];
    if (next.kind === 'hq') {
      if (corp.hand.length > 0) {
        const pick = nextInt(s.rng, corp.hand.length);
        s = { ...s, rng: pick.rng };
        cards = [{ cardId: corp.hand[pick.value] as string, from: 'hq', handIndex: pick.value, stolen: false, trashed: false }];
      }
    } else if (next.kind === 'rd') {
      const cardId = corp.deck[access.rdSkip];
      if (cardId !== undefined) cards = [{ cardId, from: 'rd', deckIndex: access.rdSkip, stolen: false, trashed: false }];
    } else if (next.kind === 'archives') {
      // Every card in Archives, all at once; face-down ones turn face up for good.
      s = withPlayer(s, 'corp', { discard: corp.discard.map((d) => ({ cardId: d.cardId, faceUp: true })) });
      cards = corp.discard.map((d, i) => ({ cardId: d.cardId, from: 'archives', archivesIndex: i, stolen: false, trashed: false }));
    } else {
      const c = findServer(s, run.server)?.content.find((x) => x.uid === next.uid);
      if (c) cards = [{ cardId: c.cardId, from: fromOf(run.server), uid: c.uid, stolen: false, trashed: false }];
    }
    if (cards.length > 0) {
      const last = s.lastRun ?? { server: run.server, cards: [] };
      s = { ...s, lastRun: { ...last, cards: [...last.cards, ...cards.map((c) => ({ cardId: c.cardId, from: c.from }))] } };
      for (const c of cards) {
        events.push(c.uid !== undefined ? { type: 'card_accessed', cardId: c.cardId, from: c.from, uid: c.uid } : { type: 'card_accessed', cardId: c.cardId, from: c.from });
      }
      return setRun(s, { access: { ...access, cards, queue } });
    }
  }
  return endRun(setRun(s, { access: { ...access, cards: [], queue: [] } }), 'accessed', events);
}

/** The current group is done (Leave it / Done, or every card taken): R&D cards left in place are skipped next time. */
function finishGroup(state: GameState, events: Events): GameState {
  const access = theRun(state).access as AccessState;
  const leftInRd = access.cards.filter((c) => c.from === 'rd' && c.deckIndex !== undefined && !c.stolen && !c.trashed).length;
  return nextAccess(setRun(state, { access: { ...access, rdSkip: access.rdSkip + leftInRd } }), events);
}

/** Removes access card `index` from its zone (hand / deck / Archives / server) and fixes the group's other locators. */
function removeFromZone(state: GameState, index: number): GameState {
  const access = theRun(state).access as AccessState;
  const card = access.cards[index] as AccessCard;
  const corp = state.players.corp;
  let s = state;
  const shift = (i: number | undefined, removed: number | undefined) =>
    i !== undefined && removed !== undefined && i > removed ? i - 1 : i;
  if (card.handIndex !== undefined) s = withPlayer(s, 'corp', { hand: corp.hand.filter((_, i) => i !== card.handIndex) });
  else if (card.deckIndex !== undefined) s = withPlayer(s, 'corp', { deck: corp.deck.filter((_, i) => i !== card.deckIndex) });
  else if (card.archivesIndex !== undefined) s = withPlayer(s, 'corp', { discard: corp.discard.filter((_, i) => i !== card.archivesIndex) });
  else if (card.uid !== undefined) {
    s = { ...s, servers: s.servers.map((sv) => ({ ...sv, content: sv.content.filter((c) => c.uid !== card.uid) })) };
  }
  const cards = access.cards.map((c, i) => {
    if (i === index) return c;
    const moved: AccessCard = { ...c };
    const fix = (k: 'handIndex' | 'deckIndex' | 'archivesIndex') => {
      const v = shift(c[k], card[k]);
      return v === undefined ? {} : { [k]: v };
    };
    return { ...moved, ...fix('handIndex'), ...fix('deckIndex'), ...fix('archivesIndex') };
  });
  return setRun(s, { access: { ...access, cards } });
}

function markTaken(state: GameState, index: number, patch: Partial<AccessCard>): GameState {
  const access = theRun(state).access as AccessState;
  return setRun(state, { access: { ...access, cards: access.cards.map((c, i) => (i === index ? { ...c, ...patch } : c)) } });
}

const groupDone = (s: GameState) => (theRun(s).access as AccessState).cards.every((c) => c.stolen || c.trashed);

// ---- effects ----------------------------------------------------------------------

/** Net damage to the Runner: random cards from the Grip to the Heap; more than the Grip holds flatlines it. */
function netDamage(state: GameState, amount: number, events: Events, ctx: EffectContext): GameState {
  const runner = state.players.runner;
  if (amount > runner.hand.length) {
    let s = withPlayer(state, 'runner', {
      hand: [],
      discard: [...runner.discard, ...runner.hand.map((cardId) => ({ cardId, faceUp: true }))],
    });
    events.push({ type: 'net_damage', amount, cardIds: runner.hand.slice() });
    ctx.beforeEnd?.();
    if (s.phase === 'run') s = endRun(s, 'flatline', events);
    return endGame(s, 'corp', 'flatline', events);
  }
  let hand = runner.hand.slice();
  let rng = state.rng;
  const cardIds: string[] = [];
  for (let k = 0; k < amount; k++) {
    const pick = nextInt(rng, hand.length);
    rng = pick.rng;
    cardIds.push(hand[pick.value] as string);
    hand = hand.filter((_, i) => i !== pick.value);
  }
  events.push({ type: 'net_damage', amount, cardIds });
  return withPlayer({ ...state, rng }, 'runner', {
    hand,
    discard: [...runner.discard, ...cardIds.map((cardId) => ({ cardId, faceUp: true }))],
  });
}

export interface EffectContext {
  /** The card whose effect this is (run events: `run_started.cardId`). */
  readonly cardId?: string;
  /** The server named in the `play` action (run events with no fixed server). */
  readonly server?: ServerId;
  /**
   * Called once the effect's own events are out, right before it ends the run or the game
   * (ICE: `subroutine_resolved` goes before `run_ended` / `game_over`).
   */
  readonly beforeEnd?: () => void;
}

/** Resolves one DSL effect for `owner` (damage and click loss always hit the Runner). */
export function resolveEffect(state: GameState, effect: Effect, owner: Side, events: Events, ctx: EffectContext): GameState {
  switch (effect.op) {
    case 'gain_credits':
      events.push({ type: 'credit_gained', player: owner, amount: effect.amount });
      return withPlayer(state, owner, { credits: state.players[owner].credits + effect.amount });
    case 'draw': {
      // Effect draws stop at an empty deck; only the Corp's mandatory draw can lose.
      let s = state;
      for (let k = 0; k < effect.count && s.players[owner].deck.length > 0; k++) {
        const drawn = drawTop(s, owner);
        s = drawn.state;
        events.push({ type: 'card_drawn', player: owner, cardId: drawn.cardId });
      }
      return s;
    }
    case 'net_damage':
      return netDamage(state, effect.amount, events, ctx);
    case 'lose_clicks': {
      const lost = Math.min(effect.amount, state.players.runner.clicks);
      if (lost === 0) return state;
      events.push({ type: 'clicks_lost', player: 'runner', amount: lost });
      return withPlayer(state, 'runner', { clicks: state.players.runner.clicks - lost });
    }
    case 'end_run':
      if (state.phase !== 'run') return state;
      ctx.beforeEnd?.();
      return endRun(state, 'ended_by_ice', events);
    case 'run': {
      const server = effect.server ?? (ctx.server as ServerId);
      const opts: RunOptions = {
        ...(ctx.cardId !== undefined ? { cardId: ctx.cardId } : {}),
        ...(effect.extraAccess !== undefined ? { extraAccess: effect.extraAccess } : {}),
        ...(effect.bypassFirst !== undefined ? { bypassFirst: effect.bypassFirst } : {}),
      };
      return startRun(state, server, opts, events);
    }
    case 'bad_publicity': {
      // Always the Corp's counter, whoever's card it is.
      const total = state.badPublicity + effect.amount;
      events.push({ type: 'bad_publicity_gained', amount: effect.amount, total });
      return { ...state, badPublicity: total };
    }
    case 'free_rez': {
      // No unrezzed installed ICE: nothing to choose, no window (auto-pass, no event).
      if (unrezzedIce(state).length === 0) return state;
      const cardId = ctx.cardId as string;
      events.push({ type: 'choice_opened', kind: 'free_rez', player: owner, cardId });
      return { ...state, phase: 'choice', choice: { kind: 'free_rez', player: owner, cardId } };
    }
  }
}

// ---- actions (already validated by rules.ts) ----------------------------------------

/**
 * The Runner pays `amount` during the run: run-only credits first, then its own
 * credits (`credits_spent.temp` = the run-only part). Caller checked affordability.
 */
function payRunner(state: GameState, amount: number, events: Events): GameState {
  if (amount <= 0) return state;
  const run = theRun(state);
  const temp = Math.min(amount, run.tempCredits);
  events.push(temp > 0 ? { type: 'credits_spent', player: 'runner', amount, temp } : { type: 'credits_spent', player: 'runner', amount });
  const s = withPlayer(state, 'runner', { credits: state.players.runner.credits - (amount - temp) });
  return setRun(s, { tempCredits: run.tempCredits - temp });
}

export function doRun(state: GameState, a: ActionOf<'run'>): { state: GameState; events: GameEvent[] } {
  const events: Events = [];
  const s = withPlayer(state, a.player, { clicks: state.players[a.player].clicks - 1 });
  return { state: startRun(s, a.server, {}, events), events };
}

/** Rezzes installed Corp ICE `uid` (no payment). */
function setRezzed(state: GameState, uid: string): GameState {
  const fix = (list: readonly Installed[]) => list.map((c) => (c.uid === uid ? { ...c, rezzed: true } : c));
  return { ...state, servers: state.servers.map((sv) => ({ ...sv, ice: fix(sv.ice) })) };
}

/** Closes the open choice: back to the action phase (the Corp's turn goes on). */
function closeChoice(state: GameState, skipped: boolean, events: Events): GameState {
  const choice = state.choice as ChoiceState;
  events.push({ type: 'choice_closed', kind: choice.kind, skipped });
  return { ...state, phase: 'action', choice: null };
}

export function doRez(state: GameState, a: ActionOf<'rez'>): { state: GameState; events: GameEvent[] } {
  const events: Events = [];
  if (state.phase === 'choice') {
    // Priority Requisition: any unrezzed installed ICE, ignoring all costs.
    const ice = unrezzedIce(state).find((c) => c.uid === a.uid) as Installed;
    const s = setRezzed(state, a.uid);
    events.push({ type: 'ice_rezzed', uid: ice.uid, cardId: ice.cardId });
    return { state: closeChoice(s, false, events), events };
  }
  const ice = currentIce(state) as Installed;
  const cost = rezCost(ice);
  if (cost > 0) events.push({ type: 'credits_spent', player: 'corp', amount: cost });
  const s = setRezzed(withPlayer(state, 'corp', { credits: state.players.corp.credits - cost }), a.uid);
  events.push({ type: 'ice_rezzed', uid: ice.uid, cardId: ice.cardId });
  return { state: encounter(s, events), events };
}

export function doPass(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: Events = [];
  if (state.phase === 'choice') return { state: closeChoice(state, true, events), events }; // Skip
  const step = theRun(state).step;
  let s: GameState;
  if (step === 'approach') s = passIce(state, events); // Don't rez: passed face down
  else if (step === 'encounter') s = letThrough(state, events);
  else if (step === 'continue') s = continueRun(state, events);
  else s = finishGroup(state, events); // Leave it / Done
  return { state: s, events };
}

export function doJackOut(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: Events = [];
  return { state: endRun(state, 'jacked_out', events), events };
}

export function doUseAbility(state: GameState, a: ActionOf<'use_ability'>): { state: GameState; events: GameEvent[] } {
  const events: Events = [];
  const ability = abilityTarget(state, a);
  if (!ability) return { state, events }; // unreachable: validated
  let s = payRunner(state, ability.cost, events);
  const run = theRun(s);
  if (ability.op === 'strength') {
    const key = ability.until === 'run' ? 'runBoost' : 'encounterBoost';
    const boosts = { ...run[key], [a.uid]: (run[key][a.uid] ?? 0) + ability.amount };
    s = changeBoosts(s, { [key]: boosts }, events);
    return { state: s, events };
  }
  const ice = currentIce(s) as Installed;
  const sub = a.sub as number;
  s = setRun(s, { broken: [...run.broken, sub].sort((x, y) => x - y) });
  events.push({ type: 'subroutine_broken', iceUid: ice.uid, sub, breakerUid: a.uid });
  const subs = getCard(ice.cardId)?.subroutines ?? [];
  if (theRun(s).broken.length >= subs.length) s = passIce(s, events);
  return { state: s, events };
}

export function doSteal(state: GameState, a: ActionOf<'steal'>): { state: GameState; events: GameEvent[] } {
  const events: Events = [];
  const card = accessCard(state, a.card) as AccessCard;
  const points = getCard(card.cardId)?.agendaPoints ?? 0;
  let s = removeFromZone(state, a.card);
  s = markTaken(s, a.card, { stolen: true });
  s = withPlayer(s, 'runner', { scoreArea: [...s.players.runner.scoreArea, card.cardId] });
  events.push({ type: 'agenda_stolen', cardId: card.cardId, points });
  // 7 points: the run ends (accessed) and the Runner wins at once.
  if (pointsOf(s.players.runner.scoreArea) >= WINNING_POINTS) {
    return { state: endGame(endRun(s, 'accessed', events), 'runner', 'agenda_points', events), events };
  }
  return { state: groupDone(s) ? finishGroup(s, events) : s, events };
}

export function doTrash(state: GameState, a: ActionOf<'trash'>): { state: GameState; events: GameEvent[] } {
  const events: Events = [];
  const card = accessCard(state, a.card) as AccessCard;
  let s = payRunner(state, trashCost(card), events);
  s = removeFromZone(s, a.card);
  s = markTaken(s, a.card, { trashed: true });
  // Trashed cards go face up to Archives.
  s = withPlayer(s, 'corp', { discard: [...s.players.corp.discard, { cardId: card.cardId, faceUp: true }] });
  events.push(card.uid !== undefined ? { type: 'card_trashed', cardId: card.cardId, from: card.from, uid: card.uid } : { type: 'card_trashed', cardId: card.cardId, from: card.from });
  return { state: groupDone(s) ? finishGroup(s, events) : s, events };
}
