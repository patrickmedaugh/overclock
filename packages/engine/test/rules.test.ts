import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, type Action, type ActionType, type GameState, type RejectReason, type Side } from '../src/index';
import { RULES } from '../src/rules';
import { clone, finishTurn, run, withClicks, withDeck, withHand } from './helpers';

/** Sprint 1 actions (install/play have their own table tests in install-play.test.ts). */
type S1Type = Exclude<ActionType, 'install' | 'play'>;
const TYPES: S1Type[] = ['draw', 'gain_credit', 'end_turn', 'discard'];

function make(type: S1Type, player: Side, handIndices: number[] = [5]): Action {
  return type === 'discard' ? { type, player, handIndices } : { type, player };
}

/** Corp turn 1 (6 cards, 3 clicks). */
const actionStep = () => newGame(50);
/** Corp in its discard step with 6 cards (must discard 1). */
const discardStep = () => run(newGame(50), [{ type: 'end_turn', player: 'corp' }]).state;
const overState = (): GameState => ({ ...newGame(50), phase: 'over', result: { winner: 'runner', reason: 'corp_decked' } });

/** Which reasons the table says each action can produce, in order (S-01 tech plan table). */
const EXPECTED: Record<S1Type, RejectReason[]> = {
  draw: ['invalid_action', 'game_over', 'not_your_turn', 'wrong_phase', 'no_clicks', 'deck_empty'],
  gain_credit: ['invalid_action', 'game_over', 'not_your_turn', 'wrong_phase', 'no_clicks'],
  end_turn: ['invalid_action', 'game_over', 'not_your_turn', 'wrong_phase'],
  discard: ['invalid_action', 'game_over', 'not_your_turn', 'wrong_phase', 'bad_discard'],
};

/** A state + action that triggers exactly `reason` for `type` (and nothing earlier). */
function scenario(type: S1Type, reason: RejectReason): { state: GameState; action: Action } {
  const rightPhase = type === 'discard' ? discardStep() : actionStep();
  switch (reason) {
    case 'invalid_action':
      return { state: rightPhase, action: { type, player: 'nobody' } as unknown as Action };
    case 'game_over':
      return { state: overState(), action: make(type, 'corp') };
    case 'not_your_turn':
      return { state: rightPhase, action: make(type, 'runner') };
    case 'wrong_phase':
      return { state: type === 'discard' ? actionStep() : discardStep(), action: make(type, 'corp') };
    case 'no_clicks':
      return { state: withClicks(actionStep(), 'corp', 0), action: make(type, 'corp') };
    case 'deck_empty':
      return { state: withDeck(actionStep(), 'corp', []), action: make(type, 'corp') };
    case 'bad_discard':
      return { state: rightPhase, action: make(type, 'corp', [0, 1]) };
    default:
      throw new Error(`no Sprint 1 scenario for ${reason}`);
  }
}

describe('validation table (rules.ts)', () => {
  it('has an entry for every action type', () => {
    expect(Object.keys(RULES).sort()).toEqual([...TYPES, 'install', 'play'].sort());
  });

  describe.each(TYPES)('%s', (type) => {
    it.each(EXPECTED[type])('rejects with %s and leaves state unchanged', (reason) => {
      const { state, action } = scenario(type, reason);
      const snapshot = clone(state);
      const r = apply(state, action);
      expect(r.events).toEqual([{ type: 'action_rejected', reason }]);
      expect(r.state).toBe(state);
      expect(state).toEqual(snapshot);
      if (reason !== 'invalid_action') {
        expect(legalActions(state, action.player)).not.toContainEqual(action);
      }
    });
  });

  it('S-01-2 AC4: every action off-turn is not_your_turn, for both sides', () => {
    const corpTurn = newGame(3);
    const runnerTurn = finishTurn(newGame(3)).state;
    for (const type of TYPES) {
      expect(apply(corpTurn, make(type, 'runner')).events).toEqual([{ type: 'action_rejected', reason: 'not_your_turn' }]);
      expect(apply(runnerTurn, make(type, 'corp')).events).toEqual([{ type: 'action_rejected', reason: 'not_your_turn' }]);
    }
  });

  describe('precedence: the first failing check wins', () => {
    it('game_over beats not_your_turn, wrong_phase and no_clicks', () => {
      const s = withClicks(overState(), 'runner', 0);
      expect(apply(s, make('draw', 'runner')).events).toEqual([{ type: 'action_rejected', reason: 'game_over' }]);
    });
    it('not_your_turn beats no_clicks and deck_empty', () => {
      const s = withDeck(withClicks(actionStep(), 'runner', 0), 'runner', []);
      expect(apply(s, make('draw', 'runner')).events).toEqual([{ type: 'action_rejected', reason: 'not_your_turn' }]);
    });
    it('wrong_phase beats no_clicks (discard step has 0 clicks)', () => {
      expect(apply(discardStep(), make('gain_credit', 'corp')).events).toEqual([
        { type: 'action_rejected', reason: 'wrong_phase' },
      ]);
    });
    it('no_clicks beats deck_empty', () => {
      const s = withDeck(withClicks(actionStep(), 'corp', 0), 'corp', []);
      expect(apply(s, make('draw', 'corp')).events).toEqual([{ type: 'action_rejected', reason: 'no_clicks' }]);
    });
    it('invalid_action beats everything (malformed actions, never throws)', () => {
      const over = overState();
      const bad: unknown[] = [
        null,
        undefined,
        42,
        'draw',
        {},
        { type: 'nope', player: 'corp' },
        { type: 'toString', player: 'corp' },
        { type: '__proto__', player: 'corp' },
        { type: 'draw', player: 'x' },
        { type: 'draw' },
        { type: 'discard', player: 'corp' },
        { type: 'discard', player: 'corp', handIndices: [1.5] },
      ];
      for (const b of bad) {
        for (const s of [actionStep(), over]) {
          const r = apply(s, b as Action);
          expect(r.events).toEqual([{ type: 'action_rejected', reason: 'invalid_action' }]);
          expect(r.state).toBe(s);
        }
      }
    });
  });
});

describe('legalActions', () => {
  it('Corp turn 1: draw, gain_credit, end_turn; Runner: nothing', () => {
    const s = newGame(1);
    expect(legalActions(s, 'corp')).toEqual([
      { type: 'draw', player: 'corp' },
      { type: 'gain_credit', player: 'corp' },
      { type: 'end_turn', player: 'corp' },
    ]);
    expect(legalActions(s, 'runner')).toEqual([]);
  });

  it('0 clicks: only end_turn; empty deck: no draw', () => {
    expect(legalActions(withClicks(newGame(1), 'corp', 0), 'corp')).toEqual([{ type: 'end_turn', player: 'corp' }]);
    expect(legalActions(withDeck(newGame(1), 'corp', []), 'corp').map((a) => a.type)).toEqual(['gain_credit', 'end_turn']);
  });

  it('every listed action is accepted by apply, across many states', () => {
    let s = newGame(4);
    for (let step = 0; step < 60 && s.phase !== 'over'; step++) {
      for (const p of ['corp', 'runner'] as const) {
        for (const a of legalActions(s, p)) {
          expect(apply(s, a).events.some((e) => e.type === 'action_rejected')).toBe(false);
        }
      }
      const [first] = legalActions(s, s.activePlayer);
      if (!first) throw new Error('active player has no legal action');
      s = apply(s, first).state;
    }
  });

  it('every action type apply accepts appears in legalActions (discard: by type)', () => {
    const states = [newGame(1), withHand(newGame(1), 'corp', ['c01']), discardStep(), finishTurn(newGame(1)).state];
    for (const s of states) {
      for (const p of ['corp', 'runner'] as const) {
        const legalTypes = new Set(legalActions(s, p).map((a) => a.type));
        for (const type of TYPES) {
          const n = Math.max(0, s.players[p].hand.length - 5);
          const a = make(type, p, Array.from({ length: n }, (_, i) => i));
          const accepted = !apply(s, a).events.some((e) => e.type === 'action_rejected');
          expect(legalTypes.has(type)).toBe(accepted);
        }
      }
    }
  });
});
