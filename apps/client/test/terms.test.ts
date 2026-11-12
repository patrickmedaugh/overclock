// S-02-5 AC3: the words on screen are the real game's words, the same as the glossary.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TERMS, priceText, serverLabel, zoneName } from '../src/terms';

const glossary = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'GLOSSARY.md'), 'utf8');
const entries = [...glossary.matchAll(/^- \*\*(.+?)\*\*/gm)].map((m) => m[1]!.toLowerCase());

describe('terms.ts and the glossary say the same thing', () => {
  it.each(Object.entries(TERMS))('%s = "%s" appears in docs/GLOSSARY.md', (_key, term) => {
    expect(glossary.toLowerCase()).toContain(term.toLowerCase());
  });

  it.each(['ICE', 'HQ', 'R&D', 'Archives', 'Remote server', 'Grip', 'Stack', 'Heap', 'Memory', 'Install', 'Click', 'Credits', 'Corp', 'Runner'])(
    '"%s" has its own glossary entry',
    (word) => {
      expect(entries.some((e) => e.split(/\s*\/\s*/).includes(word.toLowerCase()))).toBe(true);
    },
  );

  it('server names: the built-in three, then Server 1, Server 2, ... (as the glossary says)', () => {
    expect(['hq', 'rd', 'archives', 'remote1', 'remote2', 'remote12'].map((id) => serverLabel(id as never))).toEqual([
      'HQ',
      'R&D',
      'Archives',
      'Server 1',
      'Server 2',
      'Server 12',
    ]);
    expect(serverLabel('new')).toBe('New server');
    expect(glossary).toContain('Server 1, Server 2');
  });

  it('each side names its hand, deck and discard pile with the real words', () => {
    expect((['hand', 'deck', 'discard'] as const).map((z) => zoneName('corp', z))).toEqual(['HQ', 'R&D', 'Archives']);
    expect((['hand', 'deck', 'discard'] as const).map((z) => zoneName('runner', z))).toEqual(['Grip', 'Stack', 'Heap']);
  });

  it('prices read "free", "1 credit", "3 credits"', () => {
    expect([0, 1, 3].map(priceText)).toEqual(['free', '1 credit', '3 credits']);
  });
});
