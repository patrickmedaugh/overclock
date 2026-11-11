import { newGame, viewFor } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/index';

describe('chooseAction (stub)', () => {
  it('returns a legal action from the view', () => {
    const view = viewFor('runner', newGame(1));
    expect(chooseAction(view)).toEqual({ type: 'draw', player: 'runner' });
  });

  it('returns null when no action is legal', () => {
    expect(chooseAction(viewFor('corp', newGame(1)))).toBeNull();
  });
});
