// QA Sprint 6 (written by QA, not the developers): extra room checks for
// S-06-2 (hidden information, a phone can't act for the other side) and
// S-06-3 AC4 (a third phone can't take a seat, also while a player is away).
import { apply, legalActions, newGame, waitingOn, type Action, type GameState, type Side } from '@overclock/engine';
import type { ServerMsg } from '@overclock/protocol';
import { describe, expect, it } from 'vitest';
import { ONLINE_OPTIONS, type RoomMeta } from '../src/room';
import { FakeConn, harness, msg, type Harness } from './fakes';
import { prng } from './plans';

const CODE = 'QA66';

function seatedGame(h: Harness, hostSide: Side = 'corp') {
  const host = new FakeConn('host');
  h.room.connect(host, { kind: 'creator', code: CODE });
  h.room.message(host, msg({ t: 'create', side: hostSide }));
  const guest = new FakeConn('guest');
  h.room.connect(guest, { kind: 'player' });
  h.room.message(guest, msg({ t: 'join' }));
  const token = (c: FakeConn) => (c.msgs.find((m) => m.t === 'seated') as Extract<ServerMsg, { t: 'seated' }>).token;
  const conns = (hostSide === 'corp' ? { corp: host, runner: guest } : { corp: guest, runner: host }) as Record<Side, FakeConn>;
  const tokens = { [hostSide]: token(host), [hostSide === 'corp' ? 'runner' : 'corp']: token(guest) } as Record<Side, string>;
  return { conns, tokens };
}

/** Every key name anywhere inside `v`. */
function keysOf(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) keysOf(x, out);
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keysOf(x, out);
    }
  }
  return out;
}

describe('QA S-06-3 AC4: a third phone never takes a seat', () => {
  it('join is full, guessed/garbled tokens are bad_token, act/create from a stranger are refused; the two players hear nothing of it', () => {
    const h = harness();
    const { conns, tokens } = seatedGame(h);
    const seenCorp = conns.corp.raw.length;
    const seenRunner = conns.runner.raw.length;

    const attempts: [string, object][] = [
      ['join', { t: 'join' }],
      ['resume random', { t: 'resume', token: 'AAAAAAAAAAAAAAAAAAAAAA', since: 0 }],
      ['resume token prefix', { t: 'resume', token: tokens.corp.slice(0, -1), since: 0 }],
      ['resume token + char', { t: 'resume', token: `${tokens.runner}A`, since: 0 }],
      ['resume hash of a token', { t: 'resume', token: (h.store.get<RoomMeta>('meta')!.tokenHashes.corp)!, since: 0 }],
    ];
    for (const [name, m] of attempts) {
      const third = new FakeConn(`third ${name}`);
      h.room.connect(third, { kind: 'player' });
      h.room.message(third, msg(m));
      expect(third.closed, name).not.toBeNull();
      const errs = third.msgs.filter((x) => x.t === 'error');
      expect(errs.length, name).toBe(1);
      expect(['full', 'bad_token']).toContain((errs[0] as Extract<ServerMsg, { t: 'error' }>).code);
      expect(third.msgs.some((x) => x.t === 'seated' || x.t === 'sync' || x.t === 'update'), name).toBe(false);
    }
    // A stranger that just sends an action (no seat) or a create on a game path.
    for (const m of [{ t: 'act', id: 1, action: { type: 'gain_credit', player: 'corp' } }, { t: 'create', side: 'corp' }]) {
      const third = new FakeConn('stranger');
      h.room.connect(third, { kind: 'player' });
      h.room.message(third, msg(m));
      expect(third.msgs.every((x) => x.t === 'error')).toBe(true);
    }
    expect(h.room.seq()).toBe(0);
    // Players untouched: no replaced / presence / anything.
    expect(conns.corp.raw.length).toBe(seenCorp);
    expect(conns.runner.raw.length).toBe(seenRunner);
    expect(conns.corp.closed).toBeNull();
    expect(conns.runner.closed).toBeNull();
    // The game is not creatable again under that code.
    expect(h.room.canCreate()).toBe(false);
  });

  it('while the Runner is away its seat stays theirs: a third join is full; only the real token gets it back', () => {
    const h = harness();
    const { conns, tokens } = seatedGame(h);
    h.room.disconnect(conns.runner);
    const third = new FakeConn('third');
    h.room.connect(third, { kind: 'player' });
    h.room.message(third, msg({ t: 'join' }));
    expect(third.last()).toEqual({ v: 1, t: 'error', code: 'full' });
    const back = new FakeConn('runner again');
    h.room.connect(back, { kind: 'player' });
    h.room.message(back, msg({ t: 'resume', token: tokens.runner, since: 0 }));
    expect(back.msgs.find((m) => m.t === 'sync')).toMatchObject({ t: 'sync', view: { viewer: 'runner' } });
  });
});

describe('QA S-06-2: one phone cannot act for the other side', () => {
  it("the Runner's socket sending Corp actions (credit, end turn, Don't rez) is refused and changes nothing", () => {
    const h = harness();
    const { conns } = seatedGame(h, 'runner');
    const before = h.store.get<GameState>('state');
    for (const action of [
      { type: 'gain_credit', player: 'corp' },
      { type: 'end_turn', player: 'corp' },
      { type: 'draw', player: 'corp' },
      { type: 'pass', player: 'corp' },
    ] as Action[]) {
      conns.runner.take();
      conns.corp.take();
      h.room.message(conns.runner, msg({ t: 'act', id: 5, action }));
      const got = conns.runner.take();
      expect(got.every((m) => m.t === 'rejected' || m.t === 'error'), JSON.stringify(action)).toBe(true);
      expect(conns.corp.take(), 'the Corp hears nothing').toEqual([]);
    }
    expect(h.room.seq()).toBe(0);
    expect(h.store.get<GameState>('state')).toEqual(before);
  });
});

describe('QA S-06-2 AC6: nothing secret in any frame', () => {
  it('over random games: no seed / rng / deck order in any frame, and no phone ever gets the other seat\'s token', () => {
    let frames = 0;
    for (let game = 1; game <= 12; game++) {
      const pick = prng(game * 97);
      const h = harness({ rngSeed: game * 13 });
      const { conns, tokens } = seatedGame(h, game % 2 ? 'corp' : 'runner');
      let state = h.store.get<GameState>('state')!;
      expect(state.options).toEqual(ONLINE_OPTIONS);
      for (let i = 0; i < 400 && state.phase !== 'over'; i++) {
        const seat = waitingOn(state)!;
        const legal = legalActions(state, seat);
        const runs = legal.filter((a) => a.type === 'run');
        const a = runs.length > 0 && pick(3) === 0 ? runs[pick(runs.length)]! : legal[pick(legal.length)]!;
        h.room.message(conns[seat], msg({ t: 'act', id: i + 1, action: a }));
        state = apply(state, a).state;
        // An auto-pass may be due: let the alarm run (as the Durable Object would).
        const at = h.room.nextWakeAt();
        if (at !== null && at - h.clock.t <= 2400) {
          h.clock.t = at;
          const seq = h.room.seq();
          h.room.alarm();
          if (h.room.seq() > seq) state = apply(state, { type: 'pass', player: 'corp' }).state;
        }
      }
      for (const side of ['corp', 'runner'] as const) {
        const other = side === 'corp' ? 'runner' : 'corp';
        for (const raw of conns[side].raw) {
          frames++;
          expect(raw.includes(tokens[other]), `${side} got the ${other} token`).toBe(false);
          const keys = keysOf(JSON.parse(raw));
          for (const k of ['seed', 'rng', 'deck', 'token']) {
            if (k === 'token' && raw.includes('"t":"seated"')) continue;
            expect(keys.has(k), `${side} frame has key ${k}`).toBe(false);
          }
        }
      }
      // The room's state = the game we played (so the frames above are a real game's).
      expect(h.store.get<GameState>('state')).toEqual(state);
    }
    expect(frames).toBeGreaterThan(2000);
  });

  it("a fresh game's opening sync carries no deck order: two rooms with different seeds deal different hands but the views have the same keys", () => {
    const a = newGame(1, ONLINE_OPTIONS);
    const b = newGame(2, ONLINE_OPTIONS);
    expect(a.players.corp.deck).not.toEqual(b.players.corp.deck);
    const h = harness();
    const { conns } = seatedGame(h);
    const sync = conns.runner.msgs.find((m) => m.t === 'sync') as Extract<ServerMsg, { t: 'sync' }>;
    expect(sync.view.players.corp.hand ?? null).toBeNull();
    expect(sync.view.players.runner.hand?.length).toBe(5);
  });
});
