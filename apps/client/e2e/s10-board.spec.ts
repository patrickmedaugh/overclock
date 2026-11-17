// Sprint 10 board fixes: S-10-6 (QA-S9-4: the trace result note never covers a button;
// QA-S9-5: no build date inside the game-over box) and S-10-5 (Archives keeps its lane;
// the discard step opens with a tap). Real core-deck play where the planner has a goal for
// it, made-up views (the test hook's `stub`) for the end-of-game box. Real taps. Screens at
// 640x360 and 891x296 go to docs/sprints/sprint-10-screens/.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';
import type { Action, GameEvent, PlayerView } from '@overclock/engine';
import type { Box, LayoutSnapshot } from '../src/hook-types';
import { expectCleanLayout, getView, layout, markDiscard, overlaps, pickHand, startRun, tap, targetOf, toStep, waitIdle } from './helpers';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-10-screens');

/** Screens go to the report; at 640x360 and 891x296 also to the sprint's screens folder. */
async function shot(page: Page, name: string): Promise<void> {
  const p = test.info().project.name;
  const save = p === 'phone-small' || p === 'phone-short';
  if (save) mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot(save ? { path: join(SHOTS, `${name}-${p === 'phone-small' ? '640x360' : '891x296'}.png`) } : {});
  await test.info().attach(name, { body, contentType: 'image/png' });
}

async function core(page: Page, seed: number): Promise<void> {
  await page.goto(`./?seed=${seed}&play=here&cover=off`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
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

async function stub(page: Page, view: PlayerView, events: GameEvent[] = []): Promise<LayoutSnapshot> {
  await page.evaluate(({ v, e }) => window.__overclock!.stub(v, e, null), { v: view, e: events });
  return waitIdle(page);
}

/** Every button and pill on screen (End turn included). */
function buttons(l: LayoutSnapshot): [string, Box][] {
  const out: [string, Box][] = [
    ['corp credits', l.corp.credits],
    ['corp clicks', l.corp.clicks],
    ['runner credits', l.runner.credits],
    ['runner clicks', l.runner.clicks],
  ];
  if (l.endTurn) out.push(['End turn', l.endTurn.box]);
  if (l.runButton) out.push(['Run', l.runButton.box]);
  if (l.lastRun.button) out.push(['Last run', l.lastRun.button.box]);
  for (const t of l.targets) if (t.kind === 'play' || t.kind === 'advance' || t.kind === 'score') out.push([t.label, t.box]);
  return out;
}

// QA's seed-25 game (qa-sprint09.spec.ts): the Corp plays SEA Source against a Runner with 0 credits.
const SEA = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'qa-sprint09-sea-runner-broke.json'), 'utf8')) as { seed: number; actions: Action[] };

test.describe('S-10-6 two small screen fixes', () => {
  test('the trace result note (SEA Source) is clear of every button, End turn included', async ({ page }) => {
    await core(page, SEA.seed);
    await dispatchAll(page, SEA.actions);
    const i = (await getView(page)).players.corp.hand!.indexOf('c22');
    let l = await pickHand(page, i);
    await tap(page, targetOf(l, 'play').box);
    l = await waitIdle(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, l.trace!.control!.buttons.bid.box);
    l = await waitIdle(page);
    const note = (await page.evaluate(() => window.__overclock!.anims())).find((a) => a.kind === 'notice' && a.text?.startsWith('SEA Source'));
    expect(note?.box, 'the trace result note shows').toBeTruthy();
    expect(l.endTurn, 'End turn shows').not.toBeNull();
    for (const [name, b] of buttons(l)) expect(overlaps(note!.box!, b), `note ${JSON.stringify(note!.box)} vs ${name} ${JSON.stringify(b)}`).toBe(false);
    // Still readable: a real size and inside the screen.
    expect(note!.fontPx!).toBeGreaterThanOrEqual(12);
    expect(note!.box!.x).toBeGreaterThanOrEqual(0);
    expect(note!.box!.x + note!.box!.width).toBeLessThanOrEqual(l.viewport.width);
    await shot(page, 's10-6-trace-note-clear');
  });

  test('a refusal toast with Run and Last run in the rail: readable (>= 10 px), on screen and clear of every button', async ({ page }) => {
    await core(page, 1);
    const plan = await toStep(page, 1, 'remote_single_card_no_ice');
    let l = await startRun(page, plan.info['server']!);
    await tap(page, l.run!.buttons.find((b) => /^(Trash|Steal)/.test(b.label))!.box);
    l = await waitIdle(page);
    // Short screens: both rail buttons up, little room left under them.
    expect(l.runButton).not.toBeNull();
    expect(l.lastRun.button).not.toBeNull();
    await page.evaluate(() => window.__overclock!.clearAnims());
    // A refused move (the Corp can't draw on the Runner's turn): the game's refusal shows as a toast.
    await page.evaluate(() => window.__overclock!.dispatch({ type: 'draw', player: 'corp' }));
    await page.waitForFunction(() => window.__overclock!.layout().hint !== null);
    l = await layout(page);
    const toast = (await page.evaluate(() => window.__overclock!.anims())).find((a) => a.kind === 'hint');
    expect(toast, 'the refusal shows').toBeTruthy();
    expect(toast!.fontPx!, 'toast text >= 10 px').toBeGreaterThanOrEqual(10);
    expect(l.hint).not.toBeNull();
    for (const [name, b] of buttons(l)) expect(overlaps(l.hint!.box, b), `toast vs ${name}`).toBe(false);
    expectCleanLayout(l);
    await shot(page, 's10-6-refusal-toast');
  });

  test('the game-over box never has the build date drawn inside it', async ({ page }) => {
    await core(page, 1);
    let l = await layout(page);
    // Before: the build date shows on the board (not on short screens, which hide it to fit two buttons).
    const short = l.viewport.height < 320;
    if (!short) expect(l.buildLabel).not.toBeNull();
    const v = await getView(page);
    l = await stub(page, { ...v, phase: 'over', result: { winner: 'corp', reason: 'flatline' }, legalActions: [] }, [{ type: 'game_over', winner: 'corp', reason: 'flatline' }]);
    expect(l.gameOver).toMatchObject({ title: 'Corp wins' });
    // Hidden while the box is up (wherever it would be drawn).
    expect(l.buildLabel).toBeNull();
    expectCleanLayout(l);
    await shot(page, 's10-6-game-over-no-build-date');
  });
});

test.describe('S-10-5 Archives keeps its lane', () => {
  test('a new game: Archives has its own lane on the Corp\'s row, empty', async ({ page }) => {
    await core(page, 1);
    const l = await waitIdle(page);
    const arch = l.servers.find((s) => s.id === 'archives')!;
    expect(arch.label).toBe('Archives');
    expect(arch.box.width).toBeGreaterThan(0);
    expect(l.text.corpDiscard).toBe('0');
    expect(l.labels).toContain('ARCHIVES');
  });

  test('Server 1 (one card, no ICE) is trashed: its lane folds, the others slide over (not jump); the card flies into Archives', async ({ page }) => {
    await core(page, 1);
    const plan = await toStep(page, 1, 'remote_single_card_no_ice');
    const server = plan.info['server']!;
    let l = await waitIdle(page);
    const before = Object.fromEntries(l.servers.map((s) => [s.id, { label: s.label, box: s.box }]));
    const archivesBefore = l.text.corpDiscard;
    l = await startRun(page, server);
    const take = l.run!.buttons.find((b) => /^(Trash|Steal)/.test(b.label))!;
    await page.evaluate(() => window.__overclock!.clearAnims());
    // Read the board inside the same release the game handled (not racing the 300 ms flight).
    await page.evaluate(() => {
      const w = window as unknown as { __now?: unknown };
      w.__now = undefined;
      window.addEventListener('pointerup', () => (w.__now = window.__overclock!.layout()), { once: true });
    });
    await tap(page, take.box);
    await page.waitForFunction(() => (window as unknown as { __now?: unknown }).__now !== undefined);
    const now = await page.evaluate(() => (window as unknown as { __now: LayoutSnapshot }).__now);
    // Right after the tap: Archives still shows its old count until the card lands on it.
    expect(now.text.corpDiscard, 'Archives fills when the card lands, not before').toBe(archivesBefore);
    const anims = await page.evaluate(() => window.__overclock!.anims());
    const archRoot = now.corp.discard;
    const flight = anims.find((a) => a.kind === 'trash_flight' || a.kind === 'corp_trash_flight');
    expect(flight, 'the card flies').toBeTruthy();
    expect(overlaps(flight!.box!, archRoot), 'into the Archives lane').toBe(true);
    // The lanes right of it slide over (<= 300 ms), the centrals never move.
    const shifts = anims.filter((a) => a.kind === 'column_shift');
    const moved = l.servers.map((s) => s.id).filter((id) => id !== server && !['hq', 'rd', 'archives'].includes(id));
    expect(shifts.map((a) => a.text).sort()).toEqual(moved.sort());
    for (const a of shifts) expect(a.scheduledMs).toBeLessThanOrEqual(300);
    expect(anims.some((a) => a.kind === 'server_close')).toBe(true);
    l = await waitIdle(page);
    expect(l.servers.map((s) => s.id)).not.toContain(server);
    for (const s of l.servers) expect(s.label, `${s.id} keeps its name`).toBe(before[s.id]!.label);
    for (const id of ['hq', 'rd', 'archives']) expect(l.servers.find((s) => s.id === id)!.box, `${id} stays put`).toEqual(before[id]!.box);
    expect(Number(l.text.corpDiscard)).toBe(Number(archivesBefore) + (plan.info['kind'] === 'trash' ? 1 : 0));
    expectCleanLayout(l);
    await shot(page, 's10-5-server-folded');
  });

  test('the discard step opens with a tap: mark cards on the big view, "Discard N" lit at N; nothing overlaps', async ({ page }) => {
    await core(page, 1);
    const plan = await toStep(page, 1, 'runner_must_discard');
    const count = Number(plan.info['count']);
    let l = await waitIdle(page);
    expect(l.picker?.remaining).toBe(count);
    expectCleanLayout(l);
    await tap(page, l.hand[0]!.box);
    await page.waitForFunction(() => window.__overclock!.layout().discardView?.index === 0);
    l = await layout(page);
    expect(Math.min(l.discardView!.confirm.box.width, l.discardView!.confirm.box.height)).toBeGreaterThanOrEqual(44);
    expect(overlaps(l.discardView!.confirm.box, l.zoom!.box), 'Confirm clear of the big card').toBe(false);
    l = await markDiscard(page, Array.from({ length: count }, (_, i) => i));
    expect(l.discardView).toMatchObject({ stamped: true, confirm: { label: `Discard ${count}`, lit: true } });
    await shot(page, 's10-5-discard-view');
    await tap(page, l.discardView!.confirm.box);
    l = await waitIdle(page);
    expect((await getView(page)).pendingDiscard).toBe(0);
  });
});
