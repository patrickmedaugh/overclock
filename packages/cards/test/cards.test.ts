import { describe, expect, it } from 'vitest';
import {
  ALL_CARDS,
  CORP_CARDS,
  CORP_STARTER_DECK,
  RUNNER_CARDS,
  RUNNER_STARTER_DECK,
  getCard,
} from '../src/index';

describe('card pool', () => {
  it('has 12 cards per side', () => {
    expect(RUNNER_CARDS).toHaveLength(12);
    expect(CORP_CARDS).toHaveLength(12);
  });

  it('every card id is unique across both sides', () => {
    const ids = ALL_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every card name is unique', () => {
    const names = ALL_CARDS.map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('cards are on the side whose list they are in', () => {
    expect(RUNNER_CARDS.every((c) => c.side === 'runner')).toBe(true);
    expect(CORP_CARDS.every((c) => c.side === 'corp')).toBe(true);
  });

  it('covers the pool: economy, draw, three ICE types, matching breakers, agendas, an asset, an upgrade, damage', () => {
    const iceTypes = new Set(CORP_CARDS.filter((c) => c.type === 'ice').map((c) => c.subtype));
    expect(iceTypes).toEqual(new Set(['barrier', 'code_gate', 'sentry']));
    const breakers = new Set(RUNNER_CARDS.filter((c) => c.type === 'program' && c.subtype).map((c) => c.subtype));
    expect(breakers).toEqual(new Set(['breaker_barrier', 'breaker_code_gate', 'breaker_sentry']));
    const agendas = CORP_CARDS.filter((c) => c.type === 'agenda');
    expect(agendas.length).toBeGreaterThanOrEqual(2);
    expect(agendas.length).toBeLessThanOrEqual(3);
    expect(CORP_CARDS.some((c) => c.type === 'asset')).toBe(true);
    expect(CORP_CARDS.some((c) => c.type === 'upgrade')).toBe(true);
    expect(CORP_CARDS.some((c) => /net damage/i.test(c.text))).toBe(true);
    for (const type of ['program', 'hardware', 'resource', 'event'] as const) {
      expect(RUNNER_CARDS.some((c) => c.type === type), type).toBe(true);
    }
    for (const cards of [RUNNER_CARDS, CORP_CARDS]) {
      expect(cards.some((c) => /gain \d+ credits/i.test(c.text))).toBe(true);
      expect(cards.some((c) => /draw \d+ cards/i.test(c.text))).toBe(true);
    }
  });

  it('S-02-4: Hedge Fund, Anonymous Tip, Easy Mark and Diesel are in the pool with their effects as data', () => {
    const byName = (n: string) => ALL_CARDS.find((c) => c.name === n);
    expect(byName('Hedge Fund')).toMatchObject({ side: 'corp', type: 'operation', cost: 5, onPlay: [{ op: 'gain_credits', amount: 9 }] });
    expect(byName('Anonymous Tip')).toMatchObject({ side: 'corp', type: 'operation', cost: 0, onPlay: [{ op: 'draw', count: 3 }] });
    expect(byName('Easy Mark')).toMatchObject({ side: 'runner', type: 'event', cost: 0, onPlay: [{ op: 'gain_credits', amount: 3 }] });
    expect(byName('Diesel')).toMatchObject({ side: 'runner', type: 'event', cost: 0, onPlay: [{ op: 'draw', count: 3 }] });
  });

  it('effects (onPlay) are only on operations/events; every operation/event either has effects or needs runs', () => {
    for (const c of ALL_CARDS) {
      const playable = c.type === 'operation' || c.type === 'event';
      if (!playable) expect(c.onPlay, c.id).toBeUndefined();
      else expect(c.onPlay !== undefined || c.needs === 'runs', c.id).toBe(true);
    }
    expect(ALL_CARDS.filter((c) => c.needs === 'runs').length).toBeGreaterThanOrEqual(2);
  });

  it('programs have memory; ICE and breakers have strength; agendas have requirement and points', () => {
    for (const c of ALL_CARDS) {
      if (c.type === 'program') expect(c.memory, c.id).toBeGreaterThan(0);
      if (c.type === 'ice' || c.subtype?.startsWith('breaker_')) expect(typeof c.strength, c.id).toBe('number');
      if (c.type === 'agenda') {
        expect(c.advancementRequirement, c.id).toBeGreaterThan(0);
        expect(c.agendaPoints, c.id).toBeGreaterThan(0);
      }
    }
  });

  it('text spells symbols as words (no [credit]/[click]-style tokens)', () => {
    for (const c of ALL_CARDS) expect(c.text, c.id).not.toMatch(/\[|\]|\{|\}/);
  });

  it('the Corp deck has at least 6 ICE (busy board: 3 servers x 2 ICE)', () => {
    expect(CORP_STARTER_DECK.filter((id) => getCard(id)?.type === 'ice').length).toBeGreaterThanOrEqual(6);
  });

  it('the Runner deck can fill memory (programs in the deck need more than 4 memory in total)', () => {
    const mem = RUNNER_STARTER_DECK.reduce((sum, id) => sum + (getCard(id)?.memory ?? 0), 0);
    expect(mem).toBeGreaterThan(4);
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
