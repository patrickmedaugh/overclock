// Sprint 11 E3 (S-11-3 AC "exactly as they were, no hidden cards to the wrong player"): save/restore
// property test over 300 random games, the broken / outdated / finished cases on real games, and the
// restore time of a 400-action game.
//
// Each game: random play (core and starter decks, both rez windows) → a random save point k →
// live.save() → JSON text → JSON.parse → LocalMatch.load. Then:
// - both seats' views, the full state and the save are deep-equal to the live game's;
// - the restored Runner view hides what the live one hides (runnerViewLeaks), and the Corp view has no
//   Runner Grip cards;
// - the next 20 moves give equal updates (views and events, both seats) on the live and restored games.
import { performance } from 'node:perf_hooks'; // test-only timing (the restore budget), not engine code
import { RULES_VERSION, type Action, type GameOptions } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { LocalMatch, type SavedGame } from '../src/index';
import { runnerEventLeaks, runnerViewLeaks } from '../src/testing';
import { playRandom, prng } from './save-play';

const OPTIONS: Partial<GameOptions>[] = [{ deckSet: 'core' }, { deckSet: 'core', rezWindow: 'always' }, { deckSet: 'starter' }];
const GAMES = 300;
const NEXT = 20;

function live(seed: number, options: GameOptions, actions: readonly Action[]): LocalMatch {
  const m = new LocalMatch(seed, options);
  for (const a of actions) {
    if (m.submit(a.player, a)[a.player].events.some((e) => e.type === 'action_rejected')) throw new Error(`rejected ${JSON.stringify(a)}`);
  }
  return m;
}

describe('Sprint 11: save → JSON → load gives back the same game (300 random games)', () => {
  it('views, state and save equal at a random point; next 20 moves give equal updates; nothing hidden leaks', () => {
    const pick = prng(1117);
    const tally = { games: 0, atRun: 0, atChoice: 0, atDiscard: 0, runnerTurn: 0, compared: 0, maxK: 0 };
    for (let i = 0; i < GAMES; i++) {
      const seed = 1000 + i;
      const g = playRandom(seed, OPTIONS[i % OPTIONS.length]!, 260, true, i % 2 === 0);
      const k = pick(Math.max(1, g.actions.length - NEXT) + 1);
      const a = live(seed, g.options, g.actions.slice(0, k));
      const text = JSON.stringify(a.save());
      const r = LocalMatch.load(JSON.parse(text) as unknown);
      expect(r.ok, `game ${i} k ${k}: ${JSON.stringify(r)}`).toBe(true);
      if (!r.ok) continue;
      const b = r.match;
      const state = b.snapshot();
      expect(state).toEqual(a.snapshot());
      expect(b.view('corp')).toEqual(a.view('corp'));
      expect(b.view('runner')).toEqual(a.view('runner'));
      expect(b.save()).toEqual(a.save());
      expect(runnerViewLeaks(state, b.view('runner'))).toEqual([]);
      expect(b.view('corp').players.runner.hand ?? null).toBeNull();
      expect(JSON.stringify(b.view('runner'))).not.toContain('"rng"');

      tally.games++;
      tally.maxK = Math.max(tally.maxK, k);
      if (state.run) tally.atRun++;
      if (state.choice) tally.atChoice++;
      if (state.phase === 'discard') tally.atDiscard++;
      if (state.activePlayer === 'runner') tally.runnerTurn++;

      for (const next of g.actions.slice(k, k + NEXT)) {
        const ua = a.submit(next.player, next);
        const ub = b.submit(next.player, next);
        expect(ub).toEqual(ua);
        expect(runnerEventLeaks(ub.runner.events, b.snapshot())).toEqual([]);
        tally.compared++;
      }
      expect(b.save()).toEqual(a.save());
    }
    console.log('Sprint 11 save/restore sweep', JSON.stringify(tally));
    expect(tally.games).toBe(GAMES);
    // The sweep really restores mid-run, mid-choice, at a discard and on both sides' turns.
    for (const key of ['atRun', 'atChoice', 'atDiscard', 'runnerTurn'] as const) expect(tally[key], key).toBeGreaterThan(0);
    expect(tally.compared).toBeGreaterThan(GAMES * 10);
  }, 120_000);
});

describe('Sprint 11: saves that can not continue', () => {
  it('finished: real games played to the end (any winner, any reason) load as finished; one move earlier as ok', () => {
    const reasons = new Set<string>();
    let finished = 0;
    for (let seed = 1; finished < 30 && seed < 400; seed++) {
      const g = playRandom(seed, OPTIONS[seed % OPTIONS.length]!, 3000);
      if (g.state.phase !== 'over') continue;
      finished++;
      reasons.add(`${g.state.result?.winner}:${g.state.result?.reason}`);
      const m = new LocalMatch(seed, g.options);
      for (const a of g.actions) m.submit(a.player, a);
      expect(m.view('corp').phase).toBe('over');
      expect(LocalMatch.load(JSON.stringify(m.save()))).toEqual({ ok: false, reason: 'finished' });
      expect(LocalMatch.load({ ...m.save(), actions: g.actions.slice(0, -1) }).ok).toBe(true);
    }
    expect(finished).toBe(30);
    console.log('Sprint 11 finished saves', [...reasons].join(' '));
    expect(reasons.size).toBeGreaterThan(1);
  });

  it('broken: every cut of a save\'s JSON text, and random byte damage that breaks the shape', () => {
    const g = playRandom(77, { deckSet: 'core' }, 120, true);
    const text = JSON.stringify(live(77, g.options, g.actions).save());
    const pick = prng(77);
    for (let n = 0; n < 200; n++) {
      const cut = pick(text.length);
      expect(LocalMatch.load(text.slice(0, cut))).toEqual({ ok: false, reason: 'broken' });
    }
    // Damage that still parses: whatever it is, load never throws and never says ok with a different game.
    for (let n = 0; n < 300; n++) {
      const at = pick(text.length);
      const damaged = text.slice(0, at) + '0123456789x"{}[],:'[pick(19)] + text.slice(at + 1);
      const r = LocalMatch.load(damaged);
      if (r.ok) {
        // A digit swapped inside a number the replay still accepts: it is a valid save of *some* game.
        expect(r.match.save()).toEqual(JSON.parse(damaged));
      } else expect(['broken', 'outdated', 'finished']).toContain(r.reason);
    }
  });

  it('outdated: the same real save under another RULES_VERSION, and with a move the rules now refuse', () => {
    const g = playRandom(78, { deckSet: 'core', rezWindow: 'always' }, 150, true);
    const save: SavedGame = live(78, g.options, g.actions).save();
    expect(LocalMatch.load(save).ok).toBe(true);
    for (const rulesVersion of [1, 2, 3, RULES_VERSION + 1]) expect(LocalMatch.load({ ...save, rulesVersion })).toEqual({ ok: false, reason: 'outdated' });
    // Simulated drift: a saved move moved one step later no longer fits (a rule change with no bump).
    const pick = prng(78);
    let outdated = 0;
    for (let n = 0; n < 50; n++) {
      const i = 1 + pick(save.actions.length - 2);
      const swapped = [...save.actions];
      [swapped[i], swapped[i + 1]] = [swapped[i + 1]!, swapped[i]!];
      const r = LocalMatch.load({ ...save, actions: swapped });
      if (!r.ok) {
        expect(r.reason).toBe('outdated');
        outdated++;
      }
    }
    expect(outdated).toBeGreaterThan(0);
  });
});

describe('Sprint 11: restore time', () => {
  it('a 400-action game loads in < 50 ms (Node; best of 5)', () => {
    const g = playRandom(21, { deckSet: 'core', rezWindow: 'always' }, 2000, true, true);
    expect(g.actions.length).toBeGreaterThanOrEqual(400);
    const text = JSON.stringify(live(21, g.options, g.actions.slice(0, 400)).save());
    const times: number[] = [];
    for (let n = 0; n < 5; n++) {
      const t = performance.now();
      const r = LocalMatch.load(text);
      times.push(performance.now() - t);
      expect(r.ok).toBe(true);
    }
    console.log('Sprint 11 restore of 400 actions (ms)', times.map((t) => t.toFixed(1)).join(' '), `save ${text.length} chars`);
    expect(Math.min(...times)).toBeLessThan(50);
  });
});
