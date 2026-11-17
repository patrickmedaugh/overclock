// Sprint 10 (S-10-1): a scored-agenda pile for each side, at the far right of its row: the
// latest agenda face up with "2 agendas · 3 points"; a tap opens it big like the hand
// (slide / tap a side card to read on, tap outside to close); holding still reads; the
// Corp's scored Private Security Force is used from it; an unscored one says "score it
// first". Made-up views (the test hook's `stub`) on real core-deck boards; the pile from
// real play (score, steal) where noted. Real taps. Screens at 640x360 and 891x296 go to
// docs/sprints/sprint-10-screens/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';
import type { CardOption, GameEvent, PlayerView } from '@overclock/engine';
import type { LayoutSnapshot } from '../src/hook-types';
import { expectCleanLayout, getView, holdAt, layout, openBoard, outsideHandView, overlaps, passTurn, tap, targetOf, toBusyBoard, toStep, waitIdle } from './helpers';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-10-screens');
const SEED = 1;

async function shot(page: Page, name: string): Promise<void> {
  const p = test.info().project.name;
  const save = p === 'phone-small' || p === 'phone-short';
  if (save) mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot(save ? { path: join(SHOTS, `${name}-${p === 'phone-small' ? '640x360' : '891x296'}.png`) } : {});
  await test.info().attach(name, { body, contentType: 'image/png' });
}

async function core(page: Page): Promise<void> {
  await page.goto(`./?seed=${SEED}&play=here&cover=off`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
}

async function stub(page: Page, view: PlayerView, events: GameEvent[] = []): Promise<LayoutSnapshot> {
  await page.evaluate(({ v, e }) => window.__overclock!.stub(v, e, null), { v: view, e: events });
  return waitIdle(page);
}

function sent(page: Page) {
  return page.evaluate(() => window.__overclock!.sent());
}

/** Hostile Takeover (2 points) then Private Security Force (2): "2 agendas · 3 points" is the engine's points as given. */
function withScores(v: PlayerView, corp: string[], corpPoints: number, runner: string[] = [], runnerPoints = 0): PlayerView {
  return {
    ...v,
    players: {
      ...v.players,
      corp: { ...v.players.corp, scored: corp, points: corpPoints },
      runner: { ...v.players.runner, scored: runner, points: runnerPoints },
    },
  };
}

const psf = (key: string, reject: CardOption['reject']): CardOption => ({ action: { type: 'activate', player: 'corp', uid: key, ability: 0 }, cost: 0, clicks: 1, reject });

/** The pile is right of everything else in its row. */
function expectFarRight(l: LayoutSnapshot): void {
  const corp = l.scored.corp.box;
  const runner = l.scored.runner.box;
  for (const s of l.servers) {
    expect(s.box.x + s.box.width, `${s.label} column left of the Corp pile`).toBeLessThanOrEqual(corp.x + 0.5);
    expect(overlaps(s.box, corp), `${s.label} column vs Corp pile`).toBe(false);
  }
  for (const c of l.rig) expect(c.box.x + c.box.width).toBeLessThanOrEqual(runner.x + 0.5);
  expect(l.runnerStatus.stats.x + l.runnerStatus.stats.width).toBeLessThanOrEqual(runner.x + 0.5);
  for (const b of [corp, runner]) {
    expect(b.width, 'thumb size').toBeGreaterThanOrEqual(44);
    expect(b.height, 'thumb size').toBeGreaterThanOrEqual(44);
  }
  // The two piles line up at the right edge of the board.
  expect(Math.abs(corp.x + corp.width - (runner.x + runner.width))).toBeLessThanOrEqual(1);
}

test.describe('S-10-1 a scored-agenda pile for each side', () => {
  test('the Corp\'s pile: "2 agendas · 3 points" at the far right of its row, on both screens; the score labels still say the points', async ({ page }) => {
    await core(page);
    const v = await getView(page);
    let l = await stub(page, withScores(v, ['c08', 'c09'], 3));
    expect(l.scored.corp).toMatchObject({ text: '2 agendas · 3 points', count: 2, top: 'c09', tappable: true });
    expect(l.score.corp.text).toBe('Corp 3 points');
    expectFarRight(l);
    expectCleanLayout(l);
    await shot(page, 's10-1-corp-pile-corp-view');
    await passTurn(page);
    const rv = await getView(page);
    l = await stub(page, withScores(rv, ['c08', 'c09'], 3));
    expect(l.viewer).toBe('runner');
    expect(l.scored.corp).toMatchObject({ text: '2 agendas · 3 points', top: 'c09' });
    expectFarRight(l);
    expectCleanLayout(l);
  });

  test('the Runner\'s pile of stolen agendas sits at the far right of his row, the same way', async ({ page }) => {
    await core(page);
    const v = await getView(page);
    const l = await stub(page, withScores(v, [], 0, ['c10'], 2));
    expect(l.scored.runner).toMatchObject({ text: '1 agenda · 2 points', count: 1, top: 'c10', tappable: true });
    expect(l.scored.corp).toMatchObject({ text: '', count: 0, tappable: false });
    expect(l.score.runner.text).toBe('Runner 2 points');
    expectFarRight(l);
    expectCleanLayout(l);
    await shot(page, 's10-1-runner-pile');
  });

  test('no scored agendas: a faint outline that takes no taps', async ({ page }) => {
    await core(page);
    const l = await waitIdle(page);
    for (const s of ['corp', 'runner'] as const) expect(l.scored[s]).toMatchObject({ count: 0, text: '', tappable: false });
    await tap(page, l.scored.corp.box);
    const after = await layout(page);
    expect(after.pileView).toBeNull();
    expect(after.zoom).toBeNull();
  });

  test('tap a pile of 2: it opens big like the hand; tap a side card to read it; tap outside to close. Holding still reads', async ({ page }) => {
    await core(page);
    const v = await getView(page);
    let l = await stub(page, withScores(v, ['c08', 'c09'], 3));
    await tap(page, l.scored.corp.box);
    await page.waitForFunction(() => window.__overclock!.layout().pileView !== null);
    l = await waitIdle(page);
    expect(l.pileView).toMatchObject({ side: 'corp', index: 1, cardId: 'c09', count: 2 });
    expect(l.handView).toBeNull();
    expect(l.zoom!.carousel.length).toBeGreaterThan(0);
    await shot(page, 's10-1-pile-open');
    // The other agenda beside it: a tap brings it to the middle.
    const side = l.zoom!.carousel.find((c) => c.cardId === 'c08')!;
    await tap(page, side.box);
    await page.waitForFunction(() => window.__overclock!.layout().pileView?.cardId === 'c08');
    l = await layout(page);
    // Tap outside: it closes, nothing else happens.
    await tap(page, outsideHandView(l));
    await page.waitForFunction(() => window.__overclock!.layout().pileView === null);
    l = await waitIdle(page);
    expect(l.zoom).toBeNull();
    expect(l.selectedInstalled).toBeNull();
    // A hold reads the latest agenda, as before.
    const hold = await holdAt(page, l.scored.corp.box);
    await page.waitForFunction(() => window.__overclock!.layout().zoom?.cardId === 'c09');
    await hold.release();
    await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
  });

  test('the Corp opens his pile and taps Private Security Force: "Do 1 meat damage · 1 click" works as in Sprint 9', async ({ page }) => {
    await core(page);
    const v = await getView(page);
    expect(v.viewer).toBe('corp');
    const base = withScores(v, ['c08', 'c09'], 3);
    const tagged = { ...base, players: { ...base.players, runner: { ...base.players.runner, tags: 1 } } };
    let l = await stub(page, { ...tagged, installedOptions: { ...v.installedOptions, 'score:corp:1': [psf('score:corp:1', null)] } });
    await tap(page, l.scored.corp.box);
    await page.waitForFunction(() => window.__overclock!.layout().pileView?.cardId === 'c09');
    l = await layout(page);
    await tap(page, l.pileView!.centre);
    await page.waitForFunction(() => window.__overclock!.layout().pileView === null);
    l = await waitIdle(page);
    expect(l.selectedInstalled).toBe('score:corp:1');
    const t = targetOf(l, 'activate');
    expect(t).toMatchObject({ label: 'Do 1 meat damage · 1 click', lit: true });
    expect(Math.min(t.box.width, t.box.height)).toBeGreaterThanOrEqual(44);
    await shot(page, 's10-1-psf-from-pile');
    await tap(page, t.box);
    expect((await sent(page)).at(-1)).toEqual(psf('score:corp:1', null).action);
    // The score label's Sprint 9 shortcut still works.
    l = await stub(page, { ...tagged, installedOptions: { ...v.installedOptions, 'score:corp:1': [psf('score:corp:1', null)] } });
    if (l.selectedInstalled === 'score:corp:1') {
      await tap(page, l.score.corp.box);
      l = await layout(page);
    }
    await tap(page, l.score.corp.box);
    l = await layout(page);
    expect(l.selectedInstalled).toBe('score:corp:1');
    // Hostile Takeover (no ability): tapping it in the pile does nothing but show it.
    await tap(page, l.score.corp.box);
    l = await stub(page, { ...tagged, installedOptions: { ...v.installedOptions, 'score:corp:1': [psf('score:corp:1', null)] } });
    await tap(page, l.scored.corp.box);
    await page.waitForFunction(() => window.__overclock!.layout().pileView?.cardId === 'c09');
    l = await layout(page);
    await tap(page, l.zoom!.carousel.find((c) => c.cardId === 'c08')!.box);
    await page.waitForFunction(() => window.__overclock!.layout().pileView?.cardId === 'c08');
    l = await layout(page);
    await tap(page, l.pileView!.centre);
    l = await waitIdle(page);
    expect(l.pileView?.cardId).toBe('c08');
    expect(l.targets.some((x) => x.kind === 'activate')).toBe(false);
  });

  test('an installed Private Security Force not scored yet: a dimmed "Do 1 meat damage: score it first" beside Advance', async ({ page }) => {
    await core(page);
    const v = await getView(page);
    const uid = 'psf-s10';
    const remote = { id: 'remote1' as const, ice: [], content: [{ uid, cardId: 'c09', faceUp: true, advancements: 1, hostedCredits: 0 }] };
    const advance: CardOption = { action: { type: 'advance', player: 'corp', uid }, cost: 1, clicks: 1, reject: null };
    let l = await stub(page, { ...v, corpServers: [...v.corpServers, remote], installedOptions: { ...v.installedOptions, [uid]: [advance] } });
    const card = l.servers.find((s) => s.id === 'remote1')!.content[0]!;
    await tap(page, card.box);
    l = await layout(page);
    expect(l.selectedInstalled).toBe(uid);
    expect(targetOf(l, 'advance').lit).toBe(true);
    // Words from the card; dimmed (the help text), not a button.
    expect(l.text.help).toContain('Do 1 meat damage: score it first');
    expect(l.targets.some((t) => t.kind === 'activate')).toBe(false);
    await shot(page, 's10-1-psf-score-it-first');
  });

  test('real play: the Corp\'s two scored agendas in its pile; PSF from the pile is dim "Runner isn\'t tagged"; the Runner\'s two stolen in his', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, SEED, 'corp_two_scored');
    let l = await waitIdle(page);
    const ids = plan.info['scored']!.split(',');
    const points = Number(plan.info['points']);
    expect(l.scored.corp).toMatchObject({ count: ids.length, top: ids.at(-1), text: `${ids.length} agendas · ${points} points` });
    expectFarRight(l);
    expectCleanLayout(l);
    const psfKey = plan.info['psfUid']!;
    const psfIndex = Number(psfKey.split(':')[2]);
    await tap(page, l.scored.corp.box);
    await page.waitForFunction(() => window.__overclock!.layout().pileView !== null);
    l = await layout(page);
    if (l.pileView!.index !== psfIndex) {
      await tap(page, l.zoom!.carousel.find((c) => c.index === psfIndex)!.box);
      await page.waitForFunction((i) => window.__overclock!.layout().pileView?.index === i, psfIndex);
      l = await layout(page);
    }
    await tap(page, l.pileView!.centre);
    await page.waitForFunction(() => window.__overclock!.layout().pileView === null);
    l = await waitIdle(page);
    expect(l.selectedInstalled).toBe(psfKey);
    expect(targetOf(l, 'activate')).toMatchObject({ label: 'Do 1 meat damage · 1 click', lit: false, note: "Runner isn't tagged" });
    await shot(page, 's10-1-real-psf-untagged');
    await core(page);
    const stolen = await toStep(page, SEED, 'runner_two_stolen');
    l = await waitIdle(page);
    expect(l.scored.runner.count).toBe(Number(stolen.info['count']));
    expect(l.scored.runner.text).toBe(`${stolen.info['count']} agendas · ${stolen.info['points']} points`);
    expectFarRight(l);
    expectCleanLayout(l);
    await shot(page, 's10-1-real-runner-two-stolen');
  });

  test('real play: an installed, unscored Private Security Force says "score it first" beside Advance', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, SEED, 'psf_installed_unscored');
    let l = await waitIdle(page);
    const card = l.servers.flatMap((s) => s.content).find((c) => c.uid === plan.info['uid'])!;
    await tap(page, card.box);
    l = await layout(page);
    expect(targetOf(l, 'advance').lit).toBe(true);
    // Sideways a passing toast (the turn's notes) takes the help room for a moment; then it shows.
    await page.waitForFunction(() => window.__overclock!.layout().text.help.includes('Do 1 meat damage: score it first'));
  });

  test('busy board with both piles full: piles are thumb size and cover no card, button or counter', async ({ page }) => {
    await openBoard(page, SEED);
    await toBusyBoard(page, SEED);
    const v = await getView(page);
    const l = await stub(page, withScores(v, ['c08', 'c09', 'c10'], 6, ['c08'], 2));
    expectFarRight(l);
    expectCleanLayout(l);
    await shot(page, 's10-1-busy-both-piles');
  });
});
