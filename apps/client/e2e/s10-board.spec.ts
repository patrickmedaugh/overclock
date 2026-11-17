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
import { expectCleanLayout, getView, layout, overlaps, pickHand, tap, targetOf, waitIdle } from './helpers';

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
