// Sprint 14 E5 (S-14-4 AC2/AC3/AC4): whole online games through the room with random legal own
// decks on both sides and every standard/own mix. Every frame each phone receives is checked:
// - only the protocol's fields; no `deck` / `decks` / `options` / `seed` / `rng` key anywhere;
// - never the opponent's deck list (its copy counts or its dealt list), from the deal to game over;
// - views and events are exactly the seat's projection, and name no hidden card of the other side
//   (Runner: no face-down / HQ / R&D Corp card; Corp: no Stack / Grip Runner card);
// - a Sprint 13 app's parser (frozen fixture) reads every frame as `version` (it says "update").
import { deckFromCounts } from '@overclock/cards';
import { apply, viewEvents, viewFor, type Action, type GameEvent, type GameState, type PlayerView, type Side } from '@overclock/engine';
import { corpEventLeaks, corpViewLeaks, runnerEventLeaks, runnerViewLeaks } from '@overclock/match/testing';
import type { DeckChoice, ServerMsg } from '@overclock/protocol';
import { describe, expect, it } from 'vitest';
import { FakeConn, harness, msg } from './fakes';
import { parseServerMsg as sprint13Parse } from './fixtures/sprint13-protocol';
import { choiceCards, dealtCards, legalOwnDeck, rng } from './own-decks';
import { prng } from './plans';

const FIELDS: Record<ServerMsg['t'], string[]> = {
  seated: ['v', 't', 'code', 'seat', 'token'],
  lobby: ['v', 't', 'code', 'seat', 'picking'],
  choose: ['v', 't', 'seat'],
  deck_refused: ['v', 't', 'problems'],
  sync: ['v', 't', 'seq', 'view', 'opponent', 'left'],
  update: ['v', 't', 'seq', 'view', 'events', 'ack'],
  rejected: ['v', 't', 'ack', 'view', 'events'],
  presence: ['v', 't', 'opponent', 'left'],
  error: ['v', 't', 'code'],
  pong: ['v', 't'],
};
/** Keys no frame may carry anywhere. `options` is allowed only as a list (run/choice options), never GameOptions. */
const FORBIDDEN_KEYS = new Set(['deck', 'decks', 'seed', 'rng']);
const other = (s: Side): Side => (s === 'corp' ? 'runner' : 'corp');

/** Every object key anywhere in `x` (an `options` key that is not a list is reported as `options`). */
function keysDeep(x: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(x)) for (const y of x) keysDeep(y, out);
  else if (typeof x === 'object' && x !== null) {
    for (const [k, v] of Object.entries(x)) {
      out.add(k === 'options' && !Array.isArray(v) ? 'options' : k === 'options' ? 'options[]' : k);
      keysDeep(v, out);
    }
  }
  return out;
}

const GAMES = 30;

describe('S-14-4: whole online games with own decks — nothing of a deck list reaches the other phone', () => {
  it(`${GAMES} games, every mix, both directions, to game over where it comes`, () => {
    const totals = { frames: 0, over: 0, ownSides: 0, refusals: 0, dropped: 0, hiddenCorp: 0, hiddenRunner: 0 };
    for (let game = 1; game <= GAMES; game++) {
      const r = rng(game * 97);
      const pick = prng(game);
      const hostSide: Side = game % 2 ? 'corp' : 'runner';
      const guestSide = other(hostSide);
      // Mix by game: own/own, own/standard, standard/own, standard/standard (per side).
      const mix = (game >> 1) % 4;
      const ownCorp = mix === 0 || mix === 1;
      const ownRunner = mix === 0 || mix === 2;
      const choice: Partial<Record<Side, DeckChoice>> = {};
      if (ownCorp) choice.corp = legalOwnDeck(r, 'corp');
      if (ownRunner) choice.runner = legalOwnDeck(r, 'runner');
      totals.ownSides += Object.keys(choice).length;

      const h = harness({ rngSeed: game * 31 });
      const conns: Record<Side, FakeConn> = { corp: new FakeConn('corp'), runner: new FakeConn('runner') };
      h.room.connect(conns[hostSide], { kind: 'creator', code: 'LEAK' });
      h.room.message(conns[hostSide], msg({ t: 'create', side: hostSide, ...(choice[hostSide] ? { deck: choice[hostSide] } : {}) }));
      h.room.connect(conns[guestSide], { kind: 'player' });
      h.room.message(conns[guestSide], msg({ t: 'join' }));
      if (game % 3 === 0) {
        // A refused pick first (4 copies): only the guest hears it.
        const bad = { identity: guestSide === 'corp' ? 'c13' : 'r13', cards: { [guestSide === 'corp' ? 'c01' : 'r01']: 4 } };
        h.room.message(conns[guestSide], msg({ t: 'pick', deck: bad }));
        totals.refusals++;
      }
      h.room.message(conns[guestSide], msg({ t: 'pick', ...(choice[guestSide] ? { deck: choice[guestSide] } : {}) }));

      let state = h.store.get<GameState>('state')!;
      for (const side of ['corp', 'runner'] as const) {
        if (choice[side]) expect(dealtCards(state, side)).toEqual(choiceCards(choice[side]));
      }
      const tokens = {} as Record<Side, string>;
      for (const side of ['corp', 'runner'] as const) tokens[side] = (conns[side].msgs.find((x) => x.t === 'seated') as Extract<ServerMsg, { t: 'seated' }>).token;
      // What the *other* phone must never receive: each own deck's counts and its dealt list.
      const secrets: Record<Side, string[]> = { corp: [], runner: [] };
      for (const side of ['corp', 'runner'] as const) {
        const c = choice[side];
        if (!c) continue;
        secrets[other(side)].push(JSON.stringify(c.cards), JSON.stringify(deckFromCounts(c.identity, c.cards).cards), JSON.stringify(choiceCards(c)));
      }
      const views: Partial<Record<Side, PlayerView>> = {};
      const seen: Record<Side, number> = { corp: 0, runner: 0 };

      const check = (action: Action | null): void => {
        let events: GameEvent[] | null = null;
        if (action) {
          const res = apply(state, action);
          expect(res.events.some((e) => e.type === 'action_rejected')).toBe(false);
          state = res.state;
          events = [...res.events];
        }
        for (const side of ['corp', 'runner'] as const) {
          const raws = conns[side].raw.slice(seen[side]);
          const fresh = conns[side].msgs.slice(seen[side]);
          seen[side] += fresh.length;
          raws.forEach((raw, i) => {
            const m = fresh[i]!;
            totals.frames++;
            const top = Object.keys(m).filter((k) => k !== 'ack' || m.t === 'update' || m.t === 'rejected');
            expect(top.every((k) => FIELDS[m.t].includes(k)), `${side} ${m.t} fields ${top}`).toBe(true);
            const bad = [...keysDeep(m)].filter((k) => FORBIDDEN_KEYS.has(k) || k === 'options');
            expect(bad, `${side} ${m.t} carries ${bad}`).toEqual([]);
            for (const secret of secrets[side]) expect(raw.includes(secret), `${side} ${m.t} carries the other deck list`).toBe(false);
            if (m.t === 'seated') expect(m.token).toBe(tokens[side]);
            else expect(raw.includes(tokens[other(side)])).toBe(false);
            // An older app reads it as "another version" (and tells the player to update).
            expect(sprint13Parse(raw)).toEqual({ ok: false, error: 'version' });
            if (m.t === 'sync' || m.t === 'update' || m.t === 'rejected') {
              expect(m.view).toEqual(viewFor(side, state));
              expect(side === 'runner' ? runnerViewLeaks(state, m.view) : corpViewLeaks(state, m.view)).toEqual([]);
              views[side] = m.view;
            }
            if (m.t === 'update') {
              expect(m.events).toEqual(viewEvents(side, events!));
              expect(side === 'runner' ? runnerEventLeaks(m.events, state) : corpEventLeaks(m.events, state)).toEqual([]);
            }
          });
        }
      };
      check(null);
      expect(conns[hostSide].msgs.some((m) => m.t === 'deck_refused')).toBe(false);

      let id = 0;
      for (let step = 0; step < 2500 && state.phase !== 'over'; step++) {
        const who: Side = views.corp!.legalActions.length > 0 ? 'corp' : 'runner';
        const legal = views[who]!.legalActions;
        const onlyPass = who === 'corp' && views.corp!.run?.step === 'approach' && legal.length === 1;
        if (onlyPass && pick(2) === 0 && conns.corp.closed === null) {
          h.clock.t = h.room.nextWakeAt()!;
          h.room.alarm();
          check({ type: 'pass', player: 'corp' });
          continue;
        }
        const runs = legal.filter((a) => a.type === 'run');
        const a = runs.length > 0 && pick(2) === 0 ? runs[pick(runs.length)]! : legal[pick(legal.length)]!;
        h.room.message(conns[who], msg({ t: 'act', id: ++id, action: a }));
        check(a);
        // Hidden cards are really there to leak (own decks' cards sit in HQ/R&D/Stack/Grip).
        if (state.players.corp.hand.length > 0) totals.hiddenCorp++;
        if (state.players.runner.hand.length > 0) totals.hiddenRunner++;
        if (pick(60) === 0) {
          // A phone drops and comes back: the resume sync must be clean too.
          const side: Side = pick(2) === 0 ? 'corp' : 'runner';
          h.room.disconnect(conns[side]);
          const fresh = new FakeConn(side);
          h.room.connect(fresh, { kind: 'player' });
          conns[side] = fresh;
          seen[side] = 0;
          h.room.message(fresh, msg({ t: 'resume', token: tokens[side], since: 0 }));
          totals.dropped++;
          check(null);
        }
      }
      if (state.phase === 'over') {
        totals.over++;
        // Owner Q3 A: nothing extra at game over — a late resume sees the same projected board.
        for (const side of ['corp', 'runner'] as const) {
          const late = new FakeConn(`${side} late`);
          h.room.connect(late, { kind: 'player' });
          conns[side] = late;
          seen[side] = 0;
          h.room.message(late, msg({ t: 'resume', token: tokens[side], since: 0 }));
        }
        check(null);
        expect(views.corp!.players.runner.hand).toBeNull();
        expect(views.runner!.players.corp.hand).toBeNull();
      }
    }
    expect(totals.ownSides).toBeGreaterThanOrEqual(GAMES);
    expect(totals.refusals).toBe(GAMES / 3);
    expect(totals.frames).toBeGreaterThan(5000);
    expect(totals.over).toBeGreaterThan(GAMES / 2);
    expect(totals.dropped).toBeGreaterThan(5);
    expect(totals.hiddenCorp).toBeGreaterThan(1000);
    expect(totals.hiddenRunner).toBeGreaterThan(1000);
  }, 180_000);
});
