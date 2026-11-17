// Sprint 11 E1 (S-11-3): LocalMatch.save() / LocalMatch.load() and the golden save fixture.
//
// Golden fixture: test/fixtures/sprint11-saves.json holds Sprint 11 saves and the sha256 of the state
// each replays to. If an engine or card-data change alters what a saved action list replays to, this
// fails: bump RULES_VERSION (old saves then load as 'outdated'), then re-pin with
//   UPDATE_FIXTURES=1 npx vitest run test/saved-game.test.ts      (from packages/match)
// Re-pinning without a bump is only right when the replayed *game* is unchanged and only the
// GameState layout moved (say why in the commit message).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { RULES_VERSION, viewFor, type Action, type GameOptions, type GameState } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { LocalMatch, SAVE_FORMAT, parseSavedGame, type SavedGame } from '../src/index';
import { playRandom } from './save-play';

const FIXTURE = new URL('./fixtures/sprint11-saves.json', import.meta.url);

interface Golden {
  readonly name: string;
  readonly save: SavedGame;
  readonly stateSha256: string;
  /** Readable pins: turn, whose turn, [credits, scored cards] per side. */
  readonly facts: { turn: number; activePlayer: string; corp: [number, number]; runner: [number, number] };
}

const stateHash = (s: GameState) => createHash('sha256').update(JSON.stringify(s)).digest('hex');
const facts = (s: GameState): Golden['facts'] => ({
  turn: s.turn,
  activePlayer: s.activePlayer,
  corp: [s.players.corp.credits, s.players.corp.scoreArea.length],
  runner: [s.players.runner.credits, s.players.runner.scoreArea.length],
});

/**
 * The games the fixture pins: both deck sets and both rez windows, long enough to reach runs, ICE,
 * breakers, traces and scores (`long` random play, stopped before the game ends).
 */
const GOLDEN_GAMES: { name: string; seed: number; options: Partial<GameOptions>; minActions: number }[] = [
  { name: 'core pass-the-phone', seed: 1117, options: { deckSet: 'core' }, minActions: 300 },
  { name: 'core online rules', seed: 21, options: { deckSet: 'core', rezWindow: 'always' }, minActions: 400 },
  { name: 'starter', seed: 11, options: { deckSet: 'starter' }, minActions: 90 },
];

function liveMatch(seed: number, options: Partial<GameOptions>, actions: readonly Action[]): LocalMatch {
  const m = new LocalMatch(seed, options);
  for (const a of actions) expect(m.submit(a.player, a)[a.player].events.some((e) => e.type === 'action_rejected')).toBe(false);
  return m;
}

describe('Sprint 11: save()', () => {
  it('is {format: 1, rulesVersion, seed, options, accepted actions}, plain JSON and detached', () => {
    const g = playRandom(5, { deckSet: 'core' }, 40, true);
    const m = liveMatch(5, { deckSet: 'core' }, g.actions);
    m.submit('runner', { type: 'draw', player: 'corp' }); // seat mismatch: refused, not saved
    const s = m.save();
    expect(s).toEqual({ format: SAVE_FORMAT, rulesVersion: RULES_VERSION, seed: 5, options: { rezWindow: 'affordable', deckSet: 'core' }, actions: g.actions });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    (s.actions as Action[]).pop();
    expect(m.save().actions).toHaveLength(g.actions.length);
  });

  it('never saves a refused move (not_your_turn, no clicks, bad target)', () => {
    const m = new LocalMatch(3, { deckSet: 'core' });
    m.submit('runner', { type: 'draw', player: 'runner' }); // not your turn
    m.submit('corp', { type: 'gain_credit', player: 'corp' });
    m.submit('corp', { type: 'advance', player: 'corp', uid: 'nope' });
    expect(m.save().actions).toEqual([{ type: 'gain_credit', player: 'corp' }]);
    expect(m.actions()).toEqual([{ type: 'gain_credit', player: 'corp' }]);
  });
});

describe('Sprint 11: LocalMatch.load()', () => {
  it('ok: rebuilds the same game from the object or its JSON string', () => {
    const g = playRandom(8, { deckSet: 'core', rezWindow: 'always' }, 120, true);
    const m = liveMatch(8, g.options, g.actions);
    for (const x of [m.save(), JSON.stringify(m.save())]) {
      const r = LocalMatch.load(x);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.match.seed).toBe(8);
      expect(r.match.options).toEqual(g.options);
      expect(r.match.view('corp')).toEqual(m.view('corp'));
      expect(r.match.view('runner')).toEqual(m.view('runner'));
      expect(r.match.save()).toEqual(m.save());
    }
  });

  it('a fresh game (no moves) loads', () => {
    const r = LocalMatch.load(new LocalMatch(1).save());
    expect(r.ok && r.match.view('corp')).toEqual(new LocalMatch(1).view('corp'));
  });

  it('broken: not JSON, not a save, wrong shapes', () => {
    const good = new LocalMatch(1).save();
    const bad: unknown[] = [
      undefined,
      null,
      42,
      '',
      '{not json',
      '[]',
      [],
      {},
      { ...good, format: 0 },
      { ...good, format: '1' },
      { ...good, rulesVersion: '4' },
      { ...good, seed: -1 },
      { ...good, seed: 1.5 },
      { ...good, seed: 2 ** 32 },
      { ...good, options: undefined },
      { ...good, options: { rezWindow: 'never', deckSet: 'core' } },
      { ...good, options: { rezWindow: 'always' } },
      { ...good, actions: undefined },
      { ...good, actions: [null] },
      { ...good, actions: [{ type: 'draw' }] },
      { ...good, actions: [{ type: 3, player: 'corp' }] },
      { ...good, actions: [{ type: 'draw', player: 'nobody' }] },
    ];
    for (const x of bad) expect(LocalMatch.load(x), JSON.stringify(x) ?? String(x)).toEqual({ ok: false, reason: 'broken' });
  });

  it('outdated: another RULES_VERSION, a newer save format, or an action the rules refuse on replay', () => {
    const g = playRandom(4, { deckSet: 'core' }, 30, true);
    const save = liveMatch(4, { deckSet: 'core' }, g.actions).save();
    expect(LocalMatch.load({ ...save, rulesVersion: RULES_VERSION - 1 })).toEqual({ ok: false, reason: 'outdated' });
    expect(LocalMatch.load({ ...save, rulesVersion: RULES_VERSION + 1 })).toEqual({ ok: false, reason: 'outdated' });
    expect(LocalMatch.load({ ...save, format: SAVE_FORMAT + 1 })).toEqual({ ok: false, reason: 'outdated' });
    // Replay drift (rules changed without a version bump): a saved move the engine now refuses.
    const drift = [...save.actions.slice(0, 10), { type: 'draw', player: save.actions[10]!.player === 'corp' ? 'runner' : 'corp' }, ...save.actions.slice(10)];
    expect(LocalMatch.load({ ...save, actions: drift })).toEqual({ ok: false, reason: 'outdated' });
  });

  it('finished: a save whose replay ends the game', () => {
    let g = playRandom(1, { deckSet: 'core' }, 5000);
    for (let seed = 2; g.state.phase !== 'over'; seed++) g = playRandom(seed, { deckSet: 'core' }, 5000);
    expect(g.state.result).not.toBeNull();
    const save: SavedGame = { format: SAVE_FORMAT, rulesVersion: RULES_VERSION, seed: g.seed, options: g.options, actions: g.actions };
    expect(LocalMatch.load(save)).toEqual({ ok: false, reason: 'finished' });
    // One move earlier the game is still on.
    expect(LocalMatch.load({ ...save, actions: g.actions.slice(0, -1) }).ok).toBe(true);
  });

  it('parseSavedGame returns a detached copy with only the save fields', () => {
    const save = { ...new LocalMatch(2).save(), extra: 'x', options: { rezWindow: 'always', deckSet: 'starter', more: 1 } };
    const p = parseSavedGame(save);
    expect(p).toEqual({ format: 1, rulesVersion: RULES_VERSION, seed: 2, options: { rezWindow: 'always', deckSet: 'starter' }, actions: [] });
  });
});

describe('Sprint 11: golden save fixture (replay drift needs a RULES_VERSION bump)', () => {
  if (process.env.UPDATE_FIXTURES === '1') {
    const golden: Golden[] = GOLDEN_GAMES.map(({ name, seed, options }) => {
      const g = playRandom(seed, options, 2000, true, true);
      const m = liveMatch(seed, options, g.actions);
      return { name, save: m.save(), stateSha256: stateHash(m.snapshot()), facts: facts(m.snapshot()) };
    });
    writeFileSync(FIXTURE, JSON.stringify(golden, null, 1) + '\n');
  }
  const golden = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Golden[];

  it('holds the pinned games under the current RULES_VERSION', () => {
    expect(golden.map((g) => g.name)).toEqual(GOLDEN_GAMES.map((g) => g.name));
    golden.forEach((g, i) => {
      expect(g.save.rulesVersion, `${g.name}: RULES_VERSION changed; re-pin the fixture (see the header)`).toBe(RULES_VERSION);
      expect(g.save.actions.length).toBeGreaterThanOrEqual(GOLDEN_GAMES[i]!.minActions);
    });
  });

  for (const g of golden) {
    it(`${g.name}: loads and replays to the pinned state`, () => {
      const r = LocalMatch.load(g.save);
      expect(r.ok, `${g.name}: ${JSON.stringify(r)}`).toBe(true);
      if (!r.ok) return;
      const s = r.match.snapshot();
      expect(facts(s)).toEqual(g.facts);
      expect(stateHash(s), `${g.name}: replay changed without a RULES_VERSION bump`).toBe(g.stateSha256);
      expect(viewFor('runner', s)).toEqual(r.match.view('runner'));
    });
  }
});
