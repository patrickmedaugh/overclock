// Sprint 10 (S-10-2): Link and Tagged sit together under Memory, in the stats column at the
// end of the Runner's row (just left of his scored pile), off Kate's identity card and off
// his name row. Real core-deck boards (Globalsec's link from real play) plus made-up views
// (the test hook's `stub`) for a tagged Runner with a full rig. Real taps. Screens at
// 640x360 and 891x296 go to docs/sprints/sprint-10-screens/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';
import type { CardOption, GameEvent, InstalledView, PlayerView } from '@overclock/engine';
import type { Box, LayoutSnapshot } from '../src/hook-types';
import { expectCleanLayout, getView, inside, layout, overlaps, passTurn, tap, targetOf, toStep, waitIdle } from './helpers';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-10-screens');
const SEED = 1;

/** Screens go to the report; at 640x360 and 891x296 also to the sprint's screens folder. */
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

const card = (uid: string, cardId: string, hostedCredits = 0): InstalledView => ({ uid, cardId, faceUp: true, advancements: 0, hostedCredits });

/** A full rig (more than the 4 cards the row plans for), Globalsec among them. */
const FULL_RIG: InstalledView[] = [card('s10a', 'r04'), card('s10b', 'r05'), card('s10c', 'r06'), card('s10d', 'r18'), card('s10e', 'r09'), card('s10f', 'r02', 12)];

function tagged(v: PlayerView, tags: number, rig: readonly InstalledView[] = v.rig, link = v.players.runner.link): PlayerView {
  return { ...v, rig, players: { ...v.players, runner: { ...v.players.runner, tags, link } } };
}

/** Link and Tagged: in the stats column under Memory, clear of each other, Kate and the name row. */
function expectStats(l: LayoutSnapshot): void {
  const st = l.runnerStatus.stats;
  const link = l.runnerStatus.link!;
  expect(inside(l.memory.box, st), 'Memory in the stats column').toBe(true);
  expect(inside(link.box, st), 'Link in the stats column').toBe(true);
  expect(link.box.y, 'Link under Memory').toBeGreaterThanOrEqual(l.memory.box.y + l.memory.box.height - 0.5);
  const kate = l.identities.runner!;
  expect(overlaps(link.box, kate.box), 'nothing drawn over Kate').toBe(false);
  // The stats column is just left of the Runner's scored pile, at the end of his row.
  expect(st.x + st.width).toBeLessThanOrEqual(l.scored.runner.box.x + 0.5);
  for (const c of l.rig) expect(c.box.x + c.box.width, 'stats right of his cards').toBeLessThanOrEqual(st.x + 0.5);
  const t = l.runnerStatus.tagged;
  if (t) {
    expect(inside(t.box, st), 'Tagged in the stats column').toBe(true);
    expect(t.box.y, 'Tagged under Link').toBeGreaterThanOrEqual(link.box.y + link.box.height - 0.5);
    expect(overlaps(t.box, kate.box)).toBe(false);
    // Off his name row: no "Tagged" by the credits any more.
    expect(l.tags.runner?.text ?? '').not.toContain('Tagged');
  }
  expectCleanLayout(l);
}

test.describe('S-10-2 Link and Tagged next to memory', () => {
  test('Kate has Link 1 next to Memory, nothing over her card; Globalsec makes it Link 2 (real play)', async ({ page }) => {
    await core(page);
    let l = await waitIdle(page);
    expect(l.runnerStatus.link?.text).toBe('Link 1');
    expectStats(l);
    // No pill on the identity card any more: its only texts are the card's own.
    expect(l.labels.filter((t) => t === 'Link 1')).toHaveLength(1);
    await shot(page, 's10-2-link-1');
    await core(page);
    await toStep(page, SEED, 'globalsec_installed');
    l = await waitIdle(page);
    expect(l.runnerStatus.link?.text).toBe('Link 2');
    expectStats(l);
  });

  test('"Tagged 1" in red next to Link on both screens, not by his name; untagged, Link stays put', async ({ page }) => {
    await core(page);
    const v = await getView(page);
    expect(v.viewer).toBe('corp');
    const before = await layout(page);
    let l = await stub(page, tagged(v, 1));
    expect(l.runnerStatus.tagged?.text).toBe('Tagged 1');
    expect(l.tags.runner).toBeNull();
    expectStats(l);
    await shot(page, 's10-2-tagged-corp-view');
    await passTurn(page);
    const rv = await getView(page);
    l = await stub(page, tagged(rv, 1));
    expect(l.viewer).toBe('runner');
    expect(l.runnerStatus.tagged?.text).toBe('Tagged 1');
    expectStats(l);
    const linkAt = l.runnerStatus.link!.box;
    await shot(page, 's10-2-tagged-runner-view');
    // Tags back to 0: Tagged goes, Link keeps its place.
    l = await stub(page, tagged(rv, 0));
    expect(l.runnerStatus.tagged).toBeNull();
    expect(l.runnerStatus.link!.box).toEqual(linkAt);
    expect(before.runnerStatus.stats.width).toBeGreaterThan(0);
  });

  test('the Runner taps Tagged 1: "Remove 1 tag · 1 click + 2 credits" shows as before', async ({ page }) => {
    await core(page);
    await passTurn(page);
    const v = await getView(page);
    const remove: CardOption = { action: { type: 'remove_tag', player: 'runner' }, cost: 2, clicks: 1, reject: null };
    let l = await stub(page, { ...tagged(v, 1), basicOptions: [remove] });
    const t = l.runnerStatus.tagged!;
    // Its tap area is the whole stats column: thumb size, clear of the credits pill.
    expect(t.hit).toEqual(l.runnerStatus.stats);
    expect(Math.min(t.hit.width, t.hit.height)).toBeGreaterThanOrEqual(44);
    expect(overlaps(t.hit, l.runner.credits)).toBe(false);
    await tap(page, t.box);
    l = await layout(page);
    expect(l.selectedInstalled).toBe('basic:tags');
    expect(targetOf(l, 'remove_tag')).toMatchObject({ label: 'Remove 1 tag · 1 click + 2 credits', lit: true });
    await shot(page, 's10-2-remove-tag');
    await tap(page, targetOf(l, 'remove_tag').box);
    expect((await page.evaluate(() => window.__overclock!.sent())).at(-1)).toEqual({ type: 'remove_tag', player: 'runner' });
  });

  test('real play: tagged with a full rig and Globalsec: "Tagged 1" and "Link 2" in the column, nothing overlaps', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, SEED, 'runner_tagged_full_rig');
    const l = await waitIdle(page);
    expect(l.rig.length).toBe(Number(plan.info['rig']));
    expect(l.runnerStatus.tagged?.text).toBe(`Tagged ${plan.info['tags']}`);
    expect(l.runnerStatus.link?.text).toBe(`Link ${plan.info['link']}`);
    expectStats(l);
    await shot(page, 's10-2-real-tagged-full-rig');
  });

  test('tagged with a full rig: Tagged, Link, Memory and his cards never overlap (both seats)', async ({ page }) => {
    await core(page);
    const v = await getView(page);
    let l = await stub(page, tagged(v, 2, FULL_RIG, 2));
    expect(l.rig).toHaveLength(FULL_RIG.length);
    expect(l.runnerStatus.tagged?.text).toBe('Tagged 2');
    expectStats(l);
    await shot(page, 's10-2-full-rig-corp-view');
    await passTurn(page);
    const rv = await getView(page);
    l = await stub(page, tagged(rv, 2, FULL_RIG, 2));
    expectStats(l);
    for (const b of [l.runnerStatus.tagged!.box, l.runnerStatus.link!.box, l.memory.box] as Box[]) {
      for (const c of l.rig) expect(overlaps(b, c.box)).toBe(false);
    }
    await shot(page, 's10-2-full-rig-runner-view');
  });
});
