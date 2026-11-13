// S-05-1 (zoom part, U3): hold a card found on a run, a stolen agenda, or a
// face-up Archives card, and it zooms like a hand card. Lifting goes back to
// the same choices with nothing chosen: a hold is never a tap.
// seed 1: R&D's top card is Private Security Force (c09, agenda); Archives holds a face-down card.
// seed 2: R&D's top card is Akitaro Watanabe (c11, trash 3).
import { type Page, expect, test } from '@playwright/test';
import { type Box, getView, holdAt, layout, openBoard, runButtonOf, startRun, tap, toRunnerTurn, waitIdle, waitZoom } from './helpers';

/** Holds `b` until the zoom shows `cardId`, checks it is readable, then lifts. */
async function holdToRead(page: Page, b: Box, cardId: string): Promise<void> {
  const h = await holdAt(page, b);
  await waitZoom(page, cardId);
  await page.waitForTimeout(200);
  const z = (await layout(page)).zoom!;
  expect(z.textOverflow).toBe(false);
  // The hand cards' zoom: well over the card it came from, or nearly the screen's height.
  const vh = page.viewportSize()!.height;
  expect(z.box.height).toBeGreaterThan(Math.min(b.height * 1.5, vh * 0.85));
  expect(z.texts.length).toBeGreaterThan(2);
  await test.info().attach(`zoom ${cardId}`, { body: await page.screenshot(), contentType: 'image/png' });
  await h.release();
  await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
}

test.describe('S-05-1 hold to read found, stolen and Archives cards', () => {
  test('a card found on a run zooms while held; lifting is back to Steal with nothing chosen, and Steal still works', async ({ page }) => {
    await openBoard(page, 1);
    await toRunnerTurn(page);
    let l = await startRun(page, 'rd');
    const before = await getView(page);
    const card = l.run!.access!.cards[0]!;
    expect(card.cardId).toBe('c09');
    await holdToRead(page, card.box, 'c09');
    await page.waitForTimeout(150);
    l = await layout(page);
    expect(l.run?.step).toBe('access');
    expect(l.run!.buttons.map((b) => b.label)).toEqual(['Steal']);
    expect(await getView(page)).toEqual(before);
    await tap(page, runButtonOf(l, 'Steal').box);
    expect((await getView(page)).players.runner.scored).toEqual(['c09']);
  });

  test('the stolen agenda zooms when the Runner\'s score is held; a hold changes nothing', async ({ page }) => {
    await openBoard(page, 1);
    await toRunnerTurn(page);
    const l = await startRun(page, 'rd');
    await tap(page, runButtonOf(l, 'Steal').box);
    const a = await waitIdle(page);
    expect(a.score.runner.text).toBe('Runner 2 points');
    const before = await getView(page);
    await holdToRead(page, a.score.runner.box, 'c09');
    expect(await getView(page)).toEqual(before);
    // No points, nothing to read: the Corp's score does not zoom.
    const h = await holdAt(page, a.score.corp.box);
    await page.waitForTimeout(600);
    expect((await layout(page)).zoom).toBeNull();
    await h.release();
  });

  test('a face-up Archives card zooms when the pile is held; a face-down one does not', async ({ page }) => {
    await openBoard(page, 1);
    await toRunnerTurn(page);
    // seed 1: the Corp's discard is face down to the Runner.
    let l = await layout(page);
    expect((await getView(page)).players.corp.discard).toEqual([null]);
    let h = await holdAt(page, l.corp.discard);
    await page.waitForTimeout(600);
    expect((await layout(page)).zoom).toBeNull();
    await h.release();

    await openBoard(page, 2);
    await toRunnerTurn(page);
    l = await startRun(page, 'rd');
    await tap(page, runButtonOf(l, 'Trash · 3 credits').box);
    l = await waitIdle(page);
    expect((await getView(page)).players.corp.discard.at(-1)).toBe('c11');
    const before = await getView(page);
    await holdToRead(page, l.corp.discard, 'c11');
    expect(await getView(page)).toEqual(before);
    // A quick tap on the pile does nothing to the game either.
    await tap(page, l.corp.discard);
    await page.waitForTimeout(150);
    expect((await layout(page)).zoom).toBeNull();
    expect(await getView(page)).toEqual(before);
    h = await holdAt(page, l.corp.discard);
    await waitZoom(page, 'c11');
    await h.release();
  });
});
