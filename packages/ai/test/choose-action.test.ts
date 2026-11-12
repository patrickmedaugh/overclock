import { apply, newGame, viewFor, type Action } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/index';

describe('chooseAction (stub)', () => {
  it('returns a legal action from the view', () => {
    const view = viewFor('corp', newGame(1));
    const action = chooseAction(view);
    expect(view.legalActions).toContainEqual(action);
  });

  it('returns null when no action is legal (not its turn)', () => {
    expect(chooseAction(viewFor('runner', newGame(1)))).toBeNull();
  });

  it('can play both sides through whole turns, including the discard step, without a rejection', () => {
    let s = newGame(3);
    for (let i = 0; i < 40 && s.phase !== 'over'; i++) {
      const action = chooseAction(viewFor(s.activePlayer, s)) as Action;
      expect(action).not.toBeNull();
      const r = apply(s, action);
      expect(r.events.some((e) => e.type === 'action_rejected')).toBe(false);
      s = r.state;
    }
    expect(s.turn).toBeGreaterThan(2);
  });
});
