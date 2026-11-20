// QA Sprint 7 (written by QA, not the developers). Screenshots go to
// docs/sprints/sprint-07-qa/<project>-NN-<what>.png (all three sizes).
//
// - Each card's button / credits pill / note on screen, with real taps:
//   PAD Campaign, Akitaro Watanabe, Armitage Codebusting, Akamatsu Mem Chip,
//   Cyberfeeder, Bank Job, Ice Wall (counters seen by the Runner on the face-down card).
// - S-07-1: the emptied server's column folds away; other names kept.
// - S-07-6: hand view, lift, drag over a lit place, drop, let go away, tap outside.
// - S-07-6 drag latency, QA's own measure: a fast continuous drag (a move every
//   ~16 ms, nothing waited for between moves); each move counts as drawn only on
//   the first frame where the lifted card is drawn at that move's x.
// - Online (two browser contexts against the local service): PAD Campaign rezzed and
//   the turn moving on (+1 credit on both phones), Akitaro's discount online, Ice Wall
//   counters, a server removed, the Runner dragging a card to play; the Runner's frames
//   never name a face-down Corp card.
// - "device" wording: no "phone" in the pass-and-play words.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Action, PlayerView, Side } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';
import { planToStep } from '@overclock/match/testing';
import { type Browser, type Page, expect, test } from '@playwright/test';
import {
  type Box,
  type InstalledSnapshot,
  type LayoutSnapshot,
  anims,
  center,
  dispatch,
  emptySpot,
  getView,
  holdAt,
  inside,
  layout,
  liftHand,
  measureTap,
  openBoard,
  openHand,
  outsideHandView,
  overlaps,
  passTurn,
  runButtonOf,
  safeRect,
  startRun,
  tap,
  targetOf,
  toRunnerTurn,
  toStep,
  waitIdle,
} from './helpers';
import { type Phone, act, frames, joinGame, layoutOf, openPhone, startTestGame, tapButton, view, waitPlaying, waitView } from './online';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-07-qa');
const ONLINE = { rezWindow: 'always', deckSet: 'starter' } as const;

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${test.info().project.name}-${name}.png`) });
}

function installedIn(l: LayoutSnapshot, uid: string): InstalledSnapshot {
  const c = [...l.servers.flatMap((s) => [...s.ice, ...s.content]), ...l.rig].find((x) => x.uid === uid);
  if (!c) throw new Error(`no installed card ${uid}`);
  return c;
}

async function tapInstalled(page: Page, uid: string): Promise<LayoutSnapshot> {
  await tap(page, installedIn(await layout(page), uid).box);
  await page.waitForFunction((u) => window.__overclock!.layout().selectedInstalled === u, uid);
  return layout(page);
}

async function dispatchAll(page: Page, actions: readonly Action[]): Promise<void> {
  const bad = await page.evaluate((as) => {
    for (const a of as) {
      const r = window.__overclock!.dispatch(a).find((e) => e.type === 'action_rejected');
      if (r) return JSON.stringify({ a, r });
    }
    return null;
  }, actions as Action[]);
  expect(bad).toBeNull();
  await waitIdle(page);
}

/** An installed-card button is readable and tappable: on screen (safe area), ≥ 44 px, not over a hand card. */
function expectGoodButton(l: LayoutSnapshot, b: Box, name: string): void {
  expect(inside(b, safeRect(l)), `${name} inside the screen`).toBe(true);
  expect(Math.min(b.width, b.height), `${name} at least 44 px`).toBeGreaterThanOrEqual(44);
  for (const h of l.hand) expect(overlaps(b, h.box), `${name} over a hand card`).toBe(false);
}

/** A credits pill: digits ≥ 14 px, drawn on its card. */
function expectGoodPill(c: InstalledSnapshot, text: string): void {
  expect(c.hosted, `credits pill on ${c.cardId}`).not.toBeNull();
  expect(c.hosted!.text).toBe(text);
  expect(c.hosted!.fontPx).toBeGreaterThanOrEqual(14);
  const b = c.hosted!.box;
  const card = c.box;
  // The pill sits on the card (allow it to straddle the edge by a few px).
  expect(b.x + b.width / 2 >= card.x && b.x + b.width / 2 <= card.x + card.width && b.y + b.height / 2 >= card.y && b.y + b.height / 2 <= card.y + card.height, 'pill centred on its card').toBe(true);
}

// ---- S-07-1 ----------------------------------------------------------------------------------------

test.describe('QA S-07-1 empty server column', () => {
  test('stealing the last card: the column folds away (≤ 200 ms, non-blocking), names kept; both boards agree', async ({ page }) => {
    await openBoard(page, 3);
    const plan = await toStep(page, 3, 'remote_last_card');
    const server = plan.info['server']!;
    let l = await layout(page);
    const names = Object.fromEntries(l.servers.map((s) => [s.id, s.label]));
    await shot(page, '01-s07-1-before-steal');
    l = await startRun(page, server);
    await page.evaluate(() => window.__overclock!.clearAnims());
    const m = await measureTap(page, runButtonOf(l, 'Steal').box);
    expect(m.stateAt - m.handledAt).toBeLessThan(100);
    l = await waitIdle(page);
    expect(l.servers.map((s) => s.id)).not.toContain(server);
    for (const s of l.servers) expect(s.label).toBe(names[s.id]);
    const fold = (await anims(page)).filter((a) => a.kind === 'server_close');
    expect(fold.length).toBe(1);
    expect(fold[0]!.scheduledMs).toBeLessThanOrEqual(200);
    expect(l.labels).not.toContain(names[server]);
    await shot(page, '02-s07-1-server-gone-runner');
    await passTurn(page);
    l = await waitIdle(page);
    expect(l.viewer).toBe('corp');
    expect(l.servers.map((s) => s.id)).not.toContain(server);
    for (const s of l.servers) expect(s.label).toBe(names[s.id]);
    await shot(page, '03-s07-1-server-gone-corp');
  });
});

// ---- S-07-2 ----------------------------------------------------------------------------------------

test.describe('QA S-07-2 PAD Campaign and Akitaro Watanabe', () => {
  test('PAD Campaign: face down gives nothing; Rez · 2 credits (no click); face up on both boards; +1 credit note at the Corp turn start', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'corp_rez_asset');
    const uid = plan.info['uid']!;
    // The Runner's board: a card back, no Rez button for him.
    // Face down for a whole round first: nothing at the Corp's next turn start.
    let v = await getView(page);
    await passTurn(page);
    let rl = await layout(page);
    expect(installedIn(rl, uid)).toMatchObject({ cardId: null, faceUp: false });
    await tap(page, installedIn(rl, uid).box);
    rl = await layout(page);
    expect(rl.targets.filter((t) => t.kind === 'rez')).toEqual([]);
    await page.evaluate(() => window.__overclock!.clearAnims());
    const corpCredits = (await getView(page)).players.corp.credits;
    await passTurn(page);
    v = await getView(page);
    expect(v.viewer).toBe('corp');
    expect(v.players.corp.credits).toBe(corpCredits);
    expect((await anims(page)).filter((a) => a.kind === 'notice' && /PAD/.test(a.text ?? ''))).toEqual([]);
    // Rez it.
    let l = await tapInstalled(page, uid);
    const rez = targetOf(l, 'rez');
    expect(rez).toMatchObject({ label: 'Rez · 2 credits', lit: true });
    expectGoodButton(l, rez.box, 'Rez button');
    await shot(page, '04-s07-2-pad-rez-button');
    const m = await measureTap(page, rez.box);
    expect(m.stateAt - m.handledAt).toBeLessThan(100);
    expect(m.view.players.corp.credits).toBe(v.players.corp.credits - 2);
    expect(m.view.players.corp.clicks).toBe(v.players.corp.clicks);
    expect(m.anims.filter((a) => a.kind === 'card_rez').every((a) => a.scheduledMs <= 300)).toBe(true);
    l = await waitIdle(page);
    expect(installedIn(l, uid)).toMatchObject({ cardId: 'c03', faceUp: true });
    await shot(page, '05-s07-2-pad-face-up-corp');
    await passTurn(page);
    l = await waitIdle(page);
    expect(l.viewer).toBe('runner');
    expect(installedIn(l, uid)).toMatchObject({ cardId: 'c03', faceUp: true });
    await shot(page, '06-s07-2-pad-face-up-runner');
    const c = (await getView(page)).players.corp.credits;
    await page.evaluate(() => window.__overclock!.clearAnims());
    await passTurn(page);
    expect((await getView(page)).players.corp.credits).toBe(c + 1);
    await page.waitForFunction(() => window.__overclock!.layout().hint?.text === 'PAD Campaign: +1 credit');
    const notes = (await anims(page)).filter((a) => a.kind === 'notice' && a.text === 'PAD Campaign: +1 credit');
    expect(notes.length).toBe(1);
    expect(notes[0]!.fontPx ?? 14).toBeGreaterThanOrEqual(12);
    await shot(page, '07-s07-2-pad-plus-1-note');
  });

  test('Akitaro Watanabe: face down on the Corp turn shows "Rez · 1 credit"; face up, the Corp with 1 credit is asked to rez Wall of Static for 1', async ({ page }) => {
    await openBoard(page, 1);
    const plan = planToStep(1, 'runner_approach_akitaro');
    const akitaro = plan.info['akitaroUid']!;
    const k = plan.actions.findIndex((a) => a.type === 'rez' && a.uid === akitaro);
    expect(k).toBeGreaterThan(0);
    await dispatchAll(page, plan.actions.slice(0, k));
    let l = await layout(page);
    expect(l.viewer).toBe('corp');
    l = await tapInstalled(page, akitaro);
    const rez = targetOf(l, 'rez');
    expect(rez).toMatchObject({ label: 'Rez · 1 credit', lit: true });
    expectGoodButton(l, rez.box, 'Rez button');
    await shot(page, '08-s07-2-akitaro-rez-button');
    const m = await measureTap(page, rez.box);
    expect(m.events.map((e) => e.type)).toEqual(['credits_spent', 'card_rezzed']);
    await dispatchAll(page, plan.actions.slice(k + 1));
    l = await waitIdle(page);
    const v = await getView(page);
    expect(l.run).toMatchObject({ step: 'approach', deciding: 'corp' });
    expect(installedIn(l, akitaro)).toMatchObject({ faceUp: true, cardId: 'c11' });
    const dec = await page.evaluate(() => window.__overclock!.decision());
    expect(dec?.seat).toBe('corp');
    const btn = runButtonOf(l, /^Rez /);
    expect(btn).toMatchObject({ label: 'Rez Wall of Static · 1 credit', lit: true });
    expect(v.players.corp.credits).toBe(1);
    await shot(page, '09-s07-2-akitaro-discount-rez-wall-of-static-1');
    await tap(page, btn.box);
    l = await waitIdle(page);
    expect((await getView(page)).players.corp.credits).toBe(0);
    expect(l.run?.step).toBe('encounter');
  });
});

// ---- S-07-3 ----------------------------------------------------------------------------------------

test.describe('QA S-07-3 Armitage Codebusting and Akamatsu Mem Chip', () => {
  test('Armitage: 12 on the card for both; Take 2 credits · 1 click; 10 on the Corp board; no clicks: dimmed, "No clicks left", nothing changes', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'runner_armitage');
    const uid = plan.info['uid']!;
    let l = await waitIdle(page);
    expectGoodPill(installedIn(l, uid), '12');
    await shot(page, '10-s07-3-armitage-12');
    const before = await getView(page);
    l = await tapInstalled(page, uid);
    const take = targetOf(l, 'activate');
    expect(take).toMatchObject({ label: 'Take 2 credits · 1 click', lit: true });
    expectGoodButton(l, take.box, 'Take button');
    await shot(page, '11-s07-3-armitage-take-button');
    const m = await measureTap(page, take.box);
    expect(m.stateAt - m.handledAt).toBeLessThan(100);
    expect(m.view.players.runner.credits).toBe(before.players.runner.credits + 2);
    expect(m.view.players.runner.clicks).toBe(before.players.runner.clicks - 1);
    expect(m.anims.filter((a) => a.kind === 'hosted_pop').every((a) => a.scheduledMs <= 600)).toBe(true);
    l = await waitIdle(page);
    expectGoodPill(installedIn(l, uid), '10');
    // Spend the other clicks, then tap again: dimmed with the reason.
    while ((await getView(page)).players.runner.clicks > 0) await dispatch(page, { type: 'gain_credit', player: 'runner' });
    l = await waitIdle(page);
    const v0 = await getView(page);
    if (l.selectedInstalled !== uid) l = await tapInstalled(page, uid);
    const dim = targetOf(l, 'activate');
    expect(dim).toMatchObject({ label: 'Take 2 credits · 1 click', lit: false, reject: 'no_clicks', note: 'No clicks left' });
    await shot(page, '12-s07-3-armitage-no-clicks');
    await page.evaluate(() => window.__overclock!.clearAnims());
    const m2 = await measureTap(page, dim.box);
    expect(m2.view).toEqual(v0);
    await passTurn(page);
    l = await waitIdle(page);
    expect(l.viewer).toBe('corp');
    expectGoodPill(installedIn(l, uid), '10');
    await shot(page, '13-s07-3-armitage-10-on-corp-board');
  });

  test('Akamatsu Mem Chip: memory reads …/5 after installing it (…/4 before)', async ({ page }) => {
    await openBoard(page, 1);
    await toRunnerTurn(page);
    let l = await layout(page);
    expect(l.memory.text).toMatch(/\/4$/);
    const v = await getView(page);
    const i = v.players.runner.hand!.indexOf('r09');
    expect(i).toBeGreaterThanOrEqual(0);
    await dispatch(page, { type: 'install', player: 'runner', handIndex: i });
    l = await waitIdle(page);
    expect(l.memory.text).toMatch(/\/5$/);
    await shot(page, '14-s07-3-memory-5');
  });
});

// ---- S-07-4 ----------------------------------------------------------------------------------------

test.describe('QA S-07-4 Cyberfeeder and Bank Job', () => {
  test('Cyberfeeder: pill 1; "Break … · Cyberfeeder pays" with 0 own credits; pill gone; back to 1 next Runner turn', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'runner_cyberfeeder_ice_wall');
    const cf = plan.info['cyberfeederUid']!;
    let l = await waitIdle(page);
    expectGoodPill(installedIn(l, cf), '1');
    expect((await getView(page)).players.runner.credits).toBe(0);
    const brk = runButtonOf(l, /Cyberfeeder pays/);
    expect(brk.lit).toBe(true);
    expect(brk.fontPx).toBeGreaterThanOrEqual(11);
    await shot(page, '15-s07-4-cyberfeeder-pays-button');
    const m = await measureTap(page, brk.box);
    expect(m.events[0]).toMatchObject({ type: 'credits_spent', amount: 1, hosted: 1 });
    l = await waitIdle(page);
    expect(installedIn(l, cf).hosted).toBeNull();
    expect(l.run!.subroutines.every((s) => s.broken)).toBe(true);
    await shot(page, '16-s07-4-cyberfeeder-used');
    for (let g = 0; g < 10 && (await getView(page)).run; g++) {
      const run = (await layout(page)).run!;
      const b = run.buttons.find((x) => x.lit && /^(Continue|Let it|Done|Leave it|Steal|Access cards)/.test(x.label)) ?? run.buttons.find((x) => x.lit)!;
      await tap(page, b.box);
      await waitIdle(page);
    }
    await passTurn(page);
    await passTurn(page);
    l = await waitIdle(page);
    expect(l.viewer).toBe('runner');
    expectGoodPill(installedIn(l, cf), '1');
  });

  test('Bank Job: pill 8; remote run asks "Take credits" / "Access cards"; Take credits opens at 8, "Take 8": +8, nothing accessed, to the Heap, note', async ({ page }) => {
    // Sprint 10 (S-10-3, approved): the Runner now picks the amount. QA edit: "Take credits" then the
    // amount control opens at the most it holds; "Take 8" keeps every Sprint 7 check (take all).
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'runner_bank_job_remote');
    const bj = plan.info['bankJobUid']!;
    let l = await waitIdle(page);
    expectGoodPill(installedIn(l, bj), '8');
    await shot(page, '17-s07-4-bank-job-8');
    l = await startRun(page, plan.info['server']!);
    expect(l.run!.step).toBe('success');
    // Sprint 11 (S-11-1): a button from a card names it: "Bank Job: take credits".
    expect(l.run!.buttons.map((b) => [b.label, b.lit])).toEqual([
      ['Bank Job: take credits', true],
      ['Access cards', true],
    ]);
    expect(runButtonOf(l, 'Bank Job: take credits').source).toBe('r10');
    for (const b of l.run!.buttons) expectGoodButton(l, b.box, b.label);
    await shot(page, '18-s07-4-bank-job-choice');
    const credits = (await getView(page)).players.runner.credits;
    await tap(page, runButtonOf(l, 'Bank Job: take credits').box);
    await page.waitForFunction(() => window.__overclock!.layout().run?.amount != null);
    const opened = await getView(page);
    expect(opened.players.runner.credits, 'opening the amount control takes nothing yet').toBe(credits);
    expect(opened.run?.step).toBe('success');
    expect(opened.rig.find((c) => c.uid === bj)?.hostedCredits).toBe(8);
    l = await layout(page);
    expect(l.run!.amount!.amount).toBe(8);
    const take8 = runButtonOf(l, 'Take 8');
    expect(take8.lit).toBe(true);
    for (const b of l.run!.buttons) expectGoodButton(l, b.box, b.label);
    const m = await measureTap(page, take8.box);
    expect(m.events.some((e) => e.type === 'card_accessed')).toBe(false);
    expect(m.view.players.runner.credits).toBe(credits + 8);
    l = await waitIdle(page);
    expect(l.rig.some((c) => c.uid === bj)).toBe(false);
    expect((await getView(page)).players.runner.discard.at(-1)).toBe('r10');
    await page.waitForFunction(() => window.__overclock!.anims().some((a) => a.kind === 'notice' && a.text === 'Bank Job: +8 credits, nothing accessed'));
    await shot(page, '19-s07-4-bank-job-taken');
  });
});

// ---- S-07-5 ----------------------------------------------------------------------------------------

test.describe('QA S-07-5 Ice Wall', () => {
  test('Advance · 1 credit twice; the Runner sees 2 counters on the face-down card; rezzed it is strength 3; Corroder pumps once and breaks', async ({ page }) => {
    test.setTimeout(60_000);
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'corp_ice_wall');
    const uid = plan.info['uid']!;
    const breaker = plan.info['breakerUid']!;
    let l = await tapInstalled(page, uid);
    const adv = targetOf(l, 'advance');
    expect(adv).toMatchObject({ label: 'Advance · 1 credit', lit: true });
    expectGoodButton(l, adv.box, 'Advance');
    await shot(page, '20-s07-5-ice-wall-advance-button');
    const v0 = await getView(page);
    await tap(page, adv.box);
    l = await waitIdle(page);
    await tap(page, targetOf(l, 'advance').box);
    l = await waitIdle(page);
    const v1 = await getView(page);
    expect(v1.players.corp.clicks).toBe(v0.players.corp.clicks - 2);
    expect(v1.players.corp.credits).toBe(v0.players.corp.credits - 2);
    expect(installedIn(l, uid).counter).toBe('2');
    await shot(page, '21-s07-5-ice-wall-2-counters-corp');
    await passTurn(page);
    l = await waitIdle(page);
    expect(l.viewer).toBe('runner');
    expect(installedIn(l, uid)).toMatchObject({ cardId: null, faceUp: false, counter: '2' });
    await shot(page, '22-s07-5-ice-wall-2-counters-runner-face-down');
    l = await startRun(page, plan.info['server']!);
    await tap(page, runButtonOf(l, /^Rez Ice Wall/).box);
    l = await waitIdle(page);
    expect(l.run!.lines).toContain('Strength 3');
    // Sprint 11 (S-11-1): "Corroder: break barrier sub · 1 credit" / "Corroder: +1 str · 1 credit".
    const brk = runButtonOf(l, 'Corroder: break barrier sub · 1 credit');
    expect(brk).toMatchObject({ lit: false, reject: 'too_weak' });
    await shot(page, '23-s07-5-ice-wall-strength-3');
    const pump = l.run!.buttons.find((b) => b.label === 'Corroder: +1 str · 1 credit' && b.action.type === 'use_ability' && b.action.uid === breaker)!;
    expect(pump, 'Corroder: +1 str · 1 credit').toBeDefined();
    await tap(page, pump.box);
    l = await waitIdle(page);
    await tap(page, runButtonOf(l, 'Corroder: break barrier sub · 1 credit').box);
    l = await waitIdle(page);
    expect(l.run!.subroutines.every((s) => s.broken)).toBe(true);
  });
});

// ---- S-07-6 ----------------------------------------------------------------------------------------

test.describe('QA S-07-6 hand view and drag', () => {
  test('open (readable, < 0.1 s), lift (places lit), hover, drop plays it; let go away: view back; tap outside closes', async ({ page }) => {
    await openBoard(page, 1);
    const v = await getView(page);
    const i = v.handOptions.findIndex((os) => os.some((o) => o.reject === null && o.action.type === 'install' && o.action.server === 'new'));
    expect(i).toBeGreaterThanOrEqual(0);
    // Tap the hand: the view opens on the next frame.
    let l = await layout(page);
    await page.evaluate(() => {
      const w = window as unknown as { __hv?: number };
      w.__hv = undefined;
      const loop = () => {
        if (window.__overclock!.layout().handView) w.__hv = performance.now();
        else requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await tap(page, l.hand[i]!.box);
    await page.waitForFunction(() => (window as unknown as { __hv?: number }).__hv !== undefined);
    const t = await page.evaluate(() => ({ seen: (window as unknown as { __hv: number }).__hv, input: window.__overclock!.lastInput() }));
    expect(t.seen - t.input!.handledAt).toBeLessThan(100);
    await page.waitForTimeout(250);
    l = await layout(page);
    expect(l.handView).toMatchObject({ index: i, lifted: false });
    expect(l.zoom!.textOverflow).toBe(false);
    expect(l.zoom!.box.height).toBeGreaterThan(l.viewport.height * 0.6);
    await shot(page, '24-s07-6-hand-view');
    // Lift; every option's place lights.
    const { hold, lifted } = await liftHand(page, i);
    expect(lifted.targets.length).toBe(v.handOptions[i]!.length);
    await page.waitForTimeout(150);
    await shot(page, '25-s07-6-lifted-places-lit');
    const target = lifted.targets.find((x) => x.kind === 'new_server' && x.lit)!;
    const from = center(lifted.handView!.centre);
    const to = center(target.box);
    for (let k = 1; k <= 8; k++) await hold.move(from.x + ((to.x - from.x) * k) / 8, from.y + ((to.y - from.y) * k) / 8);
    await page.waitForFunction(() => window.__overclock!.layout().drag?.hover?.kind === 'new_server');
    await page.waitForTimeout(50);
    await shot(page, '26-s07-6-dragging-over-new-server');
    await hold.release();
    l = await waitIdle(page);
    const after = await getView(page);
    expect(after.players.corp.handCount).toBe(v.players.corp.handCount - 1);
    expect(after.corpServers.length).toBe(v.corpServers.length + 1);
    expect(l.handView).toBeNull();
    await shot(page, '27-s07-6-dropped-played');
    // Let go away from every place: nothing played, the hand view is back on that card.
    const j = after.handOptions.findIndex((os) => os.some((o) => o.reject === null));
    expect(j).toBeGreaterThanOrEqual(0);
    const second = await liftHand(page, j);
    const away = center(emptySpot(second.lifted));
    for (let k = 1; k <= 6; k++) await second.hold.move(from.x + ((away.x - from.x) * k) / 6, from.y + ((away.y - from.y) * k) / 6);
    await page.waitForFunction(() => window.__overclock!.layout().drag?.hover === null);
    await second.hold.release();
    await page.waitForFunction(() => window.__overclock!.layout().drag === null);
    await page.waitForTimeout(250);
    l = await layout(page);
    expect(l.handView).toMatchObject({ index: j, lifted: false });
    expect(await getView(page)).toEqual(after);
    await shot(page, '28-s07-6-let-go-away-view-back');
    // Tap outside the cards on something a tap would normally use (credits / R&D / End turn): closes only.
    const cards = [l.zoom!.box, ...l.zoom!.carousel.map((c) => c.box)];
    const spot = [l.corp.credits, l.corp.deck, l.corp.clicks, l.runner.credits, l.runner.deck, ...(l.endTurn ? [l.endTurn.box] : [])].find((b) => !cards.some((c) => overlaps(b, c))) ?? outsideHandView(l);
    await tap(page, spot);
    await page.waitForFunction(() => window.__overclock!.layout().handView === null);
    await page.waitForTimeout(200);
    expect(await getView(page)).toEqual(after);
  });

  test('drag latency (QA measure): a fast continuous drag, each move drawn under the finger in < 100 ms', async ({ page }) => {
    test.setTimeout(90_000);
    await openBoard(page, 1);
    const v = await getView(page);
    const i = v.handOptions.findIndex((os) => os.some((o) => o.reject === null && o.action.type === 'install'));
    const { hold, lifted } = await liftHand(page, i);
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      type M = { at: number; x: number; drawn: number | null; hover?: string };
      const w = window as unknown as { __q: M[] };
      w.__q = [];
      window.addEventListener('pointermove', (e) => w.__q.push({ at: e.timeStamp, x: e.clientX, drawn: null }));
      const loop = () => {
        const q = w.__q;
        if (q.some((m) => m.drawn === null)) {
          const d = window.__overclock!.layout().drag;
          if (d) {
            const cx = d.box.x + d.box.width / 2;
            const now = performance.now();
            for (let k = q.length - 1; k >= 0; k--) {
              const ex = Math.max(d.box.width / 2, Math.min(innerWidth - d.box.width / 2, q[k]!.x));
              if (Math.abs(ex - cx) < 1.5) {
                for (let j = 0; j <= k; j++)
                  if (q[j]!.drawn === null) {
                    q[j]!.drawn = now;
                    q[j]!.hover = d.hover ? `${d.hover.kind}:${d.hover.lit}` : '-';
                  }
                break;
              }
            }
          }
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    const from = center(lifted.handView!.centre);
    const W = lifted.viewport.width;
    const H = lifted.viewport.height;
    const N = 40;
    for (let k = 1; k <= N; k++) {
      await hold.move(from.x + Math.sin(k / 4) * W * 0.32, from.y - Math.abs(Math.sin(k / 6)) * H * 0.35);
      await page.waitForTimeout(16);
    }
    await page.waitForFunction(() => (window as unknown as { __q: { drawn: number | null }[] }).__q.every((m) => m.drawn !== null), undefined, { timeout: 5000 });
    const q = await page.evaluate(() => (window as unknown as { __q: { at: number; drawn: number; hover: string }[] }).__q);
    expect(q.length).toBeGreaterThanOrEqual(N);
    const gaps = q.map((m) => m.drawn - m.at);
    const max = Math.max(...gaps);
    test.info().annotations.push({ type: 'qa-drag-ms', description: `n=${gaps.length} max=${max.toFixed(1)} median=${[...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!.toFixed(1)} all=${q.map((m) => `${(m.drawn - m.at).toFixed(0)}${m.hover === '-' ? '' : `[${m.hover}]`}`).join(',')}` });
    for (const g of gaps) expect(g).toBeLessThan(100);
    await hold.release();
  });
});

// ---- "device" wording ------------------------------------------------------------------------------

test.describe('QA owner request: pass-and-play says "device", never "phone"', () => {
  test('start screen pages and the pass cover', async ({ page }) => {
    await page.goto('./?seed=3&decks=starter');
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
    const start = page.locator('#start');
    await expect(start).toContainText('Play on this device');
    await expect(start).toContainText('Take turns on one screen');
    await expect(start).toContainText('Each player on their own device');
    expect(await start.innerText()).not.toMatch(/phone/i);
    await shot(page, '29-start-screen-device');
    await tapButton(page, /Play online/);
    expect(await start.innerText()).not.toMatch(/phone/i);
    await page.evaluate(() => window.__overclockStart!.back());
    await tapButton(page, /Play on this device/);
    // Sprint 13: the deck picker (standard decks picked) -> Start.
    await tapButton(page, /^Start$/);
    await page.waitForFunction(() => !!window.__overclock);
    await waitIdle(page);
    // End the Corp's turn: the cover says "Pass to the Runner — tap when ready" (one line).
    await page.evaluate(() => {
      const hook = window.__overclock!;
      hook.dispatch({ type: 'end_turn', player: 'corp' });
      const w = hook.getView();
      if (w.pendingDiscard > 0) hook.dispatch({ type: 'discard', player: 'corp', handIndices: Array.from({ length: w.pendingDiscard }, (_, i) => i) });
    });
    await page.waitForFunction(() => window.__overclock!.layout().cover !== null);
    const cover = (await layout(page)).cover!;
    expect(`${cover.title} ${cover.line}`).not.toMatch(/phone/i);
    expect(cover.title).toMatch(/^Pass to the Runner/);
    expect(cover.title).toMatch(/tap when ready/);
    await page.waitForTimeout(300);
    await shot(page, '30-cover-device-wording');
    // The rotate prompt (upright phones only) still says phone: allowed.
  });
});

// ---- online -----------------------------------------------------------------------------------------

/** The Runner's frames never name a face-down Corp card, nor carry seed/rng/deck. */
function expectNoLeaks(runner: Phone): number {
  let n = 0;
  for (const f of frames(runner.received)) {
    if (!f.view) continue;
    n++;
    for (const sv of f.view.corpServers) for (const c of [...sv.ice, ...sv.content]) if (!c.faceUp) expect(c.cardId, `face-down ${c.uid} named in a Runner frame`).toBeNull();
    expect(f.view.players.corp.hand ?? null).toBeNull();
    for (const k of Object.keys(f.view.installedOptions)) expect(f.view.rig.some((c) => c.uid === k), `Runner option on Corp card ${k}`).toBe(true);
    for (const e of f.events ?? []) {
      if (e.type === 'card_installed' && e.player === 'corp') expect((e as { cardId?: string }).cardId ?? null).toBeNull();
    }
  }
  for (const raw of runner.received) for (const k of ['"seed"', '"rng"', '"deck"']) expect(raw.includes(k), `Runner frame has ${k}`).toBe(false);
  return n;
}

async function twoPhones(browser: Browser, setup: { seed: number; actions: Action[] }, hostSide: Side) {
  const host = await openPhone(browser);
  const guest = await openPhone(browser);
  const code = await startTestGame(host, hostSide, setup);
  await joinGame(guest, code);
  await Promise.all([waitPlaying(host), waitPlaying(guest)]);
  const corp = hostSide === 'corp' ? host : guest;
  const runner = hostSide === 'corp' ? guest : host;
  return { corp, runner, close: async () => Promise.all([host.context.close(), guest.context.close()]) };
}

function localViews(seed: number, actions: readonly Action[]): Record<Side, PlayerView> {
  const m = new LocalMatch(seed, ONLINE);
  for (const a of actions) m.submit(a.player, a);
  return { corp: m.view('corp'), runner: m.view('runner') };
}

async function expectSame(phones: Record<Side, Phone>, expected: Record<Side, PlayerView>): Promise<void> {
  for (const side of ['corp', 'runner'] as const) {
    const v = await waitView(phones[side], (x) => JSON.stringify(x.corpServers) === JSON.stringify(expected[side].corpServers) && JSON.stringify(x.rig) === JSON.stringify(expected[side].rig) && JSON.stringify(x.players) === JSON.stringify(expected[side].players));
    expect(v.run).toEqual(expected[side].run);
    expect(v.activePlayer).toBe(expected[side].activePlayer);
  }
}

async function tapInstalledOn(p: Phone, uid: string): Promise<LayoutSnapshot> {
  await tap(p.page, installedIn(await layoutOf(p), uid).box);
  await p.page.waitForFunction((u) => window.__overclock!.layout().selectedInstalled === u, uid);
  return layoutOf(p);
}

/** Ends `side`'s turn from its phone (discarding the first cards if asked); returns the actions sent. */
async function endTurnOn(p: Phone, side: Side): Promise<Action[]> {
  const sent: Action[] = [{ type: 'end_turn', player: side }];
  await act(p, sent[0]!);
  const v = await view(p);
  if (v.pendingDiscard > 0) {
    const d: Action = { type: 'discard', player: side, handIndices: Array.from({ length: v.pendingDiscard }, (_, i) => i) };
    await act(p, d);
    sent.push(d);
  }
  return sent;
}

test.describe('QA S-07 online parity (two contexts, local service)', () => {
  test('PAD Campaign rezzed by tap, the turn moves on: both phones show it face up and the Corp +1 credit, same as pass-and-play', async ({ browser }) => {
    const plan = planToStep(1, 'corp_rez_asset', undefined, ONLINE);
    const uid = plan.info['uid']!;
    const { corp, runner, close } = await twoPhones(browser, { seed: 1, actions: plan.actions }, 'corp');
    const l = await tapInstalledOn(corp, uid);
    await tap(corp.page, targetOf(l, 'rez').box);
    const log: Action[] = [...plan.actions, { type: 'rez', player: 'corp', uid }];
    await expectSame({ corp, runner }, localViews(1, log));
    await runner.page.waitForFunction((u) => window.__overclock!.layout().servers.some((s) => s.content.some((c) => c.uid === u && c.faceUp && c.cardId === 'c03')), uid);
    await shot(runner.page, '31-online-runner-sees-pad-face-up');
    log.push(...(await endTurnOn(corp, 'corp')));
    await waitView(runner, (v) => v.activePlayer === 'runner');
    const credits = (await view(corp)).players.corp.credits;
    log.push(...(await endTurnOn(runner, 'runner')));
    await expectSame({ corp, runner }, localViews(1, log));
    expect((await view(corp)).players.corp.credits).toBe(credits + 1);
    expect((await view(runner)).players.corp.credits).toBe(credits + 1);
    await corp.page.waitForFunction(() => window.__overclock!.anims().some((a) => a.kind === 'notice' && a.text === 'PAD Campaign: +1 credit'));
    await shot(corp.page, '32-online-corp-pad-plus-1');
    expect(expectNoLeaks(runner)).toBeGreaterThan(3);
    await close();
  });

  test('Akitaro rezzed online: at Wall of Static the Corp phone offers Rez · 1 credit while the Runner phone waits; same result as pass-and-play', async ({ browser }) => {
    const plan = planToStep(1, 'runner_approach_akitaro', undefined, ONLINE);
    const akitaro = plan.info['akitaroUid']!;
    const k = plan.actions.findIndex((a) => a.type === 'rez' && a.uid === akitaro);
    const { corp, runner, close } = await twoPhones(browser, { seed: 1, actions: plan.actions.slice(0, k) }, 'corp');
    // Before the rez, the Runner phone sees a card back where Akitaro is.
    const rl = await layoutOf(runner);
    expect(installedIn(rl, akitaro)).toMatchObject({ cardId: null, faceUp: false });
    const l = await tapInstalledOn(corp, akitaro);
    expect(targetOf(l, 'rez')).toMatchObject({ label: 'Rez · 1 credit', lit: true });
    await tap(corp.page, targetOf(l, 'rez').box);
    await waitView(runner, (v) => v.corpServers.some((s) => s.content.some((c) => c.uid === akitaro && c.faceUp)));
    for (const a of plan.actions.slice(k + 1)) await act(a.player === 'corp' ? corp : runner, a);
    await expectSame({ corp, runner }, localViews(1, plan.actions));
    await corp.page.waitForFunction(() => window.__overclock!.layout().run?.step === 'approach');
    const cl = await layoutOf(corp);
    expect(runButtonOf(cl, /^Rez /)).toMatchObject({ label: 'Rez Wall of Static · 1 credit', lit: true });
    await shot(corp.page, '33-online-corp-akitaro-discount');
    const rl2 = await layoutOf(runner);
    expect(rl2.run?.buttons.filter((b) => b.lit) ?? []).toEqual([]);
    await shot(runner.page, '34-online-runner-corp-deciding');
    await tap(corp.page, runButtonOf(cl, /^Rez /).box);
    await expectSame({ corp, runner }, localViews(1, [...plan.actions, { type: 'rez', player: 'corp', uid: plan.info['iceUid']! }]));
    expect(expectNoLeaks(runner)).toBeGreaterThan(3);
    await close();
  });

  test('Ice Wall advanced online: the Runner phone shows the counter on a card back; a server emptied by a steal goes from both phones', async ({ browser }) => {
    const plan = planToStep(1, 'corp_ice_wall', undefined, ONLINE);
    const uid = plan.info['uid']!;
    const { corp, runner, close } = await twoPhones(browser, { seed: 1, actions: plan.actions }, 'corp');
    const l = await tapInstalledOn(corp, uid);
    await tap(corp.page, targetOf(l, 'advance').box);
    await expectSame({ corp, runner }, localViews(1, [...plan.actions, { type: 'advance', player: 'corp', uid }]));
    await runner.page.waitForFunction((u) => window.__overclock!.layout().servers.some((s) => s.ice.some((c) => c.uid === u && c.counter === '1' && c.cardId === null)), uid);
    expect(expectNoLeaks(runner)).toBeGreaterThan(1);
    await close();

    const p2 = planToStep(3, 'remote_last_card', undefined, ONLINE);
    const server = p2.info['server']!;
    const two = await twoPhones(browser, { seed: 3, actions: p2.actions }, 'runner');
    await startRun(two.runner.page, server);
    await two.runner.page.waitForFunction(() => window.__overclock!.layout().run?.buttons.some((b) => b.label === 'Steal'));
    await tap(two.runner.page, runButtonOf(await layoutOf(two.runner), 'Steal').box);
    for (const p of [two.corp, two.runner]) {
      await waitView(p, (v) => !v.corpServers.some((s) => s.id === server) && v.run === null);
      await p.page.waitForFunction((s) => !window.__overclock!.layout().servers.some((x) => x.id === s), server);
    }
    await shot(two.corp.page, '35-online-corp-server-gone');
    expect(expectNoLeaks(two.runner)).toBeGreaterThan(1);
    await two.close();
  });

  test('the Runner drags a card to play online: same as pass-and-play, the Corp phone sees it arrive', async ({ browser, page }) => {
    // Seed 1: Corp ends its first turn; the Runner's turn.
    const lm = new LocalMatch(1, ONLINE);
    const prelude: Action[] = [{ type: 'end_turn', player: 'corp' }];
    lm.submit('corp', prelude[0]!);
    const pending = lm.view('corp').pendingDiscard;
    if (pending > 0) {
      const d: Action = { type: 'discard', player: 'corp', handIndices: Array.from({ length: pending }, (_, i) => i) };
      prelude.push(d);
      lm.submit('corp', d);
    }
    const { corp, runner, close } = await twoPhones(browser, { seed: 1, actions: prelude }, 'runner');
    const v0 = await view(runner);
    const i = v0.handOptions.findIndex((os) => os.some((o) => o.reject === null && o.action.type === 'install'));
    expect(i).toBeGreaterThanOrEqual(0);
    const open = await openHand(runner.page, i);
    const hold = await holdAt(runner.page, open.handView!.centre);
    await runner.page.waitForFunction(() => window.__overclock!.layout().drag !== null);
    const lifted = await layoutOf(runner);
    const t = lifted.targets.find((x) => x.lit)!;
    const from = center(open.handView!.centre);
    const to = center(t.box);
    for (let k = 1; k <= 6; k++) await hold.move(from.x + ((to.x - from.x) * k) / 6, from.y + ((to.y - from.y) * k) / 6);
    await runner.page.waitForFunction(() => window.__overclock!.layout().drag?.hover?.lit === true);
    await hold.release();
    const opt = v0.handOptions[i]!.find((o) => o.reject === null && o.action.type === 'install')!;
    await expectSame({ corp, runner }, localViews(1, [...prelude, opt.action]));
    await shot(corp.page, '36-online-corp-sees-runner-drag-install');
    // Pass-and-play, same card dragged: same game.
    await openBoard(page, 1);
    await passTurn(page);
    const pv = await getView(page);
    expect(pv.players.runner.hand).toEqual(v0.players.runner.hand);
    const o2 = await openHand(page, i);
    const h2 = await holdAt(page, o2.handView!.centre);
    await page.waitForFunction(() => window.__overclock!.layout().drag !== null);
    const l2 = await layout(page);
    const t2 = l2.targets.find((x) => x.lit)!;
    const to2 = center(t2.box);
    const f2 = center(o2.handView!.centre);
    for (let k = 1; k <= 6; k++) await h2.move(f2.x + ((to2.x - f2.x) * k) / 6, f2.y + ((to2.y - f2.y) * k) / 6);
    await page.waitForFunction(() => window.__overclock!.layout().drag?.hover?.lit === true);
    await h2.release();
    await waitIdle(page);
    const here = await getView(page);
    const there = await view(runner);
    expect(there.rig).toEqual(here.rig);
    expect(there.players.runner).toEqual(here.players.runner);
    await close();
  });
});
