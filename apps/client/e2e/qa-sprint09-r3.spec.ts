// QA Sprint 9, round 3 (written by QA, not the developers): the owner's short-screen Score bug.
// The owner's Galaxy S23 in Chrome with the address bar showing is ~891x296 CSS px (DPR 2.625).
// The "short" describe sets that size itself (touch) and runs only under the `phone` project;
// the "regression" describe runs at each project's own size (844x390, 640x360, desktop).
// Screenshots: docs/sprints/sprint-09-qa/short-NN-*.png and r3-<project>-NN-*.png.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCard } from '@overclock/cards';
import { type Page, expect, test } from '@playwright/test';
import type { Box, LayoutSnapshot } from '../src/hook-types';
import { boardElements, expectCleanLayout, getView, inside, layout, measureTap, openBoard, overlaps, tap, targetOf, toStep, waitEndTurnArmed, waitIdle } from './helpers';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-09-qa');

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

/** Full size, inside the viewport, clear of every other board element / target. */
function expectFull(l: LayoutSnapshot, name: string, b: Box, min = 44): void {
  const view: Box = { x: 0, y: 0, width: l.viewport.width, height: l.viewport.height };
  expect(inside(b, view), `${name} ${JSON.stringify(b)} inside the viewport`).toBe(true);
  expect(b.height, `${name} height`).toBeGreaterThanOrEqual(min);
  expect(b.width, `${name} width`).toBeGreaterThanOrEqual(44);
  const others: [string, Box][] = [...boardElements(l)];
  if (l.buildLabel) others.push(['build date', l.buildLabel.box]);
  for (const t of l.targets) if (t.box !== b && !(t.box.x === b.x && t.box.y === b.y)) others.push([`target ${t.label}`, t.box]);
  for (const [n, o] of others) if (o !== b) expect(overlaps(b, o), `${name} ${JSON.stringify(b)} vs ${n} ${JSON.stringify(o)}`).toBe(false);
}

async function scoreFlow(page: Page, prefix: string): Promise<LayoutSnapshot> {
  await openBoard(page, 1);
  const plan = await toStep(page, 1, 'agenda_one_advance');
  let l = await waitIdle(page);
  const card = l.servers.flatMap((s) => s.content).find((c) => c.uid === plan.info.uid)!;
  await tap(page, card.box);
  // Sprint 10 (S-10-3, approved): once the agenda is ready only Score is offered. QA edit: Advance is
  // checked full size on the first tap (one short), Score full size once ready, and Advance is gone.
  const first = await layout(page);
  expectFull(first, 'Advance', targetOf(first, 'advance').box);
  await tap(page, targetOf(first, 'advance').box);
  l = await waitIdle(page);
  expect(l.targets.map((t) => t.kind)).toEqual(['score']);
  await shot(page, `${prefix}01-score`);
  expectFull(l, 'Score', targetOf(l, 'score').box);
  expectCleanLayout(l);
  const before = await getView(page);
  const m = await measureTap(page, targetOf(l, 'score').box);
  expect(m.stateAt - m.handledAt, 'Score tap state < 100 ms').toBeLessThan(100);
  l = await waitIdle(page);
  const after = await getView(page);
  expect(after.players.corp.points).toBe(before.players.corp.points + getCard(plan.info.cardId!)!.agendaPoints!);
  expect(after.players.corp.points).toBeGreaterThan(before.players.corp.points);
  await shot(page, `${prefix}02-scored`);
  return l;
}

async function psfFlow(page: Page, prefix: string): Promise<void> {
  await page.goto('./?seed=1&play=here&cover=off&decks=core'); // Sprint 12: plan on the 30-card core decks
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
  await toStep(page, 1, 'psf_scored_tagged');
  let l = await waitIdle(page);
  const v0 = await getView(page);
  expect(v0.activePlayer).toBe('corp');
  expect(v0.viewer).toBe('corp');
  expect(v0.players.runner.tags, 'Runner tagged').toBeGreaterThan(0);
  await tap(page, l.score.corp.box);
  l = await layout(page);
  const use = targetOf(l, 'activate');
  expect(use).toMatchObject({ label: 'Do 1 meat damage · 1 click', lit: true });
  expect(l.labels.some((s) => s.includes('Do 1 meat damage')), 'label text drawn').toBe(true);
  expectFull(l, 'PSF button', use.box);
  await shot(page, `${prefix}03-psf-button`);
  const before = await getView(page);
  const m = await measureTap(page, use.box);
  expect(m.stateAt - m.handledAt, 'PSF tap state < 100 ms').toBeLessThan(100);
  const md = m.events.find((e) => e.type === 'meat_damage') as { cardIds: readonly string[] } | undefined;
  expect(md, 'meat damage event').toBeTruthy();
  const lost = md!.cardIds[0]!;
  expect(m.anims.some((a) => a.kind === 'notice' && a.text === `1 meat damage: ${getCard(lost)!.name} to the Heap`), 'notice').toBe(true);
  await page.waitForTimeout(150);
  await shot(page, `${prefix}04-psf-notice`);
  await waitIdle(page);
  const after = await getView(page);
  expect(after.players.runner.handCount).toBe(before.players.runner.handCount - 1);
  expect(after.players.runner.discard.length).toBe(before.players.runner.discard.length + 1);
  expect(after.players.runner.discard.at(-1)).toBe(lost);
  expect(after.players.corp.clicks).toBe(before.players.corp.clicks - 1);
}

async function railFlow(page: Page, prefix: string, short: boolean): Promise<void> {
  await openBoard(page, 1);
  let l = await waitIdle(page);
  await shot(page, `${prefix}05-rail-idle`);
  if (short) expect(l.buildLabel, 'build date hidden on the short screen').toBeNull();
  expect(l.endTurn).not.toBeNull();
  expectFull(l, 'End turn', l.endTurn!.box);
  expectFull(l, 'credits pill', l.corp.credits);
  expect(l.text.corpClicks, 'clicks still readable').not.toBe('');
  expect(l.text.corpCredits).not.toBe('');
  const before = await getView(page);
  const m = await measureTap(page, l.corp.credits);
  expect(m.view.players.corp.credits).toBe(before.players.corp.credits + 1);
  expect(m.stateAt - m.handledAt, 'credits tap < 100 ms').toBeLessThan(100);
  l = await waitIdle(page);
  expect(l.text.corpCredits).toBe(String(before.players.corp.credits + 1));
  await waitEndTurnArmed(page);
  // Spend remaining clicks on credits, then End turn.
  for (let i = 0; i < 4 && (await getView(page)).players.corp.clicks > 0; i++) {
    await tap(page, (await layout(page)).corp.credits);
    await waitIdle(page);
  }
  l = await layout(page);
  expect(l.endTurn!.enabled).toBe(true);
  await tap(page, l.endTurn!.box);
  await waitIdle(page);
  const v = await getView(page);
  expect(v.activePlayer === 'runner' || v.pendingDiscard > 0, 'End turn took effect').toBe(true);
  await shot(page, `${prefix}06-after-end-turn`);
}

test.describe('Round 3: owner short screen 891x296 (touch, DPR 2.625)', () => {
  test.use({ viewport: { width: 891, height: 296 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
  test.beforeEach(() => test.skip(test.info().project.name !== 'phone', 'short size runs once, under the phone project'));
  test('C1: Advance full size, then only Score (full size), Score scores', async ({ page }) => {
    await scoreFlow(page, 'short-');
  });
  test('C2: PSF "Do 1 meat damage · 1 click" full size; a Runner card goes to the Heap with the notice', async ({ page }) => {
    await psfFlow(page, 'short-');
  });
  test('C3: End turn and credits pill visible and tappable; build date the only thing hidden', async ({ page }) => {
    await railFlow(page, 'short-', true);
  });
});

test.describe('Round 3: regression at the project sizes', () => {
  test('C4: Score, PSF and rail flows', async ({ page }) => {
    test.setTimeout(60_000);
    const p = `r3-${test.info().project.name}-`;
    await scoreFlow(page, p);
    await psfFlow(page, p);
    await railFlow(page, p, false);
    expect((await layout(page)).buildLabel, 'build date still shown at normal sizes').not.toBeNull();
  });
});
