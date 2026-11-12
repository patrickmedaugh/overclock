import type { Action, ActionOf } from './actions';
import type { GameEvent } from './events';
import type { CardOption } from './view';
import { getCard } from '@overclock/cards';
import {
  discardCount,
  handCard,
  installCardCheck,
  installCost,
  installTargetCheck,
  playCost,
  rejectionFor,
} from './rules';
import {
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

  for (const effect of card?.onPlay ?? []) {
    switch (effect.op) {
      case 'gain_credits':
        s = withPlayer(s, a.player, { credits: s.players[a.player].credits + effect.amount });
        events.push({ type: 'credit_gained', player: a.player, amount: effect.amount });
        break;
      case 'draw':
        // Effect draws stop at an empty deck; only the Corp's mandatory draw can lose.
        for (let k = 0; k < effect.count && s.players[a.player].deck.length > 0; k++) {
          const drawn = drawTop(s, a.player);
          s = drawn.state;
          events.push({ type: 'card_drawn', player: a.player, cardId: drawn.cardId });
        }
        break;
    }
  }
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
    default:
      // Sprint 3 actions: rejected by the table until built (E2-E5).
      return { state, events: [{ type: 'action_rejected', reason: 'not_implemented' }] };
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
  return [
    ...candidates.filter((a) => rejectionFor(state, a) === null),
    ...[...installs, ...plays].filter((o) => o.reject === null).map((o) => o.action),
  ];
}

/** Every install/play action the card at `handIndex` could take, before checking turn, clicks or money. */
function candidatesFor(state: GameState, player: Side, handIndex: number): Action[] {
  const install = (server?: ServerId | 'new'): ActionOf<'install'> =>
    server === undefined ? { type: 'install', player, handIndex } : { type: 'install', player, handIndex, server };
  const installs: ActionOf<'install'>[] =
    player === 'corp' ? [...state.servers.map((sv) => install(sv.id)), install('new')] : [install()];
  const offered = installs.filter((a) => installCardCheck(state, a) === null && installTargetCheck(state, a) === null);
  if (offered.length > 0) return offered;
  const type = handCard(state, player, handIndex)?.type;
  return type === (player === 'corp' ? 'operation' : 'event') ? [{ type: 'play', player, handIndex }] : [];
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
