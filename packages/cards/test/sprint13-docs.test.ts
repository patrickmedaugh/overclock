// Sprint 13 E4: the owner-facing deck-building words exist and say the same numbers the code checks.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { IDENTITIES, MAX_COPIES, deckPool, deckStatus, getCard } from '../src/index';

const docs = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs');
const spec = readFileSync(join(docs, 'RULES_SPEC.md'), 'utf8');
const glossary = readFileSync(join(docs, 'GLOSSARY.md'), 'utf8');
const entries = new Map([...glossary.matchAll(/^- \*\*(.+?)\*\* — (.+)$/gm)].map((m) => [m[1]!, m[2]!]));

describe('S-13 docs: RULES_SPEC "Deck building (Sprint 13)"', () => {
  const section = spec.slice(spec.indexOf('## Deck building (Sprint 13)'), spec.indexOf('\n## ', spec.indexOf('## Deck building (Sprint 13)') + 5));

  it('exists', () => {
    expect(spec).toContain('## Deck building (Sprint 13)');
    expect(section.length).toBeGreaterThan(500);
  });

  it('states the numbers the code checks (pool sizes, 45 cards, 3 copies, 15 influence, 20–21 points for 45)', () => {
    expect(section).toContain(`Corp ${deckPool('corp').flatMap((g) => g.cards).length} cards, Runner ${deckPool('runner').flatMap((g) => g.cards).length}`);
    for (const side of ['corp', 'runner'] as const) {
      const id = getCard(IDENTITIES[side])!;
      expect(section).toContain(`**${id.minDeckSize} cards**`);
      expect(section).toContain(`**${id.influenceLimit}**`);
    }
    expect(section).toContain(`at most **${MAX_COPIES}**`);
    const r45 = deckStatus({ identity: IDENTITIES.corp, cards: Array.from({ length: 45 }, () => 'c01') }).agendaRange!;
    const r50 = deckStatus({ identity: IDENTITIES.corp, cards: Array.from({ length: 50 }, () => 'c01') }).agendaRange!;
    expect(section).toContain(`45–49 cards need ${r45.min}–${r45.max}`);
    expect(section).toContain(`50–54 cards need ${r50.min}–${r50.max}`);
    expect(section).toContain('Hostile Takeover');
  });
});

describe('S-13 docs: GLOSSARY words in plain language', () => {
  it.each(['Identity', 'Influence', 'Agenda points', 'Ready to play'])('"%s" has its own entry', (word) => {
    const text = entries.get(word);
    expect(text, word).toBeDefined();
    expect(text!.length).toBeGreaterThan(60);
  });
});
