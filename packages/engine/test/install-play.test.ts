// Sprint 2 E3: install and play (S-02-1..S-02-4 engine side).
import { describe, expect, it } from 'vitest';
import {
  apply,
  legalActions,
  newGame,
  replay,
  viewEvents,
  waitingOn,
  viewFor,
  type Action,
  type GameState,
  type RejectReason,
  type ServerId,
  type Side,
} from '../src/index';
import { clone, finishTurn, rejection, run, withHand, withPlayer } from './helpers';
import { expectRunnerEventsClean, expectRunnerViewClean } from './hidden';

const install = (player: Side, handIndex: number, server?: ServerId | 'new'): Action =>
  server === undefined ? { type: 'install', player, handIndex } : { type: 'install', player, handIndex, server };
const play = (player: Side, handIndex: number): Action => ({ type: 'play', player, handIndex });

/** Corp turn 1 with a chosen hand, 3 clicks, `credits` credits. */
function corpWith(hand: string[], credits = 5): GameState {
  return withPlayer(withHand(newGame(11), 'corp', hand), 'corp', { credits });
}

/** Runner turn 2 with a chosen hand, 4 clicks, `credits` credits. */
function runnerWith(hand: string[], credits = 5): GameState {
  return withPlayer(withHand(finishTurn(newGame(11)).state, 'runner', hand), 'runner', { credits });
}

function expectRejected(state: GameState, action: Action, reason: RejectReason): void {
  const snapshot = clone(state);
  const r = apply(state, action);
  expect(r.events).toEqual([{ type: 'action_rejected', reason }]);
  expect(r.state).toBe(state);
  expect(state).toEqual(snapshot);
  if (reason !== 'invalid_action') expect(legalActions(state, action.player)).not.toContainEqual(action);
}

const server = (s: GameState, id: string) => s.servers.find((sv) => sv.id === id)!;

describe('install: every rejection reason, state unchanged', () => {
  const discardStep = () => run(corpWith(['c08', 'c08', 'c08', 'c08', 'c08', 'c08']), [{ type: 'end_turn', player: 'corp' }]).state;
  const cases: [RejectReason, () => { state: GameState; action: Action }][] = [
    ['invalid_action', () => ({ state: corpWith(['c08']), action: { type: 'install', player: 'corp', handIndex: 0.5, server: 'new' } as Action })],
    ['game_over', () => ({ state: { ...corpWith(['c08']), phase: 'over' as const, result: { winner: 'runner' as const, reason: 'corp_decked' as const } }, action: install('corp', 0, 'new') })],
    ['not_your_turn', () => ({ state: corpWith(['c08']), action: install('runner', 0) })],
    ['wrong_phase', () => ({ state: discardStep(), action: install('corp', 0, 'new') })],
    ['no_clicks', () => ({ state: withPlayer(corpWith(['c08']), 'corp', { clicks: 0 }), action: install('corp', 0, 'new') })],
    ['bad_card', () => ({ state: corpWith(['c08']), action: install('corp', 3, 'new') })],
    ['bad_card', () => ({ state: corpWith(['c01']), action: install('corp', 0, 'new') })], // an operation cannot be installed
    ['bad_target', () => ({ state: corpWith(['c08']), action: install('corp', 0, 'hq') })], // agenda into a central
    ['bad_target', () => ({ state: corpWith(['c08']), action: install('corp', 0) })], // Corp must name a server
    ['bad_target', () => ({ state: corpWith(['c04']), action: install('corp', 0, 'remote9') })], // unknown server
    ['bad_target', () => ({ state: runnerWith(['r04']), action: install('runner', 0, 'new') })], // Runner names no server
    ['no_credits', () => ({ state: runnerWith(['r05'], 3), action: install('runner', 0) })],
    ['no_memory', () => {
      const s = run(runnerWith(['r04', 'r04', 'r04', 'r04', 'r06'], 20), [0, 0, 0, 0].map(() => install('runner', 0))).state;
      return { state: withPlayer(s, 'runner', { clicks: 1 }), action: install('runner', 0) };
    }],
  ];
  it.each(cases)('%s', (reason, make) => {
    const { state, action } = make();
    expectRejected(state, action, reason);
  });

  it('invalid_action for a non-string server or missing handIndex (never throws)', () => {
    const s = corpWith(['c08']);
    for (const bad of [
      { type: 'install', player: 'corp', handIndex: 0, server: 3 },
      { type: 'install', player: 'corp', server: 'new' },
      { type: 'play', player: 'corp' },
      { type: 'play', player: 'corp', handIndex: '0' },
    ]) {
      expect(apply(s, bad as unknown as Action).events).toEqual([{ type: 'action_rejected', reason: 'invalid_action' }]);
    }
  });

  it('precedence: no_credits beats no_memory', () => {
    const s = run(runnerWith(['r04', 'r04', 'r04', 'r04', 'r06'], 8), [0, 0, 0, 0].map(() => install('runner', 0))).state;
    expect(s.players.runner.credits).toBe(0);
    expect(rejection(apply(withPlayer(s, 'runner', { clicks: 1 }), install('runner', 0)).events)).toBe('no_credits');
  });

  it('precedence: bad_card beats bad_target; no_clicks beats bad_card', () => {
    expect(rejection(apply(corpWith(['c01']), install('corp', 0, 'remote7')).events)).toBe('bad_card');
    expect(rejection(apply(withPlayer(corpWith(['c01']), 'corp', { clicks: 0 }), install('corp', 0, 'new')).events)).toBe('no_clicks');
  });
});

describe('play: every rejection reason, state unchanged', () => {
  const cases: [RejectReason, () => { state: GameState; action: Action }][] = [
    ['invalid_action', () => ({ state: corpWith(['c01']), action: { type: 'play', player: 'corp', handIndex: -0.5 } as Action })],
    ['game_over', () => ({ state: { ...corpWith(['c01']), phase: 'over' as const, result: { winner: 'runner' as const, reason: 'corp_decked' as const } }, action: play('corp', 0) })],
    ['not_your_turn', () => ({ state: corpWith(['c01']), action: play('runner', 0) })],
    ['wrong_phase', () => ({ state: run(corpWith(['c01', 'c01', 'c01', 'c01', 'c01', 'c01']), [{ type: 'end_turn', player: 'corp' }]).state, action: play('corp', 0) })],
    ['no_clicks', () => ({ state: withPlayer(corpWith(['c01']), 'corp', { clicks: 0 }), action: play('corp', 0) })],
    ['bad_card', () => ({ state: corpWith(['c01']), action: play('corp', 1) })],
    ['bad_card', () => ({ state: corpWith(['c04']), action: play('corp', 0) })], // ICE cannot be played
    ['bad_card', () => ({ state: runnerWith(['r04']), action: play('runner', 0) })], // a program cannot be played
    ['bad_target', () => ({ state: runnerWith(['r11']), action: play('runner', 0) })], // Inside Job: must name a server
    ['bad_target', () => ({ state: runnerWith(['r11']), action: { type: 'play', player: 'runner', handIndex: 0, server: 'remote5' } })],
    ['bad_target', () => ({ state: runnerWith(['r07']), action: { type: 'play', player: 'runner', handIndex: 0, server: 'hq' } })], // Maker's Eye: fixed R&D
    ['bad_target', () => ({ state: corpWith(['c01']), action: { type: 'play', player: 'corp', handIndex: 0, server: 'hq' } })],
    ['condition_not_met', () => ({ state: corpWith(['c12']), action: play('corp', 0) })], // Neural EMP, no run last turn
    ['no_credits', () => ({ state: corpWith(['c01'], 4), action: play('corp', 0) })], // Hedge Fund costs 5
  ];
  it.each(cases)('%s', (reason, make) => {
    const { state, action } = make();
    expectRejected(state, action, reason);
  });

  it('precedence: condition_not_met beats no_credits (Neural EMP says why even when broke); bad_target beats both', () => {
    expect(rejection(apply(corpWith(['c12'], 0), play('corp', 0)).events)).toBe('condition_not_met');
    expect(rejection(apply(runnerWith(['r11'], 0), play('runner', 0)).events)).toBe('bad_target');
  });

  it('invalid_action for a non-string play server', () => {
    const bad = { type: 'play', player: 'runner', handIndex: 0, server: 7 } as unknown as Action;
    expect(apply(runnerWith(['r11']), bad).events).toEqual([{ type: 'action_rejected', reason: 'invalid_action' }]);
  });
});

describe('S-02-1: Corp installs agendas, assets and upgrades', () => {
  it('into a new server: face down in "remote1", one click, no credits, events in order', () => {
    const s = corpWith(['c02', 'c08']);
    const r = apply(s, install('corp', 1, 'new'));
    expect(r.events).toEqual([
      { type: 'server_created', server: 'remote1' },
      { type: 'card_installed', player: 'corp', uid: 'i1', zone: 'content', server: 'remote1', handIndex: 1, cardId: 'c08' },
    ]);
    expect(r.state.players.corp).toMatchObject({ hand: ['c02'], clicks: 2, credits: 5 });
    expect(server(r.state, 'remote1')).toEqual({ id: 'remote1', ice: [], content: [{ uid: 'i1', cardId: 'c08', rezzed: false, advancements: 0 }] });
    expect(r.state).toMatchObject({ nextUid: 2, nextRemote: 2 });
  });

  it('servers are numbered remote1, remote2, ... in order (UI shows Server 1, Server 2)', () => {
    const s = run(corpWith(['c08', 'c03', 'c09']), [install('corp', 0, 'new'), install('corp', 0, 'new'), install('corp', 0, 'new')]).state;
    expect(s.servers.map((sv) => sv.id)).toEqual(['hq', 'rd', 'archives', 'remote1', 'remote2', 'remote3']);
    expect(s.servers.slice(3).map((sv) => sv.content[0]?.uid)).toEqual(['i1', 'i2', 'i3']);
  });

  it('one agenda or asset per remote; never in a central server', () => {
    const s = run(corpWith(['c08', 'c03', 'c11']), [install('corp', 0, 'new')]).state; // agenda in remote1
    expect(rejection(apply(s, install('corp', 0, 'remote1')).events)).toBe('bad_target'); // asset into the taken remote
    for (const central of ['hq', 'rd', 'archives'] as const) {
      expect(rejection(apply(s, install('corp', 0, central)).events)).toBe('bad_target');
    }
    // An upgrade can join it; then the asset still cannot.
    const s2 = run(s, [install('corp', 1, 'remote1')]).state;
    expect(server(s2, 'remote1').content.map((c) => c.cardId)).toEqual(['c08', 'c11']);
    expect(rejection(apply(s2, install('corp', 0, 'remote1')).events)).toBe('bad_target');
  });

  it('an upgrade can go into HQ, R&D or Archives (any server)', () => {
    for (const central of ['hq', 'rd', 'archives'] as const) {
      const r = apply(corpWith(['c11']), install('corp', 0, central));
      expect(rejection(r.events)).toBeNull();
      expect(server(r.state, central).content).toEqual([{ uid: 'i1', cardId: 'c11', rezzed: false, advancements: 0 }]);
      expect(r.events.some((e) => e.type === 'server_created')).toBe(false);
    }
  });
});

describe('S-02-2: Corp ICE', () => {
  it('costs 1 credit per ICE already on the server (0, 1, 2); the new one is outermost', () => {
    let s = withPlayer(corpWith(['c05', 'c04', 'c06']), 'corp', { clicks: 3 });
    const r0 = apply(s, install('corp', 0, 'hq'));
    expect(r0.events).toEqual([{ type: 'card_installed', player: 'corp', uid: 'i1', zone: 'ice', server: 'hq', handIndex: 0, cardId: 'c05' }]);
    expect(r0.state.players.corp.credits).toBe(5);
    s = r0.state;
    const r1 = apply(s, install('corp', 0, 'hq'));
    expect(r1.events[0]).toEqual({ type: 'credits_spent', player: 'corp', amount: 1 });
    expect(r1.state.players.corp.credits).toBe(4);
    s = r1.state;
    const r2 = apply(s, install('corp', 0, 'hq'));
    expect(r2.events[0]).toEqual({ type: 'credits_spent', player: 'corp', amount: 2 });
    expect(r2.state.players.corp).toMatchObject({ credits: 2, clicks: 0, hand: [] });
    expect(server(r2.state, 'hq').ice.map((c) => c.cardId)).toEqual(['c05', 'c04', 'c06']); // index 0 innermost
  });

  it('ICE on a new server is free and creates the server', () => {
    const r = apply(corpWith(['c07'], 0), install('corp', 0, 'new'));
    expect(r.events.map((e) => e.type)).toEqual(['server_created', 'card_installed']);
    expect(server(r.state, 'remote1').ice).toEqual([{ uid: 'i1', cardId: 'c07', rezzed: false, advancements: 0 }]);
  });

  it('not enough credits for the price: no_credits, nothing changes', () => {
    const s = withPlayer(run(corpWith(['c05', 'c05', 'c04']), [install('corp', 0, 'rd'), install('corp', 0, 'rd')]).state, 'corp', { credits: 1 });
    expectRejected(s, install('corp', 0, 'rd'), 'no_credits'); // price 2
    expect(rejection(apply(s, install('corp', 0, 'hq')).events)).toBeNull(); // HQ still free
  });
});

describe('S-02-3: Runner installs', () => {
  it('pays the card cost, one click, face up in the rig', () => {
    const r = apply(runnerWith(['r03', 'r04']), install('runner', 1));
    expect(r.events).toEqual([
      { type: 'credits_spent', player: 'runner', amount: 2 },
      { type: 'card_installed', player: 'runner', uid: 'i1', zone: 'rig', handIndex: 1, cardId: 'r04' },
    ]);
    expect(r.state.players.runner).toMatchObject({ hand: ['r03'], credits: 3, clicks: 3 });
    expect(r.state.rig).toEqual([{ uid: 'i1', cardId: 'r04', rezzed: false, advancements: 0 }]);
    expect(viewFor('corp', r.state).rig).toEqual([{ uid: 'i1', cardId: 'r04', faceUp: true, advancements: 0 }]);
  });

  it('a 0-cost resource emits no credits_spent', () => {
    expect(apply(runnerWith(['r12']), install('runner', 0)).events.map((e) => e.type)).toEqual(['card_installed']);
  });

  it('memory: 4 one-memory programs fit, the 5th is no_memory; hardware/resources use none', () => {
    let s = runnerWith(['r04', 'r05', 'r06', 'r04', 'r06', 'r09', 'r12'], 30);
    s = run(s, [install('runner', 0), install('runner', 0), install('runner', 0), install('runner', 0)]).state;
    expect(viewFor('runner', s).memory).toEqual({ used: 4, limit: 4 });
    s = withPlayer(s, 'runner', { clicks: 3 });
    expectRejected(s, install('runner', 0), 'no_memory');
    s = run(s, [install('runner', 1), install('runner', 1)]).state; // Akamatsu Mem Chip, Sacrificial Construct
    expect(viewFor('corp', s).memory).toEqual({ used: 4, limit: 4 }); // memory bonuses not built yet
    expect(s.rig).toHaveLength(6);
  });
});

describe('S-02-4: play operations and events', () => {
  it('Hedge Fund: 5 credits -> 9, card face up in Archives, one click', () => {
    const r = apply(corpWith(['c08', 'c01'], 5), play('corp', 1));
    expect(r.events).toEqual([
      { type: 'credits_spent', player: 'corp', amount: 5 },
      { type: 'card_played', player: 'corp', cardId: 'c01', handIndex: 1 },
      { type: 'credit_gained', player: 'corp', amount: 9 },
    ]);
    expect(r.state.players.corp).toMatchObject({ credits: 9, clicks: 2, hand: ['c08'], discard: [{ cardId: 'c01', faceUp: true }] });
    expect(viewFor('runner', r.state).players.corp.discard).toEqual(['c01']); // face up for both
  });

  it('Easy Mark: free, gain 3, face up on the Heap', () => {
    const r = apply(runnerWith(['r01'], 2), play('runner', 0));
    expect(r.events).toEqual([
      { type: 'card_played', player: 'runner', cardId: 'r01', handIndex: 0 },
      { type: 'credit_gained', player: 'runner', amount: 3 },
    ]);
    expect(r.state.players.runner).toMatchObject({ credits: 5, clicks: 3, discard: [{ cardId: 'r01', faceUp: true }] });
  });

  it.each([
    ['corp', 'c02', corpWith],
    ['runner', 'r03', runnerWith],
  ] as const)('%s draws 3 (Anonymous Tip / Diesel)', (side, id, make) => {
    const s0 = make([id]);
    const deck = s0.players[side].deck.slice(0, 3);
    const r = apply(s0, play(side, 0));
    expect(r.events).toEqual([
      { type: 'card_played', player: side, cardId: id, handIndex: 0 },
      ...deck.map((cardId) => ({ type: 'card_drawn', player: side, cardId })),
    ]);
    expect(r.state.players[side].hand).toEqual(deck);
  });

  it.each([
    ['corp', 'c02', corpWith],
    ['runner', 'r03', runnerWith],
  ] as const)('%s draw effect stops at an empty deck without losing (short deck of 2)', (side, id, make) => {
    const s0 = withPlayer(make([id]), side, { deck: ['c05', 'c06'].map((c) => (side === 'corp' ? c : c.replace('c', 'r'))) });
    const r = apply(s0, play(side, 0));
    expect(r.events.filter((e) => e.type === 'card_drawn')).toHaveLength(2);
    expect(r.state.players[side].deck).toEqual([]);
    expect(r.state.phase).toBe('action');
    expect(r.state.result).toBeNull();
    // Empty deck: still playable, draws nothing.
    const again = apply(withHand(r.state, side, [id]), play(side, 0));
    expect(again.events.map((e) => e.type)).toEqual(['card_played']);
  });

  it('hand limit after Diesel: end turn asks for the discard', () => {
    const s = run(runnerWith(['r03', 'r01', 'r02', 'r04', 'r05']), [play('runner', 0)]).state;
    expect(s.players.runner.hand).toHaveLength(7);
    const r = apply(s, { type: 'end_turn', player: 'runner' });
    expect(r.events).toEqual([{ type: 'discard_required', player: 'runner', count: 2 }]);
  });

  it('Archives mixes face-up played cards and face-down discards; the Runner sees backs as null', () => {
    let s = corpWith(['c02', 'c08', 'c08', 'c08', 'c08', 'c08']);
    s = run(s, [play('corp', 0)]).state; // Tip: 5 left + 3 drawn = 8 cards
    s = run(s, [{ type: 'end_turn', player: 'corp' }, { type: 'discard', player: 'corp', handIndices: [0, 1, 2] }]).state;
    expect(s.players.corp.discard).toEqual([
      { cardId: 'c02', faceUp: true },
      { cardId: 'c08', faceUp: false },
      { cardId: 'c08', faceUp: false },
      { cardId: 'c08', faceUp: false },
    ]);
    expect(viewFor('runner', s).players.corp.discard).toEqual(['c02', null, null, null]);
    expect(viewFor('corp', s).players.corp.discard).toEqual(['c02', 'c08', 'c08', 'c08']);
  });
});

describe('views and projections', () => {
  it('the Runner sees every unrezzed Corp card as cardId null; the Corp sees its own', () => {
    const s = run(corpWith(['c04', 'c08', 'c11']), [install('corp', 0, 'new'), install('corp', 0, 'remote1'), install('corp', 0, 'hq')]).state;
    const rv = viewFor('runner', s);
    expect(rv.corpServers.find((sv) => sv.id === 'remote1')).toEqual({
      id: 'remote1',
      ice: [{ uid: 'i1', cardId: null, faceUp: false, advancements: 0 }],
      content: [{ uid: 'i2', cardId: null, faceUp: false, advancements: 0 }],
    });
    expect(rv.corpServers.find((sv) => sv.id === 'hq')?.content).toEqual([{ uid: 'i3', cardId: null, faceUp: false, advancements: 0 }]);
    expect(JSON.stringify(rv)).not.toMatch(/"c\d\d"/);
    const cv = viewFor('corp', s);
    expect(cv.corpServers.find((sv) => sv.id === 'remote1')?.content).toEqual([{ uid: 'i2', cardId: 'c08', faceUp: false, advancements: 0 }]);
  });

  it('viewEvents: the opponent loses handIndex, and Corp installs lose cardId', () => {
    const corp = apply(corpWith(['c08']), install('corp', 0, 'new')).events;
    expect(viewEvents('runner', corp)).toEqual([
      { type: 'server_created', server: 'remote1' },
      { type: 'card_installed', player: 'corp', uid: 'i1', zone: 'content', server: 'remote1' },
    ]);
    expect(viewEvents('corp', corp)).toEqual(corp);
    const runner = apply(runnerWith(['r09']), install('runner', 0)).events;
    expect(viewEvents('corp', runner)).toEqual([
      { type: 'credits_spent', player: 'runner', amount: 1 },
      { type: 'card_installed', player: 'runner', uid: 'i1', zone: 'rig', cardId: 'r09' },
    ]);
    const played = apply(corpWith(['c01']), play('corp', 0)).events;
    expect(viewEvents('runner', played)).toContainEqual({ type: 'card_played', player: 'corp', cardId: 'c01' });
  });

  it('handOptions: offered targets with engine prices and reasons (bad targets never listed)', () => {
    let s = corpWith(['c05', 'c08', 'c11', 'c01', 'c12'], 1);
    s = run(s, [install('corp', 0, 'hq')]).state; // Ice Wall on HQ; hand: c08 c11 c01 c12
    s = withHand(s, 'corp', ['c05', 'c08', 'c11', 'c01', 'c12']);
    const opts = viewFor('corp', s).handOptions;
    // ICE: every server + new, price = ICE already there.
    expect(opts[0]!.map((o) => [o.action, o.cost, o.reject])).toEqual([
      [install('corp', 0, 'hq'), 1, null],
      [install('corp', 0, 'rd'), 0, null],
      [install('corp', 0, 'archives'), 0, null],
      [install('corp', 0, 'new'), 0, null],
    ]);
    // Agenda: no centrals, only new.
    expect(opts[1]!.map((o) => o.action)).toEqual([install('corp', 1, 'new')]);
    // Upgrade: any server + new.
    expect(opts[2]!.map((o) => (o.action as { server?: string }).server)).toEqual(['hq', 'rd', 'archives', 'new']);
    // Hedge Fund: unaffordable but offered; Neural EMP: no run last turn.
    expect(opts[3]).toEqual([{ action: play('corp', 3), cost: 5, reject: 'no_credits' }]);
    expect(opts[4]).toEqual([{ action: play('corp', 4), cost: 2, reject: 'condition_not_met' }]);
    // Off turn: same targets, reject not_your_turn; legalActions empty.
    const off = finishTurn(withPlayer(s, 'corp', { hand: ['c08'] })).state;
    expect(viewFor('corp', off).handOptions).toEqual([[{ action: install('corp', 0, 'new'), cost: 0, reject: 'not_your_turn' }]]);
  });

  it('handOptions reject always equals apply, and legal options are exactly the legal installs/plays', () => {
    let s = newGame(5);
    for (let step = 0; step < 80 && s.phase !== 'over'; step++) {
      for (const p of ['corp', 'runner'] as const) {
        const v = viewFor(p, s);
        expect(v.handOptions).toHaveLength(s.players[p].hand.length);
        for (const o of v.handOptions.flat()) {
          expect(rejection(apply(s, o.action).events)).toBe(o.reject);
        }
        const legal = v.legalActions.filter((a) => a.type === 'install' || a.type === 'play');
        const fromOpts = v.handOptions.flat().filter((o) => o.reject === null).map((o) => o.action);
        expect(new Set(legal.map((a) => JSON.stringify(a)))).toEqual(new Set(fromOpts.map((a) => JSON.stringify(a))));
      }
      const acts = legalActions(s, s.activePlayer);
      const a = acts.find((x) => x.type === 'install' || x.type === 'play') ?? acts.find((x) => x.type !== 'draw') ?? acts[0]!;
      s = apply(s, a).state;
    }
  });

  it('legalActions order: draw, gain_credit, end_turn, installs (by hand index), plays', () => {
    const types = legalActions(corpWith(['c02', 'c08', 'c01']), 'corp').map((a) => a.type);
    expect(types).toEqual(['draw', 'gain_credit', 'end_turn', 'install', 'play', 'play']);
    const acts = legalActions(corpWith(['c02', 'c08', 'c01']), 'corp');
    expect(acts[3]).toEqual(install('corp', 1, 'new'));
    expect(acts.slice(4)).toEqual([play('corp', 0), play('corp', 2)]);
  });
});

/** Small deterministic PRNG for picking actions (independent of the engine's). */
function picker(seed: number): (n: number) => number {
  let x = seed >>> 0;
  return (n) => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x % n;
  };
}

/** Plays random legal actions, favouring installs/plays so boards get busy. */
function randomGame(seed: number, steps: number): Action[] {
  const pick = picker(seed * 31 + 7);
  let s = newGame(seed);
  const log: Action[] = [];
  for (let i = 0; i < steps && s.phase !== 'over'; i++) {
    const acts = legalActions(s, waitingOn(s)!);
    const busy = acts.filter((a) => a.type === 'install' || a.type === 'play');
    let a = (busy.length > 0 && pick(3) > 0 ? busy[pick(busy.length)] : acts[pick(acts.length)])!;
    if (a.type === 'discard') {
      const hand = s.players[s.activePlayer].hand.map((_, k) => k);
      const n = hand.length - 5;
      const chosen: number[] = [];
      while (chosen.length < n) chosen.push(hand.splice(pick(hand.length), 1)[0]!);
      a = { type: 'discard', player: s.activePlayer, handIndices: chosen };
    }
    log.push(a);
    s = apply(s, a).state;
  }
  return log;
}

describe('replay and hidden information (property tests)', () => {
  it('replay(seed, actions) rebuilds the same game, installs and plays included', () => {
    for (const seed of [1, 2, 3]) {
      const actions = randomGame(seed, 150);
      const a = replay(seed, actions);
      const b = replay(seed, JSON.parse(JSON.stringify(actions)) as Action[]);
      expect(b).toEqual(a);
      expect(a.events.some((e) => e.type === 'card_installed')).toBe(true);
      expect(a.events.some((e) => e.type === 'card_played')).toBe(true);
    }
  });

  it("random legal sequences: the Runner's view and events never contain a face-down Corp cardId", () => {
    let corpInstalls = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const pick = picker(seed);
      let s = newGame(seed);
      for (let i = 0; i < 200 && s.phase !== 'over'; i++) {
        const acts = legalActions(s, waitingOn(s)!);
        const busy = acts.filter((a) => a.type === 'install' || a.type === 'play');
        let a = (busy.length > 0 && pick(3) > 0 ? busy[pick(busy.length)] : acts[pick(acts.length)])!;
        if (a.type === 'discard') a = { ...a, handIndices: [...a.handIndices] };
        const r = apply(s, a);
        s = r.state;
        for (const e of r.events) if (e.type === 'card_installed' && e.player === 'corp') corpInstalls++;
        expectRunnerEventsClean(r.events, `seed ${seed} step ${i}`);
        expectRunnerViewClean(s, `seed ${seed} step ${i}`);
      }
    }
    expect(corpInstalls).toBeGreaterThan(100); // the property was really exercised
  });
});
