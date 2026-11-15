// Sprint 8 E1: the pinned interface (deck sets, identities in state and view, new fields).
import { CORP_CORE_DECK, RUNNER_CORE_DECK } from '@overclock/cards';
import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, IDENTITY_UID, RULES_VERSION, newGame as engineNewGame, maxHandSize, viewFor } from '../src/index';
import { newGame } from './helpers';

describe('Sprint 8 interface', () => {
  it('RULES_VERSION is 2; the default deck set is core', () => {
    expect(RULES_VERSION).toBe(2);
    expect(DEFAULT_OPTIONS).toEqual({ rezWindow: 'affordable', deckSet: 'core' });
    expect(engineNewGame(1).options).toEqual({ rezWindow: 'affordable', deckSet: 'core' });
    expect(engineNewGame(1, { deckSet: 'starter' }).options.deckSet).toBe('starter');
  });

  it('core games carry both identities (public, fixed uids); starter games have none', () => {
    const s = engineNewGame(3);
    expect(s.players.corp.identity).toBe(CORP_CORE_DECK.identity);
    expect(s.players.runner.identity).toBe(RUNNER_CORE_DECK.identity);
    for (const viewer of ['corp', 'runner'] as const) {
      const v = viewFor(viewer, s);
      expect(v.players.corp.identity).toEqual({ uid: IDENTITY_UID.corp, cardId: 'c13' });
      expect(v.players.runner.identity).toEqual({ uid: IDENTITY_UID.runner, cardId: 'r13' });
      expect(v.players.runner.maxHandSize).toBe(5);
      expect(v.players.runner.brainDamage).toBe(0);
    }
    const old = newGame(3);
    expect(old.players.corp.identity).toBeNull();
    expect(viewFor('runner', old).players.corp.identity).toBeNull();
  });

  it('new state fields start empty; installedThisTurn is never in a view', () => {
    const s = engineNewGame(5);
    for (const side of ['corp', 'runner'] as const) {
      expect(s.players[side].brainDamage).toBe(0);
      expect(s.players[side].installedThisTurn).toEqual([]);
      expect(maxHandSize(s, side)).toBe(5);
    }
    const marked = { ...s, players: { ...s.players, corp: { ...s.players.corp, installedThisTurn: ['agenda' as const] } } };
    for (const viewer of ['corp', 'runner'] as const) expect(JSON.stringify(viewFor(viewer, marked))).not.toMatch(/installedThisTurn/);
  });

  it('the deck set never changes for a seed: the same core deal every time', () => {
    expect(engineNewGame(12345)).toEqual(engineNewGame(12345));
    expect(engineNewGame(12345).players.corp.hand).not.toEqual(newGame(12345).players.corp.hand);
  });
});
