// Sprint 5 E3 (S-05-2): `RunView.letFire`, the Runner's preview of "let it fire".
// Unit cases per ICE, then a property test over random games: whenever the Runner's
// view has a preview, the `pass` that could follow resolves exactly those outcomes and
// ends the same way; computing the preview never changes the state (RNG included).
import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, viewFor, waitingOn, type Action, type GameState, type ServerId, type SubOutcome } from '../src/index';
import { act, board, clone, type BoardSpec } from './helpers';

const runOn = (server: ServerId): Action => ({ type: 'run', player: 'runner', server });
const pass: Action = { type: 'pass', player: 'runner' };
const use = (uid: string, ability: number, sub?: number): Action =>
  sub === undefined ? { type: 'use_ability', player: 'runner', uid, ability } : { type: 'use_ability', player: 'runner', uid, ability, sub };
const out = (sub: number, op: SubOutcome['op'], amount: number): SubOutcome => ({ sub, op, amount });

function encounterOn(spec: BoardSpec): GameState {
  const s = act(board(spec), runOn('hq')).state;
  expect(s.run?.step).toBe('encounter');
  return s;
}

/** What `pass` really does from `s`: the subroutine_resolved outcomes and how it ends. */
function actual(s: GameState) {
  const { events } = apply(s, pass);
  const outcomes = events.flatMap((e) => (e.type === 'subroutine_resolved' ? [e.outcome] : []));
  const ends = events.some((e) => e.type === 'game_over')
    ? 'game'
    : events.some((e) => e.type === 'run_ended' && e.outcome === 'ended_by_ice')
      ? 'run'
      : null;
  return { outcomes, ends };
}

describe('S-05-2: letFire preview', () => {
  it('Enigma with clicks: lose 1 click, then the run ends', () => {
    const s = encounterOn({ servers: { hq: { ice: ['+c06'] } }, runnerClicks: 4 });
    expect(viewFor('runner', s).run!.letFire).toEqual({ iceCardId: 'c06', outcomes: [out(0, 'lose_clicks', 1), out(1, 'end_run', 0)], ends: 'run' });
  });

  it('Enigma with no click left: the click loss is 0 (actual)', () => {
    const s = encounterOn({ servers: { hq: { ice: ['+c06'] } }, runnerClicks: 1 });
    expect(viewFor('runner', s).run!.letFire).toEqual({ iceCardId: 'c06', outcomes: [out(0, 'lose_clicks', 0), out(1, 'end_run', 0)], ends: 'run' });
  });

  it('Enigma with "End the run" broken: lose 1 click, the run goes on', () => {
    const s = act(encounterOn({ rig: ['r05'], servers: { hq: { ice: ['+c06'] } } }), use('i1', 0, 1)).state;
    expect(viewFor('runner', s).run!.letFire).toEqual({ iceCardId: 'c06', outcomes: [out(0, 'lose_clicks', 1)], ends: null });
  });

  it('Neural Katana: take 3 damage, the run goes on; with a small Grip: flatline (ends game)', () => {
    const big = encounterOn({ servers: { hq: { ice: ['+c07'] } }, runnerHand: ['r01', 'r02', 'r03', 'r09'] });
    expect(viewFor('runner', big).run!.letFire).toEqual({ iceCardId: 'c07', outcomes: [out(0, 'net_damage', 3)], ends: null });
    const small = encounterOn({ servers: { hq: { ice: ['+c07'] } }, runnerHand: ['r01', 'r02'] });
    const lf = viewFor('runner', small).run!.letFire;
    expect(lf).toEqual({ iceCardId: 'c07', outcomes: [out(0, 'net_damage', 3)], ends: 'game' });
    // No hidden info: the preview never names the cards that would be discarded.
    expect(JSON.stringify(lf)).not.toMatch(/"r\d\d"/);
  });

  it('Ice Wall / Wall of Static: the run ends', () => {
    for (const ice of ['c05', 'c04']) {
      const s = encounterOn({ servers: { hq: { ice: [`+${ice}`] } } });
      expect(viewFor('runner', s).run!.letFire).toEqual({ iceCardId: ice, outcomes: [out(0, 'end_run', 0)], ends: 'run' });
    }
  });

  it('null for the Corp, and at every non-encounter step', () => {
    const s = encounterOn({ servers: { hq: { ice: ['+c06'] } } });
    expect(viewFor('corp', s).run!.letFire).toBeNull();
    // Approach (face-down ICE the Corp can pay for): null for both.
    const approach = act(board({ servers: { hq: { ice: ['c05'] } }, corpCredits: 5 }), runOn('hq')).state;
    expect(approach.run!.step).toBe('approach');
    expect(viewFor('runner', approach).run!.letFire).toBeNull();
    // Continue and access.
    const cont = act(board({ servers: { hq: { ice: ['c05'] } }, corpCredits: 0 }), runOn('hq')).state;
    expect(cont.run!.step).toBe('continue');
    expect(viewFor('runner', cont).run!.letFire).toBeNull();
    const access = act(cont, pass).state;
    expect(access.run!.step).toBe('access');
    expect(viewFor('runner', access).run!.letFire).toBeNull();
  });

  it('computing the preview changes nothing (state and RNG)', () => {
    const s = encounterOn({ servers: { hq: { ice: ['+c07'] } }, runnerHand: ['r01', 'r02', 'r03', 'r09'] });
    const snapshot = clone(s);
    viewFor('runner', s);
    expect(s).toEqual(snapshot);
    // The real pass afterwards discards the same cards as without a preview.
    expect(apply(s, pass)).toEqual(apply(snapshot, pass));
  });
});

function prng(seed: number): (n: number) => number {
  let x = (seed * 2654435761 + 7) >>> 0 || 5;
  return (n) => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x % n;
  };
}

/** Run-heavy play, so many encounters happen. */
function weight(a: Action, s: GameState): number {
  if (a.type === 'run') return 12;
  if (a.type === 'rez') return 6;
  if (a.type === 'install') return s.activePlayer === 'corp' ? 8 : 3;
  if (a.type === 'use_ability') return 2;
  if (a.type === 'end_turn') return 1;
  return 3;
}

describe('S-05-2: letFire property over random games', () => {
  it('at every Runner encounter, the preview equals what pass does; viewFor never changes the state', () => {
    let previews = 0;
    let ended = 0;
    let goesOn = 0;
    let flatlines = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const pick = prng(seed);
      let s = newGame(seed);
      for (let step = 0; step < 600 && s.phase !== 'over'; step++) {
        const where = `seed ${seed} step ${step}`;
        const snapshot = JSON.stringify(s);
        const rv = viewFor('runner', s);
        const cv = viewFor('corp', s);
        expect(JSON.stringify(s), `${where}: viewFor is pure`).toBe(snapshot);
        expect(cv.run?.letFire ?? null, `${where}: never for the Corp`).toBeNull();
        const real = s.run;
        const ice = real && real.position >= 0 ? s.servers.find((x) => x.id === real.server)!.ice[real.position] : undefined;
        const shouldPreview = real?.step === 'encounter' && ice?.rezzed === true && legalActions(s, 'runner').some((a) => a.type === 'pass');
        if (!shouldPreview) {
          expect(rv.run?.letFire ?? null, where).toBeNull();
        } else {
          const lf = rv.run!.letFire!;
          expect(lf, where).not.toBeNull();
          expect(lf.iceCardId).toBe(ice!.cardId);
          expect({ outcomes: lf.outcomes, ends: lf.ends }, where).toEqual(actual(s));
          previews++;
          if (lf.ends === 'run') ended++;
          else if (lf.ends === 'game') flatlines++;
          else goesOn++;
        }
        const me = waitingOn(s)!;
        const legal = legalActions(s, me);
        const w = legal.map((a) => weight(a, s));
        let r = pick(w.reduce((x, y) => x + y, 0));
        let i = 0;
        while (r >= w[i]!) r -= w[i++]!;
        s = apply(s, legal[i]!).state;
      }
    }
    // The property was really exercised (seen: ~700 previews, ~640 run ends, ~35 go on, ~28 flatlines).
    expect(previews).toBeGreaterThan(300);
    expect(ended).toBeGreaterThan(100);
    expect(goesOn).toBeGreaterThan(10);
    expect(flatlines).toBeGreaterThan(5);
  }, 60_000);
});
