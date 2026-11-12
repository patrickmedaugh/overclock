import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, viewFor, type GameState, type PlaceOption } from '../src/index';
import { finishTurn, run, withClicks, withHand, withPlayer } from './helpers';

const corpWith = (hand: string[], credits = 5): GameState => withPlayer(withHand(newGame(14), 'corp', hand), 'corp', { credits });
const runnerWith = (hand: string[], credits = 5): GameState =>
  withPlayer(withHand(finishTurn(newGame(14)).state, 'runner', hand), 'runner', { credits });

const placesOf = (s: GameState, handIndex: number): PlaceOption[] =>
  viewFor(s.activePlayer, s).handOptions.find((o) => o.handIndex === handIndex)?.places.slice() ?? [];
const summary = (places: PlaceOption[]) => places.map((p) => [p.place, p.cost, p.reason]);

describe('PlayerView.handOptions', () => {
  it('S-02-1 AC1: agenda/asset: every remote with a free slot and New server (centrals are not offered)', () => {
    let s = corpWith(['c08', 'c03', 'c08']);
    expect(summary(placesOf(s, 0))).toEqual([['new', 0, null]]);
    s = run(s, [{ type: 'install', player: 'corp', handIndex: 0, server: 'new' }]).state; // remote-1 holds c08
    s = run(s, [{ type: 'install', player: 'corp', handIndex: 0, server: 'new' }]).state; // remote-2 holds c03
    s = withClicks(s, 'corp', 3);
    // S-02-1 AC3: full remotes are not offered.
    expect(summary(placesOf(s, 0))).toEqual([['new', 0, null]]);
    expect(placesOf(s, 0)[0]?.action).toEqual({ type: 'install', player: 'corp', handIndex: 0, server: 'new' });
  });

  it('S-02-1 AC1/AC3: upgrades are offered in every server, including the centrals and full remotes', () => {
    const s = withClicks(run(corpWith(['c08', 'c11']), [{ type: 'install', player: 'corp', handIndex: 0, server: 'new' }]).state, 'corp', 3);
    expect(summary(placesOf(s, 0))).toEqual([
      ['hq', 0, null],
      ['rd', 0, null],
      ['archives', 0, null],
      ['remote-1', 0, null],
      ['new', 0, null],
    ]);
  });

  it('S-02-2 AC1/AC4: ICE: every server plus New server, priced by ICE count; unaffordable ones listed as no_credits', () => {
    let s = corpWith(['c05', 'c05', 'c05', 'c04'], 10);
    s = run(s, [
      { type: 'install', player: 'corp', handIndex: 0, server: 'hq' },
      { type: 'install', player: 'corp', handIndex: 0, server: 'hq' },
      { type: 'install', player: 'corp', handIndex: 0, server: 'new' },
    ]).state;
    s = withPlayer(s, 'corp', { clicks: 1, credits: 1 });
    expect(summary(placesOf(s, 0))).toEqual([
      ['hq', 2, 'no_credits'],
      ['rd', 0, null],
      ['archives', 0, null],
      ['remote-1', 1, null],
      ['new', 0, null],
    ]);
  });

  it('S-02-3 AC1/AC5: Runner cards offer the rig with their cost; full memory is listed as no_memory', () => {
    let s = runnerWith(['r05', 'r04', 'r04', 'r04', 'r04', 'r09'], 3);
    expect(summary(placesOf(s, 0))).toEqual([['rig', 4, 'no_credits']]);
    expect(placesOf(s, 0)[0]?.action).toEqual({ type: 'install', player: 'runner', handIndex: 0 });
    s = withPlayer(run(withPlayer(s, 'runner', { credits: 20 }), [1, 1, 1, 1].map(() => ({ type: 'install', player: 'runner', handIndex: 1 }) as const)).state, 'runner', { clicks: 1 });
    expect(summary(placesOf(s, 0))).toEqual([['rig', 4, 'no_memory']]);
    expect(summary(placesOf(s, 1))).toEqual([['rig', 1, null]]); // hardware: no memory needed
  });

  it('S-02-4: operations/events offer Play with the price; needs_runs and no_credits are listed', () => {
    const s = corpWith(['c01', 'c02', 'c12'], 4);
    expect(summary(placesOf(s, 0))).toEqual([['play', 5, 'no_credits']]);
    expect(summary(placesOf(s, 1))).toEqual([['play', 0, null]]);
    expect(summary(placesOf(s, 2))).toEqual([['play', 2, 'needs_runs']]);
    expect(placesOf(s, 1)[0]?.action).toEqual({ type: 'play', player: 'corp', handIndex: 1 });
    const r = runnerWith(['r01', 'r03', 'r07', 'r11']);
    expect(viewFor('runner', r).handOptions.map((o) => summary(o.places.slice()))).toEqual([
      [['play', 0, null]],
      [['play', 0, null]],
      [['play', 2, 'needs_runs']],
      [['play', 2, 'needs_runs']],
    ]);
  });

  it('with no clicks every place is listed as no_clicks; one entry per hand card, in order', () => {
    const s = withClicks(corpWith(['c08', 'c01', 'c05']), 'corp', 0);
    const opts = viewFor('corp', s).handOptions;
    expect(opts.map((o) => o.handIndex)).toEqual([0, 1, 2]);
    expect(opts.flatMap((o) => o.places.map((p) => p.reason))).toEqual(Array(1 + 1 + 4).fill('no_clicks'));
  });

  it('is empty for the waiting player, in the discard step and after the game', () => {
    const s = corpWith(['c08', 'c08', 'c08', 'c08', 'c08', 'c08']);
    expect(viewFor('runner', s).handOptions).toEqual([]);
    expect(viewFor('corp', run(s, [{ type: 'end_turn', player: 'corp' }]).state).handOptions).toEqual([]);
    expect(viewFor('corp', { ...s, phase: 'over', result: { winner: 'runner', reason: 'corp_decked' } }).handOptions).toEqual([]);
  });

  it('every option reason equals what apply says; every legal option is in legalActions and vice versa', () => {
    const states = [
      corpWith(['c01', 'c02', 'c03', 'c05', 'c08', 'c11', 'c12'], 3),
      withClicks(corpWith(['c01', 'c05']), 'corp', 0),
      runnerWith(['r01', 'r02', 'r03', 'r04', 'r05', 'r07', 'r09', 'r10'], 2),
      run(runnerWith(['r04', 'r04', 'r04', 'r04', 'r06'], 20), [0, 0, 0, 0].map(() => ({ type: 'install', player: 'runner', handIndex: 0 }) as const)).state,
    ];
    for (const s of states) {
      const v = viewFor(s.activePlayer, s);
      const legal = legalActions(s, s.activePlayer).filter((a) => a.type === 'install' || a.type === 'play');
      const offered = v.handOptions.flatMap((o) => o.places);
      for (const p of offered) {
        const r = apply(s, p.action);
        const reason = r.events.find((e) => e.type === 'action_rejected');
        expect(reason && 'reason' in reason ? reason.reason : null).toBe(p.reason);
      }
      expect(offered.filter((p) => p.reason === null).map((p) => p.action)).toEqual(legal);
    }
  });
});
