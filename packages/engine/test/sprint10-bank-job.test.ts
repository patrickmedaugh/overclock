// Sprint 10 E3 (S-10-3): Bank Job lets the Runner choose how many credits to take (1..what it holds),
// one `activate` option per amount at step success, then Access cards. Real play from a new game.
import { describe, expect, it } from 'vitest';
import { getCard } from '@overclock/cards';
import { apply, legalActions, viewEvents, viewFor, type Action, type GameState, type ServerId } from '../src/index';
import { clone, finishTurn, rejection, run, withHand, withPlayer, newGame } from './helpers';

const corpInstall = (handIndex: number, server: ServerId | 'new'): Action => ({ type: 'install', player: 'corp', handIndex, server });
const install = (handIndex: number): Action => ({ type: 'install', player: 'runner', handIndex });
const runOn = (server: ServerId): Action => ({ type: 'run', player: 'runner', server });
const pass: Action = { type: 'pass', player: 'runner' };
const take = (amount: number, uid = 'i2'): Action => ({ type: 'activate', player: 'runner', uid, ability: 0, amount });

/** PAD Campaign alone in remote1 (seed 21); Bank Job (i2) installed with 8; the Runner has just got in. */
function atSuccess(): GameState {
  let s = withHand(newGame(21), 'corp', ['c03']);
  s = run(s, [corpInstall(0, 'new')]).state;
  s = finishTurn(s).state;
  s = withPlayer(withHand(s, 'runner', ['r10']), 'runner', { credits: 5 });
  s = run(s, [install(0), runOn('remote1')]).state;
  expect(s.run?.step).toBe('success');
  expect(s.rig[0]).toMatchObject({ uid: 'i2', cardId: 'r10', hostedCredits: 8 });
  return s;
}

const remote1 = (s: GameState) => s.servers.find((sv) => sv.id === 'remote1')!.content.map((c) => c.cardId);

describe('S-10-3: Bank Job, choose the amount', () => {
  it('card data: "Take credits", a chosen take (no per-card code)', () => {
    expect(getCard('r10')!.cardAbilities).toEqual([
      {
        label: 'Take credits',
        when: 'successful_run_remote',
        clicks: 0,
        credits: 0,
        requires: 'hosted_credits',
        replacesAccess: true,
        effects: [{ op: 'take_credits', amount: 'chosen' }],
      },
    ]);
  });

  it('step success lists one Take option per amount 1..8 (gain = amount, cost 0), then Access cards; Corp sees none', () => {
    const s = atSuccess();
    const amounts = Array.from({ length: 8 }, (_, k) => k + 1);
    expect(viewFor('runner', s).run!.options).toEqual([
      ...amounts.map((n) => ({ action: take(n), cost: 0, reject: null, gain: n })),
      { action: pass, cost: 0, reject: null },
    ]);
    expect(legalActions(s, 'runner')).toEqual([...amounts.map((n) => take(n)), pass]);
    expect(viewFor('corp', s).run!.options).toEqual([]);
    expect(legalActions(s, 'corp')).toEqual([]);
  });

  it('AC5: take 3 of 8: +3 credits, Bank Job keeps 5, nothing accessed, the run ends access_replaced', () => {
    const s = atSuccess();
    const credits = s.players.runner.credits;
    const r = apply(s, take(3));
    expect(r.events).toEqual([
      { type: 'ability_triggered', uid: 'i2', cardId: 'r10', trigger: 'successful_run' },
      { type: 'hosted_credits_changed', uid: 'i2', credits: 5 },
      { type: 'credit_gained', player: 'runner', amount: 3 },
      { type: 'run_ended', server: 'remote1', outcome: 'access_replaced' },
    ]);
    expect(r.state.players.runner.credits).toBe(credits + 3);
    expect(r.state.players.runner.clicks).toBe(s.players.runner.clicks);
    expect(r.state.rig).toHaveLength(1);
    expect(r.state.rig[0]).toMatchObject({ uid: 'i2', cardId: 'r10', hostedCredits: 5 });
    expect(remote1(r.state)).toEqual(['c03']);
    expect(r.state.phase).toBe('action');
    expect(viewFor('runner', r.state).lastRun).toBeNull();
    for (const side of ['corp', 'runner'] as const) {
      expect(viewFor(side, r.state).rig[0]!.hostedCredits).toBe(5);
      expect(viewEvents(side, r.events)).toEqual(r.events);
    }
  });

  it('the next successful remote run offers 1..5', () => {
    let s = apply(atSuccess(), take(3)).state;
    s = run(s, [runOn('remote1')]).state;
    expect(s.run?.step).toBe('success');
    expect(legalActions(s, 'runner')).toEqual([take(1), take(2), take(3), take(4), take(5), pass]);
  });

  it('AC6: Access cards instead: access as normal, Bank Job keeps all 8', () => {
    const r = apply(atSuccess(), pass);
    expect(r.events).toEqual([{ type: 'card_accessed', cardId: 'c03', from: 'remote', uid: 'i1' }]);
    expect(r.state.run?.step).toBe('access');
    expect(r.state.rig[0]!.hostedCredits).toBe(8);
  });

  it('AC7: take all 8: Bank Job goes to the Heap as before', () => {
    const s = atSuccess();
    const r = apply(s, take(8));
    expect(r.events).toEqual([
      { type: 'ability_triggered', uid: 'i2', cardId: 'r10', trigger: 'successful_run' },
      { type: 'hosted_credits_changed', uid: 'i2', credits: 0 },
      { type: 'credit_gained', player: 'runner', amount: 8 },
      { type: 'rig_card_trashed', uid: 'i2', cardId: 'r10' },
      { type: 'run_ended', server: 'remote1', outcome: 'access_replaced' },
    ]);
    expect(r.state.players.runner.credits).toBe(s.players.runner.credits + 8);
    expect(r.state.rig).toEqual([]);
    expect(r.state.players.runner.discard.at(-1)).toEqual({ cardId: 'r10', faceUp: true });
  });

  it('take 5, then the last 3 on the next run: Heap', () => {
    let s = apply(atSuccess(), take(5)).state;
    s = run(s, [runOn('remote1')]).state;
    const r = apply(s, take(3));
    expect(r.state.rig).toEqual([]);
    expect(r.state.players.runner.discard.at(-1)).toEqual({ cardId: 'r10', faceUp: true });
  });

  const bad: [string, unknown, string][] = [
    ['no amount', { type: 'activate', player: 'runner', uid: 'i2', ability: 0 }, 'invalid_action'],
    ['amount 2.5', { ...take(1), amount: 2.5 }, 'invalid_action'],
    ['amount "3"', { ...take(1), amount: '3' }, 'invalid_action'],
    ['amount null', { ...take(1), amount: null }, 'invalid_action'],
    ['amount NaN', { ...take(1), amount: Number.NaN }, 'invalid_action'],
    ['amount 0', take(0), 'bad_target'],
    ['amount -1', take(-1), 'bad_target'],
    ['amount 9 (more than it holds)', take(9), 'bad_target'],
    ['amount 1000', take(1000), 'bad_target'],
    ['by the Corp', { ...take(3), player: 'corp' }, 'not_your_turn'],
    ['unknown card', take(3, 'i9'), 'bad_target'],
  ];
  it.each(bad)('refused: %s, state unchanged', (_name, action, reason) => {
    const s = atSuccess();
    const snapshot = clone(s);
    const r = apply(s, action as Action);
    expect(r.events).toEqual([{ type: 'action_rejected', reason }]);
    expect(r.state).toBe(s);
    expect(s).toEqual(snapshot);
  });

  it('outside step success a named amount is wrong_phase (before the amount is looked at)', () => {
    const s = apply(atSuccess(), pass).state;
    expect(rejection(apply(s, take(3)).events)).toBe('wrong_phase');
    expect(rejection(apply(s, take(99)).events)).toBe('wrong_phase');
  });
});
