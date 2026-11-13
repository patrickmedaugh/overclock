// QA (Sprint 1): snappiness budget, "timing windows where no player has a
// legal response are auto-passed". Sprint 1 has no response windows yet, so
// this checks the property over random full games: the game never stops in a
// state where the player it waits on has nothing to do, the waiting player is
// never asked for anything, and the hand-limit step only appears when it is
// really needed (5 or fewer cards: it is skipped automatically).
import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, waitingOn, type Action, type GameState, type Side } from '../src/index';

/** Small deterministic PRNG for picking actions (independent of the engine's). */
function picker(seed: number): (n: number) => number {
  let s = seed >>> 0;
  return (n) => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s % n;
  };
}

const other = (s: Side): Side => (s === 'corp' ? 'runner' : 'corp');

/** Plays one random game to the end (or a step cap), checking every state reached. */
function playAndCheck(seed: number): { steps: number; discardSteps: number; over: boolean } {
  const pick = picker(seed * 7919 + 1);
  let s: GameState = newGame(seed);
  let discardSteps = 0;
  let steps = 0;
  for (; steps < 2000 && s.phase !== 'over'; steps++) {
    // Sprint 3: during a run the Corp decides at approach, so "the player the game waits on" is waitingOn(s).
    const me = waitingOn(s)!;
    const mine = legalActions(s, me);
    // The player the game waits on always has something to do...
    expect(mine.length, `seed ${seed} step ${steps}: active player has a legal action`).toBeGreaterThan(0);
    // ...and the other player is never waited on.
    expect(legalActions(s, other(me)), `seed ${seed} step ${steps}: waiting player has nothing pending`).toEqual([]);
    // End turn is always available in the action phase (never stuck at 0 clicks).
    if (s.phase === 'action') expect(mine.some((a) => a.type === 'end_turn')).toBe(true);
    // The hand-limit step only exists when the hand is over 5.
    if (s.phase === 'discard') {
      discardSteps++;
      expect(s.players[me].hand.length).toBeGreaterThan(5);
      expect(mine.every((a) => a.type === 'discard')).toBe(true);
    }

    let action: Action = mine[pick(mine.length)]!;
    if (action.type === 'discard') {
      // Pick a random valid set instead of the representative one.
      const n = s.players[me].hand.length - 5;
      const idx = s.players[me].hand.map((_, i) => i);
      const chosen: number[] = [];
      while (chosen.length < n) chosen.push(idx.splice(pick(idx.length), 1)[0]!);
      action = { type: 'discard', player: me, handIndices: chosen };
    }
    const r = apply(s, action);
    expect(r.events.some((e) => e.type === 'action_rejected'), `seed ${seed} step ${steps}: legal action accepted`).toBe(false);

    if (action.type === 'end_turn') {
      const askedForDiscard = r.events.some((e) => e.type === 'discard_required');
      // Asked exactly when the hand is over 5; otherwise the turn passed with no stop.
      expect(askedForDiscard).toBe(s.players[me].hand.length > 5);
      if (!askedForDiscard && r.state.phase !== 'over') expect(r.state.activePlayer).toBe(other(me));
    }
    s = r.state;
  }
  return { steps, discardSteps, over: s.phase === 'over' };
}

describe('QA: no empty timing windows (auto-pass) in random full games', () => {
  // Sprint 3: 250 games (was 200) so the hand-limit floor below still holds now that random games include runs.
  it('over 250 random games: never waits on a player with nothing to do; hand limit only when needed', () => {
    let games = 0;
    let finished = 0;
    let discards = 0;
    for (let seed = 1; seed <= 250; seed++) {
      const r = playAndCheck(seed);
      games++;
      if (r.over) finished++;
      discards += r.discardSteps;
    }
    expect(games).toBe(250);
    // The property was really exercised: games reach the end and hit the hand-limit step.
    expect(finished).toBeGreaterThan(150);
    expect(discards).toBeGreaterThan(200);
  });

  it('the game-over state waits on nobody', () => {
    let s = newGame(3);
    for (let i = 0; i < 5000 && s.phase !== 'over'; i++) {
      const a = legalActions(s, waitingOn(s)!)[0]!;
      s = apply(s, a).state;
    }
    expect(s.phase).toBe('over');
    expect(legalActions(s, 'corp')).toEqual([]);
    expect(legalActions(s, 'runner')).toEqual([]);
  });
});
