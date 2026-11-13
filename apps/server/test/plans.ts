// Action preludes for room tests, found by playing real games with the engine.
import { apply, legalActions, newGame, waitingOn, type Action, type GameState } from '@overclock/engine';
import { ONLINE_OPTIONS } from '../src/room';

export function prng(seed: number): (n: number) => number {
  let x = (seed * 2654435761) >>> 0 || 7;
  return (n) => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x % n;
  };
}

/** The Corp's only legal move is Don't rez (`pass`) at an approach. */
export function corpOnlyPass(s: GameState): boolean {
  const legal = legalActions(s, 'corp');
  return s.run?.step === 'approach' && legal.length === 1 && legal[0]!.type === 'pass';
}

/** Plays random online-rules games until `goal(state)`; returns (seed, actions). Prefers runs. */
export function planUntil(goal: (s: GameState) => boolean, firstSeed = 1): { seed: number; actions: Action[]; state: GameState } {
  for (let seed = firstSeed; seed < firstSeed + 500; seed++) {
    const pick = prng(seed);
    let s = newGame(seed, ONLINE_OPTIONS);
    const actions: Action[] = [];
    for (let i = 0; i < 600 && s.phase !== 'over'; i++) {
      const legal = legalActions(s, waitingOn(s)!);
      const runs = legal.filter((a) => a.type === 'run');
      const a = runs.length > 0 && pick(3) === 0 ? runs[pick(runs.length)]! : legal[pick(legal.length)]!;
      s = apply(s, a).state;
      actions.push(a);
      if (goal(s)) return { seed, actions, state: s };
    }
  }
  throw new Error('no plan found');
}
