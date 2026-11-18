// Sprint 10 (S-10-3): Bank Job lets the Runner choose how many credits to take, with the
// trace bid control (−, the number, +, Max, "Take 3", and a Back to the two buttons); Advance
// stops at an agenda's requirement (only Score is offered), Ice Wall still advances. Real
// play on the core decks (SPRINT10_GOALS) and the Sprint 7 deal (Bank Job). Real taps.
// Screens at 640x360 and 891x296 go to docs/sprints/sprint-10-screens/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';
import type { LayoutSnapshot } from '../src/hook-types';
import { getView, layout, openBoard, overlaps, runButtonOf, startRun, tap, toStep, waitIdle } from './helpers';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-10-screens');

async function shot(page: Page, name: string): Promise<void> {
  const p = test.info().project.name;
  const save = p === 'phone-small' || p === 'phone-short';
  if (save) mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot(save ? { path: join(SHOTS, `${name}-${p === 'phone-small' ? '640x360' : '891x296'}.png`) } : {});
  await test.info().attach(name, { body, contentType: 'image/png' });
}

async function core(page: Page, seed = 1): Promise<void> {
  await page.goto(`./?seed=${seed}&play=here&cover=off&decks=core`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
}

/** The amount control is readable and every part a thumb-size button, none overlapping. */
function expectBigAmount(l: LayoutSnapshot): void {
  const a = l.run!.amount!;
  expect(a, 'the amount control shows').toBeTruthy();
  const btns = l.run!.buttons;
  expect(btns.map((b) => b.role)).toEqual(['bid_dec', 'bid_inc', 'bid_max', 'bid_go', 'amount_back']);
  for (const b of btns) expect(Math.min(b.box.width, b.box.height), `${b.label} >= 44 px`).toBeGreaterThanOrEqual(44);
  expect(Math.min(a.tile.width, a.tile.height)).toBeGreaterThanOrEqual(44);
  expect(a.numberPx, 'number >= 20 px').toBeGreaterThanOrEqual(20);
  expect(a.captionPx, 'caption >= 10 px').toBeGreaterThanOrEqual(10);
  for (const b of btns) expect(b.fontPx, `${b.label} text >= 12 px`).toBeGreaterThanOrEqual(12);
  for (let i = 0; i < btns.length; i++) {
    expect(overlaps(btns[i]!.box, a.tile)).toBe(false);
    for (let j = i + 1; j < btns.length; j++) expect(overlaps(btns[i]!.box, btns[j]!.box)).toBe(false);
  }
}

/** Opens "Take credits" and sets the amount with real taps on − / +. */
async function takeAmount(page: Page, amount: number): Promise<LayoutSnapshot> {
  let l = await layout(page);
  if (!l.run?.amount) {
    await tap(page, runButtonOf(l, 'Bank Job: take credits').box);
    await page.waitForFunction(() => window.__overclock!.layout().run?.amount != null);
    l = await layout(page);
  }
  for (let guard = 0; l.run!.amount!.amount !== amount && guard < 20; guard++) {
    await tap(page, runButtonOf(l, l.run!.amount!.amount < amount ? '+' : '−').box);
    l = await layout(page);
  }
  expect(l.run!.amount!.amount).toBe(amount);
  return l;
}

test.describe('S-10-3 Bank Job lets you choose', () => {
  test('8 on Bank Job: Take credits, set 3, "Take 3": +3 credits, 5 stay on it, nothing accessed', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'runner_bank_job_remote');
    const bj = plan.info['bankJobUid']!;
    let l = await startRun(page, plan.info['server']!);
    expect(l.run!.step).toBe('success');
    expect(l.run!.buttons.map((b) => b.label)).toEqual(['Bank Job: take credits', 'Access cards']);
    await shot(page, 's10-3-bank-job-choice');
    await tap(page, runButtonOf(l, 'Bank Job: take credits').box);
    await page.waitForFunction(() => window.__overclock!.layout().run?.amount != null);
    l = await layout(page);
    // Opens at the most it holds (one tap takes all, as before).
    expect(l.run!.amount).toMatchObject({ amount: 8, low: 1, high: 8, caption: '0 stay' });
    expect(runButtonOf(l, 'Take 8').lit).toBe(true);
    expect(runButtonOf(l, 'Max 8').lit).toBe(false);
    expectBigAmount(l);
    l = await takeAmount(page, 3);
    expect(l.run!.amount).toMatchObject({ amount: 3, caption: '5 stay' });
    expectBigAmount(l);
    await shot(page, 's10-3-bank-job-take-3');
    const credits = (await getView(page)).players.runner.credits;
    await tap(page, runButtonOf(l, 'Take 3').box);
    l = await waitIdle(page);
    const v = await getView(page);
    expect(v.players.runner.credits).toBe(credits + 3);
    expect(v.run).toBeNull();
    expect(v.rig.find((c) => c.uid === bj)?.hostedCredits).toBe(5);
    expect(l.rig.find((c) => c.uid === bj)?.hosted?.text).toBe('5');
    expect(v.players.runner.discard).not.toContain('r10');
  });

  test('Back returns to the two buttons; "Access cards" accesses as normal and Bank Job keeps 8', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'runner_bank_job_remote');
    const bj = plan.info['bankJobUid']!;
    let l = await startRun(page, plan.info['server']!);
    l = await takeAmount(page, 2);
    await tap(page, runButtonOf(l, 'Back').box);
    await page.waitForFunction(() => window.__overclock!.layout().run?.amount === null);
    l = await layout(page);
    expect(l.run!.buttons.map((b) => b.label)).toEqual(['Bank Job: take credits', 'Access cards']);
    await tap(page, runButtonOf(l, 'Access cards').box);
    l = await waitIdle(page);
    expect(l.run?.step).toBe('access');
    expect((await getView(page)).rig.find((c) => c.uid === bj)?.hostedCredits).toBe(8);
  });

  test('taking the last credits (Max) sends Bank Job to the Heap, as today', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'runner_bank_job_remote');
    const bj = plan.info['bankJobUid']!;
    let l = await startRun(page, plan.info['server']!);
    l = await takeAmount(page, 1);
    await tap(page, runButtonOf(l, 'Max 8').box);
    l = await layout(page);
    expect(l.run!.amount!.amount).toBe(8);
    await tap(page, runButtonOf(l, 'Take 8').box);
    l = await waitIdle(page);
    const v = await getView(page);
    expect(v.rig.some((c) => c.uid === bj)).toBe(false);
    expect(v.players.runner.discard).toContain('r10');
  });
});

test.describe('S-10-3 Advance stops at the limit', () => {
  test('an agenda with all its advancements shows only Score; Ice Wall still offers Advance', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, 1, 'agenda_at_requirement');
    let l = await waitIdle(page);
    const uid = plan.info['uid']!;
    const card = l.servers.flatMap((s) => s.content).find((c) => c.uid === uid)!;
    await tap(page, card.box);
    l = await layout(page);
    expect(l.targets.map((t) => t.kind)).toEqual(['score']);
    await shot(page, 's10-3-only-score');
    await core(page);
    const ice = await toStep(page, 1, 'ice_wall_advanced');
    l = await waitIdle(page);
    const wall = l.servers.flatMap((s) => s.ice).find((c) => c.uid === ice.info['uid'])!;
    await tap(page, wall.box);
    l = await layout(page);
    expect(l.targets.some((t) => t.kind === 'advance')).toBe(true);
  });

  test('one short: Advance once, and the next tap shows only Score', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, 1, 'agenda_one_short');
    const uid = plan.info['uid']!;
    let l = await waitIdle(page);
    await tap(page, l.servers.flatMap((s) => s.content).find((c) => c.uid === uid)!.box);
    l = await layout(page);
    const adv = l.targets.find((t) => t.kind === 'advance')!;
    expect(adv.lit).toBe(true);
    await tap(page, adv.box);
    l = await waitIdle(page);
    // The agenda stays picked after an Advance; its buttons are now Score only.
    if (l.selectedInstalled !== uid) {
      await tap(page, l.servers.flatMap((s) => s.content).find((c) => c.uid === uid)!.box);
      l = await layout(page);
    }
    expect(l.targets.map((t) => t.kind)).toEqual(['score']);
  });
});
