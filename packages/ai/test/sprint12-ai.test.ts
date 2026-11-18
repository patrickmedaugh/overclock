// Sprint 12 E6: the AI answers the two new choices from the view only — `look_install` (Accelerated Beta
// Test: every looked-at ICE onto the existing server with the fewest ICE, then Done) and `archives_pick`
// (Archived Memories: most agenda points, then the highest cost) — scores whenever offered, never stalls
// and never cheats over many seeded 45-card games.
import { apply, legalActions, newGame as engineNewGame, viewFor, waitingOn, type Action, type GameOptions, type GameState, type PlayerView, type ServerId, type Side } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/index';

const ABT = 'c23';
const AM = 'c24';

/** Hand-built boards use the 30-card 'core' fixture (Haas-Bioroid vs Kate) on the Corp's turn 1. */
const coreGame = (seed: number, options: Partial<GameOptions> = {}): GameState => engineNewGame(seed, { deckSet: 'core', ...options });

function prng(seed: number): (n: number) => number {
  let x = (seed * 2654435761) >>> 0 || 13;
  return (n) => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x % n;
  };
}

interface Board {
  /** Per server id: ICE (innermost first) and content card ids; prefix '+' = rezzed. */
  readonly servers: Readonly<Record<string, { ice?: readonly string[]; content?: readonly string[] }>>;
  readonly advancements?: Readonly<Record<string, number>>;
  readonly hand?: readonly string[];
  readonly deck?: readonly string[];
  /** Archives entries; prefix '+' = face up. */
  readonly archives?: readonly string[];
}

/** Corp turn 1 (3 clicks, 5 credits); installed uids i1, i2, … in server order (ICE, then content). */
function corpBoard(b: Board): GameState {
  const s = coreGame(12);
  let uid = 1;
  const inst = (id: string) => {
    const u = `i${uid++}`;
    return { uid: u, cardId: id.replace('+', ''), rezzed: id.startsWith('+'), advancements: b.advancements?.[u] ?? 0, hostedCredits: 0 };
  };
  const ids = ['hq', 'rd', 'archives', ...Object.keys(b.servers).filter((k) => k.startsWith('remote'))];
  const servers = ids.map((id) => ({ id: id as ServerId, ice: (b.servers[id]?.ice ?? []).map(inst), content: (b.servers[id]?.content ?? []).map(inst) }));
  const remotes = ids.filter((k) => k.startsWith('remote')).map((k) => Number(k.slice(6)));
  const corp = {
    ...s.players.corp,
    clicks: 3,
    credits: 5,
    hand: [...(b.hand ?? ['c01'])],
    deck: [...(b.deck ?? ['c01', 'c01', 'c01', 'c01'])],
    discard: (b.archives ?? []).map((id) => ({ cardId: id.replace('+', ''), faceUp: id.startsWith('+') })),
    installedThisTurn: [],
  };
  return { ...s, servers, nextUid: uid, nextRemote: Math.max(0, ...remotes) + 1, players: { ...s.players, corp } };
}

/** The AI's move for `side`: must be one of the view's legal actions and accepted by apply. */
function aiStep(s: GameState, side: Side = 'corp'): { action: Action; state: GameState } {
  const view = viewFor(side, s);
  const action = chooseAction(view);
  expect(action).not.toBeNull();
  expect(view.legalActions).toContainEqual(action);
  const r = apply(s, action!);
  expect(r.events.some((e) => e.type === 'action_rejected'), JSON.stringify(action)).toBe(false);
  return { action: action!, state: r.state };
}

const iceOf = (s: GameState, server: string) => s.servers.find((sv) => sv.id === server)?.ice.map((c) => c.cardId);

describe('Sprint 12: look_install (Accelerated Beta Test)', () => {
  /** ABT (3 counters) in remote1; HQ 1 ICE, R&D 2 ICE, Archives none, remote2 (PAD) none. */
  const ready = (deck: string[]) =>
    corpBoard({
      servers: { hq: { ice: ['+c05'] }, rd: { ice: ['+c05', '+c04'] }, remote1: { content: [ABT] }, remote2: { content: ['c03'] } },
      advancements: { i4: 3 },
      deck,
    });

  it('the AI scores the ready agenda, installs each looked-at ICE on the server with the fewest ICE, then Done', () => {
    let s = ready(['c04', 'c01', 'c06', 'c08']);
    let r = aiStep(s);
    expect(r.action).toEqual({ type: 'score', player: 'corp', uid: 'i4' });
    s = r.state;
    expect(s.choice?.kind).toBe('look_install');
    expect(viewFor('runner', s).choice!.looked).toEqual([null, null, null]);
    expect(chooseAction(viewFor('runner', s))).toBeNull();

    r = aiStep(s);
    expect(r.action).toEqual({ type: 'select', player: 'corp', card: 0, server: 'archives' });
    s = r.state;
    r = aiStep(s);
    // Looked now [c01, c06]: Enigma (index 1) to remote2 (0 ICE; HQ and Archives have 1, R&D 2).
    expect(r.action).toEqual({ type: 'select', player: 'corp', card: 1, server: 'remote2' });
    s = r.state;
    r = aiStep(s);
    expect(r.action).toEqual({ type: 'pass', player: 'corp' });
    s = r.state;

    expect(s.phase).toBe('action');
    expect(iceOf(s, 'archives')).toEqual(['c04']);
    expect(iceOf(s, 'remote2')).toEqual(['c06']);
    expect(s.servers.map((sv) => sv.id)).toEqual(['hq', 'rd', 'archives', 'remote2']);
    expect(s.players.corp.discard).toEqual([{ cardId: 'c01', faceUp: false }]);
    expect(s.players.corp.deck).toEqual(['c08']);
  });

  it('every server holding ICE: the tie goes to the first in server order (HQ), never a new empty remote', () => {
    let s = corpBoard({
      servers: { hq: { ice: ['+c05'] }, rd: { ice: ['+c05'] }, archives: { ice: ['+c05'] }, remote1: { content: [ABT] } },
      advancements: { i4: 3 },
      deck: ['c05', 'c06', 'c07'],
    });
    s = aiStep(s).state;
    const picks: Action[] = [];
    while (s.phase === 'choice') {
      const r = aiStep(s);
      picks.push(r.action);
      s = r.state;
    }
    expect(picks).toEqual([
      { type: 'select', player: 'corp', card: 0, server: 'hq' },
      { type: 'select', player: 'corp', card: 0, server: 'rd' },
      { type: 'select', player: 'corp', card: 0, server: 'archives' },
    ]);
    expect(s.servers.map((sv) => sv.id)).toEqual(['hq', 'rd', 'archives']);
    expect(s.players.corp.discard).toEqual([]);
  });

  it('no ICE among the looked-at cards: Done right away (the rest go to Archives face down)', () => {
    let s = aiStep(ready(['c01', 'c08', 'c03'])).state;
    expect(s.choice?.kind).toBe('look_install');
    const r = aiStep(s);
    expect(r.action).toEqual({ type: 'pass', player: 'corp' });
    s = r.state;
    expect(s.players.corp.discard.map((d) => d.faceUp)).toEqual([false, false, false]);
  });
});

describe('Sprint 12: archives_pick (Archived Memories)', () => {
  const play: Action = { type: 'play', player: 'corp', handIndex: 0 };

  it('most agenda points first (a face-down agenda the Corp sees), first offered on a tie', () => {
    // Hedge Fund (cost 5), Hostile Takeover (1 pt), Enigma, Private Security Force (2 pts), ABT (2 pts).
    let s = corpBoard({ servers: {}, hand: [AM], archives: ['+c01', 'c08', '+c06', 'c09', 'c23'] });
    s = apply(s, play).state;
    expect(s.choice?.kind).toBe('archives_pick');
    const r = aiStep(s);
    expect(r.action).toEqual({ type: 'select', player: 'corp', card: 3 });
    expect(r.state.players.corp.hand).toEqual(['c09']);
    expect(chooseAction(viewFor('runner', s))).toBeNull();
  });

  it('no agenda: the highest cost (Hedge Fund 5 over Enigma 3 and Ice Wall 1); never its own copy', () => {
    let s = corpBoard({ servers: {}, hand: [AM], archives: ['+c06', 'c05', '+c01'] });
    s = apply(s, play).state;
    const r = aiStep(s);
    expect(r.action).toEqual({ type: 'select', player: 'corp', card: 2 });
    expect(r.state.players.corp.hand).toEqual(['c01']);
    expect(r.state.players.corp.discard.map((d) => d.cardId)).toEqual(['c06', 'c05', AM]);
  });

  it('only one card offered: picks it', () => {
    let s = corpBoard({ servers: {}, hand: [AM], archives: ['c05'] });
    s = apply(s, play).state;
    expect(aiStep(s).action).toEqual({ type: 'select', player: 'corp', card: 0 });
  });
});

/** A copy of `s` with every card the viewer cannot see changed (opponent's hand and deck, own deck order). */
function scrambleHidden(s: GameState, viewer: Side, pick: (n: number) => number): GameState {
  const other: Side = viewer === 'corp' ? 'runner' : 'corp';
  const shuffle = <T>(xs: readonly T[]): T[] => {
    const out = xs.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = pick(i + 1);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  };
  const filler = other === 'corp' ? 'c01' : 'r14';
  const me = s.players[viewer];
  const them = s.players[other];
  const players = {
    ...s.players,
    [viewer]: { ...me, deck: shuffle(me.deck) },
    [other]: { ...them, hand: them.hand.map(() => filler), deck: them.deck.map(() => filler) },
  };
  return { ...s, players };
}

describe('Sprint 12: many seeded 45-card games (default decks)', () => {
  it('the AI always has a legal answer for the deciding seat, answers both new choices, and reads only the view', () => {
    const stats = { decisions: 0, looks: 0, abtSelects: 0, picks: 0, scrambled: 0 };
    for (let seed = 1; seed <= 150; seed++) {
      const pick = prng(seed);
      let s: GameState = engineNewGame(seed);
      expect(s.players.corp.deck.length + s.players.corp.hand.length).toBe(45);
      for (let step = 0; step < 500 && s.phase !== 'over'; step++) {
        const me = waitingOn(s)!;
        const view: PlayerView = viewFor(me, s);
        const ai = chooseAction(view);
        const where = `seed ${seed} step ${step}`;
        // Never stalls: a legal answer whenever the seat has one; null only when it has none.
        if (view.legalActions.length > 0) expect(ai, where).not.toBeNull();
        if (ai !== null) expect(view.legalActions, where).toContainEqual(ai);
        const otherSide: Side = me === 'corp' ? 'runner' : 'corp';
        expect(chooseAction(viewFor(otherSide, s)), `${where}: off seat`).toBeNull();
        // Never cheats: hidden cards changed, same view → same answer.
        if (step % 4 === 0) {
          const t = scrambleHidden(s, me, pick);
          const tv = viewFor(me, t);
          if (JSON.stringify(tv) === JSON.stringify(view)) {
            stats.scrambled++;
            expect(chooseAction(tv), where).toEqual(ai);
          }
        }
        stats.decisions++;
        // The AI answers every choice and every 3rd move; otherwise a random legal move, favouring cards.
        let action: Action;
        if (s.phase === 'choice' || step % 3 === 0) {
          action = ai!;
          if (s.choice?.kind === 'look_install') {
            stats.looks++;
            if (action.type === 'select') stats.abtSelects++;
          }
          if (s.choice?.kind === 'archives_pick') stats.picks++;
        } else {
          const legal = legalActions(s, me);
          const cards = legal.filter((a) => ['play', 'install', 'advance', 'score', 'rez'].includes(a.type));
          const list = cards.length > 0 && pick(3) > 0 ? cards : legal;
          action = list[pick(list.length)]!;
        }
        const r = apply(s, action);
        expect(r.events.some((e) => e.type === 'action_rejected'), `${where} ${JSON.stringify(action)}`).toBe(false);
        s = r.state;
      }
    }
    expect(stats.looks).toBeGreaterThan(0);
    expect(stats.abtSelects).toBeGreaterThan(0);
    expect(stats.picks).toBeGreaterThan(0);
    expect(stats.scrambled).toBeGreaterThan(100);
  }, 60_000); // ~3–6s; a long timeout so a busy CI runner cannot turn it red (architect, 2026-11-18). Assertions unchanged.

  it('AI against AI on the 45-card decks: every move legal until the game ends or 400 moves pass', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s: GameState = engineNewGame(seed);
      for (let step = 0; step < 400 && s.phase !== 'over'; step++) s = aiStep(s, waitingOn(s)!).state;
    }
  }, 60_000); // a long timeout for slow CI runners (architect, 2026-11-18)
});
