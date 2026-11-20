// Sprint 14 E3 (S-14-2 AC6): the wrong-guess guard (pure, clock injected) and its use by the
// HTTP handler: 5 free wrong codes, then 60 s doubling up to 1 h; a right code resets; locked
// callers are refused before any locker is asked; `new` ≤ 10/hour; per caller (test IP header).
import { DECKS_NEW_PATH, DECKS_SYNC_PATH, TEST_IP_HEADER, parseDeckReply } from '@overclock/protocol';
import { describe, expect, it } from 'vitest';
import {
  GUARD_BASE_WAIT_MS,
  GUARD_FORGET_MS,
  GUARD_FREE_WRONG,
  GUARD_MAX_WAIT_MS,
  GUARD_NEW_PER_HOUR,
  attempt,
  guardKey,
  newLocker,
  right,
  waitAfter,
  type GuardState,
} from '../src/guard';
import { DeckWorld, ownStore } from './deck-fakes';

const T0 = 1_763_600_000_000;

describe('S-14 E3 guard (pure)', () => {
  it('the guard key is a hash, never the IP', () => {
    const k = guardKey('203.0.113.7');
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(k).not.toContain('203.0.113.7');
    expect(guardKey('203.0.113.8')).not.toBe(k);
  });

  it('waits: 5 free, then 60 s × 2ⁿ, capped at 1 h', () => {
    for (let w = 0; w < GUARD_FREE_WRONG; w++) expect(waitAfter(w)).toBe(0);
    expect(waitAfter(5)).toBe(60_000);
    expect(waitAfter(6)).toBe(120_000);
    expect(waitAfter(7)).toBe(240_000);
    expect(waitAfter(10)).toBe(GUARD_BASE_WAIT_MS * 32);
    expect(waitAfter(11)).toBe(GUARD_MAX_WAIT_MS);
    expect(waitAfter(1000)).toBe(GUARD_MAX_WAIT_MS);
  });

  it('wrong attempts in a row: the 6th is refused until the wait is over; waits double', () => {
    let s: GuardState | undefined;
    let now = T0;
    for (let i = 0; i < GUARD_FREE_WRONG; i++) {
      const a = attempt(s, now);
      expect(a.ok).toBe(true);
      s = a.state;
    }
    const locked = attempt(s, now + 1000);
    expect(locked).toMatchObject({ ok: false, retryAfterMs: 59_000 });
    now += 60_000;
    const sixth = attempt(locked.state, now);
    expect(sixth.ok).toBe(true);
    expect(attempt(sixth.state, now + 119_999)).toMatchObject({ ok: false, retryAfterMs: 1 });
    expect(attempt(sixth.state, now + 120_000).ok).toBe(true);
  });

  it('a right code resets the count and any wait', () => {
    let s: GuardState | undefined;
    for (let i = 0; i < GUARD_FREE_WRONG; i++) s = attempt(s, T0).state;
    s = right(s, T0);
    expect(s).toMatchObject({ wrong: 0, lockedUntil: 0 });
    for (let i = 0; i < GUARD_FREE_WRONG; i++) {
      const a = attempt(s, T0);
      expect(a.ok).toBe(true);
      s = a.state;
    }
  });

  it('forgets after a day of silence', () => {
    let s: GuardState | undefined;
    for (let i = 0; i < 12; i++) s = attempt(s, T0).state;
    expect(attempt(s, T0 + 1000).ok).toBe(false);
    expect(attempt(s, T0 + GUARD_FORGET_MS + 1).state.wrong).toBe(1);
  });

  it('new lockers: 10 per hour, the 11th waits for the oldest to age out', () => {
    let s: GuardState | undefined;
    for (let i = 0; i < GUARD_NEW_PER_HOUR; i++) {
      const a = newLocker(s, T0 + i * 1000);
      expect(a.ok).toBe(true);
      s = a.state;
    }
    const no = newLocker(s, T0 + 20_000);
    expect(no).toMatchObject({ ok: false, retryAfterMs: 3_600_000 - 20_000 });
    expect(newLocker(no.state, T0 + 3_600_000).ok).toBe(true);
  });
});

describe('S-14 E3 guard through the HTTP API', () => {
  it('wrong codes: 404 no_decks ×5, then 429 wait (the locker is not even asked), with Retry-After', async () => {
    const w = new DeckWorld();
    const { code } = await w.newCode(ownStore('a'));
    const wrong = code === 'AAAAAAAAAAAA' ? 'BBBBBBBBBBBB' : 'AAAAAAAAAAAA';
    for (let i = 0; i < GUARD_FREE_WRONG; i++) {
      const r = await w.post(DECKS_SYNC_PATH, { v: 1, code: wrong, store: ownStore('x') }, { ip: 'attacker' });
      expect(r.status).toBe(404);
      expect(parseDeckReply(r.status, await r.text())).toEqual({ ok: false, error: 'no_decks' });
    }
    const asked = w.lockerCalls;
    // Even the right code is refused while waiting (a waiting caller learns nothing).
    const r = await w.post(DECKS_SYNC_PATH, { v: 1, code, store: ownStore('x') }, { ip: 'attacker' });
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toBe('60');
    expect(parseDeckReply(r.status, await r.text())).toEqual({ ok: false, error: 'wait', retryAfterMs: 60_000 });
    expect(w.lockerCalls).toBe(asked);
    // The attacker's upload was never merged.
    expect((await w.sync(code, ownStore('a'))).store.decks.map((d) => d.id)).toEqual(['a']);
  });

  it('malformed codes count as wrong guesses too', async () => {
    const w = new DeckWorld();
    for (let i = 0; i < GUARD_FREE_WRONG; i++) expect((await w.post(DECKS_SYNC_PATH, { v: 1, code: 'nope', store: ownStore('x') }, { ip: 'm' })).status).toBe(404);
    expect((await w.post(DECKS_SYNC_PATH, { v: 1, code: 'nope', store: ownStore('x') }, { ip: 'm' })).status).toBe(429);
  });

  it('lockout is per device (test IP header); after the wait the right code works and resets', async () => {
    const w = new DeckWorld();
    const { code } = await w.newCode(ownStore('a'), 'owner');
    for (let i = 0; i < GUARD_FREE_WRONG; i++) await w.post(DECKS_SYNC_PATH, { v: 1, code: 'ZZZZZZZZZZZZ', store: ownStore('x') }, { ip: 'phone' });
    expect((await w.post(DECKS_SYNC_PATH, { v: 1, code, store: ownStore('x') }, { ip: 'phone' })).status).toBe(429);
    expect((await w.post(DECKS_SYNC_PATH, { v: 1, code, store: ownStore('y') }, { ip: 'laptop' })).status).toBe(200);
    w.clock.t += 60_000;
    expect((await w.post(DECKS_SYNC_PATH, { v: 1, code, store: ownStore('x') }, { ip: 'phone' })).status).toBe(200);
    for (let i = 0; i < GUARD_FREE_WRONG - 1; i++) expect((await w.post(DECKS_SYNC_PATH, { v: 1, code: 'ZZZZZZZZZZZZ', store: ownStore('x') }, { ip: 'phone' })).status).toBe(404);
    expect((await w.post(DECKS_SYNC_PATH, { v: 1, code, store: ownStore('x') }, { ip: 'phone' })).status).toBe(200);
  });

  it('the test IP header is ignored outside test mode (CF-Connecting-IP decides)', async () => {
    const w = new DeckWorld({ testMode: false });
    for (let i = 0; i < GUARD_FREE_WRONG; i++) {
      await w.post(DECKS_SYNC_PATH, { v: 1, code: 'ZZZZZZZZZZZZ', store: ownStore('x') }, { headers: { [TEST_IP_HEADER]: `fake${i}`, 'CF-Connecting-IP': '198.51.100.1' } });
    }
    const r = await w.post(DECKS_SYNC_PATH, { v: 1, code: 'ZZZZZZZZZZZZ', store: ownStore('x') }, { headers: { [TEST_IP_HEADER]: 'fresh', 'CF-Connecting-IP': '198.51.100.1' } });
    expect(r.status).toBe(429);
    const other = await w.post(DECKS_SYNC_PATH, { v: 1, code: 'ZZZZZZZZZZZZ', store: ownStore('x') }, { headers: { 'CF-Connecting-IP': '198.51.100.2' } });
    expect(other.status).toBe(404);
  });

  it('new: the 11th locker in an hour from one device waits', async () => {
    const w = new DeckWorld();
    for (let i = 0; i < GUARD_NEW_PER_HOUR; i++) expect((await w.post(DECKS_NEW_PATH, { v: 1, store: ownStore(`d${i}`) }, { ip: 'spam' })).status).toBe(200);
    const r = await w.post(DECKS_NEW_PATH, { v: 1, store: ownStore('z') }, { ip: 'spam' });
    expect(r.status).toBe(429);
    expect(w.lockerCount).toBe(GUARD_NEW_PER_HOUR);
    expect((await w.post(DECKS_NEW_PATH, { v: 1, store: ownStore('z') }, { ip: 'other' })).status).toBe(200);
  });

  it('many guesses at once cannot slip past the limit (each attempt is counted before the locker answers)', async () => {
    const w = new DeckWorld();
    const replies = await Promise.all(Array.from({ length: 50 }, (_, i) => w.post(DECKS_SYNC_PATH, { v: 1, code: `ZZZZZZZZZZ${'ABCDEFGHJK'[i % 10]}${'ABCDE'[i % 5]}`, store: ownStore('x') }, { ip: 'burst' })));
    expect(replies.filter((r) => r.status === 404)).toHaveLength(GUARD_FREE_WRONG);
    expect(replies.filter((r) => r.status === 429)).toHaveLength(50 - GUARD_FREE_WRONG);
  });
});
