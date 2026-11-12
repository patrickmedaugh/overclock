// S-02-5 AC4: the starter decks are real core-set cards; our 24 invented
// Sprint 0 cards are gone from the card data, the client and the glossary.
// (The swap list is in docs/sprints/sprint-02-card-swaps.md.)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_CARDS, CORP_STARTER_DECK, RUNNER_STARTER_DECK, getCard } from '../src/index';

/** The invented cards retired in Sprint 2. Never shrink this list. */
const RETIRED_NAMES: readonly string[] = [
  // Corp
  'Quarterly Windfall',
  'Synergy Memo',
  'Kiosk Mesh',
  'Rampart Lattice',
  'Static Palisade',
  'Cipher Turnstile',
  'Lantern Drone',
  'Silent Merger',
  'Skyline Rezoning',
  'Mindshare Patent',
  'Vault Warden',
  'Feedback Spike',
  // Runner
  'Overtime Hustle',
  'Back-Alley Fence',
  'Cache Dive',
  'Wallgnaw',
  'Lockwhisper',
  'Watchdog Muzzle',
  'Pinhole Probe',
  'Chrome Lung',
  'Coolant Halo',
  'Rooftop Medic',
  'Signal Jam',
  'Burner Persona',
];

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function retiredIn(text: string): string[] {
  const lower = text.toLowerCase();
  return RETIRED_NAMES.filter((n) => lower.includes(n.toLowerCase()));
}

describe('no invented cards are left (S-02-5 AC4)', () => {
  it('the checker finds a retired name (positive control)', () => {
    expect(retiredIn('play cache dive now')).toEqual(['Cache Dive']);
    expect(retiredIn('Hedge Fund')).toEqual([]);
  });

  it('lists all 24 retired cards', () => {
    expect(RETIRED_NAMES).toHaveLength(24);
  });

  it('no card name, text or flavor uses a retired name', () => {
    const hits = ALL_CARDS.flatMap((c) =>
      retiredIn([c.name, c.text, c.flavor ?? ''].join('\n')).map((n) => `${c.id}: ${n}`),
    );
    expect(hits).toEqual([]);
  });

  it('every starter-deck card is a known card (real core-set data)', () => {
    for (const id of [...CORP_STARTER_DECK, ...RUNNER_STARTER_DECK]) expect(getCard(id), id).toBeDefined();
  });

  it('the client source and the glossary do not mention a retired card', () => {
    const files = [
      ...walk(join(repoRoot, 'apps', 'client', 'src')),
      join(repoRoot, 'apps', 'client', 'index.html'),
      join(repoRoot, 'docs', 'GLOSSARY.md'),
    ];
    const hits = files.flatMap((f) => retiredIn(readFileSync(f, 'utf8')).map((n) => `${relative(repoRoot, f)}: ${n}`));
    expect(hits).toEqual([]);
  });
});
