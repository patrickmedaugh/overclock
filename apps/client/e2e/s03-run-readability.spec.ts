// QA-S3-4: the run panel stays readable on every size. The most crowded encounter
// (Enigma met with Gordian Blade installed: two long Break buttons, +1 strength,
// Let it through) used to shrink the first Break label to ~7px on desktop.
// Desktop: every button label and every panel line is drawn at >= 12px.
// Phones: the run buttons and panel lines are at least as large as before the fix.
import { type Action } from '@overclock/engine';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, expectCleanLayout, getView, inside, layout, openBoard, overlaps, runButtonOf, safeRect, startRun, tap, waitIdle } from './helpers';

/**
 * Smallest drawn size per project: desktop >= 12px; phones keep what they had when
 * QA-S3-4 was fixed (measured then: phone buttons 14px, phone-small's longest Break
 * 11.5px in a big 2-line-wide button, the panel's smallest line 10px on both).
 */
const MIN_BUTTON_PX: Record<string, number> = { desktop: 12, phone: 14, 'phone-small': 11.5 };
const MIN_INFO_PX: Record<string, number> = { desktop: 12, phone: 10, 'phone-small': 10 };

async function ok(page: Page, a: Action): Promise<void> {
  const ev = await dispatch(page, a);
  expect(ev.find((e) => e.type === 'action_rejected'), JSON.stringify(a)).toBeUndefined();
}

test.describe('QA-S3-4 run panel text size', () => {
  test('Enigma vs Gordian Blade: every button label and panel line is drawn large enough to read', async ({ page }) => {
    await openBoard(page, 2);
    let v = await getView(page);
    const enigma = v.players.corp.hand!.indexOf('c06');
    const install = v.handOptions[enigma]!.find((x) => x.action.type === 'install' && x.action.server === 'hq' && x.reject === null);
    expect(install, 'Enigma can be installed on HQ').toBeDefined();
    await ok(page, install!.action);
    await ok(page, { type: 'end_turn', player: 'corp' });
    await waitIdle(page);
    v = await getView(page);
    await ok(page, { type: 'install', player: 'runner', handIndex: v.players.runner.hand!.indexOf('r05') }); // Gordian Blade
    await ok(page, { type: 'gain_credit', player: 'runner' });
    await waitIdle(page);
    let l = await startRun(page, 'hq');
    await tap(page, runButtonOf(l, /^Rez Enigma/).box);
    l = await waitIdle(page);
    expect(l.run!.buttons.map((b) => b.label)).toEqual([
      'Break "The Runner loses 1 click, if able" · 1 credit',
      'Break "End the run" · 1 credit',
      '+1 strength · 1 credit',
      'Let it through',
    ]);
    const project = test.info().project.name;
    test.info().annotations.push({
      type: 'fontPx',
      description: JSON.stringify({ info: l.run!.infoFontPx, buttons: l.run!.buttons.map((b) => [b.label, Math.round(b.fontPx * 10) / 10]) }),
    });
    for (const b of l.run!.buttons) {
      expect(b.fontPx, `"${b.label}" text size`).toBeGreaterThanOrEqual(MIN_BUTTON_PX[project] ?? 12);
      expect(Math.min(b.box.width, b.box.height), b.label).toBeGreaterThanOrEqual(44);
      expect(overlaps(b.box, l.run!.infoBox), `${b.label} vs info`).toBe(false);
    }
    expect(l.run!.infoFontPx, 'smallest run panel line').toBeGreaterThanOrEqual(MIN_INFO_PX[project] ?? 12);
    expect(inside(l.run!.infoBox, safeRect(l))).toBe(true);
    expectCleanLayout(l);
    // Still readable after a break (the crossed-out line stays in the panel).
    await tap(page, runButtonOf(l, /^Break "The Runner loses/).box);
    l = await layout(page);
    expect(l.run!.infoFontPx, 'smallest run panel line after a break').toBeGreaterThanOrEqual(MIN_INFO_PX[project] ?? 12);
    for (const b of l.run!.buttons) expect(b.fontPx, `"${b.label}" text size`).toBeGreaterThanOrEqual(MIN_BUTTON_PX[project] ?? 12);
  });
});
