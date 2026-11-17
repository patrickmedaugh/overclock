// Sprint 11 (U4, S-11-4): the numbers at the bottom of a card (strength, memory,
// advancements, points, trash cost) always show in full. The stat line uses the UI font
// and wraps "Label N" pairs to another line instead of clipping them. Sweeps every card
// of both decks at this project's zoom size (844x390, 640x360, 891x296, desktop), plus a
// real long-press on cards the owner saw clipped. The Android font itself can't be
// reproduced in Chromium: the demo notes ask the owner to check on the phone.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORP_CORE_DECK, CORP_STARTER_DECK, RUNNER_CORE_DECK, RUNNER_STARTER_DECK, getCard } from '@overclock/cards';
import { type Page, expect, test } from '@playwright/test';
import type { Box, FullFaceSnapshot } from '../src/hook-types';
import { layout, openBoard, pressAndHold, toStep, waitIdle } from './helpers';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-11-screens');

/** Every card in both decks (core and starter), identities included, once each. */
const CARDS = [...new Set([CORP_CORE_DECK.identity, ...CORP_CORE_DECK.cards, RUNNER_CORE_DECK.identity, ...RUNNER_CORE_DECK.cards, ...CORP_STARTER_DECK, ...RUNNER_STARTER_DECK])].filter((id) => getCard(id));

/** The "Label N" pairs a card has, from card data (full and short labels). */
function expectedStats(id: string): { full: string; short: string }[] {
  const c = getCard(id)!;
  const out: { full: string; short: string }[] = [];
  if (c.strength !== undefined) out.push({ full: `Strength ${c.strength}`, short: `Str ${c.strength}` });
  if (c.memory !== undefined) out.push({ full: `Memory ${c.memory}`, short: `MU ${c.memory}` });
  if (c.advancementRequirement !== undefined) out.push({ full: `Advance ${c.advancementRequirement}`, short: `Adv ${c.advancementRequirement}` });
  if (c.agendaPoints !== undefined) out.push({ full: `Points ${c.agendaPoints}`, short: `Pts ${c.agendaPoints}` });
  if (c.trashCost !== undefined) out.push({ full: `Trash ${c.trashCost}`, short: `Trash ${c.trashCost}` });
  return out;
}

const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Each stat shows label and number, inside the card with room to spare, at a readable size, apart. */
function expectStatsFit(id: string, f: FullFaceSnapshot, labels: 'full' | 'any', wholeCard = true): void {
  const want = expectedStats(id);
  const name = `${getCard(id)!.name} at ${Math.round(f.width)}x${Math.round(f.height)}`;
  if (wholeCard) expect(f.textOverflow, `${name}: no text runs off the card`).toBe(false);
  expect(f.stats.map((s) => s.text), `${name}: every stat`).toEqual(want.map((w) => (labels === 'full' ? w.full : expect.stringMatching(new RegExp(`^(${w.full}|${w.short})$`)))));
  for (const s of f.stats) {
    // Right padding: the number never touches the card's edge.
    expect(s.box.x, `${name} "${s.text}" left`).toBeGreaterThanOrEqual(-f.width / 2);
    expect(s.box.x + s.box.width, `${name} "${s.text}" right`).toBeLessThanOrEqual(f.width / 2 - 2);
    expect(s.box.y + s.box.height, `${name} "${s.text}" bottom`).toBeLessThanOrEqual(f.height / 2);
    expect(s.fontPx, `${name} "${s.text}" size`).toBeGreaterThanOrEqual(9);
  }
  for (let i = 0; i < f.stats.length; i++) for (let k = i + 1; k < f.stats.length; k++) expect(overlap(f.stats[i]!.box, f.stats[k]!.box), `${name}: "${f.stats[i]!.text}" vs "${f.stats[k]!.text}"`).toBe(false);
}

async function face(page: Page, id: string, w?: number, h?: number): Promise<FullFaceSnapshot> {
  const f = await page.evaluate(([cardId, width, height]) => window.__overclock!.fullFace(cardId as string, width as number | undefined, height as number | undefined), [id, w, h] as const);
  expect(f, id).not.toBeNull();
  return f!;
}

test.describe('S-11-4 card numbers readable', () => {
  test('every card of both decks, shown big at this screen size: each label and number fits', async ({ page }) => {
    await openBoard(page, { seed: 1, decks: 'core' });
    expect(CARDS.length).toBeGreaterThan(30);
    let withStats = 0;
    for (const id of CARDS) {
      const f = await face(page, id);
      if (expectedStats(id).length > 0) withStats++;
      expectStatsFit(id, f, 'full');
    }
    // Strength, memory, advancements, points, trash cost all appear somewhere.
    expect(withStats).toBeGreaterThan(20);
  });

  test('the cards the owner saw clipped (Wall of Static, Ichi 1.0, Corroder) at a smaller big size: wrapped or short, never cut', async ({ page }) => {
    await openBoard(page, { seed: 1, decks: 'core' });
    // The access view draws full faces down to 120 px wide (runDisplay: smaller ones are small faces).
    // Only the stats are checked here: a long rules text (Adonis Campaign) can run past a
    // 120 px face; that is older and logged as a follow-up, not part of S-11-4.
    for (const id of CARDS) expectStatsFit(id, await face(page, id, 120, 168), 'any', false);
    for (const id of ['c04', 'c21', 'r04']) expect((await face(page, id)).stats.length, id).toBeGreaterThan(0);
  });

  test('a real long-press on installed Ice Wall and Battering Ram: their numbers show in the zoom', async ({ page }) => {
    // Engine-dev's planner goal `ice_wall_ram_gordian`: Ice Wall rezzed, Battering Ram and Gordian Blade installed.
    await openBoard(page, { seed: 1, decks: 'core' });
    const plan = await toStep(page, 1, 'ice_wall_ram_gordian');
    let l = await waitIdle(page);
    const wall = l.servers.flatMap((s) => s.ice).find((c) => c.uid === plan.info.iceUid)!;
    const ram = l.rig.find((c) => c.cardId === 'r17')!;
    for (const [c, id] of [[wall, 'c05'], [ram, 'r17']] as const) {
      const release = await pressAndHold(page, c.box);
      await page.waitForFunction((cid) => window.__overclock!.layout().zoom?.cardId === cid && !window.__overclock!.layout().animating, id);
      l = await layout(page);
      const z = l.zoom!;
      expect(z.stats.map((s) => s.text)).toEqual(expectedStats(id).map((s) => s.full));
      for (const s of z.stats) expect(z.texts).toContain(s.text);
      expect(z.textOverflow).toBe(false);
      if (id === 'r17') {
        // The sprint folder keeps 640x360 and 891x296 only; every size is attached to the report.
        const project = test.info().project.name;
        const keep = project === 'phone-small' || project === 'phone-short';
        if (keep) mkdirSync(SHOTS, { recursive: true });
        const body = await page.screenshot(keep ? { path: join(SHOTS, `s11-4-zoom-battering-ram-${project}.png`) } : {});
        await test.info().attach('zoom-battering-ram', { body, contentType: 'image/png' });
      }
      await release();
      await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
    }
  });
});
