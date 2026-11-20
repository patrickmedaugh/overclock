// Sprint 11 E2: Leave for now. `left?: true` on presence and sync (additive, PROTOCOL_VERSION stays 1),
// optional `rulesVersion` / `savedAt` on the stored seat.
import { describe, expect, it } from 'vitest';
import { LocalMatch } from '@overclock/match';
import { PROTOCOL_VERSION, encodeMsg, parseClientMsg, parseServerMsg, type ServerMsg, type StoredSeat } from '../src/index';

const view = new LocalMatch(1).view('runner');

describe('Sprint 11: left flag', () => {
  it('PROTOCOL_VERSION stayed 1 in Sprint 11 (additive); Sprint 14 made it 2', () => {
    expect(PROTOCOL_VERSION).toBe(2);
  });

  const good: ServerMsg[] = [
    { v: 2, t: 'presence', opponent: 'away', left: true },
    { v: 2, t: 'sync', seq: 12, view, opponent: 'away', left: true },
    { v: 2, t: 'presence', opponent: 'here' },
    { v: 2, t: 'sync', seq: 12, view, opponent: 'away' },
  ];
  it.each(good.map((m, i) => [i, m]))('#%s round-trips', (_i, m) => {
    expect(parseServerMsg(encodeMsg(m))).toEqual({ ok: true, msg: m });
  });

  const bad: [string, string][] = [
    ['left false', '{"v":2,"t":"presence","opponent":"away","left":false}'],
    ['left as a string', '{"v":2,"t":"presence","opponent":"away","left":"yes"}'],
    ['left while here', '{"v":2,"t":"presence","opponent":"here","left":true}'],
    ['left on a sync with nobody joined', JSON.stringify({ v: 2, t: 'sync', seq: 0, view, opponent: 'none', left: true })],
  ];
  it.each(bad)('refuses %s', (_name, raw) => {
    expect(parseServerMsg(raw)).toEqual({ ok: false, error: 'bad_message' });
  });

  it('an older client that only reads `opponent` still sees away (the flag is extra)', () => {
    const p = parseServerMsg('{"v":2,"t":"presence","opponent":"away","left":true}');
    expect(p.ok && p.msg.t === 'presence' && p.msg.opponent).toBe('away');
  });

  it('leave is still a plain client message', () => {
    expect(parseClientMsg('{"v":2,"t":"leave"}')).toEqual({ ok: true, msg: { v: 2, t: 'leave' } });
  });

  it('StoredSeat: rulesVersion and savedAt are optional (seats stored by older builds still type-check)', () => {
    const old: StoredSeat = { server: 'wss://x', code: 'K7QF', seat: 'corp', token: 't' };
    const now: StoredSeat = { ...old, rulesVersion: 4, savedAt: 1_700_000_000_000 };
    expect(JSON.parse(JSON.stringify(now))).toEqual(now);
    expect(old.rulesVersion).toBeUndefined();
  });
});
