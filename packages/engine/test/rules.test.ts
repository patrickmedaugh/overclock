import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, type Action, type ActionType, type GameState, type RejectReason, type Side } from '../src/index';
import { RULES } from '../src/rules';
import { clone, finishTurn, run, withClicks, withCredits, withDeck, withHand, withRig } from './helpers';

const TYPES: ActionType[] = ['draw', 'gain_credit', 'end_turn', 'discard', 'install', 'play'];

/**
 * Fixed hands so install/play scenarios are known. Corp: Ice Wall, Hostile
 * Takeover, Experiential Data, Hedge Fund, Neural EMP, PAD Campaign.
 * Runner: Ninja, Magnum Opus, Easy Mark, The Maker's Eye, Akamatsu Mem Chip.
 */
const CORP_HAND = ['c05', 'c08', 'c11', 'c01', 'c12', 'c03'];
const RUNNER_HAND = ['r06', 'r12', 'r01', 'r07', 'r09'];
const C = { iceWall: 0, agenda: 1, upgrade: 2, hedgeFund: 3, neuralEmp: 4, asset: 5 };
const R = { ninja: 0, magnumOpus: 1, easyMark: 2, makersEye: 3, memChip: 4 };

/** A representative, otherwise-legal action of each type (discard: index 5 of a 6-card hand). */
function make(type: ActionType, player: Side, handIndices: number[] = [5]): Action {
  switch (type) {
    case 'discard':
      return { type, player, handIndices };
    case 'install':
      return player === 'corp' ? { type, player, handIndex: C.iceWall, server: 'hq' } : { type, player, handIndex: R.memChip };
    case 'play':
      return { type, player, handIndex: player === 'corp' ? C.hedgeFund : R.easyMark };
    default:
      return { type, player };
  }
}

const withHands = (s: GameState): GameState => withHand(withHand(s, 'corp', CORP_HAND), 'runner', RUNNER_HAND);
/** Corp turn 1 (6 cards, 3 clicks, 5 credits). */
const actionStep = () => withHands(newGame(50));
/** Corp in its discard step with 6 cards (must discard 1). */
const discardStep = () => run(actionStep(), [{ type: 'end_turn', player: 'corp' }]).state;
const overState = (): GameState => ({ ...actionStep(), phase: 'over', result: { winner: 'runner', reason: 'corp_decked' } });
/** Runner turn 2 (4 clicks, 5 credits) with RUNNER_HAND. */
const runnerStep = () => withHand(finishTurn(newGame(50)).state, 'runner', RUNNER_HAND);

/**
 * Which reasons each action can produce, in order (S-01/S-02 tech plans).
 * install's not_implemented check is in the table but no installable card in
 * the current pool needs runs, so no scenario can reach it.
 */
const EXPECTED: Record<ActionType, RejectReason[]> = {
  draw: ['invalid_action', 'game_over', 'not_your_turn', 'wrong_phase', 'no_clicks', 'deck_empty'],
  gain_credit: ['invalid_action', 'game_over', 'not_your_turn', 'wrong_phase', 'no_clicks'],
  end_turn: ['invalid_action', 'game_over', 'not_your_turn', 'wrong_phase'],
  discard: ['invalid_action', 'game_over', 'not_your_turn', 'wrong_phase', 'bad_discard'],
  install: ['invalid_action', 'game_over', 'not_your_turn', 'wrong_phase', 'no_clicks', 'bad_card', 'bad_target', 'no_credits', 'no_memory'],
  play: ['invalid_action', 'game_over', 'not_your_turn', 'wrong_phase', 'no_clicks', 'bad_card', 'not_implemented', 'no_credits'],
};

/** A state + action that triggers exactly `reason` for `type` (and nothing earlier). */
function scenario(type: ActionType, reason: RejectReason): { state: GameState; action: Action } {
  const rightPhase = type === 'discard' ? discardStep() : actionStep();
  switch (reason) {
    case 'invalid_action':
      return { state: rightPhase, action: { ...make(type, 'corp'), player: 'nobody' } as unknown as Action };
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
    case 'bad_card':
      // install an operation / play an ICE
      return type === 'install'
        ? { state: actionStep(), action: { type, player: 'corp', handIndex: C.hedgeFund, server: 'hq' } }
        : { state: actionStep(), action: { type: 'play', player: 'corp', handIndex: C.iceWall } };
    case 'bad_target':
      // an agenda may not go in HQ
      return { state: actionStep(), action: { type: 'install', player: 'corp', handIndex: C.agenda, server: 'hq' } };
    case 'not_implemented':
      return { state: actionStep(), action: { type: 'play', player: 'corp', handIndex: C.neuralEmp } };
    case 'no_credits':
      return type === 'install'
        ? { state: withCredits(runnerStep(), 'runner', 3), action: { type, player: 'runner', handIndex: R.ninja } }
        : { state: withCredits(actionStep(), 'corp', 4), action: make('play', 'corp') };
    case 'no_memory':
      // Two Magnum Opus use all 4 memory; Ninja needs 1 more.
      return { state: withRig(runnerStep(), ['r12', 'r12']), action: { type: 'install', player: 'runner', handIndex: R.ninja } };
    default:
      throw new Error(`no scenario for ${reason}`);
  }
}

describe('validation table (rules.ts)', () => {
  it('has an entry for every action type', () => {
    expect(Object.keys(RULES).sort()).toEqual([...TYPES].sort());
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
    it('no_clicks beats bad_card; bad_card beats bad_target', () => {
      expect(apply(withClicks(actionStep(), 'corp', 0), { type: 'play', player: 'corp', handIndex: 99 }).events).toEqual([
        { type: 'action_rejected', reason: 'no_clicks' },
      ]);
      expect(apply(actionStep(), { type: 'install', player: 'corp', handIndex: C.hedgeFund, server: 'remote9' }).events).toEqual([
        { type: 'action_rejected', reason: 'bad_card' },
      ]);
    });
    it('bad_target beats no_credits', () => {
      const s = withCredits(actionStep(), 'corp', 0);
      expect(apply(s, { type: 'install', player: 'corp', handIndex: C.agenda, server: 'rd' }).events).toEqual([
        { type: 'action_rejected', reason: 'bad_target' },
      ]);
    });
    it('not_implemented beats no_credits (a card that needs runs says so even when you are broke)', () => {
      const s = withCredits(actionStep(), 'corp', 0);
      expect(apply(s, { type: 'play', player: 'corp', handIndex: C.neuralEmp }).events).toEqual([
        { type: 'action_rejected', reason: 'not_implemented' },
      ]);
    });
    it('no_credits beats no_memory', () => {
      const s = withCredits(withRig(runnerStep(), ['r12', 'r12']), 'runner', 0);
      expect(apply(s, { type: 'install', player: 'runner', handIndex: R.magnumOpus }).events).toEqual([
        { type: 'action_rejected', reason: 'no_credits' },
      ]);
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
        { type: 'install', player: 'corp', server: 'hq' },
        { type: 'install', player: 'corp', handIndex: '0', server: 'hq' },
        { type: 'install', player: 'corp', handIndex: 0, server: 7 },
        { type: 'install', player: 'corp', handIndex: 0, server: null },
        { type: 'play', player: 'corp' },
        { type: 'play', player: 'corp', handIndex: 0.5 },
        { type: 'play', player: 'corp', handIndex: Number.NaN },
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
  it('Corp turn 1: draw, gain_credit, end_turn, then installs (hand index, then target), then plays; Runner: nothing', () => {
    const s = actionStep();
    expect(legalActions(s, 'corp')).toEqual([
      { type: 'draw', player: 'corp' },
      { type: 'gain_credit', player: 'corp' },
      { type: 'end_turn', player: 'corp' },
      // Ice Wall: any server or new (all free: no ICE yet)
      { type: 'install', player: 'corp', handIndex: 0, server: 'hq' },
      { type: 'install', player: 'corp', handIndex: 0, server: 'rd' },
      { type: 'install', player: 'corp', handIndex: 0, server: 'archives' },
      { type: 'install', player: 'corp', handIndex: 0, server: 'new' },
      // Hostile Takeover: only a new remote (there are none yet)
      { type: 'install', player: 'corp', handIndex: 1, server: 'new' },
      // Experiential Data (upgrade): any server or new
      { type: 'install', player: 'corp', handIndex: 2, server: 'hq' },
      { type: 'install', player: 'corp', handIndex: 2, server: 'rd' },
      { type: 'install', player: 'corp', handIndex: 2, server: 'archives' },
      { type: 'install', player: 'corp', handIndex: 2, server: 'new' },
      // PAD Campaign (asset): only a new remote
      { type: 'install', player: 'corp', handIndex: 5, server: 'new' },
      // Hedge Fund is playable (5 credits); Neural EMP needs runs (not legal)
      { type: 'play', player: 'corp', handIndex: 3 },
    ]);
    expect(legalActions(s, 'runner')).toEqual([]);
  });

  it('0 clicks: only end_turn; empty deck: no draw', () => {
    expect(legalActions(withClicks(actionStep(), 'corp', 0), 'corp')).toEqual([{ type: 'end_turn', player: 'corp' }]);
    expect(legalActions(withDeck(actionStep(), 'corp', []), 'corp').map((a) => a.type).slice(0, 3)).toEqual([
      'gain_credit',
      'end_turn',
      'install',
    ]);
  });

  it('Runner: installs only what it can pay for and fit in memory', () => {
    const s = withCredits(withRig(runnerStep(), ['r12']), 'runner', 4);
    // Ninja (4, 1 memory) fits; Magnum Opus (5 credits) is too dear; Akamatsu (1) fits; Easy Mark playable.
    expect(legalActions(s, 'runner').filter((a) => a.type === 'install' || a.type === 'play')).toEqual([
      { type: 'install', player: 'runner', handIndex: R.ninja },
      { type: 'install', player: 'runner', handIndex: R.memChip },
      { type: 'play', player: 'runner', handIndex: R.easyMark },
    ]);
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
    const states = [actionStep(), withHand(newGame(1), 'corp', ['c01']), discardStep(), finishTurn(newGame(1)).state, runnerStep()];
    for (const s of states) {
      for (const p of ['corp', 'runner'] as const) {
        const legalTypes = new Set(legalActions(s, p).map((a) => a.type));
        // install/play are per card and target: see hand-options.test.ts.
        for (const type of TYPES.filter((t) => t !== 'install' && t !== 'play')) {
          const n = Math.max(0, s.players[p].hand.length - 5);
          const a = make(type, p, Array.from({ length: n }, (_, i) => i));
          const accepted = !apply(s, a).events.some((e) => e.type === 'action_rejected');
          expect(legalTypes.has(type)).toBe(accepted);
        }
      }
    }
  });
});
