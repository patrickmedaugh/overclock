// S-03-2 AC5: with the starter decks, a whole game can reach 7 agenda points for
// either side. Each game is played from newGame(seed) through LocalMatch (seat
// views only), then the last agenda is scored / stolen.
import { describe, expect, it } from 'vitest';
import { replay, type Action, type GameEvent, type ServerId } from '@overclock/engine';
import { LocalMatch } from '../src/index';
import { planToStep } from '../src/testing';

function playPlan(seed: number, actions: readonly Action[]): LocalMatch {
  const m = new LocalMatch(seed);
  for (const a of actions) {
    const u = m.submit(a.player, a);
    expect(u[a.player].events.some((e) => e.type === 'action_rejected')).toBe(false);
  }
  return m;
}

function submitOk(m: LocalMatch, a: Action): { corp: GameEvent[]; runner: GameEvent[] } {
  const u = m.submit(a.player, a);
  expect(u[a.player].events.find((e) => e.type === 'action_rejected')).toBeUndefined();
  return { corp: u.corp.events, runner: u.runner.events };
}

describe('S-03-2 AC5: 7 points can be reached by both sides in a real game', () => {
  it.each([1, 2, 12345])('seed %i: the Corp advances and scores to 7 and wins', (seed) => {
    const plan = planToStep(seed, 'corp_one_score_from_win');
    const m = playPlan(seed, plan.actions);
    const ev = submitOk(m, { type: 'score', player: 'corp', uid: plan.info.uid! });
    for (const side of ['corp', 'runner'] as const) {
      expect(ev[side].at(-1)).toEqual({ type: 'game_over', winner: 'corp', reason: 'agenda_points' });
      const v = m.view(side);
      expect(v.result).toEqual({ winner: 'corp', reason: 'agenda_points' });
      expect(v.players.corp.points).toBeGreaterThanOrEqual(7);
    }
    // The whole game replays from (seed, actions).
    expect(replay(seed, m.actions()).state.result).toEqual({ winner: 'corp', reason: 'agenda_points' });
  });

  it.each([1, 2, 12345])('seed %i: the Runner runs, steals to 7 and wins', (seed) => {
    const plan = planToStep(seed, 'runner_one_steal_from_win');
    const m = playPlan(seed, plan.actions);
    submitOk(m, { type: 'run', player: 'runner', server: plan.info.server as ServerId });
    const access = m.view('runner').run!.access!;
    const card = access.cards.findIndex((c) => c.cardId === plan.info.cardId);
    const ev = submitOk(m, { type: 'steal', player: 'runner', card });
    for (const side of ['corp', 'runner'] as const) {
      expect(ev[side].slice(-2)).toEqual([
        { type: 'run_ended', server: plan.info.server, outcome: 'accessed' },
        { type: 'game_over', winner: 'runner', reason: 'agenda_points' },
      ]);
      expect(m.view(side).players.runner.points).toBeGreaterThanOrEqual(7);
    }
    expect(replay(seed, m.actions()).state.result).toEqual({ winner: 'runner', reason: 'agenda_points' });
  });
});
