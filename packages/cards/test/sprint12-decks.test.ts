// Sprint 12 (S-12-5): the 45-card decks are legal under the real rules, the copies match the proposal table,
// and every card carries deck-builder data (NetrunnerDB code, faction, influence) checked against
// netrunner-cards-json pack/core.json (2026-11-18; DECISIONS).
import { describe, expect, it } from 'vitest';
import {
  ALL_CARDS,
  CORP_CORE45_DECK,
  CORP_CORE_DECK,
  MAX_COPIES,
  RUNNER_CORE45_DECK,
  RUNNER_CORE_DECK,
  checkDeck,
  deckAgendaPoints,
  deckInfluence,
  getCard,
  type DeckDef,
} from '../src/index';

/** [id, NetrunnerDB code, title, influence (faction_cost), deck_limit] from core.json. */
const CORE_JSON: readonly [string, string, string, number, number][] = [
  ['r01', '01019', 'Easy Mark', 1, 3],
  ['r02', '01053', 'Armitage Codebusting', 0, 3],
  ['r03', '01034', 'Diesel', 2, 3],
  ['r04', '01007', 'Corroder', 2, 3],
  ['r05', '01043', 'Gordian Blade', 3, 3],
  ['r06', '01027', 'Ninja', 2, 3],
  ['r07', '01036', "The Maker's Eye", 2, 3],
  ['r08', '01005', 'Cyberfeeder', 1, 3],
  ['r09', '01038', 'Akamatsu Mem Chip', 1, 3],
  ['r10', '01029', 'Bank Job', 2, 3],
  ['r11', '01021', 'Inside Job', 3, 3],
  ['r12', '01048', 'Sacrificial Construct', 1, 3],
  ['r13', '01033', 'Kate "Mac" McCaffrey: Digital Tinker', 0, 1],
  ['r14', '01050', 'Sure Gamble', 0, 3],
  ['r15', '01044', 'Magnum Opus', 2, 3],
  ['r16', '01046', 'Pipeline', 1, 3],
  ['r17', '01042', 'Battering Ram', 2, 3],
  ['r18', '01052', 'Access to Globalsec', 0, 3],
  ['r19', '01041', 'The Toolbox', 2, 3],
  ['r20', '01035', 'Modded', 2, 3],
  ['r21', '01049', 'Infiltration', 0, 3],
  ['c01', '01110', 'Hedge Fund', 0, 3],
  ['c02', '01083', 'Anonymous Tip', 1, 3],
  ['c03', '01109', 'PAD Campaign', 0, 3],
  ['c04', '01113', 'Wall of Static', 0, 3],
  ['c05', '01103', 'Ice Wall', 1, 3],
  ['c06', '01111', 'Enigma', 0, 3],
  ['c07', '01077', 'Neural Katana', 2, 3],
  ['c08', '01094', 'Hostile Takeover', 0, 3],
  ['c09', '01107', 'Private Security Force', 0, 3],
  ['c10', '01106', 'Priority Requisition', 0, 3],
  ['c11', '01079', 'Akitaro Watanabe', 2, 3],
  ['c12', '01072', 'Neural EMP', 2, 3],
  ['c13', '01054', 'Haas-Bioroid: Engineering the Future', 0, 1],
  ['c14', '01056', 'Adonis Campaign', 2, 3],
  ['c15', '01108', 'Melange Mining Corp.', 0, 3],
  ['c16', '01059', 'Biotic Labor', 4, 3],
  ['c17', '01063', 'Viktor 1.0', 2, 3],
  ['c18', '01061', 'Heimdall 1.0', 2, 3],
  ['c19', '01064', 'Rototurret', 1, 3],
  ['c20', '01112', 'Hunter', 0, 3],
  ['c21', '01062', 'Ichi 1.0', 2, 3],
  ['c22', '01086', 'SEA Source', 2, 3],
  ['c23', '01055', 'Accelerated Beta Test', 0, 3],
  ['c24', '01058', 'Archived Memories', 2, 3],
  ['c25', '01066', 'Experiential Data', 1, 3],
];

const copies = (deck: DeckDef): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const id of deck.cards) out[id] = (out[id] ?? 0) + 1;
  return out;
};
/** `big` minus `small`, as a copies table. */
const added = (big: DeckDef, small: DeckDef): Record<string, number> => {
  const a = copies(big);
  for (const [id, n] of Object.entries(copies(small))) a[id] = (a[id] ?? 0) - n;
  return Object.fromEntries(Object.entries(a).filter(([, n]) => n !== 0));
};

describe('Sprint 12: deck-builder data on every card', () => {
  it('every non-identity card has a code, a faction and a whole influence ≥ 0; codes are unique', () => {
    for (const c of ALL_CARDS) {
      expect(c.code, c.id).toMatch(/^01\d{3}$/);
      expect(c.faction, c.id).toBeTruthy();
      if (c.type !== 'identity') expect(Number.isInteger(c.influence) && (c.influence as number) >= 0, c.id).toBe(true);
    }
    const codes = ALL_CARDS.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('codes, titles and influence match core.json; every Core card allows MAX_COPIES (identities 1)', () => {
    expect(ALL_CARDS.map((c) => c.id).sort()).toEqual(CORE_JSON.map((r) => r[0]).sort());
    for (const [id, code, title, influence, limit] of CORE_JSON) {
      const c = getCard(id)!;
      expect({ code: c.code, name: c.name }, id).toEqual({ code, name: title });
      if (c.type !== 'identity') expect(c.influence, id).toBe(influence);
      expect(limit, id).toBe(c.type === 'identity' ? 1 : MAX_COPIES);
    }
  });

  it('unique cards as printed: The Toolbox and Akitaro Watanabe (not enforced: one copy each)', () => {
    expect(ALL_CARDS.filter((c) => c.unique).map((c) => c.name).sort()).toEqual(['Akitaro Watanabe', 'The Toolbox']);
    expect(copies(RUNNER_CORE45_DECK).r19).toBe(1);
    expect(copies(CORP_CORE45_DECK).c11).toBe(1);
  });
});

describe('S-12-5 AC1/AC2: the 45-card decks', () => {
  it('Corp: 45 cards, legal for Haas-Bioroid (minimum 45), 21 agenda points, influence 8 of 15', () => {
    expect(CORP_CORE45_DECK.identity).toBe('c13');
    expect(CORP_CORE45_DECK.cards).toHaveLength(45);
    expect(checkDeck(CORP_CORE45_DECK)).toEqual([]);
    expect(deckAgendaPoints(CORP_CORE45_DECK)).toBe(21);
    expect(deckInfluence(CORP_CORE45_DECK)).toBe(8);
    expect(Math.max(...Object.values(copies(CORP_CORE45_DECK)))).toBeLessThanOrEqual(MAX_COPIES);
  });

  it('Runner: 45 cards, legal for Kate (minimum 45), influence 10 of 15', () => {
    expect(RUNNER_CORE45_DECK.identity).toBe('r13');
    expect(RUNNER_CORE45_DECK.cards).toHaveLength(45);
    expect(checkDeck(RUNNER_CORE45_DECK)).toEqual([]);
    expect(deckInfluence(RUNNER_CORE45_DECK)).toBe(10);
    expect(Math.max(...Object.values(copies(RUNNER_CORE45_DECK)))).toBeLessThanOrEqual(MAX_COPIES);
  });

  it('copies = the Sprint 11 decks + the proposal table', () => {
    expect(added(CORP_CORE45_DECK, CORP_CORE_DECK)).toEqual({
      c23: 3, // Accelerated Beta Test
      c24: 2, // Archived Memories
      c25: 2, // Experiential Data
      c15: 1, // Melange Mining Corp.
      c03: 1, // PAD Campaign
      c14: 1, // Adonis Campaign
      c06: 1, // Enigma
      c04: 1, // Wall of Static
      c20: 1, // Hunter
      c18: 1, // Heimdall 1.0
      c21: 1, // Ichi 1.0
    });
    expect(added(RUNNER_CORE45_DECK, RUNNER_CORE_DECK)).toEqual({
      r19: 1, // The Toolbox
      r20: 3, // Modded
      r21: 3, // Infiltration
      r02: 1, // Armitage Codebusting
      r15: 1, // Magnum Opus
      r05: 1, // Gordian Blade
      r16: 1, // Pipeline
      r17: 1, // Battering Ram
      r09: 1, // Akamatsu Mem Chip
      r12: 1, // Sacrificial Construct
      r18: 1, // Access to Globalsec
    });
  });

  it('the 30-card decks are unchanged (frozen fixture): still legal under the house minimum, 15 points', () => {
    expect(CORP_CORE_DECK.cards).toHaveLength(30);
    expect(RUNNER_CORE_DECK.cards).toHaveLength(30);
    expect(checkDeck(CORP_CORE_DECK, { minDeckSize: 30 })).toEqual([]);
    expect(checkDeck(RUNNER_CORE_DECK, { minDeckSize: 30 })).toEqual([]);
    expect(deckAgendaPoints(CORP_CORE_DECK)).toBe(15);
  });
});
