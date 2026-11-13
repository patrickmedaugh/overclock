// Sprint 3 E2: advance and score agendas; score areas, points, 7-point win (S-03-2 engine side).
import { describe, expect, it } from 'vitest';
import {
  WINNING_POINTS,
  apply,
  legalActions,
  newGame,
  viewEvents,
  viewFor,
  type Action,
  type GameState,
  type RejectReason,
  type Side,
} from '../src/index';
import { clone, finishTurn, rejection, run, withHand, withPlayer } from './helpers';

const advance = (player: Side, uid: string): Action => ({ type: 'advance', player, uid });
const score = (player: Side, uid: string): Action => ({ type: 'score', player, uid });

/** Corp turn 1: `hand` installed one by one into new servers (uids i1, i2, ...), then clicks/credits set. */
function corpInstalled(hand: string[], clicks = 3, credits = 5): GameState {
  let s = withPlayer(withHand(newGame(21), 'corp', hand), 'corp', { clicks: hand.length, credits });
  s = run(s, hand.map(() => ({ type: 'install', player: 'corp', handIndex: 0, server: 'new' }) as Action)).state;
  return withPlayer(s, 'corp', { clicks, credits });
}

const installedCard = (s: GameState, uid: string) =>
  s.servers.flatMap((sv) => [...sv.ice, ...sv.content]).find((c) => c.uid === uid);

function expectRejected(state: GameState, action: Action, reason: RejectReason): void {
  const snapshot = clone(state);
  const r = apply(state, action);
  expect(r.events).toEqual([{ type: 'action_rejected', reason }]);
  expect(r.state).toBe(state);
  expect(state).toEqual(snapshot);
  if (reason !== 'invalid_action') expect(legalActions(state, action.player)).not.toContainEqual(action);
}

describe('S-03-2 AC1: advance (1 click + 1 credit, own installed agenda)', () => {
  it('puts a counter on the agenda, spends 1 click and 1 credit, events in order', () => {
    const s = corpInstalled(['c08']);
    const r = apply(s, advance('corp', 'i1'));
    expect(r.events).toEqual([
      { type: 'credits_spent', player: 'corp', amount: 1 },
      { type: 'card_advanced', uid: 'i1', advancements: 1 },
    ]);
    expect(r.state.players.corp).toMatchObject({ clicks: 2, credits: 4 });
    expect(installedCard(r.state, 'i1')).toEqual({ uid: 'i1', cardId: 'c08', rezzed: false, advancements: 1 });
    const again = apply(r.state, advance('corp', 'i1'));
    expect(installedCard(again.state, 'i1')?.advancements).toBe(2);
  });

  it('AC2: both players see the counters; the Runner still sees only the card back', () => {
    const s = run(corpInstalled(['c09']), [advance('corp', 'i1'), advance('corp', 'i1')]).state;
    const rv = viewFor('runner', s).corpServers.find((sv) => sv.id === 'remote1')!.content[0];
    expect(rv).toEqual({ uid: 'i1', cardId: null, faceUp: false, advancements: 2 });
    const cv = viewFor('corp', s).corpServers.find((sv) => sv.id === 'remote1')!.content[0];
    expect(cv).toEqual({ uid: 'i1', cardId: 'c09', faceUp: false, advancements: 2 });
    // card_advanced is public and names no card.
    expect(viewEvents('runner', apply(s, advance('corp', 'i1')).events)).toEqual([
      { type: 'credits_spent', player: 'corp', amount: 1 },
      { type: 'card_advanced', uid: 'i1', advancements: 3 },
    ]);
  });

  const discardStep = () =>
    run(withHand(corpInstalled(['c08']), 'corp', ['c01', 'c01', 'c01', 'c01', 'c01', 'c01']), [{ type: 'end_turn', player: 'corp' }]).state;
  const cases: [RejectReason, () => { state: GameState; action: Action }][] = [
    ['invalid_action', () => ({ state: corpInstalled(['c08']), action: { type: 'advance', player: 'corp', uid: 1 } as unknown as Action })],
    ['game_over', () => ({ state: { ...corpInstalled(['c08']), phase: 'over', result: { winner: 'runner', reason: 'corp_decked' } }, action: advance('corp', 'i1') })],
    ['not_your_turn', () => ({ state: corpInstalled(['c08']), action: advance('runner', 'i1') })],
    ['not_your_turn', () => ({ state: finishTurn(corpInstalled(['c08'])).state, action: advance('corp', 'i1') })],
    ['wrong_phase', () => ({ state: discardStep(), action: advance('corp', 'i1') })],
    ['no_clicks', () => ({ state: corpInstalled(['c08'], 0), action: advance('corp', 'i1') })],
    ['bad_target', () => ({ state: corpInstalled(['c08']), action: advance('corp', 'i9') })], // unknown uid
    ['bad_target', () => ({ state: corpInstalled(['c05']), action: advance('corp', 'i1') })], // Ice Wall: not advanceable this sprint
    ['bad_target', () => ({ state: corpInstalled(['c03']), action: advance('corp', 'i1') })], // an asset
    ['no_credits', () => ({ state: corpInstalled(['c08'], 3, 0), action: advance('corp', 'i1') })],
  ];
  it.each(cases)('rejects %s, state unchanged', (reason, make) => {
    const { state, action } = make();
    expectRejected(state, action, reason);
  });

  it('the Runner can never advance (bad_target on its own turn)', () => {
    const s = withPlayer(finishTurn(corpInstalled(['c08'])).state, 'runner', { credits: 5 });
    expectRejected(s, advance('runner', 'i1'), 'bad_target');
  });

  it('precedence: no_clicks beats bad_target; bad_target beats no_credits', () => {
    expect(rejection(apply(corpInstalled(['c05'], 0), advance('corp', 'i1')).events)).toBe('no_clicks');
    expect(rejection(apply(corpInstalled(['c05'], 3, 0), advance('corp', 'i1')).events)).toBe('bad_target');
  });
});

describe('S-03-2 AC3: score (no click, Corp turn, counters >= requirement)', () => {
  it('Hostile Takeover with 2 counters: moves face up to the score area, +1 point, no click spent', () => {
    const s = run(corpInstalled(['c08']), [advance('corp', 'i1'), advance('corp', 'i1')]).state;
    expect(s.players.corp.clicks).toBe(1);
    const r = apply(s, score('corp', 'i1'));
    // Sprint 4: followed by its "when scored" bonus (when-scored.test.ts).
    expect(r.events[0]).toEqual({ type: 'agenda_scored', uid: 'i1', cardId: 'c08', points: 1 });
    expect(r.state.players.corp).toMatchObject({ clicks: 1, credits: 3 + 7, scoreArea: ['c08'] });
    expect(r.state.servers.find((sv) => sv.id === 'remote1')!.content).toEqual([]);
    for (const p of ['corp', 'runner'] as const) {
      const v = viewFor(p, r.state);
      expect(v.players.corp).toMatchObject({ scored: ['c08'], points: 1 });
      expect(v.players.runner).toMatchObject({ scored: [], points: 0 });
    }
    // Public: the Runner's projection keeps the card id (it is face up now).
    expect(viewEvents('runner', r.events)).toEqual(r.events);
  });

  it('scoring takes no click: works with 0 clicks left', () => {
    const s = withPlayer(run(corpInstalled(['c08']), [advance('corp', 'i1'), advance('corp', 'i1')]).state, 'corp', { clicks: 0 });
    expect(rejection(apply(s, score('corp', 'i1')).events)).toBeNull();
    expect(legalActions(s, 'corp')).toContainEqual(score('corp', 'i1'));
  });

  it.each([
    ['c08', 2, 1],
    ['c09', 4, 2],
    ['c10', 5, 3],
  ] as const)('%s needs %i counters and is worth %i', (cardId, need, points) => {
    let s = corpInstalled([cardId], need + 1, 10);
    for (let k = 0; k < need - 1; k++) s = run(s, [advance('corp', 'i1')]).state;
    expectRejected(s, score('corp', 'i1'), 'bad_target');
    s = run(s, [advance('corp', 'i1')]).state;
    const r = apply(s, score('corp', 'i1'));
    // Sprint 4: "when scored" bonuses may follow (when-scored.test.ts).
    expect(r.events[0]).toEqual({ type: 'agenda_scored', uid: 'i1', cardId, points });
  });

  const ready = () => run(corpInstalled(['c08']), [advance('corp', 'i1'), advance('corp', 'i1')]).state;
  const cases: [RejectReason, () => { state: GameState; action: Action }][] = [
    ['invalid_action', () => ({ state: ready(), action: { type: 'score', player: 'corp' } as unknown as Action })],
    ['game_over', () => ({ state: { ...ready(), phase: 'over', result: { winner: 'runner', reason: 'corp_decked' } }, action: score('corp', 'i1') })],
    ['not_your_turn', () => ({ state: ready(), action: score('runner', 'i1') })],
    ['not_your_turn', () => ({ state: finishTurn(ready()).state, action: score('corp', 'i1') })],
    ['wrong_phase', () => ({ state: run(withHand(ready(), 'corp', Array(6).fill('c01')), [{ type: 'end_turn', player: 'corp' }]).state, action: score('corp', 'i1') })],
    ['bad_target', () => ({ state: corpInstalled(['c08']), action: score('corp', 'i1') })], // 0 counters
    ['bad_target', () => ({ state: ready(), action: score('corp', 'i7') })],
    ['bad_target', () => ({ state: corpInstalled(['c05']), action: score('corp', 'i1') })], // ICE
  ];
  it.each(cases)('rejects %s, state unchanged', (reason, make) => {
    const { state, action } = make();
    expectRejected(state, action, reason);
  });
});

describe('S-03-2 AC4: 7 agenda points win at once', () => {
  it(`scoring to ${WINNING_POINTS} ends the game: Corp wins, agenda_points`, () => {
    let s = run(corpInstalled(['c08']), [advance('corp', 'i1'), advance('corp', 'i1')]).state;
    s = withPlayer(s, 'corp', { scoreArea: ['c10', 'c09', 'c08'] }); // 3 + 2 + 1 = 6 points
    const r = apply(s, score('corp', 'i1'));
    expect(r.events).toEqual([
      { type: 'agenda_scored', uid: 'i1', cardId: 'c08', points: 1 },
      { type: 'game_over', winner: 'corp', reason: 'agenda_points' },
    ]);
    expect(r.state.phase).toBe('over');
    expect(r.state.result).toEqual({ winner: 'corp', reason: 'agenda_points' });
    expect(viewFor('runner', r.state)).toMatchObject({ result: { winner: 'corp', reason: 'agenda_points' }, legalActions: [] });
    expect(viewFor('corp', r.state).players.corp.points).toBe(7);
  });

  it('6 points is not a win', () => {
    const s = withPlayer(run(corpInstalled(['c08']), [advance('corp', 'i1'), advance('corp', 'i1')]).state, 'corp', { scoreArea: ['c10', 'c09'] });
    const r = apply(s, score('corp', 'i1'));
    expect(r.state.phase).toBe('action');
    expect(viewFor('corp', r.state).players.corp.points).toBe(6);
  });
});

describe('installedOptions (Corp: advance, then score once ready)', () => {
  it('advance per installed agenda; score appears with enough counters; ICE and assets are not listed', () => {
    let s = corpInstalled(['c08', 'c05', 'c03', 'c09'], 3, 5);
    expect(viewFor('corp', s).installedOptions).toEqual({
      i1: [{ action: advance('corp', 'i1'), cost: 1, reject: null }],
      i4: [{ action: advance('corp', 'i4'), cost: 1, reject: null }],
    });
    s = run(s, [advance('corp', 'i1'), advance('corp', 'i1')]).state;
    expect(viewFor('corp', s).installedOptions.i1).toEqual([
      { action: advance('corp', 'i1'), cost: 1, reject: null },
      { action: score('corp', 'i1'), cost: 0, reject: null },
    ]);
    expect(viewFor('runner', s).installedOptions).toEqual({});
    // Advance and score are in legalActions, after installs/plays.
    expect(legalActions(s, 'corp').slice(-3)).toEqual([advance('corp', 'i1'), score('corp', 'i1'), advance('corp', 'i4')]);
  });

  it('reject equals apply: no credits, no clicks, off turn', () => {
    const broke = corpInstalled(['c08'], 3, 0);
    expect(viewFor('corp', broke).installedOptions.i1).toEqual([{ action: advance('corp', 'i1'), cost: 1, reject: 'no_credits' }]);
    const off = finishTurn(corpInstalled(['c08'])).state;
    expect(viewFor('corp', off).installedOptions.i1).toEqual([{ action: advance('corp', 'i1'), cost: 1, reject: 'not_your_turn' }]);
    for (const s of [broke, off, corpInstalled(['c08'], 0)]) {
      for (const o of Object.values(viewFor('corp', s).installedOptions).flat()) {
        expect(rejection(apply(s, o.action).events)).toBe(o.reject);
      }
    }
  });
});
