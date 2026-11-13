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
    expect(CORP_CARDS.some((c) => /\bdo \d+ net damage/i.test(c.text))).toBe(true);
    for (const cards of [RUNNER_CARDS, CORP_CARDS]) {
      expect(cards.some((c) => /^gain \d+ credits\.$/i.test(c.text))).toBe(true);
      expect(cards.some((c) => /^draw \d+ cards\.$/i.test(c.text))).toBe(true);
    }
  });

  it('S-02-4: Hedge Fund, Anonymous Tip, Easy Mark and Diesel are in the pool with their official stats', () => {
    const byName = (n: string) => ALL_CARDS.find((c) => c.name === n);
    expect(byName('Hedge Fund')).toMatchObject({ side: 'corp', type: 'operation', cost: 5, text: 'Gain 9 credits.', onPlay: [{ op: 'gain_credits', amount: 9 }] });
    expect(byName('Anonymous Tip')).toMatchObject({ side: 'corp', type: 'operation', cost: 0, text: 'Draw 3 cards.', onPlay: [{ op: 'draw', count: 3 }] });
    expect(byName('Easy Mark')).toMatchObject({ side: 'runner', type: 'event', cost: 0, text: 'Gain 3 credits.', onPlay: [{ op: 'gain_credits', amount: 3 }] });
    expect(byName('Diesel')).toMatchObject({ side: 'runner', type: 'event', cost: 0, text: 'Draw 3 cards.', onPlay: [{ op: 'draw', count: 3 }] });
  });

  it('effect DSL: only operations/events have onPlay/playIf/needs, and every one has onPlay', () => {
    for (const c of ALL_CARDS) {
      const playable = c.type === 'operation' || c.type === 'event';
      if (!playable) {
        expect(c.onPlay, c.id).toBeUndefined();
        expect(c.playIf, c.id).toBeUndefined();
      } else {
        expect(c.onPlay?.length, c.id).toBeGreaterThan(0);
      }
    }
  });

  it('S-03-5 AC4: no card needs an unbuilt system any more ("Needs runs" is gone)', () => {
    for (const c of ALL_CARDS) expect(c.needs, c.id).toBeUndefined();
  });

  it('a run effect is always the last effect of a card', () => {
    for (const c of ALL_CARDS) {
      const effects = c.onPlay ?? [];
      effects.forEach((e, i) => {
        if (e.op === 'run') expect(i, c.id).toBe(effects.length - 1);
      });
    }
  });

  it('every ICE has subroutines; only ICE has them', () => {
    for (const c of ALL_CARDS) {
      if (c.type === 'ice') expect(c.subroutines?.length, c.id).toBeGreaterThan(0);
      else expect(c.subroutines, c.id).toBeUndefined();
    }
  });

  it('every icebreaker has a break ability for its own ICE type (and a strength ability); only breakers have abilities', () => {
    for (const c of ALL_CARDS) {
      if (c.subtype?.startsWith('breaker_')) {
        const iceType = c.subtype.slice('breaker_'.length);
        expect(c.abilities?.some((a) => a.op === 'break' && a.iceType === iceType), c.id).toBe(true);
        expect(c.abilities?.some((a) => a.op === 'strength'), c.id).toBe(true);
        expect(c.strength, c.id).toBeTypeOf('number');
      } else {
        expect(c.abilities, c.id).toBeUndefined();
      }
    }
  });

  it('Sprint 3 numbers (architect-checked, DECISIONS 2026-11-12): breakers, ICE and run cards', () => {
    const byName = (n: string) => ALL_CARDS.find((c) => c.name === n);
    expect(byName('Corroder')).toMatchObject({ cost: 2, memory: 1, strength: 2, abilities: [
      { op: 'break', cost: 1, iceType: 'barrier', count: 1 }, { op: 'strength', cost: 1, amount: 1, until: 'encounter' }] });
    expect(byName('Gordian Blade')).toMatchObject({ cost: 4, memory: 1, strength: 2, abilities: [
      { op: 'break', cost: 1, iceType: 'code_gate', count: 1 }, { op: 'strength', cost: 1, amount: 1, until: 'run' }] });
    expect(byName('Ninja')).toMatchObject({ cost: 4, memory: 1, strength: 0, abilities: [
      { op: 'break', cost: 1, iceType: 'sentry', count: 1 }, { op: 'strength', cost: 3, amount: 5, until: 'encounter' }] });
    expect(byName('Wall of Static')).toMatchObject({ cost: 3, strength: 3, subroutines: [{ effect: { op: 'end_run' } }] });
    expect(byName('Ice Wall')).toMatchObject({ cost: 1, strength: 1, subroutines: [{ effect: { op: 'end_run' } }] });
    expect(byName('Enigma')).toMatchObject({ cost: 3, strength: 2, subroutines: [
      { effect: { op: 'lose_clicks', amount: 1 } }, { effect: { op: 'end_run' } }] });
    expect(byName('Neural Katana')).toMatchObject({ cost: 4, strength: 3, subroutines: [{ effect: { op: 'net_damage', amount: 3 } }] });
    expect(byName("The Maker's Eye")).toMatchObject({ cost: 2, onPlay: [{ op: 'run', server: 'rd', extraAccess: 2 }] });
    expect(byName('Inside Job')).toMatchObject({ cost: 2, onPlay: [{ op: 'run', bypassFirst: true }] });
    expect(byName('Inside Job')?.onPlay?.[0]).not.toHaveProperty('server');
    expect(byName('Neural EMP')).toMatchObject({ cost: 2, playIf: 'runner_ran_last_turn', onPlay: [{ op: 'net_damage', amount: 1 }] });
  });

  it('programs have memory; symbols are spelled as words (no [credit]/[click] tokens)', () => {
    for (const c of ALL_CARDS) {
      if (c.type === 'program') expect(c.memory, c.id).toBeGreaterThan(0);
      expect(c.text, c.id).not.toMatch(/[[\]{}]/);
    }
  });

  it('starter decks: Runner 15 cards, Corp 17 (Sprint 3: +1 Hostile Takeover, +1 Private Security Force), each of its own side', () => {
    expect(RUNNER_STARTER_DECK).toHaveLength(15);
    expect(CORP_STARTER_DECK).toHaveLength(17);
    expect(RUNNER_STARTER_DECK.every((id) => getCard(id)?.side === 'runner')).toBe(true);
    expect(CORP_STARTER_DECK.every((id) => getCard(id)?.side === 'corp')).toBe(true);
    expect(CORP_STARTER_DECK.filter((id) => id === 'c08')).toHaveLength(2);
    expect(CORP_STARTER_DECK.filter((id) => id === 'c09')).toHaveLength(2);
  });

  it('S-03-2: the Corp deck holds at least 7 agenda points (9), so a points win is possible for either side', () => {
    const points = CORP_STARTER_DECK.reduce((sum, id) => sum + (getCard(id)?.agendaPoints ?? 0), 0);
    expect(points).toBeGreaterThanOrEqual(7);
    expect(points).toBe(9);
  });

  it('getCard returns undefined for unknown ids', () => {
    expect(getCard('nope')).toBeUndefined();
  });
});
