// Sprint 11: seeded random play for the save/restore tests (engine-direct, so 300 games stay fast).
// Busy moves (runs, installs, rezzes, breaks, advances, scores…) are favoured over draw / credit /
// pass / end turn, so games reach runs, ICE, breakers and scoring.
import { apply, legalActions, newGame, waitingOn, type Action, type GameOptions, type GameState } from '@overclock/engine';

/** A small xorshift PRNG: `next(n)` is a uniform-ish integer in [0, n). */
export function prng(seed: number): (n: number) => number {
  let x = (seed * 2654435761) >>> 0 || 9;
  return (n) => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x % n;
  };
}

const QUIET = new Set(['pass', 'end_turn', 'gain_credit', 'draw']);

/**
 * `long`: never draw by choice and run often (runs are many small decisions), so the Corp's deck
 * lasts and games run to several hundred actions (`playRandom` also steps back out of dead ends).
 */
export function pickAction(legal: readonly Action[], rnd: (n: number) => number, long = false): Action {
  if (long) {
    const noDraw = legal.filter((a) => a.type !== 'draw');
    if (noDraw.length > 0) legal = noDraw;
    const run = legal.filter((a) => a.type === 'run');
    if (run.length > 0 && rnd(4) !== 0) return run[rnd(run.length)]!;
  }
  const busy = legal.filter((a) => !QUIET.has(a.type) && (a.type !== 'run' || rnd(3) === 0));
  const pool = busy.length > 0 && rnd(10) < 7 ? busy : legal;
  return pool[rnd(pool.length)]!;
}

export interface PlayedGame {
  readonly seed: number;
  readonly options: GameOptions;
  /** Accepted actions, in order. */
  readonly actions: Action[];
  /** The state after `actions`. */
  readonly state: GameState;
}

/**
 * Plays up to `max` accepted actions from `newGame(seed, options)`. With `stopBeforeOver`, a move
 * that would end the game is never taken (another legal move is picked; if every move ends it, play
 * stops), so the game stays in progress.
 */
export function playRandom(seed: number, options: Partial<GameOptions>, max: number, stopBeforeOver = false, long = false): PlayedGame {
  const rnd = prng(seed);
  let state = newGame(seed, options);
  const actions: Action[] = [];
  const before: GameState[] = []; // before[i] = the state action i was played from
  let backtracks = 0;
  while (actions.length < max && state.phase !== 'over') {
    const who = waitingOn(state);
    if (!who) break;
    let legal = legalActions(state, who);
    let next: GameState | null = null;
    let action: Action | null = null;
    while (legal.length > 0 && next === null) {
      const a = pickAction(legal, rnd, long);
      const r = apply(state, a);
      if (r.events.some((e) => e.type === 'action_rejected')) throw new Error(`legal action rejected: ${JSON.stringify(a)}`);
      if (stopBeforeOver && r.state.phase === 'over') legal = legal.filter((x) => x !== a);
      else [next, action] = [r.state, a];
    }
    if (next === null || action === null) {
      // Every move ends the game (e.g. a forced winning steal). `long`: step back a few moves and play on.
      if (!long || backtracks >= 40 || actions.length === 0) break;
      backtracks++;
      const back = Math.min(actions.length, 4 + rnd(12));
      state = before[actions.length - back]!;
      actions.length -= back;
      before.length -= back;
      continue;
    }
    before.push(state);
    state = next;
    actions.push(action);
  }
  return { seed, options: state.options, actions, state };
}
