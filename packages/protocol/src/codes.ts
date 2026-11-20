// ---- game codes (Sprint 6) and the shared code alphabet ------------------------------------

/** No 0/O, 1/I/L: easy to read out loud and type. Sprint 14: deck codes use it too. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

/** Upper-cases and drops spaces and dashes: `' k7-qf '` → `'K7QF'`. Does not validate. Also for deck codes. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]+/g, '');
}

/** Exactly CODE_LENGTH characters from CODE_ALPHABET (already normalised). */
export function isGameCode(code: string): boolean {
  return isCodeOf(code, CODE_LENGTH);
}

/**
 * A random code. `randomInt(n)` must return a uniform integer in [0, n) from a
 * real random source (the server passes `crypto`); the protocol stays pure.
 */
export function makeCode(randomInt: (n: number) => number): string {
  return makeCodeOf(CODE_LENGTH, randomInt);
}

/** `length` characters, all from CODE_ALPHABET. */
export function isCodeOf(code: string, length: number): boolean {
  if (code.length !== length) return false;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return false;
  return true;
}

/** `length` random characters from CODE_ALPHABET. */
export function makeCodeOf(length: number, randomInt: (n: number) => number): string {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}
