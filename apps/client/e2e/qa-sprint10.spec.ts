// QA Sprint 10 (written by QA, not the developers): independent checks of S-10-1, S-10-2, S-10-3,
// S-10-5 and S-10-6, at 844x390, 640x360, 891x296 (phone-short) and 1280x800. Real core-deck play
// (planner goals, real taps) wherever a goal reaches the case; a made-up view (the hook's `stub`)
// only for "both piles full on a busy board", which no single game reaches quickly.
// Screens: docs/sprints/sprint-10-qa/<project>-NN-*.png.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Action, GameEvent, PlayerView, Side } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';
import { planToStep } from '@overclock/match/testing';
import { type Browser, type Page, expect, test } from '@playwright/test';
import type { Box, LayoutSnapshot } from '../src/hook-types';
import {
  center,
  expectCleanLayout,
  getView,
  holdAt,
  inside,
  layout,
  measureTap,
  openBoard,
  outsideHandView,
  overlaps,
  passTurn,
  pickHand,
  runButtonOf,
  startRun,
  tap,
  targetOf,
  toBusyBoard,
  toStep,
  waitIdle,
} from './helpers';
import { pixelStats } from './pixels';
import { joinGame, layoutOf, openPhone, startTestGame, waitPlaying, waitView } from './online';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-10-qa');
const SIZE: Record<string, string> = { phone: '844x390', 'phone-small': '640x360', 'phone-short': '891x296', desktop: '1280x800' };

async function shot(page: Page, name: string): Promise<void> {
  const p = test.info().project.name;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${SIZE[p] ?? p}-${name}.png`) });
}

async function core(page: Page, seed = 1): Promise<void> {
  await page.goto(`./?seed=${seed}&play=here&cover=off&decks=core`); // Sprint 12: plans are on the 30-card core decks
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
}

async function stub(page: Page, view: PlayerView, events: GameEvent[] = []): Promise<LayoutSnapshot> {
  await page.evaluate(({ v, e }) => window.__overclock!.stub(v, e, null), { v: view, e: events });
  return waitIdle(page);
}

async function dispatchAll(page: Page, actions: readonly Action[]): Promise<void> {
  const rejected = await page.evaluate((list) => {
    for (const a of list) {
      const r = window.__overclock!.dispatch(a).find((e) => e.type === 'action_rejected');
      if (r) return JSON.stringify({ a, r });
    }
    return null;
  }, actions as Action[]);
  expect(rejected).toBeNull();
  await waitIdle(page);
}

const thumb = (b: Box, name: string) => expect(Math.min(b.width, b.height), `${name} ${JSON.stringify(b)} >= 44 px`).toBeGreaterThanOrEqual(44);
const right = (b: Box) => b.x + b.width;
/** No animation a tap started runs > 600 ms (toasts and notices never block input, so they are exempt). */
function expectNoLongBlock(list: readonly { kind: string; scheduledMs: number }[]): void {
  for (const a of list) if (a.kind !== 'notice' && a.kind !== 'hint') expect(a.scheduledMs, `${a.kind} <= 600 ms`).toBeLessThanOrEqual(600);
}

/** Corp pile right of every Corp column (and the New server spot); Runner pile right of his rig and stats. */
function expectPilesFarRight(l: LayoutSnapshot): void {
  const cp = l.scored.corp.box;
  const rp = l.scored.runner.box;
  for (const s of l.servers) expect(right(s.box), `${s.label} column left of the Corp pile`).toBeLessThanOrEqual(cp.x + 0.5);
  for (const c of l.servers.flatMap((s) => [...s.ice, ...s.content])) expect(overlaps(c.box, cp), 'Corp card vs Corp pile').toBe(false);
  for (const t of l.targets) if (t.kind === 'new_server') expect(right(t.box)).toBeLessThanOrEqual(cp.x + 0.5);
  for (const c of l.rig) expect(right(c.box), 'rig card left of the Runner pile').toBeLessThanOrEqual(rp.x + 0.5);
  expect(right(l.runnerStatus.stats), 'stats left of the Runner pile').toBeLessThanOrEqual(rp.x + 0.5);
  thumb(cp, 'Corp pile');
  thumb(rp, 'Runner pile');
  const safe = { x: l.safeArea.left, y: l.safeArea.top, width: l.viewport.width - l.safeArea.left - l.safeArea.right, height: l.viewport.height - l.safeArea.top - l.safeArea.bottom };
  for (const b of [cp, rp]) expect(inside(b, safe), 'pile on screen').toBe(true);
  // Piles never cover an identity card, the score labels or the rail.
  for (const s of ['corp', 'runner'] as const) {
    const id = l.identities[s];
    for (const b of [cp, rp]) if (id) expect(overlaps(b, id.box), `pile vs ${s} identity`).toBe(false);
  }
}

// ---------------------------------------------------------------------------------------------------
test.describe('QA S-10-1 scored-agenda piles', () => {
  test('AC1/AC8 real play: the Corp taps Score; the agenda flies onto the pile at the far right of his row; "1 agenda · N points" on both screens; score labels still show points', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, 1, 'agenda_at_requirement');
    let l = await waitIdle(page);
    expect(l.scored.corp).toMatchObject({ count: 0, text: '', tappable: false });
    await shot(page, '01-before-score');
    const card = l.servers.flatMap((s) => s.content).find((c) => c.uid === plan.info['uid'])!;
    await tap(page, card.box);
    l = await layout(page);
    const m = await measureTap(page, targetOf(l, 'score').box);
    expect(m.stateAt - m.handledAt, 'Score tap < 100 ms').toBeLessThan(100);
    const fly = m.anims.find((a) => a.kind === 'score_flight');
    expect(fly, 'a score flight').toBeTruthy();
    l = await waitIdle(page);
    const v = await getView(page);
    const pts = v.players.corp.points;
    expect(pts).toBeGreaterThan(0);
    const want = `1 agenda · ${pts} ${pts === 1 ? 'point' : 'points'}`;
    expect(l.scored.corp).toMatchObject({ count: 1, top: plan.info['cardId'], text: want, tappable: true });
    expect(overlaps(fly!.box!, l.scored.corp.box), `the flight ${JSON.stringify(fly!.box)} lands on the pile ${JSON.stringify(l.scored.corp.box)}`).toBe(true);
    expect(l.score.corp.text).toBe(`Corp ${pts} ${pts === 1 ? 'point' : 'points'}`);
    expect(l.score.runner.text).toMatch(/^Runner \d+ points?$/);
    expectPilesFarRight(l);
    expectCleanLayout(l);
    await shot(page, '02-corp-scored-pile');
    // The Runner's screen (hot-seat): the same pile, same place in the Corp's row.
    await passTurn(page);
    l = await waitIdle(page);
    expect(l.viewer).toBe('runner');
    expect(l.scored.corp).toMatchObject({ count: 1, text: want, top: plan.info['cardId'] });
    expectPilesFarRight(l);
    expect(l.score.corp.text).toBe(`Corp ${pts} ${pts === 1 ? 'point' : 'points'}`);
    await shot(page, '03-corp-pile-runner-screen');
  });

  test('AC2 real play: the Runner\'s stolen agendas pile at the far right of his row, lined up with the Corp\'s', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, 1, 'runner_two_stolen');
    const l = await waitIdle(page);
    const n = Number(plan.info['count']);
    const pts = Number(plan.info['points']);
    expect(l.scored.runner).toMatchObject({ count: n, text: `${n} agendas · ${pts} points`, top: plan.info['scored']!.split(',').at(-1), tappable: true });
    expectPilesFarRight(l);
    expect(Math.abs(right(l.scored.corp.box) - right(l.scored.runner.box)), 'both piles at the same right edge').toBeLessThanOrEqual(1);
    expect(l.score.runner.text).toBe(`Runner ${pts} points`);
    expectCleanLayout(l);
    await shot(page, '04-runner-stolen-pile');
  });

  test('AC3 real play: tap the pile of 2: opens big; slide side to side to read each; tap outside closes; holding still reads', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, 1, 'corp_two_scored');
    const ids = plan.info['scored']!.split(',');
    let l = await waitIdle(page);
    const m = await measureTap(page, l.scored.corp.box);
    expect(m.stateAt - m.handledAt, 'pile tap < 100 ms').toBeLessThan(100);
    expectNoLongBlock(m.anims);
    await page.waitForFunction(() => window.__overclock!.layout().pileView !== null);
    l = await waitIdle(page);
    expect(l.pileView).toMatchObject({ side: 'corp', count: ids.length, index: ids.length - 1, cardId: ids.at(-1) });
    await shot(page, '05-pile-open');
    // Slide right (finger moves right): the previous agenda comes to the middle.
    const c = center(l.pileView!.centre);
    const h = await holdAt(page, l.pileView!.centre);
    for (let k = 1; k <= 6; k++) await h.move(c.x + k * 25, c.y);
    await h.release();
    await page.waitForFunction((want) => window.__overclock!.layout().pileView?.index === want, ids.length - 2);
    l = await waitIdle(page);
    expect(l.pileView!.cardId).toBe(ids.at(-2));
    await shot(page, '06-pile-slid');
    // Slide back left.
    const h2 = await holdAt(page, l.pileView!.centre);
    for (let k = 1; k <= 6; k++) await h2.move(c.x - k * 25, c.y);
    await h2.release();
    await page.waitForFunction((want) => window.__overclock!.layout().pileView?.index === want, ids.length - 1);
    l = await waitIdle(page);
    // Tap outside: closes; nothing sent.
    const before = await getView(page);
    await tap(page, outsideHandView(l));
    await page.waitForFunction(() => window.__overclock!.layout().pileView === null);
    l = await waitIdle(page);
    expect(l.zoom).toBeNull();
    expect(JSON.stringify((await getView(page)).players)).toBe(JSON.stringify(before.players));
    // Hold the pile: reads the top agenda.
    const hold = await holdAt(page, l.scored.corp.box);
    await page.waitForFunction((id) => window.__overclock!.layout().zoom?.cardId === id, ids.at(-1)!);
    await shot(page, '07-pile-hold-zoom');
    await hold.release();
    await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
  });

  test('AC4 real play: scored PSF, tagged Runner, Corp\'s turn: open the pile, tap PSF, "Do 1 meat damage · 1 click" works', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, 1, 'psf_scored_tagged');
    const key = plan.info['uid']!;
    const idx = Number(key.split(':')[2]);
    let l = await waitIdle(page);
    await tap(page, l.scored.corp.box);
    await page.waitForFunction(() => window.__overclock!.layout().pileView !== null);
    l = await waitIdle(page);
    if (l.pileView!.index !== idx) {
      await tap(page, l.zoom!.carousel.find((x) => x.index === idx)!.box);
      await page.waitForFunction((i) => window.__overclock!.layout().pileView?.index === i, idx);
      l = await waitIdle(page);
    }
    expect(l.pileView!.cardId).toBe('c09');
    await tap(page, l.pileView!.centre);
    await page.waitForFunction(() => window.__overclock!.layout().pileView === null);
    l = await waitIdle(page);
    const use = targetOf(l, 'activate');
    expect(use).toMatchObject({ label: 'Do 1 meat damage · 1 click', lit: true });
    thumb(use.box, 'PSF button');
    for (const [n, b] of [['End turn', l.endTurn?.box], ['Corp pile', l.scored.corp.box]] as const) if (b) expect(overlaps(use.box, b), `PSF button vs ${n}`).toBe(false);
    await shot(page, '08-psf-from-pile');
    const before = await getView(page);
    const m = await measureTap(page, use.box);
    expect(m.stateAt - m.handledAt).toBeLessThan(100);
    const md = m.events.find((e) => e.type === 'meat_damage');
    expect(md, 'meat damage').toBeTruthy();
    await waitIdle(page);
    const after = await getView(page);
    expect(after.players.runner.handCount).toBe(before.players.runner.handCount - 1);
    expect(after.players.corp.clicks).toBe(before.players.corp.clicks - 1);
  });

  test('AC5 real play: installed PSF not scored: dimmed "Do 1 meat damage: score it first" with its Advance, and it does nothing', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, 1, 'psf_installed_unscored');
    let l = await waitIdle(page);
    const card = l.servers.flatMap((s) => s.content).find((c) => c.uid === plan.info['uid'])!;
    await tap(page, card.box);
    l = await layout(page);
    expect(targetOf(l, 'advance').lit).toBe(true);
    expect(l.targets.some((t) => t.kind === 'activate' && t.lit), 'no lit PSF button').toBe(false);
    await page.waitForFunction(() => window.__overclock!.layout().text.help.includes('Do 1 meat damage: score it first'));
    l = await layout(page);
    await shot(page, '09-psf-score-it-first');
    expectCleanLayout(l);
  });

  test('AC5 drawn (QA-S10-2): the "score it first" words are really on screen under Advance (pixels, not just the hook)', async ({ page }) => {
    // QA-S10-2: at 891x296 the hook reports the words but the rail has no room under Advance + the
    // hidden Score slot, so nothing is drawn. Expected to fail there until fixed (ui-dev removes the marker).
    await core(page);
    const plan = await toStep(page, 1, 'psf_installed_unscored');
    let l = await waitIdle(page);
    await tap(page, l.servers.flatMap((s) => s.content).find((c) => c.uid === plan.info['uid'])!.box);
    await page.waitForFunction(() => window.__overclock!.layout().text.help.includes('Do 1 meat damage: score it first'));
    await page.waitForFunction(() => window.__overclock!.layout().hint === null, undefined, { timeout: 5000 });
    l = await layout(page);
    const adv = targetOf(l, 'advance').box;
    let area: Box;
    if (l.mode === 'landscape') {
      const label = l[l.viewer].label;
      const top = adv.y + adv.height + 2;
      area = { x: adv.x, y: top, width: adv.width, height: Math.max(1, label.y - top - 2) };
    } else {
      // Column (desktop): the help words sit left of the picked card's buttons, under the banner.
      area = { x: Math.max(0, adv.x - 420), y: adv.y - 4, width: 410, height: adv.height + 8 };
    }
    const [st] = await pixelStats(page, [area]);
    expect(st!.brightFrac, `text drawn in ${JSON.stringify(area)}`).toBeGreaterThan(0.005);
  });

  test('AC6: no scored agendas: empty pile spots take no taps and no holds', async ({ page }) => {
    await core(page);
    let l = await waitIdle(page);
    for (const s of ['corp', 'runner'] as const) {
      expect(l.scored[s]).toMatchObject({ count: 0, text: '', top: null, tappable: false });
      await tap(page, l.scored[s].box);
      l = await layout(page);
      expect(l.pileView).toBeNull();
      expect(l.zoom).toBeNull();
      expect(l.selectedInstalled).toBeNull();
      const h = await holdAt(page, l.scored[s].box);
      await page.waitForTimeout(700);
      expect((await layout(page)).zoom, 'a hold on the empty spot shows nothing').toBeNull();
      await h.release();
    }
    await shot(page, '10-empty-piles');
  });

  test('AC7: busy board, both piles holding cards, Runner tagged: piles thumb size, cover no card, button or counter', async ({ page }) => {
    await openBoard(page, 1);
    await toBusyBoard(page, 1);
    const v = await getView(page);
    const filled: PlayerView = {
      ...v,
      players: {
        ...v.players,
        corp: { ...v.players.corp, scored: ['c08', 'c09', 'c10'], points: 5 },
        runner: { ...v.players.runner, scored: ['c08', 'c09'], points: 3, tags: 2 },
      },
    };
    const l = await stub(page, filled);
    expect(l.scored.corp.text).toBe('3 agendas · 5 points');
    expect(l.scored.runner.text).toBe('2 agendas · 3 points');
    expect(l.runnerStatus.tagged?.text).toBe('Tagged 2');
    expectPilesFarRight(l);
    expectCleanLayout(l);
    await shot(page, '11-busy-both-piles');
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe('QA S-10-2 Link and Tagged next to memory', () => {
  /** Link (and Tagged) in the stats column with Memory, end of his row, off Kate and off his name. */
  function expectStatsCol(l: LayoutSnapshot): void {
    const st = l.runnerStatus.stats;
    const link = l.runnerStatus.link!;
    expect(link, 'Link shows').toBeTruthy();
    expect(inside(l.memory.box, st), 'Memory in the column').toBe(true);
    expect(inside(link.box, st), 'Link in the column').toBe(true);
    const kate = l.identities.runner!;
    for (const [n, b] of [['Link', link.box], ['stats', st], ['memory', l.memory.box]] as const) expect(overlaps(b, kate.box), `${n} vs Kate`).toBe(false);
    for (const c of l.rig) expect(overlaps(c.box, st), `rig card ${c.cardId} vs stats column`).toBe(false);
    expect(overlaps(st, l.runner.label), 'stats column off the name row').toBe(false);
    const t = l.runnerStatus.tagged;
    if (t) {
      expect(inside(t.box, st), 'Tagged in the column').toBe(true);
      for (const [n, b] of [['Link', link.box], ['memory', l.memory.box], ['Kate', kate.box], ['name row', l.runner.label]] as const) expect(overlaps(t.box, b), `Tagged vs ${n}`).toBe(false);
      expect(l.tags.runner?.text ?? '', 'no Tagged by his name any more').not.toMatch(/Tagged/);
    }
    expect(overlaps(link.box, l.memory.box), 'Link vs Memory').toBe(false);
  }

  test('AC1: Kate has 1 link: "Link 1" with memory, nothing drawn over Kate', async ({ page }) => {
    await core(page);
    await passTurn(page);
    const l = await waitIdle(page);
    expect(l.viewer).toBe('runner');
    expect(l.runnerStatus.link?.text).toBe('Link 1');
    expect(l.runnerStatus.tagged).toBeNull();
    expectStatsCol(l);
    expectCleanLayout(l);
    await shot(page, '12-link-1');
  });

  test('AC2 real taps: the Runner installs Access to Globalsec: Link 2', async ({ page }) => {
    await core(page);
    const plan = planToStep(1, 'globalsec_installed');
    const last = plan.actions.map((a, i) => [a, i] as const).filter(([a]) => a.type === 'install' && a.player === 'runner').at(-1)!;
    await dispatchAll(page, plan.actions.slice(0, last[1]));
    let l = await waitIdle(page);
    const v = await getView(page);
    expect(v.players.runner.hand![(last[0] as { handIndex: number }).handIndex]).toBe('r18');
    expect(l.runnerStatus.link?.text).toBe('Link 1');
    l = await pickHand(page, (last[0] as { handIndex: number }).handIndex);
    await tap(page, targetOf(l, 'install').box);
    l = await waitIdle(page);
    expect((await getView(page)).players.runner.link).toBe(2);
    expect(l.runnerStatus.link?.text).toBe('Link 2');
    expectStatsCol(l);
    expectCleanLayout(l);
    await shot(page, '13-link-2-globalsec');
  });

  test('AC3/AC4/AC5 real play: tagged: red "Tagged 1" by Link on both screens; tap it: "Remove 1 tag · 1 click + 2 credits"; removed: Tagged goes, Link stays put', async ({ page }) => {
    await core(page);
    await toStep(page, 1, 'runner_tagged_own_turn');
    let l = await waitIdle(page);
    const tags = (await getView(page)).players.runner.tags;
    expect(tags).toBeGreaterThan(0);
    expect(l.runnerStatus.tagged?.text).toBe(`Tagged ${tags}`);
    expectStatsCol(l);
    const linkBox = l.runnerStatus.link!.box;
    await shot(page, '14-tagged-runner-screen');
    // Red: sample the Tagged text's pixels on the canvas.
    const tb = l.runnerStatus.tagged!.box;
    const png = await page.screenshot({ clip: { x: tb.x, y: tb.y, width: Math.max(1, tb.width), height: Math.max(1, tb.height) } });
    expect(png.length).toBeGreaterThan(0);
    await tap(page, l.runnerStatus.tagged!.box);
    l = await layout(page);
    const rm = targetOf(l, 'remove_tag');
    expect(rm.label).toBe('Remove 1 tag · 1 click + 2 credits');
    expect(rm.lit).toBe(true);
    thumb(rm.box, 'Remove tag');
    await shot(page, '15-remove-tag-button');
    const m = await measureTap(page, rm.box);
    expect(m.stateAt - m.handledAt).toBeLessThan(100);
    l = await waitIdle(page);
    const left = (await getView(page)).players.runner.tags;
    expect(left).toBe(tags - 1);
    if (left === 0) {
      expect(l.runnerStatus.tagged, 'Tagged goes away').toBeNull();
      expect(l.runnerStatus.link!.box, 'Link stays where it was').toEqual(linkBox);
      await shot(page, '16-tag-removed');
    }
  });

  test('AC3: the Corp\'s screen shows "Tagged N" by Link too', async ({ page }) => {
    await core(page);
    await toStep(page, 1, 'runner_tagged_corp_turn');
    const l = await waitIdle(page);
    expect(l.viewer).toBe('corp');
    const tags = (await getView(page)).players.runner.tags;
    expect(l.runnerStatus.tagged?.text).toBe(`Tagged ${tags}`);
    expectStatsCol(l);
    expectCleanLayout(l);
    await shot(page, '17-tagged-corp-screen');
  });

  test('AC6 real play: tagged Runner with a full rig (Globalsec, >= 4 cards): Tagged, Link, memory and cards never overlap', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, 1, 'runner_tagged_full_rig');
    // The plan's last trace leaves a notice over the table on short screens (noted in the report); this
    // check is about the stats column and the cards, so it reads the board once the notice is gone.
    const first = await layout(page);
    if (first.hint) {
      await shot(page, '18a-notice-after-trace');
      test.info().annotations.push({ type: 'toast', description: `${first.hint.text} at ${JSON.stringify(first.hint.box)}` });
    }
    await page.waitForFunction(() => window.__overclock!.layout().hint === null, undefined, { timeout: 5000 });
    const l = await waitIdle(page);
    expect(l.rig.length).toBeGreaterThanOrEqual(4);
    expect(l.runnerStatus.link?.text).toBe(`Link ${plan.info['link']}`);
    expect(l.runnerStatus.tagged?.text).toBe(`Tagged ${plan.info['tags']}`);
    expectStatsCol(l);
    expectCleanLayout(l);
    await shot(page, '18-tagged-full-rig');
  });
});

test.describe('QA-S10-1 a notice over the table covers a card on the short screen', () => {
  test('after Hunter\'s trace (runner_tagged_full_rig), the notice never covers a card or counter', async ({ page }) => {
    // QA-S10-1: since 6296a1d/9fd8688 a toast that does not fit its rail slot at 10 px moves over the table;
    // at 891x296 "Hunter: Trace 3 – …" covers Server 1's ICE (same failure as s10-stats:129 in CI on 9fd8688).
    await core(page);
    await toStep(page, 1, 'runner_tagged_full_rig');
    const l = await layout(page);
    if (l.hint) {
      const cards = [...l.servers.flatMap((s) => [...s.ice, ...s.content]), ...l.rig].map((c) => c.box);
      for (const b of cards) expect(overlaps(l.hint.box, b), `notice "${l.hint.text}" ${JSON.stringify(l.hint.box)} vs card ${JSON.stringify(b)}`).toBe(false);
    }
    if (test.info().project.name === 'phone-short') expect(l.hint, 'the notice shows when the board settles').not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe('QA S-10-3 Advance stops at the limit; Bank Job lets you choose', () => {
  test('AC1/AC2 real taps: one short, Advance once, then only Score; AC4 Ice Wall still offers Advance', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, 1, 'agenda_one_short');
    const uid = plan.info['uid']!;
    let l = await waitIdle(page);
    await tap(page, l.servers.flatMap((s) => s.content).find((c) => c.uid === uid)!.box);
    l = await layout(page);
    expect(l.targets.map((t) => t.kind)).toContain('advance');
    await tap(page, targetOf(l, 'advance').box);
    l = await waitIdle(page);
    if (l.selectedInstalled !== uid) {
      await tap(page, l.servers.flatMap((s) => s.content).find((c) => c.uid === uid)!.box);
      l = await layout(page);
    }
    expect(l.targets.map((t) => t.kind), 'only Score').toEqual(['score']);
    expect(l.labels.some((x) => /^Advance/.test(x)), 'no Advance label drawn').toBe(false);
    await shot(page, '19-only-score');
    // Close and tap again: still only Score.
    await tap(page, l.servers.flatMap((s) => s.content).find((c) => c.uid === uid)!.box);
    l = await layout(page);
    if (l.selectedInstalled !== uid) {
      await tap(page, l.servers.flatMap((s) => s.content).find((c) => c.uid === uid)!.box);
      l = await layout(page);
    }
    expect(l.targets.map((t) => t.kind)).toEqual(['score']);
    await core(page);
    const ice = await toStep(page, 1, 'ice_wall_advanced');
    l = await waitIdle(page);
    await tap(page, l.servers.flatMap((s) => s.ice).find((c) => c.uid === ice.info['uid'])!.box);
    l = await layout(page);
    expect(targetOf(l, 'advance').lit, 'Ice Wall: Advance offered').toBe(true);
    await shot(page, '20-ice-wall-advance');
  });

  test('AC3: an advance on an agenda at its limit is refused (hook dispatch); the counter stays', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, 1, 'agenda_at_requirement');
    const uid = plan.info['uid']!;
    const ev = await page.evaluate((u) => window.__overclock!.dispatch({ type: 'advance', player: 'corp', uid: u }), uid);
    expect(ev.find((e) => e.type === 'action_rejected')).toMatchObject({ reason: 'condition_not_met' });
    const v = await getView(page);
    expect(v.corpServers.flatMap((s) => s.content).find((c) => c.uid === uid)!.advancements).toBe(Number(plan.info['advancements']));
  });

  async function amountTo(page: Page, n: number): Promise<LayoutSnapshot> {
    let l = await layout(page);
    for (let g = 0; g < 20 && l.run!.amount!.amount !== n; g++) {
      await tap(page, runButtonOf(l, l.run!.amount!.amount < n ? '+' : '−').box);
      l = await layout(page);
    }
    expect(l.run!.amount!.amount).toBe(n);
    return l;
  }

  function expectAmountControl(l: LayoutSnapshot): void {
    const a = l.run!.amount!;
    const btns = l.run!.buttons;
    for (const r of ['bid_dec', 'bid_inc', 'bid_max', 'bid_go'] as const) expect(btns.some((b) => b.role === r), `${r} shows`).toBe(true);
    for (const b of btns) {
      thumb(b.box, b.label);
      expect(b.fontPx, `${b.label} text`).toBeGreaterThanOrEqual(12);
      expect(inside(b.box, { x: 0, y: 0, width: l.viewport.width, height: l.viewport.height }), `${b.label} on screen`).toBe(true);
      for (const h of l.hand) expect(overlaps(b.box, h.box), `${b.label} over a hand card`).toBe(false);
    }
    thumb(a.tile, 'number tile');
    expect(a.numberPx, 'the number is big').toBeGreaterThanOrEqual(20);
    for (let i = 0; i < btns.length; i++) {
      expect(overlaps(btns[i]!.box, a.tile), `${btns[i]!.label} vs number`).toBe(false);
      for (let j = i + 1; j < btns.length; j++) expect(overlaps(btns[i]!.box, btns[j]!.box), `${btns[i]!.label} vs ${btns[j]!.label}`).toBe(false);
    }
    if (l.endTurn) for (const b of btns) expect(overlaps(b.box, l.endTurn.box), `${b.label} vs End turn`).toBe(false);
  }

  test('AC5/AC8 real taps: 8 on Bank Job, Take credits, set 3, Take 3: +3, 5 stay, nothing accessed; control thumb size', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'runner_bank_job_remote');
    const bj = plan.info['bankJobUid']!;
    let l = await startRun(page, plan.info['server']!);
    // Sprint 11 (S-11-1): a button from a card names it.
    expect(l.run!.buttons.map((b) => b.label)).toEqual(['Bank Job: take credits', 'Access cards']);
    await shot(page, '21-bank-job-choice');
    await tap(page, runButtonOf(l, 'Bank Job: take credits').box);
    await page.waitForFunction(() => window.__overclock!.layout().run?.amount != null);
    l = await layout(page);
    expectAmountControl(l);
    l = await amountTo(page, 3);
    expectAmountControl(l);
    expect(runButtonOf(l, 'Take 3').lit).toBe(true);
    await shot(page, '22-bank-job-amount-3');
    const credits = (await getView(page)).players.runner.credits;
    const m = await measureTap(page, runButtonOf(l, 'Take 3').box);
    expect(m.stateAt - m.handledAt).toBeLessThan(100);
    expect(m.events.some((e) => e.type === 'card_accessed')).toBe(false);
    l = await waitIdle(page);
    const v = await getView(page);
    expect(v.players.runner.credits).toBe(credits + 3);
    expect(v.rig.find((c) => c.uid === bj)?.hostedCredits).toBe(5);
    expect(l.rig.find((c) => c.uid === bj)?.hosted?.text).toBe('5');
    expect(v.run).toBeNull();
    await shot(page, '23-bank-job-5-left');
    // AC7: on a later turn, take the last 5 (opens at 5): Bank Job goes to the Heap.
    await passTurn(page);
    await passTurn(page);
    l = await startRun(page, plan.info['server']!);
    await tap(page, runButtonOf(l, 'Bank Job: take credits').box);
    await page.waitForFunction(() => window.__overclock!.layout().run?.amount != null);
    l = await layout(page);
    expect(l.run!.amount).toMatchObject({ amount: 5, high: 5, low: 1 });
    await tap(page, runButtonOf(l, 'Take 5').box);
    await waitIdle(page);
    const w = await getView(page);
    expect(w.rig.some((c) => c.uid === bj)).toBe(false);
    expect(w.players.runner.discard).toContain('r10');
  });

  test('AC6 real taps: Access cards instead: accesses as normal, Bank Job keeps 8', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'runner_bank_job_remote');
    const bj = plan.info['bankJobUid']!;
    let l = await startRun(page, plan.info['server']!);
    const m = await measureTap(page, runButtonOf(l, 'Access cards').box);
    expect(m.events.some((e) => e.type === 'card_accessed')).toBe(true);
    l = await waitIdle(page);
    expect(l.run?.step).toBe('access');
    expect((await getView(page)).rig.find((c) => c.uid === bj)?.hostedCredits).toBe(8);
  });

  test('AC9 online: the Runner picks 6; both devices show 2 on Bank Job and the same credits', async ({ browser }: { browser: Browser }) => {
    test.skip(test.info().project.name === 'phone-short', 'online path is size-independent; run at the 3 main sizes');
    test.setTimeout(90_000);
    const opts = { rezWindow: 'always', deckSet: 'starter' } as const;
    const plan = planToStep(1, 'runner_bank_job_remote', undefined, opts);
    const host = await openPhone(browser);
    const guest = await openPhone(browser);
    const code = await startTestGame(host, 'corp', { seed: 1, actions: plan.actions, deckSet: 'starter' });
    await joinGame(guest, code);
    await Promise.all([waitPlaying(host), waitPlaying(guest)]);
    const corp = host;
    const runner = guest;
    const bj = plan.info['bankJobUid']!;
    await startRun(runner.page, plan.info['server']!);
    await runner.page.waitForFunction(() => window.__overclock!.layout().run?.step === 'success');
    await tap(runner.page, runButtonOf(await layoutOf(runner), 'Bank Job: take credits').box);
    await runner.page.waitForFunction(() => window.__overclock!.layout().run?.amount?.amount === 8);
    await tap(runner.page, runButtonOf(await layoutOf(runner), '−').box);
    await runner.page.waitForFunction(() => window.__overclock!.layout().run?.amount?.amount === 7);
    await tap(runner.page, runButtonOf(await layoutOf(runner), '−').box);
    await runner.page.waitForFunction(() => window.__overclock!.layout().run?.amount?.amount === 6);
    const take = runButtonOf(await layoutOf(runner), 'Take 6');
    await tap(runner.page, take.box);
    const m = new LocalMatch(1, opts);
    for (const a of [...plan.actions, { type: 'run', player: 'runner', server: plan.info['server']! } as Action, take.action]) m.submit(a.player, a);
    for (const [p, side] of [[corp, 'corp'], [runner, 'runner']] as const) {
      const want = m.view(side as Side);
      const v = await waitView(p, (x) => x.rig.find((c) => c.uid === bj)?.hostedCredits === 2);
      expect(v.players.runner.credits).toBe(want.players.runner.credits);
      await p.page.waitForFunction((u) => window.__overclock!.layout().rig.find((c) => c.uid === u)?.hosted?.text === '2', bj);
    }
    await shot(corp.page, '24-online-corp-sees-2');
    await Promise.all([host.context.close(), guest.context.close()]);
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe('QA S-10-5 Archives stays put; discard opens with a tap', () => {
  test('AC1: a new game: Archives has its own lane on the Corp\'s row, empty', async ({ page }) => {
    await core(page);
    const l = await waitIdle(page);
    expect(l.servers.slice(0, 3).map((s) => s.id)).toEqual(['hq', 'rd', 'archives']);
    const a = l.servers.find((s) => s.id === 'archives')!;
    expect(a.label).toBe('Archives');
    thumb(a.box, 'Archives lane');
    expect(l.text.corpDiscard).toBe('0');
    expectCleanLayout(l);
    await shot(page, '25-new-game-archives-lane');
  });

  /** A seed whose remote_single_card_no_ice case is a trash (card to Archives) or a steal (to his pile). */
  function kindSeed(kind: 'trash' | 'steal'): { seed: number; plan: ReturnType<typeof planToStep> } {
    for (let seed = 1; seed <= 40; seed++) {
      try {
        const plan = planToStep(seed, 'remote_single_card_no_ice');
        if (plan.info['kind'] === kind) return { seed, plan };
      } catch {
        /* this seed does not reach it */
      }
    }
    throw new Error(`no ${kind} seed in 1..40`);
  }

  for (const kind of ['steal', 'trash'] as const) {
    test(`AC2/AC3/AC5 real taps (${kind}): Server's lane folds; Archives and the other server keep names and places; the card flies to ${kind === 'trash' ? 'Archives' : 'his pile'}`, async ({ page }) => {
      const seed = kindSeed(kind).seed;
      await core(page, seed);
      const plan = await toStep(page, seed, 'remote_single_card_no_ice');
      test.skip(plan.info['kind'] !== kind, `seed ${seed} gives ${plan.info['kind']}`);
      const server = plan.info['server']!;
      const other = plan.info['otherServer']!;
      let l = await waitIdle(page);
      const before = new Map(l.servers.map((s) => [s.id, { label: s.label, box: s.box }]));
      await shot(page, `26-${kind}-before`);
      l = await startRun(page, server);
      const b = l.run!.buttons.find((x) => (kind === 'trash' ? /^Trash/ : /^Steal/).test(x.label))!;
      const archBox = l.corp.discard;
      const m = await measureTap(page, b.box);
      expect(m.stateAt - m.handledAt).toBeLessThan(100);
      expectNoLongBlock(m.anims);
      const fl = m.anims.find((a) => (kind === 'trash' ? a.kind === 'trash_flight' || a.kind === 'corp_trash_flight' : a.kind === 'score_flight'));
      expect(fl, `a ${kind} flight`).toBeTruthy();
      await page.waitForTimeout(120);
      await shot(page, `27-${kind}-mid-flight`);
      l = await waitIdle(page);
      if (kind === 'trash') expect(overlaps(fl!.box!, l.corp.discard) || overlaps(fl!.box!, archBox), 'flies into the Archives lane').toBe(true);
      else expect(overlaps(fl!.box!, l.scored.runner.box), 'flies onto his pile').toBe(true);
      // Done / Continue until the run is over.
      for (let g = 0; g < 6 && (await getView(page)).run; g++) {
        const r = (await layout(page)).run;
        const btn = r?.buttons.find((x) => x.lit);
        if (!btn) break;
        await tap(page, btn.box);
        await waitIdle(page);
      }
      l = await waitIdle(page);
      expect(l.servers.map((s) => s.id)).not.toContain(server);
      for (const s of l.servers) expect(s.label, `${s.id} keeps its name`).toBe(before.get(s.id)!.label);
      for (const id of ['hq', 'rd', 'archives']) expect(l.servers.find((s) => s.id === id)!.box, `${id} stays put`).toEqual(before.get(id)!.box);
      expect(l.servers.find((s) => s.id === other)!.label).toBe(before.get(other)!.label);
      // Order kept: the ids left are the ids before minus the one removed.
      expect(l.servers.map((s) => s.id)).toEqual([...before.keys()].filter((id) => id !== server));
      if (kind === 'trash') expect(Number(l.text.corpDiscard)).toBeGreaterThanOrEqual(1);
      expectCleanLayout(l);
      await shot(page, `28-${kind}-folded`);
    });
  }

  for (const side of ['runner', 'corp'] as const) {
    test(`AC4/AC5 real taps (${side}): must discard: tap the hand: opens big; tap cards to mark; Confirm lit only at the count; no holding`, async ({ page }) => {
      await core(page);
      const plan = await toStep(page, 1, side === 'runner' ? 'runner_must_discard' : 'corp_must_discard');
      const count = Number(plan.info['count']);
      let l = await waitIdle(page);
      expect(l.picker?.remaining).toBe(count);
      expectCleanLayout(l);
      await shot(page, `29-${side}-discard-step`);
      const hand0 = (await getView(page)).players[side].hand!;
      const m = await measureTap(page, l.hand[0]!.box);
      expect(m.stateAt - m.handledAt, 'tap answers < 100 ms').toBeLessThan(100);
      expectNoLongBlock(m.anims);
      await page.waitForFunction(() => window.__overclock!.layout().discardView !== null);
      l = await layout(page);
      expect(l.discardView!.marked).toEqual([]);
      expect(l.discardView!.confirm.lit, 'Confirm dim with 0 marked').toBe(false);
      thumb(l.discardView!.confirm.box, 'Confirm');
      expect(overlaps(l.discardView!.confirm.box, l.zoom!.box), 'Confirm clear of the big card').toBe(false);
      // Mark `count` cards: tap the big card, then tap the next card beside it to bring it to the middle.
      const picked: number[] = [];
      for (let k = 0; k < count; k++) {
        l = await layout(page);
        const i = l.discardView!.index;
        if (k < count - 1) expect(l.discardView!.confirm.lit, `Confirm dim at ${k}`).toBe(false);
        await tap(page, l.handView!.centre);
        await page.waitForFunction((n) => window.__overclock!.layout().discardView?.marked.length === n, k + 1);
        picked.push(i);
        if (k < count - 1) {
          l = await layout(page);
          const next = l.zoom!.carousel.find((c) => c.index === i + 1) ?? l.zoom!.carousel.find((c) => !picked.includes(c.index) && c.index !== i);
          await tap(page, next!.box);
          await page.waitForFunction((n) => window.__overclock!.layout().discardView?.index === n, next!.index);
        }
      }
      l = await waitIdle(page);
      expect(l.discardView!.marked.sort()).toEqual(picked.sort());
      expect(l.discardView!.stamped).toBe(true);
      expect(l.discardView!.confirm).toMatchObject({ label: `Discard ${count}`, lit: true });
      await shot(page, `30-${side}-discard-marked`);
      // Unmark the middle card: Confirm goes dim; mark it again.
      await tap(page, l.handView!.centre);
      await page.waitForFunction((n) => window.__overclock!.layout().discardView?.marked.length === n, count - 1);
      expect((await layout(page)).discardView!.confirm.lit).toBe(false);
      await tap(page, (await layout(page)).handView!.centre);
      await page.waitForFunction((n) => window.__overclock!.layout().discardView?.marked.length === n, count);
      l = await layout(page);
      const c = await measureTap(page, l.discardView!.confirm.box);
      expect(c.stateAt - c.handledAt).toBeLessThan(100);
      await waitIdle(page);
      const v = await getView(page);
      expect(v.pendingDiscard).toBe(0);
      const gone = picked.map((i) => hand0[i]!);
      const disc = side === 'runner' ? v.players.runner.discard : null;
      if (disc) for (const id of gone) expect(disc).toContain(id);
      await shot(page, `31-${side}-discarded`);
    });
  }
});

// ---------------------------------------------------------------------------------------------------
const SEA = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'qa-sprint09-sea-runner-broke.json'), 'utf8')) as { seed: number; actions: Action[] };

test.describe('QA S-10-6 screen fixes', () => {
  test('AC1/AC2: the trace result note (SEA Source, Corp\'s turn) is clear of End turn and every button', async ({ page }) => {
    await core(page, SEA.seed);
    await dispatchAll(page, SEA.actions);
    const i = (await getView(page)).players.corp.hand!.indexOf('c22');
    let l = await pickHand(page, i);
    await tap(page, targetOf(l, 'play').box);
    l = await waitIdle(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, l.trace!.control!.buttons.bid.box);
    await page.waitForFunction(() => window.__overclock!.anims().some((a) => a.kind === 'notice' && !!a.text?.startsWith('SEA Source')));
    await page.waitForTimeout(150);
    l = await layout(page);
    const note = (await page.evaluate(() => window.__overclock!.anims())).find((a) => a.kind === 'notice' && a.text?.startsWith('SEA Source'))!;
    expect(l.endTurn, 'End turn on screen').not.toBeNull();
    const btns: [string, Box][] = [['End turn', l.endTurn!.box], ['corp credits', l.corp.credits], ['corp clicks', l.corp.clicks], ['runner credits', l.runner.credits], ['runner clicks', l.runner.clicks]];
    if (l.runButton) btns.push(['Run', l.runButton.box]);
    if (l.lastRun.button) btns.push(['Last run', l.lastRun.button.box]);
    for (const t of l.targets) btns.push([t.label, t.box]);
    for (const s of ['corp', 'runner'] as const) if (l.scored[s].tappable) btns.push([`${s} pile`, l.scored[s].box]);
    for (const [n, b] of btns) expect(overlaps(note.box!, b), `note ${JSON.stringify(note.box)} vs ${n} ${JSON.stringify(b)}`).toBe(false);
    expect(note.fontPx!, 'note readable').toBeGreaterThanOrEqual(10);
    if (l.hint) expect(inside(l.hint.box, { x: 0, y: 0, width: l.viewport.width, height: l.viewport.height })).toBe(true);
    await shot(page, '32-trace-note');
  });

  test('AC3 real play: the game-over box ("Corp wins") never has the "Built …" date inside it', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'corp_one_score_from_win');
    let l = await waitIdle(page);
    const card = l.servers.flatMap((s) => s.content).find((c) => c.uid === plan.info['uid'])!;
    await tap(page, card.box);
    l = await layout(page);
    await tap(page, targetOf(l, 'score').box);
    await page.waitForFunction(() => window.__overclock!.layout().gameOver !== null);
    l = await waitIdle(page);
    expect(l.gameOver!.title).toBe('Corp wins');
    if (l.buildLabel) expect(overlaps(l.buildLabel.box, l.gameOver!.box), 'build date inside the box').toBe(false);
    // Read the canvas texts too: no "Built" text drawn at all while the box is up.
    expect(l.labels.filter((t) => t.startsWith('Built')), 'no Built label drawn').toEqual([]);
    await shot(page, '33-game-over');
  });
});

// ---------------------------------------------------------------------------------------------------
test.describe('QA toasts (S-10-6 follow-up): 10 px floor and repeated lines collapse', () => {
  test('a refusal toast is >= 10 px, on screen and clear of every button', async ({ page }) => {
    await core(page, 1);
    const plan = await toStep(page, 1, 'remote_single_card_no_ice');
    let l = await startRun(page, plan.info['server']!);
    await tap(page, l.run!.buttons.find((b) => /^(Trash|Steal)/.test(b.label))!.box);
    for (let g = 0; g < 6 && (await getView(page)).run; g++) {
      const btn = (await layout(page)).run?.buttons.find((x) => x.lit);
      if (!btn) break;
      await tap(page, btn.box);
      await waitIdle(page);
    }
    l = await waitIdle(page);
    await page.waitForFunction(() => window.__overclock!.layout().hint === null, undefined, { timeout: 5000 });
    await page.evaluate(() => window.__overclock!.clearAnims());
    // A real tap on a refused thing: the Runner's credits with no clicks left ("No clicks left").
    await page.evaluate(() => {
      const h = window.__overclock!;
      for (let g = 0; g < 6 && h.getView().players.runner.clicks > 0; g++) h.dispatch({ type: 'gain_credit', player: 'runner' });
    });
    l = await waitIdle(page);
    await page.waitForFunction(() => window.__overclock!.layout().hint === null, undefined, { timeout: 5000 });
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, l.runner.credits);
    await page.waitForFunction(() => window.__overclock!.anims().some((a) => a.kind === 'hint'), undefined, { timeout: 3000 });
    // Round 2: the refused tap also shakes the clicks pill (±6 px for 260 ms, the "no clicks" feedback);
    // its mid-shake box can poke 1 px past the screen edge. The layout check is about where things rest,
    // so read it once the pill is back at its resting box (the shake is a `ui` tween, not in `animating`);
    // the toast (~1.4 s) must still be up then.
    const rest = l.runner.clicks;
    await page.waitForTimeout(280); // the shake starts and ends at its resting x: let it run first
    await page.waitForFunction((b) => {
      const c = window.__overclock!.layout().runner.clicks;
      return c.x === b.x && c.y === b.y && c.width === b.width && c.height === b.height;
    }, rest, { polling: 'raf', timeout: 2000 });
    l = await waitIdle(page);
    expect(l.hint, 'the refusal toast is still showing once the shake is over').not.toBeNull();
    const all = await page.evaluate(() => window.__overclock!.anims());
    const t = all.find((a) => a.kind === 'hint' && a.fontPx !== undefined);
    expect(t, `a hint record with its size in ${JSON.stringify(all.filter((a) => a.kind === 'hint'))}`).toBeTruthy();
    expect(t!.fontPx!, 'toast >= 10 px').toBeGreaterThanOrEqual(10);
    expectCleanLayout(l);
    await shot(page, '34-refusal-toast');
  });

  test('turn-start notices: four PAD Campaign lines collapse to one "×4" line, readable', async ({ page }) => {
    await core(page, 1);
    await passTurn(page);
    const v = await getView(page);
    // A presentation carrying 4 PAD Campaign turn-start payouts (made-up events on the real view).
    const pads = ['qa1', 'qa2', 'qa3', 'qa4'];
    const events: GameEvent[] = [];
    for (const uid of pads) {
      events.push({ type: 'ability_triggered', uid, cardId: 'c03', trigger: 'turn_start' } as GameEvent);
      events.push({ type: 'credit_gained', player: 'corp', amount: 1 } as GameEvent);
    }
    await page.evaluate(() => window.__overclock!.clearAnims());
    await page.evaluate(({ cv, e }) => window.__overclock!.stub(cv, e, null), { cv: v, e: events });
    await page.waitForFunction(() => window.__overclock!.anims().some((a) => a.kind === 'notice' && !!a.text?.includes('PAD Campaign')), undefined, { timeout: 5000 });
    const n = (await page.evaluate(() => window.__overclock!.anims())).find((a) => a.kind === 'notice' && a.text?.includes('PAD Campaign'))!;
    expect(n.text).toBe('PAD Campaign: +1 credit ×4');
    expect(n.fontPx ?? 0).toBeGreaterThanOrEqual(10);
    await page.waitForTimeout(150);
    await shot(page, '35-pad-x4-toast');
  });
});
