// Sprint 4 E2: agendas' "when scored" bonuses (S-04-4 AC1, AC4; RULES_SPEC "When scored" bonuses).
import { describe, expect, it } from 'vitest';
import { apply, hasMeaningfulResponse, legalActions, newGame, viewEvents, viewFor, waitingOn, type Action } from '../src/index';
import { act, board, clone, corpBoard, liveness, rejection, run, withHand, withPlayer } from './helpers';
import { expectRunnerViewClean } from './hidden';

const score = (uid: string): Action => ({ type: 'score', player: 'corp', uid });

describe('S-04-4 AC1: Hostile Takeover — +7 credits and 1 bad publicity when scored', () => {
  it('events in card order: agenda_scored, credit_gained 7, bad_publicity_gained; state updated', () => {
    const s = corpBoard(['c08'], { ready: ['i1'], credits: 2 });
    expect(s.badPublicity).toBe(0);
    const r = apply(s, score('i1'));
    expect(r.events).toEqual([
      { type: 'agenda_scored', uid: 'i1', cardId: 'c08', points: 1 },
      { type: 'credit_gained', player: 'corp', amount: 7 },
      { type: 'bad_publicity_gained', amount: 1, total: 1 },
    ]);
    expect(r.state.players.corp).toMatchObject({ credits: 9, scoreArea: ['c08'], clicks: 3 });
    expect(r.state.badPublicity).toBe(1);
    expect(r.state.phase).toBe('action');
    expect(r.state.choice).toBeNull();
    // All public: the Runner's projection is identical.
    expect(viewEvents('runner', r.events)).toEqual(r.events);
  });

  it('both players see the bad publicity in their view', () => {
    const s = act(corpBoard(['c08'], { ready: ['i1'] }), score('i1')).state;
    expect(viewFor('corp', s).badPublicity).toBe(1);
    expect(viewFor('runner', s).badPublicity).toBe(1);
    expect(viewFor('runner', newGame(1)).badPublicity).toBe(0);
  });

  it('a second Hostile Takeover adds up: total 2', () => {
    let s = corpBoard(['c08', 'c08'], { ready: ['i1', 'i2'] });
    s = act(s, score('i1')).state;
    const r = act(s, score('i2'));
    expect(r.events).toContainEqual({ type: 'bad_publicity_gained', amount: 1, total: 2 });
    expect(r.state.badPublicity).toBe(2);
    expect(r.state.players.corp.credits).toBe(5 + 14);
  });

  it('agendas without a bonus (Private Security Force) score only their points', () => {
    const r = act(corpBoard(['c09'], { ready: ['i1'] }), score('i1'));
    expect(r.events).toEqual([{ type: 'agenda_scored', uid: 'i1', cardId: 'c09', points: 2 }]);
    expect(r.state.badPublicity).toBe(0);
  });

  it('a score that reaches 7 points ends the game first: no bonus', () => {
    const s = corpBoard(['c08'], { ready: ['i1'], scored: ['c10', 'c09', 'c08'], credits: 0 });
    const r = act(s, score('i1'));
    expect(r.events).toEqual([
      { type: 'agenda_scored', uid: 'i1', cardId: 'c08', points: 1 },
      { type: 'game_over', winner: 'corp', reason: 'agenda_points' },
    ]);
    expect(r.state.players.corp.credits).toBe(0);
    expect(r.state.badPublicity).toBe(0);
  });

  it('Priority Requisition winning the game opens no choice (bonus skipped)', () => {
    const s = corpBoard(['c05', 'c10'], { ready: ['i2'], scored: ['c09', 'c09'] });
    const r = act(s, score('i2'));
    expect(r.events.map((e) => e.type)).toEqual(['agenda_scored', 'game_over']);
    expect(r.state.phase).toBe('over');
    expect(r.state.choice).toBeNull();
  });
});

describe('S-04-4 AC4: stealing an agenda triggers no bonus', () => {
  const steal = (card: number): Action => ({ type: 'steal', player: 'runner', card });
  const runOn = (server: string): Action => ({ type: 'run', player: 'runner', server } as Action);

  it('Hostile Takeover stolen: no credits for the Corp, no bad publicity', () => {
    const s = board({ servers: { remote1: { content: ['c08'] } }, corpCredits: 4 });
    const r = run(s, [runOn('remote1'), steal(0)]);
    expect(r.state.players.runner.scoreArea).toEqual(['c08']);
    expect(r.state.players.corp.credits).toBe(4);
    expect(r.state.badPublicity).toBe(0);
    expect(r.events.map((e) => e.type)).not.toContain('bad_publicity_gained');
    expect(r.events.filter((e) => e.type === 'credit_gained')).toEqual([]);
  });

  it('Priority Requisition stolen with face-down ICE on the table: no choice opens', () => {
    const s = board({ servers: { hq: { ice: ['c04'] }, remote1: { content: ['c10'] } }, corpCredits: 0 });
    const r = run(s, [runOn('remote1'), steal(0)]);
    expect(r.state.players.runner.scoreArea).toEqual(['c10']);
    expect(r.state.phase).toBe('action');
    expect(r.state.choice).toBeNull();
    expect(r.events.map((e) => e.type)).not.toContain('choice_opened');
    expect(r.state.servers[0]!.ice[0]!.rezzed).toBe(false);
  });

  it('stolen from HQ (accessed from the hand): no bonus either', () => {
    const s = board({ corpHand: ['c08'], corpCredits: 4 });
    const r = run(s, [runOn('hq'), steal(0)]);
    expect(r.state.players.runner.scoreArea).toEqual(['c08']);
    expect(r.state.players.corp.credits).toBe(4);
    expect(r.state.badPublicity).toBe(0);
  });
});

describe('S-04-4 AC3: Priority Requisition — rez one face-down ICE for free, or Skip', () => {
  // i1 Wall of Static (remote1), i2 Neural Katana (remote2, rezzed below), i3 Ice Wall (remote3), i4 PR (remote4).
  const prReady = (credits = 0) => {
    const s = corpBoard(['c04', 'c07', 'c05', 'c10'], { ready: ['i4'], credits });
    return { ...s, servers: s.servers.map((sv) => ({ ...sv, ice: sv.ice.map((c) => (c.uid === 'i2' ? { ...c, rezzed: true } : c)) })) };
  };
  const rez = (uid: string, player: 'corp' | 'runner' = 'corp'): Action => ({ type: 'rez', player, uid });
  const pass = (player: 'corp' | 'runner' = 'corp'): Action => ({ type: 'pass', player });
  const opened = () => act(prReady(), score('i4')).state;

  it('scoring opens the choice: agenda_scored, choice_opened; the game waits on the Corp', () => {
    const r = act(prReady(), score('i4'));
    expect(r.events).toEqual([
      { type: 'agenda_scored', uid: 'i4', cardId: 'c10', points: 3 },
      { type: 'choice_opened', kind: 'free_rez', player: 'corp', cardId: 'c10' },
    ]);
    expect(r.state.phase).toBe('choice');
    expect(r.state.choice).toEqual({ kind: 'free_rez', player: 'corp', cardId: 'c10' });
    expect(waitingOn(r.state)).toBe('corp');
    expect(hasMeaningfulResponse(r.state, 'corp')).toBe(true);
    expect(hasMeaningfulResponse(r.state, 'runner')).toBe(false);
    expect(viewEvents('runner', r.events)).toEqual(r.events);
  });

  it('Corp view: one free rez per face-down ICE (rezzed ICE not offered), then Skip; legalActions match', () => {
    const s = opened();
    const v = viewFor('corp', s);
    expect(v.phase).toBe('choice');
    expect(v.choice).toEqual({
      kind: 'free_rez',
      waitingOn: 'corp',
      cardId: 'c10',
      options: [
        { action: rez('i1'), cost: 0, reject: null },
        { action: rez('i3'), cost: 0, reject: null },
        { action: pass(), cost: 0, reject: null },
      ],
    });
    expect(v.legalActions).toEqual([rez('i1'), rez('i3'), pass()]);
  });

  it('Runner view: sees the choice and who decides, no options, ICE still face down', () => {
    const v = viewFor('runner', opened());
    expect(v.choice).toEqual({ kind: 'free_rez', waitingOn: 'corp', cardId: 'c10', options: [] });
    expect(v.legalActions).toEqual([]);
    const ice = v.corpServers.flatMap((sv) => sv.ice);
    expect(ice.map((c) => [c.uid, c.cardId])).toEqual([
      ['i1', null],
      ['i2', 'c07'],
      ['i3', null],
    ]);
    expectRunnerViewClean(opened(), 'free_rez choice');
  });

  it('rez: free even with 0 credits (Wall of Static costs 3), choice closes, the Corp turn goes on', () => {
    const s = opened();
    expect(s.players.corp.credits).toBe(0);
    const r = act(s, rez('i1'));
    expect(r.events).toEqual([
      { type: 'ice_rezzed', uid: 'i1', cardId: 'c04' },
      { type: 'choice_closed', kind: 'free_rez', skipped: false },
    ]);
    expect(r.state.phase).toBe('action');
    expect(r.state.choice).toBeNull();
    expect(r.state.players.corp).toMatchObject({ credits: 0, clicks: 3 });
    expect(r.state.servers.find((sv) => sv.id === 'remote1')!.ice[0]!.rezzed).toBe(true);
    expect(viewFor('runner', r.state).corpServers.find((sv) => sv.id === 'remote1')!.ice[0]!.cardId).toBe('c04');
    expect(viewFor('corp', r.state).choice).toBeNull();
    expect(legalActions(r.state, 'corp')).toContainEqual({ type: 'gain_credit', player: 'corp' });
  });

  it('rez ICE protecting a central server works too', () => {
    let s = corpBoard(['c10'], { ready: ['i1'] });
    s = act(withHand(withPlayer(s, 'corp', { clicks: 1 }), 'corp', ['c07']), { type: 'install', player: 'corp', handIndex: 0, server: 'hq' }).state;
    s = act(s, score('i1')).state;
    expect(viewFor('corp', s).choice?.options.map((o) => o.action)).toEqual([rez('i2'), pass()]);
    expect(act(s, rez('i2')).state.servers[0]!.ice[0]).toMatchObject({ uid: 'i2', cardId: 'c07', rezzed: true });
  });

  it('Skip (pass): choice closes, nothing rezzed', () => {
    const s = opened();
    const r = act(s, pass());
    expect(r.events).toEqual([{ type: 'choice_closed', kind: 'free_rez', skipped: true }]);
    expect(r.state.phase).toBe('action');
    expect(r.state.choice).toBeNull();
    expect(r.state.servers.flatMap((sv) => sv.ice).map((c) => c.rezzed)).toEqual([false, true, false]);
  });

  it('no face-down ICE installed: no window, no event (auto-pass)', () => {
    const noIce = act(corpBoard(['c10'], { ready: ['i1'] }), score('i1'));
    expect(noIce.events).toEqual([{ type: 'agenda_scored', uid: 'i1', cardId: 'c10', points: 3 }]);
    expect(noIce.state.phase).toBe('action');
    const s = prReady();
    const allRezzed = { ...s, servers: s.servers.map((sv) => ({ ...sv, ice: sv.ice.map((c) => ({ ...c, rezzed: true })) })) };
    const r = act(allRezzed, score('i4'));
    expect(r.events.map((e) => e.type)).toEqual(['agenda_scored']);
    expect(r.state.choice).toBeNull();
  });

  const corpOthers: Action[] = [
    { type: 'draw', player: 'corp' },
    { type: 'gain_credit', player: 'corp' },
    { type: 'end_turn', player: 'corp' },
    { type: 'discard', player: 'corp', handIndices: [] },
    { type: 'install', player: 'corp', handIndex: 0, server: 'new' },
    { type: 'play', player: 'corp', handIndex: 0 },
    { type: 'advance', player: 'corp', uid: 'i4' },
    { type: 'score', player: 'corp', uid: 'i4' },
    { type: 'jack_out', player: 'corp' },
    { type: 'use_ability', player: 'corp', uid: 'i1', ability: 0, sub: 0 },
    { type: 'steal', player: 'corp', card: 0 },
    { type: 'trash', player: 'corp', card: 0 },
  ];
  it.each(corpOthers.map((a) => [a.type, a] as const))('Corp %s during the choice: wrong_phase, state unchanged', (_t, action) => {
    const s = withHand(opened(), 'corp', ['c01']);
    const r = apply(s, action);
    expect(r.events).toEqual([{ type: 'action_rejected', reason: 'wrong_phase' }]);
    expect(r.state).toBe(s);
  });

  const runnerAll: Action[] = [
    rez('i1', 'runner'),
    pass('runner'),
    { type: 'draw', player: 'runner' },
    { type: 'gain_credit', player: 'runner' },
    { type: 'run', player: 'runner', server: 'hq' },
    { type: 'jack_out', player: 'runner' },
    { type: 'end_turn', player: 'runner' },
  ];
  it.each(runnerAll.map((a) => [a.type, a] as const))('Runner %s during the choice: not_your_turn', (_t, action) => {
    const s = opened();
    expect(apply(s, action).events).toEqual([{ type: 'action_rejected', reason: 'not_your_turn' }]);
  });

  it.each([
    ['already rezzed ICE', 'i2'],
    ['an agenda (not ICE)', 'i4'],
    ['unknown uid', 'i99'],
  ])('rez on %s: bad_target', (_what, uid) => {
    const s = opened();
    expect(apply(s, rez(uid)).events).toEqual([{ type: 'action_rejected', reason: 'bad_target' }]);
  });

  it('rez with a non-string uid: invalid_action; after the game is over: game_over', () => {
    const s = opened();
    expect(rejection(apply(s, { type: 'rez', player: 'corp', uid: 3 } as unknown as Action).events)).toBe('invalid_action');
    const over = { ...s, phase: 'over' as const, result: { winner: 'runner' as const, reason: 'corp_decked' as const }, choice: null };
    expect(rejection(apply(over, rez('i1')).events)).toBe('game_over');
  });

  it('outside a choice, rez of a non-approached ICE is still wrong_phase (no run)', () => {
    const s = prReady();
    expect(rejection(apply(s, rez('i1')).events)).toBe('wrong_phase');
    expect(rejection(apply(s, pass()).events)).toBe('wrong_phase');
  });

  it('replays to the same state (choice and answer are in the action log)', () => {
    const s = act(opened(), rez('i3')).state;
    expect(clone(s)).toEqual(s); // plain JSON
    expect(liveness(opened())).toBe('corp');
    expect(liveness(s)).toBe('corp');
  });
});
