// Sprint 13 E3 (S-13-5): saves hold the dealt deck lists. SAVE_FORMAT 1 → 2; format-1 saves (Sprint 11/12
// fixtures) still load with unchanged hashes; Continue never reads the deck store, so editing or deleting
// the deck a game was dealt from can't change the saved game.
// test/fixtures/sprint13-saves.json pins format-2 custom-deck games (sha256 of the replayed state). Re-pin
// only with a RULES_VERSION bump (or a GameState layout move; say why in the commit):
//   UPDATE_FIXTURES=1 npx vitest run test/sprint13-saves.test.ts      (from packages/match)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { IDENTITIES, STANDARD_DECKS, countsOf, deckFromCounts, type DeckDef } from '@overclock/cards';
import { RULES_VERSION, newGame, viewFor, type Action, type GameOptions, type GameState } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { LocalMatch, MAX_SAVED_DECK_CARDS, SAVE_FORMAT, parseSavedGame, parseDeckStore, type DeckStore, type SavedGame, type StoredDeck } from '../src/index';
import { playRandom } from './save-play';

const stateHash = (s: GameState) => createHash('sha256').update(JSON.stringify(s)).digest('hex');
const sorted = (xs: readonly string[]) => [...xs].sort();

/** A 46-card Corp deck (a 3rd Wall of Static) and a 46-card Runner deck (a 3rd Cyberfeeder), both Ready. */
const CORP46: DeckDef = deckFromCounts('c13', { ...countsOf(STANDARD_DECKS.corp), c04: 3 });
const RUNNER46: DeckDef = deckFromCounts('r13', { ...countsOf(STANDARD_DECKS.runner), r08: 3 });

function liveMatch(seed: number, options: Partial<GameOptions>, actions: readonly Action[]): LocalMatch {
  const m = new LocalMatch(seed, options);
  for (const a of actions) expect(m.submit(a.player, a)[a.player].events.some((e) => e.type === 'action_rejected')).toBe(false);
  return m;
}

describe('S-13-5: SAVE_FORMAT 2 holds the dealt lists', () => {
  it('SAVE_FORMAT is 2; RULES_VERSION stays 5 (no rule or card change)', () => {
    expect(SAVE_FORMAT).toBe(2);
    expect(RULES_VERSION).toBe(5);
  });

  it('a custom-deck game saves {format 2, options with decks}; detached from the match', () => {
    const g = playRandom(3, { decks: { corp: CORP46 } }, 60, true);
    const m = liveMatch(3, { decks: { corp: CORP46 } }, g.actions);
    const s = m.save();
    expect(s).toEqual({ format: 2, rulesVersion: RULES_VERSION, seed: 3, options: { rezWindow: 'affordable', deckSet: 'core45', decks: { corp: CORP46 } }, actions: g.actions });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    (s.options.decks!.corp!.cards as string[]).length = 0;
    expect(m.save().options.decks?.corp?.cards).toHaveLength(46);
    expect(m.options.decks?.corp?.cards).toHaveLength(46);
  });

  it('a standard game saves exactly what Sprint 12 saved, apart from the format number (no decks key)', () => {
    const s = new LocalMatch(1).save();
    expect(s).toEqual({ format: 2, rulesVersion: RULES_VERSION, seed: 1, options: { rezWindow: 'affordable', deckSet: 'core45' }, actions: [] });
    expect('decks' in s.options).toBe(false);
    expect(JSON.stringify(new LocalMatch(1, { decks: {} }).snapshot())).toBe(JSON.stringify(newGame(1)));
  });

  it('load: a custom-deck save (object or JSON) rebuilds the same game, both decks', () => {
    const options = { decks: { corp: CORP46, runner: RUNNER46 }, rezWindow: 'always' as const };
    const g = playRandom(11, options, 150, true);
    const m = liveMatch(11, options, g.actions);
    for (const x of [m.save(), JSON.stringify(m.save())]) {
      const r = LocalMatch.load(x);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(stateHash(r.match.snapshot())).toBe(stateHash(m.snapshot()));
      expect(r.match.options.decks).toEqual({ corp: CORP46, runner: RUNNER46 });
      expect(r.match.save()).toEqual(m.save());
    }
  });
});

describe('S-13-5: Continue after the deck is edited or deleted', () => {
  const now = 1_763_000_000_000;
  const stored: StoredDeck = { id: '6f1c-test', side: 'corp', name: 'My Corp deck 1', identity: IDENTITIES.corp, cards: countsOf(CORP46), createdAt: now, updatedAt: now };
  const store: DeckStore = { format: 2, decks: [stored], deleted: [] };

  it('play from the stored deck, save; edit the deck, then delete it: the save still loads the same game', () => {
    // The client deals the stored deck: deckFromCounts(identity, cards).
    const parsed = parseDeckStore(JSON.stringify(store));
    if (parsed === 'broken' || parsed === 'newer') throw new Error(String(parsed));
    const deck = deckFromCounts(parsed.decks[0]!.identity, parsed.decks[0]!.cards);
    const g = playRandom(21, { decks: { corp: deck } }, 120, true);
    const live = liveMatch(21, { decks: { corp: deck } }, g.actions);
    const saveJson = JSON.stringify(live.save());
    const want = stateHash(live.snapshot());
    expect(sorted([...newGame(21, { decks: { corp: deck } }).players.corp.deck, ...newGame(21, { decks: { corp: deck } }).players.corp.hand])).toEqual(sorted(CORP46.cards));

    // Edit: 46 → 45 cards (Wall of Static back to 2), renamed. Then delete it altogether.
    const edited: DeckStore = { format: 2, decks: [{ ...stored, name: 'Edited', cards: countsOf(STANDARD_DECKS.corp), updatedAt: now + 1 }], deleted: [] };
    const deleted: DeckStore = { format: 2, decks: [], deleted: [] };
    for (const after of [edited, deleted]) {
      expect(parseDeckStore(JSON.stringify(after))).toEqual(after);
      const r = LocalMatch.load(saveJson);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(stateHash(r.match.snapshot())).toBe(want);
      expect(r.match.options.decks?.corp).toEqual(CORP46);
      expect(r.match.view('corp')).toEqual(live.view('corp'));
      expect(r.match.view('runner')).toEqual(live.view('runner'));
    }
  });
});

describe('S-13-5: format-1 saves still load (Sprint 11 and 12 fixtures)', () => {
  for (const file of ['sprint11-saves.json', 'sprint12-saves.json']) {
    it(`${file}: every format-1 save loads to its pinned hash and re-saves as format 2 (same options)`, { timeout: 60_000 }, () => {
      const golden = JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8')) as { name: string; save: SavedGame & { format: number }; stateSha256: string }[];
      expect(golden.length).toBeGreaterThan(0);
      for (const g of golden) {
        expect(g.save.format, g.name).toBe(1);
        const p = parseSavedGame(g.save);
        expect(p, g.name).toEqual({ ...g.save, format: 2 });
        const r = LocalMatch.load(g.save);
        expect(r.ok, g.name).toBe(true);
        if (!r.ok) continue;
        expect(stateHash(r.match.snapshot()), g.name).toBe(g.stateSha256);
        expect(r.match.save()).toEqual({ ...g.save, format: 2 });
      }
    });
  }

  it('a format-1 save with a stray decks field is read as Sprint 12 read it (field ignored, standard decks)', () => {
    const old = { format: 1, rulesVersion: RULES_VERSION, seed: 4, options: { rezWindow: 'affordable', deckSet: 'core45', decks: { corp: CORP46 } }, actions: [] };
    expect(parseSavedGame(old)).toEqual({ format: 2, rulesVersion: RULES_VERSION, seed: 4, options: { rezWindow: 'affordable', deckSet: 'core45' }, actions: [] });
  });

  it('a newer format (3) is outdated; format 0 or a non-number is broken', () => {
    const s = new LocalMatch(1).save();
    expect(LocalMatch.load({ ...s, format: 3 })).toEqual({ ok: false, reason: 'outdated' });
    expect(LocalMatch.load({ ...s, format: 0 })).toEqual({ ok: false, reason: 'broken' });
    expect(LocalMatch.load({ ...s, format: 1.5 })).toEqual({ ok: false, reason: 'broken' });
    expect(LocalMatch.load({ ...s, format: '2' })).toEqual({ ok: false, reason: 'broken' });
  });
});

describe('S-13-5: illegal or oversized decks in a save are broken', () => {
  const base = new LocalMatch(2, { decks: { corp: CORP46 } }).save();
  const withDecks = (decks: unknown) => ({ ...base, options: { ...base.options, decks } });
  const bad: [string, unknown][] = [
    ['44 cards', { corp: { identity: 'c13', cards: CORP46.cards.slice(2) } }],
    ['a 4th copy', { corp: { identity: 'c13', cards: [...CORP46.cards.filter((id) => id !== 'c04'), 'c01', 'c04', 'c04'] } }],
    ['an unknown id', { corp: { identity: 'c13', cards: [...CORP46.cards, 'zz9'] } }],
    ['a Weyland agenda', { corp: { identity: 'c13', cards: [...CORP46.cards.filter((id) => id !== 'c09'), 'c08', 'c08'] } }],
    ['the other side\'s deck', { corp: STANDARD_DECKS.runner }],
    ['influence 17 / 15', { runner: { identity: 'r13', cards: [...STANDARD_DECKS.runner.cards.filter((id) => id !== 'r14'), 'r06', 'r06', 'r06'] } }],
    [`over ${MAX_SAVED_DECK_CARDS} ids`, { runner: { identity: 'r13', cards: Array.from({ length: MAX_SAVED_DECK_CARDS + 1 }, () => 'r14') } }],
    ['ids not strings', { corp: { identity: 'c13', cards: CORP46.cards.map((id, i) => (i === 0 ? 1 : id)) } }],
    ['identity not a string', { corp: { identity: 13, cards: CORP46.cards } }],
    ['cards not a list', { corp: { identity: 'c13', cards: 'c01' } }],
    ['a side that is not an object', { corp: 'c13' }],
    ['decks not an object', ['c13']],
    ['decks null', null],
  ];
  it.each(bad)('%s', (_name, decks) => {
    expect(parseSavedGame(withDecks(decks))).toBe('broken');
    expect(LocalMatch.load(JSON.stringify(withDecks(decks)))).toEqual({ ok: false, reason: 'broken' });
  });

  it('the biggest legal Corp deck in this pool (49 cards, 21 points) loads; 50 cards can\'t reach 22 points: broken', () => {
    const counts = { ...countsOf(STANDARD_DECKS.corp), c04: 3, c05: 3, c06: 3, c01: 3 }; // +1 +1 +1: 48
    const corp49 = deckFromCounts('c13', { ...counts, c17: 3 });
    expect(corp49.cards).toHaveLength(49);
    expect(LocalMatch.load(withDecks({ corp: corp49 })).ok).toBe(true);
    const corp50 = deckFromCounts('c13', { ...counts, c17: 3, c18: 3 });
    expect(corp50.cards).toHaveLength(50);
    expect(LocalMatch.load(withDecks({ corp: corp50 }))).toEqual({ ok: false, reason: 'broken' });
  });

  it('parse keeps only the given sides, drops unknown keys and an empty decks object', () => {
    expect(parseSavedGame(withDecks({ corp: CORP46, extra: 1 }))).toMatchObject({ options: { decks: { corp: CORP46 } } });
    expect((parseSavedGame(withDecks({ corp: CORP46, extra: 1 })) as SavedGame).options.decks).toEqual({ corp: CORP46 });
    expect('decks' in (parseSavedGame(withDecks({})) as SavedGame).options).toBe(false);
    expect('decks' in (parseSavedGame(withDecks(undefined)) as SavedGame).options).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Golden format-2 fixture: custom-deck games pinned by state hash.
// ---------------------------------------------------------------------------------------------
const FIXTURE = new URL('./fixtures/sprint13-saves.json', import.meta.url);
interface Golden {
  readonly name: string;
  readonly save: SavedGame;
  readonly stateSha256: string;
}
const GOLDEN_GAMES: { name: string; seed: number; options: Partial<GameOptions>; minActions: number }[] = [
  { name: 'custom Corp 46 vs standard Runner', seed: 1313, options: { decks: { corp: CORP46 } }, minActions: 200 },
  { name: 'custom both, online rules', seed: 1314, options: { rezWindow: 'always', decks: { corp: CORP46, runner: RUNNER46 } }, minActions: 200 },
];

describe('Sprint 13: golden format-2 save fixture (replay drift needs a RULES_VERSION bump)', () => {
  if (process.env.UPDATE_FIXTURES === '1') {
    const golden: Golden[] = GOLDEN_GAMES.map(({ name, seed, options }) => {
      const m = liveMatch(seed, options, playRandom(seed, options, 2000, true, true).actions);
      return { name, save: m.save(), stateSha256: stateHash(m.snapshot()) };
    });
    writeFileSync(FIXTURE, JSON.stringify(golden, null, 1) + '\n');
  }
  const golden = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Golden[];

  it('holds the pinned games', () => {
    expect(golden.map((g) => g.name)).toEqual(GOLDEN_GAMES.map((g) => g.name));
    golden.forEach((g, i) => {
      expect(g.save.format).toBe(2);
      expect(g.save.rulesVersion).toBe(RULES_VERSION);
      expect(g.save.options.decks).toBeDefined();
      expect(g.save.actions.length).toBeGreaterThanOrEqual(GOLDEN_GAMES[i]!.minActions);
    });
  });

  for (const g of golden) {
    it(`${g.name}: loads and replays to the pinned state`, { timeout: 30_000 }, () => {
      const r = LocalMatch.load(g.save);
      expect(r.ok, `${g.name}: ${JSON.stringify(r)}`).toBe(true);
      if (!r.ok) return;
      const s = r.match.snapshot();
      expect(stateHash(s), `${g.name}: replay changed without a RULES_VERSION bump`).toBe(g.stateSha256);
      expect(viewFor('runner', s)).toEqual(r.match.view('runner'));
    });
  }
});
