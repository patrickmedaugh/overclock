// Sprint 9 E1: the pinned interface (tags, link, traces, basic actions, scored uids). Behaviour lands in E3–E6;
// these tests pin the shapes, defaults and check order that E1 already provides.
import { describe, expect, it } from 'vitest';
import {
  BASIC_ACTION_COST,
  RULES_VERSION,
  apply,
  legalActions,
  newGame as engineNewGame,
  parseScoredUid,
  runnerLink,
  scoredUid,
  viewFor,
  type Action,
  type GameState,
} from '../src/index';
import { finishTurn, newGame, withPlayer } from './helpers';

const reject = (s: GameState, a: Action) => {
  const r = apply(s, a);
  const e = r.events[0];
  return e?.type === 'action_rejected' ? e.reason : null;
};

/** A core game with an open trace choice (built by hand: no card starts a trace before E3). */
function withTrace(kind: 'trace_corp' | 'trace_runner', corpBid: number | null): GameState {
  const s = engineNewGame(11);
  const base = 3;
  return {
    ...s,
    phase: 'choice',
    choice: {
      kind,
      player: kind === 'trace_corp' ? 'corp' : 'runner',
      cardId: 'c22',
      resume: 'action',
      trace: { base, strength: corpBid === null ? null : base + corpBid, corpBid, onSuccess: [{ op: 'give_tags', amount: 1 }] },
    },
  };
}

describe('Sprint 9 interface (E1)', () => {
  it('RULES_VERSION is 3', () => {
    expect(RULES_VERSION).toBe(3);
  });

  it('new state fields start empty: tags 0 for both sides, lastSuccessfulRunTurn null', () => {
    for (const s of [engineNewGame(5), newGame(5)]) {
      expect(s.players.corp.tags).toBe(0);
      expect(s.players.runner.tags).toBe(0);
      expect(s.lastSuccessfulRunTurn).toBeNull();
    }
  });

  it('views: tags and link per side (Kate: link 1; Corp and starter Runner: 0), basicOptions []', () => {
    const core = engineNewGame(5);
    expect(runnerLink(core)).toBe(1);
    for (const viewer of ['corp', 'runner'] as const) {
      const v = viewFor(viewer, core);
      expect(v.players.runner.link).toBe(1);
      expect(v.players.corp.link).toBe(0);
      expect(v.players.runner.tags).toBe(0);
      expect(v.players.corp.tags).toBe(0);
      expect(v.basicOptions).toEqual([]);
    }
    const starter = newGame(5);
    expect(runnerLink(starter)).toBe(0);
    expect(viewFor('runner', starter).players.runner.link).toBe(0);
    const tagged = withPlayer(core, 'runner', { tags: 2 });
    for (const viewer of ['corp', 'runner'] as const) expect(viewFor(viewer, tagged).players.runner.tags).toBe(2);
  });

  it('scoredUid / parseScoredUid round-trip; other uids are not scored uids', () => {
    expect(scoredUid('corp', 0)).toBe('score:corp:0');
    expect(scoredUid('corp', 12)).toBe('score:corp:12');
    expect(parseScoredUid('score:corp:3')).toEqual({ side: 'corp', index: 3 });
    expect(parseScoredUid('score:runner:0')).toEqual({ side: 'runner', index: 0 });
    for (const uid of ['i1', 'id:corp', 'score:corp:', 'score:corp:01', 'score:corp:-1', 'score:hq:0']) expect(parseScoredUid(uid)).toBeNull();
  });

  it('ChoiceView.trace: public numbers for both viewers (strength = base until the Corp bids; needed = strength − link)', () => {
    const corpWindow = withTrace('trace_corp', null);
    for (const viewer of ['corp', 'runner'] as const) {
      expect(viewFor(viewer, corpWindow).choice?.trace).toEqual({
        base: 3,
        strength: 3,
        corpBid: null,
        link: 1,
        runnerMaxBid: 5,
        corpMaxBid: corpWindow.players.corp.credits,
        needed: 2,
      });
    }
    const runnerWindow = withTrace('trace_runner', 2);
    expect(viewFor('runner', runnerWindow).choice?.trace).toMatchObject({ strength: 5, corpBid: 2, needed: 4 });
  });

  it('trace_bid check order: invalid_action → game_over → not_your_turn → wrong_phase → no_credits', () => {
    const s = withTrace('trace_corp', null);
    expect(reject(s, { type: 'trace_bid', player: 'corp', credits: -1 })).toBe('invalid_action');
    expect(reject(s, { type: 'trace_bid', player: 'corp', credits: 1.5 })).toBe('invalid_action');
    expect(reject({ ...s, phase: 'over', result: { winner: 'corp', reason: 'flatline' } }, { type: 'trace_bid', player: 'corp', credits: 0 })).toBe(
      'game_over',
    );
    expect(reject(s, { type: 'trace_bid', player: 'runner', credits: 0 })).toBe('not_your_turn');
    expect(reject(engineNewGame(11), { type: 'trace_bid', player: 'corp', credits: 0 })).toBe('wrong_phase');
    expect(reject(s, { type: 'trace_bid', player: 'corp', credits: s.players.corp.credits + 1 })).toBe('no_credits');
  });

  it('pass in a trace choice is bad_target (bid 0 is the default)', () => {
    expect(reject(withTrace('trace_corp', null), { type: 'pass', player: 'corp' })).toBe('bad_target');
    expect(reject(withTrace('trace_runner', 0), { type: 'pass', player: 'runner' })).toBe('bad_target');
  });

  it('remove_tag check order: not_your_turn → wrong_phase → no_clicks → condition_not_met → no_credits', () => {
    const runnerTurn = finishTurn(engineNewGame(11)).state;
    const tagged = withPlayer(runnerTurn, 'runner', { tags: 1 });
    expect(reject(engineNewGame(11), { type: 'remove_tag', player: 'runner' })).toBe('not_your_turn');
    expect(reject({ ...tagged, phase: 'discard' }, { type: 'remove_tag', player: 'runner' })).toBe('wrong_phase');
    expect(reject(withPlayer(tagged, 'runner', { clicks: 0 }), { type: 'remove_tag', player: 'runner' })).toBe('no_clicks');
    expect(reject(runnerTurn, { type: 'remove_tag', player: 'runner' })).toBe('condition_not_met');
    expect(reject(withPlayer(tagged, 'runner', { credits: BASIC_ACTION_COST - 1 }), { type: 'remove_tag', player: 'runner' })).toBe('no_credits');
  });

  it('trash_resource check order: not_your_turn → wrong_phase → no_clicks → condition_not_met → bad_target → no_credits', () => {
    const corpTurn = engineNewGame(11);
    const withRes: GameState = { ...corpTurn, rig: [{ uid: 'i90', cardId: 'r02', rezzed: false, advancements: 0, hostedCredits: 0 }] };
    const tagged = withPlayer(withRes, 'runner', { tags: 1 });
    const a: Action = { type: 'trash_resource', player: 'corp', uid: 'i90' };
    expect(reject(tagged, { ...a, player: 'runner' })).toBe('not_your_turn');
    expect(reject({ ...tagged, phase: 'discard' }, a)).toBe('wrong_phase');
    expect(reject(withPlayer(tagged, 'corp', { clicks: 0 }), a)).toBe('no_clicks');
    expect(reject(withRes, a)).toBe('condition_not_met');
    expect(reject(tagged, { ...a, uid: 'i91' })).toBe('bad_target');
    expect(reject(withPlayer(tagged, 'corp', { credits: BASIC_ACTION_COST - 1 }), a)).toBe('no_credits');
  });

  it('E3: a valid bid is accepted and listed (one per amount); E1 stub: remove_tag still not_implemented', () => {
    const bid = withTrace('trace_corp', null);
    expect(reject(bid, { type: 'trace_bid', player: 'corp', credits: 0 })).toBeNull();
    expect(legalActions(bid, 'corp')).toHaveLength(bid.players.corp.credits + 1);
    const runnerTurn = withPlayer(finishTurn(engineNewGame(11)).state, 'runner', { tags: 1 });
    expect(reject(runnerTurn, { type: 'remove_tag', player: 'runner' })).toBe('not_implemented');
  });
});
