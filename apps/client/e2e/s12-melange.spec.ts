// Sprint 12 (U1, S-12-6): Melange Mining Corp.'s cost "Click, click, click:" reads as the click
// symbol with "×3": on the table (both seats), in the hand and zoomed (hand view and long-press).
// Its button reads "Gain 7 credits · 3 clicks". Core (30-card) decks, named on the page.
// 640x360 and 891x296 screenshots go to docs/sprints/sprint-12-screens/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCard } from '@overclock/cards';
import { LocalMatch } from '@overclock/match';
import { type Page, expect, test } from '@playwright/test';
import type { Box, ClickCostSnapshot, InstalledSnapshot, LayoutSnapshot } from '../src/hook-types';
import { pixelStats } from './pixels';
import { getView, inside, layout, measureTap, openBoard, openHand, overlaps, passTurn, pressAndHold, tap, targetOf, toStep, waitIdle } from './helpers';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-12-screens');
const MELANGE = 'c15';
const SEED = 1;

async function shot(page: Page, name: string): Promise<void> {
  const p = test.info().project.name;
  const save = p === 'phone-small' || p === 'phone-short';
  if (save) mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot(save ? { path: join(SHOTS, `${name}-${p === 'phone-small' ? '640x360' : '891x296'}.png`) } : {});
  await test.info().attach(name, { body, contentType: 'image/png' });
}

function installedIn(l: LayoutSnapshot, uid: string): InstalledSnapshot {
  const c = [...l.servers.flatMap((s) => [...s.ice, ...s.content]), ...l.rig].find((x) => x.uid === uid);
  if (!c) throw new Error(`no installed card ${uid}`);
  return c;
}

/** A card-local box (centered at 0,0) of a card drawn at `card` (screen box, unrotated). */
function onScreen(card: Box, r: Box): Box {
  return { x: card.x + card.width / 2 + r.x, y: card.y + card.height / 2 + r.y, width: r.width, height: r.height };
}

/** The first seed whose core-deck Corp opens with Melange in HQ, and its hand index. */
function seedWithMelangeInHand(): { seed: number; index: number } {
  for (let seed = 1; seed < 200; seed++) {
    const index = new LocalMatch(seed, { deckSet: 'core' }).view('corp').players.corp.hand!.indexOf(MELANGE);
    if (index >= 0) return { seed, index };
  }
  throw new Error('no seed with Melange in the opening hand');
}

/** The "×3" chip draws something readable: light marks (symbol and digits) on its dark pill. */
async function expectChipDrawn(page: Page, chip: Box, what: string): Promise<void> {
  const [px] = await pixelStats(page, [chip]);
  expect(px!.brightFrac, `${what}: light symbol and "×3" on the chip`).toBeGreaterThan(0.08);
  expect(px!.spread, `${what}: not a flat patch`).toBeGreaterThan(25);
}

/** The zoomed face shows the symbol and "×3", and never the words "Click, click, click". */
function expectZoomSymbol(texts: string[], cost: ClickCostSnapshot | null, overflow: boolean, what: string): void {
  expect(cost, `${what}: click symbol drawn`).not.toBeNull();
  expect(cost).toMatchObject({ count: 3, text: '×3' });
  expect(cost!.icon.width, `${what}: symbol size`).toBeGreaterThanOrEqual(10);
  expect(cost!.fontPx, `${what}: "×3" size`).toBeGreaterThanOrEqual(12);
  expect(texts, `${what}: rules line`).toContain('×3: Gain 7 credits.');
  for (const t of texts) expect(t.toLowerCase(), `${what}: no "click" words`).not.toContain('click');
  expect(overflow, `${what}: no text off the card`).toBe(false);
}

test.describe('S-12-6 Melange Mining Corp. shows "Click ×3"', () => {
  test('on the table (Corp and Runner seats) and zoomed: the click symbol with "×3"; its button reads "Gain 7 credits · 3 clicks"', async ({ page }) => {
    await openBoard(page, { seed: SEED, decks: 'core' });
    const plan = await toStep(page, SEED, 'corp_melange');
    const uid = plan.info['uid']!;
    let l = await waitIdle(page);
    let card = installedIn(l, uid);
    expect(card).toMatchObject({ cardId: MELANGE, faceUp: true });
    // The chip: inside the card, clear of its name, type label and cost bubble, big enough to read.
    const chip = card.face!.clickCost;
    expect(chip, 'table: click-symbol chip').not.toBeNull();
    expect(inside(chip!, card.box), 'chip inside the card').toBe(true);
    for (const part of ['name', 'type', 'cost'] as const) expect(overlaps(chip!, card.face![part]), `chip clear of the ${part}`).toBe(false);
    expect(chip!.height, 'chip readable height').toBeGreaterThanOrEqual(9);
    const local = await page.evaluate(([id, w, h]) => window.__overclock!.smallFace(id as string, w as number, h as number), [MELANGE, card.box.width, card.box.height] as const);
    expect(local!.clickCost).toMatchObject({ count: 3, text: '×3' });
    expect(local!.clickCost!.fontPx, '"×3" text size on the table').toBeGreaterThanOrEqual(7);
    await expectChipDrawn(page, chip!, 'table, Corp');
    await shot(page, 's12-6-melange-table-corp');

    // Tapping it: the button, a thumb-size target, then it gives 7 for all 3 clicks.
    await tap(page, card.box);
    await page.waitForFunction((u) => window.__overclock!.layout().selectedInstalled === u, uid);
    l = await layout(page);
    const use = targetOf(l, 'activate');
    expect(use).toMatchObject({ label: 'Gain 7 credits · 3 clicks', lit: true });
    expect(Math.min(use.box.width, use.box.height)).toBeGreaterThanOrEqual(44);
    await shot(page, 's12-6-melange-button');
    const before = await getView(page);
    const m = await measureTap(page, use.box);
    expect(m.view.players.corp.credits).toBe(before.players.corp.credits + 7);
    expect(m.view.players.corp.clicks).toBe(0);

    // Long-press zoom: symbol and "×3" in the rules text.
    l = await waitIdle(page);
    card = installedIn(l, uid);
    const release = await pressAndHold(page, card.box);
    await page.waitForFunction((id) => window.__overclock!.layout().zoom?.cardId === id && !window.__overclock!.layout().animating, MELANGE);
    await page.waitForTimeout(250);
    l = await layout(page);
    const z = l.zoom!;
    expectZoomSymbol(z.texts, z.clickCost, z.textOverflow, 'long-press zoom');
    expect(z.texts).toContain(getCard(MELANGE)!.name);
    // The symbol is drawn on screen where the hook says (zoom box is the card's drawn bounds).
    const scale = z.box.width / (await page.evaluate(() => window.__overclock!.fullFace('c15')!.width));
    const icon = z.clickCost!.icon;
    const iconBox = { x: z.box.x + z.box.width / 2 + icon.x * scale, y: z.box.y + z.box.height / 2 + icon.y * scale, width: icon.width * scale, height: icon.height * scale };
    await expectChipDrawn(page, iconBox, 'zoom symbol');
    await shot(page, 's12-6-melange-zoom');
    await release();
    await page.waitForFunction(() => window.__overclock!.layout().zoom === null);

    // The Runner sees the same face on the Corp's table.
    await passTurn(page);
    l = await waitIdle(page);
    expect(l.viewer).toBe('runner');
    card = installedIn(l, uid);
    expect(card.cardId).toBe(MELANGE);
    expect(card.face!.clickCost, 'table, Runner seat: chip').not.toBeNull();
    expect(inside(card.face!.clickCost!, card.box)).toBe(true);
    await expectChipDrawn(page, card.face!.clickCost!, 'table, Runner');
  });

  test('in the hand and in the hand view: the click symbol with "×3"', async ({ page }) => {
    const { seed, index } = seedWithMelangeInHand();
    await openBoard(page, { seed, decks: 'core' });
    let l = await waitIdle(page);
    expect(l.viewer).toBe('corp');
    expect(l.hand[index]!.cardId).toBe(MELANGE);
    const box = l.hand[index]!.box;
    const local = await page.evaluate(([id, w, h]) => window.__overclock!.smallFace(id as string, w as number, h as number), [MELANGE, box.width, box.height] as const);
    expect(local!.clickCost).toMatchObject({ count: 3, text: '×3' });
    const chip = onScreen(box, local!.clickCost!.box);
    expect(inside(chip, box)).toBe(true);
    // Not hidden under the next hand card.
    const next = l.hand[index + 1];
    if (next) expect(overlaps(chip, next.box), 'chip not under the next card').toBe(false);
    await expectChipDrawn(page, chip, 'hand');
    await shot(page, 's12-6-melange-hand');

    l = await openHand(page, index);
    expect(l.zoom?.cardId).toBe(MELANGE);
    await page.waitForFunction(() => !window.__overclock!.layout().animating);
    l = await layout(page);
    expectZoomSymbol(l.zoom!.texts, l.zoom!.clickCost, l.zoom!.textOverflow, 'hand view');
    await shot(page, 's12-6-melange-hand-view');
  });
});
