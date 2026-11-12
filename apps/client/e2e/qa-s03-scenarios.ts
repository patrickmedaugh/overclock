// QA (Sprint 3): finds game situations for QA's e2e by playing real games in Node.
//
// The team's `planToStep` covers five fixed goals. QA needs a few more (Neural
// Katana met with a small Grip, Ninja against Neural Katana, Gordian Blade against
// two code gates, an asset in a remote, ICE the Corp can't afford...). Instead of
// hand-writing a planner per situation, `findScenario` plays seeded games with a
// biased random policy (its own small PRNG, independent of the engine's) through
// `LocalMatch` and stops at the first state where `reached` holds. The page, opened
// with the same seed, replays the returned actions through the test hook.
// Deterministic: the same arguments always give the same plan.
import { getCard } from '@overclock/cards';
import type { Action, PlayerView, Side } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';

export interface Views {
  readonly corp: PlayerView;
  readonly runner: PlayerView;
}

export interface Scenario {
  readonly seed: number;
  readonly actions: Action[];
  readonly views: Views;
}

/** Weight of a legal action for the random policy (0 = never pick). */
export type Weigh = (a: Action, v: PlayerView) => number;

function prng(seed: number): (n: number) => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return (n) => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s % n;
  };
}

const typeOf = (id: string | null | undefined) => (id ? getCard(id)?.type : undefined);

/** The seat the game waits on (the run's decider during a run). */
export function decider(v: PlayerView): Side {
  return v.run?.waitingOn ?? v.activePlayer;
}

/**
 * A default bias: build a board (installs), make money, run often; the Corp rezzes
 * half the time; the Runner breaks when it can. Scenario weights override it.
 */
export const defaultWeigh: Weigh = (a, v) => {
  switch (a.type) {
    case 'install':
      return 4;
    case 'gain_credit':
      return 3;
    case 'run':
      return v.players.runner.clicks <= 2 ? 3 : 1;
    case 'rez':
      return 2;
    case 'use_ability':
      return 3;
    case 'play':
      return typeOf(v.players[v.viewer].hand?.[a.handIndex]) === 'operation' || typeOf(v.players[v.viewer].hand?.[a.handIndex]) === 'event' ? 2 : 1;
    case 'advance':
      return 2;
    case 'score':
      return 5;
    case 'end_turn':
      return 1;
    default:
      return 1;
  }
};

/**
 * Plays seeds `from`..`from + tries - 1` with the weighted random policy until
 * `reached(views)` holds (checked before every action). Throws if none does.
 */
export function findScenario(
  reached: (v: Views) => boolean,
  opts: { weigh?: (a: Action, v: PlayerView, base: number) => number; from?: number; tries?: number; maxActions?: number } = {},
): Scenario {
  const from = opts.from ?? 1;
  const tries = opts.tries ?? 400;
  for (let seed = from; seed < from + tries; seed++) {
    const m = new LocalMatch(seed);
    const pick = prng(seed);
    const actions: Action[] = [];
    for (let n = 0; n < (opts.maxActions ?? 400); n++) {
      const views: Views = { corp: m.view('corp'), runner: m.view('runner') };
      if (views.corp.phase === 'over') break;
      if (reached(views)) return { seed, actions, views };
      const me = decider(views.corp);
      const v = views[me];
      let legal = [...v.legalActions];
      if (legal.length === 0) break;
      if (v.phase === 'discard') legal = [{ type: 'discard', player: me, handIndices: Array.from({ length: v.pendingDiscard }, (_, i) => i) }];
      const weights = legal.map((a) => {
        const base = defaultWeigh(a, v);
        return Math.max(0, opts.weigh ? opts.weigh(a, v, base) : base);
      });
      const total = weights.reduce((x, y) => x + y, 0);
      if (total <= 0) break;
      let r = pick(Math.round(total * 1000)) / 1000;
      let i = 0;
      while (i < legal.length - 1 && r >= weights[i]!) r -= weights[i++]!;
      const a = legal[i]!;
      const u = m.submit(me, a);
      if (u[me].events.some((e) => e.type === 'action_rejected')) throw new Error(`seed ${seed}: legal action rejected ${JSON.stringify(a)}`);
      actions.push(a);
    }
  }
  throw new Error(`no scenario found in seeds ${from}..${from + tries - 1}`);
}
