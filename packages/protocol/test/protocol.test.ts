// Sprint 6 E1: protocol v1 message shapes, parsers and game-code helpers.
import { describe, expect, it } from 'vitest';
import { LocalMatch } from '@overclock/match';
import { planBusyBoard } from '@overclock/match/testing';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  MAX_CLIENT_MESSAGE_BYTES,
  MAX_SERVER_MESSAGE_BYTES,
  PING,
  PONG,
  PROTOCOL_VERSION,
  encodeMsg,
  gamePath,
  isGameCode,
  makeCode,
  normalizeCode,
  parseClientMsg,
  parseServerMsg,
  utf8Length,
  type ClientMsg,
  type ServerMsg,
} from '../src/index';

const view = new LocalMatch(1).view('corp');

describe('client messages', () => {
  const good: ClientMsg[] = [
    { v: 1, t: 'create', side: 'corp' },
    { v: 1, t: 'create', side: 'runner', test: { seed: 42, actions: [{ type: 'draw', player: 'corp' }] } },
    { v: 1, t: 'join' },
    { v: 1, t: 'resume', token: 'abcDEF_-123', since: 0 },
    { v: 1, t: 'act', id: 7, action: { type: 'gain_credit', player: 'runner' } },
    { v: 1, t: 'ping' },
  ];
  it.each(good.map((m) => [m.t, m]))('%s round-trips', (_t, m) => {
    expect(parseClientMsg(encodeMsg(m))).toEqual({ ok: true, msg: m });
  });

  it('PING is the exact ping frame', () => {
    expect(parseClientMsg(PING)).toEqual({ ok: true, msg: { v: 1, t: 'ping' } });
    expect(parseServerMsg(PONG)).toEqual({ ok: true, msg: { v: 1, t: 'pong' } });
    expect(PROTOCOL_VERSION).toBe(1);
  });

  const bad: [string, unknown][] = [
    ['not a string', { v: 1, t: 'join' }],
    ['binary', new Uint8Array([1, 2])],
    ['not JSON', '{v:1'],
    ['an array', '[1]'],
    ['no type', '{"v":1}'],
    ['unknown type', '{"v":1,"t":"teleport"}'],
    ['prototype key as type', '{"v":1,"t":"constructor"}'],
    ['create without side', '{"v":1,"t":"create"}'],
    ['create with a bad side', '{"v":1,"t":"create","side":"both"}'],
    ['create with a bad test seed', '{"v":1,"t":"create","side":"corp","test":{"seed":-1,"actions":[]}}'],
    ['create with bad test actions', '{"v":1,"t":"create","side":"corp","test":{"seed":1,"actions":[1]}}'],
    ['resume without token', '{"v":1,"t":"resume","since":0}'],
    ['resume with an empty token', '{"v":1,"t":"resume","token":"","since":0}'],
    ['resume with a huge token', JSON.stringify({ v: 1, t: 'resume', token: 'x'.repeat(65), since: 0 })],
    ['resume with a fractional since', '{"v":1,"t":"resume","token":"a","since":1.5}'],
    ['act without id', '{"v":1,"t":"act","action":{"type":"draw","player":"corp"}}'],
    ['act with a negative id', '{"v":1,"t":"act","id":-1,"action":{"type":"draw","player":"corp"}}'],
    ['act without action', '{"v":1,"t":"act","id":1}'],
    ['act with an action without player', '{"v":1,"t":"act","id":1,"action":{"type":"draw"}}'],
    ['act with an action that is an array', '{"v":1,"t":"act","id":1,"action":[]}'],
  ];
  it.each(bad)('refuses %s as bad_message', (_name, raw) => {
    expect(parseClientMsg(raw)).toEqual({ ok: false, error: 'bad_message' });
  });

  it('refuses another protocol version as version (when the frame is otherwise an object with a type)', () => {
    expect(parseClientMsg('{"v":2,"t":"join"}')).toEqual({ ok: false, error: 'version' });
    expect(parseClientMsg('{"t":"join"}')).toEqual({ ok: false, error: 'version' });
    expect(parseServerMsg('{"v":0,"t":"pong"}')).toEqual({ ok: false, error: 'version' });
  });

  it('refuses frames over 8 KB (counted in UTF-8 bytes) and accepts one just under', () => {
    const pad = (n: number) => JSON.stringify({ v: 1, t: 'act', id: 1, action: { type: 'draw', player: 'corp', x: 'a'.repeat(n) } });
    const base = pad(0).length;
    expect(parseClientMsg(pad(MAX_CLIENT_MESSAGE_BYTES - base)).ok).toBe(true);
    expect(parseClientMsg(pad(MAX_CLIENT_MESSAGE_BYTES - base + 1))).toEqual({ ok: false, error: 'bad_message' });
    // 3-byte characters: under 8K string length but over 8 KB.
    const wide = JSON.stringify({ v: 1, t: 'act', id: 1, action: { type: 'draw', player: 'corp', x: '€'.repeat(3000) } });
    expect(wide.length).toBeLessThan(MAX_CLIENT_MESSAGE_BYTES);
    expect(parseClientMsg(wide)).toEqual({ ok: false, error: 'bad_message' });
  });

  it('never throws on junk', () => {
    const junk: unknown[] = [undefined, null, 0, '', 'null', '"x"', '{"v":1,"t":1}', '{"__proto__":{"t":"join"},"v":1}', '\u0000', Symbol('x')];
    for (const j of junk) {
      expect(() => parseClientMsg(j)).not.toThrow();
      expect(() => parseServerMsg(j)).not.toThrow();
      expect(parseClientMsg(j).ok).toBe(false);
    }
  });
});

describe('server messages', () => {
  const good: ServerMsg[] = [
    { v: 1, t: 'seated', code: 'K7QF', seat: 'runner', token: 'tok' },
    { v: 1, t: 'lobby', code: 'K7QF', seat: 'corp' },
    { v: 1, t: 'sync', seq: 0, view, opponent: 'none' },
    { v: 1, t: 'update', seq: 3, view, events: [{ type: 'credit_gained', player: 'corp', amount: 1 }], ack: 9 },
    { v: 1, t: 'update', seq: 4, view, events: [] },
    { v: 1, t: 'rejected', ack: 2, view, events: [{ type: 'action_rejected', reason: 'no_clicks' }] },
    { v: 1, t: 'presence', opponent: 'away' },
    { v: 1, t: 'error', code: 'full' },
    { v: 1, t: 'pong' },
  ];
  it.each(good.map((m) => [m.t, m]))('%s round-trips', (_t, m) => {
    expect(parseServerMsg(encodeMsg(m))).toEqual({ ok: true, msg: m });
  });

  const bad: [string, string][] = [
    ['an unknown error code', '{"v":1,"t":"error","code":"oops"}'],
    ['sync without a view', '{"v":1,"t":"sync","seq":0,"opponent":"here"}'],
    ['sync with a bad presence', JSON.stringify({ v: 1, t: 'sync', seq: 0, view, opponent: 'gone' })],
    ['update with events that are not events', JSON.stringify({ v: 1, t: 'update', seq: 1, view, events: [1] })],
    ['rejected without ack', JSON.stringify({ v: 1, t: 'rejected', view, events: [] })],
    ['seated with a bad seat', '{"v":1,"t":"seated","code":"K7QF","seat":"x","token":"t"}'],
  ];
  it.each(bad)('refuses %s', (_name, raw) => {
    expect(parseServerMsg(raw)).toEqual({ ok: false, error: 'bad_message' });
  });

  it('a busy board view fits comfortably in a server frame', () => {
    const plan = planBusyBoard(3);
    const m = LocalMatch.restore(plan.seed, plan.actions);
    for (const seat of ['corp', 'runner'] as const) {
      const frame = encodeMsg({ v: 1, t: 'sync', seq: plan.actions.length, view: m.view(seat), opponent: 'here' });
      expect(utf8Length(frame)).toBeLessThan(MAX_SERVER_MESSAGE_BYTES / 4);
      expect(parseServerMsg(frame).ok).toBe(true);
    }
  });
});

describe('game codes', () => {
  it('alphabet has no look-alikes (0 O 1 I L) and 31 symbols', () => {
    expect(CODE_ALPHABET).toHaveLength(31);
    for (const ch of '0O1IL') expect(CODE_ALPHABET).not.toContain(ch);
    expect(new Set(CODE_ALPHABET).size).toBe(31);
  });

  it('normalizeCode upper-cases and drops spaces and dashes', () => {
    expect(normalizeCode(' k7-qf ')).toBe('K7QF');
    expect(normalizeCode('k 7 q f')).toBe('K7QF');
    expect(normalizeCode('K7QF')).toBe('K7QF');
  });

  it('isGameCode checks length and alphabet', () => {
    expect(isGameCode('K7QF')).toBe(true);
    expect(isGameCode('K7Q')).toBe(false);
    expect(isGameCode('K7QFF')).toBe(false);
    expect(isGameCode('K0QF')).toBe(false);
    expect(isGameCode('k7qf')).toBe(false);
  });

  it('makeCode draws CODE_LENGTH symbols from the given random source', () => {
    const picks = [0, 30, 5, 12];
    let i = 0;
    const code = makeCode((n) => {
      expect(n).toBe(31);
      return picks[i++]!;
    });
    expect(code).toBe(`${CODE_ALPHABET[0]}${CODE_ALPHABET[30]}${CODE_ALPHABET[5]}${CODE_ALPHABET[12]}`);
    expect(code).toHaveLength(CODE_LENGTH);
    expect(isGameCode(code)).toBe(true);
  });

  it('gamePath', () => {
    expect(gamePath('K7QF')).toBe('/v1/games/K7QF');
  });
});
