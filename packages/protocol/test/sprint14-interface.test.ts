// Sprint 14 E1: protocol v2 shapes (create/pick deck, choose, deck_refused, lobby picking) and
// the deck service helpers (codes, request/reply parsing). E4/E5 pin the room behaviour.
import { describe, expect, it } from 'vitest';
import {
  CODE_ALPHABET,
  DECK_API_STATUS,
  DECK_CODE_LENGTH,
  DECKS_API_VERSION,
  MAX_DECK_UPLOAD_BYTES,
  PING,
  PROTOCOL_VERSION,
  formatDeckCode,
  isDeckCode,
  isDeckChoice,
  makeDeckCode,
  normalizeCode,
  parseClientMsg,
  parseDeckReply,
  parseDeckRequest,
  parseServerMsg,
} from '../src/index';

const v = PROTOCOL_VERSION;
const T = 1_763_600_000_000;
const store = { format: 2, decks: [{ id: 'a', side: 'corp', name: 'A', identity: 'c13', cards: { c01: 3 }, createdAt: T, updatedAt: T }], deleted: [] };

describe('S-14 E1: protocol messages', () => {
  it('PING carries the protocol version', () => {
    expect(JSON.parse(PING)).toEqual({ v, t: 'ping' });
  });

  it('create/pick take an optional deck (copy counts)', () => {
    const deck = { identity: 'c13', cards: { c01: 3, c02: 2 } };
    expect(parseClientMsg(JSON.stringify({ v, t: 'create', side: 'corp', deck })).ok).toBe(true);
    expect(parseClientMsg(JSON.stringify({ v, t: 'create', side: 'corp' })).ok).toBe(true);
    expect(parseClientMsg(JSON.stringify({ v, t: 'pick', deck })).ok).toBe(true);
    expect(parseClientMsg(JSON.stringify({ v, t: 'pick' })).ok).toBe(true);
    for (const bad of [{ identity: '', cards: {} }, { identity: 'c13', cards: { c01: 0 } }, { identity: 'c13', cards: { c01: 1.5 } }, { identity: 'c13', cards: [] }, { identity: 'c13', cards: { c01: 201 } }]) {
      expect(isDeckChoice(bad)).toBe(false);
      expect(parseClientMsg(JSON.stringify({ v, t: 'pick', deck: bad }))).toEqual({ ok: false, error: 'bad_message' });
    }
    const many: Record<string, number> = {};
    for (let i = 0; i < 101; i++) many[`z${i}`] = 1;
    expect(isDeckChoice({ identity: 'c13', cards: many })).toBe(false);
  });

  it('server: choose, deck_refused, lobby picking', () => {
    expect(parseServerMsg(JSON.stringify({ v, t: 'choose', seat: 'runner' })).ok).toBe(true);
    expect(parseServerMsg(JSON.stringify({ v, t: 'choose', seat: 'both' })).ok).toBe(false);
    expect(parseServerMsg(JSON.stringify({ v, t: 'deck_refused', problems: [{ kind: 'too_small', size: 40, min: 45 }] })).ok).toBe(true);
    expect(parseServerMsg(JSON.stringify({ v, t: 'deck_refused', problems: [{}] })).ok).toBe(false);
    expect(parseServerMsg(JSON.stringify({ v, t: 'lobby', code: 'ABCD', seat: 'corp', picking: true })).ok).toBe(true);
    expect(parseServerMsg(JSON.stringify({ v, t: 'lobby', code: 'ABCD', seat: 'corp', picking: false })).ok).toBe(false);
  });
});

describe('S-14 E1: deck codes', () => {
  it('make / check / format / normalise', () => {
    let i = 0;
    const code = makeDeckCode((n) => i++ % n);
    expect(code).toHaveLength(DECK_CODE_LENGTH);
    expect(isDeckCode(code)).toBe(true);
    for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    expect(formatDeckCode('KX4P9MTRQZ7D')).toBe('KX4P-9MTR-QZ7D');
    expect(normalizeCode(' kx4p-9mtr qz7d ')).toBe('KX4P9MTRQZ7D');
    expect(isDeckCode(normalizeCode(formatDeckCode('KX4P9MTRQZ7D')))).toBe(true);
    expect(isDeckCode('KX4P9MTRQZ7')).toBe(false);
    expect(isDeckCode('KX4P9MTRQZ70')).toBe(false); // 0 is not in the alphabet
  });
});

describe('S-14 E1: deck API bodies', () => {
  it('server reads requests', () => {
    expect(parseDeckRequest('new', JSON.stringify({ v: DECKS_API_VERSION, store }))).toMatchObject({ ok: true });
    expect(parseDeckRequest('sync', JSON.stringify({ v: DECKS_API_VERSION, code: 'kx4p-9mtr-qz7d', store }))).toMatchObject({ ok: true, code: 'KX4P9MTRQZ7D' });
    expect(parseDeckRequest('sync', JSON.stringify({ v: DECKS_API_VERSION, code: 'nope', store }))).toEqual({ ok: false, error: 'no_decks' });
    expect(parseDeckRequest('new', JSON.stringify({ v: 9, store }))).toEqual({ ok: false, error: 'version' });
    expect(parseDeckRequest('new', '{oops')).toEqual({ ok: false, error: 'bad_store' });
    expect(parseDeckRequest('new', JSON.stringify({ v: DECKS_API_VERSION, store: { format: 2, decks: 1 } }))).toEqual({ ok: false, error: 'bad_store' });
    expect(parseDeckRequest('new', 'x'.repeat(MAX_DECK_UPLOAD_BYTES + 1))).toEqual({ ok: false, error: 'too_big' });
  });

  it('client reads replies', () => {
    expect(parseDeckReply(200, JSON.stringify({ v: DECKS_API_VERSION, code: 'KX4P9MTRQZ7D', store }))).toMatchObject({ ok: true, code: 'KX4P9MTRQZ7D' });
    expect(parseDeckReply(200, { v: DECKS_API_VERSION, store })).toMatchObject({ ok: true });
    expect(parseDeckReply(404, { v: DECKS_API_VERSION, error: 'no_decks' })).toEqual({ ok: false, error: 'no_decks' });
    expect(parseDeckReply(429, { v: DECKS_API_VERSION, error: 'wait', retryAfterMs: 120_000 })).toEqual({ ok: false, error: 'wait', retryAfterMs: 120_000 });
    expect(parseDeckReply(400, { v: 2, error: 'version' })).toEqual({ ok: false, error: 'version' });
    expect(parseDeckReply(200, '<html>')).toEqual({ ok: false, error: 'bad_reply' });
    expect(parseDeckReply(200, { v: DECKS_API_VERSION, store: { format: 3 } })).toEqual({ ok: false, error: 'bad_reply' });
    expect(DECK_API_STATUS).toEqual({ no_decks: 404, wait: 429, bad_store: 400, too_big: 413, version: 400 });
  });
});
