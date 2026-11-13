import { describe, expect, it } from 'vitest';
import { isCode, joinCodeFromUrl, normalizeCode } from '../src/gameCode';

describe('game codes as typed', () => {
  it('upper-cases and drops spaces and dashes', () => {
    expect(normalizeCode(' k7-q f ')).toBe('K7QF');
  });
  it('accepts 4 characters from the alphabet only', () => {
    expect(isCode('K7QF')).toBe(true);
    expect(isCode('K7Q')).toBe(false);
    expect(isCode('K7QFX')).toBe(false);
    // No 0/O/1/I/L (easy to mix up).
    for (const c of ['K7Q0', 'K7QO', 'K7Q1', 'K7QI', 'K7QL']) expect(isCode(c)).toBe(false);
  });
  it('reads ?join= from the address', () => {
    expect(joinCodeFromUrl('?join=k7qf')).toBe('K7QF');
    expect(joinCodeFromUrl('?seed=1')).toBeNull();
    expect(joinCodeFromUrl('?join=')).toBeNull();
  });
});
