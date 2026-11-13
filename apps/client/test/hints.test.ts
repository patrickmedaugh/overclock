// U4: one plain hint per refusal reason (S-02-2 AC4, S-02-3 AC3/AC5, S-02-4 AC3/AC4).
import type { RejectReason } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { hintFor } from '../src/hints';

const ALL: RejectReason[] = [
  'invalid_action', 'game_over', 'not_your_turn', 'wrong_phase', 'no_clicks', 'deck_empty', 'bad_discard',
  'bad_card', 'bad_target', 'not_implemented', 'no_credits', 'no_memory',
];

describe('hintFor', () => {
  it('the Sprint 2 hints read as the proposal says', () => {
    expect(hintFor('no_credits', null)).toBe('Not enough credits');
    expect(hintFor('no_memory', null)).toBe('Not enough memory');
    expect(hintFor('not_implemented', null)).toBe("That card can't be played yet");
  });

  it('an empty deck is named with the real words', () => {
    expect(hintFor('deck_empty', { viewer: 'corp', pendingDiscard: 0 })).toBe('R&D is empty');
    expect(hintFor('deck_empty', { viewer: 'runner', pendingDiscard: 0 })).toBe('Your Stack is empty');
  });

  it.each(ALL)('%s has a short, non-empty hint', (r) => {
    const h = hintFor(r, { viewer: 'corp', pendingDiscard: 0 });
    expect(h.length).toBeGreaterThan(5);
    expect(h.length).toBeLessThanOrEqual(32);
  });
});
