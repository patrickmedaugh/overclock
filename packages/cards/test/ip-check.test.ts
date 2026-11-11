import { describe, expect, it } from 'vitest';
import { ALL_CARDS, type CardDef } from '../src/index';
import { BANNED_WORDS } from './banned-words';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word-boundary match that also works for terms ending in punctuation (e.g. "snare!"). */
function bannedPattern(word: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`, 'iu');
}

function findBanned(text: string): string[] {
  return BANNED_WORDS.filter((w) => bannedPattern(w).test(text));
}

function cardStrings(card: CardDef): string[] {
  return [card.id, card.name, card.text, card.flavor ?? '', card.art];
}

describe('IP check (CLAUDE.md rule 3)', () => {
  it('the checker catches banned words (positive control)', () => {
    expect(findBanned('A NetRunner tribute')).toEqual(['netrunner']);
    expect(findBanned('play Sure Gamble now')).toEqual(['sure gamble']);
    expect(findBanned('Snare! fires')).toEqual(['snare!']);
    expect(findBanned('Androids dream')).toEqual([]); // word boundary: no partial hits
  });

  it.each(ALL_CARDS.map((c) => [c.id, c] as const))(
    'card %s uses no banned names or words',
    (_id, card) => {
      const hits = cardStrings(card).flatMap(findBanned);
      expect(hits).toEqual([]);
    },
  );
});
