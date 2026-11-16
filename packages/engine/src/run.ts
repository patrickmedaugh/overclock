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
  abilityUsable,
  accessCard,
  activateTarget,
  breakerPayment,
  breakerCard,
  breakerStrength,
  BASIC_ACTION_COST,
  breakSubs,
  corpInstalled,
  currentIce,
  findServer,
  rezCost,
  traceMaxBid,
  trashCandidates,
  trashCost,
  trashPreventers,
  unrezzedIce,
} from './rules';
import {
  CENTRAL_SERVERS,
  WINNING_POINTS,
  drawTop,
  endGame,
  maxHandSize,
  pointsOf,
  runnerLink,
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
  type TraceState,
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
    firing: null,
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
 * back to the action phase (the Runner keeps its clicks). Sprint 7: then empty remotes go.
 */
export function endRun(state: GameState, outcome: RunOutcome, events: Events): GameState {
  const run = theRun(state);
  const s = changeBoosts(state, { encounterBoost: {}, runBoost: {} }, events);
  if (run.tempCredits > 0) events.push({ type: 'temp_credits_lost', amount: run.tempCredits });
  events.push({ type: 'run_ended', server: run.server, outcome });
  return pruneEmptyRemotes({ ...s, phase: 'action', run: null }, events);
}

/**
 * Sprint 7 (S-07-1): removes every remote with no ICE and no cards (`server_removed`, servers
 * order). Ids are never reused: `nextRemote` is unchanged. Centrals always stay.
 */
export function pruneEmptyRemotes(state: GameState, events: Events): GameState {
  const empty = state.servers.filter(
    (sv) => !(CENTRAL_SERVERS as readonly string[]).includes(sv.id) && sv.ice.length === 0 && sv.content.length === 0,
  );
  if (empty.length === 0) return state;
  for (const sv of empty) events.push({ type: 'server_removed', server: sv.id });
  return { ...state, servers: state.servers.filter((sv) => !empty.includes(sv)) };
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
  if (s.options.rezWindow === 'always' || s.players.corp.credits >= rezCost(s, ice)) return s;
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
    case 'brain_damage':
    case 'gain_credits':
    case 'bad_publicity':
    case 'gain_clicks':
    case 'give_tags':
    case 'meat_damage':
      return effect.amount;
    case 'trash_installed':
      // Only used when no choice opens: 0 candidates → 0, one unprotected candidate → 1.
      return trashCandidates(state, effect).length > 0 ? 1 : 0;
    default:
      return 0;
  }
}

/**
 * Let it through: every unbroken subroutine from `from` on fires in order until one ends the run
 * (or the game). Each fired subroutine: `subroutine_fired`, its effect's own events,
 * `subroutine_resolved`, then whatever ends the run / game (Sprint 5). Sprint 8: a subroutine
 * whose effect opens a choice (`trash_target` / `prevent_trash`) stops here with `run.firing` set;
 * `finishFiring` reports it and goes on with the next one when the choice closes.
 */
function letThrough(state: GameState, events: Events, from = 0): GameState {
  const ice = currentIce(state) as Installed;
  const subs = getCard(ice.cardId)?.subroutines ?? [];
  let s = state;
  for (let i = from; i < subs.length; i++) {
    if (theRun(s).broken.includes(i)) continue;
    const effect = (subs[i] as { effect: Effect }).effect;
    const outcome: SubOutcome = { sub: i, op: effect.op, amount: outcomeAmount(s, effect, 'corp') };
    const start = events.length;
    let reported = false;
    const report = () => {
      if (reported) return;
      reported = true;
      // Sprint 9: a trace's amount is known only once it resolved (1 = success, 0 = failed).
      const amount = effect.op === 'trace' ? traceAmount(events.slice(start)) : outcome.amount;
      events.push({ type: 'subroutine_resolved', iceUid: ice.uid, cardId: ice.cardId, outcome: { ...outcome, amount } });
    };
    events.push({ type: 'subroutine_fired', iceUid: ice.uid, sub: i });
    s = resolveEffect(setRun(s, { firing: i }), effect, 'corp', events, { cardId: ice.cardId, beforeEnd: report });
    if (s.phase === 'choice') return s; // Sprint 8: waits on a choice; reported when it closes
    if (s.run) s = setRun(s, { firing: null });
    report();
    if (s.phase !== 'run') return s; // the run (or the game) ended
  }
  return passIce(s, events);
}

/**
 * Sprint 8: the subroutine an in-run choice was resolving (`run.firing`) is done: `subroutine_resolved`
 * (`amount` = cards trashed, 0 when saved), then the remaining subroutines fire.
 */
function finishFiring(state: GameState, amount: number, events: Events): GameState {
  const run = theRun(state);
  const ice = currentIce(state) as Installed;
  const sub = run.firing as number;
  const op = getCard(ice.cardId)?.subroutines?.[sub]?.effect.op ?? 'trash_installed';
  events.push({ type: 'subroutine_resolved', iceUid: ice.uid, cardId: ice.cardId, outcome: { sub, op, amount } });
  return letThrough(setRun(state, { firing: null }), events, sub + 1);
}

/**
 * Sprint 8: rig card `target` is about to be trashed by the Corp's effect (opened by `cardId`). With a
 * preventer in the rig (Sacrificial Construct) the Runner is asked first (`prevent_trash`);
 * otherwise it goes to the Heap. Returns whether it was trashed now.
 */
function trashOrAsk(state: GameState, target: string, cardId: string, events: Events): { state: GameState; trashed: boolean } {
  if (trashPreventers(state, target).length > 0) {
    events.push({ type: 'choice_opened', kind: 'prevent_trash', player: 'runner', cardId, target });
    const resume = state.run ? 'run' : 'action';
    return { state: { ...state, phase: 'choice', choice: { kind: 'prevent_trash', player: 'runner', cardId, target, resume } }, trashed: false };
  }
  return { state: trashRigCard(state, target, events), trashed: true };
}

// ---- access -----------------------------------------------------------------------

const fromOf = (server: ServerId): AccessFrom =>
  (CENTRAL_SERVERS as readonly string[]).includes(server) ? (server as AccessFrom) : 'remote';

/**
 * Sprint 7: the Runner's usable `replacesAccess` abilities after a successful run on a remote
 * (Bank Job holding credits): rig order, then ability order.
 */
export function accessReplacements(state: GameState): { uid: string; ability: number }[] {
  const out: { uid: string; ability: number }[] = [];
  for (const c of state.rig) {
    (getCard(c.cardId)?.cardAbilities ?? []).forEach((ab, ability) => {
      if (ab.when === 'successful_run_remote' && ab.replacesAccess && abilityUsable(c, ab)) out.push({ uid: c.uid, ability });
    });
  }
  return out;
}

/**
 * The run is successful. Sprint 7: on a remote with a usable `replacesAccess` ability the run
 * stops at step `success` (the Runner picks it or Access cards); otherwise access starts.
 */
function succeed(state: GameState, events: Events): GameState {
  const run = theRun(state);
  events.push({ type: 'run_successful', server: run.server });
  if (fromOf(run.server) === 'remote' && accessReplacements(state).length > 0) {
    return setRun(state, { position: -1, step: 'success' });
  }
  return beginAccess(state, events);
}

/** Build the access queue and show the first group. */
function beginAccess(state: GameState, events: Events): GameState {
  const run = theRun(state);
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

/**
 * Net damage (Sprint 8: and brain damage) to the Runner: random cards from the Grip to the Heap;
 * more than the Grip holds flatlines it. Brain damage first lowers the maximum hand size by `amount`
 * for good (`brain_damage.maxHandSize` = the new maximum).
 */
function damage(state: GameState, kind: 'net' | 'brain', amount: number, events: Events, ctx: EffectContext): GameState {
  const base = kind === 'brain' ? withPlayer(state, 'runner', { brainDamage: state.players.runner.brainDamage + amount }) : state;
  const runner = base.players.runner;
  const report = (cardIds: string[]) =>
    events.push(kind === 'brain' ? { type: 'brain_damage', amount, cardIds, maxHandSize: maxHandSize(base, 'runner') } : { type: 'net_damage', amount, cardIds });
  if (amount > runner.hand.length) {
    let s = withPlayer(base, 'runner', {
      hand: [],
      discard: [...runner.discard, ...runner.hand.map((cardId) => ({ cardId, faceUp: true }))],
    });
    report(runner.hand.slice());
    ctx.beforeEnd?.();
    if (s.phase === 'run') s = endRun(s, 'flatline', events);
    return endGame(s, 'corp', 'flatline', events);
  }
  let hand = runner.hand.slice();
  let rng = base.rng;
  const cardIds: string[] = [];
  for (let k = 0; k < amount; k++) {
    const pick = nextInt(rng, hand.length);
    rng = pick.rng;
    cardIds.push(hand[pick.value] as string);
    hand = hand.filter((_, i) => i !== pick.value);
  }
  report(cardIds);
  return withPlayer({ ...base, rng }, 'runner', {
    hand,
    discard: [...runner.discard, ...cardIds.map((cardId) => ({ cardId, faceUp: true }))],
  });
}

export interface EffectContext {
  /** The card whose effect this is (run events: `run_started.cardId`). */
  readonly cardId?: string;
  /** Sprint 7: the installed card whose effect this is (`place_credits` / `take_credits` source). */
  readonly uid?: string;
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
      return damage(state, 'net', effect.amount, events, ctx);
    case 'brain_damage':
      return damage(state, 'brain', effect.amount, events, ctx);
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
      return { ...state, phase: 'choice', choice: { kind: 'free_rez', player: owner, cardId, resume: 'action' } };
    }
    case 'place_credits': {
      const card = ctx.uid !== undefined ? installedCard(state, ctx.uid) : undefined;
      if (!card) return state;
      return setHosted(state, card.uid, card.hostedCredits + effect.amount, events);
    }
    case 'take_credits': {
      const card = ctx.uid !== undefined ? installedCard(state, ctx.uid) : undefined;
      if (!card) return state;
      const n = effect.amount === 'all' ? card.hostedCredits : Math.min(effect.amount, card.hostedCredits);
      if (n <= 0) return state;
      const s = setHosted(state, card.uid, card.hostedCredits - n, events);
      events.push({ type: 'credit_gained', player: owner, amount: n });
      return withPlayer(s, owner, { credits: s.players[owner].credits + n });
    }
    case 'gain_clicks': {
      // Sprint 8: Biotic Labor.
      events.push({ type: 'clicks_gained', player: owner, amount: effect.amount });
      return withPlayer(state, owner, { clicks: state.players[owner].clicks + effect.amount });
    }
    case 'trash_installed': {
      // Sprint 8 (Rototurret): 0 candidates = nothing; 1 = that card (no window); 2+ = the Corp picks.
      const candidates = trashCandidates(state, effect);
      const cardId = ctx.cardId as string;
      if (candidates.length === 0) return state;
      if (candidates.length === 1) return trashOrAsk(state, (candidates[0] as Installed).uid, cardId, events).state;
      events.push({ type: 'choice_opened', kind: 'trash_target', player: 'corp', cardId });
      return { ...state, phase: 'choice', choice: { kind: 'trash_target', player: 'corp', cardId, resume: state.run ? 'run' : 'action' } };
    }
    case 'trace':
      return startTrace(state, effect.base, effect.onSuccess, ctx, events);
    case 'give_tags':
      return giveTags(state, effect.amount, events);
    // Sprint 9 (E1 stub): meat_damage (E5).
    case 'meat_damage':
      return state;
  }
}

// ---- Sprint 9: traces and tags --------------------------------------------------------

/** Sprint 9: `subroutine_resolved.amount` of a trace subroutine: 1 if its `trace_resolved` succeeded, else 0. */
function traceAmount(events: readonly GameEvent[]): number {
  const r = events.find((e) => e.type === 'trace_resolved');
  return r?.type === 'trace_resolved' && r.success ? 1 : 0;
}

/** Sprint 9: the Runner takes `amount` tags (`tags_changed`). */
function giveTags(state: GameState, amount: number, events: Events): GameState {
  if (amount <= 0) return state;
  const tags = state.players.runner.tags + amount;
  events.push({ type: 'tags_changed', amount, tags });
  return withPlayer(state, 'runner', { tags });
}

/** Sprint 9: where a trace goes on when it is done: the run it fired in (ICE subroutine), or the action phase. */
const traceResume = (s: GameState): 'run' | 'action' => (s.run ? 'run' : 'action');

/**
 * Sprint 9: a trace begins (`trace_started`). The Corp is asked to bid (`trace_corp`) only when its bid
 * can matter: it has credits and base + all of them would beat the Runner's link; otherwise it bids 0
 * at once (`trace_bid{auto}`) and the Runner's side follows.
 */
function startTrace(state: GameState, base: number, onSuccess: TraceState['onSuccess'], ctx: EffectContext, events: Events): GameState {
  const cardId = ctx.cardId as string;
  const link = runnerLink(state);
  events.push({ type: 'trace_started', cardId, base, link });
  const credits = state.players.corp.credits;
  const trace: TraceState = { base, strength: null, corpBid: null, onSuccess };
  if (credits > 0 && base + credits > link) {
    events.push({ type: 'choice_opened', kind: 'trace_corp', player: 'corp', cardId });
    return { ...state, phase: 'choice', choice: { kind: 'trace_corp', player: 'corp', cardId, resume: traceResume(state), trace } };
  }
  events.push({ type: 'trace_bid', player: 'corp', credits: 0, total: base, auto: true });
  return runnerTraceStep(state, cardId, { ...trace, strength: base, corpBid: 0 }, ctx, events);
}

/**
 * Sprint 9: the Corp's strength is known. The Runner is asked (`trace_runner`) only when his bid can
 * matter: 0 < strength − link ≤ his max bid; otherwise he bids 0 at once and the trace resolves.
 */
function runnerTraceStep(state: GameState, cardId: string, trace: TraceState, ctx: EffectContext, events: Events): GameState {
  const strength = trace.strength as number;
  const link = runnerLink(state);
  const needed = strength - link;
  if (needed > 0 && needed <= traceMaxBid(state, 'runner')) {
    events.push({ type: 'choice_opened', kind: 'trace_runner', player: 'runner', cardId });
    return { ...state, phase: 'choice', choice: { kind: 'trace_runner', player: 'runner', cardId, resume: traceResume(state), trace } };
  }
  events.push({ type: 'trace_bid', player: 'runner', credits: 0, total: link, auto: true });
  return resolveTrace(state, cardId, trace, 0, ctx, events);
}

/**
 * Sprint 9: both bids are in: `trace_resolved` (success iff strength > link + Runner bid), then on
 * success the `onSuccess` effects in order (stopping if the game ends). `ctx.beforeEnd` reports an
 * ICE subroutine before a flatline ends the run / game.
 */
function resolveTrace(state: GameState, cardId: string, trace: TraceState, runnerBid: number, ctx: EffectContext, events: Events): GameState {
  const strength = trace.strength as number;
  const total = runnerLink(state) + runnerBid;
  const success = strength > total;
  events.push({ type: 'trace_resolved', cardId, strength, total, success });
  let s = state;
  if (!success) return s;
  for (const effect of trace.onSuccess) {
    s = resolveEffect(s, effect, 'corp', events, { cardId, ...(ctx.beforeEnd ? { beforeEnd: ctx.beforeEnd } : {}) });
    if (s.phase === 'over') break;
  }
  return s;
}

/**
 * Sprint 9: answers an open trace choice (validated): `choice_closed`, the bid is paid (`credits_spent`;
 * the Runner pays run-only credits first), `trace_bid`, then the Runner's window / the resolution. A
 * trace subroutine is then reported (`subroutine_resolved{op: 'trace', amount: 1 | 0}`, before any
 * `run_ended` / `game_over`) and the ICE's remaining subroutines fire.
 */
export function doTraceBid(state: GameState, a: ActionOf<'trace_bid'>): { state: GameState; events: GameEvent[] } {
  const events: Events = [];
  const choice = state.choice as ChoiceState;
  const trace = choice.trace as TraceState;
  let s = closeChoice(state, false, events);
  if (a.player === 'corp') {
    if (a.credits > 0) {
      events.push({ type: 'credits_spent', player: 'corp', amount: a.credits });
      s = withPlayer(s, 'corp', { credits: s.players.corp.credits - a.credits });
    }
  } else if (s.run) {
    s = payRunner(s, a.credits, events);
  } else if (a.credits > 0) {
    events.push({ type: 'credits_spent', player: 'runner', amount: a.credits });
    s = withPlayer(s, 'runner', { credits: s.players.runner.credits - a.credits });
  }
  // In a run: report the trace subroutine once (before a flatline ends the run / game, or after the trace).
  const firing = s.run?.firing ?? null;
  const ice = currentIce(s);
  const start = events.length;
  let reported = firing === null;
  const report = () => {
    if (reported || !ice) return;
    reported = true;
    events.push({ type: 'subroutine_resolved', iceUid: ice.uid, cardId: ice.cardId, outcome: { sub: firing as number, op: 'trace', amount: traceAmount(events.slice(start)) } });
  };
  const ctx: EffectContext = { cardId: choice.cardId, beforeEnd: report };
  if (a.player === 'corp') {
    const strength = trace.base + a.credits;
    events.push({ type: 'trace_bid', player: 'corp', credits: a.credits, total: strength });
    s = runnerTraceStep(s, choice.cardId, { ...trace, strength, corpBid: a.credits }, ctx, events);
  } else {
    events.push({ type: 'trace_bid', player: 'runner', credits: a.credits, total: runnerLink(s) + a.credits });
    s = resolveTrace(s, choice.cardId, trace, a.credits, ctx, events);
  }
  if (s.phase !== 'run' || firing === null) return { state: s, events }; // waits on the Runner's bid, game over, or SEA Source done
  report();
  return { state: letThrough(setRun(s, { firing: null }), events, firing + 1), events };
}

/** Sprint 9: Runner basic action (validated): 1 click + 2 credits, remove 1 tag (`credits_spent`, `tags_changed{-1}`). */
export function doRemoveTag(state: GameState): { state: GameState; events: GameEvent[] } {
  const me = state.players.runner;
  const tags = me.tags - 1;
  const events: Events = [
    { type: 'credits_spent', player: 'runner', amount: BASIC_ACTION_COST },
    { type: 'tags_changed', amount: -1, tags },
  ];
  return { state: withPlayer(state, 'runner', { clicks: me.clicks - 1, credits: me.credits - BASIC_ACTION_COST, tags }), events };
}

/**
 * Sprint 9: Corp basic action (validated): 1 click + 2 credits, trash the tagged Runner's resource `uid`
 * (`credits_spent`, `rig_card_trashed{cause: 'tagged'}`; face up to the Heap).
 */
export function doTrashResource(state: GameState, a: ActionOf<'trash_resource'>): { state: GameState; events: GameEvent[] } {
  const me = state.players.corp;
  const events: Events = [{ type: 'credits_spent', player: 'corp', amount: BASIC_ACTION_COST }];
  const s = withPlayer(state, 'corp', { clicks: me.clicks - 1, credits: me.credits - BASIC_ACTION_COST });
  return { state: trashRigCard(s, a.uid, events, 'tagged'), events };
}

// ---- Sprint 7: turn start -----------------------------------------------------------

/** Replaces installed card `uid` (rig, or any server's ICE / content) with `patch` applied. */
export function patchCard(state: GameState, uid: string, patch: Partial<Installed>): GameState {
  const fix = (list: readonly Installed[]) => list.map((c) => (c.uid === uid ? { ...c, ...patch } : c));
  return { ...state, rig: fix(state.rig), servers: state.servers.map((sv) => ({ ...sv, ice: fix(sv.ice), content: fix(sv.content) })) };
}

/**
 * "When your turn begins" for `side`, after `turn_started` and before the Corp's draw: each rezzed
 * Corp card (servers order, ICE then content) / Runner card (rig order) with `onTurnStart`:
 * `ability_triggered` then its effects; Runner recurring credits below their amount are refilled
 * (`ability_triggered`, `hosted_credits_changed`). Nothing happens for cards without these.
 */
export function turnStartAbilities(state: GameState, events: Events): GameState {
  const side = state.activePlayer;
  const cards = side === 'corp' ? state.servers.flatMap((sv) => [...sv.ice, ...sv.content]).filter((c) => c.rezzed) : state.rig;
  let s = state;
  for (const c of cards) {
    const def = getCard(c.cardId);
    if (!def) continue;
    if (def.onTurnStart && def.onTurnStart.length > 0) {
      events.push({ type: 'ability_triggered', uid: c.uid, cardId: c.cardId, trigger: 'turn_start' });
      for (const effect of def.onTurnStart) {
        s = resolveEffect(s, effect, side, events, { cardId: c.cardId, uid: c.uid });
        if (s.phase === 'over') return s;
      }
      // Sprint 8: Adonis Campaign emptied → Archives (then an empty remote goes, below).
      s = trashIfEmpty(s, c.uid, events);
    }
    const recurring = def.recurringCredits;
    const now = installedCard(s, c.uid);
    if (recurring && now && now.hostedCredits < recurring.amount) {
      events.push({ type: 'ability_triggered', uid: c.uid, cardId: c.cardId, trigger: 'turn_start' });
      s = setHosted(s, c.uid, recurring.amount, events);
    }
  }
  return s.phase === 'run' ? s : pruneEmptyRemotes(s, events);
}

/**
 * A `trashWhenEmpty` card with no credits left is trashed: a rig card goes face up to the Heap
 * (`rig_card_trashed`); Sprint 8: a face-up Corp card goes face up to Archives (`corp_card_trashed`;
 * the caller prunes an emptied remote).
 */
export function trashIfEmpty(state: GameState, uid: string, events: Events): GameState {
  const card = installedCard(state, uid);
  if (!card || card.hostedCredits > 0 || !getCard(card.cardId)?.trashWhenEmpty) return state;
  if (state.rig.some((c) => c.uid === uid)) return trashRigCard(state, uid, events);
  const where = corpInstalled(state, uid);
  if (!where || !card.rezzed) return state;
  events.push({ type: 'corp_card_trashed', uid, cardId: card.cardId, server: where.server.id });
  const s: GameState = {
    ...state,
    servers: state.servers.map((sv) => ({ ...sv, ice: sv.ice.filter((c) => c.uid !== uid), content: sv.content.filter((c) => c.uid !== uid) })),
  };
  return withPlayer(s, 'corp', { discard: [...s.players.corp.discard, { cardId: card.cardId, faceUp: true }] });
}

/**
 * Moves rig card `uid` face up to the Heap (`rig_card_trashed`); Sprint 8: its breaker boosts are dropped.
 * Sprint 9: `cause: 'tagged'` = the Corp's `trash_resource` basic action.
 */
export function trashRigCard(state: GameState, uid: string, events: Events, cause?: 'tagged'): GameState {
  const card = state.rig.find((c) => c.uid === uid);
  if (!card) return state;
  events.push(cause ? { type: 'rig_card_trashed', uid, cardId: card.cardId, cause } : { type: 'rig_card_trashed', uid, cardId: card.cardId });
  let s: GameState = { ...state, rig: state.rig.filter((c) => c.uid !== uid) };
  if (s.run && (uid in s.run.encounterBoost || uid in s.run.runBoost)) {
    const { [uid]: _e, ...encounterBoost } = s.run.encounterBoost;
    const { [uid]: _r, ...runBoost } = s.run.runBoost;
    s = setRun(s, { encounterBoost, runBoost });
  }
  return withPlayer(s, 'runner', { discard: [...s.players.runner.discard, { cardId: card.cardId, faceUp: true }] });
}

/** Sprint 7: what happens right after a card is installed: `onInstall` effects, then recurring credits placed. */
export function afterInstall(state: GameState, uid: string, owner: Side, events: Events): GameState {
  const card = installedCard(state, uid);
  const def = card && getCard(card.cardId);
  if (!card || !def) return state;
  let s = state;
  for (const effect of def.onInstall ?? []) s = resolveEffect(s, effect, owner, events, { cardId: card.cardId, uid });
  if (def.recurringCredits) s = setHosted(s, uid, def.recurringCredits.amount, events);
  return s;
}

/** Installed card `uid` (rig or servers), or undefined. */
export function installedCard(state: GameState, uid: string): Installed | undefined {
  return state.rig.find((c) => c.uid === uid) ?? corpInstalled(state, uid)?.installed;
}

/** Sets the hosted credits of `uid` and reports the new total. */
export function setHosted(state: GameState, uid: string, credits: number, events: Events): GameState {
  events.push({ type: 'hosted_credits_changed', uid, credits });
  return patchCard(state, uid, { hostedCredits: credits });
}

// ---- actions (already validated by rules.ts) ----------------------------------------

/**
 * The Runner pays `amount` during the run: run-only credits first, then its own
 * credits (`credits_spent.temp` = the run-only part). Caller checked affordability.
 * Sprint 7: `breaker` payments use recurring credits for icebreakers before both
 * (`credits_spent.hosted`, then `hosted_credits_changed` per paying card).
 */
function payRunner(state: GameState, amount: number, events: Events, breaker = false): GameState {
  if (amount <= 0) return state;
  const run = theRun(state);
  const plan = breaker ? breakerPayment(state, amount) : { hosted: [], temp: Math.min(amount, run.tempCredits), own: 0 };
  const hosted = plan.hosted.reduce((sum, h) => sum + h.amount, 0);
  const temp = plan.temp;
  events.push({
    type: 'credits_spent',
    player: 'runner',
    amount,
    ...(temp > 0 ? { temp } : {}),
    ...(hosted > 0 ? { hosted } : {}),
  });
  let s = withPlayer(state, 'runner', { credits: state.players.runner.credits - (amount - temp - hosted) });
  for (const h of plan.hosted) s = setHosted(s, h.uid, (installedCard(s, h.uid)?.hostedCredits ?? 0) - h.amount, events);
  return setRun(s, { tempCredits: run.tempCredits - temp });
}

export function doRun(state: GameState, a: ActionOf<'run'>): { state: GameState; events: GameEvent[] } {
  const events: Events = [];
  const s = withPlayer(state, a.player, { clicks: state.players[a.player].clicks - 1 });
  return { state: startRun(s, a.server, {}, events), events };
}

/** Rezzes installed Corp card `uid` (ICE or content; no payment). */
function setRezzed(state: GameState, uid: string): GameState {
  const fix = (list: readonly Installed[]) => list.map((c) => (c.uid === uid ? { ...c, rezzed: true } : c));
  return { ...state, servers: state.servers.map((sv) => ({ ...sv, ice: fix(sv.ice), content: fix(sv.content) })) };
}

/** Closes the open choice: back to the action phase (the Corp's turn goes on), or (Sprint 8) to the run it opened in. */
function closeChoice(state: GameState, skipped: boolean, events: Events): GameState {
  const choice = state.choice as ChoiceState;
  events.push({ type: 'choice_closed', kind: choice.kind, skipped });
  return { ...state, phase: choice.resume === 'run' ? 'run' : 'action', choice: null };
}

/** Sprint 8: after an in-run choice settled the trash: report the subroutine and fire the rest (outside a run: nothing more). */
function afterTrashChoice(state: GameState, trashed: boolean, events: Events): GameState {
  if (state.phase === 'choice') return state; // another choice opened (prevent_trash)
  return state.run && state.run.firing !== null ? finishFiring(state, trashed ? 1 : 0, events) : state;
}

/**
 * Sprint 8: answers an open `trash_target` (Corp names the card) or `prevent_trash` (Runner names the
 * preventer to trash instead) choice (validated). Events: `choice_closed`, then (`choice_opened`
 * prevent_trash) or `rig_card_trashed` [+ `trash_prevented`], `subroutine_resolved`, the next subs.
 */
export function doChoose(state: GameState, a: ActionOf<'choose'>): { state: GameState; events: GameEvent[] } {
  const events: Events = [];
  const choice = state.choice as ChoiceState;
  let s = closeChoice(state, false, events);
  if (choice.kind === 'trash_target') {
    const r = trashOrAsk(s, a.uid, choice.cardId, events);
    return { state: afterTrashChoice(r.state, r.trashed, events), events };
  }
  const target = s.rig.find((c) => c.uid === choice.target) as Installed;
  const by = s.rig.find((c) => c.uid === a.uid) as Installed;
  s = trashRigCard(s, by.uid, events);
  events.push({ type: 'trash_prevented', uid: target.uid, cardId: target.cardId, byUid: by.uid, byCardId: by.cardId });
  return { state: afterTrashChoice(s, false, events), events };
}

/** Sprint 8: `pass` in `prevent_trash` = let it be trashed. */
function letItBeTrashed(state: GameState, events: Events): GameState {
  const target = (state.choice as ChoiceState).target as string;
  const s = trashRigCard(closeChoice(state, true, events), target, events);
  return afterTrashChoice(s, true, events);
}

export function doRez(state: GameState, a: ActionOf<'rez'>): { state: GameState; events: GameEvent[] } {
  const events: Events = [];
  if (state.phase === 'choice') {
    // Priority Requisition: any unrezzed installed ICE, ignoring all costs.
    const ice = unrezzedIce(state).find((c) => c.uid === a.uid) as Installed;
    let s = setRezzed(state, a.uid);
    events.push({ type: 'ice_rezzed', uid: ice.uid, cardId: ice.cardId });
    s = afterRez(s, a.uid, events);
    return { state: closeChoice(s, false, events), events };
  }
  if (state.phase === 'action') {
    // Sprint 7: an asset/upgrade on the Corp's own turn (no click).
    const where = corpInstalled(state, a.uid)!;
    const cost = rezCost(state, where.installed);
    if (cost > 0) events.push({ type: 'credits_spent', player: 'corp', amount: cost });
    const s = setRezzed(withPlayer(state, 'corp', { credits: state.players.corp.credits - cost }), a.uid);
    events.push({ type: 'card_rezzed', uid: a.uid, cardId: where.installed.cardId, server: where.server.id });
    return { state: afterRez(s, a.uid, events), events };
  }
  const ice = currentIce(state) as Installed;
  const cost = rezCost(state, ice);
  if (cost > 0) events.push({ type: 'credits_spent', player: 'corp', amount: cost });
  let s = setRezzed(withPlayer(state, 'corp', { credits: state.players.corp.credits - cost }), a.uid);
  events.push({ type: 'ice_rezzed', uid: ice.uid, cardId: ice.cardId });
  s = afterRez(s, a.uid, events);
  return { state: s.phase === 'run' ? encounter(s, events) : s, events };
}

/** Sprint 8: a Corp card just turned face up: its `onRez` effects (`ability_triggered{rez}` first), source = the card. */
function afterRez(state: GameState, uid: string, events: Events): GameState {
  const card = installedCard(state, uid);
  const effects = card ? (getCard(card.cardId)?.onRez ?? []) : [];
  if (!card || effects.length === 0) return state;
  events.push({ type: 'ability_triggered', uid, cardId: card.cardId, trigger: 'rez' });
  let s = state;
  for (const effect of effects) {
    s = resolveEffect(s, effect, 'corp', events, { cardId: card.cardId, uid });
    if (s.phase === 'over') return s;
  }
  return s;
}

export function doPass(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: Events = [];
  if (state.phase === 'choice') {
    if (state.choice?.kind === 'prevent_trash') return { state: letItBeTrashed(state, events), events };
    return { state: closeChoice(state, true, events), events }; // Skip
  }
  const step = theRun(state).step;
  let s: GameState;
  if (step === 'approach') s = passIce(state, events); // Don't rez: passed face down
  else if (step === 'encounter') s = letThrough(state, events);
  else if (step === 'continue') s = continueRun(state, events);
  else if (step === 'success') s = beginAccess(state, events); // Sprint 7: Access cards
  else s = finishGroup(state, events); // Leave it / Done
  return { state: s, events };
}

/**
 * Sprint 7: uses a card ability (validated): pays clicks/credits, `ability_triggered`, its effects,
 * an emptied `trashWhenEmpty` card goes to the Heap, and a `replacesAccess` ability ends the run
 * (`access_replaced`).
 */
export function doActivate(state: GameState, a: ActionOf<'activate'>): { state: GameState; events: GameEvent[] } {
  const events: Events = [];
  const t = activateTarget(state, a);
  if (!t) return { state, events }; // unreachable: validated
  const { installed, ability } = t;
  const me = state.players[a.player];
  let s = withPlayer(state, a.player, { clicks: me.clicks - ability.clicks, credits: me.credits - ability.credits });
  if (ability.credits > 0) events.push({ type: 'credits_spent', player: a.player, amount: ability.credits });
  events.push({ type: 'ability_triggered', uid: installed.uid, cardId: installed.cardId, trigger: ability.when === 'click' ? 'click' : 'successful_run' });
  for (const effect of ability.effects) {
    s = resolveEffect(s, effect, a.player, events, { cardId: installed.cardId, uid: installed.uid });
    if (s.phase === 'over') return { state: s, events };
  }
  s = trashIfEmpty(s, installed.uid, events);
  if (ability.replacesAccess && s.phase === 'run') s = endRun(s, 'access_replaced', events);
  else if (s.phase === 'action') s = pruneEmptyRemotes(s, events); // Sprint 8: a Corp card emptied by its ability
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
  let s = payRunner(state, ability.cost, events, true);
  const run = theRun(s);
  if (ability.op === 'strength') {
    const key = ability.until === 'run' ? 'runBoost' : 'encounterBoost';
    const boosts = { ...run[key], [a.uid]: (run[key][a.uid] ?? 0) + ability.amount };
    s = changeBoosts(s, { [key]: boosts }, events);
    return { state: s, events };
  }
  const ice = currentIce(s) as Installed;
  // Sprint 8: a "break up to 2" ability names its subroutines in `subs` (one payment, one event each).
  const subs = breakSubs(a);
  s = setRun(s, { broken: [...run.broken, ...subs].sort((x, y) => x - y) });
  for (const sub of subs) events.push({ type: 'subroutine_broken', iceUid: ice.uid, sub, breakerUid: a.uid });
  const all = getCard(ice.cardId)?.subroutines ?? [];
  if (theRun(s).broken.length >= all.length) s = passIce(s, events);
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
