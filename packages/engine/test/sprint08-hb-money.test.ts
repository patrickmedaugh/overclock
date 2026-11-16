// Sprint 8 E4 (S-08-2): Adonis Campaign ("when rezzed"), Melange Mining Corp. (Corp click ability),
// Biotic Labor (gaining clicks), and the P1 rule (face-down Corp cards do nothing, leak nothing).
import { describe, expect, it } from 'vitest';
import { apply, viewEvents, viewFor, type Action, type GameEvent, type GameState } from '../src/index';
import { act, coreGame, finishTurn, rejection, withHand, withPlayer } from './helpers';
import { expectRunnerEventsClean, expectRunnerViewClean } from './hidden';

const types = (events: readonly GameEvent[]) => events.map((e) => e.type);
const installNew = (handIndex: number): Action => ({ type: 'install', player: 'corp', handIndex, server: 'new' });

/** Core game, Corp turn 1: `hand` installed into new remotes (uids i1, i2, …), then clicks/credits set. */
function installed(hand: string[], credits = 10, clicks = 3): GameState {
  let s = withPlayer(withHand(coreGame(11), 'corp', hand), 'corp', { clicks: hand.length + 1, credits: 0 });
  for (let i = 0; i < hand.length; i++) s = act(s, installNew(0)).state;
  return withPlayer(s, 'corp', { clicks, credits });
}

/** Ends the Corp's turn and the Runner's turn: the next Corp turn has begun (both turn-start event lists). */
function nextCorpTurn(s: GameState): { state: GameState; events: GameEvent[] } {
  const runner = finishTurn(s);
  const corp = finishTurn(runner.state);
  return { state: corp.state, events: [...runner.events, ...corp.events] };
}

const rez = (uid: string): Action => ({ type: 'rez', player: 'corp', uid });

describe('S-08-2 AC1: rezzing Adonis Campaign (4 credits) puts 12 credits on it, seen by both', () => {
  it('rez → credits_spent 4, card_rezzed, ability_triggered{rez}, hosted_credits_changed 12', () => {
    const s = installed(['c14'], 5);
    const opt = viewFor('corp', s).installedOptions['i1']!;
    expect(opt).toEqual([{ action: rez('i1'), cost: 4, reject: null }]);
    const r = act(s, rez('i1'));
    expect(r.events).toEqual([
      { type: 'credits_spent', player: 'corp', amount: 4 },
      { type: 'card_rezzed', uid: 'i1', cardId: 'c14', server: 'remote1' },
      { type: 'ability_triggered', uid: 'i1', cardId: 'c14', trigger: 'rez' },
      { type: 'hosted_credits_changed', uid: 'i1', credits: 12 },
    ]);
    expect(r.state.players.corp.credits).toBe(1);
    for (const viewer of ['corp', 'runner'] as const) {
      const card = viewFor(viewer, r.state).corpServers.find((sv) => sv.id === 'remote1')!.content[0]!;
      expect(card).toEqual({ uid: 'i1', cardId: 'c14', faceUp: true, advancements: 0, hostedCredits: 12 });
    }
    expect(viewEvents('runner', r.events)).toEqual(r.events);
    expectRunnerEventsClean(r.events, 'Adonis rez', r.state);
    expectRunnerViewClean(r.state, 'Adonis rez');
  });
});

describe('S-08-2 AC2: a face-up Adonis Campaign gives 3 credits when the Corp turn begins; empty → Archives', () => {
  it('turn start: ability_triggered{turn_start}, hosted 9, credit_gained 3 — before the mandatory draw', () => {
    const s = act(installed(['c14'], 5), rez('i1')).state;
    const { state, events } = nextCorpTurn(s);
    const start = events.slice(events.findIndex((e) => e.type === 'turn_started' && e.player === 'corp'));
    expect(start.slice(0, 5)).toEqual([
      { type: 'turn_started', player: 'corp', turn: 3, clicks: 3 },
      { type: 'ability_triggered', uid: 'i1', cardId: 'c14', trigger: 'turn_start' },
      { type: 'hosted_credits_changed', uid: 'i1', credits: 9 },
      { type: 'credit_gained', player: 'corp', amount: 3 },
      expect.objectContaining({ type: 'card_drawn', player: 'corp' }),
    ]);
    expect(state.servers.find((sv) => sv.id === 'remote1')!.content[0]!.hostedCredits).toBe(9);
    // The Runner's turn start does nothing with it.
    const runnerStart = events.slice(0, events.findIndex((e) => e.type === 'turn_started' && e.player === 'corp'));
    expect(types(runnerStart)).not.toContain('ability_triggered');
  });

  it('12 credits last four Corp turns; the last take trashes it face up to Archives and the empty remote goes', () => {
    let s = act(installed(['c14'], 5), rez('i1')).state;
    let credits: number[] = [];
    let last: GameEvent[] = [];
    for (let k = 0; k < 4; k++) {
      const before = s.players.corp.credits;
      const r = nextCorpTurn(s);
      s = r.state;
      last = r.events;
      credits = [...credits, s.players.corp.credits - before];
    }
    expect(credits).toEqual([3, 3, 3, 3]);
    const at = last.findIndex((e) => e.type === 'hosted_credits_changed');
    expect(last.slice(at, at + 4)).toEqual([
      { type: 'hosted_credits_changed', uid: 'i1', credits: 0 },
      { type: 'credit_gained', player: 'corp', amount: 3 },
      { type: 'corp_card_trashed', uid: 'i1', cardId: 'c14', server: 'remote1' },
      { type: 'server_removed', server: 'remote1' },
    ]);
    expect(s.servers.find((sv) => sv.id === 'remote1')).toBeUndefined();
    expect(s.players.corp.discard.at(-1)).toEqual({ cardId: 'c14', faceUp: true });
    expect(viewFor('runner', s).players.corp.discard.at(-1)).toBe('c14');
    expectRunnerEventsClean(last, 'Adonis trashed', s);
    expectRunnerViewClean(s, 'Adonis trashed');
  });

  it('a remote that still holds an upgrade stays when Adonis goes', () => {
    let s = installed(['c14'], 10, 3);
    s = withHand(s, 'corp', ['c11']);
    s = act(s, { type: 'install', player: 'corp', handIndex: 0, server: 'remote1' }).state;
    s = act(s, rez('i1')).state;
    s = { ...s, servers: s.servers.map((sv) => ({ ...sv, content: sv.content.map((c) => (c.uid === 'i1' ? { ...c, hostedCredits: 3 } : c)) })) };
    const r = nextCorpTurn(s);
    expect(types(r.events)).toContain('corp_card_trashed');
    expect(types(r.events)).not.toContain('server_removed');
    expect(r.state.servers.find((sv) => sv.id === 'remote1')!.content.map((c) => c.cardId)).toEqual(['c11']);
  });
});

describe('S-08-2 AC3: Melange Mining Corp. — 3 clicks: gain 7 credits', () => {
  it('face up with 3 clicks: one activate option (clicks 3, gain 7); using it spends every click and gives 7', () => {
    let s = act(installed(['c15'], 1), rez('i1')).state;
    s = withPlayer(s, 'corp', { clicks: 3, credits: 0 });
    const opts = viewFor('corp', s).installedOptions['i1']!;
    const use: Action = { type: 'activate', player: 'corp', uid: 'i1', ability: 0 };
    expect(opts).toEqual([{ action: use, cost: 0, reject: null, clicks: 3, gain: 7 }]);
    const r = act(s, use);
    expect(r.events).toEqual([
      { type: 'ability_triggered', uid: 'i1', cardId: 'c15', trigger: 'click' },
      { type: 'credit_gained', player: 'corp', amount: 7 },
    ]);
    expect(r.state.players.corp.clicks).toBe(0);
    expect(r.state.players.corp.credits).toBe(7);
    expect(viewEvents('runner', r.events)).toEqual(r.events);
    // It never runs out (no hosted credits): offered again next turn.
    const later = nextCorpTurn(r.state).state;
    expect(viewFor('corp', later).installedOptions['i1']![0]!.reject).toBeNull();
  });

  it('with fewer than 3 clicks the option is listed with no_clicks; apply agrees', () => {
    let s = act(installed(['c15'], 1), rez('i1')).state;
    s = withPlayer(s, 'corp', { clicks: 2 });
    const use: Action = { type: 'activate', player: 'corp', uid: 'i1', ability: 0 };
    expect(viewFor('corp', s).installedOptions['i1']).toEqual([{ action: use, cost: 0, reject: 'no_clicks', clicks: 3, gain: 7 }]);
    expect(rejection(apply(s, use).events)).toBe('no_clicks');
  });

  it("only on the Corp's own turn outside a run; never for the Runner", () => {
    let s = act(installed(['c15'], 1), rez('i1')).state;
    s = finishTurn(s).state;
    const use: Action = { type: 'activate', player: 'corp', uid: 'i1', ability: 0 };
    expect(rejection(apply(s, use).events)).toBe('not_your_turn');
    expect(viewFor('runner', s).installedOptions['i1']).toBeUndefined();
    expect(rejection(apply(s, { ...use, player: 'runner' }).events)).toBe('bad_target');
  });
});

describe('S-08-2 AC4: Biotic Labor (cost 4) gives 2 clicks', () => {
  it('play with 3 clicks: 2 left, then +2 = 4 usable clicks; clicks_gained is public', () => {
    const s = withPlayer(withHand(coreGame(11), 'corp', ['c16']), 'corp', { clicks: 3, credits: 4 });
    const r = act(s, { type: 'play', player: 'corp', handIndex: 0 });
    expect(r.events).toEqual([
      { type: 'credits_spent', player: 'corp', amount: 4 },
      { type: 'card_played', player: 'corp', cardId: 'c16', handIndex: 0 },
      { type: 'clicks_gained', player: 'corp', amount: 2 },
    ]);
    expect(r.state.players.corp.clicks).toBe(4);
    expect(viewFor('runner', r.state).players.corp.clicks).toBe(4);
    let t = r.state;
    for (let k = 0; k < 4; k++) t = act(t, { type: 'gain_credit', player: 'corp' }).state;
    expect(t.players.corp.credits).toBe(4);
    expect(rejection(apply(t, { type: 'gain_credit', player: 'corp' }).events)).toBe('no_clicks');
  });

  it('with its last click: 0 + 2 = 2 clicks left; costs 4 (no_credits at 3)', () => {
    const s = withPlayer(withHand(coreGame(11), 'corp', ['c16']), 'corp', { clicks: 1, credits: 4 });
    expect(act(s, { type: 'play', player: 'corp', handIndex: 0 }).state.players.corp.clicks).toBe(2);
    expect(rejection(apply(withPlayer(s, 'corp', { credits: 3 }), { type: 'play', player: 'corp', handIndex: 0 }).events)).toBe('no_credits');
  });
});

describe('S-08-2 AC5 (P1): a face-down Adonis Campaign or Melange Mining Corp. does nothing and leaks nothing', () => {
  it('installed face down: no credits on it, no ability option (only Rez), the Runner learns nothing', () => {
    let s = withPlayer(withHand(coreGame(11), 'corp', ['c14', 'c15']), 'corp', { clicks: 3, credits: 5 });
    const events: GameEvent[] = [];
    for (let i = 0; i < 2; i++) {
      const r = act(s, installNew(0));
      events.push(...r.events);
      s = r.state;
    }
    expect(types(events)).not.toContain('hosted_credits_changed');
    expect(s.servers.flatMap((sv) => sv.content).map((c) => c.hostedCredits)).toEqual([0, 0]);
    const opts = viewFor('corp', s).installedOptions;
    expect(opts['i1']!.map((o) => o.action.type)).toEqual(['rez']);
    expect(opts['i2']!.map((o) => o.action.type)).toEqual(['rez']);
    expect(rejection(apply(s, { type: 'activate', player: 'corp', uid: 'i2', ability: 0 }).events)).toBe('bad_target');
    expectRunnerEventsClean(events, 'face-down installs', s);
    expectRunnerViewClean(s, 'face-down installs');
    // The Runner's two face-down cards look exactly alike (same fields, no hosted credits).
    const rv = viewFor('runner', s).corpServers.flatMap((sv) => sv.content);
    expect(rv.map(({ uid: _u, ...rest }) => rest)).toEqual([
      { cardId: null, faceUp: false, advancements: 0, hostedCredits: 0 },
      { cardId: null, faceUp: false, advancements: 0, hostedCredits: 0 },
    ]);
  });

  it("when the Corp's turn begins nothing happens for them (no trigger, no credit)", () => {
    let s = withPlayer(withHand(coreGame(11), 'corp', ['c14', 'c15']), 'corp', { clicks: 3, credits: 5 });
    s = act(act(s, installNew(0)).state, installNew(0)).state;
    const before = s.players.corp.credits;
    const r = nextCorpTurn(s);
    expect(r.events.filter((e) => e.type === 'ability_triggered')).toEqual([]);
    expect(r.state.players.corp.credits).toBe(before);
    expectRunnerEventsClean(r.events, 'turn start, face down', r.state);
    expectRunnerViewClean(r.state, 'turn start, face down');
  });
});
