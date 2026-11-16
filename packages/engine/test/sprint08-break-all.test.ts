// Sprint 8 (QA-S8-2): RunView.breakAll — the price of breaking every unbroken subroutine,
// per breaker, from the breaker's own offered options (S-08-3 AC3: Heimdall vs Corroder = 4 + 3).
import { describe, expect, it } from 'vitest';
import { viewFor, type Action, type GameState } from '../src/index';
import { act, board, run, type BoardSpec } from './helpers';

const CORE = { deckSet: 'core' } as const;
const runHq: Action = { type: 'run', player: 'runner', server: 'hq' };
const use = (uid: string, ability: number, extra: { sub?: number; subs?: number[] } = {}): Action => ({ type: 'use_ability', player: 'runner', uid, ability, ...extra });

function atHq(ice: string[], spec: Omit<BoardSpec, 'servers'> = {}): GameState {
  return act(board({ ...spec, servers: { hq: { ice } } }, 77, CORE), runHq).state;
}

describe('RunView.breakAll (QA-S8-2)', () => {
  it('Heimdall 1.0 (6) vs Corroder (2): +4 strength (4 credits) then 3 breaks (3 credits) = 7', () => {
    const s = atHq(['+c18'], { rig: ['r04'], runnerCredits: 7 });
    expect(viewFor('runner', s).run!.breakAll).toEqual([{ uid: 'i1', credits: 7, strengthCredits: 4, breakCredits: 3 }]);
    // The real state is untouched.
    expect(s.players.runner.credits).toBe(7);
    expect(s.run!.broken).toEqual([]);
  });

  it('not enough credits for the whole break: no entry', () => {
    const s = atHq(['+c18'], { rig: ['r04'], runnerCredits: 6 });
    expect(viewFor('runner', s).run!.breakAll).toEqual([]);
  });

  it('Battering Ram vs Heimdall: 3 pumps + 2 breaks of up to 2 = 3 + 4; Pipeline vs Neural Katana: 4 + 1', () => {
    const ram = atHq(['+c18'], { rig: ['r17'], runnerCredits: 10 });
    expect(viewFor('runner', ram).run!.breakAll).toEqual([{ uid: 'i1', credits: 7, strengthCredits: 3, breakCredits: 4 }]);
    const pipe = atHq(['+c07'], { rig: ['r16'], runnerCredits: 5 });
    expect(viewFor('runner', pipe).run!.breakAll).toEqual([{ uid: 'i1', credits: 5, strengthCredits: 4, breakCredits: 1 }]);
  });

  it('updates as the Runner goes: after 4 pumps only the 3 breaks are left; a breaker of the wrong type is not listed', () => {
    let s = atHq(['+c18'], { rig: ['r04', 'r16'], runnerCredits: 9 });
    expect(viewFor('runner', s).run!.breakAll.map((b) => b.uid)).toEqual(['i1']);
    const pump = viewFor('runner', s).run!.options.find((o) => o.action.type === 'use_ability' && o.action.uid === 'i1' && o.action.sub === undefined)!.action;
    s = run(s, [pump, pump]).state;
    expect(viewFor('runner', s).run!.breakAll).toEqual([{ uid: 'i1', credits: 5, strengthCredits: 2, breakCredits: 3 }]);
  });

  it('empty for the Corp, outside an encounter, and once everything is broken', () => {
    const s = atHq(['+c18'], { rig: ['r04'], runnerCredits: 7 });
    expect(viewFor('corp', s).run!.breakAll).toEqual([]);
    const approach = atHq(['c18'], { rig: ['r04'], runnerCredits: 7, corpCredits: 0 });
    expect(viewFor('runner', approach).run!.breakAll).toEqual([]);
    const ram = atHq(['+c18', '+c18'], { rig: ['r17'], runnerCredits: 20 });
    const broken = run(ram, [use('i1', 1), use('i1', 1), use('i1', 1), use('i1', 0, { subs: [0, 1] }), use('i1', 0, { subs: [2] })]).state;
    expect(broken.run?.step).not.toBe('encounter');
    expect(viewFor('runner', broken).run!.breakAll).toEqual([]);
  });
});
