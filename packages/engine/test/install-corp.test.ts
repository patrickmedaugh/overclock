import { describe, expect, it } from 'vitest';
import { apply, newGame, replay, type Action, type GameState, type InstallTarget } from '../src/index';
import { clone, run, withClicks, withHand, withPlayer } from './helpers';

// c08 Hostile Takeover (agenda), c03 PAD Campaign (asset), c11 Experiential Data (upgrade),
// c04 Wall of Static / c05 Ice Wall / c06 Enigma (ICE), c01 Hedge Fund (operation).
const install = (handIndex: number, server?: InstallTarget): Action =>
  server === undefined ? { type: 'install', player: 'corp', handIndex } : { type: 'install', player: 'corp', handIndex, server };

/** Corp turn 1 with a chosen hand, 3 clicks, 5 credits. */
const corpWith = (hand: string[], credits = 5): GameState => withPlayer(withHand(newGame(11), 'corp', hand), 'corp', { credits });

function expectRejected(state: GameState, action: Action, reason: string): void {
  const before = clone(state);
  const r = apply(state, action);
  expect(r.events).toEqual([{ type: 'action_rejected', reason }]);
  expect(r.state).toBe(state);
  expect(state).toEqual(before);
}

describe('S-02-1 AC2: install into a new server', () => {
  it('creates Server 1 then Server 2; 1 click each, no credits; card face down in the root', () => {
    const s0 = corpWith(['c08', 'c03', 'c01']);
    const r1 = apply(s0, install(0, 'new'));
    expect(r1.events).toEqual([
      { type: 'server_created', serverId: 'remote-1', remote: 1 },
      { type: 'card_installed', player: 'corp', uid: 'i1', handIndex: 0, cardId: 'c08', server: 'remote-1', slot: 'root', index: 0 },
    ]);
    expect(r1.state.players.corp.clicks).toBe(2);
    expect(r1.state.players.corp.credits).toBe(5);
    expect(r1.state.players.corp.hand).toEqual(['c03', 'c01']);
    expect(r1.state.players.corp.servers.map((x) => x.id)).toEqual(['hq', 'rd', 'archives', 'remote-1']);
    expect(r1.state.players.corp.servers[3]).toEqual({ id: 'remote-1', ice: [], root: [{ uid: 'i1', cardId: 'c08', rezzed: false }] });

    const r2 = apply(r1.state, install(0, 'new'));
    expect(r2.events[0]).toEqual({ type: 'server_created', serverId: 'remote-2', remote: 2 });
    expect(r2.events[1]).toMatchObject({ type: 'card_installed', uid: 'i2', cardId: 'c03', server: 'remote-2', slot: 'root' });
    expect(r2.state.players.corp.clicks).toBe(1);
    expect(r2.state.players.corp.credits).toBe(5);
    expect(r2.state.nextRemote).toBe(3);
    expect(r2.state.nextUid).toBe(3);
  });

  it('upgrades also go into a new server for 0 credits', () => {
    const r = run(corpWith(['c11']), [install(0, 'new')]);
    expect(r.state.players.corp.servers[3]?.root).toEqual([{ uid: 'i1', cardId: 'c11', rezzed: false }]);
    expect(r.state.players.corp.credits).toBe(5);
  });
});

describe('S-02-1 AC3: one agenda/asset per remote; upgrades anywhere', () => {
  const withRemote = () => run(corpWith(['c08', 'c03', 'c11', 'c11', 'c11', 'c08']), [install(0, 'new')]).state;

  it('a second agenda or asset in the same remote is slot_taken', () => {
    const s = withRemote(); // hand: c03 c11 c11 c11 c08
    expectRejected(s, install(0, 'remote-1'), 'slot_taken');
    expectRejected(s, install(4, 'remote-1'), 'slot_taken');
  });

  it('agendas and assets cannot go into HQ, R&D or Archives (bad_target)', () => {
    const s = corpWith(['c08', 'c03']);
    for (const server of ['hq', 'rd', 'archives'] as const) {
      expectRejected(s, install(0, server), 'bad_target');
      expectRejected(s, install(1, server), 'bad_target');
    }
  });

  it('upgrades go into any server: a remote with an agenda, and each central', () => {
    let s = withRemote();
    s = run(s, [install(1, 'remote-1')]).state; // c11 next to the agenda
    expect(s.players.corp.servers[3]?.root.map((c) => c.cardId)).toEqual(['c08', 'c11']);
    s = withClicks(s, 'corp', 3);
    const r = run(s, [install(1, 'hq'), install(1, 'rd')]);
    const [hq, rd] = r.state.players.corp.servers;
    expect(hq?.root.map((c) => c.cardId)).toEqual(['c11']);
    expect(rd?.root.map((c) => c.cardId)).toEqual(['c11']);
    const arch = run(withClicks(withHand(r.state, 'corp', ['c11', 'c11']), 'corp', 2), [install(0, 'archives'), install(0, 'archives')]);
    expect(arch.state.players.corp.servers[2]?.root.map((c) => c.cardId)).toEqual(['c11', 'c11']);
    expect(arch.events.filter((e) => e.type === 'card_installed').map((e) => 'index' in e && e.index)).toEqual([0, 1]);
  });
});

describe('S-02-2: ICE in front of a server', () => {
  it('AC2/AC3: first ICE is free, then 1 credit per ICE already there; the new one is outermost', () => {
    const s0 = corpWith(['c05', 'c04', 'c06']);
    const r = apply(s0, install(0, 'hq'));
    expect(r.events).toEqual([
      { type: 'card_installed', player: 'corp', uid: 'i1', handIndex: 0, cardId: 'c05', server: 'hq', slot: 'ice', index: 0 },
    ]);
    expect(r.state.players.corp.credits).toBe(5);

    const r2 = apply(r.state, install(0, 'hq'));
    expect(r2.events).toEqual([
      { type: 'credits_spent', player: 'corp', amount: 1 },
      { type: 'card_installed', player: 'corp', uid: 'i2', handIndex: 0, cardId: 'c04', server: 'hq', slot: 'ice', index: 1 },
    ]);
    expect(r2.state.players.corp.credits).toBe(4);

    const r3 = apply(r2.state, install(0, 'hq'));
    expect(r3.events[0]).toEqual({ type: 'credits_spent', player: 'corp', amount: 2 });
    expect(r3.state.players.corp.credits).toBe(2);
    expect(r3.state.players.corp.clicks).toBe(0);
    // index 0 innermost ... last outermost.
    expect(r3.state.players.corp.servers[0]?.ice.map((c) => c.cardId)).toEqual(['c05', 'c04', 'c06']);
    expect(r3.state.players.corp.servers[0]?.root).toEqual([]);
  });

  it('AC1: ICE can go in front of every central, a remote, or a new server (0 credits)', () => {
    let s = run(corpWith(['c08', 'c05', 'c05', 'c05', 'c05', 'c05']), [install(0, 'new')]).state;
    s = withClicks(s, 'corp', 5);
    const r = run(s, [install(0, 'hq'), install(0, 'rd'), install(0, 'archives'), install(0, 'remote-1'), install(0, 'new')]);
    expect(r.state.players.corp.servers.map((x) => [x.id, x.ice.length])).toEqual([
      ['hq', 1],
      ['rd', 1],
      ['archives', 1],
      ['remote-1', 1],
      ['remote-2', 1],
    ]);
    expect(r.state.players.corp.credits).toBe(5);
    expect(r.events.some((e) => e.type === 'credits_spent')).toBe(false);
  });

  it('ICE and an agenda share a remote (ICE does not take the root slot)', () => {
    const s = run(corpWith(['c05', 'c08']), [install(0, 'new'), install(0, 'remote-1')]).state;
    expect(s.players.corp.servers[3]).toMatchObject({ ice: [{ cardId: 'c05' }], root: [{ cardId: 'c08' }] });
  });

  it('AC4: can not afford the price -> no_credits, nothing changes', () => {
    let s = run(corpWith(['c05', 'c05', 'c05']), [install(0, 'rd'), install(0, 'rd')]).state; // 1 spent
    s = withPlayer(s, 'corp', { credits: 1, clicks: 3 });
    expectRejected(s, install(0, 'rd'), 'no_credits'); // costs 2
  });
});

describe('install validation (Corp)', () => {
  it('bad_card: operation, or hand index out of range', () => {
    const s = corpWith(['c01', 'c08']);
    expectRejected(s, install(0, 'new'), 'bad_card');
    expectRejected(s, install(2, 'new'), 'bad_card');
    expectRejected(s, install(-1, 'new'), 'bad_card');
  });

  it('bad_target: no server, or an unknown one', () => {
    const s = corpWith(['c08', 'c05']);
    expectRejected(s, install(0), 'bad_target');
    expectRejected(s, install(1), 'bad_target');
    expectRejected(s, install(1, 'remote-1'), 'bad_target');
    expectRejected(s, install(1, 'nowhere' as InstallTarget), 'bad_target');
    expectRejected(s, install(1, '__proto__' as InstallTarget), 'bad_target');
  });

  it('invalid_action: handIndex not an integer, server not a string', () => {
    const s = corpWith(['c08']);
    for (const bad of [
      { type: 'install', player: 'corp', server: 'new' },
      { type: 'install', player: 'corp', handIndex: 0.5, server: 'new' },
      { type: 'install', player: 'corp', handIndex: '0', server: 'new' },
      { type: 'install', player: 'corp', handIndex: 0, server: 3 },
      { type: 'install', player: 'corp', handIndex: 0, server: null },
    ]) {
      expectRejected(s, bad as unknown as Action, 'invalid_action');
    }
  });

  it('precedence: not_your_turn, wrong_phase, no_clicks come before card checks', () => {
    const s = corpWith(['c01']);
    expectRejected(s, { type: 'install', player: 'runner', handIndex: 9 }, 'not_your_turn');
    expectRejected(withClicks(s, 'corp', 0), install(9, 'nowhere' as InstallTarget), 'no_clicks');
    const discardStep = run(corpWith(['c08', 'c08', 'c08', 'c08', 'c08', 'c08']), [{ type: 'end_turn', player: 'corp' }]).state;
    expectRejected(discardStep, install(0, 'new'), 'wrong_phase');
    expectRejected({ ...s, phase: 'over' }, install(0, 'new'), 'game_over');
  });

  it('bad_target beats slot_taken beats no_credits', () => {
    const s = withPlayer(run(corpWith(['c08', 'c03']), [install(0, 'new')]).state, 'corp', { credits: 0 });
    expectRejected(s, install(0, 'hq'), 'bad_target');
    expectRejected(s, install(0, 'remote-1'), 'slot_taken');
  });

  it('is deterministic and replayable from (seed, actions)', () => {
    const actions: Action[] = [install(0, 'new'), install(0, 'hq'), install(0, 'new')];
    const a = replay(5, actions);
    const b = replay(5, actions);
    expect(a).toEqual(b);
    expect(a.events.filter((e) => e.type === 'action_rejected').length).toBeLessThan(3);
    expect(JSON.parse(JSON.stringify(a.state))).toEqual(a.state);
  });
});
