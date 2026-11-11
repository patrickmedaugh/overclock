/**
 * mulberry32 PRNG. The full 32-bit generator state lives in GameState.rng;
 * every call returns the next state explicitly, so there is no hidden module
 * state and games are replayable from (seed, actions[]).
 */

/** Normalise any number to a uint32 seed. */
export function seedToRng(seed: number): number {
  return Math.trunc(seed) >>> 0;
}

/** Returns a float in [0, 1) and the next rng state. */
export function nextFloat(rng: number): { value: number; rng: number } {
  const next = (rng + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, rng: next };
}

/** Returns an integer in [0, maxExclusive) and the next rng state. */
export function nextInt(rng: number, maxExclusive: number): { value: number; rng: number } {
  const r = nextFloat(rng);
  return { value: Math.floor(r.value * maxExclusive), rng: r.rng };
}

/** Fisher-Yates shuffle. Returns a new array; the input is not modified. */
export function shuffle<T>(items: readonly T[], rng: number): { items: T[]; rng: number } {
  const out = items.slice();
  let state = rng;
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextInt(state, i + 1);
    state = r.rng;
    const j = r.value;
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return { items: out, rng: state };
}
