// QA (Sprint 0, S-00-4 AC4): "all placeholder names and art are original".
// The card-data IP check covers names/text/flavor. This adds the two gaps:
//  1. Art: every card's art is a key for runtime-generated glyphs, and the
//     client ships no image/font files that could be copied official art.
//  2. On-screen words: the client's own UI strings and page title contain no
//     banned names or trademarks.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../src/index';
import { BANNED_WORDS } from './banned-words';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const clientDir = join(repoRoot, 'apps', 'client');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function bannedIn(text: string): string[] {
  return BANNED_WORDS.filter((w) => {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'iu').test(text);
  });
}

describe('IP check: art and on-screen text (QA)', () => {
  it('every card uses a generated glyph key for art, not an image file or URL', () => {
    for (const c of ALL_CARDS) {
      expect(c.art, c.id).toMatch(/^glyph:[a-z0-9-]+$/);
    }
  });

  it('every card has its own art key (no two cards share a picture)', () => {
    const keys = ALL_CARDS.map((c) => c.art);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('the client ships no raster images or fonts (all art is drawn at runtime)', () => {
    const binaryExt = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.ttf', '.otf', '.woff', '.woff2']);
    const files = [...walk(join(clientDir, 'src')), ...walk(join(clientDir, 'public'))];
    const offenders = files.filter((f) => binaryExt.has(extname(f).toLowerCase())).map((f) => relative(repoRoot, f));
    expect(offenders).toEqual([]);
    // The only vector asset is our own favicon, drawn from basic shapes.
    const svgs = files.filter((f) => extname(f).toLowerCase() === '.svg');
    for (const f of svgs) {
      const svg = readFileSync(f, 'utf8');
      expect(svg, f).not.toMatch(/<image|href=|<text/i);
    }
  });

  it('client UI text and page title contain no banned names or trademarks', () => {
    const files = [...walk(join(clientDir, 'src')), join(clientDir, 'index.html'), ...walk(join(clientDir, 'public'))];
    const hits = files.flatMap((f) => bannedIn(readFileSync(f, 'utf8')).map((w) => `${relative(repoRoot, f)}: ${w}`));
    expect(hits).toEqual([]);
  });
});
