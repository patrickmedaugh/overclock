import type { ActionOf } from './actions';
import type { ApplyResult } from './apply';
import type { GameEvent, InstallSlot } from './events';
import { handCard, installCost } from './rules';
import { withCorp, withPlayer, type GameState, type Installed, type ServerId, type ServerState } from './state';

/** Spends 1 click and `amount` credits; emits credits_spent only when amount > 0. */
export function pay(state: GameState, a: ActionOf<'install' | 'play'>, amount: number, events: GameEvent[]): GameState {
  const me = state.players[a.player];
  if (amount > 0) events.push({ type: 'credits_spent', player: a.player, amount });
  return withPlayer(state, a.player, { clicks: me.clicks - 1, credits: me.credits - amount });
}

/** Removes the hand card at `handIndex` and gives it the next uid. */
function takeFromHand(state: GameState, a: ActionOf<'install'>): { state: GameState; card: Installed } {
  const me = state.players[a.player];
  const cardId = me.hand[a.handIndex] as string;
  const card: Installed = { uid: `i${state.nextUid}`, cardId, rezzed: false };
  const s = withPlayer({ ...state, nextUid: state.nextUid + 1 }, a.player, {
    hand: me.hand.filter((_, i) => i !== a.handIndex),
  });
  return { state: s, card };
}

/** Opens the next remote server (numbers are never reused). */
function createRemote(state: GameState, events: GameEvent[]): { state: GameState; serverId: ServerId } {
  const remote = state.nextRemote;
  const serverId: ServerId = `remote-${remote}`;
  const server: ServerState = { id: serverId, ice: [], root: [] };
  events.push({ type: 'server_created', serverId, remote });
  const s = withCorp({ ...state, nextRemote: remote + 1 }, { servers: [...state.players.corp.servers, server] });
  return { state: s, serverId };
}

function installCorp(state: GameState, a: ActionOf<'install'>): ApplyResult {
  const events: GameEvent[] = [];
  const isIce = handCard(state, a)?.type === 'ice';
  const cost = installCost(state, a);
  let s = state;
  let serverId = a.server as ServerId | 'new';
  if (serverId === 'new') ({ state: s, serverId } = createRemote(s, events));
  s = pay(s, a, cost, events);
  const taken = takeFromHand(s, a);
  s = taken.state;
  const slot: InstallSlot = isIce ? 'ice' : 'root';
  let index = 0;
  const servers = s.players.corp.servers.map((srv) => {
    if (srv.id !== serverId) return srv;
    // ICE goes on the outside: the end of the list.
    const list = [...srv[slot], taken.card];
    index = list.length - 1;
    return { ...srv, [slot]: list };
  });
  s = withCorp(s, { servers });
  events.push({
    type: 'card_installed',
    player: 'corp',
    uid: taken.card.uid,
    handIndex: a.handIndex,
    cardId: taken.card.cardId,
    server: serverId,
    slot,
    index,
  });
  return { state: s, events };
}

/** Installs a hand card. The action has passed every check in `rules.ts`. */
export function doInstall(state: GameState, a: ActionOf<'install'>): ApplyResult {
  return installCorp(state, a);
}
