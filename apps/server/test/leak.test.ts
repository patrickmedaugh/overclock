// Sprint 6 E3 (S-06-2 AC5/AC6): random games played through the room. Every message a
// phone receives is checked against the full state: the Runner's views equal the
// engine's projection and name no hidden Corp card; its events are the projected
// events of the action; every message carries only the protocol's fields.
import { apply, viewEvents, viewFor, type Action, type GameEvent, type GameState, type PlayerView, type Side } from '@overclock/engine';
import { runnerEventLeaks, runnerViewLeaks } from '@overclock/match/testing';
import type { ServerMsg } from '@overclock/protocol';
import { describe, expect, it } from 'vitest';
import { ONLINE_OPTIONS } from '../src/room';
import { FakeConn, harness, msg } from './fakes';
import { prng } from './plans';

const FIELDS: Record<ServerMsg['t'], string[]> = {
  seated: ['v', 't', 'code', 'seat', 'token'],
  lobby: ['v', 't', 'code', 'seat'],
  sync: ['v', 't', 'seq', 'view', 'opponent'],
  update: ['v', 't', 'seq', 'view', 'events', 'ack'],
  rejected: ['v', 't', 'ack', 'view', 'events'],
  presence: ['v', 't', 'opponent'],
  error: ['v', 't', 'code'],
  pong: ['v', 't'],
};

describe('leak test: random online games through the room', () => {
  it('every message to each phone is exactly its projection; the Runner never sees a hidden Corp card', () => {
    let messages = 0;
    let autoPasses = 0;
    let rejections = 0;
    let unaffordableWindows = 0;
    for (let game = 1; game <= 25; game++) {
      const pick = prng(game);
      const hostSide: Side = game % 2 ? 'corp' : 'runner';
      const h = harness({ rngSeed: game * 31 });
      const conns: Record<Side, FakeConn> = { corp: new FakeConn('corp'), runner: new FakeConn('runner') };
      h.room.connect(conns[hostSide], { kind: 'creator', code: 'TEST' });
      h.room.message(conns[hostSide], msg({ t: 'create', side: hostSide }));
      const guestSide: Side = hostSide === 'corp' ? 'runner' : 'corp';
      h.room.connect(conns[guestSide], { kind: 'player' });
      h.room.message(conns[guestSide], msg({ t: 'join' }));

      let state = h.store.get<GameState>('state')!;
      const tokens = {} as Record<Side, string>;
      for (const side of ['corp', 'runner'] as const) tokens[side] = (conns[side].msgs.find((x) => x.t === 'seated') as Extract<ServerMsg, { t: 'seated' }>).token;
      expect(state.options).toEqual(ONLINE_OPTIONS);
      const views: Partial<Record<Side, PlayerView>> = {};
      const seen: Record<Side, number> = { corp: 0, runner: 0 };

      /** Checks every new message for both phones; `action` = the accepted action they report (if any). */
      const check = (action: Action | null) => {
        let events: GameEvent[] | null = null;
        if (action) {
          const r = apply(state, action);
          expect(r.events.some((e) => e.type === 'action_rejected')).toBe(false);
          state = r.state;
          events = [...r.events];
          expect(h.store.get<GameState>('state')).toEqual(state); // the room's state = ours
        }
        for (const side of ['corp', 'runner'] as const) {
          const fresh = conns[side].msgs.slice(seen[side]);
          seen[side] += fresh.length;
          for (const m of fresh) {
            messages++;
            const keys = Object.keys(m).filter((k) => k !== 'ack' || m.t === 'update' || m.t === 'rejected');
            expect(keys.every((k) => FIELDS[m.t].includes(k)), `${side} ${m.t} fields ${keys}`).toBe(true);
            if (m.t === 'sync' || m.t === 'update' || m.t === 'rejected') {
              expect(m.view).toEqual(viewFor(side, state));
              if (side === 'runner') expect(runnerViewLeaks(state, m.view)).toEqual([]);
              views[side] = m.view;
            }
            if (m.t === 'update') {
              expect(m.events).toEqual(viewEvents(side, events!));
              if (side === 'runner') expect(runnerEventLeaks(m.events, state)).toEqual([]);
            }
            if (m.t === 'rejected') {
              rejections++;
              expect(m.events).toHaveLength(1);
              expect(m.events[0]!.type).toBe('action_rejected');
            }
          }
        }
      };
      check(null);

      let id = 0;
      for (let step = 0; step < 300 && state.phase !== 'over'; step++) {
        const who: Side = views.corp!.legalActions.length > 0 ? 'corp' : 'runner';
        const legal = views[who]!.legalActions;
        const corpOnlyPass = who === 'corp' && views.corp!.run?.step === 'approach' && legal.length === 1;
        if (corpOnlyPass) unaffordableWindows++;
        if (corpOnlyPass && pick(2) === 0) {
          // Leave it to the room's auto-pass.
          h.clock.t = h.room.nextWakeAt()!;
          h.room.alarm();
          autoPasses++;
          check({ type: 'pass', player: 'corp' });
          continue;
        }
        if (pick(12) === 0) {
          // A refused move: the other seat acting out of turn.
          const otherSide: Side = who === 'corp' ? 'runner' : 'corp';
          h.room.message(conns[otherSide], msg({ t: 'act', id: ++id, action: { type: 'gain_credit', player: otherSide } }));
          check(null);
        }
        const runs = legal.filter((a) => a.type === 'run');
        const a = runs.length > 0 && pick(3) === 0 ? runs[pick(runs.length)]! : legal[pick(legal.length)]!;
        h.room.message(conns[who], msg({ t: 'act', id: ++id, action: a }));
        check(a);
        // Now and then a phone drops and comes back (presence + sync must be clean too).
        if (pick(40) === 0) {
          const side: Side = pick(2) === 0 ? 'corp' : 'runner';
          h.room.disconnect(conns[side]);
          const fresh = new FakeConn(side);
          h.room.connect(fresh, { kind: 'player' });
          conns[side] = fresh;
          seen[side] = 0;
          h.room.message(fresh, msg({ t: 'resume', token: tokens[side], since: 0 }));
          check(null);
        }
      }
    }
    expect(messages).toBeGreaterThan(3000);
    expect(autoPasses).toBeGreaterThan(3);
    expect(unaffordableWindows).toBeGreaterThan(5);
    expect(rejections).toBeGreaterThan(50);
  });
});
