// Sprint 10 E1: the pinned interface (RULES_VERSION, `activate.amount` shape, `abilityGain` with an amount).
import { describe, expect, it } from 'vitest';
import type { CardAbility } from '@overclock/cards';
import { RULES_VERSION, apply, type Action, type GameState, type ServerId } from '../src/index';
import { abilityGain, hasChosenAmount } from '../src/rules';
import { finishTurn, rejection, run, withHand, withPlayer, newGame } from './helpers';

const corpInstall = (handIndex: number, server: ServerId | 'new'): Action => ({ type: 'install', player: 'corp', handIndex, server });
const install = (handIndex: number): Action => ({ type: 'install', player: 'runner', handIndex });

/** `cardId` installed in the Runner's action phase (Corp turn 1: PAD Campaign in remote1). */
function runnerWith(cardId: string): GameState {
  let s = withHand(newGame(21), 'corp', ['c03']);
  s = run(s, [corpInstall(0, 'new')]).state;
  s = finishTurn(s).state;
  s = withPlayer(withHand(s, 'runner', [cardId]), 'runner', { credits: 5 });
  return run(s, [install(0)]).state;
}

const chosen: CardAbility = {
  label: 'Take credits',
  when: 'successful_run_remote',
  clicks: 0,
  credits: 0,
  requires: 'hosted_credits',
  replacesAccess: true,
  effects: [{ op: 'take_credits', amount: 'chosen' }],
};
const card = { uid: 'i9', cardId: 'r10', rezzed: true, advancements: 0, hostedCredits: 8 };

describe('Sprint 10 interface (E1)', () => {
  it('RULES_VERSION is 5 (Sprint 12; 4 from Sprint 10)', () => {
    expect(RULES_VERSION).toBe(5);
  });

  it("abilityGain: a 'chosen' take gives the amount, capped at the card's credits; 0 without one", () => {
    expect(hasChosenAmount(chosen)).toBe(true);
    expect(abilityGain(card, chosen, 3)).toBe(3);
    expect(abilityGain(card, chosen, 8)).toBe(8);
    expect(abilityGain(card, chosen, 12)).toBe(8);
    expect(abilityGain(card, chosen)).toBe(0);
    expect(abilityGain(card, { ...chosen, effects: [{ op: 'take_credits', amount: 'all' }] })).toBe(8);
    expect(hasChosenAmount({ ...chosen, effects: [{ op: 'take_credits', amount: 2 }] })).toBe(false);
  });

  it('activate.amount on an ability without a chosen amount is invalid_action (Armitage Codebusting)', () => {
    const s = runnerWith('r02');
    const uid = s.rig[0]!.uid;
    const base: Action = { type: 'activate', player: 'runner', uid, ability: 0 };
    expect(apply(s, base).events[0]?.type).not.toBe('action_rejected');
    expect(rejection(apply(s, { ...base, amount: 2 }).events)).toBe('invalid_action');
    expect(rejection(apply(s, { ...base, amount: 1.5 }).events)).toBe('invalid_action');
    expect(rejection(apply(s, { ...base, amount: '2' } as unknown as Action).events)).toBe('invalid_action');
  });
});
