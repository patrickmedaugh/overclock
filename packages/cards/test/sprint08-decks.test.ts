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

  it('only Haas-Bioroid or neutral agendas in the Corp deck; influence within 15 (Sprint 9: Corp 8, Runner 10)', () => {
    for (const id of CORP_CORE_DECK.cards) {
      const c = getCard(id)!;
      if (c.type === 'agenda') expect(['haas_bioroid', 'neutral'], id).toContain(c.faction);
    }
    expect(deckInfluence(CORP_CORE_DECK)).toBe(8);
    expect(deckInfluence(RUNNER_CORE_DECK)).toBe(10);
  });

  it('S-08-5 AC3: 15 agenda points: 3 Priority Requisition and 3 Private Security Force', () => {
    expect(deckAgendaPoints(CORP_CORE_DECK)).toBe(15);
    const agendas = CORP_CORE_DECK.cards.filter((id) => getCard(id)?.type === 'agenda');
    expect(agendas.sort()).toEqual(['c09', 'c09', 'c09', 'c10', 'c10', 'c10']);
  });

  // The copies table and the cut fallbacks moved to sprint09-decks.test.ts (the decks changed in Sprint 9).
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
    // Sprint 9 (checked against netrunner-cards-json core.json).
    'Hunter', 'Ichi 1.0', 'SEA Source', 'Access to Globalsec',
    // Sprint 12 (checked against netrunner-cards-json core.json, DECISIONS 2026-11-18).
    'Accelerated Beta Test', 'Archived Memories', 'Experiential Data', 'The Toolbox', 'Modded', 'Infiltration',
  ]);

  it('every card is a real Core Set card (no invented card left)', () => {
    expect(ALL_CARDS).toHaveLength(46);
    for (const c of ALL_CARDS) expect(CORE_SET_TITLES.has(c.name), c.name).toBe(true);
  });

  it('Sprint 9: every card in both decks has its text as data (Private Security Force too)', () => {
    const behaviour = (id: string) => {
      const c = getCard(id)!;
      return !!(
        c.onPlay || c.subroutines || c.abilities || c.cardAbilities || c.onTurnStart || c.onScore || c.onRez || c.recurringCredits ||
        c.memoryBonus || c.iceRezDiscount || c.trashPrevention || c.onInstall || c.scoredAbilities || c.link
      );
    };
    const missing = [...new Set([...CORP_CORE_DECK.cards, ...RUNNER_CORE_DECK.cards])].filter((id) => !behaviour(id));
    expect(missing).toEqual([]);
  });

  it('every card has a faction; influence a whole number ≥ 0 (Sprint 12: 0 may be explicit); identities have none', () => {
    for (const c of ALL_CARDS) {
      expect(c.faction, c.id).toBeTruthy();
      if (c.type === 'identity') expect(c.influence, c.id).toBeUndefined();
      if (c.influence !== undefined) expect(Number.isInteger(c.influence) && c.influence >= 0, c.id).toBe(true);
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
      if (c.minDeckSize !== undefined || c.influenceLimit !== undefined) expect(c.type, c.id).toBe('identity');
      // Sprint 9: link on identities and Runner rig cards (Access to Globalsec).
      if (c.link !== undefined) expect(c.type === 'identity' || (c.side === 'runner' && ['program', 'hardware', 'resource'].includes(c.type)), c.id).toBe(true);
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
