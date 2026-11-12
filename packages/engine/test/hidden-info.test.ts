// S-02-1 AC6 / S-02-2 AC5: installed Corp cards are hidden from the Runner.
// The Runner's projection (view and events) must never name a face-down Corp card.
import { describe, expect, it } from 'vitest';
import {
  apply,
  legalActions,
  newGame,
  viewEvents,
  viewFor,
  type Action,
  type GameEvent,
  type GameState,
  type Side,
} from '../src/index';
import { finishTurn, install, play, run, withCredits, withHand } from './helpers';

describe('viewFor: servers and rig', () => {
  const setup = () =>
    run(withCredits(withHand(newGame(61), 'corp', ['c08', 'c05', 'c11']), 'corp', 5), [
      install('corp', 0, 'new'),
      install('corp', 0, 'remote1'),
      install('corp', 0, 'hq'),
    ]).state;

  it('the Corp sees its own installed cards (face down, but with ids)', () => {
    const v = viewFor('corp', setup());
    expect(v.corpServers).toEqual([
      { id: 'hq', ice: [], content: [{ uid: 'i3', cardId: 'c11', faceUp: false }] },
      { id: 'rd', ice: [], content: [] },
      { id: 'archives', ice: [], content: [] },
      {
        id: 'remote1',
        ice: [{ uid: 'i2', cardId: 'c05', faceUp: false }],
        content: [{ uid: 'i1', cardId: 'c08', faceUp: false }],
      },
    ]);
  });

  it('S-02-1 AC6 / S-02-2 AC5: the Runner sees how many and where, only as backs (cardId null)', () => {
    const v = viewFor('runner', setup());
    expect(v.corpServers).toEqual([
      { id: 'hq', ice: [], content: [{ uid: 'i3', cardId: null, faceUp: false }] },
      { id: 'rd', ice: [], content: [] },
      { id: 'archives', ice: [], content: [] },
      {
        id: 'remote1',
        ice: [{ uid: 'i2', cardId: null, faceUp: false }],
        content: [{ uid: 'i1', cardId: null, faceUp: false }],
      },
    ]);
    expect(JSON.stringify(v)).not.toMatch(/"c\d\d"/);
  });

  it('view arrays are copies (mutating a view cannot change state)', () => {
    const s = setup();
    const v = viewFor('corp', s);
    (v.corpServers as unknown[]).pop();
    (v.corpServers[0]?.content as unknown[]).pop();
    expect(s.servers).toHaveLength(4);
    expect(s.servers[0]?.content).toHaveLength(1);
  });
});

describe('viewEvents: installs and plays', () => {
  it('Corp install: the Runner gets uid, zone and server, but no cardId or handIndex', () => {
    const s = withHand(newGame(61), 'corp', ['c08']);
    const { events } = apply(s, install('corp', 0, 'new'));
    expect(viewEvents('corp', events)).toEqual(events);
    expect(viewEvents('runner', events)).toEqual([
      { type: 'server_created', server: 'remote1' },
      { type: 'card_installed', player: 'corp', uid: 'i1', zone: 'content', server: 'remote1' },
    ]);
  });

  it('Runner install: the Corp gets the card (face up) but not the hand index', () => {
    const s = withHand(finishTurn(newGame(61)).state, 'runner', ['r09']);
    const { events } = apply(s, install('runner', 0));
    expect(viewEvents('corp', events)).toEqual([
      { type: 'credits_spent', player: 'runner', amount: 1 },
      { type: 'card_installed', player: 'runner', uid: 'i1', zone: 'rig', cardId: 'r09' },
    ]);
  });

  it('card_played loses only the hand index for the opponent', () => {
    const s = withHand(newGame(61), 'corp', ['c02']);
    const { events } = apply(s, play('corp', 0));
    expect(viewEvents('runner', events)[0]).toEqual({ type: 'card_played', player: 'corp', cardId: 'c02' });
  });
});

// ---- property test ----------------------------------------------------------

/** Small deterministic PRNG for picking actions (independent of the engine's). */
function picker(seed: number): (n: number) => number {
  let x = seed >>> 0;
  return (n) => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x % n;
  };
}

/** Corp card ids the Runner may know right now: face-up cards in Archives. */
function corpIdsVisibleToRunner(s: GameState): Set<string> {
  return new Set(s.players.corp.discard.filter((e) => e.faceUp).map((e) => e.cardId));
}

/** Every Corp card id ("c01".."c12") mentioned anywhere in a JSON value. */
function corpIdsIn(value: unknown): string[] {
  return JSON.stringify(value).match(/"c\d\d"/g)?.map((m) => m.slice(1, -1)) ?? [];
}

/** Picks a random legal action, preferring installs/plays so boards fill up. */
function randomAction(s: GameState, pick: (n: number) => number): Action {
  const me = s.activePlayer;
  const legal = legalActions(s, me);
  const cardActions = legal.filter((a) => a.type === 'install' || a.type === 'play');
  const pool = cardActions.length > 0 && pick(3) > 0 ? cardActions : legal;
  const a = pool[pick(pool.length)] as Action;
  if (a.type !== 'discard') return a;
  const n = s.players[me].hand.length - 5;
  const idx = s.players[me].hand.map((_, i) => i);
  const chosen: number[] = [];
  while (chosen.length < n) chosen.push(idx.splice(pick(idx.length), 1)[0] as number);
  return { type: 'discard', player: me, handIndices: chosen };
}

describe('property: the Runner never receives a face-down Corp card id', () => {
  it('over 150 random games of legal actions (installs, plays, discards), view and events stay clean', () => {
    let installsByCorp = 0;
    let playsByCorp = 0;
    let faceDownArchives = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const pick = picker(seed * 104729 + 7);
      let s = newGame(seed);
      for (let step = 0; step < 400 && s.phase !== 'over'; step++) {
        const a = randomAction(s, pick);
        const r = apply(s, a);
        expect(r.events.some((e) => e.type === 'action_rejected'), JSON.stringify(a)).toBe(false);
        s = r.state;
        if (a.type === 'install' && a.player === 'corp') installsByCorp++;
        if (a.type === 'play' && a.player === 'corp') playsByCorp++;

        const allowed = corpIdsVisibleToRunner(s);
        const view = viewFor('runner', s);
        const events: GameEvent[] = viewEvents('runner', r.events);
        for (const id of [...corpIdsIn(view), ...corpIdsIn(events)]) {
          expect(allowed.has(id), `seed ${seed} step ${step}: Runner saw ${id}`).toBe(true);
        }
        // Structural checks, independent of the regex.
        expect(view.players.corp.hand).toBeNull();
        for (const sv of view.corpServers) for (const c of [...sv.ice, ...sv.content]) expect(c.cardId).toBeNull();
        s.players.corp.discard.forEach((e, i) => expect(view.players.corp.discard[i]).toBe(e.faceUp ? e.cardId : null));
        for (const e of events) {
          if (e.type === 'card_installed' && e.player === 'corp') expect(e).not.toHaveProperty('cardId');
          if (e.type === 'card_drawn' && e.player === 'corp') expect(e).not.toHaveProperty('cardId');
          if (e.type === 'cards_discarded' && e.player === 'corp') expect(e).not.toHaveProperty('cardIds');
        }
        faceDownArchives += s.players.corp.discard.filter((e) => !e.faceUp).length > 0 ? 1 : 0;
      }
    }
    // The property was really exercised.
    expect(installsByCorp).toBeGreaterThan(300);
    expect(playsByCorp).toBeGreaterThan(50);
    expect(faceDownArchives).toBeGreaterThan(100);
  });

  it('the Corp also never sees the Runner hand (sanity: projection is symmetric where it should be)', () => {
    const pick = picker(99);
    let s = newGame(99);
    for (let step = 0; step < 200 && s.phase !== 'over'; step++) {
      s = apply(s, randomAction(s, pick)).state;
      const v = viewFor('corp' as Side, s);
      expect(v.players.runner.hand).toBeNull();
      expect(v.handOptions).toHaveLength(s.players.corp.hand.length);
    }
  });
});
