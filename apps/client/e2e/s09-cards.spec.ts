// Sprint 9 (U5): story e2e for S-09-1..4 on the core decks, pass-the-phone, real
// play from the planner's SPRINT9_GOALS (no stub views): Hunter's trace with the
// covers both ways, a skipped Corp window and a tie, tags (remove / the Corp's
// trash), Private Security Force's meat damage, SEA Source ready / not ready with
// its covers, Ichi 1.0, Access to Globalsec's link. Real taps; 640x360 screenshots
// go to docs/sprints/sprint-09-screens/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';
import type { LayoutSnapshot } from '../src/hook-types';
import { dismissReport, expectCleanLayout, getView, layout, overlaps, passTurn, pickHand, startRun, tap, targetOf, toStep, waitIdle } from './helpers';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-09-screens');
const SEED = 1;

async function shot(page: Page, name: string): Promise<void> {
  const small = test.info().project.name === 'phone-small';
  if (small) mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot(small ? { path: join(SHOTS, `${name}.png`) } : {});
  await test.info().attach(name, { body, contentType: 'image/png' });
}

/** A core-deck pass-the-phone board; `cover` keeps the "Pass to …" screen on. */
async function core(page: Page, seed = SEED, cover = false): Promise<void> {
  await page.goto(`./?seed=${seed}&play=here&decks=core${cover ? '' : '&cover=off'}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
}

/** Taps the cover away (if up) and waits for the board. */
async function lift(page: Page): Promise<LayoutSnapshot> {
  const l = await layout(page);
  if (l.cover) {
    await tap(page, { x: l.viewport.width / 2 - 5, y: l.viewport.height - 40, width: 10, height: 10 });
    await page.waitForFunction(() => window.__overclock!.layout().cover === null);
  }
  return waitIdle(page);
}

/** The bid control is readable and every part a real touch target (S-09-1 AC 8). */
function expectBigControl(l: LayoutSnapshot): void {
  const c = l.trace?.control;
  expect(c, 'the bid control shows').toBeTruthy();
  for (const [name, b] of Object.entries(c!.buttons)) expect(Math.min(b.box.width, b.box.height), `${name} >= 44 px`).toBeGreaterThanOrEqual(44);
  expect(c!.numberPx, 'bid number >= 20 px').toBeGreaterThanOrEqual(20);
  expect(c!.captionPx, 'caption >= 10 px').toBeGreaterThanOrEqual(10);
  expect(l.trace!.infoFontPx, 'panel text >= 9 px').toBeGreaterThanOrEqual(9);
  for (const b of Object.values(c!.buttons)) expect(overlaps(b.box, c!.tile)).toBe(false);
}

/** Sets the bid with real taps on − / + (from the shown bid) and taps Bid. */
async function bid(page: Page, amount: number): Promise<void> {
  let l = await layout(page);
  for (let guard = 0; l.trace!.control!.bid !== amount && guard < 30; guard++) {
    const b = l.trace!.control!.bid < amount ? l.trace!.control!.buttons.plus : l.trace!.control!.buttons.minus;
    await tap(page, b.box);
    l = await layout(page);
  }
  expect(l.trace!.control!.bid).toBe(amount);
  await tap(page, l.trace!.control!.buttons.bid.box);
  await waitIdle(page);
}

/** Toast texts logged since the last clearAnims (a slow machine may fade a toast before the test reads the layout). */
async function toasts(page: Page): Promise<string[]> {
  return (await page.evaluate(() => window.__overclock!.anims())).filter((a) => (a.kind === 'notice' || a.kind === 'hint') && a.text).map((a) => a.text!);
}

function letFire(l: LayoutSnapshot) {
  const b = l.run!.buttons.find((x) => /^Let it fire/.test(x.label));
  if (!b) throw new Error(`no Let it fire in ${JSON.stringify(l.run?.buttons.map((x) => x.label))}`);
  return b;
}

async function tapInstalled(page: Page, uid: string): Promise<LayoutSnapshot> {
  const l = await layout(page);
  const c = [...l.servers.flatMap((s) => [...s.ice, ...s.content]), ...l.rig].find((x) => x.uid === uid)!;
  await tap(page, c.box);
  await page.waitForFunction((u) => window.__overclock!.layout().selectedInstalled === u, uid);
  return layout(page);
}

test.describe('S-09-1 Traces with Hunter (pass-the-phone)', () => {
  test('Corp bids 2 on the shared screen, the Runner answers 4: a tie, he escapes; covers both ways, no hand shows', async ({ page }) => {
    await core(page, SEED, true);
    const plan = await toStep(page, SEED, 'hunter_encounter');
    let l = await lift(page);
    const before = await getView(page);
    expect(l.viewer).toBe('runner');
    expect(letFire(l).label).toContain('trace 3');
    await tap(page, letFire(l).box);
    l = await layout(page);
    expect(l.cover).toMatchObject({ to: 'corp', title: 'Pass to the Corp — tap when ready' });
    await shot(page, 's09-1-cover-to-corp');
    l = await lift(page);
    expect(l.hand, 'no hand on screen while the Corp bids').toEqual([]);
    expect(l.trace).toMatchObject({ kind: 'trace_corp', deciding: 'corp', mine: true, stepLabel: 'Trace 3: add credits?' });
    expect(l.trace!.control).toMatchObject({ bid: 0, low: 0, high: Number(plan.info['corpCredits']), caption: 'strength 3' });
    expectBigControl(l);
    await tap(page, l.trace!.control!.buttons.plus.box);
    await tap(page, l.trace!.control!.buttons.plus.box);
    l = await layout(page);
    expect(l.trace!.control).toMatchObject({ bid: 2, caption: 'strength 5' });
    expect(l.trace!.lines[0]).toBe('Trace 3 + 2 → strength 5');
    await shot(page, 's09-1-corp-bids-2');
    await tap(page, l.trace!.control!.buttons.bid.box);
    l = await waitIdle(page);
    expect(l.cover).toMatchObject({ to: 'runner', title: 'Pass back to the Runner — tap when ready' });
    expect(l.hand).toEqual([]);
    l = await lift(page);
    expect(l.trace).toMatchObject({ kind: 'trace_runner', mine: true, stepLabel: 'Trace strength 5 · your link 1 · spend 4 to stop it' });
    expectBigControl(l);
    await shot(page, 's09-1-runner-answers');
    await bid(page, 4);
    l = await waitIdle(page);
    expect(l.cover).toBeNull();
    expect(l.report?.text).toBe('Hunter: trace 5 vs link 5: you escaped.');
    const after = await getView(page);
    expect(after.players.runner.tags).toBe(0);
    expect(after.players.corp.credits).toBe(before.players.corp.credits - 2);
    expect(after.players.runner.credits).toBe(before.players.runner.credits - 4);
    await shot(page, 's09-1-tie-escaped');
  });

  test('trace tie: bidding one less than "spend N" tags the Runner; "Tagged 1" shows by his credits', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, SEED, 'trace_tie');
    const needed = Number(plan.info['needed']);
    let l = await waitIdle(page);
    expect(l.trace).toMatchObject({ kind: 'trace_runner', stepLabel: `Trace strength ${plan.info['strength']} · your link ${plan.info['link']} · spend ${needed} to stop it` });
    await bid(page, needed - 1);
    l = await waitIdle(page);
    expect(l.report?.text).toBe(`Hunter: trace ${plan.info['strength']} vs link ${Number(plan.info['link']) + needed - 1}: you got 1 tag.`);
    expect(l.runnerStatus.tagged?.text).toBe('Tagged 1');
    await shot(page, 's09-1-tagged-report');
  });

  test('the Corp has 0 credits: no hand-off; the Runner bids straight away and the toast says "Corp bid 0"', async ({ page }) => {
    await core(page, SEED, true);
    await toStep(page, SEED, 'hunter_corp_broke');
    await page.evaluate(() => window.__overclock!.clearAnims());
    let l = await lift(page);
    await tap(page, letFire(l).box);
    l = await waitIdle(page);
    expect(l.cover).toBeNull();
    expect(l.trace).toMatchObject({ kind: 'trace_runner', mine: true, stepLabel: 'Trace strength 3 · your link 1 · spend 2 to stop it' });
    expect((await toasts(page)).some((t) => t.includes('Corp bid 0'))).toBe(true);
    await shot(page, 's09-1-corp-broke');
  });
});

test.describe('S-09-2 Tags', () => {
  test('tagged on his own turn: Remove 1 tag · 1 click + 2 credits; tags stay across turns until removed', async ({ page }) => {
    await core(page);
    await toStep(page, SEED, 'runner_tagged_own_turn');
    await page.evaluate(() => window.__overclock!.clearAnims());
    let l = await waitIdle(page);
    expect(l.runnerStatus.tagged?.text).toBe('Tagged 1');
    // Tags stay: the Corp's turn and back, still tagged on both screens.
    await passTurn(page);
    l = await waitIdle(page);
    expect(l.viewer).toBe('corp');
    expect(l.runnerStatus.tagged?.text).toBe('Tagged 1');
    await shot(page, 's09-2-tagged-on-corp-screen');
    await passTurn(page);
    l = await waitIdle(page);
    expect(l.viewer).toBe('runner');
    const before = await getView(page);
    await tap(page, l.runnerStatus.tagged!.hit);
    l = await layout(page);
    const remove = targetOf(l, 'remove_tag');
    expect(remove).toMatchObject({ label: 'Remove 1 tag · 1 click + 2 credits', lit: true });
    expect(Math.min(remove.box.width, remove.box.height)).toBeGreaterThanOrEqual(44);
    await shot(page, 's09-2-remove-tag-button');
    await tap(page, remove.box);
    l = await waitIdle(page);
    const after = await getView(page);
    expect(after.players.runner.tags).toBe(0);
    expect(after.players.runner.credits).toBe(before.players.runner.credits - 2);
    expect(after.players.runner.clicks).toBe(before.players.runner.clicks - 1);
    expect(l.runnerStatus.tagged).toBeNull();
    expect((await toasts(page)).some((t) => t.includes('Runner removed 1 tag'))).toBe(true);
    expectCleanLayout(l);
  });

  test('the Corp taps Armitage while the Runner is tagged: Trash · 1 click + 2 credits; it goes to the Heap with a message', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, SEED, 'runner_tagged_corp_turn');
    await page.evaluate(() => window.__overclock!.clearAnims());
    const uid = plan.info['armitageUid']!;
    let l = await tapInstalled(page, uid);
    const trash = targetOf(l, 'trash_resource');
    expect(trash).toMatchObject({ label: 'Trash · 1 click + 2 credits', lit: true });
    await shot(page, 's09-2-corp-trash-armitage');
    await tap(page, trash.box);
    l = await waitIdle(page);
    const v = await getView(page);
    expect(v.rig.some((c) => c.uid === uid)).toBe(false);
    expect(v.players.runner.discard).toContain('r02');
    expect((await toasts(page)).some((t) => t.includes('Corp trashed Armitage Codebusting (Runner tagged)'))).toBe(true);
  });
});

test.describe('S-09-3 Private Security Force', () => {
  test('tap the score: "Do 1 meat damage · 1 click"; each tap throws a random Grip card to the Heap, named', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, SEED, 'psf_scored_tagged');
    await page.evaluate(() => window.__overclock!.clearAnims());
    let l = await waitIdle(page);
    const before = await getView(page);
    await tap(page, l.score.corp.box);
    l = await layout(page);
    expect(l.selectedInstalled).toBe(plan.info['uid']);
    const use = targetOf(l, 'activate');
    expect(use).toMatchObject({ label: 'Do 1 meat damage · 1 click', lit: true });
    await shot(page, 's09-3-psf-button');
    for (let k = 1; k <= 2; k++) {
      await tap(page, targetOf(await layout(page), 'activate').box);
      l = await waitIdle(page);
      const v = await getView(page);
      expect(v.players.runner.handCount).toBe(before.players.runner.handCount - k);
      expect(v.players.corp.clicks).toBe(before.players.corp.clicks - k);
      const lost = v.players.runner.discard.at(-1)!;
      expect((await toasts(page)).filter((t) => /^1 meat damage: .+ to the Heap/.test(t))).toHaveLength(k);
      expect(lost).not.toBeNull();
    }
    await shot(page, 's09-3-psf-meat-damage');
  });
});

test.describe('S-09-4 SEA Source, Ichi 1.0, Access to Globalsec', () => {
  test('SEA Source ready: Corp bids, cover to the Runner, he bids, cover back to the Corp; the result shows after it', async ({ page }) => {
    await core(page, SEED, true);
    const plan = await toStep(page, SEED, 'sea_source_ready');
    let l = await lift(page);
    l = await pickHand(page, Number(plan.info['handIndex']));
    const play = targetOf(l, 'play');
    expect(play).toMatchObject({ label: 'Play · 2 credits', lit: true });
    await tap(page, play.box);
    l = await waitIdle(page);
    expect(l.run).toBeNull();
    expect(l.hand).toEqual([]);
    expect(l.trace).toMatchObject({ kind: 'trace_corp', title: 'Trace · SEA Source', stepLabel: 'Trace 3: add credits?', mine: true });
    expectBigControl(l);
    // Sideways, the panel takes the build date's line (as in a run).
    if (l.mode === 'landscape') expect(l.buildLabel).toBeNull();
    expectCleanLayout(l);
    await shot(page, 's09-4-sea-source-corp-bid');
    await bid(page, 1);
    l = await layout(page);
    expect(l.cover).toMatchObject({ to: 'runner', title: 'Pass to the Runner — tap when ready' });
    l = await lift(page);
    expect(l.viewer).toBe('corp');
    expect(l.hand, "the Corp's hand stays hidden while the Runner bids").toEqual([]);
    expect(l.trace).toMatchObject({ kind: 'trace_runner', deciding: 'runner', mine: true, stepLabel: 'Trace strength 4 · your link 1 · spend 3 to stop it' });
    await shot(page, 's09-4-sea-source-runner-bid');
    await bid(page, 0);
    l = await layout(page);
    expect(l.cover).toMatchObject({ to: 'corp', title: 'Pass back to the Corp — tap when ready' });
    await page.evaluate(() => window.__overclock!.clearAnims());
    l = await lift(page);
    expect(l.trace).toBeNull();
    // The result toast shows once the cover is lifted (read from the animation log: a slow machine may fade it before we look).
    const notice = (await page.evaluate(() => window.__overclock!.anims())).find((a) => a.kind === 'notice' && a.text?.includes('SEA Source'));
    expect(notice?.text).toContain('SEA Source: trace 4 vs link 1: Runner tagged');
    expect(l.runnerStatus.tagged?.text).toBe('Tagged 1');
    await shot(page, 's09-4-sea-source-result');
  });

  test('SEA Source not ready: dimmed, "Runner made no successful run last turn"', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, SEED, 'sea_source_not_ready');
    const l = await pickHand(page, Number(plan.info['handIndex']));
    expect(targetOf(l, 'play')).toMatchObject({ lit: false, reject: 'condition_not_met', note: 'Runner made no successful run last turn' });
    await shot(page, 's09-4-sea-source-not-ready');
  });

  test('Ichi 1.0: the Corp picks a program twice (the Construct saves one), then Trace 1: tag and brain damage', async ({ page }) => {
    await core(page, 11);
    const plan = await toStep(page, 11, 'ichi_two_programs');
    expect(plan.info['construct']).not.toBe('');
    let l = await waitIdle(page);
    expect(letFire(l).label).toBe('Let it fire: trash 1 program…');
    await tap(page, letFire(l).box);
    const seen: string[] = [];
    const reports: string[] = [];
    for (let guard = 0; guard < 12; guard++) {
      l = await waitIdle(page);
      // A report after each resolved subroutine; read it and go on while a pick or bid is still open.
      if (l.report && (l.run?.choice || l.trace)) {
        reports.push(l.report.text);
        await dismissReport(page);
        continue;
      }
      if (l.report) break;
      if (l.trace?.control) {
        seen.push(l.trace.kind);
        // The Corp bids its most; the Runner lets it through.
        if (l.trace.kind === 'trace_corp') await tap(page, l.trace.control.buttons.max.box);
        else if (l.trace.control.bid !== 0) throw new Error('bid starts at 0');
        await tap(page, (await layout(page)).trace!.control!.buttons.bid.box);
        continue;
      }
      const c = l.run?.choice?.kind;
      if (!c) break;
      seen.push(c);
      if (c === 'trash_target') expect(l.run!.stepLabel).toBe('Ichi 1.0: pick a program to trash');
      if (seen.filter((x) => x === 'prevent_trash').length === 1 && c === 'prevent_trash') await shot(page, 's09-4-ichi-construct');
      // Save with the Construct the first time it is offered, then let it go.
      const btn = c === 'prevent_trash' && seen.filter((x) => x === 'prevent_trash').length === 1 ? l.run!.buttons[0]! : l.run!.buttons[l.run!.buttons.length - 1]!;
      await tap(page, btn.box);
    }
    expect(seen.filter((x) => x === 'trash_target').length).toBe(2);
    expect(reports[0]).toContain('Sacrificial Construct was trashed instead of');
    expect(seen).toContain('trace_corp');
    l = await waitIdle(page);
    expect(l.report?.text).toMatch(/Ichi 1\.0: .*trace \d+ vs link 1: you got 1 tag, you took 1 brain damage\./);
    expect((await getView(page)).players.runner.tags).toBe(1);
    await shot(page, 's09-4-ichi-report');
    await dismissReport(page);
  });

  test('Access to Globalsec: Link 2 with one, Link 3 with two; a Hunter trace uses it', async ({ page }) => {
    await core(page);
    await toStep(page, SEED, 'globalsec_two_installed');
    let l = await waitIdle(page);
    expect(l.runnerStatus.link?.text).toBe('Link 3');
    expect((await getView(page)).players.runner.link).toBe(3);
    await core(page);
    const plan = await toStep(page, SEED, 'globalsec_installed');
    l = await waitIdle(page);
    expect(l.runnerStatus.link?.text).toBe('Link 2');
    await shot(page, 's09-4-globalsec-link-2');
    l = await startRun(page, plan.info['hunterServer']!);
    for (let guard = 0; guard < 10 && !l.trace; guard++) {
      const rez = l.run?.buttons.find((b) => /^Rez Hunter/.test(b.label));
      const fire = l.run?.buttons.find((b) => /^Let it fire/.test(b.label));
      const go = rez ?? fire;
      if (!go) throw new Error(`stuck at ${JSON.stringify(l.run?.buttons.map((b) => b.label))}`);
      await tap(page, go.box);
      l = await waitIdle(page);
    }
    expect(l.trace).toMatchObject({ kind: 'trace_corp' });
    expect(l.trace!.lines.some((x) => x.startsWith('Runner: link 2'))).toBe(true);
  });
});
