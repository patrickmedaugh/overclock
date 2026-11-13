// S-05-2: the encounter's "let it fire" button says what will happen (from the
// engine's run.letFire preview), and afterwards a message names the ICE and
// what it did. Owner answer A: the message stays until the next tap anywhere;
// that tap only closes it, and the tap after works at once.
import type { Action } from '@overclock/engine';
import { type Page, expect, test } from '@playwright/test';
import { dispatch, expectSnappy, getView, layout, measureTap, openBoard, runButtonOf, startRun, tap, toStep, waitIdle } from './helpers';

async function ok(page: Page, a: Action): Promise<void> {
  const ev = await dispatch(page, a);
  expect(ev.find((e) => e.type === 'action_rejected'), JSON.stringify(a)).toBeUndefined();
}

async function waitReport(page: Page): Promise<string> {
  await page.waitForFunction(() => window.__overclock!.layout().report !== null);
  return (await layout(page)).report!.text;
}

test.describe('S-05-2 ICE says what it does', () => {
  test('Enigma: "Let it fire: lose 1 click, run ends"; the message stays until a tap, which does nothing else; the next tap answers at once', async ({ page }) => {
    await openBoard(page, 1);
    await toStep(page, 1, 'enigma_encounter');
    let l = await layout(page);
    const v = await getView(page);
    expect(v.run!.letFire).toMatchObject({ iceCardId: 'c06', ends: 'run' });
    expect(l.run!.buttons.map((b) => b.label)).toContain('Let it fire: lose 1 click, run ends');
    await test.info().attach('enigma label', { body: await page.screenshot(), contentType: 'image/png' });
    const clicks = v.players.runner.clicks;
    await tap(page, runButtonOf(l, 'Let it fire: lose 1 click, run ends').box);
    expect(await waitReport(page)).toBe('Enigma: you lost 1 click. Enigma ended your run.');
    // The old "Enigma: ..." toast is replaced by the message.
    expect((await page.evaluate(() => window.__overclock!.anims())).filter((a) => a.kind === 'notice')).toEqual([]);
    await test.info().attach('enigma report', { body: await page.screenshot(), contentType: 'image/png' });
    // Still there after more than 3 seconds.
    await page.waitForTimeout(3300);
    l = await layout(page);
    expect(l.report?.text).toBe('Enigma: you lost 1 click. Enigma ended your run.');
    const before = await getView(page);
    expect(before.players.runner.clicks).toBe(clicks - 1); // Enigma took one
    // The dismissing tap lands on End turn: it only closes the message.
    await tap(page, l.endTurn!.box);
    await page.waitForTimeout(150);
    l = await layout(page);
    expect(l.report).toBeNull();
    expect(await getView(page)).toEqual(before);
    // The next tap acts at once (+1 credit).
    const m = await measureTap(page, l.runner.credits);
    expect(m.events.map((e) => e.type)).toContain('credit_gained');
    expectSnappy(m, ['credit_pop']);
  });

  test('Neural Katana: "Let it fire: take 3 damage"; then "Neural Katana: you took 3 damage." and the run goes on', async ({ page }) => {
    await openBoard(page, 1);
    await toStep(page, 1, 'neural_katana_encounter');
    const l = await layout(page);
    const v = await getView(page);
    expect(v.run!.letFire).toMatchObject({ iceCardId: 'c07', ends: null });
    await tap(page, runButtonOf(l, 'Let it fire: take 3 damage').box);
    expect(await waitReport(page)).toBe('Neural Katana: you took 3 damage.');
    expect((await getView(page)).run).not.toBeNull();
    // A tap on the Back button closes it too.
    expect(await page.evaluate(() => window.__overclock!.back())).toBe('close_panel');
    expect((await layout(page)).report).toBeNull();
  });

  test('a fatal Neural Katana says "you flatline (Corp wins)"; the game-over screen shows after the message is tapped away', async ({ page }) => {
    // Seed 8 (as QA Sprint 3): the Corp opens with Neural Katana; the Runner installs 3 cards, keeping 2.
    await openBoard(page, 8);
    const v0 = await getView(page);
    const i = v0.players.corp.hand!.indexOf('c07');
    const o = v0.handOptions[i]!.find((x) => x.action.type === 'install' && x.action.server === 'hq' && x.reject === null)!;
    await ok(page, o.action);
    await ok(page, { type: 'end_turn', player: 'corp' });
    await waitIdle(page);
    for (let k = 0; k < 3; k++) await ok(page, { type: 'install', player: 'runner', handIndex: 0 });
    let l = await startRun(page, 'hq');
    await tap(page, runButtonOf(l, /^Rez Neural Katana/).box);
    l = await waitIdle(page);
    await tap(page, runButtonOf(l, 'Let it fire: take 3 damage, you flatline (Corp wins)').box);
    expect(await waitReport(page)).toBe('Neural Katana: you took 3 damage. You flatlined: the Corp wins.');
    await page.waitForTimeout(400);
    l = await layout(page);
    expect(l.gameOver).toBeNull();
    await tap(page, l.report!.box);
    await page.waitForFunction(() => window.__overclock!.layout().gameOver !== null);
    expect((await layout(page)).gameOver).toMatchObject({ title: 'Corp wins', reason: 'Runner flatlined' });
  });
  // Every subroutine broken: the engine passes the ICE at once (no pass button), so the
  // "Continue" label is covered by the unit tests (test/runText.test.ts) only.
});
