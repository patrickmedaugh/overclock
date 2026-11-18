// Sprint 12 (U2, S-12-1): Accelerated Beta Test. Scoring it shows the Corp the top 3 cards of
// R&D in the hand's strip; the Corp taps an ICE, the servers it may go to light (from the
// engine's `select` options), a tap installs it face up for free. "Trash the rest (N)" sends
// the others to Archives face down; with no ICE among them, one tap ("Trash 3 cards") does.
// The Runner sees only how many cards were looked at and trashed. 45-card decks (the default).
// 640x360 and 891x296 screenshots go to docs/sprints/sprint-12-screens/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCard } from '@overclock/cards';
import { type Page, expect, test } from '@playwright/test';
import type { LayoutSnapshot } from '../src/hook-types';
import { getView, inside, lastEvents, layout, overlaps, passTurn, safeRect, tap, targetOf, toStep, waitIdle, openBoard } from './helpers';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-12-screens');
const SEED_ICE = 1;
const SEED_NO_ICE = 2;

async function shot(page: Page, name: string): Promise<void> {
  const p = test.info().project.name;
  const save = p === 'phone-small' || p === 'phone-short';
  if (save) mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot(save ? { path: join(SHOTS, `${name}-${p === 'phone-small' ? '640x360' : '891x296'}.png`) } : {});
  await test.info().attach(name, { body, contentType: 'image/png' });
}

/** Taps the installed agenda `uid`, then its Score button; waits for the look-at sheet. */
async function scoreAbt(page: Page, uid: string): Promise<LayoutSnapshot> {
  let l = await waitIdle(page);
  const card = l.servers.flatMap((s) => s.content).find((c) => c.uid === uid)!;
  await tap(page, card.box);
  await page.waitForFunction((u) => window.__overclock!.layout().selectedInstalled === u, uid);
  l = await layout(page);
  await tap(page, targetOf(l, 'score').box);
  await page.waitForFunction(() => window.__overclock!.layout().sheet?.kind === 'look');
  return waitIdle(page);
}

/** The help column, once the notice toast (which takes its room sideways) has gone. */
async function helpText(page: Page): Promise<string> {
  await page.waitForFunction(() => window.__overclock!.layout().hint === null && window.__overclock!.layout().text.help !== '', undefined, { timeout: 5000 });
  return (await layout(page)).text.help;
}

/** The sheet's cards are thumb-size, on screen, in the hand strip and clear of each other and of every lit target. */
function expectSheetClean(l: LayoutSnapshot): void {
  const sheet = l.sheet!;
  const safe = safeRect(l);
  for (const c of sheet.cards) {
    expect(Math.min(c.box.width, c.box.height), 'sheet card is a thumb-size target').toBeGreaterThanOrEqual(44);
    expect(inside(c.box, safe), `sheet card ${JSON.stringify(c.box)} on screen`).toBe(true);
    expect(c.box.y + c.box.height, 'sheet card in the hand strip (below the table)').toBeGreaterThan(l.handArea.y);
    for (const t of l.targets) expect(overlaps(c.box, t.box), `sheet card clear of the ${t.kind} target`).toBe(false);
  }
  for (let i = 1; i < sheet.cards.length; i++) expect(overlaps(sheet.cards[i - 1]!.box, sheet.cards[i]!.box)).toBe(false);
  for (const t of l.targets) {
    expect(Math.min(t.box.width, t.box.height), `${t.kind} target thumb-size`).toBeGreaterThanOrEqual(44);
    expect(inside(t.box, safe), `${t.kind} target on screen`).toBe(true);
  }
  expect(l.hand, 'the hand is put away meanwhile').toEqual([]);
}

test.describe('S-12-1 Accelerated Beta Test', () => {
  test('scored: the Corp sees the top 3 cards; tap an ICE, tap a lit server: installed face up, free, no click; the rest go to Archives face down', async ({ page }) => {
    await openBoard(page, { seed: SEED_ICE, decks: 'core45' });
    const plan = await toStep(page, SEED_ICE, 'abt_scorable');
    expect(plan.info['ice']).toBe('1');
    const before = await getView(page);
    let l = await scoreAbt(page, plan.info['uid']!);
    let v = await getView(page);
    const atScore = v;
    expect(v.choice?.kind).toBe('look_install');
    const looked = v.choice!.looked!;
    expect(looked).toHaveLength(3);
    // The sheet shows exactly the engine's 3 cards, top first; only ICE are lit.
    expect(l.sheet!.cards.map((c) => c.cardId)).toEqual(looked);
    const iceAt = looked.map((id, i) => (getCard(id!)?.type === 'ice' ? i : -1)).filter((i) => i >= 0);
    expect(l.sheet!.cards.filter((c) => c.lit).map((c) => c.index)).toEqual(iceAt);
    expect(iceAt.length).toBe(1);
    expect(await helpText(page)).toContain('Tap an ICE, then a server');
    expect(targetOf(l, 'look_done')).toMatchObject({ label: 'Trash the rest (3)', lit: true });
    // Nothing else lights: no server until an ICE is picked.
    expect(l.targets.map((t) => t.kind)).toEqual(['look_done']);
    expectSheetClean(l);
    await shot(page, 's12-1-abt-look');

    // A non-ICE card says where it goes; nothing is sent.
    const other = l.sheet!.cards.find((c) => !c.lit)!;
    const sentBefore = (await page.evaluate(() => window.__overclock!.sent())).length;
    await tap(page, other.box);
    await page.waitForFunction(() => window.__overclock!.layout().hint !== null);
    expect((await layout(page)).hint!.text).toBe(`${getCard(other.cardId!)!.name} isn't ICE: it goes to Archives`);
    expect((await page.evaluate(() => window.__overclock!.sent())).length).toBe(sentBefore);

    // Tap the ICE: every server the engine offers lights, "Install · free" (and New server).
    const ice = l.sheet!.cards.find((c) => c.lit)!;
    await tap(page, ice.box);
    await page.waitForFunction(() => window.__overclock!.layout().sheet?.cards.some((c) => c.picked) === true);
    l = await layout(page);
    const offered = v.choice!.options.flatMap((o) => (o.action.type === 'select' && o.action.card === ice.index ? [o.action.server] : []));
    const lit = l.targets.filter((t) => t.kind === 'look_install');
    expect(lit.map((t) => t.server).sort()).toEqual([...offered].sort());
    expect(offered).toContain('new');
    for (const t of lit) expect(t).toMatchObject({ label: 'Install · free', lit: true });
    expect(await helpText(page)).toContain('Tap a lit server');
    expectSheetClean(l);
    await shot(page, 's12-1-abt-servers');

    // Tap R&D's column: the ICE is installed there, face up (rezzed), with no click or credit spent.
    const server = offered.includes('rd') ? 'rd' : offered[0]!;
    const iceBefore = before.corpServers.find((s) => s.id === server)?.ice.length ?? 0;
    await tap(page, targetOf(l, 'look_install', server).box);
    await page.waitForFunction(() => window.__overclock!.getView().choice?.looked?.length === 2);
    l = await waitIdle(page);
    v = await getView(page);
    const srv = v.corpServers.find((s) => s.id === server)!;
    expect(srv.ice).toHaveLength(iceBefore + 1);
    expect(srv.ice.at(-1)).toMatchObject({ cardId: ice.cardId, faceUp: true });
    expect(v.players.corp.clicks, 'no click for the install').toBe(atScore.players.corp.clicks);
    // Free: no ICE install tax either (Haas-Bioroid may give 1 for the turn's first install).
    expect(v.players.corp.credits).toBeGreaterThanOrEqual(atScore.players.corp.credits);
    expect(l.sheet!.cards.map((c) => c.cardId)).toEqual(v.choice!.looked);
    expect(l.sheet!.cards.every((c) => !c.lit)).toBe(true);
    expect(targetOf(l, 'look_done')).toMatchObject({ label: 'Trash 2 cards', lit: true });

    // Done: the other 2 go to Archives face down; the hand comes back.
    const archives = v.players.corp.discardCount;
    const rest = v.choice!.looked!;
    await tap(page, targetOf(l, 'look_done').box);
    await page.waitForFunction(() => window.__overclock!.getView().choice === null);
    l = await waitIdle(page);
    v = await getView(page);
    expect(v.players.corp.discardCount).toBe(archives + 2);
    expect(v.players.corp.discard.slice(-2)).toEqual(rest);
    expect(l.sheet).toBeNull();
    expect(l.hand.length).toBe(v.players.corp.handCount);
    const notices = (await page.evaluate(() => window.__overclock!.anims())).filter((a) => a.kind === 'notice').map((a) => a.text ?? '');
    expect(notices.some((t) => t.includes('2 cards to Archives, face down'))).toBe(true);
    expect(notices.some((t) => t.includes('You look at the top 3 cards of R&D'))).toBe(true);
    await shot(page, 's12-1-abt-done');

    // The Runner's turn: the new ICE is face up, the trashed cards are face down; no looked id anywhere.
    const installedUid = srv.ice.at(-1)!.uid;
    await passTurn(page);
    l = await waitIdle(page);
    const rv = await getView(page);
    expect(rv.viewer).toBe('runner');
    expect(rv.corpServers.find((s) => s.id === server)!.ice.find((c) => c.uid === installedUid)).toMatchObject({ cardId: ice.cardId, faceUp: true });
    expect(rv.players.corp.discard.slice(-2), 'trashed face down: the Runner sees backs').toEqual([null, null]);
    for (const id of rest) {
      const name = getCard(id!)!.name;
      // (Shown to the Runner only if it is also face up somewhere else.)
      const elsewhere = rv.players.corp.discard.includes(id) || rv.corpServers.some((s) => [...s.ice, ...s.content].some((c) => c.cardId === id));
      if (!elsewhere) expect(l.labels.join('\n')).not.toContain(name);
    }
  });

  test('no ICE among the 3: the Corp sees them all dimmed, and one tap ("Trash 3 cards") sends them to Archives', async ({ page }) => {
    await openBoard(page, { seed: SEED_NO_ICE, decks: 'core45' });
    const plan = await toStep(page, SEED_NO_ICE, 'abt_scorable_no_ice');
    expect(plan.info['ice']).toBe('0');
    let l = await scoreAbt(page, plan.info['uid']!);
    let v = await getView(page);
    const looked = v.choice!.looked!;
    expect(l.sheet!.cards.map((c) => c.cardId)).toEqual(looked);
    expect(l.sheet!.cards.every((c) => !c.lit && !c.picked)).toBe(true);
    const done = targetOf(l, 'look_done');
    expect(done).toMatchObject({ label: 'Trash 3 cards', lit: true });
    expect(await helpText(page)).toContain('no ICE to install');
    expectSheetClean(l);
    await shot(page, 's12-1-abt-no-ice');
    const archives = v.players.corp.discardCount;
    await tap(page, done.box);
    await page.waitForFunction(() => window.__overclock!.getView().choice === null);
    l = await waitIdle(page);
    v = await getView(page);
    expect(v.players.corp.discardCount).toBe(archives + 3);
    expect(v.players.corp.discard.slice(-3)).toEqual(looked);
    const events = await lastEvents(page);
    expect(events.find((e) => e.type === 'rd_cards_trashed')).toMatchObject({ count: 3 });
    expect(l.sheet).toBeNull();
  });

  test('R&D had fewer than 3 cards: the sheet shows only what was there (engine view, drawn as given)', async ({ page }) => {
    await openBoard(page, { seed: SEED_NO_ICE, decks: 'core45' });
    const plan = await toStep(page, SEED_NO_ICE, 'abt_scorable_no_ice');
    await scoreAbt(page, plan.info['uid']!);
    const v = await getView(page);
    // The engine sets aside min(3, R&D) cards (its own tests cover a 2-card and an empty R&D);
    // the board draws however many the view lists.
    const one = { ...v, choice: { ...v.choice!, looked: v.choice!.looked!.slice(0, 1) } };
    await page.evaluate((view) => window.__overclock!.stub(view, [], null), one);
    const l = await waitIdle(page);
    expect(l.sheet!.cards.map((c) => c.cardId)).toEqual(one.choice.looked);
    expect(targetOf(l, 'look_done')).toMatchObject({ label: 'Trash 1 card', lit: true });
  });
});
