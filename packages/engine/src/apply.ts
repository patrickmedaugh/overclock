import type { Action, ActionOf } from './actions';
import type { GameEvent } from './events';
import type { CardOption } from './view';
import { getCard } from '@overclock/cards';
import {
  ADVANCE_COST,
  breakerCard,
  breakerIceType,
  currentIce,
  discardCount,
  handCard,
  installedAgenda,
  installCardCheck,
  installCost,
  installTargetCheck,
  openRunEffect,
  playCost,
  rejectionFor,
  rezCost,
  trashCost,
  unstolenAgendaShown,
  waitingOn,
} from './rules';
import { doJackOut, doPass, doRez, doRun, doSteal, doTrash, doUseAbility, resolveEffect } from './run';
import {
  checkPointsWin,
  drawTop,
  opponentOf,
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
  const started = startTurn(state, opponentOf(ending), state.turn + 1);
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
  const count = discardCount(s.players[a.player].hand.length);
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

function doInstall(state: GameState, a: ActionOf<'install'>): ApplyResult {
  const cardId = state.players[a.player].hand[a.handIndex] as string;
  const events: GameEvent[] = [];
  let s = payFromHand(state, a.player, a.handIndex, installCost(state, a), events);
  const card: Installed = { uid: `i${s.nextUid}`, cardId, rezzed: false, advancements: 0 };
  s = { ...s, nextUid: s.nextUid + 1 };

  if (a.player === 'runner') {
    s = { ...s, rig: [...s.rig, card] };
    events.push({ type: 'card_installed', player: a.player, uid: card.uid, zone: 'rig', handIndex: a.handIndex, cardId });
    return { state: s, events };
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
  return { state: s, events };
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
  const card = installedAgenda(state, a.uid) as Installed;
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
  s = checkPointsWin(s, a.player, events);
  return { state: s, events };
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
  const n = discardCount(handSize);
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
    ...[...installs, ...plays, ...runStartOptions(state, player), ...installed, ...runStepOptions(state, player)]
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
    out.push(option(state, { type: 'rez', player, uid: ice.uid }, rezCost(ice)), option(state, pass, 0));
  } else if (run.step === 'encounter') {
    const ice = currentIce(state) as Installed;
    const iceCard = getCard(ice.cardId);
    for (const c of state.rig) {
      const b = breakerCard(state, c.uid);
      if (!b || breakerIceType(b.card) !== iceCard?.subtype) continue;
      (b.card.abilities ?? []).forEach((ab, ability) => {
        if (ab.op === 'strength') {
          out.push(option(state, { type: 'use_ability', player, uid: c.uid, ability }, ab.cost));
          return;
        }
        (iceCard?.subroutines ?? []).forEach((_, sub) => {
          if (!run.broken.includes(sub)) out.push(option(state, { type: 'use_ability', player, uid: c.uid, ability, sub }, ab.cost));
        });
      });
    }
    out.push(option(state, pass, 0));
  } else if (run.step === 'continue') {
    out.push(option(state, pass, 0), option(state, { type: 'jack_out', player }, 0));
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
 * Corp only: per installed agenda uid (servers in order, then install order),
 * `advance` (cost 1) and, once it has enough counters, `score`. Listed off-turn
 * too, with the reason in `reject` (like `handOptions`). Runner: {}.
 */
export function installedOptions(state: GameState, player: Side): Record<string, CardOption[]> {
  const out: Record<string, CardOption[]> = {};
  if (player !== 'corp') return out;
  for (const sv of state.servers) {
    for (const c of sv.content) {
      const card = getCard(c.cardId);
      if (card?.type !== 'agenda') continue;
      const advance: ActionOf<'advance'> = { type: 'advance', player, uid: c.uid };
      const opts: CardOption[] = [{ action: advance, cost: ADVANCE_COST, reject: rejectionFor(state, advance) }];
      if (c.advancements >= (card.advancementRequirement ?? 0)) {
        const score: ActionOf<'score'> = { type: 'score', player, uid: c.uid };
        opts.push({ action: score, cost: 0, reject: rejectionFor(state, score) });
      }
      out[c.uid] = opts;
    }
  }
  return out;
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
    candidatesFor(state, player, handIndex).map((action) => ({
      action,
      cost: action.type === 'install' ? installCost(state, action) : action.type === 'play' ? playCost(state, action) : 0,
      reject: rejectionFor(state, action),
    })),
  );
}
