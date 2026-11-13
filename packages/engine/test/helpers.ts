import {
  apply,
  legalActions,
  newGame,
  type Action,
  type GameEvent,
  type GameState,
  type PlayerState,
  type ServerId,
  type Side,
} from '../src/index';

/** Recursively freezes a value so any mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** Returns a copy of `state` with one player's fields replaced (test setup only). */
export function withPlayer(state: GameState, side: Side, patch: Partial<PlayerState>): GameState {
  return { ...state, players: { ...state.players, [side]: { ...state.players[side], ...patch } } };
}

export function withClicks(state: GameState, side: Side, clicks: number): GameState {
  return withPlayer(state, side, { clicks });
}

export function withDeck(state: GameState, side: Side, deck: string[]): GameState {
  return withPlayer(state, side, { deck });
}

export function withHand(state: GameState, side: Side, hand: string[]): GameState {
  return withPlayer(state, side, { hand });
}

/** Deep copy via JSON (GameState is plain JSON by contract). */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Applies actions in order, asserting none is rejected. Returns final state and all events. */
export function run(state: GameState, actions: readonly Action[]): { state: GameState; events: GameEvent[] } {
  let s = state;
  const events: GameEvent[] = [];
  for (const a of actions) {
    const r = apply(s, a);
    const rejected = r.events.find((e) => e.type === 'action_rejected');
    if (rejected) throw new Error(`unexpected rejection of ${JSON.stringify(a)}: ${JSON.stringify(rejected)}`);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

export const endTurn = (player: Side): Action => ({ type: 'end_turn', player });
export const draw = (player: Side): Action => ({ type: 'draw', player });
export const gainCredit = (player: Side): Action => ({ type: 'gain_credit', player });
export const discard = (player: Side, handIndices: number[]): Action => ({ type: 'discard', player, handIndices });

/**
 * Ends the active player's turn, discarding the first N hand cards if the hand
 * limit asks for it. Returns the new state and all events.
 */
export function finishTurn(state: GameState): { state: GameState; events: GameEvent[] } {
  const p = state.activePlayer;
  const ended = run(state, [endTurn(p)]);
  if (ended.state.phase !== 'discard') return ended;
  const n = ended.state.players[p].hand.length - 5;
  const done = run(ended.state, [discard(p, Array.from({ length: n }, (_, i) => i))]);
  return { state: done.state, events: [...ended.events, ...done.events] };
}

/** The single rejection reason from an apply result, or null if accepted. */
export function rejection(events: readonly GameEvent[]): string | null {
  const e = events.find((x) => x.type === 'action_rejected');
  return e && e.type === 'action_rejected' ? e.reason : null;
}

export interface BoardSpec {
  /** Per server: ICE (innermost first) and content, as card ids; prefix '+' = rezzed. Unlisted centrals are empty. */
  readonly servers?: Readonly<Record<string, { ice?: readonly string[]; content?: readonly string[] }>>;
  readonly corpHand?: readonly string[];
  readonly corpDeck?: readonly string[];
  /** Archives entries; prefix '+' = face up. */
  readonly archives?: readonly string[];
  readonly corpCredits?: number;
  readonly rig?: readonly string[];
  readonly runnerHand?: readonly string[];
  readonly runnerDeck?: readonly string[];
  readonly runnerCredits?: number;
  readonly runnerClicks?: number;
  /** Advancement counters per uid. */
  readonly advancements?: Readonly<Record<string, number>>;
}

/**
 * A Runner turn (turn 2) on a hand-built board. Installed uids are i1, i2, ...
 * in order: rig first, then servers in key order (ICE innermost first, then content).
 */
export function board(spec: BoardSpec, seed = 77): GameState {
  const base = finishTurn(newGame(seed)).state;
  let uid = 1;
  const inst = (id: string) => {
    const rezzed = id.startsWith('+');
    const u = `i${uid++}`;
    return { uid: u, cardId: rezzed ? id.slice(1) : id, rezzed, advancements: spec.advancements?.[u] ?? 0 };
  };
  const rig = (spec.rig ?? []).map((id) => ({ ...inst(id), rezzed: false }));
  const ids = ['hq', 'rd', 'archives', ...Object.keys(spec.servers ?? {}).filter((k) => k.startsWith('remote'))];
  const servers = ids.map((id) => {
    const sv = spec.servers?.[id] ?? {};
    return { id: id as ServerId, ice: (sv.ice ?? []).map(inst), content: (sv.content ?? []).map(inst) };
  });
  let s: GameState = {
    ...base,
    servers,
    rig,
    nextUid: uid,
    nextRemote: ids.filter((k) => k.startsWith('remote')).length + 1,
  };
  s = withPlayer(s, 'corp', {
    hand: [...(spec.corpHand ?? ['c01', 'c02'])],
    deck: [...(spec.corpDeck ?? ['c01', 'c02', 'c03'])],
    discard: (spec.archives ?? []).map((id) => ({ cardId: id.replace('+', ''), faceUp: id.startsWith('+') })),
    credits: spec.corpCredits ?? 10,
  });
  s = withPlayer(s, 'runner', {
    hand: [...(spec.runnerHand ?? ['r01', 'r03', 'r09'])],
    deck: [...(spec.runnerDeck ?? ['r01', 'r01'])],
    credits: spec.runnerCredits ?? 5,
    clicks: spec.runnerClicks ?? 4,
  });
  return s;
}

/** Applies one action that must be accepted; returns state and events. */
export function act(state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  return run(state, [action]);
}

/** Exactly one side has legal actions (outside 'over'), and it is the one the game waits on. */
export function liveness(state: GameState): Side | null {
  const corp = legalActions(state, 'corp').length > 0;
  const runner = legalActions(state, 'runner').length > 0;
  if (state.phase === 'over') {
    if (corp || runner) throw new Error('someone can act after the game is over');
    return null;
  }
  if (corp === runner) throw new Error(`liveness: corp ${corp}, runner ${runner} (phase ${state.phase}, step ${state.run?.step})`);
  return corp ? 'corp' : 'runner';
}

/**
 * Corp turn 1: `hand` installed one by one into new servers (uids i1, i2, ...; ICE too),
 * then `ready` agendas get their full advancement counters; clicks/credits set.
 */
export function corpBoard(hand: string[], opts: { credits?: number; clicks?: number; scored?: string[]; ready?: string[] } = {}): GameState {
  let s = withPlayer(withHand(newGame(21), 'corp', hand), 'corp', { clicks: hand.length });
  s = run(s, hand.map(() => ({ type: 'install', player: 'corp', handIndex: 0, server: 'new' }) as Action)).state;
  const need: Record<string, number> = { c08: 2, c09: 4, c10: 5 };
  const ready = new Set(opts.ready ?? []);
  s = {
    ...s,
    servers: s.servers.map((sv) => ({
      ...sv,
      content: sv.content.map((c) => (ready.has(c.uid) ? { ...c, advancements: need[c.cardId] ?? 0 } : c)),
    })),
  };
  return withPlayer(s, 'corp', { clicks: opts.clicks ?? 3, credits: opts.credits ?? 5, scoreArea: opts.scored ?? [] });
}
