// Sprint 9 E2 (S-09-4): the trace cards (Hunter, Ichi 1.0, SEA Source, Access to Globalsec), Private
// Security Force's scored ability, the deck swaps and the cut fallbacks, and the DSL v4 data rules.
import { describe, expect, it } from 'vitest';
import {
  ALL_CARDS,
  CORP_CARDS,
  CORP_CORE_DECK,
  HOUSE_MIN_DECK_SIZE,
  RUNNER_CORE_DECK,
  TRACE_SUCCESS_OPS,
  checkDeck,
  deckAgendaPoints,
  deckInfluence,
  getCard,
  type DeckDef,
  type Effect,
} from '../src/index';

const byName = (n: string) => ALL_CARDS.find((c) => c.name === n);
const count = (deck: DeckDef, id: string) => deck.cards.filter((x) => x === id).length;

/** `ids` with one copy of each of `drop` removed and `add` appended. */
function swap(deck: DeckDef, drop: string[], add: string[]): DeckDef {
  const out = [...deck.cards];
  for (const d of drop) {
    const i = out.indexOf(d);
    if (i < 0) throw new Error(`${d} not in deck`);
    out.splice(i, 1);
  }
  return { identity: deck.identity, cards: [...out, ...add] };
}

/** Every effect of a card, with trace `onSuccess` effects flattened in. */
function allEffects(effects: readonly Effect[]): Effect[] {
  return effects.flatMap((e) => (e.op === 'trace' ? [e, ...allEffects(e.onSuccess)] : [e]));
}

describe('S-09-4: the new cards carry their 2012 Core Set numbers and text as data', () => {
  it('Hunter: neutral sentry, rez 1, strength 4, influence 0; Trace 3 – give 1 tag', () => {
    expect(byName('Hunter')).toMatchObject({ id: 'c20', side: 'corp', type: 'ice', subtype: 'sentry', faction: 'neutral', cost: 1, strength: 4 });
    expect(getCard('c20')!.influence ?? 0).toBe(0); // Sprint 12: 0 is explicit now
    expect(getCard('c20')!.text).toBe('Subroutine: Trace 3 – If successful, give the Runner 1 tag.');
    expect(getCard('c20')!.subroutines!.map((s) => s.effect)).toEqual([{ op: 'trace', base: 3, onSuccess: [{ op: 'give_tags', amount: 1 }] }]);
  });

  it('Ichi 1.0: Haas-Bioroid sentry, rez 5, strength 4, influence 2; trash 1 program ×2, Trace 1 – 1 tag and 1 brain damage', () => {
    expect(byName('Ichi 1.0')).toMatchObject({ id: 'c21', type: 'ice', subtype: 'sentry', faction: 'haas_bioroid', cost: 5, strength: 4, influence: 2 });
    expect(getCard('c21')!.text).toMatch(/^Subroutine: Trash 1 program\.\nSubroutine: Trash 1 program\.\nSubroutine: Trace 1 – If successful, give the Runner 1 tag and do 1 brain damage\.$/);
    expect(getCard('c21')!.subroutines!.map((s) => s.effect)).toEqual([
      { op: 'trash_installed', types: ['program'] },
      { op: 'trash_installed', types: ['program'] },
      { op: 'trace', base: 1, onSuccess: [{ op: 'give_tags', amount: 1 }, { op: 'brain_damage', amount: 1 }] },
    ]);
  });

  it('SEA Source: NBN operation, cost 2, influence 2; play only after a successful run last turn; Trace 3 – 1 tag', () => {
    expect(byName('SEA Source')).toMatchObject({
      id: 'c22',
      type: 'operation',
      faction: 'nbn',
      cost: 2,
      influence: 2,
      playIf: 'runner_successful_run_last_turn',
      onPlay: [{ op: 'trace', base: 3, onSuccess: [{ op: 'give_tags', amount: 1 }] }],
    });
    expect(getCard('c22')!.text).toBe('Play only if the Runner made a successful run during his or her last turn.\nTrace 3 – If successful, give the Runner 1 tag.');
  });

  it('Access to Globalsec: neutral resource, cost 1, influence 0, +1 link', () => {
    expect(byName('Access to Globalsec')).toMatchObject({ id: 'r18', side: 'runner', type: 'resource', faction: 'neutral', cost: 1, link: 1, text: '+1 link.' });
    expect(getCard('r18')!.influence ?? 0).toBe(0); // Sprint 12: 0 is explicit now
  });

  it('Private Security Force: its click ability works from the score area while the Runner is tagged', () => {
    expect(getCard('c09')!.scoredAbilities).toEqual([
      { label: 'Do 1 meat damage', when: 'click', clicks: 1, credits: 0, requires: 'runner_tagged', effects: [{ op: 'meat_damage', amount: 1 }] },
    ]);
  });
});

describe('S-09-4 AC5: the Sprint 9 decks are legal (30 cards, Corp influence 8 with 15 points, Runner 10)', () => {
  it('both decks: 30 cards, legal under the deck rules (house minimum 30)', () => {
    for (const deck of [CORP_CORE_DECK, RUNNER_CORE_DECK]) {
      expect(deck.cards).toHaveLength(30);
      expect(checkDeck(deck, { minDeckSize: HOUSE_MIN_DECK_SIZE })).toEqual([]);
    }
    expect(deckInfluence(CORP_CORE_DECK)).toBe(8);
    expect(deckAgendaPoints(CORP_CORE_DECK)).toBe(15);
    expect(deckInfluence(RUNNER_CORE_DECK)).toBe(10);
  });

  it('the copies match the proposal table', () => {
    const corp: Record<string, number> = {
      'Hedge Fund': 3, 'SEA Source': 1, 'Neural EMP': 1, 'Biotic Labor': 1, 'PAD Campaign': 2, 'Adonis Campaign': 2,
      'Melange Mining Corp.': 2, 'Akitaro Watanabe': 1, 'Ice Wall': 2, 'Wall of Static': 1, Enigma: 1, Hunter: 2,
      Rototurret: 1, 'Ichi 1.0': 1, 'Viktor 1.0': 2, 'Heimdall 1.0': 1, 'Priority Requisition': 3, 'Private Security Force': 3,
    };
    const runner: Record<string, number> = {
      'Sure Gamble': 3, 'Easy Mark': 1, Diesel: 3, 'Armitage Codebusting': 2, 'Bank Job': 1, 'Access to Globalsec': 2, 'Magnum Opus': 2,
      "The Maker's Eye": 3, 'Inside Job': 1, Corroder: 1, 'Gordian Blade': 2, Pipeline: 2, 'Battering Ram': 2,
      'Akamatsu Mem Chip': 2, Cyberfeeder: 2, 'Sacrificial Construct': 1,
    };
    for (const [deck, table] of [[CORP_CORE_DECK, corp], [RUNNER_CORE_DECK, runner]] as const) {
      const got: Record<string, number> = {};
      for (const id of deck.cards) got[getCard(id)!.name] = (got[getCard(id)!.name] ?? 0) + 1;
      expect(got).toEqual(table);
    }
    // Left the decks, still in the game.
    for (const n of ['Anonymous Tip', 'Neural Katana', 'Hostile Takeover']) expect(count(CORP_CORE_DECK, byName(n)!.id), n).toBe(0);
  });

  // The tech plan said "Corp 9/15" for the fallback; Ichi and Rototurret are both Haas-Bioroid (0 influence for
  // this identity) and Anonymous Tip costs 1, so the fallback is 7/15 (DECISIONS 2026-11-16).
  it('cut fallbacks stay legal: SEA Source → Anonymous Tip (Corp 7), and Ichi 1.0 → Rototurret too (still 7)', () => {
    const noSea = swap(CORP_CORE_DECK, ['c22'], ['c02']);
    expect(checkDeck(noSea, { minDeckSize: 30 })).toEqual([]);
    expect(deckInfluence(noSea)).toBe(7);
    const noIchi = swap(noSea, ['c21'], ['c19']);
    expect(checkDeck(noIchi, { minDeckSize: 30 })).toEqual([]);
    expect(deckInfluence(noIchi)).toBe(7);
    const onlyIchiCut = swap(CORP_CORE_DECK, ['c21'], ['c19']);
    expect(checkDeck(onlyIchiCut, { minDeckSize: 30 })).toEqual([]);
  });
});

describe('Card DSL v4 data rules', () => {
  it('a trace onSuccess only holds non-choice ops (TRACE_SUCCESS_OPS); traces never nest', () => {
    for (const c of ALL_CARDS) {
      const effects = [...(c.onPlay ?? []), ...(c.subroutines ?? []).map((s) => s.effect), ...(c.onScore ?? []), ...(c.onRez ?? [])];
      for (const e of effects) {
        if (e.op !== 'trace') continue;
        expect(e.onSuccess.length, c.id).toBeGreaterThan(0);
        for (const x of e.onSuccess) expect((TRACE_SUCCESS_OPS as readonly string[]).includes(x.op), `${c.id}: ${x.op}`).toBe(true);
      }
    }
  });

  it('trace is always the last effect of an onPlay (like free_rez), and only in onPlay or a subroutine', () => {
    for (const c of ALL_CARDS) {
      const effects = c.onPlay ?? [];
      effects.forEach((e, i) => {
        if (e.op === 'trace') expect(i, c.id).toBe(effects.length - 1);
      });
      const elsewhere = [...(c.onScore ?? []), ...(c.onRez ?? []), ...(c.onInstall ?? []), ...(c.onTurnStart ?? []), ...(c.cardAbilities ?? []).flatMap((a) => a.effects)];
      expect(allEffects(elsewhere).some((e) => e.op === 'trace'), c.id).toBe(false);
    }
  });

  it('scoredAbilities: Corp agendas only, when: click only, with a label', () => {
    for (const c of ALL_CARDS) {
      if (!c.scoredAbilities) continue;
      expect(c.side, c.id).toBe('corp');
      expect(c.type, c.id).toBe('agenda');
      for (const ab of c.scoredAbilities) {
        expect(ab.when, c.id).toBe('click');
        expect(ab.label.length, c.id).toBeGreaterThan(0);
      }
    }
  });

  it('requires: runner_tagged only on Corp abilities; every card with trace text has a trace effect and vice versa', () => {
    for (const c of ALL_CARDS) {
      for (const ab of [...(c.cardAbilities ?? []), ...(c.scoredAbilities ?? [])]) if (ab.requires === 'runner_tagged') expect(c.side, c.id).toBe('corp');
      const effects = allEffects([...(c.onPlay ?? []), ...(c.subroutines ?? []).map((s) => s.effect)]);
      expect(/Trace \d/.test(c.text), c.id).toBe(effects.some((e) => e.op === 'trace'));
    }
    expect(CORP_CARDS.filter((c) => /Trace \d/.test(c.text)).map((c) => c.name).sort()).toEqual(['Hunter', 'Ichi 1.0', 'SEA Source']);
  });
});
