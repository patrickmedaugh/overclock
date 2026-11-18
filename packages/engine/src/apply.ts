import type { Action, ActionOf } from './actions';
import type { GameEvent } from './events';
import type { CardOption } from './view';
import { getCard, type CardAbility, type CardDef, type CardType } from '@overclock/cards';
import {
  abilityGain,
  hasChosenAmount,
  activeSources,
  ADVANCE_COST,
  BASIC_ACTION_COST,
  advanceTarget,
  breakerPayment,
  breakerCard,
  breakerIceType,
  chooseTargets,
  currentIce,
  discardCount,
  handCard,
  installedAgenda,
  firstInstallOf,
  installBaseCost,
  installCardCheck,
  installCost,
  installDiscounts,
  installTargetCheck,
  openRunEffect,
  ownScoredCard,
  playCost,
  rejectionFor,
  rezCost,
  trashCost,
  traceMaxBid,
  unrezzedIce,
  unstolenAgendaShown,
  waitingOn,
} from './rules';
import {
  accessReplacements,
  afterInstall,
  doActivate,
  doChoose,
  doJackOut,
  doPass,
  doRez,
  doRun,
  doRemoveTag,
  doSteal,
  doTraceBid,
  doTrash,
  doTrashResource,
  doUseAbility,
  pruneEmptyRemotes,
  resolveEffect,
  turnStartAbilities,
} from './run';
import {
  checkPointsWin,
  drawTop,
  endGame,
  maxHandSize,
  opponentOf,
  scoredUid,
  startTurn,
  withPlayer,
  type GameState,
  type Installed,
  type Server,
  type ServerId,
  type Side,
} from './state';

export interface ApplyResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/** Ends the active player's turn and starts the opponent's. */
function passTurn(state: GameState, events: GameEvent[]): ApplyResult {
  const ending = state.activePlayer;
  events.push({ type: 'turn_ended', player: ending });
  // Sprint 5: Last run goes away when the Runner's turn ends.
  const ended = ending === 'runner' ? { ...state, lastRun: null } : state;
  // Sprint 7: "when your turn begins" abilities happen before the Corp's draw.
  const started = startTurn(ended, opponentOf(ending), state.turn + 1, turnStartAbilities);
  events.push(...started.events);
  return { state: started.state, events };
}

function doDraw(state: GameState, a: ActionOf<'draw'>): ApplyResult {
  const drawn = drawTop(state, a.player);
  const s = withPlayer(drawn.state, a.player, { clicks: state.players[a.player].clicks - 1 });
  return { state: s, events: [{ type: 'card_drawn', player: a.player, cardId: drawn.cardId }] };
}

function doGainCredit(state: GameState, a: ActionOf<'gain_credit'>): ApplyResult {
  const me = state.players[a.player];
  const s = withPlayer(state, a.player, { credits: me.credits + 1, clicks: me.clicks - 1 });
  return { state: s, events: [{ type: 'credit_gained', player: a.player, amount: 1 }] };
}

function doEndTurn(state: GameState, a: ActionOf<'end_turn'>): ApplyResult {
  // Leftover clicks are lost (house rule: ending early is allowed).
  const s = withPlayer(state, a.player, { clicks: 0 });
  // Sprint 8: a Runner whose maximum hand size is below 0 is flatlined at the end of his turn (real rule).
  if (a.player === 'runner' && maxHandSize(s, 'runner') < 0) {
    const events: GameEvent[] = [];
    return { state: endGame(s, 'corp', 'flatline', events), events };
  }
  const count = discardCount(s.players[a.player].hand.length, maxHandSize(s, a.player));
  if (count > 0) {
    return { state: { ...s, phase: 'discard' }, events: [{ type: 'discard_required', player: a.player, count }] };
  }
  return passTurn(s, []);
}

function doDiscard(state: GameState, a: ActionOf<'discard'>): ApplyResult {
  const me = state.players[a.player];
  const handIndices = [...a.handIndices].sort((x, y) => x - y);
  const chosen = new Set(handIndices);
  const cardIds = handIndices.map((i) => me.hand[i] as string);
  const s = withPlayer(state, a.player, {
    hand: me.hand.filter((_, i) => !chosen.has(i)),
    // Runner discards go face up to the Heap; Corp hand-limit discards go face down to Archives.
    discard: [...me.discard, ...cardIds.map((cardId) => ({ cardId, faceUp: a.player === 'runner' }))],
  });
  const events: GameEvent[] = [
    { type: 'cards_discarded', player: a.player, count: cardIds.length, handIndices, cardIds },
  ];
  return passTurn(s, events);
}

/** Removes hand card `handIndex`, spends 1 click and `cost` credits. */
function payFromHand(state: GameState, player: Side, handIndex: number, cost: number, events: GameEvent[]): GameState {
  const me = state.players[player];
  if (cost > 0) events.push({ type: 'credits_spent', player, amount: cost });
  return withPlayer(state, player, {
    hand: me.hand.filter((_, i) => i !== handIndex),
    clicks: me.clicks - 1,
    credits: me.credits - cost,
  });
}

/**
 * Sprint 8: what happens after an install (after `afterInstall`): the card's type is recorded in
 * `installedThisTurn`, then every active source's `whenYouInstall` (Haas-Bioroid) whose "first
 * time each turn" held before this install: `ability_triggered{install}` and its effects.
 */
function installTriggers(before: GameState, after: GameState, player: Side, installedUid: string, cardType: CardType, events: GameEvent[]): GameState {
  const fired = activeSources(after, player).filter(
    (src) => src.uid !== installedUid && src.card.whenYouInstall && firstInstallOf(before, player, src.card.whenYouInstall.types) && (src.card.whenYouInstall.types ?? [cardType]).includes(cardType),
  );
  let s = withPlayer(after, player, { installedThisTurn: [...after.players[player].installedThisTurn, cardType] });
  for (const src of fired) {
    events.push({ type: 'ability_triggered', uid: src.uid, cardId: src.cardId, trigger: 'install' });
    for (const effect of src.card.whenYouInstall?.effects ?? []) {
      s = resolveEffect(s, effect, player, events, { cardId: src.cardId, uid: src.uid });
      if (s.phase === 'over') return s;
    }
  }
  return s;
}

function doInstall(state: GameState, a: ActionOf<'install'>): ApplyResult {
  const cardId = state.players[a.player].hand[a.handIndex] as string;
  const def = getCard(cardId) as CardDef;
  const events: GameEvent[] = [];
  const cost = installCost(state, a);
  // Sprint 8: an install discount (Kate) is reported only when it lowered the price.
  if (cost < installBaseCost(state, a)) {
    for (const d of installDiscounts(state, a.player, def)) events.push({ type: 'ability_triggered', uid: d.source.uid, cardId: d.source.cardId, trigger: 'install_discount' });
  }
  let s = payFromHand(state, a.player, a.handIndex, cost, events);
  const card: Installed = { uid: `i${s.nextUid}`, cardId, rezzed: false, advancements: 0, hostedCredits: 0 };
  s = { ...s, nextUid: s.nextUid + 1 };

  if (a.player === 'runner') {
    s = { ...s, rig: [...s.rig, card] };
    events.push({ type: 'card_installed', player: a.player, uid: card.uid, zone: 'rig', handIndex: a.handIndex, cardId });
    s = afterInstall(s, card.uid, a.player, events);
    return { state: installTriggers(state, s, a.player, card.uid, def.type, events), events };
  }

  let serverId = a.server as ServerId | 'new';
  if (serverId === 'new') {
    serverId = `remote${s.nextRemote}`;
    const created: Server = { id: serverId, ice: [], content: [] };
    s = { ...s, servers: [...s.servers, created], nextRemote: s.nextRemote + 1 };
    events.push({ type: 'server_created', server: serverId });
  }
  const zone = getCard(cardId)?.type === 'ice' ? 'ice' : 'content';
  const target = serverId;
  s = {
    ...s,
    servers: s.servers.map((sv) => (sv.id === target ? { ...sv, [zone]: [...sv[zone], card] } : sv)),
  };
  events.push({ type: 'card_installed', player: a.player, uid: card.uid, zone, server: target, handIndex: a.handIndex, cardId });
  s = afterInstall(s, card.uid, a.player, events);
  return { state: installTriggers(state, s, a.player, card.uid, def.type, events), events };
}

function doPlay(state: GameState, a: ActionOf<'play'>): ApplyResult {
  const card = handCard(state, a.player, a.handIndex);
  const cardId = state.players[a.player].hand[a.handIndex] as string;
  const events: GameEvent[] = [];
  let s = payFromHand(state, a.player, a.handIndex, playCost(state, a), events);
  // The played card goes face up on top of its owner's discard pile, then resolves.
  const me = s.players[a.player];
  s = withPlayer(s, a.player, { discard: [...me.discard, { cardId, faceUp: true }] });
  events.push({ type: 'card_played', player: a.player, cardId, handIndex: a.handIndex });

  const ctx = a.server !== undefined ? { cardId, server: a.server } : { cardId };
  for (const effect of card?.onPlay ?? []) {
    s = resolveEffect(s, effect, a.player, events, ctx);
    if (s.phase === 'over') break;
  }
  return { state: s, events };
}

/** Replaces installed Corp card `uid` (in any server's ice or content) with `patch` applied. */
function patchInstalled(state: GameState, uid: string, patch: Partial<Installed>): GameState {
  const fix = (list: readonly Installed[]) => list.map((c) => (c.uid === uid ? { ...c, ...patch } : c));
  return { ...state, servers: state.servers.map((sv) => ({ ...sv, ice: fix(sv.ice), content: fix(sv.content) })) };
}

function doAdvance(state: GameState, a: ActionOf<'advance'>): ApplyResult {
  const me = state.players[a.player];
  const card = advanceTarget(state, a.uid) as Installed;
  const advancements = card.advancements + 1;
  let s = withPlayer(state, a.player, { clicks: me.clicks - 1, credits: me.credits - ADVANCE_COST });
  s = patchInstalled(s, a.uid, { advancements });
  return {
    state: s,
    events: [
      { type: 'credits_spent', player: a.player, amount: ADVANCE_COST },
      { type: 'card_advanced', uid: a.uid, advancements },
    ],
  };
}

function doScore(state: GameState, a: ActionOf<'score'>): ApplyResult {
  const card = installedAgenda(state, a.uid) as Installed;
  const points = getCard(card.cardId)?.agendaPoints ?? 0;
  const events: GameEvent[] = [{ type: 'agenda_scored', uid: a.uid, cardId: card.cardId, points }];
  let s: GameState = {
    ...state,
    servers: state.servers.map((sv) => ({ ...sv, content: sv.content.filter((c) => c.uid !== a.uid) })),
  };
  s = withPlayer(s, a.player, { scoreArea: [...s.players[a.player].scoreArea, card.cardId] });
  // A score that wins ends the game first: the "when scored" bonus is skipped.
  s = checkPointsWin(s, a.player, events);
  for (const effect of getCard(card.cardId)?.onScore ?? []) {
    if (s.phase !== 'action') break; // game over, or a choice opened (free_rez is last)
    s = resolveEffect(s, effect, a.player, events, { cardId: card.cardId });
  }
  // Sprint 7 (S-07-1): a remote left empty by the score goes (not after a winning score: the game is over).
  return { state: s.phase === 'over' ? s : pruneEmptyRemotes(s, events), events };
}

/**
 * Applies one action. Pure: never mutates `state`, never throws for illegal or
 * malformed actions (returns the same state plus an `action_rejected` event).
 */
export function apply(state: GameState, action: Action): ApplyResult {
  const reason = rejectionFor(state, action);
  if (reason) return { state, events: [{ type: 'action_rejected', reason }] };

  switch (action.type) {
    case 'draw':
      return doDraw(state, action);
    case 'gain_credit':
      return doGainCredit(state, action);
    case 'end_turn':
      return doEndTurn(state, action);
    case 'discard':
      return doDiscard(state, action);
    case 'install':
      return doInstall(state, action);
    case 'play':
      return doPlay(state, action);
    case 'advance':
      return doAdvance(state, action);
    case 'score':
      return doScore(state, action);
    case 'run':
      return doRun(state, action);
    case 'rez':
      return doRez(state, action);
    case 'pass':
      return doPass(state);
    case 'jack_out':
      return doJackOut(state);
    case 'use_ability':
      return doUseAbility(state, action);
    case 'steal':
      return doSteal(state, action);
    case 'trash':
      return doTrash(state, action);
    case 'activate':
      return doActivate(state, action);
    case 'choose':
      return doChoose(state, action);
    case 'trace_bid':
      return doTraceBid(state, action);
    case 'remove_tag':
      return doRemoveTag(state);
    case 'trash_resource':
      return doTrashResource(state, action);
    case 'select':
      return { state, events: [] }; // Sprint 12 E1 stub: refused `not_implemented` before this
  }
}

/**
 * All actions `player` may take right now, in a stable order. `discard` has too
 * many combinations to list, so one representative (the last N hand cards) is
 * listed; `PlayerView.pendingDiscard` says any N distinct indices are legal.
 */
export function legalActions(state: GameState, player: Side): Action[] {
  if (player !== 'corp' && player !== 'runner') return [];
  const handSize = state.players[player].hand.length;
  const n = discardCount(handSize, maxHandSize(state, player));
  const candidates: Action[] = [
    { type: 'draw', player },
    { type: 'gain_credit', player },
    { type: 'end_turn', player },
    { type: 'discard', player, handIndices: Array.from({ length: n }, (_, k) => handSize - n + k) },
  ];
  const options = handOptions(state, player).flat();
  const installs = options.filter((o) => o.action.type === 'install');
  const plays = options.filter((o) => o.action.type === 'play');
  const installed = Object.values(installedOptions(state, player)).flat();
  return [
    ...candidates.filter((a) => rejectionFor(state, a) === null),
    ...[
      ...installs,
      ...plays,
      ...runStartOptions(state, player),
      ...installed,
      ...runStepOptions(state, player),
      ...choiceOptions(state, player),
      ...basicOptions(state, player),
    ]
      .filter((o) => o.reject === null)
      .map((o) => o.action),
  ];
}

/**
 * True when `player` has something to decide now. The engine already
 * auto-passes windows nobody can act in; hosts/AI use this to know whom to ask.
 */
export function hasMeaningfulResponse(state: GameState, player: Side): boolean {
  return legalActions(state, player).length > 0;
}

const option = (state: GameState, action: Action, cost: number): CardOption => ({
  action,
  cost,
  reject: rejectionFor(state, action),
});

/** Sprint 7: a breaker option, with `hostedPay` when recurring credits (Cyberfeeder) pay part of it. */
function breakerOption(state: GameState, action: ActionOf<'use_ability'>, cost: number): CardOption {
  const hosted = breakerPayment(state, cost).hosted;
  return { ...option(state, action, cost), ...(hosted.length > 0 ? { hostedPay: hosted.map((h) => ({ uid: h.uid, amount: h.amount })) } : {}) };
}

/** Runner only: one `run` per server (corpServers order), listed off-turn too with its reason. Corp: []. */
export function runStartOptions(state: GameState, player: Side): CardOption[] {
  if (player !== 'runner') return [];
  return state.servers.map((sv) => option(state, { type: 'run', player, server: sv.id }, 0));
}

/**
 * The deciding player's moves at the current run step (empty for the other
 * player and outside a run). bad_target moves are never listed.
 */
export function runStepOptions(state: GameState, player: Side): CardOption[] {
  const run = state.run;
  if (state.phase !== 'run' || !run || waitingOn(state) !== player) return [];
  const out: CardOption[] = [];
  const pass: Action = { type: 'pass', player };
  if (run.step === 'approach') {
    const ice = currentIce(state) as Installed;
    out.push(option(state, { type: 'rez', player, uid: ice.uid }, rezCost(state, ice)), option(state, pass, 0));
  } else if (run.step === 'encounter') {
    const ice = currentIce(state) as Installed;
    const iceCard = getCard(ice.cardId);
    for (const c of state.rig) {
      const b = breakerCard(state, c.uid);
      if (!b || breakerIceType(b.card) !== iceCard?.subtype) continue;
      (b.card.abilities ?? []).forEach((ab, ability) => {
        if (ab.op === 'strength') {
          out.push(breakerOption(state, { type: 'use_ability', player, uid: c.uid, ability }, ab.cost));
          return;
        }
        const open = (iceCard?.subroutines ?? []).map((_, sub) => sub).filter((sub) => !run.broken.includes(sub));
        if (ab.count === 2) {
          // Sprint 8 ("break up to 2", Battering Ram): every 1- then 2-subroutine choice, ascending.
          const picks = [...open.map((x) => [x]), ...open.flatMap((x, i) => open.slice(i + 1).map((y) => [x, y]))];
          for (const subs of picks) out.push(breakerOption(state, { type: 'use_ability', player, uid: c.uid, ability, subs }, ab.cost));
          return;
        }
        for (const sub of open) out.push(breakerOption(state, { type: 'use_ability', player, uid: c.uid, ability, sub }, ab.cost));
      });
    }
    out.push(option(state, pass, 0));
  } else if (run.step === 'continue') {
    out.push(option(state, pass, 0), option(state, { type: 'jack_out', player }, 0));
  } else if (run.step === 'success') {
    // Sprint 7: take credits from Bank Job (one option per usable card), or pass = Access cards.
    // Sprint 10: a chosen-amount ability lists one option per amount 1..hosted credits (as trace bids).
    for (const { uid, ability } of accessReplacements(state)) {
      const c = state.rig.find((x) => x.uid === uid) as Installed;
      const ab = getCard(c.cardId)?.cardAbilities?.[ability] as CardAbility;
      out.push(...abilityOptions(state, { type: 'activate', player, uid, ability }, c, ab));
    }
    out.push(option(state, pass, 0));
  } else {
    (run.access?.cards ?? []).forEach((c, card) => {
      if (c.stolen || c.trashed) return;
      const def = getCard(c.cardId);
      if (def?.type === 'agenda') out.push(option(state, { type: 'steal', player, card }, 0));
      else if (def?.trashCost !== undefined && c.from !== 'archives') out.push(option(state, { type: 'trash', player, card }, trashCost(c)));
    });
    if (!unstolenAgendaShown(state)) out.push(option(state, pass, 0));
  }
  return out.filter((o) => o.reject !== 'bad_target');
}

/**
 * The deciding player's options in an open choice (empty for the other player
 * and outside phase 'choice'). `free_rez`: one `rez` (cost 0) per unrezzed
 * installed ICE (servers in order, then ICE index order), then `pass` (Skip).
 * Sprint 8: `trash_target`: one `choose` per candidate (rig order; no `pass`);
 * `prevent_trash`: one `choose` per preventer (rig order), then `pass` (let it be trashed).
 */
export function choiceOptions(state: GameState, player: Side): CardOption[] {
  if (state.phase !== 'choice' || !state.choice || waitingOn(state) !== player) return [];
  const kind = state.choice.kind;
  if (kind === 'free_rez') {
    const rezzes = unrezzedIce(state).map((c) => option(state, { type: 'rez', player, uid: c.uid }, 0));
    return [...rezzes, option(state, { type: 'pass', player }, 0)];
  }
  if (kind === 'trace_corp' || kind === 'trace_runner') {
    // Sprint 9: one bid per amount 0..max (`cost` = amount).
    const max = traceMaxBid(state, player);
    return Array.from({ length: max + 1 }, (_, credits) => option(state, { type: 'trace_bid', player, credits }, credits));
  }
  const chooses = chooseTargets(state).map((uid) => option(state, { type: 'choose', player, uid }, 0));
  return kind === 'prevent_trash' ? [...chooses, option(state, { type: 'pass', player }, 0)] : chooses;
}

/** Sprint 7: one `activate` option per `click` ability of an own face-up card (price, clicks, gain). */
function clickAbilityOptions(state: GameState, player: Side, c: Installed): CardOption[] {
  const out: CardOption[] = [];
  (getCard(c.cardId)?.cardAbilities ?? []).forEach((ab, ability) => {
    if (ab.when !== 'click') return;
    out.push(...abilityOptions(state, { type: 'activate', player, uid: c.uid, ability }, c, ab));
  });
  return out;
}

/**
 * Sprint 10: the `activate` options of one ability: one option, or for a chosen-amount ability (Bank
 * Job) one per amount 1..the card's hosted credits, ascending (none when it holds nothing).
 */
function abilityOptions(state: GameState, action: ActionOf<'activate'>, c: Installed, ab: CardAbility): CardOption[] {
  if (!hasChosenAmount(ab)) return [abilityOption(state, action, c, ab)];
  return Array.from({ length: c.hostedCredits }, (_, k) => abilityOption(state, { ...action, amount: k + 1 }, c, ab));
}

/** An `activate` option: `cost` = credits, `clicks` when > 0, `gain` when it takes credits. */
function abilityOption(state: GameState, action: ActionOf<'activate'>, c: Installed, ab: CardAbility): CardOption {
  const gain = abilityGain(c, ab, action.amount);
  return {
    ...option(state, action, ab.credits),
    ...(ab.clicks > 0 ? { clicks: ab.clicks } : {}),
    ...(gain !== undefined ? { gain } : {}),
  };
}

/**
 * Per own installed card uid, listed off-turn too with the reason in `reject` (like `handOptions`).
 * Corp (servers in order; ICE innermost first, then content): agenda `advance` (cost 1) until it
 * has enough counters, then only `score` (Sprint 10); unrezzed asset/upgrade `rez` (cost = rez cost, Sprint 7); click
 * abilities of rezzed cards. Runner (Sprint 7, rig order): one `activate` per `click` ability.
 * Sprint 9 (Corp): per scored agenda with `scoredAbilities` (key `score:corp:<i>`) its `activate` options;
 * while the Runner is tagged, one `trash_resource` (cost 2, `clicks: 1`) per rig resource
 * (the only options on the other side's cards).
 */
export function installedOptions(state: GameState, player: Side): Record<string, CardOption[]> {
  const out: Record<string, CardOption[]> = {};
  if (player === 'runner') {
    for (const c of state.rig) {
      const opts = clickAbilityOptions(state, player, c);
      if (opts.length > 0) out[c.uid] = opts;
    }
    return out;
  }
  if (player !== 'corp') return out;
  for (const sv of state.servers) {
    for (const c of [...sv.ice, ...sv.content]) {
      const card = getCard(c.cardId);
      const opts: CardOption[] = [];
      if (card?.type === 'agenda') {
        // Sprint 10: advance stops at the requirement; from then on only Score is offered.
        if (c.advancements >= (card.advancementRequirement ?? 0)) opts.push(option(state, { type: 'score', player, uid: c.uid }, 0));
        else opts.push(option(state, { type: 'advance', player, uid: c.uid }, ADVANCE_COST));
      } else if (card?.type === 'ice' && card.advanceable) {
        // Sprint 7: advanceable ICE (Ice Wall), face up or down.
        opts.push(option(state, { type: 'advance', player, uid: c.uid }, ADVANCE_COST));
      } else if ((card?.type === 'asset' || card?.type === 'upgrade') && !c.rezzed) {
        opts.push(option(state, { type: 'rez', player, uid: c.uid }, rezCost(state, c)));
      }
      if (c.rezzed) opts.push(...clickAbilityOptions(state, player, c));
      if (opts.length > 0) out[c.uid] = opts;
    }
  }
  // Sprint 9: scored agendas with abilities (Private Security Force), always listed with the reason.
  state.players.corp.scoreArea.forEach((cardId, i) => {
    const abilities = getCard(cardId)?.scoredAbilities ?? [];
    if (abilities.length === 0) return;
    const uid = scoredUid('corp', i);
    const pseudo = ownScoredCard(state, 'corp', uid) as Installed;
    out[uid] = abilities.map((ab, ability) => abilityOption(state, { type: 'activate', player, uid, ability }, pseudo, ab));
  });
  // Sprint 9: while the Runner is tagged, trash any of his resources (1 click + 2 credits).
  if (state.players.runner.tags > 0) {
    for (const c of state.rig) {
      if (getCard(c.cardId)?.type !== 'resource') continue;
      out[c.uid] = [{ ...option(state, { type: 'trash_resource', player, uid: c.uid }, BASIC_ACTION_COST), clicks: 1 }];
    }
  }
  return out;
}

/**
 * Sprint 9: `player`'s basic actions not tied to a card, listed off-turn too with `reject`. Runner:
 * `remove_tag` (cost 2, `clicks: 1`) while tagged; Corp: none (its `trash_resource` is per rig card, in
 * `installedOptions`).
 */
export function basicOptions(state: GameState, player: Side): CardOption[] {
  if (player !== 'runner' || state.players.runner.tags <= 0) return [];
  return [{ ...option(state, { type: 'remove_tag', player }, BASIC_ACTION_COST), clicks: 1 }];
}

/** Every install/play action the card at `handIndex` could take, before checking turn, clicks or money. */
function candidatesFor(state: GameState, player: Side, handIndex: number): Action[] {
  const install = (server?: ServerId | 'new'): ActionOf<'install'> =>
    server === undefined ? { type: 'install', player, handIndex } : { type: 'install', player, handIndex, server };
  const installs: ActionOf<'install'>[] =
    player === 'corp' ? [...state.servers.map((sv) => install(sv.id)), install('new')] : [install()];
  const offered = installs.filter((a) => installCardCheck(state, a) === null && installTargetCheck(state, a) === null);
  if (offered.length > 0) return offered;
  const card = handCard(state, player, handIndex);
  if (card?.type !== (player === 'corp' ? 'operation' : 'event')) return [];
  // Run events with no fixed server (Inside Job): one option per server.
  if (openRunEffect(card)) return state.servers.map((sv) => ({ type: 'play', player, handIndex, server: sv.id }));
  return [{ type: 'play', player, handIndex }];
}

/**
 * Per hand index of `player`: every offered action (bad_card/bad_target never
 * listed) with its engine-computed credit cost and the reason `apply` would
 * refuse it (null = legal now).
 */
export function handOptions(state: GameState, player: Side): CardOption[][] {
  if (player !== 'corp' && player !== 'runner') return [];
  return state.players[player].hand.map((_, handIndex) =>
    candidatesFor(state, player, handIndex).map((action) => {
      const cost = action.type === 'install' ? installCost(state, action) : action.type === 'play' ? playCost(state, action) : 0;
      // Sprint 8: how much an install discount (Kate) takes off, only when it does.
      const discount = action.type === 'install' ? installBaseCost(state, action) - cost : 0;
      return { action, cost, reject: rejectionFor(state, action), ...(discount > 0 ? { discount } : {}) };
    }),
  );
}
