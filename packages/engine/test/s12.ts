// Sprint 12 test fixtures: hand-built boards on the core decks (identities: Haas-Bioroid, Kate).
import { apply, type Action, type GameEvent, type GameState, type ServerId, type Side } from '../src/index';
import { coreGame, finishTurn, withPlayer } from './helpers';

export interface S12Spec {
  /** Per server: ICE (innermost first) and content, card ids; prefix '+' = rezzed. Unlisted centrals are empty. */
  readonly servers?: Readonly<Record<string, { ice?: readonly string[]; content?: readonly string[] }>>;
  /** Advancement counters per uid. */
  readonly advancements?: Readonly<Record<string, number>>;
  readonly corpHand?: readonly string[];
  readonly corpDeck?: readonly string[];
  /** Archives entries; prefix '+' = face up. */
  readonly archives?: readonly string[];
  readonly corpCredits?: number;
  readonly corpScored?: readonly string[];
  readonly rig?: readonly string[];
  /** Hosted credits per rig uid. */
  readonly hosted?: Readonly<Record<string, number>>;
  readonly runnerHand?: readonly string[];
  readonly runnerDeck?: readonly string[];
  readonly runnerCredits?: number;
}

/**
 * A core-deck board on `side`'s turn (Corp: turn 1, 3 clicks; Runner: turn 2, 4 clicks), nothing installed
 * yet this turn. Installed uids are i1, i2, ...: rig first, then servers in key order (ICE innermost first,
 * then content).
 */
export function s12Board(side: Side, spec: S12Spec = {}, seed = 12): GameState {
  const start = coreGame(seed);
  const base = side === 'corp' ? start : finishTurn(start).state;
  let uid = 1;
  const inst = (id: string) => {
    const rezzed = id.startsWith('+');
    const u = `i${uid++}`;
    return { uid: u, cardId: rezzed ? id.slice(1) : id, rezzed, advancements: spec.advancements?.[u] ?? 0, hostedCredits: 0 };
  };
  const rig = (spec.rig ?? []).map((id) => {
    const c = { ...inst(id), rezzed: false };
    return { ...c, hostedCredits: spec.hosted?.[c.uid] ?? 0 };
  });
  const ids = ['hq', 'rd', 'archives', ...Object.keys(spec.servers ?? {}).filter((k) => k.startsWith('remote'))];
  const servers = ids.map((id) => {
    const sv = spec.servers?.[id] ?? {};
    return { id: id as ServerId, ice: (sv.ice ?? []).map(inst), content: (sv.content ?? []).map(inst) };
  });
  const remoteNums = ids.filter((k) => k.startsWith('remote')).map((k) => Number(k.slice(6)));
  let s: GameState = { ...base, servers, rig, nextUid: uid, nextRemote: Math.max(0, ...remoteNums) + 1 };
  s = withPlayer(s, 'corp', {
    hand: [...(spec.corpHand ?? ['c01'])],
    deck: [...(spec.corpDeck ?? ['c01', 'c01', 'c01', 'c01'])],
    discard: (spec.archives ?? []).map((id) => ({ cardId: id.replace('+', ''), faceUp: id.startsWith('+') })),
    credits: spec.corpCredits ?? 5,
    scoreArea: [...(spec.corpScored ?? [])],
    installedThisTurn: [],
  });
  s = withPlayer(s, 'runner', {
    hand: [...(spec.runnerHand ?? ['r14'])],
    deck: [...(spec.runnerDeck ?? ['r14', 'r14'])],
    credits: spec.runnerCredits ?? 5,
    installedThisTurn: [],
  });
  return s;
}

/** Every Corp card on the board and in its zones (deck, hand, Archives, score area, set aside), sorted. */
export function corpCards(s: GameState): string[] {
  const c = s.players.corp;
  return [
    ...c.deck,
    ...c.hand,
    ...c.discard.map((d) => d.cardId),
    ...c.scoreArea,
    ...s.players.runner.scoreArea.filter((id) => id.startsWith('c')),
    ...s.servers.flatMap((sv) => [...sv.ice, ...sv.content].map((x) => x.cardId)),
    ...(s.choice?.looked ?? []),
  ].sort();
}

/** Applies `action`; returns the result (rejections included: check with `rejection`). */
export function step(s: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  const r = apply(s, action);
  return { state: r.state, events: [...r.events] };
}
