// Sprint 8 (U6): the new cards on screen, pass-the-phone, core decks (as players
// get them). S-08-2 Adonis Campaign / Melange Mining Corp. / Biotic Labor,
// S-08-3 Viktor 1.0 (brain damage, hand max), S-08-4 Heimdall 1.0, Battering Ram
// (break up to 2), Pipeline, Magnum Opus, Sure Gamble, S-08-7 Rototurret with
// the Corp's pick and Sacrificial Construct. Real taps; setups through the
// planner's Sprint 8 goals. 640x360 screenshots go to docs/sprints/sprint-08-screens/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';
import type { InstalledSnapshot, LayoutSnapshot } from '../src/hook-types';
import {
  dismissReport,
  overlaps,
  expectCleanLayout,
  getView,
  layout,
  measureTap,
  openBoard,
  passTurn,
  pickHand,
  runButtonOf,
  tap,
  targetOf,
  toStep,
  waitIdle,
} from './helpers';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-08-screens');
const SEED = 1;

async function shot(page: Page, name: string): Promise<void> {
  const small = test.info().project.name === 'phone-small';
  if (small) mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot(small ? { path: join(SHOTS, `${name}.png`) } : {});
  await test.info().attach(name, { body, contentType: 'image/png' });
}

function installedIn(l: LayoutSnapshot, uid: string): InstalledSnapshot {
  const c = [...l.servers.flatMap((s) => [...s.ice, ...s.content]), ...l.rig].find((x) => x.uid === uid);
  if (!c) throw new Error(`no installed card ${uid}`);
  return c;
}

function maybeInstalled(l: LayoutSnapshot, uid: string): InstalledSnapshot | undefined {
  return [...l.servers.flatMap((s) => [...s.ice, ...s.content]), ...l.rig].find((x) => x.uid === uid);
}

async function tapInstalled(page: Page, uid: string): Promise<LayoutSnapshot> {
  await tap(page, installedIn(await layout(page), uid).box);
  await page.waitForFunction((u) => window.__overclock!.layout().selectedInstalled === u, uid);
  return layout(page);
}

/** Every run button is a real touch target. */
function expectBigButtons(l: LayoutSnapshot): void {
  for (const b of l.run?.buttons ?? []) expect(Math.min(b.box.width, b.box.height), `${b.label} >= 44 px`).toBeGreaterThanOrEqual(44);
}

async function core(page: Page, seed = SEED): Promise<void> {
  await openBoard(page, { seed, decks: 'core' });
}

test.describe('S-08-2 Adonis Campaign, Melange Mining Corp., Biotic Labor', () => {
  test('rezzing Adonis puts 12 credits on it; at the next Corp turn it gives 3 and says so', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, SEED, 'corp_rez_adonis');
    const uid = plan.info['uid']!;
    let l = await tapInstalled(page, uid);
    const rez = targetOf(l, 'rez');
    expect(rez.label).toBe('Rez · 4 credits');
    await tap(page, rez.box);
    l = await waitIdle(page);
    expect(installedIn(l, uid)).toMatchObject({ faceUp: true, cardId: 'c14' });
    expect(installedIn(l, uid).hosted?.text).toBe('12');
    expectCleanLayout(l);
    await shot(page, 's08-2-adonis-12');
    // Runner's turn, then back to the Corp: +3 from Adonis.
    await passTurn(page);
    const credits = (await getView(page)).players.corp.credits;
    await passTurn(page);
    l = await waitIdle(page);
    expect(l.viewer).toBe('corp');
    expect(installedIn(l, uid).hosted?.text).toBe('9');
    expect((await getView(page)).players.corp.credits).toBe(credits + 3);
    expect(l.hint?.text).toContain('Adonis Campaign: +3 credits');
    await shot(page, 's08-2-adonis-gives-3');
  });

  test('Melange: "Gain 7 credits · 3 clicks" uses all 3 clicks; dim with fewer clicks', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, SEED, 'corp_melange');
    const uid = plan.info['uid']!;
    const before = await getView(page);
    let l = await tapInstalled(page, uid);
    const use = targetOf(l, 'activate');
    expect(use).toMatchObject({ label: 'Gain 7 credits · 3 clicks', lit: true });
    expect(Math.min(use.box.width, use.box.height)).toBeGreaterThanOrEqual(44);
    await shot(page, 's08-2-melange-button');
    const m = await measureTap(page, use.box);
    expect(m.view.players.corp.credits).toBe(before.players.corp.credits + 7);
    expect(m.view.players.corp.clicks).toBe(0);
    l = await waitIdle(page);
    // No clicks left now: its button (still shown while the card is picked, or after picking it again) is dim.
    if (l.selectedInstalled !== uid) l = await tapInstalled(page, uid);
    expect(targetOf(l, 'activate')).toMatchObject({ lit: false, reject: 'no_clicks' });
  });

  test('Biotic Labor: played for 1 click, the Corp has 4 clicks and the counter says so', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, SEED, 'corp_biotic_labor');
    let l = await pickHand(page, Number(plan.info['handIndex']));
    const play = targetOf(l, 'play');
    const m = await measureTap(page, play.box);
    expect(m.events.map((e) => e.type)).toContain('clicks_gained');
    expect(m.view.players.corp.clicks).toBe(4);
    expect(m.anims.some((a) => a.kind === 'clicks_gained' && a.scheduledMs <= 600)).toBe(true);
    l = await waitIdle(page);
    expect(l.hint?.text).toContain('Corp gains 2 clicks');
    await shot(page, 's08-2-biotic-labor-4-clicks');
  });
});

test.describe('S-08-3 Viktor 1.0: brain damage lowers the hand max', () => {
  test('let it fire: 1 brain damage, the card flies to the Heap, "Hand max 4" shows', async ({ page }) => {
    await core(page);
    await toStep(page, SEED, 'viktor_encounter');
    let l = await layout(page);
    expect(l.run!.stepLabel).toBe('Encounter: Viktor 1.0');
    const fire = runButtonOf(l, /^Let it fire/);
    expect(fire.label).toContain('take 1 brain damage');
    expectBigButtons(l);
    const heap = (await getView(page)).players.runner.discardCount;
    const m = await measureTap(page, fire.box);
    expect(m.events.some((e) => e.type === 'brain_damage')).toBe(true);
    expect(m.view.players.runner.maxHandSize).toBe(4);
    expect(m.view.players.runner.discardCount).toBe(heap + 1);
    expect(m.anims.some((a) => a.kind === 'brain_damage')).toBe(true);
    await dismissReport(page);
    l = await waitIdle(page);
    expect(l.tags.runner?.text).toContain('Hand max 4');
    expectCleanLayout(l);
    await shot(page, 's08-3-viktor-hand-max-4');
  });
});

test.describe('S-08-4 new breakers and events', () => {
  test('Battering Ram on Heimdall: pump to 6, "Break up to 2" picks two subroutines, then the last one', async ({ page }) => {
    test.setTimeout(60_000);
    await core(page);
    await toStep(page, SEED, 'heimdall_ram_encounter');
    let l = await layout(page);
    expect(l.run!.stepLabel).toBe('Encounter: Heimdall 1.0');
    // Pump until the break is lit.
    for (let i = 0; i < 6; i++) {
      const multi = l.run!.buttons.find((b) => b.role === 'multi')!;
      expect(multi.label).toMatch(/Break up to 2 · 2 credits$/);
      if (multi.lit) break;
      await tap(page, runButtonOf(l, /\+1 strength/).box);
      l = await waitIdle(page);
    }
    const multi = l.run!.buttons.find((b) => b.role === 'multi')!;
    expect(multi.lit).toBe(true);
    await tap(page, multi.box);
    l = await waitIdle(page);
    let toggles = l.run!.buttons.filter((b) => b.role === 'toggle');
    expect(toggles).toHaveLength(3);
    expectBigButtons(l);
    expect(l.run!.buttons.find((b) => b.role === 'confirm')).toMatchObject({ lit: false, label: 'Pick 1 or 2' });
    await tap(page, toggles[0]!.box);
    l = await waitIdle(page);
    await tap(page, l.run!.buttons.filter((b) => b.role === 'toggle')[1]!.box);
    l = await waitIdle(page);
    toggles = l.run!.buttons.filter((b) => b.role === 'toggle');
    expect(toggles.map((t) => t.picked)).toEqual([true, true, false]);
    const confirm = l.run!.buttons.find((b) => b.role === 'confirm')!;
    expect(confirm).toMatchObject({ lit: true, label: 'Break 2 · 2 credits' });
    await shot(page, 's08-4-ram-pick-2');
    const credits = (await getView(page)).players.runner.credits;
    const m = await measureTap(page, confirm.box);
    expect(m.events.filter((e) => e.type === 'subroutine_broken')).toHaveLength(2);
    expect(m.view.players.runner.credits).toBe(credits - 2);
    l = await waitIdle(page);
    expect(l.run!.subroutines.map((s) => s.broken)).toEqual([true, true, false]);
    // The last one: Break up to 2 -> pick it -> Break 1 (when he can still pay 2).
    const last = l.run!.buttons.find((b) => b.role === 'multi')!;
    if ((await getView(page)).players.runner.credits < 2) {
      expect(last).toMatchObject({ lit: false, reject: 'no_credits' });
      return;
    }
    await tap(page, last.box);
    l = await waitIdle(page);
    toggles = l.run!.buttons.filter((b) => b.role === 'toggle');
    expect(toggles).toHaveLength(1);
    await tap(page, toggles[0]!.box);
    l = await waitIdle(page);
    await tap(page, l.run!.buttons.find((b) => b.role === 'confirm' && b.lit)!.box);
    l = await waitIdle(page);
    expect(l.run!.subroutines.every((s) => s.broken)).toBe(true);
  });

  test('Battering Ram: Back closes the pick without spending anything', async ({ page }) => {
    await core(page);
    await toStep(page, SEED, 'heimdall_ram_encounter');
    let l = await layout(page);
    // Too weak: the button is dim and a tap only explains why.
    expect(l.run!.buttons.find((b) => b.role === 'multi')).toMatchObject({ lit: false, reject: 'too_weak' });
    while (!l.run!.buttons.find((b) => b.role === 'multi')!.lit) {
      await tap(page, runButtonOf(l, /\+1 strength/).box);
      l = await waitIdle(page);
    }
    const before = JSON.stringify(await getView(page));
    await tap(page, l.run!.buttons.find((b) => b.role === 'multi')!.box);
    l = await waitIdle(page);
    await tap(page, l.run!.buttons.find((b) => b.role === 'back')!.box);
    l = await waitIdle(page);
    expect(l.run!.buttons.some((b) => b.role === 'multi')).toBe(true);
    expect(JSON.stringify(await getView(page))).toBe(before);
  });

  test('Heimdall with Corroder: it pumps and breaks one subroutine at a time; the panel shows the total', async ({ page }) => {
    await core(page);
    await toStep(page, SEED, 'heimdall_corroder_encounter');
    const l = await layout(page);
    expect(l.run!.buttons.some((b) => /^Break "/.test(b.label) || /: Break "/.test(b.label))).toBe(true);
    expect(l.run!.buttons.some((b) => b.role === 'multi')).toBe(false);
    expect(runButtonOf(l, /\+\d strength/).label).toMatch(/credit/);
    expectBigButtons(l);
    // QA-S8-2 (S-08-3 AC3): the panel adds the price up: +4 strength and 3 breaks = 7 credits.
    expect(l.run!.lines).toContain('Break all: 4 + 3 = 7 credits');
    // Still readable with the extra line (3 subroutines; the panel also takes the build date's line during a run).
    const floor: Record<string, number> = { desktop: 12, phone: 10, 'phone-small': 8 };
    expect(l.run!.infoFontPx).toBeGreaterThanOrEqual(floor[test.info().project.name] ?? 10);
    // QA-S8-3: no toast over the run panel.
    if (l.hint) expect(overlaps(l.hint.box, l.run!.infoBox), 'toast over the run panel').toBe(false);
    await shot(page, 's08-3-heimdall-corroder-break-all-7');
  });

  test('Pipeline on Neural Katana: pump and break', async ({ page }) => {
    await core(page);
    await toStep(page, SEED, 'pipeline_katana_encounter');
    let l = await layout(page);
    expect(l.run!.stepLabel).toBe('Encounter: Neural Katana');
    // The total comes from the engine's plan (Pipeline: 2 + 2 to reach 3, then 1).
    expect(l.run!.lines).toContain('Break all: 4 + 1 = 5 credits');
    for (let i = 0; i < 6; i++) {
      const brk = l.run!.buttons.find((b) => /Break "/.test(b.label));
      if (brk?.lit) break;
      await tap(page, runButtonOf(l, /\+\d strength/).box);
      l = await waitIdle(page);
    }
    const brk = l.run!.buttons.find((b) => /Break "/.test(b.label) && b.lit)!;
    const m = await measureTap(page, brk.box);
    expect(m.events.some((e) => e.type === 'subroutine_broken')).toBe(true);
  });

  test('Magnum Opus: "Gain 2 credits · 1 click"', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, SEED, 'runner_magnum_opus');
    const before = await getView(page);
    const l = await tapInstalled(page, plan.info['uid']!);
    const use = targetOf(l, 'activate');
    expect(use).toMatchObject({ label: 'Gain 2 credits · 1 click', lit: true });
    const m = await measureTap(page, use.box);
    expect(m.view.players.runner.credits).toBe(before.players.runner.credits + 2);
    expect(m.view.players.runner.clicks).toBe(before.players.runner.clicks - 1);
  });

  test('Sure Gamble: 5 credits become 9', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, SEED, 'runner_sure_gamble');
    expect((await getView(page)).players.runner.credits).toBe(5);
    const l = await pickHand(page, Number(plan.info['handIndex']));
    const m = await measureTap(page, targetOf(l, 'play').box);
    expect(m.view.players.runner.credits).toBe(9);
  });
});

test.describe('S-08-7 Rototurret: the Corp picks a program; Sacrificial Construct can save it', () => {
  test('two programs, no Construct: the Corp gets one lit button per program; the pick is trashed', async ({ page }) => {
    await core(page, 1);
    const plan = await toStep(page, 1, 'rototurret_two_programs');
    expect(plan.info['construct']).toBe('');
    const programs = plan.info['programs']!.split(',');
    let l = await layout(page);
    const fire = runButtonOf(l, /^Let it fire/);
    expect(fire.label).toContain('trash 1 program');
    await tap(page, fire.box);
    l = await waitIdle(page);
    // The Corp decides (cover is off in these specs): the run stays on screen, the choice buttons show.
    expect(l.run!.deciding).toBe('corp');
    expect(l.run!.stepLabel).toBe('Rototurret: pick a program to trash');
    expect(l.run!.choice).toMatchObject({ kind: 'trash_target' });
    expect([...l.run!.choice!.lit].sort()).toEqual([...programs].sort());
    expect(l.run!.buttons.map((b) => b.label.startsWith('Trash '))).toEqual(programs.map(() => true));
    expectBigButtons(l);
    await shot(page, 's08-7-rototurret-corp-picks');
    // Tap a lit program on the table (same as its button).
    const target = programs[0]!;
    await tap(page, installedIn(l, target).box);
    l = await waitIdle(page);
    expect(maybeInstalled(l, target)).toBeUndefined();
    const v = await getView(page);
    expect(v.choice).toBeNull();
    await dismissReport(page);
    l = await waitIdle(page);
    expectCleanLayout(l);
  });

  test('with Sacrificial Construct: after the Corp picks, the Runner may trash the Construct instead', async ({ page }) => {
    await core(page, 2);
    const plan = await toStep(page, 2, 'rototurret_two_programs');
    const construct = plan.info['construct']!;
    expect(construct).not.toBe('');
    const programs = plan.info['programs']!.split(',');
    let l = await layout(page);
    await tap(page, runButtonOf(l, /^Let it fire/).box);
    l = await waitIdle(page);
    expect(l.run!.choice?.kind).toBe('trash_target');
    const first = l.run!.buttons[0]!.action;
    const picked = first.type === 'choose' ? first.uid : '';
    expect(programs).toContain(picked);
    await tap(page, l.run!.buttons[0]!.box);
    l = await waitIdle(page);
    expect(l.run!.deciding).toBe('runner');
    expect(l.run!.choice).toMatchObject({ kind: 'prevent_trash', target: picked });
    expect(l.run!.stepLabel).toMatch(/^Rototurret: trash .+\?$/);
    expect(l.run!.buttons.map((b) => b.label)).toEqual(['Trash Sacrificial Construct instead', 'Let it be trashed']);
    expectBigButtons(l);
    await shot(page, 's08-7-construct-choice');
    await tap(page, l.run!.buttons[0]!.box);
    l = await waitIdle(page);
    expect(maybeInstalled(l, construct)).toBeUndefined();
    expect(maybeInstalled(l, picked)).toBeDefined();
    expect(l.report?.text).toContain('Sacrificial Construct was trashed instead of');
    await shot(page, 's08-7-construct-saved-report');
    await dismissReport(page);
  });
});

test.describe('S-08-7 Rototurret through the pass-the-phone cover', () => {
  /** Taps the cover away (if up) and waits for the board. */
  async function lift(page: Page): Promise<LayoutSnapshot> {
    const l = await layout(page);
    if (l.cover) {
      await tap(page, { x: l.viewport.width / 2 - 5, y: l.viewport.height - 40, width: 10, height: 10 });
      await page.waitForFunction(() => window.__overclock!.layout().cover === null);
    }
    return waitIdle(page);
  }

  test('Runner -> Corp (pick) -> Runner (save or not): a cover at each hand-over, nothing shown under it', async ({ page }) => {
    await page.goto('./?seed=2&play=here');
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
    const plan = await toStep(page, 2, 'rototurret_two_programs');
    let l = await lift(page);
    expect(l.viewer).toBe('runner');
    await tap(page, runButtonOf(l, /^Let it fire/).box);
    l = await layout(page);
    expect(l.cover).toMatchObject({ to: 'corp', title: 'Pass to the Corp — tap when ready' });
    await shot(page, 's08-7-cover-to-corp');
    l = await lift(page);
    expect(l.run!.choice?.kind).toBe('trash_target');
    expect(l.run!.deciding).toBe('corp');
    const first = l.run!.buttons[0]!;
    const picked = first.action.type === 'choose' ? first.action.uid : '';
    await tap(page, first.box);
    l = await layout(page);
    expect(l.cover).toMatchObject({ to: 'runner', title: 'Pass back to the Runner — tap when ready' });
    l = await lift(page);
    expect(l.run!.choice).toMatchObject({ kind: 'prevent_trash', target: picked });
    await tap(page, runButtonOf(l, 'Let it be trashed').box);
    l = await waitIdle(page);
    expect(l.cover).toBeNull();
    expect(maybeInstalled(l, picked)).toBeUndefined();
    expect(plan.info['construct']).not.toBe('');
    expect(maybeInstalled(l, plan.info['construct']!)).toBeDefined();
  });
});
