// Sprint 3 E3: run core — start, approach/rez, continue/jack out, Let it through
// with "End the run", access (HQ, R&D, Archives, remote), steal/trash/Leave/Done,
// win on steal (S-03-1, S-03-3 AC1-3/AC6, S-03-2 AC4 engine side).
import { describe, expect, it } from 'vitest';
import {
  apply,
  legalActions,
  viewEvents,
  viewFor,
  waitingOn,
  type Action,
  type GameState,
  type RejectReason,
  type ServerId,
  type Side,
} from '../src/index';
import { act, board, clone, liveness, rejection, withPlayer } from './helpers';

const runOn = (server: ServerId): Action => ({ type: 'run', player: 'runner', server });
const pass = (player: Side): Action => ({ type: 'pass', player });
const rez = (uid: string): Action => ({ type: 'rez', player: 'corp', uid });
const jackOut: Action = { type: 'jack_out', player: 'runner' };
const steal = (card: number): Action => ({ type: 'steal', player: 'runner', card });
const trash = (card: number): Action => ({ type: 'trash', player: 'runner', card });

function expectRejected(state: GameState, action: Action, reason: RejectReason): void {
  const snapshot = clone(state);
  const r = apply(state, action);
  expect(r.events).toEqual([{ type: 'action_rejected', reason }]);
  expect(r.state).toBe(state);
  expect(state).toEqual(snapshot);
  if (reason !== 'invalid_action') expect(legalActions(state, action.player)).not.toContainEqual(action);
}

/** Applies actions in order (all must be accepted), checking liveness after each. */
function play(state: GameState, actions: Action[]) {
  let s = state;
  const events = [];
  for (const a of actions) {
    const r = act(s, a);
    s = r.state;
    events.push(...r.events);
    liveness(s);
  }
  return { state: s, events };
}

describe('S-03-1 AC1: starting a run', () => {
  it('runOptions: one run per server for the Runner (Corp gets none); a run costs 1 click', () => {
    const s = board({ servers: { remote1: { content: ['c03'] } } });
    expect(viewFor('runner', s).runOptions).toEqual(
      ['hq', 'rd', 'archives', 'remote1'].map((server) => ({ action: runOn(server as ServerId), cost: 0, reject: null })),
    );
    expect(viewFor('corp', s).runOptions).toEqual([]);
    const r = act(s, runOn('remote1'));
    expect(r.state.players.runner.clicks).toBe(3);
    expect(r.events[0]).toEqual({ type: 'run_started', server: 'remote1' });
    expect(r.state.phase).toBe('run');
    expect(r.state.lastRunTurn).toBe(s.turn);
  });

  it('runOptions are listed with the reason when not possible (no clicks, Corp turn)', () => {
    const s = board({ runnerClicks: 0 });
    expect(viewFor('runner', s).runOptions.map((o) => o.reject)).toEqual(['no_clicks', 'no_clicks', 'no_clicks']);
  });

  const cases: [RejectReason, () => { state: GameState; action: Action }][] = [
    ['invalid_action', () => ({ state: board({}), action: { type: 'run', player: 'runner' } as unknown as Action })],
    ['game_over', () => ({ state: { ...board({}), phase: 'over', result: { winner: 'corp', reason: 'flatline' } }, action: runOn('hq') })],
    ['not_your_turn', () => ({ state: board({}), action: { type: 'run', player: 'corp', server: 'hq' } })],
    ['wrong_phase', () => ({ state: act(board({ servers: { rd: { ice: ['c05'] } } }), runOn('rd')).state, action: runOn('hq') })],
    ['no_clicks', () => ({ state: board({ runnerClicks: 0 }), action: runOn('hq') })],
    ['bad_target', () => ({ state: board({}), action: runOn('remote4') })],
  ];
  it.each(cases)('run rejects %s, state unchanged', (reason, make) => {
    const { state, action } = make();
    expectRejected(state, action, reason);
  });

  it('during a run every Sprint 1/2 action is refused (Runner: wrong_phase), and so is end_turn', () => {
    const s = act(board({ servers: { rd: { ice: ['c05'] } } }), runOn('rd')).state;
    for (const a of [
      { type: 'draw', player: 'runner' },
      { type: 'gain_credit', player: 'runner' },
      { type: 'end_turn', player: 'runner' },
      { type: 'install', player: 'runner', handIndex: 2 },
      { type: 'play', player: 'runner', handIndex: 0 },
    ] as Action[]) {
      expect(rejection(apply(s, a).events)).toBe('wrong_phase');
    }
    expect(viewFor('runner', s).handOptions.flat().every((o) => o.reject === 'wrong_phase')).toBe(true);
  });
});

describe('S-03-1 AC2: a server with no ICE: straight in, access', () => {
  it('HQ: 1 random card from the Corp hand (seeded); Done puts it back; run ends; clicks kept', () => {
    const s = board({ corpHand: ['c01', 'c02', 'c04'] });
    const r = act(s, runOn('hq'));
    const accessed = r.events.find((e) => e.type === 'card_accessed');
    expect(r.events.map((e) => e.type)).toEqual(['run_started', 'run_successful', 'card_accessed']);
    expect(accessed).toMatchObject({ from: 'hq' });
    expect(['c01', 'c02', 'c04']).toContain((accessed as { cardId: string }).cardId);
    expect(r.state.rng).not.toBe(s.rng); // the pick used the seeded RNG
    const v = viewFor('runner', r.state).run!;
    expect(v).toMatchObject({ server: 'hq', position: -1, step: 'access', waitingOn: 'runner', iceUid: null, ice: null });
    expect(v.access!.cards).toEqual([{ cardId: (accessed as { cardId: string }).cardId, from: 'hq', stolen: false, uid: null }]);
    expect(v.options).toEqual([{ action: pass('runner'), cost: 0, reject: null }]); // operation / ICE: only Done
    const done = act(r.state, pass('runner'));
    expect(done.events).toEqual([{ type: 'run_ended', server: 'hq', outcome: 'accessed' }]);
    expect(done.state.phase).toBe('action');
    expect(done.state.run).toBeNull();
    expect(done.state.players.runner.clicks).toBe(3);
    expect(done.state.players.corp.hand).toEqual(['c01', 'c02', 'c04']); // AC5: untouched
    expect(viewFor('runner', done.state).run).toBeNull();
    expect(JSON.stringify(viewFor('runner', done.state))).not.toMatch(/"c0[124]"/); // hidden again
  });

  it('same seed and state: the same HQ card (deterministic)', () => {
    const s = board({ corpHand: ['c01', 'c02', 'c04', 'c05', 'c06'] });
    expect(act(s, runOn('hq')).events).toEqual(act(clone(s), runOn('hq')).events);
  });

  it('R&D: the top card; the Corp does not learn which (projection and view)', () => {
    const s = board({ corpDeck: ['c07', 'c02', 'c03'] });
    const r = act(s, runOn('rd'));
    expect(r.events.at(-1)).toEqual({ type: 'card_accessed', cardId: 'c07', from: 'rd' });
    expect(viewEvents('corp', r.events).at(-1)).toEqual({ type: 'card_accessed', from: 'rd' });
    expect(viewEvents('runner', r.events).at(-1)).toEqual({ type: 'card_accessed', cardId: 'c07', from: 'rd' });
    expect(viewFor('corp', r.state).run!.access!.cards).toEqual([{ cardId: null, from: 'rd', stolen: false, uid: null }]);
    const done = act(r.state, pass('runner'));
    expect(done.state.players.corp.deck).toEqual(['c07', 'c02', 'c03']); // AC5: deck untouched
  });

  it('Archives: every card at once, face-down ones turn face up for good; nothing is trashable', () => {
    const s = board({ archives: ['+c01', 'c03', 'c06'] });
    const r = act(s, runOn('archives'));
    expect(r.events.filter((e) => e.type === 'card_accessed')).toEqual([
      { type: 'card_accessed', cardId: 'c01', from: 'archives' },
      { type: 'card_accessed', cardId: 'c03', from: 'archives' },
      { type: 'card_accessed', cardId: 'c06', from: 'archives' },
    ]);
    expect(viewFor('runner', r.state).run!.access!.cards.map((c) => c.cardId)).toEqual(['c01', 'c03', 'c06']);
    // PAD Campaign has a trash cost but is in Archives: only Done.
    expect(viewFor('runner', r.state).run!.options).toEqual([{ action: pass('runner'), cost: 0, reject: null }]);
    expectRejected(r.state, trash(1), 'bad_target');
    const done = act(r.state, pass('runner'));
    expect(done.state.players.corp.discard).toEqual([
      { cardId: 'c01', faceUp: true },
      { cardId: 'c03', faceUp: true },
      { cardId: 'c06', faceUp: true },
    ]);
    expect(viewFor('runner', done.state).players.corp.discard).toEqual(['c01', 'c03', 'c06']);
  });

  it('a remote: every card in it, one at a time (agenda + upgrade)', () => {
    const s = board({ servers: { remote1: { content: ['c08', 'c11'] } } });
    const r = act(s, runOn('remote1'));
    expect(r.events.at(-1)).toEqual({ type: 'card_accessed', cardId: 'c08', from: 'remote', uid: 'i1' });
    expect(viewFor('runner', r.state).run!.options).toEqual([{ action: steal(0), cost: 0, reject: null }]); // only Steal
    expectRejected(r.state, pass('runner'), 'bad_target'); // stealing is mandatory
    const stolen = act(r.state, steal(0));
    expect(stolen.events).toEqual([
      { type: 'agenda_stolen', cardId: 'c08', points: 1 },
      { type: 'card_accessed', cardId: 'c11', from: 'remote', uid: 'i2' },
    ]);
    // Akitaro Watanabe: trash cost 3, or Leave it.
    expect(viewFor('runner', stolen.state).run!.options).toEqual([
      { action: trash(0), cost: 3, reject: null },
      { action: pass('runner'), cost: 0, reject: null },
    ]);
    const left = act(stolen.state, pass('runner'));
    expect(left.events).toEqual([{ type: 'run_ended', server: 'remote1', outcome: 'accessed' }]);
    expect(left.state.servers.find((sv) => sv.id === 'remote1')!.content.map((c) => c.cardId)).toEqual(['c11']);
  });

  it('an empty remote: the run is successful and ends at once', () => {
    const s = board({ servers: { remote1: {} } });
    const r = act(s, runOn('remote1'));
    expect(r.events).toEqual([
      { type: 'run_started', server: 'remote1' },
      { type: 'run_successful', server: 'remote1' },
      { type: 'run_ended', server: 'remote1', outcome: 'accessed' },
    ]);
    expect(r.state.phase).toBe('action');
  });

  it('an upgrade in a central server is accessed after the central card', () => {
    const s = board({ servers: { rd: { content: ['c11'] } }, corpDeck: ['c02'] });
    const r = act(s, runOn('rd'));
    expect(r.events.at(-1)).toEqual({ type: 'card_accessed', cardId: 'c02', from: 'rd' });
    const next = act(r.state, pass('runner'));
    expect(next.events).toEqual([{ type: 'card_accessed', cardId: 'c11', from: 'rd', uid: 'i1' }]);
  });
});

describe('S-03-1 AC3: steal agendas', () => {
  it('moves face up to the Runner score area; both players see the points', () => {
    const s = board({ servers: { remote1: { content: ['c09'] } } });
    const r = play(s, [runOn('remote1'), steal(0)]);
    expect(r.state.players.runner.scoreArea).toEqual(['c09']);
    expect(r.state.servers.find((sv) => sv.id === 'remote1')!.content).toEqual([]);
    expect(r.state.phase).toBe('action'); // last card taken: the run ended by itself
    for (const p of ['corp', 'runner'] as const) expect(viewFor(p, r.state).players.runner).toMatchObject({ scored: ['c09'], points: 2 });
    expect(viewEvents('runner', r.events)).toContainEqual({ type: 'agenda_stolen', cardId: 'c09', points: 2 });
    expect(viewEvents('corp', r.events)).toContainEqual({ type: 'agenda_stolen', cardId: 'c09', points: 2 });
  });

  it('from HQ and R&D: removed from the hand / deck', () => {
    const hq = play(board({ corpHand: ['c10'] }), [runOn('hq'), steal(0)]).state;
    expect(hq.players.corp.hand).toEqual([]);
    expect(hq.players.runner.scoreArea).toEqual(['c10']);
    const rd = play(board({ corpDeck: ['c08', 'c01'] }), [runOn('rd'), steal(0)]).state;
    expect(rd.players.corp.deck).toEqual(['c01']);
  });

  it('Archives: steal each agenda (indices stay stable), Done only after the last', () => {
    const s = board({ archives: ['c08', '+c01', 'c09'] });
    let r = act(s, runOn('archives')).state;
    expect(viewFor('runner', r).run!.options.map((o) => o.action)).toEqual([steal(0), steal(2)]);
    r = act(r, steal(2)).state;
    expectRejected(r, pass('runner'), 'bad_target');
    expectRejected(r, steal(2), 'bad_target'); // already stolen
    expect(viewFor('runner', r).run!.access!.cards.map((c) => c.stolen)).toEqual([false, false, true]);
    r = act(r, steal(0)).state;
    expect(r.players.corp.discard).toEqual([{ cardId: 'c01', faceUp: true }]);
    expect(r.players.runner.scoreArea).toEqual(['c09', 'c08']);
    expect(viewFor('runner', r).run!.options).toEqual([{ action: pass('runner'), cost: 0, reject: null }]);
    r = act(r, pass('runner')).state;
    expect(r.phase).toBe('action');
  });

  it('S-03-2 AC4: a steal reaching 7 points ends the game at once: Runner wins', () => {
    const s = withPlayer(board({ servers: { remote1: { content: ['c10'] } } }), 'runner', { scoreArea: ['c09', 'c09'] });
    const r = act(act(s, runOn('remote1')).state, steal(0));
    expect(r.events).toEqual([
      { type: 'agenda_stolen', cardId: 'c10', points: 3 },
      { type: 'run_ended', server: 'remote1', outcome: 'accessed' },
      { type: 'game_over', winner: 'runner', reason: 'agenda_points' },
    ]);
    expect(r.state).toMatchObject({ phase: 'over', result: { winner: 'runner', reason: 'agenda_points' }, run: null });
    liveness(r.state);
  });
});

describe('S-03-1 AC4: trash assets/upgrades, or Leave it', () => {
  it('PAD Campaign: Trash · 4 credits sends it face up to Archives', () => {
    const s = board({ servers: { remote1: { content: ['c03'] } }, runnerCredits: 5 });
    const r = act(s, runOn('remote1'));
    expect(viewFor('runner', r.state).run!.options).toEqual([
      { action: trash(0), cost: 4, reject: null },
      { action: pass('runner'), cost: 0, reject: null },
    ]);
    const t = act(r.state, trash(0));
    expect(t.events).toEqual([
      { type: 'credits_spent', player: 'runner', amount: 4 },
      { type: 'card_trashed', cardId: 'c03', from: 'remote', uid: 'i1' },
      { type: 'run_ended', server: 'remote1', outcome: 'accessed' },
    ]);
    expect(t.state.players.runner.credits).toBe(1);
    expect(t.state.players.corp.discard.at(-1)).toEqual({ cardId: 'c03', faceUp: true });
    expect(t.state.servers.find((sv) => sv.id === 'remote1')!.content).toEqual([]);
  });

  it('not enough credits: offered with no_credits; apply refuses, nothing changes', () => {
    const r = act(board({ servers: { remote1: { content: ['c03'] } }, runnerCredits: 3 }), runOn('remote1'));
    expect(viewFor('runner', r.state).run!.options[0]).toEqual({ action: trash(0), cost: 4, reject: 'no_credits' });
    expectRejected(r.state, trash(0), 'no_credits');
  });

  it('Leave it puts it back where it was', () => {
    const s = board({ servers: { remote1: { content: ['c03'] } } });
    const r = play(s, [runOn('remote1'), pass('runner')]).state;
    expect(r.servers).toEqual(s.servers);
  });

  it('cards with a trash cost can be trashed from HQ too', () => {
    const r = play(board({ corpHand: ['c03'], runnerCredits: 4 }), [runOn('hq'), trash(0)]).state;
    expect(r.players.corp.hand).toEqual([]);
    expect(r.players.corp.discard.at(-1)).toEqual({ cardId: 'c03', faceUp: true });
  });
});

describe('S-03-3 AC1-3: approach and rez', () => {
  it('face-down ICE the Corp can pay for: the Corp decides (Rez · cost / Don\'t rez); the Runner waits', () => {
    const s = board({ servers: { hq: { ice: ['c04'] } }, corpCredits: 5 });
    const r = act(s, runOn('hq'));
    expect(r.events).toEqual([
      { type: 'run_started', server: 'hq' },
      { type: 'ice_approached', uid: 'i1', position: 0 },
    ]);
    expect(waitingOn(r.state)).toBe('corp');
    expect(liveness(r.state)).toBe('corp');
    const cv = viewFor('corp', r.state).run!;
    expect(cv).toMatchObject({ step: 'approach', waitingOn: 'corp', iceUid: 'i1', ice: { cardId: 'c04', strength: 3 } });
    expect(cv.options).toEqual([
      { action: rez('i1'), cost: 3, reject: null },
      { action: pass('corp'), cost: 0, reject: null },
    ]);
    const rv = viewFor('runner', r.state).run!;
    expect(rv).toMatchObject({ step: 'approach', waitingOn: 'corp', iceUid: 'i1', ice: { cardId: null, strength: null, subroutines: [] }, options: [] });
  });

  it("Don't rez: the ICE stays face down and is passed; then Continue moves on into the server", () => {
    const s = board({ servers: { hq: { ice: ['c04'] } }, corpHand: ['c01'] });
    let r = play(s, [runOn('hq'), pass('corp')]);
    expect(r.events.slice(-1)).toEqual([{ type: 'ice_passed', uid: 'i1' }]);
    expect(r.state.servers[0]!.ice[0]!.rezzed).toBe(false);
    expect(viewFor('runner', r.state).run!.options).toEqual([
      { action: pass('runner'), cost: 0, reject: null },
      { action: jackOut, cost: 0, reject: null },
    ]);
    r = play(r.state, [pass('runner')]);
    expect(r.events.map((e) => e.type)).toEqual(['run_successful', 'card_accessed']);
  });

  it('Rez: the Corp pays, the ICE flips face up for both (and stays), then the Runner encounters it', () => {
    const s = board({ servers: { hq: { ice: ['c05'] } }, corpCredits: 5 });
    const r = play(s, [runOn('hq'), rez('i1')]);
    expect(r.events.slice(-3)).toEqual([
      { type: 'credits_spent', player: 'corp', amount: 1 },
      { type: 'ice_rezzed', uid: 'i1', cardId: 'c05' },
      { type: 'ice_encountered', uid: 'i1' },
    ]);
    expect(viewEvents('runner', r.events)).toContainEqual({ type: 'ice_rezzed', uid: 'i1', cardId: 'c05' });
    expect(r.state.players.corp.credits).toBe(4);
    const rv = viewFor('runner', r.state);
    expect(rv.corpServers[0]!.ice[0]).toEqual({ uid: 'i1', cardId: 'c05', faceUp: true, advancements: 0 });
    expect(rv.run).toMatchObject({ step: 'encounter', waitingOn: 'runner', ice: { cardId: 'c05', strength: 1, subroutines: [{ text: 'End the run', broken: false }] } });
    // Stays rezzed after the run.
    const after = play(r.state, [pass('runner')]).state;
    expect(after.servers[0]!.ice[0]!.rezzed).toBe(true);
  });

  it('the Corp cannot pay: no question, the ICE is passed face down', () => {
    const s = board({ servers: { hq: { ice: ['c07'] } }, corpCredits: 3 });
    const r = act(s, runOn('hq'));
    expect(r.events.map((e) => e.type)).toEqual(['run_started', 'ice_approached', 'ice_passed']);
    expect(waitingOn(r.state)).toBe('runner');
    expect(r.state.run!.step).toBe('continue');
  });

  it('already rezzed: no question, straight to the encounter', () => {
    const r = act(board({ servers: { hq: { ice: ['+c05'] } } }), runOn('hq'));
    expect(r.events.map((e) => e.type)).toEqual(['run_started', 'ice_approached', 'ice_encountered']);
    expect(r.state.run!.step).toBe('encounter');
  });

  it("S-03-3 AC4 (End the run): Let it through on Ice Wall ends the run, nothing accessed", () => {
    const r = play(board({ servers: { hq: { ice: ['+c05'] } } }), [runOn('hq'), pass('runner')]);
    expect(r.events.slice(-3)).toEqual([
      { type: 'subroutine_fired', iceUid: 'i1', sub: 0 },
      { type: 'subroutine_resolved', iceUid: 'i1', cardId: 'c05', outcome: { sub: 0, op: 'end_run', amount: 0 } },
      { type: 'run_ended', server: 'hq', outcome: 'ended_by_ice' },
    ]);
    expect(r.events.some((e) => e.type === 'card_accessed')).toBe(false);
    expect(r.state.phase).toBe('action');
    expect(r.state.players.runner.clicks).toBe(3);
  });

  it('AC6: several ICE are met outside-in, with a Continue stop after each', () => {
    // hq ice: i1 (innermost) Ice Wall, i2 Wall of Static, i3 (outermost) Enigma — none rezzed, Corp too poor for any but Ice Wall.
    const s = board({ servers: { hq: { ice: ['c05', 'c04', 'c06'] } }, corpCredits: 1 });
    let r = act(s, runOn('hq'));
    expect(r.events.slice(1)).toEqual([
      { type: 'ice_approached', uid: 'i3', position: 2 },
      { type: 'ice_passed', uid: 'i3' },
    ]);
    expect(viewFor('runner', r.state).run).toMatchObject({ position: 2, iceUid: 'i3', step: 'continue' });
    r = act(r.state, pass('runner'));
    expect(r.events).toEqual([
      { type: 'ice_approached', uid: 'i2', position: 1 },
      { type: 'ice_passed', uid: 'i2' },
    ]);
    r = act(r.state, pass('runner'));
    expect(r.events).toEqual([{ type: 'ice_approached', uid: 'i1', position: 0 }]);
    expect(waitingOn(r.state)).toBe('corp'); // Ice Wall costs 1: the Corp can pay
  });
});

describe('S-03-1 AC6: jack out', () => {
  it('after passing an ICE: the run ends with nothing accessed', () => {
    const r = play(board({ servers: { hq: { ice: ['c04', 'c04'] } }, corpCredits: 0 }), [runOn('hq'), jackOut]);
    expect(r.events.at(-1)).toEqual({ type: 'run_ended', server: 'hq', outcome: 'jacked_out' });
    expect(r.events.some((e) => e.type === 'card_accessed')).toBe(false);
    expect(r.state.phase).toBe('action');
    expect(r.state.players.runner.clicks).toBe(3);
  });

  it('also after the innermost ICE, just before getting in', () => {
    const r = play(board({ servers: { hq: { ice: ['c04'] } }, corpCredits: 0 }), [runOn('hq'), jackOut]);
    expect(r.events.at(-1)).toEqual({ type: 'run_ended', server: 'hq', outcome: 'jacked_out' });
  });

  it('not before the first ICE (approach / encounter / access are wrong_phase)', () => {
    const approach = act(board({ servers: { hq: { ice: ['c04'] } } }), runOn('hq')).state;
    expect(rejection(apply(approach, jackOut).events)).toBe('not_your_turn'); // the Corp decides here
    const encounter = act(board({ servers: { hq: { ice: ['+c04'] } } }), runOn('hq')).state;
    expectRejected(encounter, jackOut, 'wrong_phase');
    const access = act(board({}), runOn('hq')).state;
    expectRejected(access, jackOut, 'wrong_phase');
    expectRejected(board({}), jackOut, 'wrong_phase'); // no run at all
  });
});

describe('run decisions: rejection reasons and precedence', () => {
  const approach = () => act(board({ servers: { hq: { ice: ['c04'] } } }), runOn('hq')).state;
  const access = () => act(board({ servers: { remote1: { content: ['c08'] } } }), runOn('remote1')).state;
  const cases: [string, RejectReason, () => { state: GameState; action: Action }][] = [
    ['rez shape', 'invalid_action', () => ({ state: approach(), action: { type: 'rez', player: 'corp' } as unknown as Action })],
    ['steal shape', 'invalid_action', () => ({ state: access(), action: { type: 'steal', player: 'runner', card: '0' } as unknown as Action })],
    ['pass game over', 'game_over', () => ({ state: { ...approach(), phase: 'over', result: { winner: 'corp', reason: 'flatline' } }, action: pass('corp') })],
    ['Runner rez', 'not_your_turn', () => ({ state: approach(), action: { type: 'rez', player: 'runner', uid: 'i1' } })],
    ['Runner pass at approach', 'not_your_turn', () => ({ state: approach(), action: pass('runner') })],
    ['Corp pass at access', 'not_your_turn', () => ({ state: access(), action: pass('corp') })],
    ['Corp steal', 'not_your_turn', () => ({ state: access(), action: { type: 'steal', player: 'corp', card: 0 } })],
    ['rez outside a run (Corp turn)', 'wrong_phase', () => ({ state: { ...board({}), activePlayer: 'corp' }, action: rez('i1') })],
    ['Corp rez on the Runner turn, no run', 'not_your_turn', () => ({ state: board({ servers: { hq: { ice: ['c04'] } } }), action: rez('i1') })],
    ['pass outside a run', 'wrong_phase', () => ({ state: board({}), action: pass('runner') })],
    ['steal at encounter', 'wrong_phase', () => ({ state: act(board({ servers: { hq: { ice: ['+c04'] } } }), runOn('hq')).state, action: steal(0) })],
    ['rez a different ICE', 'bad_target', () => ({ state: approach(), action: rez('i9') })],
    ['steal out of range', 'bad_target', () => ({ state: access(), action: steal(3) })],
    ['trash an agenda', 'bad_target', () => ({ state: access(), action: trash(0) })],
    ['steal a non-agenda', 'bad_target', () => ({ state: act(board({ servers: { remote1: { content: ['c03'] } } }), runOn('remote1')).state, action: steal(0) })],
    ['trash a card without trash cost', 'bad_target', () => ({ state: act(board({ corpHand: ['c01'] }), runOn('hq')).state, action: trash(0) })],
    ['rez without the money', 'no_credits', () => ({ state: withPlayer(approach(), 'corp', { credits: 2 }), action: rez('i1') })],
  ];
  it.each(cases)('%s: %s', (_name, reason, make) => {
    const { state, action } = make();
    expectRejected(state, action, reason);
  });

  it('every listed run option is accepted by apply, and reject matches apply', () => {
    for (const s of [approach(), access(), act(board({ servers: { hq: { ice: ['c04'] } }, corpCredits: 0 }), runOn('hq')).state]) {
      for (const p of ['corp', 'runner'] as const) {
        for (const o of viewFor(p, s).run!.options) expect(rejection(apply(s, o.action).events)).toBe(o.reject);
        const legal = legalActions(s, p);
        expect(legal).toEqual(viewFor(p, s).run!.options.filter((o) => o.reject === null).map((o) => o.action));
      }
    }
  });
});

describe('liveness: exactly one side can act at every step of a run', () => {
  it('walks a full run with rez, encounter, continue, access', () => {
    const s = board({ servers: { remote1: { ice: ['c05', 'c04'], content: ['c08'] } }, corpCredits: 3 });
    // Outer Wall of Static (i2): Corp rezzes (3). Inner Ice Wall (i1): Corp can no longer pay -> passed.
    let r = play(s, [runOn('remote1'), rez('i2')]);
    expect(r.state.run!.step).toBe('encounter');
    // No breaker: Let it through ends the run.
    r = play(r.state, [pass('runner')]);
    expect(r.state.phase).toBe('action');
    // Run again: Wall of Static is rezzed now (encounter at once).
    r = play(r.state, [runOn('remote1')]);
    expect(r.state.run!.step).toBe('encounter');
  });
});
