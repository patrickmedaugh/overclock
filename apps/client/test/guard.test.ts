import { describe, expect, it } from 'vitest';
import { guardOpen } from '../src/guard';

describe('guardOpen', () => {
  it('is open when no guard is armed', () => {
    expect(guardOpen(null, 0, 300)).toBe(true);
    expect(guardOpen(null, 12345, 300)).toBe(true);
  });

  it('refuses taps stamped inside the guard window, measured from the arming tap', () => {
    for (const dt of [0, 5, 40, 150, 270, 299.9]) expect(guardOpen(1000, 1000 + dt, 300), `${dt}ms`).toBe(false);
  });

  it('accepts taps stamped at or after the window end', () => {
    for (const dt of [300, 300.1, 450, 10_000]) expect(guardOpen(1000, 1000 + dt, 300), `${dt}ms`).toBe(true);
  });

  it('uses the tap stamps only: a late-delivered tap stamped inside the window is still refused', () => {
    // The handler may run 500ms later on a busy phone; only the stamp counts.
    expect(guardOpen(1000, 1100, 300)).toBe(false);
  });

  it('refuses a tap stamped before the arming tap', () => {
    expect(guardOpen(1000, 990, 300)).toBe(false);
  });

  it('never locks on junk stamps', () => {
    expect(guardOpen(Number.NaN, 1000, 300)).toBe(true);
    expect(guardOpen(1000, Number.NaN, 300)).toBe(true);
    expect(guardOpen(1000, Number.POSITIVE_INFINITY, 300)).toBe(true);
  });

  it('a zero guard is always open after the arming tap', () => {
    expect(guardOpen(1000, 1000, 0)).toBe(true);
  });
});
