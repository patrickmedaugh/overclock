// PlayerView.handOptions: per hand card, every offered target with its engine
// price and refusal reason (S-02-1 AC1, S-02-2 AC1/AC4, S-02-3 AC1/AC3/AC5,
// S-02-4 AC1/AC3/AC4). The client only renders these.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, viewFor, type GameState, type Side } from '../src/index';
import { finishTurn, install, run, withClicks, withCredits, withHand, withRig } from './helpers';

function corp(hand: string[], credits = 5): GameState {
  return withCredits(withHand(newGame(41), 'corp', hand), 'corp', credits);
}

function runner(hand: string[], credits = 5): GameState {
  return withCredits(withHand(finishTurn(newGame(41)).state, 'runner', hand), 'runner', credits);
}

const opts = (s: GameState, p: Side, i: number) =>
  viewFor(p, s).handOptions[i]?.map((o) => ({
    server: o.action.type === 'install' ? (o.action.server ?? null) : null,
    type: o.action.type,
    cost: o.cost,
    reject: o.reject,
  }));

describe('handOptions', () => {
  it('one entry per viewer hand card; empty for the opponent-facing hand shape', () => {
    const s = corp(['c05', 'c01']);
    expect(viewFor('corp', s).handOptions).toHaveLength(2);
    expect(viewFor('runner', s).handOptions).toHaveLength(s.players.runner.hand.length);
  });

  it('S-02-1 AC1: agenda/asset -> remotes without one, plus New server; upgrade -> every server plus New', () => {
    const s = run(corp(['c08', 'c03', 'c11', 'c09']), [install('corp', 0, 'new')]).state; // remote1 holds an agenda
    // PAD Campaign (asset): remote1 is taken -> only New server.
    expect(opts(s, 'corp', 0)).toEqual([{ server: 'new', type: 'install', cost: 0, reject: null }]);
    // Experiential Data (upgrade): all four servers and New.
    expect(opts(s, 'corp', 1)?.map((o) => o.server)).toEqual(['hq', 'rd', 'archives', 'remote1', 'new']);
    expect(opts(s, 'corp', 1)?.every((o) => o.cost === 0 && o.reject === null)).toBe(true);
  });

  it('S-02-1: an asset in a remote leaves an upgrade-only remote open for agendas', () => {
    const s = run(corp(['c11', 'c08']), [install('corp', 0, 'new')]).state; // remote1 holds only an upgrade
    expect(opts(s, 'corp', 0)?.map((o) => o.server)).toEqual(['remote1', 'new']);
  });

  it('S-02-2 AC1/AC4: ICE lists every server and New with its price; unaffordable ones say no_credits', () => {
    let s = withClicks(corp(['c05', 'c04', 'c06', 'c07'], 5), 'corp', 3);
    s = run(s, [install('corp', 0, 'hq'), install('corp', 0, 'hq'), install('corp', 0, 'rd')]).state; // HQ 2 ICE, R&D 1
    s = withCredits(withClicks(s, 'corp', 1), 'corp', 1);
    expect(opts(s, 'corp', 0)).toEqual([
      { server: 'hq', type: 'install', cost: 2, reject: 'no_credits' },
      { server: 'rd', type: 'install', cost: 1, reject: null },
      { server: 'archives', type: 'install', cost: 0, reject: null },
      { server: 'new', type: 'install', cost: 0, reject: null },
    ]);
  });

  it('S-02-3 AC1/AC3/AC5: Runner installs show the card price, no_credits and no_memory', () => {
    const s = withRig(runner(['r06', 'r12', 'r09'], 4), ['r12']); // 2/4 memory used, 4 credits
    expect(opts(s, 'runner', 0)).toEqual([{ server: null, type: 'install', cost: 4, reject: null }]); // Ninja
    expect(opts(s, 'runner', 1)).toEqual([{ server: null, type: 'install', cost: 5, reject: 'no_credits' }]); // Magnum Opus
    const full = withCredits(withRig(s, ['r12']), 'runner', 9); // 4/4
    expect(opts(full, 'runner', 0)).toEqual([{ server: null, type: 'install', cost: 4, reject: 'no_memory' }]);
    expect(opts(full, 'runner', 2)).toEqual([{ server: null, type: 'install', cost: 1, reject: null }]); // hardware
  });

  it('S-02-4 AC1/AC3/AC4: Play shows its price; no_credits and not_implemented are reported', () => {
    const s = corp(['c01', 'c02', 'c12'], 4);
    expect(opts(s, 'corp', 0)).toEqual([{ server: null, type: 'play', cost: 5, reject: 'no_credits' }]);
    expect(opts(s, 'corp', 1)).toEqual([{ server: null, type: 'play', cost: 0, reject: null }]);
    expect(opts(s, 'corp', 2)).toEqual([{ server: null, type: 'play', cost: 2, reject: 'not_implemented' }]);
    const r = runner(['r01', 'r03', 'r07', 'r11']);
    expect(opts(r, 'runner', 0)).toEqual([{ server: null, type: 'play', cost: 0, reject: null }]);
    expect(opts(r, 'runner', 2)?.[0]?.reject).toBe('not_implemented');
    expect(opts(r, 'runner', 3)?.[0]?.reject).toBe('not_implemented');
  });

  it('off-turn, out of clicks or in the discard step, options stay listed with that reason', () => {
    const s = corp(['c01']);
    expect(viewFor('runner', s).handOptions.flat().every((o) => o.reject === 'not_your_turn')).toBe(true);
    expect(opts(withClicks(s, 'corp', 0), 'corp', 0)?.[0]?.reject).toBe('no_clicks');
    const discarding = run(withHand(newGame(41), 'corp', ['c01', 'c02', 'c03', 'c04', 'c05', 'c06']), [
      { type: 'end_turn', player: 'corp' },
    ]).state;
    expect(viewFor('corp', discarding).handOptions.flat().every((o) => o.reject === 'wrong_phase')).toBe(true);
  });

  it('never offers bad_card or bad_target; reject null exactly when apply accepts and legalActions lists it', () => {
    const states = [
      corp(['c01', 'c02', 'c03', 'c04', 'c05', 'c08', 'c11', 'c12']),
      run(corp(['c08', 'c03', 'c05', 'c11'], 1), [install('corp', 0, 'new'), install('corp', 1, 'remote1')]).state,
      withRig(runner(['r01', 'r03', 'r04', 'r06', 'r07', 'r12', 'r09'], 3), ['r12', 'r04']),
    ];
    for (const s of states) {
      for (const p of ['corp', 'runner'] as const) {
        const legal = legalActions(s, p);
        for (const o of viewFor(p, s).handOptions.flat()) {
          expect(['bad_card', 'bad_target']).not.toContain(o.reject);
          const accepted = !apply(s, o.action).events.some((e) => e.type === 'action_rejected');
          expect(accepted).toBe(o.reject === null);
          expect(legal.some((a) => JSON.stringify(a) === JSON.stringify(o.action))).toBe(accepted);
        }
        // ...and every legal install/play is an offered option.
        const offered = viewFor(p, s).handOptions.flat().map((o) => JSON.stringify(o.action));
        for (const a of legal.filter((x) => x.type === 'install' || x.type === 'play')) {
          expect(offered).toContain(JSON.stringify(a));
        }
      }
    }
  });
});
