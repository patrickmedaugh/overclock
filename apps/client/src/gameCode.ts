// Game codes as people type them (S-06-1). Same alphabet as the server's codes
// (tech plan: no 0/O/1/I/L). Pure. TODO(U3): switch to the code helpers in
// @overclock/protocol once that package is merged, and delete this file.

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

/** Upper-case, spaces and dashes dropped ("k7 qf" -> "K7QF"). */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]+/g, '');
}

/** True for a code that could exist (4 characters from the alphabet). */
export function isCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}

/** The `?join=CODE` of a page address, normalised, or null. */
export function joinCodeFromUrl(search: string): string | null {
  const raw = new URLSearchParams(search).get('join');
  if (raw === null) return null;
  const code = normalizeCode(raw);
  return code === '' ? null : code;
}
