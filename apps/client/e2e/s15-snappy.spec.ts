// Sprint 15 (S-15-4): never slower than today. A tap while cards move finishes the movement at
// once and is answered within 0.1 s, on every screen size (891x296, 844x390, 640x360, desktop);
// nothing blocks play for more than 0.6 s; turning the phone mid-movement leaves nothing floating.
import { type Page, expect, test } from '@playwright/test';
import type { AnimRecord } from '../src/hook-types';
import { dispatch, expectSnappy, getView, layout, measureTap, openBoard, passTurn, tap, toRunnerTurn, waitIdle } from './helpers';

async function startDraw(page: Page): Promise<void> {
  const l = await waitIdle(page);
  await page.evaluate(() => window.__overclock!.motion('hold'));
  await tap(page, l.corp.deck);
  await page.waitForFunction(() => window.__overclock!.layout().motion.active > 0);
}

test.describe('S-15-4 never slower than today', () => {
  test('a tap while a card flies finishes the movement at once and is answered within 0.1 s', async ({ page }) => {
    await openBoard(page, 1);
    await startDraw(page);
    const before = await getView(page);
    const handBefore = before.players.corp.handCount;
    const l = await layout(page);
    const m = await measureTap(page, l.corp.credits);
    expectSnappy(m, ['motion_skipped']);
    const skipped = m.anims.find((a) => a.kind === 'motion_skipped')!;
    expect(skipped.scheduledMs).toBe(0);
    // Finished before the tap was handled: the tap acted on the board as it ends up.
    expect(skipped.startedAt).toBeLessThanOrEqual(m.handledAt);
    expect(m.view.players.corp.credits, 'the tap counted').toBe(before.players.corp.credits + 1);
    const after = await layout(page);
    expect(after.motion.flights, 'nothing left in the air').toEqual([]);
    expect(after.hand.length).toBe(handBefore);
    const last = after.hand.at(-1)!.box;
    expect(last.y, 'the drawn card is in the hand').toBeGreaterThanOrEqual(after.handArea.y - 1);
  });

  test('every movement in a few turns of play stays inside the 0.6 s budget', async ({ page }) => {
    await openBoard(page, 1);
    await page.evaluate(() => window.__overclock!.clearAnims());
    const v = await getView(page);
    const install = v.handOptions.flat().find((o) => o.reject === null && o.action.type === 'install');
    if (install) await dispatch(page, install.action);
    await waitIdle(page);
    await dispatch(page, { type: 'draw', player: 'corp' });
    await waitIdle(page);
    await passTurn(page);
    await toRunnerOptions(page);
    await passTurn(page);
    const all: AnimRecord[] = await page.evaluate(() => window.__overclock!.anims());
    expect(all.length).toBeGreaterThan(3);
    for (const r of all) if (r.kind !== 'hint' && r.kind !== 'notice') expect(r.scheduledMs, `${r.kind} within 0.6 s`).toBeLessThanOrEqual(600);
  });

  test('turning the phone mid-movement puts every card in its place (nothing left floating)', async ({ page }) => {
    test.skip(test.info().project.use.isMobile !== true, 'phones only');
    await openBoard(page, 1);
    await startDraw(page);
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.height, height: size.width });
    await page.waitForFunction(() => window.__overclock!.layout().viewport.width < window.__overclock!.layout().viewport.height);
    await page.setViewportSize(size);
    await page.waitForFunction((w) => window.__overclock!.layout().viewport.width === w, size.width);
    const now = await layout(page);
    expect(now.motion.active).toBe(0);
    expect(now.motion.flights).toEqual([]);
    await page.evaluate(() => window.__overclock!.motion('normal'));
    const idle = await waitIdle(page);
    expect(now.hand.map((h) => h.box), 'hand cards where an idle board puts them').toEqual(idle.hand.map((h) => h.box));
  });
});

/** The Runner plays what the view offers first (install or play), then draws. */
async function toRunnerOptions(page: Page): Promise<void> {
  const v = await getView(page);
  if (v.activePlayer !== 'runner') await toRunnerTurn(page);
  const w = await getView(page);
  const opt = w.handOptions.flat().find((o) => o.reject === null && (o.action.type === 'play' || o.action.type === 'install'));
  if (opt) await dispatch(page, opt.action);
  await waitIdle(page);
  await dispatch(page, { type: 'draw', player: 'runner' });
  await waitIdle(page);
}
