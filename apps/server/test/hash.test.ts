import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { base64url, sha256Hex } from '../src/hash';

describe('sha256Hex / base64url', () => {
  it('matches node:crypto on known and random inputs (incl. multi-block and non-ASCII)', () => {
    const inputs = ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(1000), 'K7QF €😀 ü'];
    for (let i = 0; i < 50; i++) inputs.push(randomBytes(i * 3).toString('base64url'));
    for (const s of inputs) expect(sha256Hex(s), s).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('base64url matches Buffer for every length mod 3', () => {
    for (let n = 0; n < 40; n++) {
      const b = randomBytes(n);
      expect(base64url(new Uint8Array(b))).toBe(b.toString('base64url'));
    }
  });
});
