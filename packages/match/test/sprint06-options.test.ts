// Sprint 6 E1/E2: LocalMatch options, restore (by replay) and snapshot resume (server persistence).
import { newGame, replay, type Action } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { LocalMatch } from '../src/index';
import { planBusyBoard } from '../src/testing';

describe('Sprint 6: LocalMatch options', () => {
  it('default options are affordable; the state stores them; the shuffle does not depend on them', () => {
    const a = new LocalMatch(5);
    const b = new LocalMatch(5, { rezWindow: 'always' });
    expect(a.options).toEqual({ rezWindow: 'affordable' });
    expect(b.options).toEqual({ rezWindow: 'always' });
    expect(a.snapshot().options).toEqual({ rezWindow: 'affordable' });
    expect(b.snapshot().options).toEqual({ rezWindow: 'always' });
    expect(a.view('corp')).toEqual(b.view('corp'));
    expect(newGame(5).options).toEqual({ rezWindow: 'affordable' });
  });

  it('restore(seed, actions, options) rebuilds the same game and log', () => {
    const plan = planBusyBoard(3);
    const live = new LocalMatch(plan.seed, { rezWindow: 'always' });
    for (const a of plan.actions) live.submit(a.player, a);
    const back = LocalMatch.restore(plan.seed, live.actions(), { rezWindow: 'always' });
    expect(back.snapshot()).toEqual(live.snapshot());
    expect(back.actions()).toEqual(live.actions());
    expect(back.options).toEqual({ rezWindow: 'always' });
    expect(back.snapshot()).toEqual(replay(plan.seed, plan.actions, { rezWindow: 'always' }).state);
    // And it keeps playing like the original.
    const next: Action = { type: 'gain_credit', player: plan.activePlayer };
    expect(back.submit(next.player, next)).toEqual(live.submit(next.player, next));
  });

  it('fromSnapshot resumes without replaying; snapshot() is a detached copy', () => {
    const plan = planBusyBoard(4);
    const live = LocalMatch.restore(plan.seed, plan.actions, { rezWindow: 'always' });
    const snap = live.snapshot();
    const back = LocalMatch.fromSnapshot(plan.seed, snap, live.actions());
    (snap as { turn: number }).turn = 999; // mutating the snapshot does not reach either match
    expect(back.snapshot()).toEqual(live.snapshot());
    expect(back.options).toEqual({ rezWindow: 'always' });
    expect(back.view('runner')).toEqual(live.view('runner'));
    expect(back.actions()).toEqual(live.actions());
  });
});
