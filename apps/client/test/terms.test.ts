// S-02-5: board labels, card types and the glossary use the real game's
// words, the same everywhere. Every term the board shows is in the glossary.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_CARDS } from '@overclock/cards';
import { describe, expect, it } from 'vitest';
import { SIDE_LABEL, TERMS, TYPE_LABEL, memoryText, pileLabel, priceText, serverLabel, typeLine } from '../src/terms';

const glossary = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'GLOSSARY.md'), 'utf8');
const lower = glossary.toLowerCase();

describe('terms', () => {
  it.each(Object.entries(TERMS))('%s (%s) is in the glossary', (_k, term) => {
    expect(lower).toContain(term.toLowerCase());
  });

  it.each(Object.entries(TYPE_LABEL))('card type %s (%s) is in the glossary', (_k, label) => {
    expect(lower).toContain(label.toLowerCase());
  });

  it.each(Object.values(SIDE_LABEL))('side %s is in the glossary', (side) => {
    expect(glossary).toContain(`**${side}**`);
  });

  it('the real words for servers and piles: ICE, HQ, R&D, Archives, Server N, Stack, Heap', () => {
    expect(serverLabel('hq')).toBe('HQ');
    expect(serverLabel('rd')).toBe('R&D');
    expect(serverLabel('archives')).toBe('Archives');
    expect(serverLabel('remote1')).toBe('Server 1');
    expect(serverLabel('remote12')).toBe('Server 12');
    expect(serverLabel('new')).toBe('New server');
    expect(pileLabel('corp', 'deck')).toBe('R&D');
    expect(pileLabel('corp', 'discard')).toBe('Archives');
    expect(pileLabel('runner', 'deck')).toBe('Stack');
    expect(pileLabel('runner', 'discard')).toBe('Heap');
    // The glossary spells remote servers the same way.
    expect(glossary).toContain('Server 1, Server 2');
    expect(glossary).toContain('**ICE**');
    for (const t of ['HQ', 'R&D', 'Archives', 'Stack', 'Heap', 'Grip', 'Memory']) expect(glossary).toContain(`**${t}**`);
  });

  it('prices and memory read as plain words', () => {
    expect(priceText(0)).toBe('free');
    expect(priceText(1)).toBe('1 credit');
    expect(priceText(5)).toBe('5 credits');
    expect(memoryText(2, 4)).toBe('Memory 2/4');
  });

  it('every card in the pool shows a glossary card type', () => {
    for (const c of ALL_CARDS) {
      const base = typeLine(c).split(' · ')[0]!;
      expect(Object.values(TYPE_LABEL)).toContain(base);
    }
  });
});
