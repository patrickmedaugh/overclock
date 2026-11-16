// Sprint 9 E5 (S-09-3): Private Security Force — "Click: Do 1 meat damage" from the Corp's score area
// while the Runner is tagged; meat damage throws away random Grip cards; an empty Grip flatlines.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewFor, type Action, type GameState } from '../src/index';
import { act, board, finishTurn, liveness, rejection, withPlayer } from './helpers';
import { expectRunnerEventsClean, expectRunnerViewClean } from './hidden';

const CORE = { deckSet: 'core' } as const;
const psf = (i = 0): Action => ({ type: 'activate', player: 'corp', uid: `score:corp:${i}`, ability: 0 });

/** The Corp's turn (3 clicks) with `scored` in its score area, the Runner with `tags` and `grip`. */
function corpTurn(opts: { tags: number; grip?: string[]; scored?: string[] }): GameState {
  const s = finishTurn(board({ runnerHand: ['r01'] }, 77, CORE)).state;
  expect(s.activePlayer).toBe('corp');
  const c = withPlayer(s, 'corp', { scoreArea: opts.scored ?? ['c09'] });
  return withPlayer(c, 'runner', { tags: opts.tags, hand: opts.grip ?? ['r01', 'r03', 'r09'] });
}

describe('S-09-3 AC1/AC2: Private Security Force does 1 meat damage per click while the Runner is tagged', () => {
  it('its score-area card offers "Do 1 meat damage · 1 click"; it throws a random Grip card face up to the Heap, named', () => {
    const s = corpTurn({ tags: 1 });
    const v = viewFor('corp', s);
    expect(v.installedOptions['score:corp:0']).toEqual([{ action: psf(), cost: 0, clicks: 1, reject: null }]);
    expect(legalActions(s, 'corp')).toContainEqual(psf());
    const r = act(s, psf());
    expect(r.events).toHaveLength(2);
    expect(r.events[0]).toEqual({ type: 'ability_triggered', uid: 'score:corp:0', cardId: 'c09', trigger: 'click' });
    const dmg = r.events[1]!;
    expect(dmg).toMatchObject({ type: 'meat_damage', amount: 1 });
    const lost = dmg.type === 'meat_damage' ? dmg.cardIds : [];
    expect(lost).toHaveLength(1);
    expect(['r01', 'r03', 'r09']).toContain(lost[0]);
    expect(r.state.players.runner.hand).toHaveLength(2);
    expect(r.state.players.runner.discard.at(-1)).toEqual({ cardId: lost[0], faceUp: true });
    expect(r.state.players.corp.clicks).toBe(2);
    // Both see the lost card face up in the Heap.
    for (const viewer of ['corp', 'runner'] as const) expect(viewFor(viewer, r.state).players.runner.discard.at(-1)).toBe(lost[0]);
    expectRunnerEventsClean(r.events, 'PSF', r.state);
    expectRunnerViewClean(r.state, 'PSF');
    liveness(r.state);
  });

  it('once per click: three clicks, three cards; then dimmed no_clicks', () => {
    let s = corpTurn({ tags: 1, grip: ['r01', 'r03', 'r09', 'r14'] });
    for (let k = 0; k < 3; k++) s = act(s, psf()).state;
    expect(s.players.runner.hand).toHaveLength(1);
    expect(s.players.runner.discard.slice(-3).every((d) => d.faceUp)).toBe(true);
    expect(viewFor('corp', s).installedOptions['score:corp:0']).toEqual([{ action: psf(), cost: 0, clicks: 1, reject: 'no_clicks' }]);
    expect(rejection(apply(s, psf()).events)).toBe('no_clicks');
  });

  it('the random card comes from the seeded RNG: same state, same card; the RNG moves', () => {
    const s = corpTurn({ tags: 1, grip: ['r01', 'r03', 'r09', 'r14', 'r15'] });
    const a = act(s, psf());
    const b = act(s, psf());
    expect(a.events).toEqual(b.events);
    expect(a.state.rng).not.toBe(s.rng);
  });

  it('a second scored copy has its own uid (score area index); agendas without abilities get none', () => {
    const s = corpTurn({ tags: 1, scored: ['c10', 'c09', 'c09'] });
    const v = viewFor('corp', s);
    expect(Object.keys(v.installedOptions).filter((k) => k.startsWith('score:'))).toEqual(['score:corp:1', 'score:corp:2']);
    expect(rejection(apply(s, psf(0)).events)).toBe('bad_target');
    expect(rejection(apply(s, psf(3)).events)).toBe('bad_target');
    expect(act(s, psf(2)).events[0]).toEqual({ type: 'ability_triggered', uid: 'score:corp:2', cardId: 'c09', trigger: 'click' });
  });
});

describe('S-09-3 AC3: not tagged — dimmed "Runner isn’t tagged" (condition_not_met)', () => {
  it('the option stays listed with reject condition_not_met; using it is refused', () => {
    const s = corpTurn({ tags: 0 });
    expect(viewFor('corp', s).installedOptions['score:corp:0']).toEqual([{ action: psf(), cost: 0, clicks: 1, reject: 'condition_not_met' }]);
    expect(legalActions(s, 'corp')).not.toContainEqual(psf());
    expect(rejection(apply(s, psf()).events)).toBe('condition_not_met');
  });

  it('the Runner never gets it; a stolen Private Security Force does nothing for him', () => {
    const s = corpTurn({ tags: 1 });
    expect(Object.keys(viewFor('runner', s).installedOptions).some((k) => k.startsWith('score:'))).toBe(false);
    expect(rejection(apply(s, { type: 'activate', player: 'runner', uid: 'score:corp:0', ability: 0 }).events)).toBe('not_your_turn');
    const runnerTurn = withPlayer(finishTurn(s).state, 'runner', { scoreArea: ['c09'] });
    expect(rejection(apply(runnerTurn, { type: 'activate', player: 'runner', uid: 'score:runner:0', ability: 0 }).events)).toBe('bad_target');
    expect(rejection(apply(runnerTurn, { type: 'activate', player: 'runner', uid: 'score:corp:0', ability: 0 }).events)).toBe('bad_target');
    expect(rejection(apply(s, { type: 'activate', player: 'corp', uid: 'score:corp:0', ability: 1 }).events)).toBe('bad_target');
  });

  it('not during the Runner’s turn or a run (wrong step): listed with the reason', () => {
    const s = finishTurn(corpTurn({ tags: 1 })).state;
    expect(s.activePlayer).toBe('runner');
    expect(viewFor('corp', s).installedOptions['score:corp:0']).toEqual([{ action: psf(), cost: 0, clicks: 1, reject: 'not_your_turn' }]);
  });
});

describe('S-09-3 AC4: meat damage with an empty Grip flatlines the Runner (automated check)', () => {
  it('0 cards in the Grip: meat_damage with no cards, then the Corp wins by flatline', () => {
    const r = act(corpTurn({ tags: 1, grip: [] }), psf());
    expect(r.events).toEqual([
      { type: 'ability_triggered', uid: 'score:corp:0', cardId: 'c09', trigger: 'click' },
      { type: 'meat_damage', amount: 1, cardIds: [] },
      { type: 'game_over', winner: 'corp', reason: 'flatline' },
    ]);
    expect(r.state.result).toEqual({ winner: 'corp', reason: 'flatline' });
    expect(legalActions(r.state, 'corp')).toEqual([]);
  });

  it('the last card goes, then the next use flatlines', () => {
    const one = act(corpTurn({ tags: 1, grip: ['r14'] }), psf());
    expect(one.events[1]).toEqual({ type: 'meat_damage', amount: 1, cardIds: ['r14'] });
    expect(one.state.phase).toBe('action');
    const two = act(one.state, psf());
    expect(two.events.at(-1)).toEqual({ type: 'game_over', winner: 'corp', reason: 'flatline' });
  });
});
