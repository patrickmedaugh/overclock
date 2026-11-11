import { describe, expect, it } from 'vitest';
import { nextFloat, seedToRng, shuffle } from '../src/rng';

describe('mulberry32 rng', () => {
  it('is deterministic and returns the next state explicitly', () => {
    const a = nextFloat(seedToRng(42));
    const b = nextFloat(seedToRng(42));
    expect(a).toEqual(b);
    expect(a.rng).not.toBe(seedToRng(42));
    expect(a.value).toBeGreaterThanOrEqual(0);
    expect(a.value).toBeLessThan(1);
  });

  it('matches the reference mulberry32 sequence', () => {
    // Reference values for seed 1 from the canonical mulberry32 implementation.
    let rng = seedToRng(1);
    const values: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = nextFloat(rng);
      values.push(r.value);
      rng = r.rng;
    }
    expect(values.map((v) => Math.round(v * 1e9))).toEqual([627073941, 2735721, 527447040]);
  });

  it('shuffle is a permutation and does not modify its input', () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
    const { items } = shuffle(input, seedToRng(7));
    expect([...items].sort((x, y) => x - y)).toEqual([...input]);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
