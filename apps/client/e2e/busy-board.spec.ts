// S-02-5 / S-02-6: the busy board (3 remote servers with 2 ICE each, 4
// Runner cards) fits sideways phones and desktop: nothing overlaps or sits
// under the notch / swipe bar, every server and card can be tapped and held,
// and the board uses the real game's words.
import { getCard } from '@overclock/cards';
import { type Page, expect, test } from '@playwright/test';
import type { InstalledSnapshot, Insets } from './helpers';
import { expectCleanLayout, expectCleanTable, layout, openBoard, pressAndHold, safeRect, tap, toBusyBoard } from './helpers';
import { typeLine } from '../src/terms';

const SHAPES: [string, Partial<Insets>][] = [
  ['no notch', {}],
  ['notch left + swipe bar', { left: 47, bottom: 21 }],
  ['notch right + swipe bar', { right: 47, bottom: 21 }],
];

async function holdAndRead(page: Page, c: InstalledSnapshot): Promise<void> {
  const release = await pressAndHold(page, c.box);
  await page.waitForFunction((id) => window.__overclock!.layout().zoom?.cardId === id, c.cardId);
  const z = (await layout(page)).zoom!;
  const def = getCard(c.cardId!)!;
  expect(z.texts).toContain(def.name);
  expect(z.texts).toContain(typeLine(def));
  await release();
  await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
}

for (const [name, insets] of SHAPES) {
  for (const side of ['corp', 'runner'] as const) {
    test(`busy board, ${name}, ${side} at the bottom: inside the safe area, nothing overlapping, targets at least 44px`, async ({ page }) => {
      await openBoard(page, { seed: 3, insets });
      await toBusyBoard(page, { seed: 3, side });
      const l = await layout(page);
      const remotes = l.servers.filter((s) => s.id.startsWith('remote'));
      expect(remotes.length).toBeGreaterThanOrEqual(3);
      for (const s of remotes.slice(0, 3)) expect(s.ice.length).toBeGreaterThanOrEqual(2);
      expect(l.rig.length).toBeGreaterThanOrEqual(4);
      expectCleanLayout(l);
      expectCleanTable(l);
      const safe = safeRect(l);
      for (const s of l.servers) {
        const inside = s.box.x >= safe.x && s.box.x + s.box.width <= safe.x + safe.width;
        expect(inside, `${s.label} column inside the safe area`).toBe(true);
      }
    });
  }
}

test('busy board, Corp at the bottom: every installed card can be held to read it (Corp cards face up to their owner)', async ({ page }) => {
  await openBoard(page, 3);
  await toBusyBoard(page, { seed: 3, side: 'corp' });
  const l = await layout(page);
  const cards = [...l.servers.flatMap((s) => [...s.ice, ...s.content]), ...l.rig];
  expect(cards.length).toBeGreaterThanOrEqual(6 + 4);
  for (const c of cards) {
    expect(c.cardId, `${c.uid} known to the Corp`).not.toBeNull();
    await holdAndRead(page, c);
  }
});

test('busy board, Runner at the bottom: rig cards can be held to read; every server card answers a tap but stays a card back', async ({ page }) => {
  await openBoard(page, 3);
  await toBusyBoard(page, { seed: 3, side: 'runner' });
  const l = await layout(page);
  for (const c of l.rig) await holdAndRead(page, c);
  const corpCards = l.servers.flatMap((s) => [...s.ice, ...s.content]);
  for (const c of corpCards) {
    expect(c.cardId).toBeNull();
    expect(c.faceUp).toBe(false);
    // The tap reaches the card (the game's input handler takes it), and nothing changes.
    const before = await page.evaluate(() => window.__overclock!.lastInput()?.handledAt ?? 0);
    await tap(page, c.box);
    await page.waitForFunction((t) => (window.__overclock!.lastInput()?.handledAt ?? 0) > t, before);
  }
  expect((await layout(page)).zoom).toBeNull();
});

test('real words on the board: HQ, R&D, Archives, Server N, Stack, Heap, Memory', async ({ page }) => {
  await openBoard(page, 3);
  await toBusyBoard(page, { seed: 3, side: 'runner' });
  const l = await layout(page);
  expect(l.servers.map((s) => s.label).slice(0, 6)).toEqual(['HQ', 'R&D', 'Archives', 'Server 1', 'Server 2', 'Server 3']);
  expect(l.memory.text).toMatch(/^Memory \d\/4$/);
  // What is actually drawn on the table (server names, pile names, memory).
  for (const word of ['HQ', 'R&D', 'Archives', 'Server 1', 'Server 2', 'Server 3']) expect(l.tableTexts).toContain(word);
  // Sideways phones name the Runner's piles over them (desktop keeps the Sprint 1 rows, unnamed piles).
  if (l.mode === 'landscape') for (const word of ['Stack', 'Heap']) expect(l.tableTexts).toContain(word);
  expect(l.tableTexts).toContain(l.memory.text);
});
