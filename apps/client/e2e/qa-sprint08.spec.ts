// QA Sprint 8 (written by QA, not the developers). Screenshots go to
// docs/sprints/sprint-08-qa/<project>-NN-<what>.png (all three sizes).
//
// - S-08-1: both identities on the table, hold to read (full text), the Haas-Bioroid note,
//   Kate's discount on the lit place (a resource first does not use it up).
// - S-08-2: Adonis Rez · 4 credits, 12 on it on both seats, +3 note; Melange's button with 3
//   clicks and with fewer (dim, says why); Biotic Labor's 4 clicks.
// - S-08-3: Viktor's brain damage report, "Hand max 4", the end-of-turn discard down to 4;
//   Heimdall vs Corroder: what the screen says about the price.
// - S-08-4: Battering Ram break-2 pick, Pipeline on Neural Katana, Magnum Opus, Sure Gamble,
//   "Not enough memory" (a board found by QA's own planner).
// - S-08-7: Rototurret pick + Sacrificial Construct save through the pass-and-play cover;
//   online on two devices (two browser contexts), with every frame checked for hidden cards.
// - S-08-6: QA-S7-1/2 markers: Armitage, Bank Job, Adonis, Magnum Opus readable; an advanced
//   Ice Wall and an Armitage holding credits on the table together.
// Taps are real (touch on phones). Every new tap is timed: state within 100 ms of the tap.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCard } from '@overclock/cards';
import type { Action, PlayerView, Side } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';
import { planToStep } from '@overclock/match/testing';
import { type Page, expect, test } from '@playwright/test';
import {
  type InstalledSnapshot,
  type LayoutSnapshot,
  type TapMeasure,
  dismissReport,
  getView,
  holdAt,
  layout,
  measureTap,
  openBoard,
  overlaps,
  passTurn,
  pickHand,
  runButtonOf,
  tap,
  targetOf,
  toStep,
  waitIdle,
  waitZoom,
} from './helpers';
import { type Phone, frames, joinGame, layoutOf, openPhone, startTestGame, waitPlaying, waitView } from './online';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-08-qa');
const ONLINE_CORE = { rezWindow: 'always', deckSet: 'core' } as const;

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${test.info().project.name}-${name}.png`) });
}

function installedIn(l: LayoutSnapshot, uid: string): InstalledSnapshot {
  const c = [...l.servers.flatMap((s) => [...s.ice, ...s.content]), ...l.rig].find((x) => x.uid === uid);
  if (!c) throw new Error(`no installed card ${uid}`);
  return c;
}
const maybeInstalled = (l: LayoutSnapshot, uid: string) => [...l.servers.flatMap((s) => [...s.ice, ...s.content]), ...l.rig].find((x) => x.uid === uid);

async function tapInstalled(page: Page, uid: string): Promise<LayoutSnapshot> {
  await tap(page, installedIn(await layout(page), uid).box);
  await page.waitForFunction((u) => window.__overclock!.layout().selectedInstalled === u, uid);
  return layout(page);
}

/** QA's snappiness check: the game changed within 100 ms of handling the tap; every animation it started is <= 600 ms. */
function snappy(m: TapMeasure): void {
  test.info().annotations.push({ type: 'timing', description: JSON.stringify({ stateMs: +(m.stateAt - m.handledAt).toFixed(1), queueMs: +(m.handledAt - m.tapAt).toFixed(1) }) });
  expect(Number.isFinite(m.handledAt), 'the tap reached a game target').toBe(true);
  expect(m.stateAt - m.handledAt, 'state within 100 ms').toBeLessThan(100);
  // Toasts (hint/notice) and the ICE report never block input; every other animation must fit 600 ms.
  for (const a of m.anims) if (!['hint', 'notice', 'ice_report'].includes(a.kind)) expect(a.scheduledMs, `${a.kind} <= 600 ms`).toBeLessThanOrEqual(600);
}

/** S-08-6: the card's full name, its type line and its credits are readable: on the card, nothing covering them. */
function expectReadableCard(l: LayoutSnapshot, uid: string, credits: string | null): void {
  const c = installedIn(l, uid);
  expect(c.face, `${uid} face up`).not.toBeNull();
  const name = getCard(c.cardId!)!.name;
  expect(c.face!.nameText.replace(/\s+/g, ' '), 'full name drawn').toBe(name);
  for (const b of [c.face!.name, c.face!.type]) {
    expect(b.x).toBeGreaterThanOrEqual(c.box.x - 0.5);
    expect(b.x + b.width).toBeLessThanOrEqual(c.box.x + c.box.width + 0.5);
    expect(b.y).toBeGreaterThanOrEqual(c.box.y - 0.5);
    expect(b.y + b.height).toBeLessThanOrEqual(c.box.y + c.box.height + 0.5);
    expect(b.height, 'text has height').toBeGreaterThan(3);
  }
  if (credits === null) {
    expect(c.hosted).toBeNull();
    return;
  }
  expect(c.hosted).toMatchObject({ text: credits, icon: 'coin' });
  expect(c.hosted!.fontPx).toBeGreaterThanOrEqual(12);
  expect(overlaps(c.hosted!.box, c.face!.name), 'credits over the name').toBe(false);
  expect(overlaps(c.hosted!.box, c.face!.type), 'credits over the type').toBe(false);
  // No other card covers this one.
  for (const o of [...l.servers.flatMap((s) => [...s.ice, ...s.content]), ...l.rig]) if (o.uid !== uid) expect(overlaps(o.box, c.box), `${o.uid} over ${uid}`).toBe(false);
}

async function core(page: Page, seed = 1, flags = ''): Promise<void> {
  if (flags) {
    await page.goto(`./?seed=${seed}&${flags}`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
  } else await openBoard(page, { seed, decks: 'core' });
}

/** Dispatches actions through the hook (setup only); none may be refused. */
async function dispatchAll(page: Page, actions: readonly Action[]): Promise<void> {
  const bad = await page.evaluate((list) => {
    for (const a of list) {
      const r = window.__overclock!.dispatch(a).find((e) => e.type === 'action_rejected');
      if (r) return JSON.stringify({ a, r });
    }
    return null;
  }, actions as Action[]);
  expect(bad).toBeNull();
  await waitIdle(page);
}

/**
 * QA's own planner (pass-the-phone, seat views only): plays a LocalMatch with a simple policy until
 * `done(runnerView)` on a Runner action step. The Corp only takes credits; the Runner follows `runner`.
 */
function planWith(
  seed: number,
  deckSet: 'core' | 'starter',
  runner: (v: PlayerView) => Action,
  corp: (v: PlayerView) => Action,
  done: (v: Record<Side, PlayerView>) => boolean,
  max = 600,
): Action[] {
  const m = new LocalMatch(seed, { deckSet });
  const actions: Action[] = [];
  for (let i = 0; i < max; i++) {
    const views = { corp: m.view('corp'), runner: m.view('runner') };
    if (done(views)) return actions;
    const seat: Side = views.corp.legalActions.length > 0 ? 'corp' : 'runner';
    const v = views[seat];
    if (v.result) break;
    let a: Action;
    if (v.pendingDiscard > 0) a = { type: 'discard', player: seat, handIndices: Array.from({ length: v.pendingDiscard }, (_, k) => k) };
    else a = seat === 'runner' ? runner(v) : corp(v);
    const u = m.submit(seat, a);
    if (u[seat].events.some((e) => e.type === 'action_rejected')) throw new Error(`planner move refused: ${JSON.stringify(a)}`);
    actions.push(a);
  }
  throw new Error(`seed ${seed}: plan not reached`);
}
const has = (v: PlayerView, type: string) => v.legalActions.find((a) => a.type === type);
const credits = (v: PlayerView): Action => has(v, 'gain_credit') ?? has(v, 'pass') ?? { type: 'end_turn', player: v.viewer };

// ---- S-08-1 ------------------------------------------------------------------------------------

test.describe('QA S-08-1 identities', () => {
  test('both identities on the table for both seats; holding each zooms it with its full text', async ({ page }) => {
    await core(page);
    let l = await waitIdle(page);
    expect(l.identities.corp).toMatchObject({ uid: 'id:corp', cardId: 'c13' });
    expect(l.identities.runner).toMatchObject({ uid: 'id:runner', cardId: 'r13' });
    await shot(page, '01-identities-corp-seat');
    for (const [side, n] of [['corp', '02'], ['runner', '03']] as const) {
      const id = (await layout(page)).identities[side]!;
      const h = await holdAt(page, id.box);
      await waitZoom(page, id.cardId);
      await page.waitForTimeout(250);
      const z = (await layout(page)).zoom!;
      expect(z.textOverflow).toBe(false);
      const all = z.texts.join(' ').replace(/\s+/g, ' ');
      expect(all).toContain(getCard(id.cardId)!.name.split(':')[0]!);
      // Every word of the printed text is drawn.
      for (const w of getCard(id.cardId)!.text.split(/\s+/)) expect(all, `zoom shows "${w}"`).toContain(w.replace(/[.,]$/, ''));
      await shot(page, `${n}-identity-zoom-${side}`);
      await h.release();
      await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
    }
    await passTurn(page);
    l = await waitIdle(page);
    expect(l.viewer).toBe('runner');
    expect(l.identities.corp?.cardId).toBe('c13');
    expect(l.identities.runner?.cardId).toBe('r13');
    await shot(page, '04-identities-runner-seat');
  });

  test('Haas-Bioroid: first install +1 credit with the note; the second install that turn gives nothing', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, 1, 'corp_first_install');
    const before = await getView(page);
    let l = await pickHand(page, Number(plan.info['handIndex']));
    const t = l.targets.find((x) => x.kind === 'new_server' && x.lit)!;
    const cost = before.handOptions[Number(plan.info['handIndex'])]!.find((o) => o.action.type === 'install' && (o.action as { server?: string }).server === 'new')!.cost;
    const m = await measureTap(page, t.box);
    snappy(m);
    expect(m.view.players.corp.credits).toBe(before.players.corp.credits - cost + 1);
    l = await waitIdle(page);
    expect(l.hint?.text).toContain('Engineering the Future: +1 credit');
    await shot(page, '05-hb-first-install-note');
    // Second install: no bonus.
    const v = await getView(page);
    const idx = v.handOptions.findIndex((os) => os.some((o) => o.action.type === 'install' && o.reject === null));
    test.skip(idx < 0, 'no second install possible on this deal');
    l = await pickHand(page, idx);
    const t2 = l.targets.find((x) => x.lit && (x.kind === 'new_server' || x.kind === 'server'))!;
    const m2 = await measureTap(page, t2.box);
    expect(m2.events.some((e) => e.type === 'card_installed')).toBe(true);
    expect(m2.events.some((e) => e.type === 'ability_triggered' || e.type === 'credit_gained')).toBe(false);
    expect(m2.view.players.corp.credits).toBeLessThanOrEqual(v.players.corp.credits);
  });

  test('Kate: a resource first leaves the discount; Corroder\'s lit place says 1 credit (−1) and takes 1; the next program/hardware is full price', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, 1, 'runner_kate_discount');
    const v0 = await getView(page);
    // Resource first (real taps).
    let l = await pickHand(page, Number(plan.info['resourceIndex']));
    await tap(page, l.targets.find((x) => x.lit)!.box);
    await waitIdle(page);
    const v1 = await getView(page);
    const cIdx = v1.players.runner.hand!.indexOf('r04');
    expect(v1.handOptions[cIdx]!.find((o) => o.action.type === 'install')).toMatchObject({ cost: 1, discount: 1 });
    l = await pickHand(page, cIdx);
    const t = l.targets.find((x) => x.lit)!;
    expect(t.label).toContain('1 credit (−1)');
    await shot(page, '06-kate-corroder-price-1');
    const m = await measureTap(page, t.box);
    snappy(m);
    expect(m.view.players.runner.credits).toBe(v1.players.runner.credits - 1);
    expect(v1.players.runner.credits).toBe(v0.players.runner.credits - getCard(plan.info['resourceId']!)!.cost);
    l = await waitIdle(page);
    expect(l.hint?.text).toContain('Digital Tinker');
    // Any other program/hardware in the Grip now shows its full price, no (−1).
    const v2 = await getView(page);
    v2.players.runner.hand!.forEach((id, i) => {
      const c = getCard(id)!;
      if (c.type !== 'program' && c.type !== 'hardware') return;
      const o = v2.handOptions[i]!.find((x) => x.action.type === 'install');
      if (o) expect(o, c.name).toMatchObject({ cost: c.cost });
      if (o) expect(o.discount).toBeUndefined();
    });
  });
});

// ---- S-08-2 ------------------------------------------------------------------------------------

test.describe('QA S-08-2 Haas-Bioroid money cards', () => {
  test('Adonis: Rez · 4 credits, 12 on it on both seats (readable), +3 and the note at the Corp turn start', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, 1, 'corp_rez_adonis');
    const uid = plan.info['uid']!;
    let l = await tapInstalled(page, uid);
    const rez = targetOf(l, 'rez');
    expect(rez).toMatchObject({ label: 'Rez · 4 credits', lit: true });
    expect(Math.min(rez.box.width, rez.box.height)).toBeGreaterThanOrEqual(44);
    await shot(page, '07-adonis-rez-button');
    const before = await getView(page);
    const m = await measureTap(page, rez.box);
    snappy(m);
    expect(m.view.players.corp.credits).toBe(before.players.corp.credits - 4);
    l = await waitIdle(page);
    expectReadableCard(l, uid, '12');
    await passTurn(page);
    l = await waitIdle(page);
    expect(l.viewer).toBe('runner');
    expect(installedIn(l, uid)).toMatchObject({ faceUp: true, cardId: 'c14' });
    expectReadableCard(l, uid, '12');
    await shot(page, '08-adonis-12-runner-seat');
    const c = (await getView(page)).players.corp.credits;
    await passTurn(page);
    l = await waitIdle(page);
    expect(l.viewer).toBe('corp');
    expect(l.hint?.text).toContain('Adonis Campaign: +3 credits');
    expect(installedIn(l, uid).hosted?.text).toBe('9');
    expect((await getView(page)).players.corp.credits).toBe(c + 3);
    await shot(page, '09-adonis-plus-3-note');
  });

  test('Melange: with 2 clicks the button is dimmed and says why; with 3 it gives 7 and uses all 3', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, 1, 'corp_melange');
    const uid = plan.info['uid']!;
    await dispatchAll(page, [{ type: 'gain_credit', player: 'corp' }]);
    expect((await getView(page)).players.corp.clicks).toBe(2);
    let l = await tapInstalled(page, uid);
    const dim = targetOf(l, 'activate');
    expect(dim).toMatchObject({ label: 'Gain 7 credits · 3 clicks', lit: false, reject: 'no_clicks' });
    test.info().annotations.push({ type: 'melange-2-clicks-note', description: String(dim.note) });
    expect(dim.note, 'the dim button says why').toBeTruthy();
    await shot(page, '10-melange-dim-2-clicks');
    // A tap changes nothing.
    const before = JSON.stringify(await getView(page));
    await tap(page, dim.box);
    l = await waitIdle(page);
    test.info().annotations.push({ type: 'melange-2-clicks-hint', description: String(l.hint?.text) });
    expect(JSON.stringify(await getView(page))).toBe(before);
    // Fresh board: 3 clicks.
    await core(page);
    await toStep(page, 1, 'corp_melange');
    const v = await getView(page);
    l = await tapInstalled(page, uid);
    const use = targetOf(l, 'activate');
    expect(use.lit).toBe(true);
    await shot(page, '11-melange-gain-7-button');
    const m = await measureTap(page, use.box);
    snappy(m);
    expect(m.view.players.corp.credits).toBe(v.players.corp.credits + 7);
    expect(m.view.players.corp.clicks).toBe(0);
  });

  // QA-S8-1 (open bug, marked as expected to fail so CI stays green; it flips to "unexpected pass" once fixed):
  // with 2 clicks left the dim Melange button must not say "No clicks left".
  test('QA-S8-1: Melange with 2 clicks says it needs 3 clicks, not "No clicks left"', async ({ page }) => {
    test.fail(true, 'QA-S8-1 open: the note reads "No clicks left" while the Corp has 2 clicks');
    await core(page);
    const plan = await toStep(page, 1, 'corp_melange');
    await dispatchAll(page, [{ type: 'gain_credit', player: 'corp' }]);
    const l = await tapInstalled(page, plan.info['uid']!);
    const dim = targetOf(l, 'activate');
    expect(dim.lit).toBe(false);
    expect(dim.note).not.toBe('No clicks left');
  });

  test('Biotic Labor: the click counter goes to 4 and all 4 can be used', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, 1, 'corp_biotic_labor');
    const l = await pickHand(page, Number(plan.info['handIndex']));
    const m = await measureTap(page, targetOf(l, 'play').box);
    snappy(m);
    expect(m.view.players.corp.clicks).toBe(4);
    const after = await waitIdle(page);
    expect(after.text.corpClicks).toMatch(/4/);
    await shot(page, '12-biotic-labor-4-clicks');
    await dispatchAll(page, Array.from({ length: 4 }, () => ({ type: 'gain_credit', player: 'corp' }) as Action));
    expect((await getView(page)).players.corp.clicks).toBe(0);
  });
});

// ---- S-08-3 ------------------------------------------------------------------------------------

test.describe('QA S-08-3 brain damage', () => {
  test('Viktor: the report names Viktor 1.0 and says what happened; Hand max 4; at the end of the turn he discards down to 4', async ({ page }) => {
    await core(page);
    await toStep(page, 1, 'viktor_encounter');
    let l = await layout(page);
    const fire = runButtonOf(l, /^Let it fire/);
    expect(fire.label).toBe('Let it fire: take 1 brain damage, run ends');
    const m = await measureTap(page, fire.box);
    snappy(m);
    l = await waitIdle(page);
    expect(l.report?.text).toMatch(/Viktor 1\.0/);
    expect(l.report?.text).toMatch(/brain damage/);
    test.info().annotations.push({ type: 'viktor-report', description: l.report!.text });
    await shot(page, '13-viktor-report');
    await dismissReport(page);
    l = await waitIdle(page);
    expect(l.tags.runner?.text).toContain('Hand max 4');
    await shot(page, '14-hand-max-4');
    // Draw up to 6 cards if clicks allow, then End turn: discard down to 4.
    let v = await getView(page);
    const draws = Math.min(v.players.runner.clicks, Math.max(0, 6 - v.players.runner.handCount));
    await dispatchAll(page, Array.from({ length: draws }, () => ({ type: 'draw', player: 'runner' }) as Action));
    v = await getView(page);
    const over = v.players.runner.handCount - 4;
    if (v.players.runner.clicks > 0) await dispatchAll(page, Array.from({ length: v.players.runner.clicks }, () => ({ type: 'gain_credit', player: 'runner' }) as Action));
    l = await waitIdle(page);
    await tap(page, l.endTurn!.box);
    l = await waitIdle(page);
    if (over > 0) {
      v = await getView(page);
      expect(v.pendingDiscard).toBe(over);
      expect(l.picker?.remaining).toBe(over);
      await shot(page, '15-discard-down-to-4');
    } else {
      expect(l.picker).toBeNull();
      test.info().annotations.push({ type: 'discard', description: `hand ${v.players.runner.handCount} <= 4: no discard step` });
    }
  });

  test('Heimdall vs Corroder: what the screen shows about breaking (+4 strength then 3 breaks)', async ({ page }) => {
    await core(page);
    await toStep(page, 1, 'heimdall_corroder_encounter');
    let l = await layout(page);
    expect(l.run!.stepLabel).toBe('Encounter: Heimdall 1.0');
    test.info().annotations.push({ type: 'heimdall-corroder', description: JSON.stringify({ lines: l.run!.lines, buttons: l.run!.buttons.map((b) => [b.label, b.lit, b.reject]) }) });
    expect(l.run!.lines).toContain('Strength 6');
    expect(l.run!.lines).toContain('Corroder 2');
    const breaks = l.run!.buttons.filter((b) => /Break "/.test(b.label));
    expect(breaks).toHaveLength(3);
    for (const b of breaks) expect(b).toMatchObject({ lit: false, reject: 'too_weak' });
    await shot(page, '16-heimdall-corroder-prices');
    const c0 = (await getView(page)).players.runner.credits;
    for (let i = 0; i < 4; i++) {
      await tap(page, runButtonOf(l, /^\+1 strength/).box);
      l = await waitIdle(page);
    }
    expect(l.run!.lines).toContain('Corroder 6');
    for (let i = 0; i < 3; i++) {
      const b = l.run!.buttons.find((x) => /Break "/.test(x.label) && x.lit)!;
      await tap(page, b.box);
      l = await waitIdle(page);
    }
    expect(c0 - (await getView(page)).players.runner.credits).toBe(7);
    await shot(page, '17-heimdall-all-broken');
  });
});

// ---- S-08-4 ------------------------------------------------------------------------------------

test.describe('QA S-08-4 Kate cards', () => {
  test('Battering Ram: Break up to 2 · 2 credits, pick subroutines 1 and 3, one payment', async ({ page }) => {
    await core(page);
    await toStep(page, 1, 'heimdall_ram_encounter');
    let l = await layout(page);
    while (!l.run!.buttons.find((b) => b.role === 'multi')!.lit) {
      await tap(page, runButtonOf(l, /\+1 strength/).box);
      l = await waitIdle(page);
    }
    await tap(page, l.run!.buttons.find((b) => b.role === 'multi')!.box);
    l = await waitIdle(page);
    await tap(page, l.run!.buttons.filter((b) => b.role === 'toggle')[0]!.box);
    l = await waitIdle(page);
    await tap(page, l.run!.buttons.filter((b) => b.role === 'toggle')[2]!.box);
    l = await waitIdle(page);
    const confirm = l.run!.buttons.find((b) => b.role === 'confirm')!;
    expect(confirm).toMatchObject({ lit: true, label: 'Break 2 · 2 credits' });
    for (const b of l.run!.buttons) expect(Math.min(b.box.width, b.box.height)).toBeGreaterThanOrEqual(44);
    await shot(page, '18-ram-pick-1-and-3');
    const c = (await getView(page)).players.runner.credits;
    const m = await measureTap(page, confirm.box);
    snappy(m);
    expect(m.events.filter((e) => e.type === 'subroutine_broken').map((e) => (e as { sub: number }).sub)).toEqual([0, 2]);
    expect(m.view.players.runner.credits).toBe(c - 2);
    l = await waitIdle(page);
    expect(l.run!.subroutines.map((s) => s.broken)).toEqual([true, false, true]);
    await shot(page, '19-ram-two-broken');
  });

  test('Pipeline on Neural Katana: 2 credits twice for +2, then 1 credit breaks; strength stays', async ({ page }) => {
    await core(page);
    await toStep(page, 1, 'pipeline_katana_encounter');
    let l = await layout(page);
    const c = (await getView(page)).players.runner.credits;
    const pumpBtn = runButtonOf(l, /\+1 strength/);
    expect(pumpBtn.label).toMatch(/2 credits/);
    for (let i = 0; i < 2; i++) {
      await tap(page, runButtonOf(l, /\+1 strength/).box);
      l = await waitIdle(page);
    }
    expect(l.run!.lines).toContain('Pipeline 3');
    const brk = l.run!.buttons.find((b) => /Break "/.test(b.label))!;
    expect(brk).toMatchObject({ lit: true });
    expect(brk.label).toMatch(/1 credit$/);
    await shot(page, '20-pipeline-katana');
    await tap(page, brk.box);
    l = await waitIdle(page);
    expect(c - (await getView(page)).players.runner.credits).toBe(5);
    // Still strength 3 after the break (for the remainder of this run).
    if (l.run?.step === 'encounter') expect(l.run.lines).toContain('Pipeline 3');
  });

  test('Magnum Opus: Gain 2 credits · 1 click, used every click; its name and PROGRAM line readable', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, 1, 'runner_magnum_opus');
    const uid = plan.info['uid']!;
    let l = await tapInstalled(page, uid);
    const use = targetOf(l, 'activate');
    expect(use).toMatchObject({ label: 'Gain 2 credits · 1 click', lit: true });
    await shot(page, '21-magnum-opus-button');
    let v = await getView(page);
    while (v.players.runner.clicks > 0) {
      l = await layout(page);
      if (l.selectedInstalled !== uid) l = await tapInstalled(page, uid);
      const m = await measureTap(page, targetOf(l, 'activate').box);
      snappy(m);
      expect(m.view.players.runner.credits).toBe(v.players.runner.credits + 2);
      await waitIdle(page);
      v = await getView(page);
    }
    l = await waitIdle(page);
    expect(maybeInstalled(l, uid)).toBeDefined();
    expectReadableCard(l, uid, null);
  });

  test('Sure Gamble: 5 credits -> 9', async ({ page }) => {
    await core(page);
    const plan = await toStep(page, 1, 'runner_sure_gamble');
    const l = await pickHand(page, Number(plan.info['handIndex']));
    const m = await measureTap(page, targetOf(l, 'play').box);
    snappy(m);
    expect(m.view.players.runner.credits).toBe(9);
    await waitIdle(page);
    await shot(page, '22-sure-gamble-9');
  });

  test('four memory used: the next program is dimmed "Not enough memory" and a tap says so', async ({ page }) => {
    // QA planner: the Runner installs programs (never Akamatsu), plays money, draws; the Corp takes credits.
    const seed = 3;
    const runner = (v: PlayerView): Action => {
      const hand = v.players.runner.hand!;
      const prg = hand.findIndex((id, i) => getCard(id)!.type === 'program' && v.handOptions[i]!.some((o) => o.action.type === 'install' && o.reject === null));
      if (prg >= 0) return v.handOptions[prg]!.find((o) => o.action.type === 'install')!.action;
      const money = hand.findIndex((id, i) => (id === 'r14' || id === 'r01') && v.handOptions[i]!.some((o) => o.action.type === 'play' && o.reject === null));
      if (money >= 0) return v.handOptions[money]!.find((o) => o.action.type === 'play')!.action;
      return has(v, 'draw') ?? credits(v);
    };
    const done = (vs: Record<Side, PlayerView>) => {
      const v = vs.runner;
      if (v.activePlayer !== 'runner' || v.run || v.players.runner.clicks === 0 || v.pendingDiscard > 0) return false;
      return v.handOptions.some((os) => os.some((o) => o.action.type === 'install' && o.reject === 'no_memory'));
    };
    const actions = planWith(seed, 'core', runner, credits, done);
    await core(page, seed);
    await dispatchAll(page, actions);
    const v = await getView(page);
    expect(v.memory).toMatchObject({ limit: 4 });
    const idx = v.handOptions.findIndex((os) => os.some((o) => o.action.type === 'install' && o.reject === 'no_memory'));
    let l = await pickHand(page, idx);
    const t = l.targets.find((x) => x.kind === 'install')!;
    expect(t).toMatchObject({ lit: false, reject: 'no_memory' });
    await tap(page, t.box);
    l = await waitIdle(page);
    expect(l.hint?.text).toBe('Not enough memory');
    expect(JSON.stringify((await getView(page)).rig)).toBe(JSON.stringify(v.rig));
    test.info().annotations.push({ type: 'memory', description: `${l.memory.text}; refused ${getCard(v.players.runner.hand![idx]!)!.name}` });
    await shot(page, '23-not-enough-memory');
  });
});

// ---- S-08-7 ------------------------------------------------------------------------------------

test.describe('QA S-08-7 Rototurret and Sacrificial Construct', () => {
  async function lift(page: Page): Promise<LayoutSnapshot> {
    const l = await layout(page);
    if (l.cover) {
      await tap(page, { x: l.viewport.width / 2 - 5, y: l.viewport.height - 40, width: 10, height: 10 });
      await page.waitForFunction(() => window.__overclock!.layout().cover === null);
    }
    return waitIdle(page);
  }

  test('pass-and-play with the cover: Runner lets it fire -> cover -> Corp picks -> cover -> Runner saves with the Construct', async ({ page }) => {
    await core(page, 7, 'play=here');
    const plan = await toStep(page, 7, 'rototurret_two_programs');
    const construct = plan.info['construct']!;
    expect(construct).not.toBe('');
    let l = await lift(page);
    expect(l.viewer).toBe('runner');
    const fire = runButtonOf(l, /^Let it fire/);
    expect(fire.label).toContain('trash 1 program');
    await tap(page, fire.box);
    l = await layout(page);
    expect(l.cover).toMatchObject({ to: 'corp' });
    // The opaque cover fills the screen (the Corp's choice under it is not visible; see the screenshot).
    expect(l.cover!.box.width).toBeGreaterThanOrEqual(l.viewport.width - 1);
    expect(l.cover!.box.height).toBeGreaterThanOrEqual(l.viewport.height - 1);
    await shot(page, '24-rototurret-cover-to-corp');
    l = await lift(page);
    test.info().annotations.push({ type: 'corp-decides', description: JSON.stringify({ viewer: l.viewer, deciding: l.run?.deciding, hand: l.hand.map((h) => h.cardId), handText: l.text.runnerHand }) });
    expect(l.run!.deciding).toBe('corp');
    expect(l.run!.stepLabel).toBe('Rototurret: pick a program to trash');
    const programs = plan.info['programs']!.split(',');
    expect([...l.run!.choice!.lit].sort()).toEqual([...programs].sort());
    for (const b of l.run!.buttons) expect(Math.min(b.box.width, b.box.height)).toBeGreaterThanOrEqual(44);
    await shot(page, '25-rototurret-corp-picks');
    const pick = l.run!.buttons[0]!;
    const picked = pick.action.type === 'choose' ? pick.action.uid : '';
    const m = await measureTap(page, pick.box);
    snappy(m);
    l = await layout(page);
    expect(l.cover).toMatchObject({ to: 'runner' });
    l = await lift(page);
    expect(l.run!.choice).toMatchObject({ kind: 'prevent_trash', target: picked });
    expect(l.run!.buttons.map((b) => b.label)).toEqual(['Trash Sacrificial Construct instead', 'Let it be trashed']);
    await shot(page, '26-construct-save-choice');
    const m2 = await measureTap(page, l.run!.buttons[0]!.box);
    snappy(m2);
    l = await waitIdle(page);
    expect(maybeInstalled(l, picked)).toBeDefined();
    expect(maybeInstalled(l, construct)).toBeUndefined();
    const v = await getView(page);
    expect(v.players.runner.discard.at(-1)).toBe('r12');
    expect(v.run).toBeNull();
    expect(l.report?.text).toContain('Sacrificial Construct');
    await shot(page, '27-construct-saved-report');
  });

  test('online: the Corp picks on its device, the Runner lets it be trashed on his; same as pass-and-play; no hidden card in any frame', async ({ browser }) => {
    test.setTimeout(90_000);
    const seed = 9;
    const plan = planToStep(seed, 'rototurret_two_programs', undefined, ONLINE_CORE);
    expect(plan.info['construct']).not.toBe('');
    const host = await openPhone(browser);
    const guest = await openPhone(browser);
    const code = await startTestGame(host, 'runner', { seed, actions: plan.actions, deckSet: 'core' });
    await joinGame(guest, code);
    await Promise.all([waitPlaying(host), waitPlaying(guest)]);
    const runner: Phone = host;
    const corp: Phone = guest;
    const waitL = async (p: Phone, pred: (l: LayoutSnapshot) => boolean) => {
      const until = Date.now() + 10_000;
      for (;;) {
        const l = await layoutOf(p);
        if (pred(l) && !l.animating) return l;
        if (Date.now() > until) throw new Error('layout never matched');
        await new Promise((r) => setTimeout(r, 25));
      }
    };
    let rl = await waitL(runner, (l) => l.run?.step === 'encounter');
    const fire = runButtonOf(rl, /^Let it fire/);
    await tap(runner.page, fire.box);
    rl = await waitL(runner, (l) => l.run?.choice?.kind === 'trash_target');
    expect(rl.run!.stepLabel).toBe('Corp is choosing…');
    expect(rl.run!.buttons).toEqual([]);
    await shot(runner.page, '28-online-runner-corp-is-choosing');
    let cl = await waitL(corp, (l) => l.run?.choice?.kind === 'trash_target' && l.run.buttons.length >= 2);
    await shot(corp.page, '29-online-corp-picks');
    const pick = cl.run!.buttons[1]!;
    const picked = pick.action.type === 'choose' ? pick.action.uid : '';
    await tap(corp.page, pick.box);
    rl = await waitL(runner, (l) => l.run?.choice?.kind === 'prevent_trash' && l.run.buttons.length === 2);
    cl = await waitL(corp, (l) => l.run?.choice?.kind === 'prevent_trash');
    expect(cl.run!.stepLabel).toBe('Runner is choosing…');
    expect(cl.run!.buttons).toEqual([]);
    await shot(runner.page, '30-online-runner-save-or-not');
    const letGo = runButtonOf(rl, 'Let it be trashed');
    await tap(runner.page, letGo.box);
    // Same as pass-and-play (LocalMatch with the same moves).
    const m = new LocalMatch(seed, ONLINE_CORE);
    for (const a of [...plan.actions, fire.action, pick.action, letGo.action]) m.submit(a.player, a);
    for (const side of ['corp', 'runner'] as const) {
      const want = m.view(side);
      const ph = side === 'corp' ? corp : runner;
      const got = await waitView(ph, (x) => JSON.stringify([x.rig, x.players]) === JSON.stringify([want.rig, want.players]));
      expect(got.corpServers).toEqual(want.corpServers);
      expect(got.rig.some((c) => c.uid === picked)).toBe(false);
    }
    await waitL(runner, () => true);
    await shot(runner.page, '31-online-runner-after-trash');
    // Hidden information in every frame (QA's own check). Face-down uids at the end (they never flip back).
    const truth = m.view('corp');
    const down = new Set(truth.corpServers.flatMap((s) => [...s.ice, ...s.content]).filter((c) => !c.faceUp).map((c) => c.uid));
    let checked = 0;
    for (const f of frames(runner.received)) {
      const raw = JSON.stringify(f);
      expect(raw).not.toMatch(/"(seed|rng|deck|installedThisTurn)"\s*:/);
      if (f.view) {
        expect(f.view.players.corp.hand).toBeNull();
        for (const s of f.view.corpServers) for (const c of [...s.ice, ...s.content]) if (down.has(c.uid)) expect(c.cardId).toBeNull();
        for (const k of Object.keys(f.view.installedOptions)) expect(f.view.rig.some((c) => c.uid === k)).toBe(true);
        if (f.view.choice && f.view.choice.waitingOn === 'corp') expect(f.view.choice.options).toEqual([]);
        checked++;
      }
      for (const e of f.events ?? []) {
        const uid = (e as { uid?: string }).uid;
        if (uid && down.has(uid) && e.type !== 'card_accessed') expect((e as { cardId?: string }).cardId ?? null, JSON.stringify(e)).toBeNull();
      }
    }
    for (const f of frames(corp.received)) {
      if (f.view) {
        expect(f.view.players.runner.hand).toBeNull();
        if (f.view.choice && f.view.choice.waitingOn === 'runner') expect(f.view.choice.options).toEqual([]);
      }
      for (const e of f.events ?? []) if (e.type === 'card_drawn' && e.player === 'runner') expect(e.cardId).toBeUndefined();
    }
    expect(checked).toBeGreaterThan(2);
    await Promise.all([host.context.close(), guest.context.close()]);
  });
});

// ---- S-08-6 ------------------------------------------------------------------------------------

test.describe('QA S-08-6 credits and counters readable (QA-S7-1, QA-S7-2)', () => {
  test('Armitage 12 and Bank Job 8: full name, RESOURCE line and credits readable, nothing covering', async ({ page }) => {
    await openBoard(page, 1);
    const a = await toStep(page, 1, 'runner_armitage');
    let l = await waitIdle(page);
    expectReadableCard(l, a.info['uid']!, '12');
    await shot(page, '32-armitage-12-readable');
    await openBoard(page, 1);
    const b = await toStep(page, 1, 'runner_bank_job_remote');
    l = await waitIdle(page);
    expectReadableCard(l, b.info['bankJobUid']!, '8');
    await shot(page, '33-bank-job-8-readable');
  });

  test('an advanced Ice Wall and an Armitage holding credits on the table together: different colour and icon', async ({ page }) => {
    // QA planner (starter decks): from the corp_ice_wall step, the Corp advances Ice Wall twice and then only
    // takes credits; the Runner installs Armitage as soon as he holds it, else draws.
    const base = planToStep(1, 'corp_ice_wall');
    const ice = base.info['uid']!;
    const m = new LocalMatch(1, { deckSet: 'starter' });
    for (const a of base.actions) m.submit(a.player, a);
    const pre: Action[] = [...base.actions, { type: 'advance', player: 'corp', uid: ice }, { type: 'advance', player: 'corp', uid: ice }];
    m.submit('corp', pre.at(-2)!);
    m.submit('corp', pre.at(-1)!);
    const runner = (v: PlayerView): Action => {
      const i = v.players.runner.hand!.indexOf('r02');
      if (i >= 0 && v.handOptions[i]!.some((o) => o.action.type === 'install' && o.reject === null)) return v.handOptions[i]!.find((o) => o.action.type === 'install')!.action;
      return has(v, 'draw') ?? credits(v);
    };
    const corpMove = (v: PlayerView): Action => has(v, 'gain_credit') ?? has(v, 'pass') ?? { type: 'end_turn', player: 'corp' };
    const rest: Action[] = [];
    for (let i = 0; i < 300; i++) {
      const vs = { corp: m.view('corp'), runner: m.view('runner') };
      if (vs.runner.rig.some((c) => c.cardId === 'r02') && vs.runner.activePlayer === 'runner') break;
      const seat: Side = vs.corp.legalActions.length > 0 ? 'corp' : 'runner';
      const v = vs[seat];
      const a: Action = v.pendingDiscard > 0 ? { type: 'discard', player: seat, handIndices: Array.from({ length: v.pendingDiscard }, (_, k) => k) } : seat === 'runner' ? runner(v) : corpMove(v);
      m.submit(seat, a);
      rest.push(a);
    }
    const v = m.view('runner');
    expect(v.rig.some((c) => c.cardId === 'r02')).toBe(true);
    expect(v.corpServers.flatMap((s) => s.ice).find((c) => c.uid === ice)!.advancements).toBe(2);
    await openBoard(page, 1);
    await dispatchAll(page, [...pre, ...rest]);
    let l = await waitIdle(page);
    expect(l.viewer).toBe('runner');
    const arm = l.rig.find((c) => c.cardId === 'r02')!;
    const wall = installedIn(l, ice);
    expect(wall.counterBadge).toMatchObject({ text: '2', icon: 'chevron' });
    expect(arm.hosted).toMatchObject({ icon: 'coin' });
    expect(arm.hosted!.color).not.toBe(wall.counterBadge!.color);
    expectReadableCard(l, arm.uid, arm.hosted!.text);
    await shot(page, '34-ice-wall-counters-vs-armitage-credits');
    await passTurn(page);
    l = await waitIdle(page);
    expect(l.viewer).toBe('corp');
    expect(installedIn(l, ice).counterBadge).toMatchObject({ text: '2', icon: 'chevron' });
    expect(installedIn(l, arm.uid).hosted).toMatchObject({ icon: 'coin' });
    await shot(page, '35-same-from-corp-seat');
  });
});
