import { describe, expect, it } from 'vitest';
import {
  ALL_CARDS,
  CORP_CARDS,
  CORP_STARTER_DECK,
  RUNNER_CARDS,
  RUNNER_STARTER_DECK,
  getCard,
  type CardDef,
} from '../src/index';

/** S-02-5 AC4: the 24 real core-set cards (2012), by id. */
const REAL_NAMES: Record<string, string> = {
  c01: 'Hedge Fund',
  c02: 'Anonymous Tip',
  c03: 'PAD Campaign',
  c04: 'Wall of Static',
  c05: 'Ice Wall',
  c06: 'Enigma',
  c07: 'Neural Katana',
  c08: 'Hostile Takeover',
  c09: 'Private Security Force',
  c10: 'Priority Requisition',
  c11: 'Experiential Data',
  c12: 'Neural EMP',
  r01: 'Easy Mark',
  r02: 'Armitage Codebusting',
  r03: 'Diesel',
  r04: 'Corroder',
  r05: 'Gordian Blade',
  r06: 'Ninja',
  r07: "The Maker's Eye",
  r08: 'Cyberfeeder',
  r09: 'Akamatsu Mem Chip',
  r10: 'Wyldside',
  r11: 'Inside Job',
  r12: 'Data Dealer',
};

/** The invented Sprint 0/1 cards they replaced (must be gone). */
const RETIRED_NAMES = [
  'Quarterly Windfall', 'Synergy Memo', 'Kiosk Mesh', 'Rampart Lattice', 'Static Palisade', 'Cipher Turnstile',
  'Lantern Drone', 'Silent Merger', 'Skyline Rezoning', 'Mindshare Patent', 'Vault Warden', 'Feedback Spike',
  'Overtime Hustle', 'Back-Alley Fence', 'Cache Dive', 'Wallgnaw', 'Lockwhisper', 'Watchdog Muzzle',
  'Pinhole Probe', 'Chrome Lung', 'Coolant Halo', 'Rooftop Medic', 'Signal Jam', 'Burner Persona',
];

const cardStrings = (c: CardDef): string[] => [c.id, c.name, c.text, c.keywords ?? '', c.flavor ?? '', c.art];

describe('card pool (S-02-5 AC4: real core-set cards)', () => {
  it('has 12 cards per side', () => {
    expect(RUNNER_CARDS).toHaveLength(12);
    expect(CORP_CARDS).toHaveLength(12);
  });

  it('has exactly the 24 real names, on the kept ids', () => {
    expect(Object.fromEntries(ALL_CARDS.map((c) => [c.id, c.name]))).toEqual(REAL_NAMES);
  });

  it('no retired invented name is left in any card or starter deck', () => {
    expect(RETIRED_NAMES).toHaveLength(24);
    const deckNames = [...CORP_STARTER_DECK, ...RUNNER_STARTER_DECK].map((id) => getCard(id)?.name ?? '');
    for (const name of RETIRED_NAMES) {
      const lower = name.toLowerCase();
      expect(ALL_CARDS.filter((c) => cardStrings(c).some((s) => s.toLowerCase().includes(lower))).map((c) => c.id), name).toEqual([]);
      expect(deckNames, name).not.toContain(name);
    }
  });

  it('every card id is unique across both sides', () => {
    const ids = ALL_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cards are on the side whose list they are in, with a type of that side', () => {
    expect(RUNNER_CARDS.every((c) => c.side === 'runner' && ['event', 'program', 'hardware', 'resource'].includes(c.type))).toBe(true);
    expect(CORP_CARDS.every((c) => c.side === 'corp' && ['agenda', 'asset', 'upgrade', 'operation', 'ice'].includes(c.type))).toBe(true);
  });

  it('every operation/event has onPlay or needs; installables have neither', () => {
    for (const c of ALL_CARDS) {
      const playable = c.type === 'operation' || c.type === 'event';
      expect(playable ? Boolean(c.onPlay?.length) || c.needs !== undefined : c.onPlay === undefined && c.needs === undefined, c.id).toBe(true);
    }
  });

  it('ICE has strength and a subtype; programs have memory; agendas have requirement and points', () => {
    for (const c of ALL_CARDS) {
      if (c.type === 'ice') {
        expect(c.strength, c.id).toBeTypeOf('number');
        expect(['barrier', 'code_gate', 'sentry'], c.id).toContain(c.subtype);
      }
      if (c.type === 'program') expect(c.memory, c.id).toBeGreaterThan(0);
      if (c.type === 'agenda') {
        expect(c.advancementRequirement, c.id).toBeGreaterThan(0);
        expect(c.agendaPoints, c.id).toBeGreaterThan(0);
        expect(c.cost, c.id).toBe(0);
      }
    }
  });

  it('S-02-4 AC1: the four playable cards are data-driven with their official values', () => {
    expect(getCard('c01')).toMatchObject({ name: 'Hedge Fund', cost: 5, onPlay: [{ op: 'gain_credits', amount: 9 }] });
    expect(getCard('c02')).toMatchObject({ name: 'Anonymous Tip', cost: 0, onPlay: [{ op: 'draw', count: 3 }] });
    expect(getCard('r01')).toMatchObject({ name: 'Easy Mark', cost: 0, onPlay: [{ op: 'gain_credits', amount: 3 }] });
    expect(getCard('r03')).toMatchObject({ name: 'Diesel', cost: 0, onPlay: [{ op: 'draw', count: 3 }] });
  });

  it('S-02-4 AC4: run-dependent cards are flagged needs: runs', () => {
    expect(ALL_CARDS.filter((c) => c.needs === 'runs').map((c) => c.id).sort()).toEqual(['c12', 'r07', 'r11']);
  });

  it('spot values (QA spot-check list): ICE, breakers, agendas', () => {
    const stats = (id: string) => {
      const c = getCard(id)!;
      return [c.cost, c.strength ?? c.advancementRequirement ?? null, c.memory ?? c.agendaPoints ?? null];
    };
    expect(stats('c04')).toEqual([3, 3, null]); // Wall of Static: rez 3, strength 3
    expect(stats('c05')).toEqual([1, 1, null]); // Ice Wall
    expect(stats('c06')).toEqual([3, 2, null]); // Enigma
    expect(stats('c07')).toEqual([4, 3, null]); // Neural Katana
    expect(stats('c08')).toEqual([0, 2, 1]); // Hostile Takeover 2/1
    expect(stats('c09')).toEqual([0, 4, 2]); // Private Security Force 4/2
    expect(stats('c10')).toEqual([0, 5, 3]); // Priority Requisition 5/3
    expect(stats('r04')).toEqual([2, 2, 1]); // Corroder
    expect(stats('r05')).toEqual([4, 2, 1]); // Gordian Blade
    expect(stats('r06')).toEqual([4, 0, 1]); // Ninja
  });

  it('card text uses only the known symbol tokens', () => {
    for (const c of ALL_CARDS) {
      for (const m of c.text.matchAll(/\[([^\]]+)\]/g)) {
        expect(['click', 'credit', 'subroutine', 'mu'], `${c.id}: ${m[0]}`).toContain(m[1]);
      }
    }
  });

  it('covers the pool: three ICE types, matching breakers, agendas, an asset, an upgrade', () => {
    const iceTypes = new Set(CORP_CARDS.filter((c) => c.type === 'ice').map((c) => c.subtype));
    expect(iceTypes).toEqual(new Set(['barrier', 'code_gate', 'sentry']));
    const breakers = new Set(RUNNER_CARDS.filter((c) => c.type === 'program').map((c) => c.subtype));
    expect(breakers).toEqual(new Set(['breaker_barrier', 'breaker_code_gate', 'breaker_sentry']));
    expect(CORP_CARDS.filter((c) => c.type === 'agenda')).toHaveLength(3);
    expect(CORP_CARDS.some((c) => c.type === 'asset')).toBe(true);
    expect(CORP_CARDS.some((c) => c.type === 'upgrade')).toBe(true);
  });

  it('starter decks are 15 cards of their own side', () => {
    expect(RUNNER_STARTER_DECK).toHaveLength(15);
    expect(CORP_STARTER_DECK).toHaveLength(15);
    expect(RUNNER_STARTER_DECK.every((id) => getCard(id)?.side === 'runner')).toBe(true);
    expect(CORP_STARTER_DECK.every((id) => getCard(id)?.side === 'corp')).toBe(true);
  });

  it('getCard returns undefined for unknown ids', () => {
    expect(getCard('nope')).toBeUndefined();
  });
});
