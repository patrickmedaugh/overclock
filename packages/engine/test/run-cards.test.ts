// Sprint 3 E5: the three "Needs runs" cards via the DSL — The Maker's Eye,
// Inside Job, Neural EMP (S-03-5 engine side).
import { describe, expect, it } from 'vitest';
import { CORP_STARTER_DECK, RUNNER_STARTER_DECK } from '@overclock/cards';
import {
  apply,
  legalActions,
  viewFor,
  type Action,
  type GameState,
  type ServerId,
  type Side,
} from '../src/index';
import { act, board, clone, finishTurn, liveness, rejection, withHand, withPlayer, type BoardSpec } from './helpers';

const pass = (player: Side): Action => ({ type: 'pass', player });
const steal = (card: number): Action => ({ type: 'steal', player: 'runner', card });
const rez = (uid: string): Action => ({ type: 'rez', player: 'corp', uid });
const playCard = (player: Side, handIndex: number, server?: ServerId): Action =>
  server === undefined ? { type: 'play', player, handIndex } : { type: 'play', player, handIndex, server };

function playAll(state: GameState, actions: Action[]) {
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

/** Board with The Maker's Eye (r07) or Inside Job (r11) as hand card 0. */
const withRunEvent = (id: string, spec: BoardSpec) => board({ ...spec, runnerHand: [id, 'r01', 'r03', 'r09'] });

describe("S-03-5 AC1: The Maker's Eye", () => {
  it('2 credits and a click: a run on R&D; if successful the top 3 cards are accessed one after another', () => {
    const s = withRunEvent('r07', { corpDeck: ['c01', 'c02', 'c03', 'c04', 'c05'], runnerCredits: 5 });
    expect(viewFor('runner', s).handOptions[0]).toEqual([{ action: playCard('runner', 0), cost: 2, reject: null }]);
    const r = act(s, playCard('runner', 0));
    expect(r.events.slice(0, 5)).toEqual([
      { type: 'credits_spent', player: 'runner', amount: 2 },
      { type: 'card_played', player: 'runner', cardId: 'r07', handIndex: 0 },
      { type: 'run_started', server: 'rd', cardId: 'r07' },
      { type: 'run_successful', server: 'rd' },
      { type: 'card_accessed', cardId: 'c01', from: 'rd' },
    ]);
    expect(r.state.players.runner).toMatchObject({ credits: 3, clicks: 3 });
    expect(r.state.players.runner.discard.at(-1)).toEqual({ cardId: 'r07', faceUp: true });
    expect(r.state.lastRunTurn).toBe(s.turn);
    expect(viewFor('runner', r.state).run).toMatchObject({ server: 'rd', extraAccess: 2 });
    const second = act(r.state, pass('runner'));
    expect(second.events).toEqual([{ type: 'card_accessed', cardId: 'c02', from: 'rd' }]);
    const third = act(second.state, pass('runner'));
    expect(third.events).toEqual([{ type: 'card_accessed', cardId: 'c03', from: 'rd' }]);
    const done = act(third.state, pass('runner'));
    expect(done.events).toEqual([{ type: 'run_ended', server: 'rd', outcome: 'accessed' }]);
    expect(done.state.players.corp.deck).toEqual(['c01', 'c02', 'c03', 'c04', 'c05']); // deck untouched
  });

  it('a short R&D stops early (2 cards: 2 accesses)', () => {
    const s = withRunEvent('r07', { corpDeck: ['c01', 'c02'] });
    const r = playAll(s, [playCard('runner', 0), pass('runner'), pass('runner')]);
    expect(r.events.filter((e) => e.type === 'card_accessed')).toHaveLength(2);
    expect(r.events.at(-1)).toEqual({ type: 'run_ended', server: 'rd', outcome: 'accessed' });
  });

  it('stealing card 1 does not skip a card: card 2 is the original second card, then the third', () => {
    const s = withRunEvent('r07', { corpDeck: ['c08', 'c02', 'c09', 'c01'] });
    let r = act(s, playCard('runner', 0));
    expect(r.events.at(-1)).toEqual({ type: 'card_accessed', cardId: 'c08', from: 'rd' });
    r = act(r.state, steal(0));
    expect(r.events).toEqual([
      { type: 'agenda_stolen', cardId: 'c08', points: 1 },
      { type: 'card_accessed', cardId: 'c02', from: 'rd' },
    ]);
    r = act(r.state, pass('runner'));
    expect(r.events).toEqual([{ type: 'card_accessed', cardId: 'c09', from: 'rd' }]);
    r = act(r.state, steal(0));
    expect(r.events).toEqual([
      { type: 'agenda_stolen', cardId: 'c09', points: 2 },
      { type: 'run_ended', server: 'rd', outcome: 'accessed' },
    ]);
    expect(r.state.players.corp.deck).toEqual(['c02', 'c01']);
    expect(r.state.players.runner.scoreArea).toEqual(['c08', 'c09']);
  });

  it('meets R&D ICE like any run; an unsuccessful run accesses nothing', () => {
    const s = withRunEvent('r07', { servers: { rd: { ice: ['+c05'] } } });
    const r = playAll(s, [playCard('runner', 0), pass('runner')]); // Let Ice Wall through: End the run
    expect(r.events.some((e) => e.type === 'card_accessed')).toBe(false);
    expect(r.events.at(-1)).toEqual({ type: 'run_ended', server: 'rd', outcome: 'ended_by_ice' });
  });

  it('not enough credits: no_credits, nothing spent', () => {
    const s = withRunEvent('r07', { runnerCredits: 1 });
    expect(rejection(apply(s, playCard('runner', 0)).events)).toBe('no_credits');
  });
});

describe('S-03-5 AC2: Inside Job', () => {
  it('handOptions: one play per server (the server pick), each 2 credits', () => {
    const s = withRunEvent('r11', { servers: { remote1: {} } });
    expect(viewFor('runner', s).handOptions[0]).toEqual(
      ['hq', 'rd', 'archives', 'remote1'].map((sv) => ({ action: playCard('runner', 0, sv as ServerId), cost: 2, reject: null })),
    );
  });

  it('the first rezzed ICE met is bypassed: nothing fires, no breaking needed', () => {
    const s = withRunEvent('r11', { servers: { hq: { ice: ['+c05'] } } });
    const r = act(s, playCard('runner', 0, 'hq'));
    expect(r.events.slice(2)).toEqual([
      { type: 'run_started', server: 'hq', cardId: 'r11' },
      { type: 'ice_approached', uid: 'i1', position: 0 },
      { type: 'ice_encountered', uid: 'i1' },
      { type: 'ice_bypassed', uid: 'i1' },
      { type: 'ice_passed', uid: 'i1' },
    ]);
    expect(r.state.run).toMatchObject({ step: 'continue', bypassNext: false });
    const into = act(r.state, pass('runner'));
    expect(into.events[0]).toEqual({ type: 'run_successful', server: 'hq' });
  });

  it("face-down ICE the Corp doesn't rez doesn't count: the bypass waits for the first encountered ICE", () => {
    // HQ: i1 Ice Wall rezzed (inner), i2 Wall of Static face down (outer).
    const s = withRunEvent('r11', { servers: { hq: { ice: ['+c05', 'c04'] } }, corpCredits: 5 });
    let r = act(s, playCard('runner', 0, 'hq'));
    expect(viewFor('runner', r.state).run!.bypassPending).toBe(true);
    r = playAll(r.state, [pass('corp')]); // Don't rez Wall of Static
    expect(r.events).toEqual([{ type: 'ice_passed', uid: 'i2' }]);
    expect(viewFor('runner', r.state).run!.bypassPending).toBe(true);
    r = playAll(r.state, [pass('runner')]); // Continue to Ice Wall: encountered, bypassed
    expect(r.events).toEqual([
      { type: 'ice_approached', uid: 'i1', position: 0 },
      { type: 'ice_encountered', uid: 'i1' },
      { type: 'ice_bypassed', uid: 'i1' },
      { type: 'ice_passed', uid: 'i1' },
    ]);
    expect(viewFor('runner', r.state).run!.bypassPending).toBe(false);
  });

  it('ICE the Corp rezzes on approach is encountered, so it is the one bypassed', () => {
    const s = withRunEvent('r11', { servers: { hq: { ice: ['c04'] } }, corpCredits: 5 });
    const r = playAll(s, [playCard('runner', 0, 'hq'), rez('i1')]);
    expect(r.events.slice(-4)).toEqual([
      { type: 'ice_rezzed', uid: 'i1', cardId: 'c04' },
      { type: 'ice_encountered', uid: 'i1' },
      { type: 'ice_bypassed', uid: 'i1' },
      { type: 'ice_passed', uid: 'i1' },
    ]);
  });

  it('only the first: the next rezzed ICE is encountered normally', () => {
    const s = withRunEvent('r11', { servers: { hq: { ice: ['+c05', '+c05'] } } });
    const r = playAll(s, [playCard('runner', 0, 'hq'), pass('runner')]);
    expect(r.state.run).toMatchObject({ step: 'encounter', position: 0 });
    const let1 = act(r.state, pass('runner'));
    expect(let1.events.at(-1)).toEqual({ type: 'run_ended', server: 'hq', outcome: 'ended_by_ice' });
  });

  it('a server with no ICE: straight in (the bypass is unused)', () => {
    const r = act(withRunEvent('r11', { corpHand: ['c01'] }), playCard('runner', 0, 'hq'));
    expect(r.events.slice(2).map((e) => e.type)).toEqual(['run_started', 'run_successful', 'card_accessed']);
  });
});

describe('S-03-5 AC3: Neural EMP', () => {
  /** Corp turn 3 with Neural EMP as hand card 0; `ran` = the Runner made a run on turn 2. */
  function corpTurnAfter(ran: boolean, runnerHand = ['r01', 'r03', 'r09']): GameState {
    let s = board({ corpHand: ['c12'], corpDeck: ['c01', 'c02', 'c03'], runnerHand });
    if (ran) s = playAll(s, [{ type: 'run', player: 'runner', server: 'hq' }, pass('runner')]).state;
    s = finishTurn(s).state;
    expect(s.activePlayer).toBe('corp');
    return withHand(s, 'corp', ['c12', 'c01']);
  }

  it('after a run last turn: 2 credits, the Runner takes 1 net damage', () => {
    const s = corpTurnAfter(true);
    expect(s.lastRunTurn).toBe(s.turn - 1);
    expect(viewFor('corp', s).handOptions[0]).toEqual([{ action: playCard('corp', 0), cost: 2, reject: null }]);
    const r = act(s, playCard('corp', 0));
    expect(r.events[0]).toEqual({ type: 'credits_spent', player: 'corp', amount: 2 });
    expect(r.events[1]).toEqual({ type: 'card_played', player: 'corp', cardId: 'c12', handIndex: 0 });
    expect(r.events[2]).toMatchObject({ type: 'net_damage', amount: 1 });
    expect(r.state.players.runner.hand).toHaveLength(2);
    expect(r.state.players.runner.discard).toHaveLength(1);
  });

  it('no run last turn: condition_not_met, nothing spent (offered dimmed with that reason)', () => {
    const s = corpTurnAfter(false);
    expect(viewFor('corp', s).handOptions[0]).toEqual([{ action: playCard('corp', 0), cost: 2, reject: 'condition_not_met' }]);
    const snapshot = clone(s);
    const r = apply(s, playCard('corp', 0));
    expect(r.events).toEqual([{ type: 'action_rejected', reason: 'condition_not_met' }]);
    expect(r.state).toBe(s);
    expect(s).toEqual(snapshot);
    expect(legalActions(s, 'corp')).not.toContainEqual(playCard('corp', 0));
  });

  it('a run two turns ago does not count', () => {
    let s = corpTurnAfter(true);
    s = finishTurn(finishTurn(s).state).state; // Runner turn 4 without a run, Corp turn 5
    s = withHand(s, 'corp', ['c12']);
    expect(rejection(apply(s, playCard('corp', 0)).events)).toBe('condition_not_met');
  });

  it('a run started by a run event counts too', () => {
    let s = withRunEvent('r07', { corpHand: ['c12'], corpDeck: ['c01', 'c02', 'c03', 'c04'] });
    s = playAll(s, [playCard('runner', 0), pass('runner'), pass('runner'), pass('runner')]).state;
    s = withHand(finishTurn(s).state, 'corp', ['c12']);
    expect(rejection(apply(s, playCard('corp', 0)).events)).toBeNull();
  });

  it('against an empty Grip: flatline, the Corp wins at once', () => {
    const s = withPlayer(corpTurnAfter(true), 'runner', { hand: [] });
    const r = act(s, playCard('corp', 0));
    expect(r.events.slice(2)).toEqual([
      { type: 'net_damage', amount: 1, cardIds: [] },
      { type: 'game_over', winner: 'corp', reason: 'flatline' },
    ]);
    expect(r.state.result).toEqual({ winner: 'corp', reason: 'flatline' });
  });
});

describe('S-03-5 AC4: no card says "Needs runs" any more', () => {
  it('every starter card in hand is offered with a reason other than not_implemented', () => {
    const runnerTurn = board({ runnerHand: [...new Set(RUNNER_STARTER_DECK)], runnerCredits: 50 });
    const corpTurn = { ...board({ corpHand: [...new Set(CORP_STARTER_DECK)], corpCredits: 50 }), activePlayer: 'corp' as const };
    for (const [s, p] of [
      [runnerTurn, 'runner'],
      [withPlayer(corpTurn, 'corp', { clicks: 3 }), 'corp'],
    ] as const) {
      const opts = viewFor(p, s).handOptions;
      expect(opts.length).toBe(12);
      for (const o of opts.flat()) expect(o.reject).not.toBe('not_implemented');
    }
  });
});
