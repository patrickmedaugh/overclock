// S-02-5 AC4: the starter decks are real Core Set cards; the 24 invented cards
// they replaced (Sprint 0/1 placeholders) are gone from the card data, the
// client source and the glossary.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_CARDS, CORP_STARTER_DECK, RUNNER_STARTER_DECK, getCard } from '../src/index';

const RETIRED_NAMES: readonly string[] = [
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

describe('no invented card names left (S-02-5 AC4)', () => {
  it('lists all 24 retired names', () => {
    expect(new Set(RETIRED_NAMES).size).toBe(24);
  });

  it('positive control: the checker finds a retired name', () => {
    expect(retiredIn('play a wallgnaw now')).toEqual(['Wallgnaw']);
  });

  it('no card in the pool uses a retired name or mentions one in its text', () => {
    const hits = ALL_CARDS.flatMap((c) => retiredIn(`${c.name}\n${c.text}\n${c.flavor ?? ''}`).map((n) => `${c.id}: ${n}`));
    expect(hits).toEqual([]);
  });

  it('every starter deck card is a pool card (so a real one)', () => {
    for (const id of [...CORP_STARTER_DECK, ...RUNNER_STARTER_DECK]) expect(getCard(id), id).toBeDefined();
  });

  it('client source, page and glossary contain no retired name', () => {
    const files = [
      ...walk(join(repoRoot, 'apps', 'client', 'src')),
      join(repoRoot, 'apps', 'client', 'index.html'),
      join(repoRoot, 'docs', 'GLOSSARY.md'),
    ];
    const hits = files.flatMap((f) => retiredIn(readFileSync(f, 'utf8')).map((n) => `${relative(repoRoot, f)}: ${n}`));
    expect(hits).toEqual([]);
  });
});
