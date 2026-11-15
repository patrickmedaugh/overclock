// Sprint 7 E4 (S-07-3): credits on cards (Armitage Codebusting), the `activate` action for click
// abilities, trash-when-empty, and Akamatsu Mem Chip's memory. Reached by real play (the Runner's
// hand and credits are set before the first action).
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewEvents, viewFor, type Action, type GameState } from '../src/index';
import { finishTurn, rejection, run, withHand, withPlayer, newGame } from './helpers';

const install = (handIndex: number): Action => ({ type: 'install', player: 'runner', handIndex });
const activate = (uid: string, ability = 0, player: 'corp' | 'runner' = 'runner'): Action => ({ type: 'activate', player, uid, ability });
const endTurn = (player: 'corp' | 'runner'): Action => ({ type: 'end_turn', player });

/** The Runner's first turn (seed 21) with `hand` and `credits`. */
function runnerTurn(hand: string[], credits = 5): GameState {
  return withPlayer(withHand(finishTurn(newGame(21)).state, 'runner', hand), 'runner', { credits });
}

/** Runner turn 2 → Corp turn → Runner turn 4 (fresh clicks), nothing else happening. */
function nextRunnerTurn(s: GameState): GameState {
  return finishTurn(finishTurn(s).state).state;
}

describe('S-07-3 AC1: Armitage Codebusting gets 12 credits when installed', () => {
  it('events: credits_spent 1, card_installed, hosted_credits_changed 12; both players see 12', () => {
    const r = apply(runnerTurn(['r02']), install(0));
    expect(r.events).toEqual([
      { type: 'credits_spent', player: 'runner', amount: 1 },
      { type: 'card_installed', player: 'runner', uid: 'i1', zone: 'rig', handIndex: 0, cardId: 'r02' },
      { type: 'hosted_credits_changed', uid: 'i1', credits: 12 },
    ]);
    for (const side of ['corp', 'runner'] as const) {
      expect(viewFor(side, r.state).rig).toEqual([{ uid: 'i1', cardId: 'r02', faceUp: true, advancements: 0, hostedCredits: 12 }]);
    }
    expect(viewEvents('corp', r.events).at(-1)).toEqual({ type: 'hosted_credits_changed', uid: 'i1', credits: 12 });
    expect(r.state.players.runner.credits).toBe(4); // the 12 come from the bank
  });

  it('cards without hosted credits install as before (no extra event)', () => {
    const r = apply(runnerTurn(['r04']), install(0));
    expect(r.events.map((e) => e.type)).toEqual(['credits_spent', 'card_installed']);
    expect(r.state.rig[0]!.hostedCredits).toBe(0);
  });
});

describe('S-07-3 AC2-AC4: "Take 2 credits · 1 click"', () => {
  const installed = () => run(runnerTurn(['r02']), [install(0)]).state;

  it('AC2: offered on the Runner turn outside a run: cost 0, 1 click, gain 2; takes 2 (12 -> 10) and a click', () => {
    const s = installed();
    expect(viewFor('runner', s).installedOptions).toEqual({
      i1: [{ action: activate('i1'), cost: 0, reject: null, clicks: 1, gain: 2 }],
    });
    expect(legalActions(s, 'runner')).toContainEqual(activate('i1'));
    expect(viewFor('corp', s).installedOptions).toEqual({}); // never the other side's cards
    const r = apply(s, activate('i1'));
    expect(r.events).toEqual([
      { type: 'ability_triggered', uid: 'i1', cardId: 'r02', trigger: 'click' },
      { type: 'hosted_credits_changed', uid: 'i1', credits: 10 },
      { type: 'credit_gained', player: 'runner', amount: 2 },
    ]);
    expect(r.state.players.runner).toMatchObject({ credits: s.players.runner.credits + 2, clicks: s.players.runner.clicks - 1 });
    expect(r.state.rig[0]!.hostedCredits).toBe(10);
    expect(viewEvents('corp', r.events)).toEqual(r.events); // public
    expect(viewFor('corp', r.state).rig[0]!.hostedCredits).toBe(10);
  });

  it('AC3: no clicks left: offered with no_clicks (the dimmed button); apply refuses, nothing changes', () => {
    const s = run(installed(), [activate('i1'), activate('i1'), activate('i1')]).state;
    expect(s.players.runner.clicks).toBe(0);
    expect(viewFor('runner', s).installedOptions.i1).toEqual([{ action: activate('i1'), cost: 0, reject: 'no_clicks', clicks: 1, gain: 2 }]);
    const r = apply(s, activate('i1'));
    expect(rejection(r.events)).toBe('no_clicks');
    expect(r.state).toBe(s);
  });

  it('AC4: taking the last 2 credits sends Armitage Codebusting to the Heap', () => {
    let s = run(installed(), [activate('i1'), activate('i1'), activate('i1')]).state; // 12 -> 6
    s = run(nextRunnerTurn(s), [activate('i1'), activate('i1')]).state; // 6 -> 2
    expect(s.rig[0]!.hostedCredits).toBe(2);
    const r = apply(s, activate('i1'));
    expect(r.events).toEqual([
      { type: 'ability_triggered', uid: 'i1', cardId: 'r02', trigger: 'click' },
      { type: 'hosted_credits_changed', uid: 'i1', credits: 0 },
      { type: 'credit_gained', player: 'runner', amount: 2 },
      { type: 'rig_card_trashed', uid: 'i1', cardId: 'r02' },
    ]);
    expect(r.state.rig).toEqual([]);
    expect(r.state.players.runner.discard.at(-1)).toEqual({ cardId: 'r02', faceUp: true });
    for (const side of ['corp', 'runner'] as const) {
      expect(viewFor(side, r.state).rig).toEqual([]);
      expect(viewFor(side, r.state).players.runner.discard.at(-1)).toBe('r02');
    }
    expect(viewFor('runner', r.state).installedOptions).toEqual({});
  });

  it('off-turn: listed with not_your_turn; during a run: wrong_phase', () => {
    const s = installed();
    const off = finishTurn(s).state;
    expect(viewFor('runner', off).installedOptions.i1).toEqual([{ action: activate('i1'), cost: 0, reject: 'not_your_turn', clicks: 1, gain: 2 }]);
    expect(rejection(apply(off, activate('i1')).events)).toBe('not_your_turn');
    const inRun = run(s, [{ type: 'run', player: 'runner', server: 'hq' }]).state;
    expect(inRun.run?.step).toBe('access'); // HQ holds cards: the run waits at access
    expect(rejection(apply(inRun, activate('i1')).events)).toBe('wrong_phase');
    expect(viewFor('runner', inRun).installedOptions.i1![0]!.reject).toBe('wrong_phase');
  });

  it('rejections: invalid_action, game_over, bad_target (unknown uid, other side, no such ability)', () => {
    const s = installed();
    expect(rejection(apply(s, { type: 'activate', player: 'runner', uid: 'i1', ability: 'x' } as unknown as Action).events)).toBe('invalid_action');
    expect(rejection(apply(s, { type: 'activate', player: 'runner', uid: 3, ability: 0 } as unknown as Action).events)).toBe('invalid_action');
    expect(rejection(apply({ ...s, phase: 'over' }, activate('i1')).events)).toBe('game_over');
    expect(rejection(apply(s, activate('i9')).events)).toBe('bad_target');
    expect(rejection(apply(s, activate('i1', 1)).events)).toBe('bad_target');
    const withBreaker = run(withHand(s, 'runner', ['r04']), [install(0)]).state;
    expect(rejection(apply(withBreaker, activate('i2')).events)).toBe('bad_target'); // Corroder has no card ability
  });

  it('condition_not_met: a card that requires credits on it and holds none (hand-built: unreachable with these cards)', () => {
    const s = installed();
    const empty: GameState = { ...s, rig: s.rig.map((c) => ({ ...c, hostedCredits: 0 })) };
    expect(rejection(apply(empty, activate('i1')).events)).toBe('condition_not_met');
    expect(viewFor('runner', empty).installedOptions.i1![0]).toMatchObject({ reject: 'condition_not_met', gain: 0 });
  });

  it('a Corp card id is never an activate target for the Corp unless face up with an ability (bad_target)', () => {
    let s = withHand(newGame(21), 'corp', ['c03']);
    s = run(s, [{ type: 'install', player: 'corp', handIndex: 0, server: 'new' }]).state;
    expect(rejection(apply(s, activate('i1', 0, 'corp')).events)).toBe('bad_target');
    s = run(s, [{ type: 'rez', player: 'corp', uid: 'i1' }]).state;
    expect(rejection(apply(s, activate('i1', 0, 'corp')).events)).toBe('bad_target'); // PAD has no card ability
  });
});

describe('S-07-3 AC5: Akamatsu Mem Chip raises memory to 5', () => {
  it('memory limit 4 -> 5 in both views; a 5th one-memory program then fits', () => {
    let s = runnerTurn(['r04', 'r04', 'r04', 'r04', 'r09', 'r04'], 30);
    s = run(s, [install(0), install(0), install(0), install(0)]).state;
    expect(viewFor('runner', s).memory).toEqual({ used: 4, limit: 4 });
    s = nextRunnerTurn(s);
    expect(rejection(apply(s, install(1)).events)).toBe('no_memory');
    s = run(s, [install(0)]).state; // Akamatsu Mem Chip
    for (const side of ['corp', 'runner'] as const) expect(viewFor(side, s).memory).toEqual({ used: 4, limit: 5 });
    s = run(s, [install(0)]).state;
    expect(viewFor('runner', s).memory).toEqual({ used: 5, limit: 5 });
  });
});

describe('end turn after abilities', () => {
  it('Armitage keeps its credits across turns (no refill)', () => {
    let s = run(runnerTurn(['r02']), [install(0), activate('i1')]).state;
    s = run(s, [endTurn('runner')]).state;
    s = finishTurn(s).state;
    expect(s.rig[0]!.hostedCredits).toBe(10);
  });
});
