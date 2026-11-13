// S-03-4 (break ICE with icebreakers) and S-03-3 AC4 (Let it through: subroutines happen).
// wall_of_static_encounter, seed 2: the Runner meets a rezzed Wall of Static (strength 3,
// "End the run") on a server with one ICE, Corroder (strength 2) installed, 3 credits.
import { expect, test } from '@playwright/test';
import { expectCleanLayout, expectSnappy, getView, layout, measureTap, openBoard, runButtonOf, tap, toStep, waitIdle } from './helpers';

const PUMP = '+1 strength · 1 credit';
const BREAK = 'Break "End the run" · 1 credit';

test.describe('S-03-4 break ICE with icebreakers', () => {
  test('a matching breaker shows its buttons with prices; Break is dimmed while the breaker is too weak', async ({ page }) => {
    await openBoard(page, 2);
    await toStep(page, 2, 'wall_of_static_encounter');
    const l = await layout(page);
    expect(l.run).toMatchObject({ step: 'encounter', deciding: 'runner', stepLabel: 'Encounter: Wall of Static' });
    // ICE strength vs the breaker's, and the subroutine list.
    expect(l.run!.lines).toEqual(['Strength 3', 'Corroder 2']);
    expect(l.run!.subroutines).toEqual([{ text: 'End the run', broken: false }]);
    expect(l.run!.buttons.map((b) => [b.label, b.lit, b.reject])).toEqual([
      [BREAK, false, 'too_weak'],
      [PUMP, true, null],
      ['Let it fire: run ends', true, null],
    ]);
    for (const b of l.run!.buttons) expect(Math.min(b.box.width, b.box.height)).toBeGreaterThanOrEqual(44);
    expectCleanLayout(l);
    await test.info().attach('encounter', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('a dim Break says "Raise strength first" and changes nothing', async ({ page }) => {
    await openBoard(page, 2);
    await toStep(page, 2, 'wall_of_static_encounter');
    const before = await getView(page);
    const m = await measureTap(page, runButtonOf(await layout(page), BREAK).box);
    expect(m.events).toEqual([{ type: 'action_rejected', reason: 'too_weak' }]);
    expect(m.view).toEqual(before);
    expect(m.anims.map((a) => [a.kind, a.text])).toEqual([['hint', 'Raise strength first']]);
  });

  test('Corroder on Wall of Static: 1 credit to raise, 1 to break; the broken subroutine is crossed out and the ICE is passed', async ({ page }) => {
    await openBoard(page, 2);
    await toStep(page, 2, 'wall_of_static_encounter');
    const before = await getView(page);
    let m = await measureTap(page, runButtonOf(await layout(page), PUMP).box);
    expect(m.events.map((e) => e.type)).toEqual(['credits_spent', 'strength_changed']);
    expectSnappy(m, ['strength_pop', 'credit_pop']);
    let l = await waitIdle(page);
    expect(l.run!.lines).toEqual(['Strength 3', 'Corroder 3']);
    expect(runButtonOf(l, BREAK)).toMatchObject({ lit: true, reject: null });
    m = await measureTap(page, runButtonOf(l, BREAK).box);
    expect(m.events.map((e) => e.type)).toEqual(expect.arrayContaining(['credits_spent', 'subroutine_broken', 'ice_passed']));
    expectSnappy(m, ['sub_broken']);
    expect(m.view.players.runner.credits).toBe(before.players.runner.credits - 2);
    l = await waitIdle(page);
    // Every subroutine broken: the ICE is passed (Continue / Jack out next).
    expect(l.run).toMatchObject({ step: 'continue', stepLabel: 'Passed Wall of Static' });
    expect(l.run!.buttons.map((b) => b.label)).toEqual(['Continue', 'Jack out']);
    expect(l.run!.subroutines).toEqual([{ text: 'End the run', broken: true }]);
  });

  test("can't afford to break: only \"Not enough credits\", nothing changes", async ({ page }) => {
    await openBoard(page, 2);
    await toStep(page, 2, 'wall_of_static_encounter');
    // Spend every credit on strength.
    for (let i = 0; i < 3; i++) {
      await tap(page, runButtonOf(await layout(page), PUMP).box);
      await waitIdle(page);
    }
    const l = await layout(page);
    expect((await getView(page)).players.runner.credits).toBe(0);
    expect(runButtonOf(l, /^Break/)).toMatchObject({ lit: false, reject: 'no_credits' });
    const before = await getView(page);
    const m = await measureTap(page, runButtonOf(l, /^Break/).box);
    expect(m.events).toEqual([{ type: 'action_rejected', reason: 'no_credits' }]);
    expect(m.view).toEqual(before);
    expect(m.anims.map((a) => [a.kind, a.text])).toEqual([['hint', 'Not enough credits']]);
  });
});

test.describe('S-03-3 Let it through', () => {
  test('Wall of Static let through: "End the run" happens, nothing accessed, with a notice', async ({ page }) => {
    await openBoard(page, 2);
    await toStep(page, 2, 'wall_of_static_encounter');
    const m = await measureTap(page, runButtonOf(await layout(page), /^Let it fire/).box);
    expect(m.events.map((e) => e.type)).toEqual(['subroutine_fired', 'subroutine_resolved', 'run_ended']);
    expect(m.events[2]).toMatchObject({ outcome: 'ended_by_ice' });
    expectSnappy(m, ['sub_fired', 'ice_report']);
    // S-05-2: the message names the ICE and what it did (it replaced the old notice).
    expect(m.anims.find((a) => a.kind === 'ice_report')?.text).toBe('Wall of Static ended your run.');
    expect(m.anims.find((a) => a.kind === 'notice')).toBeUndefined();
    const l = await waitIdle(page);
    expect(l.run).toBeNull();
  });

  test('a wrong-kind breaker shows no break buttons; Enigma let through takes a click and ends the run', async ({ page }) => {
    await openBoard(page, 1);
    await toStep(page, 1, 'corp_rez_prompt'); // Enigma, a code gate; no Gordian Blade installed
    await tap(page, runButtonOf(await layout(page), /^Rez /).box);
    const l = await waitIdle(page);
    expect(l.run!.buttons.map((b) => b.label)).toEqual(['Let it fire: lose 1 click, run ends']);
    expect(l.run!.subroutines.map((s) => s.text)).toEqual(['The Runner loses 1 click, if able', 'End the run']);
    const before = await getView(page);
    const m = await measureTap(page, runButtonOf(l, /^Let it fire/).box);
    expect(m.events.map((e) => e.type)).toEqual(['subroutine_fired', 'clicks_lost', 'subroutine_resolved', 'subroutine_fired', 'subroutine_resolved', 'run_ended']);
    expect(m.view.players.runner.clicks).toBe(before.players.runner.clicks - 1);
    expectSnappy(m, ['sub_fired', 'clicks_lost']);
    expect(m.anims.find((a) => a.kind === 'ice_report')?.text).toBe('Enigma: you lost 1 click. Enigma ended your run.');
  });
});
