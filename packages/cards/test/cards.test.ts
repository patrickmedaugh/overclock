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
  it('has about 12 cards per side', () => {
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

  it('covers the v0 pool: economy, draw, three ICE types, matching breakers, agendas, an asset, damage', () => {
    const iceTypes = new Set(CORP_CARDS.filter((c) => c.type === 'ice').map((c) => c.subtype));
    expect(iceTypes).toEqual(new Set(['barrier', 'code_gate', 'sentry']));
    const breakers = new Set(RUNNER_CARDS.filter((c) => c.type === 'program').map((c) => c.subtype));
    expect(breakers).toEqual(new Set(['breaker_barrier', 'breaker_code_gate', 'breaker_sentry']));
    const agendas = CORP_CARDS.filter((c) => c.type === 'agenda');
    expect(agendas.length).toBeGreaterThanOrEqual(2);
    expect(agendas.length).toBeLessThanOrEqual(3);
    expect(CORP_CARDS.some((c) => c.type === 'asset')).toBe(true);
    expect(CORP_CARDS.some((c) => /net damage/i.test(c.text))).toBe(true);
    for (const cards of [RUNNER_CARDS, CORP_CARDS]) {
      expect(cards.some((c) => /gain \d+ credits/i.test(c.text))).toBe(true);
      expect(cards.some((c) => /draw \d+ cards/i.test(c.text))).toBe(true);
    }
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
