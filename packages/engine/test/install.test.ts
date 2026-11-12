// S-02-1 (Corp installs into servers), S-02-2 (ICE), S-02-3 (Runner rig and memory).
import { describe, expect, it } from 'vitest';
import { apply, newGame, viewFor, type GameState } from '../src/index';
import { clone, finishTurn, install, rejection, run, withCredits, withHand, withRig } from './helpers';

/** Corp turn 1 with a known hand. 3 clicks, 5 credits. */
function corp(hand: string[], credits = 5): GameState {
  return withCredits(withHand(newGame(11), 'corp', hand), 'corp', credits);
}

/** Runner turn 2 with a known hand. 4 clicks. */
function runner(hand: string[], credits = 5): GameState {
  return withCredits(withHand(finishTurn(newGame(11)).state, 'runner', hand), 'runner', credits);
}

/** Gives the Corp `n` more clicks and starts its next install from there (setup only). */
function moreClicks(s: GameState, n: number): GameState {
  return { ...s, players: { ...s.players, corp: { ...s.players.corp, clicks: n } } };
}

const server = (s: GameState, id: string) => s.servers.find((x) => x.id === id);

describe('S-02-1: Corp installs agendas, assets and upgrades', () => {
  it('new game: three central servers, no remotes, empty rig, uid/remote counters at 1', () => {
    const g = newGame(1);
    expect(g.servers).toEqual([
      { id: 'hq', ice: [], content: [] },
      { id: 'rd', ice: [], content: [] },
      { id: 'archives', ice: [], content: [] },
    ]);
    expect(g.rig).toEqual([]);
    expect(g.nextUid).toBe(1);
    expect(g.nextRemote).toBe(1);
  });

  it('AC2: an agenda into a new server opens remote1 ("Server 1"), face down, 1 click, no credits', () => {
    const s = corp(['c08', 'c03']);
    const { state, events } = apply(s, install('corp', 0, 'new'));
    expect(events).toEqual([
      { type: 'server_created', server: 'remote1' },
      { type: 'card_installed', player: 'corp', uid: 'i1', zone: 'content', server: 'remote1', handIndex: 0, cardId: 'c08' },
    ]);
    expect(server(state, 'remote1')).toEqual({ id: 'remote1', ice: [], content: [{ uid: 'i1', cardId: 'c08', rezzed: false }] });
    expect(state.players.corp).toMatchObject({ clicks: 2, credits: 5, hand: ['c03'] });
    expect(state).toMatchObject({ nextUid: 2, nextRemote: 2 });
  });

  it('AC2: the next new server is remote2 ("Server 2"); servers keep creation order after the centrals', () => {
    const s = run(corp(['c08', 'c03']), [install('corp', 0, 'new'), install('corp', 0, 'new')]).state;
    expect(s.servers.map((x) => x.id)).toEqual(['hq', 'rd', 'archives', 'remote1', 'remote2']);
    expect(server(s, 'remote2')?.content).toEqual([{ uid: 'i2', cardId: 'c03', rezzed: false }]);
  });

  it('AC3: one agenda or asset per remote; an upgrade can join it', () => {
    let s = run(corp(['c08', 'c03', 'c11', 'c09']), [install('corp', 0, 'new')]).state; // Hostile Takeover in remote1
    // PAD Campaign (asset) and Private Security Force (agenda) may not join it...
    for (const handIndex of [0, 2]) {
      const before = clone(s);
      const r = apply(s, install('corp', handIndex, 'remote1'));
      expect(rejection(r.events)).toBe('bad_target');
      expect(r.state).toBe(s);
      expect(s).toEqual(before);
    }
    // ...but Experiential Data (upgrade) may.
    s = run(s, [install('corp', 1, 'remote1')]).state;
    expect(server(s, 'remote1')?.content.map((c) => c.cardId)).toEqual(['c08', 'c11']);
  });

  it('AC3: an upgrade can go into HQ, R&D or Archives; agendas and assets cannot', () => {
    for (const central of ['hq', 'rd', 'archives'] as const) {
      const r = run(corp(['c11']), [install('corp', 0, central)]);
      expect(server(r.state, central)?.content).toEqual([{ uid: 'i1', cardId: 'c11', rezzed: false }]);
      expect(r.events).toEqual([
        { type: 'card_installed', player: 'corp', uid: 'i1', zone: 'content', server: central, handIndex: 0, cardId: 'c11' },
      ]);
      expect(rejection(apply(corp(['c08']), install('corp', 0, central)).events)).toBe('bad_target');
      expect(rejection(apply(corp(['c03']), install('corp', 0, central)).events)).toBe('bad_target');
    }
  });

  it('a Corp install needs a known server: missing, unknown, or unopened remotes are bad_target', () => {
    const s = corp(['c11']);
    expect(rejection(apply(s, { type: 'install', player: 'corp', handIndex: 0 }).events)).toBe('bad_target');
    expect(rejection(apply(s, install('corp', 0, 'remote1')).events)).toBe('bad_target');
    expect(rejection(apply(s, { type: 'install', player: 'corp', handIndex: 0, server: 'nowhere' } as never).events)).toBe(
      'bad_target',
    );
  });
});

describe('S-02-2: Corp ICE', () => {
  it('AC2/AC3: ICE costs 0, then 1, then 2 on the same server; each new ICE goes on the outside', () => {
    let s = moreClicks(corp(['c05', 'c04', 'c06'], 5), 3);
    const first = apply(s, install('corp', 0, 'hq'));
    expect(first.events).toEqual([
      { type: 'card_installed', player: 'corp', uid: 'i1', zone: 'ice', server: 'hq', handIndex: 0, cardId: 'c05' },
    ]);
    s = first.state;
    expect(s.players.corp.credits).toBe(5);

    const second = apply(s, install('corp', 0, 'hq'));
    expect(second.events).toEqual([
      { type: 'credits_spent', player: 'corp', amount: 1 },
      { type: 'card_installed', player: 'corp', uid: 'i2', zone: 'ice', server: 'hq', handIndex: 0, cardId: 'c04' },
    ]);
    s = second.state;
    expect(s.players.corp.credits).toBe(4);

    const third = apply(s, install('corp', 0, 'hq'));
    expect(third.events[0]).toEqual({ type: 'credits_spent', player: 'corp', amount: 2 });
    s = third.state;
    expect(s.players.corp).toMatchObject({ credits: 2, clicks: 0 });
    // index 0 innermost, last = outermost
    expect(server(s, 'hq')?.ice.map((c) => c.cardId)).toEqual(['c05', 'c04', 'c06']);
  });

  it('ICE on a new server is free and opens the server; ICE prices are per server', () => {
    let s = moreClicks(corp(['c05', 'c04', 'c06'], 0), 3);
    s = run(s, [install('corp', 0, 'new'), install('corp', 0, 'rd')]).state;
    expect(server(s, 'remote1')?.ice.map((c) => c.cardId)).toEqual(['c05']);
    expect(server(s, 'rd')?.ice.map((c) => c.cardId)).toEqual(['c04']);
    expect(s.players.corp.credits).toBe(0);
    // A second ICE on remote1 costs 1: with 0 credits it is refused.
    const r = apply(s, install('corp', 0, 'remote1'));
    expect(rejection(r.events)).toBe('no_credits');
    expect(r.state).toBe(s);
  });

  it('AC4: cannot afford the price -> no_credits, nothing changes', () => {
    const s0 = run(moreClicks(corp(['c05', 'c04', 'c06'], 5), 3), [install('corp', 0, 'hq'), install('corp', 0, 'hq')]).state;
    const s = withCredits(s0, 'corp', 1); // price is now 2
    const before = clone(s);
    const r = apply(s, install('corp', 0, 'hq'));
    expect(r.events).toEqual([{ type: 'action_rejected', reason: 'no_credits' }]);
    expect(s).toEqual(before);
  });

  it('ICE and agendas/assets/upgrades can share a remote (ICE in front, cards inside)', () => {
    const s = run(moreClicks(corp(['c08', 'c05', 'c11']), 3), [
      install('corp', 0, 'new'),
      install('corp', 0, 'remote1'),
      install('corp', 0, 'remote1'),
    ]).state;
    expect(server(s, 'remote1')).toEqual({
      id: 'remote1',
      ice: [{ uid: 'i2', cardId: 'c05', rezzed: false }],
      content: [
        { uid: 'i1', cardId: 'c08', rezzed: false },
        { uid: 'i3', cardId: 'c11', rezzed: false },
      ],
    });
  });
});

describe('S-02-3: Runner installs into the rig', () => {
  it('AC2: pays the cost and 1 click; the card is face up in the rig', () => {
    const s = runner(['r06', 'r01']);
    const { state, events } = apply(s, install('runner', 0));
    expect(events).toEqual([
      { type: 'credits_spent', player: 'runner', amount: 4 },
      { type: 'card_installed', player: 'runner', uid: 'i1', zone: 'rig', handIndex: 0, cardId: 'r06' },
    ]);
    expect(state.rig).toEqual([{ uid: 'i1', cardId: 'r06', rezzed: false }]);
    expect(state.players.runner).toMatchObject({ credits: 1, clicks: 3, hand: ['r01'] });
    expect(viewFor('corp', state).rig).toEqual([{ uid: 'i1', cardId: 'r06', faceUp: true }]);
    expect(viewFor('runner', state).rig).toEqual([{ uid: 'i1', cardId: 'r06', faceUp: true }]);
  });

  it('credits_spent carries the card cost (Akamatsu Mem Chip: 1)', () => {
    const { state, events } = apply(runner(['r09']), install('runner', 0));
    expect(events[0]).toEqual({ type: 'credits_spent', player: 'runner', amount: 1 });
    expect(state.players.runner.credits).toBe(4);
  });

  it('AC3: not enough credits -> no_credits, nothing changes', () => {
    const s = runner(['r12'], 4); // Magnum Opus costs 5
    const before = clone(s);
    const r = apply(s, install('runner', 0));
    expect(r.events).toEqual([{ type: 'action_rejected', reason: 'no_credits' }]);
    expect(s).toEqual(before);
  });

  it('AC4/AC5: programs use memory; 4 is the limit; hardware and resources need none', () => {
    // Corroder (1), Gordian Blade (1), Magnum Opus (2) = 4/4.
    let s = runner(['r04', 'r05', 'r12', 'r06', 'r09', 'r02'], 20);
    s = run(s, [install('runner', 0), install('runner', 0), install('runner', 0)]).state;
    expect(viewFor('runner', s).memory).toEqual({ used: 4, limit: 4 });
    expect(viewFor('corp', s).memory).toEqual({ used: 4, limit: 4 });
    // Ninja (1) does not fit.
    const before = clone(s);
    const r = apply(s, install('runner', 0));
    expect(r.events).toEqual([{ type: 'action_rejected', reason: 'no_memory' }]);
    expect(s).toEqual(before);
    // Hardware still installs.
    s = run(s, [install('runner', 1)]).state;
    expect(s.rig.map((c) => c.cardId)).toEqual(['r04', 'r05', 'r12', 'r09']);
    expect(viewFor('runner', s).memory).toEqual({ used: 4, limit: 4 });
  });

  it('memory limit is exact: 3 used + a 2-memory program is refused, + a 1-memory program fits', () => {
    const s = withRig(runner(['r12', 'r06'], 20), ['r04', 'r05', 'r04']);
    expect(rejection(apply(s, install('runner', 0)).events)).toBe('no_memory');
    expect(rejection(apply(s, install('runner', 1)).events)).toBeNull();
  });

  it('a Runner install may not name a server (bad_target); events and operations are bad_card', () => {
    const s = runner(['r06', 'r01']);
    expect(rejection(apply(s, install('runner', 0, 'hq')).events)).toBe('bad_target');
    expect(rejection(apply(s, install('runner', 0, 'new')).events)).toBe('bad_target');
    expect(rejection(apply(s, install('runner', 1)).events)).toBe('bad_card');
    expect(rejection(apply(s, install('runner', 2)).events)).toBe('bad_card');
    expect(rejection(apply(s, install('runner', -1)).events)).toBe('bad_card');
  });

  it('uids are unique across both sides and keep counting', () => {
    let s = corp(['c08', 'c05']);
    s = run(s, [install('corp', 0, 'new'), install('corp', 0, 'hq')]).state;
    s = finishTurn(s).state;
    s = run(withCredits(withHand(s, 'runner', ['r09', 'r04']), 'runner', 9), [install('runner', 0), install('runner', 0)]).state;
    const uids = [...s.servers.flatMap((x) => [...x.ice, ...x.content]), ...s.rig].map((c) => c.uid);
    expect(uids.sort()).toEqual(['i1', 'i2', 'i3', 'i4']);
  });
});
