import type { CardDef, Effect } from '@overclock/cards';
import type { Action, ActionOf } from './actions';
import type { GameEvent } from './events';
import { discardCount, handCard, installCost, isPlayable, rejectionFor, targetAllowed } from './rules';
import {
  drawTop,
  opponentOf,
  startTurn,
  withPlayer,
  type GameState,
  type Installed,
  type RemoteServerId,
  type Server,
  type ServerId,
  type Side,
} from './state';
import type { CardOption } from './view';

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
    // Runner discards go face up to the Heap; Corp hand-limit discards face down to Archives.
    discard: [...me.discard, ...cardIds.map((cardId) => ({ cardId, faceUp: a.player === 'runner' }))],
  });
  const events: GameEvent[] = [
    { type: 'cards_discarded', player: a.player, count: cardIds.length, handIndices, cardIds },
  ];
  return passTurn(s, events);
}

/** Pays 1 click and `cost` credits and removes the hand card at `handIndex`. */
function payAndTake(state: GameState, player: Side, handIndex: number, cost: number): GameState {
  const me = state.players[player];
  return withPlayer(state, player, {
    hand: me.hand.filter((_, i) => i !== handIndex),
    credits: me.credits - cost,
    clicks: me.clicks - 1,
  });
}

function doInstall(state: GameState, a: ActionOf<'install'>): ApplyResult {
  const card = handCard(state, a.player, a.handIndex) as CardDef;
  const cost = installCost(state, a.player, card, a.server);
  let s = payAndTake(state, a.player, a.handIndex, cost);
  const installed: Installed = { uid: `i${s.nextUid}`, cardId: card.id, rezzed: false };
  s = { ...s, nextUid: s.nextUid + 1 };
  const events: GameEvent[] = [];
  if (cost > 0) events.push({ type: 'credits_spent', player: a.player, amount: cost });

  if (a.player === 'runner') {
    s = { ...s, rig: [...s.rig, installed] };
    events.push({
      type: 'card_installed',
      player: 'runner',
      uid: installed.uid,
      zone: 'rig',
      handIndex: a.handIndex,
      cardId: card.id,
    });
    return { state: s, events };
  }

  let serverId = a.server as ServerId | 'new';
  if (serverId === 'new') {
    const id: RemoteServerId = `remote${s.nextRemote}`;
    s = { ...s, servers: [...s.servers, { id, ice: [], content: [] }], nextRemote: s.nextRemote + 1 };
    events.push({ type: 'server_created', server: id });
    serverId = id;
  }
  // New ICE goes on the outside (end of the list); index 0 is innermost.
  const zone = card.type === 'ice' ? 'ice' : 'content';
  s = {
    ...s,
    servers: s.servers.map((sv): Server => (sv.id === serverId ? { ...sv, [zone]: [...sv[zone], installed] } : sv)),
  };
  events.push({
    type: 'card_installed',
    player: 'corp',
    uid: installed.uid,
    zone,
    server: serverId,
    handIndex: a.handIndex,
    cardId: card.id,
  });
  return { state: s, events };
}

/** Resolves one effect of the card DSL for `player`, appending its events. */
function resolve(state: GameState, player: Side, effect: Effect, events: GameEvent[]): GameState {
  switch (effect.op) {
    case 'gain_credits':
      events.push({ type: 'credit_gained', player, amount: effect.amount });
      return withPlayer(state, player, { credits: state.players[player].credits + effect.amount });
    case 'draw': {
      let s = state;
      // Effect draws stop at an empty deck; only the Corp's mandatory draw can lose.
      for (let k = 0; k < effect.count && s.players[player].deck.length > 0; k++) {
        const drawn = drawTop(s, player);
        s = drawn.state;
        events.push({ type: 'card_drawn', player, cardId: drawn.cardId });
      }
      return s;
    }
  }
}

function doPlay(state: GameState, a: ActionOf<'play'>): ApplyResult {
  const card = handCard(state, a.player, a.handIndex) as CardDef;
  let s = payAndTake(state, a.player, a.handIndex, card.cost);
  // Played cards go face up on top of their owner's discard pile (Archives / Heap).
  s = withPlayer(s, a.player, { discard: [...s.players[a.player].discard, { cardId: card.id, faceUp: true }] });
  const events: GameEvent[] = [];
  if (card.cost > 0) events.push({ type: 'credits_spent', player: a.player, amount: card.cost });
  events.push({ type: 'card_played', player: a.player, cardId: card.id, handIndex: a.handIndex });
  for (const effect of card.onPlay ?? []) s = resolve(s, a.player, effect, events);
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
  }
}

/**
 * Every action offered for the hand card at `handIndex`: the card type fits
 * the action and the target is allowed for that card. Turn, phase, clicks,
 * credits, memory and `needs` are not considered here (see `rejectionFor`).
 * Corp targets come in server order (hq, rd, archives, remotes), then 'new'.
 */
function offeredActions(state: GameState, player: Side, handIndex: number): Action[] {
  const card = handCard(state, player, handIndex);
  if (!card || card.side !== player) return [];
  if (isPlayable(card)) return [{ type: 'play', player, handIndex }];
  if (player === 'runner') return [{ type: 'install', player, handIndex }];
  const targets: (ServerId | 'new')[] = [...state.servers.map((sv) => sv.id), 'new'];
  return targets
    .filter((server) => targetAllowed(state, player, card, server))
    .map((server): Action => ({ type: 'install', player, handIndex, server }));
}

/** The credits an offered install/play costs. */
function optionCost(state: GameState, action: Action): number {
  if (action.type !== 'install' && action.type !== 'play') return 0;
  const card = handCard(state, action.player, action.handIndex) as CardDef;
  return action.type === 'play' ? card.cost : installCost(state, action.player, card, action.server);
}

/**
 * Per hand index of `player`: every offered action for that card, its credit
 * cost, and the reason it would be refused right now (null = legal).
 */
export function handOptions(state: GameState, player: Side): CardOption[][] {
  if (player !== 'corp' && player !== 'runner') return [];
  return state.players[player].hand.map((_, i) =>
    offeredActions(state, player, i).map((action) => ({
      action,
      cost: optionCost(state, action),
      reject: rejectionFor(state, action),
    })),
  );
}

/**
 * All actions `player` may take right now, in a stable order: draw,
 * gain_credit, end_turn, discard, install (by hand index, then target), play
 * (by hand index). `discard` has too many combinations to list, so one
 * representative (the last N hand cards) is listed; `PlayerView.pendingDiscard`
 * says any N distinct indices are legal.
 */
export function legalActions(state: GameState, player: Side): Action[] {
  if (player !== 'corp' && player !== 'runner') return [];
  const handSize = state.players[player].hand.length;
  const n = discardCount(handSize);
  const offered = state.players[player].hand.flatMap((_, i) => offeredActions(state, player, i));
  const candidates: Action[] = [
    { type: 'draw', player },
    { type: 'gain_credit', player },
    { type: 'end_turn', player },
    { type: 'discard', player, handIndices: Array.from({ length: n }, (_, k) => handSize - n + k) },
    ...offered.filter((a) => a.type === 'install'),
    ...offered.filter((a) => a.type === 'play'),
  ];
  return candidates.filter((a) => rejectionFor(state, a) === null);
}
