// Sprint 11 (U1): S-11-1 break buttons name their card and the ICE type; S-11-2 no pick
// step when only one subroutine can be broken. Real games (core decks), real taps.
// Setups: `planEncounter` (e2e/s11-plan.ts; stand-in for engine-dev's E3 goal
// `ice_wall_ram_gordian`) and the planner's `heimdall_ram_encounter`.
// Runs at 844x390, 640x360, 891x296 (phone-short) and desktop. Screenshots of every
// size go to docs/sprints/sprint-11-screens/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCard } from '@overclock/cards';
import { type Page, expect, test } from '@playwright/test';
import type { LayoutSnapshot } from '../src/hook-types';
import { expectCleanLayout, getView, layout, measureTap, openBoard, overlaps, runButtonOf, tap, toStep, waitIdle } from './helpers';
import { type EncounterGoal, HEIMDALL_RAM_RICH, ICE_WALL_RAM_CORRODER, ICE_WALL_RAM_GORDIAN, planEncounter } from './s11-plan';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-11-screens');
const SEED = 1;

/**
 * Smallest label size per project (the run panel's QA-S3-4 floors; phone-short draws at
 * phone-small's size or more). Below it, a label is shortened instead (DECISIONS 2026-11-17).
 */
const MIN_BUTTON_PX: Record<string, number> = { desktop: 12, phone: 14, 'phone-small': 11.5, 'phone-short': 11.5 };

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot({ path: join(SHOTS, `${name}-${test.info().project.name}.png`) });
  await test.info().attach(name, { body, contentType: 'image/png' });
}

/** Opens seed `seed` (core decks) and plays `goal`'s planned actions through the hook. */
async function toEncounter(page: Page, goal: EncounterGoal, seed = SEED): Promise<LayoutSnapshot> {
  const plan = planEncounter(seed, goal);
  await openBoard(page, { seed, decks: 'core' });
  const rejected = await page.evaluate((actions) => {
    const hook = window.__overclock!;
    for (const a of actions) {
      const r = hook.dispatch(a).find((e) => e.type === 'action_rejected');
      if (r) return JSON.stringify({ a, r });
    }
    return null;
  }, plan.actions);
  expect(rejected).toBeNull();
  const l = await waitIdle(page);
  expect(l.run?.step).toBe('encounter');
  expect(l.run?.iceUid).toBe(plan.iceUid);
  return l;
}

type Btn = NonNullable<LayoutSnapshot['run']>['buttons'][number];

/** Every button readable and thumb size; card buttons keep their card name and price in full. */
function expectReadable(l: LayoutSnapshot): void {
  const project = test.info().project.name;
  test.info().annotations.push({ type: 'buttons', description: JSON.stringify(l.run!.buttons.map((b) => [b.label, Math.round(b.fontPx * 10) / 10, b.box.width, b.box.height])) });
  for (const b of l.run!.buttons) {
    expect(b.fontPx, `"${b.label}" text size`).toBeGreaterThanOrEqual(MIN_BUTTON_PX[project] ?? 12);
    expect(Math.min(b.box.width, b.box.height), `"${b.label}" >= 44 px`).toBeGreaterThanOrEqual(44);
    expect(overlaps(b.box, l.run!.infoBox), `"${b.label}" vs the run panel`).toBe(false);
    if (b.source) {
      const name = getCard(b.source)!.name;
      expect(b.label.startsWith(`${name}: `), `"${b.label}" names ${name} in full`).toBe(true);
      const price = b.fullLabel!.split(' · ').slice(1).join(' · ');
      if (price) expect(b.label.endsWith(` · ${price}`), `"${b.label}" keeps its price`).toBe(true);
    }
  }
}

/** Buttons that come from a card (a breaker). */
const cardButtons = (l: LayoutSnapshot): Btn[] => l.run!.buttons.filter((b) => b.source);

test.describe('S-11-1 break buttons name their card and the ICE type', () => {
  test('Ice Wall with Battering Ram and Gordian Blade: each card button names Battering Ram; the break says barrier and its price', async ({ page }) => {
    const l = await toEncounter(page, ICE_WALL_RAM_GORDIAN);
    expect(l.run!.stepLabel).toBe('Encounter: Ice Wall');
    const v = await getView(page);
    expect(v.rig.map((c) => c.cardId)).toEqual(expect.arrayContaining(['r17', 'r05']));
    // AC1: the break button names Battering Ram, says barrier, shows its price.
    const brk = runButtonOf(l, /break/);
    expect(brk).toMatchObject({ label: 'Battering Ram: break barrier sub · 2 credits', fullLabel: 'Battering Ram: break barrier sub · 2 credits', source: 'r17' });
    expect(brk.label).not.toContain('up to');
    // AC2: the strength button names Battering Ram too.
    expect(runButtonOf(l, /str/)).toMatchObject({ label: 'Battering Ram: +1 str · 1 credit', source: 'r17' });
    // AC3/AC4: every button from a card says which card, from its own words.
    const fromCards = cardButtons(l);
    expect(fromCards.length).toBeGreaterThanOrEqual(2);
    for (const b of fromCards) expect(b.label.startsWith(`${getCard(b.source!)!.name}: `), b.label).toBe(true);
    // Gordian Blade breaks code gates: nothing of it on Ice Wall, and no button says otherwise.
    expect(l.run!.buttons.some((b) => b.label.includes('Gordian Blade'))).toBe(false);
    // AC6: readable in full, thumb size, at this size.
    expectReadable(l);
    for (const b of l.run!.buttons) expect(b.label, 'nothing shortened on this panel').toBe(b.fullLabel);
    expectCleanLayout(l);
    await shot(page, 's11-1-ice-wall-ram');
  });

  test('two barrier breakers on one panel (Battering Ram and Corroder on Ice Wall): each button alone says which card it is', async ({ page }) => {
    const l = await toEncounter(page, ICE_WALL_RAM_CORRODER);
    const labels = cardButtons(l).map((b) => [b.source, b.label]);
    expect(labels).toEqual(
      expect.arrayContaining([
        ['r17', 'Battering Ram: break barrier sub · 2 credits'],
        ['r17', 'Battering Ram: +1 str · 1 credit'],
        ['r04', 'Corroder: break barrier sub · 1 credit'],
        ['r04', 'Corroder: +1 str · 1 credit'],
      ]),
    );
    // No two card buttons say the same thing.
    expect(new Set(cardButtons(l).map((b) => b.label)).size).toBe(cardButtons(l).length);
    expectReadable(l);
    expectCleanLayout(l);
    await shot(page, 's11-1-ice-wall-ram-corroder');
  });

  test('Heimdall 1.0 (3 barrier subroutines): Battering Ram says "up to 2"', async ({ page }) => {
    await openBoard(page, { seed: SEED, decks: 'core' });
    await toStep(page, SEED, 'heimdall_ram_encounter');
    const l = await layout(page);
    expect(l.run!.stepLabel).toBe('Encounter: Heimdall 1.0');
    const multi = l.run!.buttons.find((b) => b.role === 'multi')!;
    expect(multi).toMatchObject({ fullLabel: 'Battering Ram: break up to 2 barrier subs · 2 credits', source: 'r17' });
    expect(runButtonOf(l, /\+1 str/)).toMatchObject({ fullLabel: 'Battering Ram: +1 str · 1 credit', source: 'r17' });
    expectReadable(l);
    await shot(page, 's11-1-heimdall-up-to-2');
  });
});

test.describe('S-11-2 no pick step when only one subroutine can be broken', () => {
  test('Ice Wall (1 subroutine): one tap breaks it and pays 2 credits; no pick step', async ({ page }) => {
    let l = await toEncounter(page, ICE_WALL_RAM_GORDIAN);
    const brk = runButtonOf(l, /^Battering Ram: break barrier sub/);
    expect(brk.lit).toBe(true);
    expect(brk.role, 'a plain button, not the pick').toBeUndefined();
    expect(brk.action).toMatchObject({ type: 'use_ability', subs: [0] });
    const credits = (await getView(page)).players.runner.credits;
    const m = await measureTap(page, brk.box);
    expect(m.events.filter((e) => e.type === 'subroutine_broken')).toHaveLength(1);
    expect(m.view.players.runner.credits).toBe(credits - 2);
    l = await waitIdle(page);
    expect(l.run!.buttons.some((b) => b.role === 'toggle' || b.role === 'confirm'), 'no pick step').toBe(false);
    expect(l.run!.subroutines.map((s) => s.broken)).toEqual([true]);
    await shot(page, 's11-2-ice-wall-broken');
  });

  test('Heimdall 1.0 (3 subroutines): the pick says "Pick up to 2" and matches what can be picked; the last one breaks at once', async ({ page }) => {
    test.setTimeout(60_000);
    let l = await toEncounter(page, HEIMDALL_RAM_RICH);
    expect(l.run!.stepLabel).toBe('Encounter: Heimdall 1.0');
    // Pump until the break is lit.
    for (let i = 0; i < 6 && !l.run!.buttons.find((b) => b.role === 'multi')!.lit; i++) {
      await tap(page, runButtonOf(l, /^Battering Ram: \+1 str/).box);
      l = await waitIdle(page);
    }
    const multi = l.run!.buttons.find((b) => b.role === 'multi')!;
    expect(multi).toMatchObject({ lit: true, label: 'Battering Ram: break up to 2 barrier subs · 2 credits' });
    await tap(page, multi.box);
    l = await waitIdle(page);
    // AC2 / AC4: the hint's words match what the engine offers (most subroutines per break).
    const offered = (await getView(page)).run!.options.flatMap((o) => (o.action.type === 'use_ability' && o.action.subs ? [o.action.subs] : []));
    const most = Math.max(...offered.map((s) => s.length));
    expect(most).toBe(2);
    const confirm = l.run!.buttons.find((b) => b.role === 'confirm')!;
    expect(confirm).toMatchObject({ lit: false, label: `Pick up to ${most}` });
    let toggles = l.run!.buttons.filter((b) => b.role === 'toggle');
    expect(toggles.map((t) => t.sub)).toEqual([...new Set(offered.flat())].sort());
    expectReadable(l);
    await shot(page, 's11-2-heimdall-pick-up-to-2');
    // Picking a third drops the oldest pick: never more than the hint says.
    for (const i of [2, 0, 1]) {
      await tap(page, l.run!.buttons.filter((b) => b.role === 'toggle')[i]!.box);
      l = await waitIdle(page);
    }
    toggles = l.run!.buttons.filter((b) => b.role === 'toggle');
    expect(toggles.map((t) => t.picked)).toEqual([true, true, false]);
    await tap(page, runButtonOf(l, 'Break 2 · 2 credits').box);
    l = await waitIdle(page);
    expect(l.run!.subroutines.map((s) => s.broken)).toEqual([true, true, false]);
    // AC3: one unbroken subroutine left: a plain button that breaks it at once.
    const last = runButtonOf(l, /^Battering Ram: break/);
    expect(last).toMatchObject({ lit: true, label: 'Battering Ram: break barrier sub · 2 credits', action: { type: 'use_ability', subs: [2] } });
    expect(last.role).toBeUndefined();
    const credits = (await getView(page)).players.runner.credits;
    const m = await measureTap(page, last.box);
    expect(m.events.filter((e) => e.type === 'subroutine_broken')).toHaveLength(1);
    expect(m.view.players.runner.credits).toBe(credits - 2);
    l = await waitIdle(page);
    expect(l.run!.buttons.some((b) => b.role === 'toggle' || b.role === 'confirm'), 'no pick step').toBe(false);
    expect(l.run!.subroutines.every((s) => s.broken)).toBe(true);
  });
});
