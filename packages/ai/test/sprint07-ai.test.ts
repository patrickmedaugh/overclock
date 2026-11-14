// Sprint 7 E7: the AI stays legal with the new options (rez assets, activate, success step,
// advanceable ICE). Random games where the AI answers for the deciding seat every few steps;
// it sees only that seat's view, and each of its actions must be accepted.
import { apply, legalActions, newGame, viewFor, waitingOn, type Action, type GameState } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/index';

function prng(seed: number): (n: number) => number {
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

/** Prefer the Sprint 7 moves so the AI meets them. */
const favoured = (a: Action) => a.type === 'activate' || a.type === 'rez' || a.type === 'advance' || a.type === 'install' || a.type === 'run';

describe('Sprint 7: chooseAction with card abilities', () => {
  it('in 120 random games, every AI answer is a listed legal action and accepted (success step included)', () => {
    let asked = 0;
    let atSuccess = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const pick = prng(seed);
      let s: GameState = newGame(seed);
      for (let step = 0; step < 800 && s.phase !== 'over'; step++) {
        const me = waitingOn(s)!;
        let action: Action;
        if (step % 3 === 0 || s.run?.step === 'success') {
          const view = viewFor(me, s);
          action = chooseAction(view) as Action;
          expect(action, `seed ${seed} step ${step}`).not.toBeNull();
          expect(view.legalActions).toContainEqual(action);
          asked++;
          if (s.run?.step === 'success') {
            atSuccess++;
            expect(action.type).toBe('activate'); // the first legal option: take the credits
          }
        } else {
          const legal = legalActions(s, me);
          const good = legal.filter(favoured);
          const list = good.length > 0 && pick(2) === 0 ? good : legal;
          action = list[pick(list.length)]!;
        }
        const r = apply(s, action);
        expect(r.events.some((e) => e.type === 'action_rejected'), `seed ${seed} step ${step} ${JSON.stringify(action)}`).toBe(false);
        s = r.state;
      }
    }
    expect(asked).toBeGreaterThan(1000);
    expect(atSuccess).toBeGreaterThan(0);
  }, 120_000);
});
