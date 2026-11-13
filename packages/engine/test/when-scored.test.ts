// Sprint 4 E2: agendas' "when scored" bonuses (S-04-4 AC1, AC4; RULES_SPEC "When scored" bonuses).
import { describe, expect, it } from 'vitest';
import { apply, newGame, viewEvents, viewFor, type Action } from '../src/index';
import { act, board, corpBoard, run } from './helpers';

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
