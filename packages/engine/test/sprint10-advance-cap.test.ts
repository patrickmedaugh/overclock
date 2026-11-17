// Sprint 10 E2 (S-10-3): advance stops at an agenda's requirement (house rule); advanceable ICE
// (Ice Wall) has no limit. Real play from a new game (hands, clicks and credits set first).
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewFor, type Action, type GameState } from '../src/index';
import { clone, finishTurn, rejection, run, withHand, withPlayer, newGame } from './helpers';

const advance = (uid: string): Action => ({ type: 'advance', player: 'corp', uid });
const score = (uid: string): Action => ({ type: 'score', player: 'corp', uid });

/** Corp turn 1: `hand` installed one by one into new servers (uids i1, i2, ...), then clicks/credits set. */
function corpInstalled(hand: string[], clicks = 3, credits = 5): GameState {
  let s = withPlayer(withHand(newGame(21), 'corp', hand), 'corp', { clicks: hand.length, credits });
  s = run(s, hand.map(() => ({ type: 'install', player: 'corp', handIndex: 0, server: 'new' }) as Action)).state;
  return withPlayer(s, 'corp', { clicks, credits });
}

const counters = (s: GameState, uid: string) =>
  s.servers.flatMap((sv) => [...sv.ice, ...sv.content]).find((c) => c.uid === uid)?.advancements;

describe('S-10-3: advance stops at the requirement (agendas only)', () => {
  // Hostile Takeover (c08): requirement 2.
  const atLimit = () => run(corpInstalled(['c08']), [advance('i1'), advance('i1')]).state;

  it('AC1: an agenda with all the advancements it needs offers only Score (no Advance)', () => {
    const s = atLimit();
    expect(counters(s, 'i1')).toBe(2);
    expect(viewFor('corp', s).installedOptions.i1).toEqual([{ action: score('i1'), cost: 0, reject: null }]);
    expect(legalActions(s, 'corp')).not.toContainEqual(advance('i1'));
    expect(legalActions(s, 'corp')).toContainEqual(score('i1'));
  });

  it('AC2: one short: Advance only; after one advance the next look shows only Score', () => {
    const s = run(corpInstalled(['c08']), [advance('i1')]).state;
    expect(viewFor('corp', s).installedOptions.i1).toEqual([{ action: advance('i1'), cost: 1, reject: null }]);
    const next = apply(s, advance('i1')).state;
    expect(viewFor('corp', next).installedOptions.i1).toEqual([{ action: score('i1'), cost: 0, reject: null }]);
  });

  it('AC3: advancing an agenda at its limit anyway is refused (condition_not_met), state unchanged', () => {
    const s = atLimit();
    const snapshot = clone(s);
    const r = apply(s, advance('i1'));
    expect(r.events).toEqual([{ type: 'action_rejected', reason: 'condition_not_met' }]);
    expect(r.state).toBe(s);
    expect(s).toEqual(snapshot);
  });

  it('AC3: the higher requirement agendas stop at theirs too (Private Security Force 4, Priority Requisition 5)', () => {
    for (const [id, req] of [['c09', 4], ['c10', 5]] as const) {
      let s = withPlayer(corpInstalled([id]), 'corp', { clicks: 9, credits: 9 });
      for (let k = 0; k < req; k++) s = run(s, [advance('i1')]).state;
      expect(counters(s, 'i1')).toBe(req);
      expect(rejection(apply(s, advance('i1')).events)).toBe('condition_not_met');
      expect(viewFor('corp', s).installedOptions.i1!.map((o) => o.action.type)).toEqual(['score']);
    }
  });

  it('precedence: no_clicks and bad_target beat condition_not_met; condition_not_met beats no_credits', () => {
    const s = atLimit();
    expect(rejection(apply(withPlayer(s, 'corp', { clicks: 0 }), advance('i1')).events)).toBe('no_clicks');
    expect(rejection(apply(withPlayer(s, 'corp', { credits: 0 }), advance('i1')).events)).toBe('condition_not_met');
    expect(rejection(apply(s, { type: 'advance', player: 'runner', uid: 'i1' }).events)).toBe('not_your_turn');
  });

  it("the Corp's off-turn listing of an agenda at its limit is still only Score (reason not_your_turn)", () => {
    const off = finishTurn(atLimit()).state;
    expect(viewFor('corp', off).installedOptions.i1).toEqual([{ action: score('i1'), cost: 0, reject: 'not_your_turn' }]);
  });

  it('scoring is unchanged once at the limit', () => {
    const r = apply(atLimit(), score('i1'));
    expect(r.events.some((e) => e.type === 'agenda_scored')).toBe(true);
  });

  it('AC4: an advanced Ice Wall still offers Advance, past any number of counters', () => {
    let s = withPlayer(corpInstalled(['c05']), 'corp', { clicks: 9, credits: 9 });
    for (let k = 0; k < 6; k++) s = run(s, [advance('i1')]).state;
    expect(counters(s, 'i1')).toBe(6);
    expect(viewFor('corp', s).installedOptions.i1).toEqual([{ action: advance('i1'), cost: 1, reject: null }]);
    expect(rejection(apply(s, advance('i1')).events)).toBeNull();
  });
});
