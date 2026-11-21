// Sprint 12 (U3, S-12-2): Archived Memories and Experiential Data.
// - Archived Memories: playing it opens a sheet of the Corp's own Archives over the table (face-down
//   cards shown to the Corp); a tap on a card puts it in HQ. With Archives empty it is dimmed and says
//   "Archives is empty".
// - Experiential Data: ICE in its server shows its raised strength on the board ("Str 3") and in the
//   run panel; a breaker must match it (the break is dimmed until pumped).
// 45-card decks (the default). 640x360 and 891x296 screenshots go to docs/sprints/sprint-12-screens/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCard } from '@overclock/cards';
import { type Page, expect, test } from '@playwright/test';
import type { InstalledSnapshot, LayoutSnapshot } from '../src/hook-types';
import { getView, inside, layout, openBoard, overlaps, passTurn, pickHand, safeRect, tap, targetOf, toStep, waitIdle } from './helpers';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-12-screens');

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

/** Plays Archived Memories (hand index `i`) the no-drag way; waits for the Archives sheet. */
async function playAm(page: Page, i: number): Promise<LayoutSnapshot> {
  const l = await pickHand(page, i);
  const play = targetOf(l, 'play');
  expect(play.lit).toBe(true);
  await tap(page, play.box);
  await page.waitForFunction(() => window.__overclock!.layout().sheet?.kind === 'archives');
  return waitIdle(page);
}

/** Every sheet card: thumb-size, on screen, inside the sheet, none overlapping. */
function expectSheetClean(l: LayoutSnapshot): void {
  const sheet = l.sheet!;
  const safe = safeRect(l);
  expect(inside(sheet.box, safe), 'sheet on screen').toBe(true);
  for (const c of sheet.cards) {
    expect(Math.min(c.box.width, c.box.height)).toBeGreaterThanOrEqual(44);
    expect(inside(c.box, sheet.box), `card ${JSON.stringify(c.box)} inside the sheet ${JSON.stringify(sheet.box)}`).toBe(true);
  }
  for (let i = 0; i < sheet.cards.length; i++) for (let j = i + 1; j < sheet.cards.length; j++) expect(overlaps(sheet.cards[i]!.box, sheet.cards[j]!.box)).toBe(false);
  if (sheet.pager) {
    for (const b of [sheet.pager.prev, sheet.pager.next]) {
      expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
      expect(inside(b, sheet.box)).toBe(true);
      for (const c of sheet.cards) expect(overlaps(b, c.box)).toBe(false);
    }
  }
}

test.describe('S-12-2 Archived Memories', () => {
  test('played: the Corp sees all of Archives (face-down cards too) and taps one into HQ; the Runner learns only that a face-down card went back', async ({ page }) => {
    const seed = 1;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'archived_memories_ready');
    const faceDown = Number(plan.info['faceDownIndex']);
    const before = await getView(page);
    let l = await playAm(page, Number(plan.info['handIndex']));
    let v = await getView(page);
    expect(v.choice?.kind).toBe('archives_pick');
    const pile = v.players.corp.discard;
    // The whole pile, the Corp's own ids (face down to the Runner, not to the Corp), the offered ones lit.
    expect(l.sheet!.cards.map((c) => c.cardId)).toEqual(pile);
    expect(pile.every((id) => id !== null)).toBe(true);
    const offered = v.choice!.options.map((o) => (o.action.type === 'select' ? o.action.card : -1));
    expect(l.sheet!.cards.filter((c) => c.lit).map((c) => c.index)).toEqual(offered);
    // The copy being played is the one not offered.
    const own = l.sheet!.cards.find((c) => !c.lit)!;
    expect(own.cardId).toBe('c24');
    expect(l.sheet!.title).toBe('Archived Memories: pick a card for HQ');
    expectSheetClean(l);
    await shot(page, 's12-2-archives-sheet');

    // The card being played can't be taken; nothing is sent.
    const sent = (await page.evaluate(() => window.__overclock!.sent())).length;
    await tap(page, own.box);
    await page.waitForFunction(() => window.__overclock!.layout().hint !== null);
    expect((await layout(page)).hint!.text).toBe('Archived Memories is the card being played');
    expect((await page.evaluate(() => window.__overclock!.sent())).length).toBe(sent);

    // Tap the face-down card: it goes to HQ.
    const pick = l.sheet!.cards.find((c) => c.index === faceDown)!;
    expect(pick.lit).toBe(true);
    await tap(page, pick.box);
    await page.waitForFunction(() => window.__overclock!.getView().choice === null);
    l = await waitIdle(page);
    v = await getView(page);
    expect(l.sheet).toBeNull();
    expect(v.players.corp.hand!.at(-1)).toBe(pick.cardId);
    expect(v.players.corp.handCount).toBe(before.players.corp.handCount);
    expect(v.players.corp.discardCount).toBe(pile.length - 1);
    await shot(page, 's12-2-archives-taken');

    // The Runner: one fewer card in Archives (plus the Corp's end-of-turn discards); no name for the face-down card.
    const discards = Math.max(0, v.players.corp.handCount - v.players.corp.maxHandSize);
    await passTurn(page);
    l = await waitIdle(page);
    const rv = await getView(page);
    expect(rv.viewer).toBe('runner');
    expect(rv.players.corp.discardCount).toBe(pile.length - 1 + discards);
    expect(l.labels.join('\n')).not.toContain(getCard(pick.cardId!)!.name);
  });

  test('a big Archives fits: every card reachable (pages when needed), all thumb-size', async ({ page }) => {
    const seed = 3;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'archived_memories_ready');
    expect(Number(plan.info['archives'])).toBeGreaterThanOrEqual(15);
    let l = await playAm(page, Number(plan.info['handIndex']));
    const pile = (await getView(page)).players.corp.discard;
    const seen: (string | null)[] = [];
    for (let p = 0; p < l.sheet!.pages; p++) {
      expectSheetClean(l);
      expect(l.sheet!.page).toBe(p);
      seen.push(...l.sheet!.cards.map((c) => c.cardId));
      if (p === 0) await shot(page, 's12-2-archives-big');
      if (p < l.sheet!.pages - 1) {
        await tap(page, l.sheet!.pager!.next);
        await page.waitForFunction((k) => window.__overclock!.layout().sheet?.page === k, p + 1);
        l = await layout(page);
      }
    }
    expect(seen).toEqual(pile);
    // Back to the first page, then take the first offered card.
    if (l.sheet!.pages > 1) {
      await tap(page, l.sheet!.pager!.prev);
      await page.waitForFunction((k) => window.__overclock!.layout().sheet?.page === k, l.sheet!.pages - 2);
      l = await layout(page);
    }
    const pick = l.sheet!.cards.find((c) => c.lit)!;
    await tap(page, pick.box);
    await page.waitForFunction(() => window.__overclock!.getView().choice === null);
    expect((await getView(page)).players.corp.hand!.at(-1)).toBe(pick.cardId);
  });

  test('Archives empty: Archived Memories is dimmed and says "Archives is empty"', async ({ page }) => {
    const seed = 1;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'archived_memories_empty');
    // S-15-6: held up it lifts dimmed (nothing lit) and says why; nothing is played.
    const l = await pickHand(page, Number(plan.info['handIndex']));
    expect(l.targets).toEqual([]);
    // Said at the lift (read from the log: the toast may have faded on a slow runner).
    expect((await page.evaluate(() => window.__overclock!.anims())).filter((a) => a.kind === 'hint').map((a) => a.text)).toContain('Archives is empty');
    await shot(page, 's12-2-archives-empty');
    expect((await getView(page)).choice).toBeNull();
  });
});

test.describe('S-12-2 Experiential Data', () => {
  test('face up in the server: the ICE shows 1 more strength (board and run panel) and the breaker must match it', async ({ page }) => {
    const seed = 1;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'experiential_data_encounter');
    expect(plan.info['iceStrength']).toBe('3');
    expect(plan.info['printedStrength']).toBe('2');
    const l = await waitIdle(page);
    const v = await getView(page);
    expect(v.viewer).toBe('runner');
    expect(v.run!.ice!.strength).toBe(3);
    // Board: "Str 3" on the ICE, inside it and clear of its name and type.
    const ice = installedIn(l, plan.info['iceUid']!);
    expect(ice.strength).not.toBeNull();
    // "Str 3"; on a card too small for the word (891x296), the number alone on the red pill.
    expect(ice.strength!.text).toMatch(/^(Str )?3$/);
    expect(ice.strength!.fontPx).toBeGreaterThanOrEqual(11);
    expect(inside(ice.strength!.box, ice.box), 'strength pill on the ICE').toBe(true);
    for (const part of ['name', 'type'] as const) expect(overlaps(ice.strength!.box, ice.face![part]), `pill clear of the ${part}`).toBe(false);
    expect(installedIn(l, plan.info['edUid']!).faceUp).toBe(true);
    // Run panel: the same number.
    expect(l.run!.lines).toContain('Strength 3');
    // Gordian Blade (strength 2) can't break until pumped to 3.
    const breaks = v.run!.options.filter((o) => o.action.type === 'use_ability' && o.action.uid === plan.info['breakerUid'] && (o.action.sub !== undefined || o.action.subs !== undefined));
    expect(breaks.length).toBeGreaterThan(0);
    for (const o of breaks) expect(o.reject).toBe('too_weak');
    const dim = l.run!.buttons.filter((b) => b.reject === 'too_weak');
    expect(dim.length).toBeGreaterThan(0);
    await shot(page, 's12-2-experiential-data');
  });

  test('ICE at its printed strength shows no pill (Experiential Data face down or gone: engine tests)', async ({ page }) => {
    const seed = 1;
    await openBoard(page, { seed, decks: 'core45' });
    await toStep(page, seed, 'experiential_data_encounter');
    const l = await waitIdle(page);
    const v = await getView(page);
    let checked = 0;
    for (const srv of v.corpServers) {
      for (const c of srv.ice) {
        const drawn = installedIn(l, c.uid);
        const printed = c.cardId ? getCard(c.cardId)?.strength : undefined;
        if (c.strength === undefined || c.strength === printed) expect(drawn.strength, `${c.uid} at printed strength: no pill`).toBeNull();
        else expect(drawn.strength!.text).toMatch(new RegExp(`^(Str )?${c.strength}$`));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
