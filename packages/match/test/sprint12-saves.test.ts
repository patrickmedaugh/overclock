// Sprint 12 E5 (S-12-5): golden saves on the 45-card decks. test/fixtures/sprint12-saves.json pins the sha256
// of the state each save replays to, for long random games and for planned games that use every new card
// (Accelerated Beta Test, Archived Memories, Experiential Data, The Toolbox, Modded, Infiltration). An engine
// or card change that alters replay fails here: bump RULES_VERSION, then re-pin with
//   UPDATE_FIXTURES=1 npx vitest run test/sprint12-saves.test.ts      (from packages/match)
// Sprint 11 saves (RULES_VERSION 4) load as `outdated` (owner's Q3 note): see saved-game.test.ts.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { RULES_VERSION, viewFor, type Action, type GameOptions, type GameState } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { LocalMatch, type SavedGame } from '../src/index';
import { planToStep, type StepGoal } from '../src/testing';
import { playRandom } from './save-play';

const FIXTURE = new URL('./fixtures/sprint12-saves.json', import.meta.url);

interface Golden {
  readonly name: string;
  readonly save: SavedGame;
  readonly stateSha256: string;
  readonly facts: { turn: number; activePlayer: string; corp: [number, number]; runner: [number, number] };
  /** Which new-card events the game produced (readable pin of what it covers). */
  readonly covers: string[];
}

const stateHash = (s: GameState) => createHash('sha256').update(JSON.stringify(s)).digest('hex');
const facts = (s: GameState): Golden['facts'] => ({
  turn: s.turn,
  activePlayer: s.activePlayer,
  corp: [s.players.corp.credits, s.players.corp.scoreArea.length],
  runner: [s.players.runner.credits, s.players.runner.scoreArea.length],
});

/** A plan to `goal`, then `extra(info, match)` moves (each computed from the match after the plan). */
function planned(seed: number, goal: StepGoal, options: Partial<GameOptions>, extra: (info: Record<string, string>, m: LocalMatch) => Action[]): Action[] {
  const p = planToStep(seed, goal, 1500, options);
  const m = new LocalMatch(seed, { ...options, deckSet: p.deckSet });
  for (const a of p.actions) m.submit(a.player, a);
  const more = extra(p.info as Record<string, string>, m);
  return [...p.actions, ...more];
}

/** Applies moves one by one, each picked from the match as it stands (`pick` returns null to stop). */
function then(m: LocalMatch, picks: ((m: LocalMatch) => Action | null)[]): Action[] {
  const out: Action[] = [];
  for (const pick of picks) {
    const a = pick(m);
    if (!a) break;
    m.submit(a.player, a);
    out.push(a);
  }
  return out;
}

const C45: Partial<GameOptions> = { deckSet: 'core45' };
const C45_ONLINE: Partial<GameOptions> = { deckSet: 'core45', rezWindow: 'always' };
const ice0 = (m: LocalMatch) => m.view('corp').choice?.options.find((o) => o.action.type === 'select')?.action ?? null;
const corpPass: Action = { type: 'pass', player: 'corp' };

const GOLDEN_GAMES: { name: string; seed: number; options: Partial<GameOptions>; minActions: number; actions?: () => Action[] }[] = [
  { name: 'core45 pass-the-phone', seed: 1212, options: C45, minActions: 300 },
  { name: 'core45 online rules', seed: 34, options: C45_ONLINE, minActions: 300 },
  {
    name: 'Accelerated Beta Test: install and rez ICE, trash the rest (planned)',
    seed: 7,
    options: C45,
    minActions: 5,
    actions: () =>
      planned(7, 'abt_scorable', C45, (i, m) =>
        then(m, [() => ({ type: 'score', player: 'corp', uid: i.uid! }), ice0, (x) => (x.view('corp').choice ? corpPass : null)]),
      ),
  },
  {
    name: 'Archived Memories: a face-down card back to HQ (planned)',
    seed: 42,
    options: C45_ONLINE,
    minActions: 5,
    actions: () =>
      planned(42, 'archived_memories_ready', C45_ONLINE, (i, m) =>
        then(m, [() => ({ type: 'play', player: 'corp', handIndex: Number(i.handIndex) }), () => ({ type: 'select', player: 'corp', card: Number(i.faceDownIndex) })]),
      ),
  },
  {
    name: 'Experiential Data: Gordian Blade pumps once, breaks both (planned)',
    seed: 1,
    options: C45,
    minActions: 10,
    actions: () =>
      planned(1, 'experiential_data_encounter', C45, (i) => {
        const use = (ability: number, sub?: number): Action => ({ type: 'use_ability', player: 'runner', uid: i.breakerUid!, ability, ...(sub !== undefined ? { sub } : {}) });
        return [use(1), use(0, 0), use(0, 1)];
      }),
  },
  {
    name: 'The Toolbox pays the breaker (planned)',
    seed: 12345,
    options: C45_ONLINE,
    minActions: 10,
    actions: () =>
      planned(12345, 'toolbox_encounter', C45_ONLINE, (i, m) =>
        then(m, [
          (x) => x.view('runner').run?.options.find((o) => o.action.type === 'use_ability' && o.action.uid === i.breakerUid && o.reject === null)?.action ?? null,
        ]),
      ),
  },
  {
    name: 'Modded installs from the Grip (planned)',
    seed: 7,
    options: C45,
    minActions: 5,
    actions: () =>
      planned(7, 'modded_ready', C45, (i) => [{ type: 'play', player: 'runner', handIndex: Number(i.handIndex), installIndex: Number(i.installIndex) }]),
  },
  {
    name: 'Infiltration exposes a card (planned)',
    seed: 1,
    options: C45_ONLINE,
    minActions: 2,
    actions: () => planned(1, 'infiltration_ready', C45_ONLINE, (i) => [{ type: 'play', player: 'runner', handIndex: Number(i.handIndex), mode: 1, uid: i.uid! }]),
  },
];

const COVERS = ['cards_looked_at', 'rd_cards_trashed', 'card_returned_to_hand', 'card_exposed'] as const;

/** Replays `actions` live; returns the match and which Sprint 12 events happened (plus 'modded' / 'toolbox'). */
function live(seed: number, options: Partial<GameOptions>, actions: readonly Action[]): { m: LocalMatch; covers: string[] } {
  const m = new LocalMatch(seed, options);
  const seen = new Set<string>();
  for (const a of actions) {
    const u = m.submit(a.player, a);
    expect(u[a.player].events.some((e) => e.type === 'action_rejected'), JSON.stringify(a)).toBe(false);
    for (const e of u.corp.events) {
      if ((COVERS as readonly string[]).includes(e.type)) seen.add(e.type);
      if (e.type === 'card_played' && e.cardId === 'r20') seen.add('modded');
      if (e.type === 'hosted_credits_changed' && m.snapshot().rig.some((c) => c.uid === e.uid && c.cardId === 'r19')) seen.add('toolbox');
    }
  }
  return { m, covers: [...seen].sort() };
}

describe('Sprint 12: golden save fixture on the 45-card decks (replay drift needs a RULES_VERSION bump)', () => {
  if (process.env.UPDATE_FIXTURES === '1') {
    const golden: Golden[] = GOLDEN_GAMES.map(({ name, seed, options, actions }) => {
      const { m, covers } = live(seed, options, actions ? actions() : playRandom(seed, options, 2000, true, true).actions);
      return { name, save: m.save(), stateSha256: stateHash(m.snapshot()), facts: facts(m.snapshot()), covers };
    });
    writeFileSync(FIXTURE, JSON.stringify(golden, null, 1) + '\n');
  }
  const golden = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Golden[];

  it('holds the pinned games under the current RULES_VERSION (5), all on core45', () => {
    expect(RULES_VERSION).toBe(5);
    expect(golden.map((g) => g.name)).toEqual(GOLDEN_GAMES.map((g) => g.name));
    golden.forEach((g, i) => {
      expect(g.save.rulesVersion, `${g.name}: RULES_VERSION changed; re-pin the fixture (see the header)`).toBe(RULES_VERSION);
      expect(g.save.options.deckSet).toBe('core45');
      expect(g.save.actions.length).toBeGreaterThanOrEqual(GOLDEN_GAMES[i]!.minActions);
    });
  });

  it('the planned games cover every new card', () => {
    const all = new Set(golden.flatMap((g) => g.covers));
    for (const k of [...COVERS, 'modded', 'toolbox']) expect(all.has(k), k).toBe(true);
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
      // The same save under the Sprint 11 rules version is refused (the owner's "can't continue" note).
      expect(LocalMatch.load({ ...g.save, rulesVersion: 4 })).toEqual({ ok: false, reason: 'outdated' });
    });
  }
});
