// Sprint 8 E2 (S-08-5): the two 30-card core decks, the deck rules as data, and the new cards.
import { describe, expect, it } from 'vitest';
import {
  ALL_CARDS,
  CORP_CARDS,
  CORP_CORE_DECK,
  HOUSE_MIN_DECK_SIZE,
  RUNNER_CORE_DECK,
  checkDeck,
  deckAgendaPoints,
  deckInfluence,
  getCard,
  type DeckDef,
} from '../src/index';

const count = (deck: DeckDef, id: string) => deck.cards.filter((x) => x === id).length;
const byName = (n: string) => ALL_CARDS.find((c) => c.name === n);

describe('S-08-5: the two 30-card decks are legal', () => {
  it.each([
    ['Corp', CORP_CORE_DECK],
    ['Runner', RUNNER_CORE_DECK],
  ])('%s: 30 cards, legal under the deck rules (house minimum 30)', (_side, deck) => {
    expect(deck.cards).toHaveLength(30);
    expect(HOUSE_MIN_DECK_SIZE).toBe(30);
    expect(checkDeck(deck, { minDeckSize: HOUSE_MIN_DECK_SIZE })).toEqual([]);
  });

  it('at most 3 copies of any card; each deck is its own side; no identity in a list', () => {
    for (const deck of [CORP_CORE_DECK, RUNNER_CORE_DECK]) {
      const side = getCard(deck.identity)!.side;
      for (const id of new Set(deck.cards)) {
        expect(count(deck, id), id).toBeLessThanOrEqual(3);
        expect(getCard(id)?.side, id).toBe(side);
        expect(getCard(id)?.type, id).not.toBe('identity');
      }
    }
  });

  it('identities: Haas-Bioroid: Engineering the Future and Kate "Mac" McCaffrey: Digital Tinker (45 / 15)', () => {
    expect(getCard(CORP_CORE_DECK.identity)).toMatchObject({ name: 'Haas-Bioroid: Engineering the Future', type: 'identity', faction: 'haas_bioroid', minDeckSize: 45, influenceLimit: 15 });
    expect(getCard(RUNNER_CORE_DECK.identity)).toMatchObject({ name: 'Kate "Mac" McCaffrey: Digital Tinker', type: 'identity', faction: 'shaper', minDeckSize: 45, influenceLimit: 15, link: 1 });
  });

  it('only Haas-Bioroid or neutral agendas in the Corp deck; influence within 15 (Corp 9, Runner 14)', () => {
    for (const id of CORP_CORE_DECK.cards) {
      const c = getCard(id)!;
      if (c.type === 'agenda') expect(['haas_bioroid', 'neutral'], id).toContain(c.faction);
    }
    expect(deckInfluence(CORP_CORE_DECK)).toBe(9);
    expect(deckInfluence(RUNNER_CORE_DECK)).toBe(14);
  });

  it('S-08-5 AC3: 15 agenda points: 3 Priority Requisition and 3 Private Security Force', () => {
    expect(deckAgendaPoints(CORP_CORE_DECK)).toBe(15);
    const agendas = CORP_CORE_DECK.cards.filter((id) => getCard(id)?.type === 'agenda');
    expect(agendas.sort()).toEqual(['c09', 'c09', 'c09', 'c10', 'c10', 'c10']);
  });

  it('the copies match the proposal table (Rototurret ×2 replacing 1 Wall of Static and 1 Enigma)', () => {
    const corp: Record<string, number> = {
      'Hedge Fund': 3, 'Anonymous Tip': 1, 'Neural EMP': 1, 'Biotic Labor': 1, 'PAD Campaign': 3, 'Adonis Campaign': 2,
      'Melange Mining Corp.': 2, 'Akitaro Watanabe': 1, 'Ice Wall': 2, 'Wall of Static': 1, Enigma: 1, Rototurret: 2,
      'Neural Katana': 1, 'Viktor 1.0': 2, 'Heimdall 1.0': 1, 'Priority Requisition': 3, 'Private Security Force': 3,
    };
    const runner: Record<string, number> = {
      'Sure Gamble': 3, 'Easy Mark': 2, Diesel: 3, 'Armitage Codebusting': 2, 'Bank Job': 1, 'Magnum Opus': 2,
      "The Maker's Eye": 3, 'Inside Job': 2, Corroder: 1, 'Gordian Blade': 2, Pipeline: 2, 'Battering Ram': 2,
      'Akamatsu Mem Chip': 2, Cyberfeeder: 2, 'Sacrificial Construct': 1,
    };
    for (const [deck, table] of [[CORP_CORE_DECK, corp], [RUNNER_CORE_DECK, runner]] as const) {
      const got: Record<string, number> = {};
      for (const id of deck.cards) got[getCard(id)!.name] = (got[getCard(id)!.name] ?? 0) + 1;
      expect(got).toEqual(table);
    }
    // Left the decks (real deck rules, owner Q3 A), still in the game.
    expect(count(CORP_CORE_DECK, byName('Hostile Takeover')!.id)).toBe(0);
    expect(count(RUNNER_CORE_DECK, byName('Ninja')!.id)).toBe(0);
  });

  it("the Battering Ram cut fallback (−2 Ram −1 Easy Mark +1 Corroder +1 Magnum Opus +1 Akamatsu) is legal at exactly 15; the proposal's second Corroder is not", () => {
    const without = (ids: string[], drop: string[]) => {
      const out = [...ids];
      for (const d of drop) out.splice(out.indexOf(d), 1);
      return out;
    };
    const fallback: DeckDef = { identity: 'r13', cards: [...without([...RUNNER_CORE_DECK.cards], ['r17', 'r17', 'r01']), 'r04', 'r15', 'r09'] };
    expect(checkDeck(fallback, { minDeckSize: 30 })).toEqual([]);
    expect(deckInfluence(fallback)).toBe(15);
    const proposal: DeckDef = { identity: 'r13', cards: [...without([...RUNNER_CORE_DECK.cards], ['r17']), 'r04'] };
    expect(checkDeck(proposal, { minDeckSize: 30 })).toEqual([{ kind: 'influence', used: 16, limit: 15 }]);
  });
});

describe('checkDeck catches each broken rule', () => {
  const corp = (cards: string[], identity = 'c13'): DeckDef => ({ identity, cards });
  const base = [...CORP_CORE_DECK.cards];

  it('too small (real minimum 45 without the house option)', () => {
    expect(checkDeck(CORP_CORE_DECK)).toContainEqual({ kind: 'too_small', size: 30, min: 45 });
    expect(checkDeck(corp(base.slice(1)), { minDeckSize: 30 })).toContainEqual({ kind: 'too_small', size: 29, min: 30 });
  });

  it('wrong side, identity in the deck, unknown card, not an identity', () => {
    expect(checkDeck(corp([...base.slice(1), 'r01']), { minDeckSize: 30 })).toContainEqual({ kind: 'wrong_side', cardId: 'r01' });
    expect(checkDeck(corp([...base.slice(1), 'c13']), { minDeckSize: 30 })).toContainEqual({ kind: 'identity_in_deck', cardId: 'c13' });
    expect(checkDeck(corp([...base.slice(1), 'zz9']), { minDeckSize: 30 })).toContainEqual({ kind: 'unknown_card', cardId: 'zz9' });
    expect(checkDeck(corp(base, 'c01'), { minDeckSize: 30 })).toContainEqual({ kind: 'not_identity', cardId: 'c01' });
  });

  it('more than 3 copies', () => {
    const four = [...base.filter((id) => id !== 'c06'), 'c01'];
    expect(checkDeck(corp(four), { minDeckSize: 30 })).toContainEqual({ kind: 'too_many_copies', cardId: 'c01', copies: 4 });
  });

  it('an other-faction agenda (Hostile Takeover is Weyland)', () => {
    const ht = [...base.filter((id) => id !== 'c06'), 'c08'];
    expect(checkDeck(corp(ht), { minDeckSize: 30 })).toContainEqual({ kind: 'agenda_faction', cardId: 'c08' });
  });

  it('influence above the limit', () => {
    const katanas = [...base.filter((id) => !['c01', 'c03'].includes(id)), ...Array(6).fill('c07')];
    expect(checkDeck(corp(katanas), { minDeckSize: 30 }).find((p) => p.kind === 'influence')).toBeDefined();
  });

  it('agenda points outside 14–15 for 30 cards', () => {
    const fewer = [...base.filter((id) => id !== 'c10'), 'c06', 'c04', 'c15'];
    expect(checkDeck(corp(fewer), { minDeckSize: 30 })).toEqual([{ kind: 'agenda_points', points: 6, min: 14, max: 15 }]);
  });
});

describe('S-08-5 AC4 / Sprint 8 card data', () => {
  /** Real 2012 Core Set titles used by this game (checked against the official card list; DECISIONS 2026-11-15). */
  const CORE_SET_TITLES = new Set([
    'Hedge Fund', 'Anonymous Tip', 'PAD Campaign', 'Wall of Static', 'Ice Wall', 'Enigma', 'Neural Katana', 'Hostile Takeover',
    'Private Security Force', 'Priority Requisition', 'Akitaro Watanabe', 'Neural EMP', 'Haas-Bioroid: Engineering the Future',
    'Adonis Campaign', 'Melange Mining Corp.', 'Biotic Labor', 'Viktor 1.0', 'Heimdall 1.0', 'Rototurret',
    'Easy Mark', 'Armitage Codebusting', 'Diesel', 'Corroder', 'Gordian Blade', 'Ninja', "The Maker's Eye", 'Cyberfeeder',
    'Akamatsu Mem Chip', 'Bank Job', 'Inside Job', 'Sacrificial Construct', 'Kate "Mac" McCaffrey: Digital Tinker',
    'Sure Gamble', 'Magnum Opus', 'Pipeline', 'Battering Ram',
  ]);

  it('every card is a real Core Set card (no invented card left)', () => {
    expect(ALL_CARDS).toHaveLength(36);
    for (const c of ALL_CARDS) expect(CORE_SET_TITLES.has(c.name), c.name).toBe(true);
  });

  it('every card in both decks has its text as data, except Private Security Force (needs tags)', () => {
    const behaviour = (id: string) => {
      const c = getCard(id)!;
      return !!(
        c.onPlay || c.subroutines || c.abilities || c.cardAbilities || c.onTurnStart || c.onScore || c.onRez || c.recurringCredits ||
        c.memoryBonus || c.iceRezDiscount || c.trashPrevention || c.onInstall
      );
    };
    const missing = [...new Set([...CORP_CORE_DECK.cards, ...RUNNER_CORE_DECK.cards])].filter((id) => !behaviour(id));
    expect(missing).toEqual(['c09']);
    // Agendas with no "when scored" text just score points: Private Security Force is the only "partly" card.
    expect(getCard('c09')!.text).toMatch(/tagged/);
  });

  it('every card has a faction; influence only on cards with pips; identities have none', () => {
    for (const c of ALL_CARDS) {
      expect(c.faction, c.id).toBeTruthy();
      if (c.type === 'identity') expect(c.influence, c.id).toBeUndefined();
      if (c.influence !== undefined) expect(c.influence, c.id).toBeGreaterThan(0);
    }
  });

  it('P1: no Corp card has onInstall (Corp installs are face down; it would leak the card)', () => {
    for (const c of CORP_CARDS) expect(c.onInstall, c.id).toBeUndefined();
  });

  it('P1: Corp install triggers/discounts never filter on a hidden type (only any type, or ICE)', () => {
    // A Corp `whenYouInstall` / `installDiscount` limited to e.g. agendas would fire (or change the
    // price) only for that type, telling the Runner what a face-down card is (architect review, Sprint 8).
    for (const c of CORP_CARDS) {
      for (const types of [c.whenYouInstall?.types, c.installDiscount?.types]) {
        if (types !== undefined) expect(types.every((t) => t === 'ice'), c.id).toBe(true);
      }
    }
  });

  it('only Corp cards have onRez; only Runner cards trashPrevention; only identities have deck limits', () => {
    for (const c of ALL_CARDS) {
      if (c.onRez) expect(c.side, c.id).toBe('corp');
      if (c.trashPrevention) expect(c.side, c.id).toBe('runner');
      if (c.minDeckSize !== undefined || c.influenceLimit !== undefined || c.link !== undefined) expect(c.type, c.id).toBe('identity');
    }
  });

  it('the new cards carry their official numbers and text as data', () => {
    expect(getCard('c13')).toMatchObject({ whenYouInstall: { firstEachTurn: true, effects: [{ op: 'gain_credits', amount: 1 }] } });
    expect(getCard('r13')).toMatchObject({ installDiscount: { amount: 1, firstEachTurn: true, types: ['program', 'hardware'] } });
    expect(getCard('c14')).toMatchObject({ type: 'asset', cost: 4, trashCost: 3, influence: 2, onRez: [{ op: 'place_credits', amount: 12 }], onTurnStart: [{ op: 'take_credits', amount: 3 }], trashWhenEmpty: true });
    expect(getCard('c15')).toMatchObject({ type: 'asset', cost: 1, trashCost: 1, faction: 'neutral', cardAbilities: [{ when: 'click', clicks: 3, credits: 0, effects: [{ op: 'gain_credits', amount: 7 }] }] });
    expect(getCard('c16')).toMatchObject({ type: 'operation', cost: 4, influence: 4, onPlay: [{ op: 'gain_clicks', amount: 2 }] });
    expect(getCard('c17')).toMatchObject({ type: 'ice', subtype: 'code_gate', cost: 3, strength: 3, influence: 2 });
    expect(getCard('c17')!.subroutines!.map((s) => s.effect)).toEqual([{ op: 'brain_damage', amount: 1 }, { op: 'end_run' }]);
    expect(getCard('c18')).toMatchObject({ type: 'ice', subtype: 'barrier', cost: 8, strength: 6, influence: 2 });
    expect(getCard('c18')!.subroutines!.map((s) => s.effect)).toEqual([{ op: 'brain_damage', amount: 1 }, { op: 'end_run' }, { op: 'end_run' }]);
    expect(getCard('c19')).toMatchObject({ type: 'ice', subtype: 'sentry', cost: 4, strength: 0, influence: 1 });
    expect(getCard('c19')!.subroutines!.map((s) => s.effect)).toEqual([{ op: 'trash_installed', types: ['program'] }, { op: 'end_run' }]);
    expect(getCard('r14')).toMatchObject({ type: 'event', cost: 5, faction: 'neutral', onPlay: [{ op: 'gain_credits', amount: 9 }] });
    expect(getCard('r15')).toMatchObject({ type: 'program', cost: 5, memory: 2, influence: 2, cardAbilities: [{ when: 'click', clicks: 1, effects: [{ op: 'gain_credits', amount: 2 }] }] });
    expect(getCard('r16')).toMatchObject({ subtype: 'breaker_sentry', cost: 3, memory: 1, strength: 1, influence: 1 });
    expect(getCard('r16')!.abilities).toEqual([{ op: 'break', cost: 1, iceType: 'sentry', count: 1 }, { op: 'strength', cost: 2, amount: 1, until: 'run' }]);
    expect(getCard('r17')).toMatchObject({ subtype: 'breaker_barrier', cost: 5, memory: 2, strength: 3, influence: 2 });
    expect(getCard('r17')!.abilities).toEqual([{ op: 'break', cost: 2, iceType: 'barrier', count: 2 }, { op: 'strength', cost: 1, amount: 1, until: 'run' }]);
    expect(getCard('r12')).toMatchObject({ trashPrevention: { types: ['program', 'hardware'] } });
  });

  it('only "break up to 2" breakers have count 2', () => {
    for (const c of ALL_CARDS) {
      for (const a of c.abilities ?? []) if (a.op === 'break' && a.count === 2) expect(c.text, c.id).toMatch(/up to 2/);
    }
  });
});
