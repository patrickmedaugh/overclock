// QA Sprint 9 (written by QA, not the developers). Screenshots go to
// docs/sprints/sprint-09-qa/<project>-NN-<what>.png (all three sizes).
//
// Real play on the core decks (SPRINT9_GOALS from the planner, plus one board found by QA's own
// random play), real taps (touch on phones), every new tap timed (< 100 ms to the game state):
// - S-09-1: Hunter with the pass-the-phone covers both ways; Max and − on the bid control; the
//   Runner one credit short gets tagged; bid control size / readability at every size.
// - S-09-1 AC6 (Runner side): a Runner with 0 credits is never asked to bid — SEA Source resolves
//   on the Corp's screen with no hand-off.
// - S-09-2: Remove 1 tag dimmed "Not enough credits" (1 credit left after the trace) and then
//   "No clicks left"; the Corp tapping an untagged Runner's resource gets no Trash button.
// - S-09-3: Private Security Force three times, a Runner turn, then the empty Grip: flatline, Corp
//   wins; and dimmed "Runner isn't tagged" after the Runner removed his tag.
// - Online: a hopeless Runner is never asked; both phones show the same result; no hidden card in
//   any frame the Runner's phone received.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCard } from '@overclock/cards';
import type { Action } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';
import { planToStep } from '@overclock/match/testing';
import { type Page, expect, test } from '@playwright/test';
import { type LayoutSnapshot, type TapMeasure, getView, layout, measureTap, passTurn, pickHand, tap, targetOf, toStep, waitIdle } from './helpers';
import { frames, joinGame, layoutOf, openPhone, startTestGame, waitPlaying, waitView } from './online';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-09-qa');

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${test.info().project.name}-${name}.png`) });
}

/** QA's snappiness check: the game changed within 100 ms of handling the tap; every blocking animation it started is <= 600 ms. */
function snappy(m: TapMeasure): void {
  test.info().annotations.push({ type: 'timing', description: JSON.stringify({ stateMs: +(m.stateAt - m.handledAt).toFixed(1), queueMs: +(m.handledAt - m.tapAt).toFixed(1) }) });
  expect(Number.isFinite(m.handledAt), 'the tap reached a game target').toBe(true);
  expect(m.stateAt - m.handledAt, 'state within 100 ms').toBeLessThan(100);
  for (const a of m.anims) if (!['hint', 'notice', 'ice_report'].includes(a.kind)) expect(a.scheduledMs, `${a.kind} <= 600 ms`).toBeLessThanOrEqual(600);
}

async function core(page: Page, seed: number, cover: boolean): Promise<void> {
  await page.goto(`./?seed=${seed}&play=here${cover ? '' : '&cover=off'}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
}

async function lift(page: Page): Promise<LayoutSnapshot> {
  const l = await layout(page);
  if (l.cover) {
    await tap(page, { x: l.viewport.width / 2 - 5, y: l.viewport.height - 40, width: 10, height: 10 });
    await page.waitForFunction(() => window.__overclock!.layout().cover === null);
  }
  return waitIdle(page);
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

async function notices(page: Page): Promise<string[]> {
  return (await page.evaluate(() => window.__overclock!.anims())).filter((a) => (a.kind === 'notice' || a.kind === 'hint') && a.text).map((a) => a.text!);
}

/** The bid control: every button >= 44 px, inside the screen, not on top of each other or the number; text readable. */
function expectBidControl(l: LayoutSnapshot): void {
  const c = l.trace!.control!;
  const bs = Object.entries(c.buttons);
  for (const [name, b] of bs) {
    expect(Math.min(b.box.width, b.box.height), `${name} >= 44 px`).toBeGreaterThanOrEqual(44);
    expect(b.box.x).toBeGreaterThanOrEqual(0);
    expect(b.box.y).toBeGreaterThanOrEqual(0);
    expect(b.box.x + b.box.width, `${name} inside the screen`).toBeLessThanOrEqual(l.viewport.width + 0.5);
    expect(b.box.y + b.box.height, `${name} inside the screen`).toBeLessThanOrEqual(l.viewport.height + 0.5);
    expect(b.fontPx, `${name} label >= 10 px`).toBeGreaterThanOrEqual(10);
    const t = c.tile;
    expect(b.box.x + b.box.width <= t.x || t.x + t.width <= b.box.x || b.box.y + b.box.height <= t.y || t.y + t.height <= b.box.y, `${name} off the number`).toBe(true);
  }
  for (let i = 0; i < bs.length; i++)
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i]![1].box;
      const b = bs[j]![1].box;
      expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, `${bs[i]![0]} / ${bs[j]![0]} apart`).toBe(true);
    }
  expect(c.numberPx).toBeGreaterThanOrEqual(20);
  expect(c.captionPx).toBeGreaterThanOrEqual(10);
}

/** Taps a bid control button, timed; returns the layout after. */
async function bidTap(page: Page, which: 'minus' | 'plus' | 'max' | 'bid'): Promise<LayoutSnapshot> {
  const m = await measureTap(page, (await layout(page)).trace!.control!.buttons[which].box);
  snappy(m);
  return layout(page);
}

/** Finishes the current run with no more choices that matter (Corp: no rez; Runner: jack out / go on / no trash), computed on a LocalMatch copy. */
function finishRunActions(seed: number, actions: readonly Action[]): Action[] {
  const m = new LocalMatch(seed, { deckSet: 'core' });
  for (const a of actions) m.submit(a.player, a);
  const out: Action[] = [];
  for (let k = 0; k < 30 && m.view('runner').run; k++) {
    const v = m.view('runner');
    const who = v.choice?.waitingOn ?? v.run!.waitingOn;
    const mine = m.view(who);
    const opts = (mine.choice?.options ?? mine.run!.options).filter((o) => o.reject === null).map((o) => o.action);
    const a = opts.find((x) => x.type === 'jack_out') ?? opts.find((x) => x.type === 'pass') ?? opts.find((x) => x.type === 'choose') ?? opts[0]!;
    m.submit(a.player, a);
    out.push(a);
  }
  return out;
}

test.describe('QA S-09-1 Hunter through the covers, and S-09-2 Remove 1 tag dimmed', () => {
  test('seed 3: Corp bids (Max, then −) so the Runner can just stop it; he bids 1 short: tagged; then Remove 1 tag says "Not enough credits", later "No clicks left"', async ({ page }) => {
    test.setTimeout(60_000);
    const SEED = 3;
    await core(page, SEED, true);
    const plan = await toStep(page, SEED, 'hunter_encounter');
    let l = await lift(page);
    const before = await getView(page);
    const runnerCredits = before.players.runner.credits;
    const corpCredits = before.players.corp.credits;
    const corpBid = Math.min(corpCredits, runnerCredits - 2); // needed = 3 + bid − 1 = Runner's credits
    expect(corpBid).toBeGreaterThan(0);
    const fire = l.run!.buttons.find((b) => /^Let it fire/.test(b.label))!;
    expect(fire.label).toContain('trace 3');
    snappy(await measureTap(page, fire.box));
    l = await layout(page);
    expect(l.cover).toMatchObject({ to: 'corp' });
    expect(l.hand).toEqual([]);
    await shot(page, '01-hunter-cover-to-corp');
    l = await lift(page);
    // Pass-the-phone: the Runner's turn stays on the table; the Corp's bid panel is up and no hand shows.
    expect(l.trace?.deciding).toBe('corp');
    expect(l.hand, 'no hand while the Corp bids').toEqual([]);
    expect(l.trace).toMatchObject({ kind: 'trace_corp', mine: true, stepLabel: 'Trace 3: add credits?' });
    expect(l.trace!.control).toMatchObject({ bid: 0, low: 0, high: corpCredits, caption: 'strength 3' });
    expectBidControl(l);
    // − at 0 does nothing; Max jumps to all credits; − steps down one at a time.
    l = await bidTap(page, 'minus');
    expect(l.trace!.control!.bid).toBe(0);
    l = await bidTap(page, 'max');
    expect(l.trace!.control).toMatchObject({ bid: corpCredits, caption: `strength ${3 + corpCredits}` });
    while (l.trace!.control!.bid > corpBid) l = await bidTap(page, 'minus');
    expect(l.trace!.control).toMatchObject({ bid: corpBid, caption: `strength ${3 + corpBid}` });
    expect(l.trace!.control!.buttons.bid.label).toBe(`Bid ${corpBid}`);
    await shot(page, '02-hunter-corp-bid');
    l = await bidTap(page, 'bid');
    l = await waitIdle(page);
    expect(l.cover).toMatchObject({ to: 'runner' });
    expect(l.hand).toEqual([]);
    await shot(page, '03-hunter-cover-back-to-runner');
    l = await lift(page);
    const needed = 3 + corpBid - 1;
    expect(needed).toBe(runnerCredits);
    expect(l.trace).toMatchObject({ kind: 'trace_runner', mine: true, stepLabel: `Trace strength ${3 + corpBid} · your link 1 · spend ${needed} to stop it` });
    expect(l.trace!.control).toMatchObject({ bid: 0, high: runnerCredits });
    expectBidControl(l);
    while (l.trace!.control!.bid < needed - 1) l = await bidTap(page, 'plus');
    expect(l.trace!.control!.caption).toBe(`link ${needed} · short`);
    l = await bidTap(page, 'plus');
    expect(l.trace!.control!.caption).toBe(`link ${needed + 1} · escape`);
    l = await bidTap(page, 'minus');
    await shot(page, '04-hunter-runner-one-short');
    await bidTap(page, 'bid');
    l = await waitIdle(page);
    expect(l.cover).toBeNull();
    expect(l.report?.text).toBe(`Hunter: trace ${3 + corpBid} vs link ${needed}: you got 1 tag.`);
    expect(l.runnerStatus.tagged?.text).toBe('Tagged 1');
    const after = await getView(page);
    expect(after.players.corp.credits).toBe(corpCredits - corpBid);
    expect(after.players.runner.credits).toBe(runnerCredits - (needed - 1));
    expect(after.players.runner.tags).toBe(1);
    await shot(page, '05-hunter-tagged-report');

    // Finish the run; back on the Runner's own turn with 1 credit.
    // sent() lists every action the page sent (the plan's dispatches and the taps), in order.
    const sent = await page.evaluate(() => window.__overclock!.sent());
    expect(sent.slice(0, plan.actions.length)).toEqual(plan.actions);
    await dispatchAll(page, finishRunActions(SEED, sent));
    l = await lift(page);
    let v = await getView(page);
    expect(v.run).toBeNull();
    expect(v.activePlayer).toBe('runner');
    expect(v.players.runner.credits).toBe(1);
    expect(v.players.runner.clicks).toBeGreaterThan(0);
    l = await waitIdle(page);
    expect(l.runnerStatus.tagged).not.toBeNull();
    // The marker is clear of the credits and inside the screen.
    const tg = l.runnerStatus.tagged!;
    expect(tg.hit.height).toBeGreaterThanOrEqual(44);
    snappy(await measureTap(page, tg.hit));
    l = await layout(page);
    let remove = targetOf(l, 'remove_tag');
    expect(remove).toMatchObject({ label: 'Remove 1 tag · 1 click + 2 credits', lit: false, reject: 'no_credits', note: 'Not enough credits' });
    await shot(page, '06-remove-tag-not-enough-credits');
    await tap(page, remove.box);
    await waitIdle(page);
    expect((await getView(page)).players.runner.tags).toBe(1);
    // Spend every click on credits: now the reason is the clicks.
    const clicks = (await getView(page)).players.runner.clicks;
    await dispatchAll(page, Array.from({ length: clicks }, () => ({ type: 'gain_credit', player: 'runner' }) as Action));
    v = await getView(page);
    expect(v.players.runner.credits).toBeGreaterThanOrEqual(2);
    expect(v.players.runner.clicks).toBe(0);
    l = await waitIdle(page);
    await tap(page, l.runnerStatus.tagged!.hit);
    l = await layout(page);
    remove = targetOf(l, 'remove_tag');
    expect(remove).toMatchObject({ lit: false, reject: 'no_clicks', note: 'No clicks left' });
    await shot(page, '07-remove-tag-no-clicks');
  });
});

// ---- The Runner at 0 credits: SEA Source (board from QA's own random play) ----

/** QA's random play (packages/match/test/qa-sprint09.test.ts checks this copy): SEA Source playable, Runner at 0 credits. */
const SEA_BROKE = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'qa-sprint09-sea-runner-broke.json'), 'utf8')) as { seed: number; actions: Action[] };

test.describe('QA S-09-1 AC6: a Runner with 0 credits is never asked to bid', () => {
  test('seed 25: SEA Source — the Corp bids on its screen; no cover, no Runner bid screen; "Runner bid 0" and the result show at once', async ({ page }) => {
    test.setTimeout(60_000);
    await core(page, SEA_BROKE.seed, true);
    await dispatchAll(page, SEA_BROKE.actions);
    let l = await lift(page);
    expect(l.viewer).toBe('corp');
    expect((await getView(page)).players.runner.credits).toBe(0);
    const i = (await getView(page)).players.corp.hand!.indexOf('c22');
    l = await pickHand(page, i);
    const play = targetOf(l, 'play');
    expect(play).toMatchObject({ label: 'Play · 2 credits', lit: true });
    snappy(await measureTap(page, play.box));
    l = await waitIdle(page);
    expect(l.trace).toMatchObject({ kind: 'trace_corp', title: 'Trace · SEA Source', mine: true });
    expectBidControl(l);
    l = await bidTap(page, 'plus');
    await shot(page, '08-sea-source-runner-broke-corp-bids');
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, l.trace!.control!.buttons.bid.box);
    l = await waitIdle(page);
    expect(l.cover, 'no hand-off to a Runner with nothing to bid').toBeNull();
    expect(l.trace).toBeNull();
    expect(l.viewer).toBe('corp');
    const n = await notices(page);
    // QA round 2 (QA-S9-1 fix): one sentence, the skipped bid in brackets, in a bubble wide enough to read.
    expect(n).toContain('SEA Source: trace 4 vs link 1: Runner tagged (Runner bid 0)');
    expect(n.some((t) => /^Runner bid 0$/m.test(t)), 'no separate "Runner bid 0" line').toBe(false);
    const toast = (await page.evaluate(() => window.__overclock!.anims())).find((a) => a.kind === 'notice' && a.text?.startsWith('SEA Source'))!;
    expect(toast.fontPx!, 'toast text >= 12 px').toBeGreaterThanOrEqual(12);
    expect(toast.box!.height, 'at most 2 lines').toBeLessThanOrEqual(toast.fontPx! * 2 * 1.3 + 20);
    expect(toast.box!.x).toBeGreaterThanOrEqual(0);
    expect(toast.box!.y).toBeGreaterThanOrEqual(0);
    expect(toast.box!.x + toast.box!.width).toBeLessThanOrEqual(l.viewport.width);
    expect(toast.box!.y + toast.box!.height).toBeLessThanOrEqual(l.viewport.height);
    expect(l.runnerStatus.tagged?.text).toMatch(/^Tagged 1( ·|$)/);
    const v = await getView(page);
    expect(v.activePlayer).toBe('corp');
    expect(v.phase).toBe('action');
    await shot(page, '09-sea-source-runner-broke-result');
  });
});

test.describe('QA S-09-3 Private Security Force and S-09-2 untagged', () => {
  test('seed 3: three meat damage (named, face up in the Heap), a Runner turn, then the empty Grip: flatline, Corp wins', async ({ page }) => {
    test.setTimeout(60_000);
    await core(page, 3, false);
    const plan = await toStep(page, 3, 'psf_scored_tagged');
    let l = await waitIdle(page);
    await tap(page, l.score.corp.box);
    l = await layout(page);
    expect(l.selectedInstalled).toBe(plan.info['uid']);
    expect(targetOf(l, 'activate')).toMatchObject({ label: 'Do 1 meat damage · 1 click', lit: true });
    await shot(page, '10-psf-button');
    for (let k = 1; k <= 3; k++) {
      const before = await getView(page);
      l = await layout(page);
      if (!l.targets.some((t) => t.kind === 'activate')) {
        await tap(page, l.score.corp.box);
        l = await layout(page);
      }
      const m = await measureTap(page, targetOf(l, 'activate').box);
      snappy(m);
      const md = m.events.find((e) => e.type === 'meat_damage');
      expect(md).toMatchObject({ amount: 1 });
      const lost = (md as { cardIds: readonly string[] }).cardIds[0]!;
      await waitIdle(page);
      const v = await getView(page);
      expect(v.players.runner.handCount).toBe(before.players.runner.handCount - 1);
      expect(v.players.runner.discard.at(-1)).toBe(lost);
      expect(m.anims.some((a) => a.text === `1 meat damage: ${getCard(lost)!.name} to the Heap`)).toBe(true);
    }
    await shot(page, '11-psf-three-used');
    l = await layout(page);
    if (!l.targets.some((t) => t.kind === 'activate')) {
      await tap(page, l.score.corp.box);
      l = await layout(page);
    }
    expect(targetOf(l, 'activate')).toMatchObject({ lit: false, note: 'No clicks left' });
    await passTurn(page); // Corp
    expect((await getView(page)).activePlayer).toBe('runner');
    await passTurn(page); // Runner keeps his 2 cards and his tag
    const v = await getView(page);
    expect(v.activePlayer).toBe('corp');
    expect(v.players.runner.handCount).toBe(2);
    expect(v.players.runner.tags).toBe(1);
    for (let k = 0; k < 3; k++) {
      l = await waitIdle(page);
      // The PSF stays picked after a use (its button stays up); pick it only when it is not.
      if (!l.targets.some((t) => t.kind === 'activate')) {
        await tap(page, l.score.corp.box);
        l = await layout(page);
      }
      if (k === 2) await page.evaluate(() => window.__overclock!.clearAnims());
      await tap(page, targetOf(l, 'activate').box);
    }
    await page.waitForFunction(() => window.__overclock!.layout().gameOver !== null);
    l = await waitIdle(page);
    // QA round 2 (QA-S9-2 fix): nothing left over the game-over box: no button, no picked card, no toast.
    expect(l.targets).toEqual([]);
    expect(l.selectedInstalled).toBeNull();
    expect((await page.evaluate(() => window.__overclock!.anims())).filter((a) => a.kind === 'notice'), 'no toast from the flatlining tap').toEqual([]);
    // An earlier toast may still be fading out, but never over the game-over box.
    if (l.hint) {
      const a = l.hint.box;
      const b = l.gameOver!.box;
      expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'toast off the game-over box').toBe(true);
    }
    expect(l.gameOver).toMatchObject({ title: 'Corp wins', reason: 'Runner flatlined' });
    expect((await getView(page)).result).toEqual({ winner: 'corp', reason: 'flatline' });
    expect(l.gameOver!.text + ' ' + l.gameOver!.title + ' ' + l.gameOver!.reason).toMatch(/Corp/);
    await shot(page, '12-psf-empty-grip-flatline');
  });

  test('seed 7: the Runner removes his tag (real taps); on the next Corp turn PSF is dimmed "Runner isn\'t tagged" and a tap changes nothing', async ({ page }) => {
    test.setTimeout(60_000);
    await core(page, 7, false);
    const plan = await toStep(page, 7, 'psf_scored_tagged');
    await passTurn(page); // Corp
    let v = await getView(page);
    expect(v.activePlayer).toBe('runner');
    while (v.players.runner.tags > 0) {
      if (v.players.runner.credits < 2) await dispatchAll(page, [{ type: 'gain_credit', player: 'runner' }]);
      let l = await waitIdle(page);
      await tap(page, l.runnerStatus.tagged!.hit);
      l = await layout(page);
      const r = targetOf(l, 'remove_tag');
      expect(r.lit).toBe(true);
      snappy(await measureTap(page, r.box));
      await waitIdle(page);
      v = await getView(page);
    }
    expect((await layout(page)).runnerStatus.tagged).toBeNull();
    await passTurn(page); // Runner
    let l = await waitIdle(page);
    expect(l.viewer).toBe('corp');
    expect(l.runnerStatus.tagged).toBeNull();
    await tap(page, l.score.corp.box);
    l = await layout(page);
    expect(l.selectedInstalled).toBe(plan.info['uid']);
    const use = targetOf(l, 'activate');
    expect(use).toMatchObject({ label: 'Do 1 meat damage · 1 click', lit: false, reject: 'condition_not_met', note: "Runner isn't tagged" });
    await shot(page, '13-psf-dimmed-untagged');
    const before = await getView(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, use.box);
    await waitIdle(page);
    const after = await getView(page);
    expect(after.players.runner.handCount).toBe(before.players.runner.handCount);
    expect(after.players.corp.clicks).toBe(before.players.corp.clicks);
    expect((await notices(page)).some((t) => t === "Runner isn't tagged")).toBe(true);
  });

  test('seed 1: an untagged Runner with Access to Globalsec installed: the Corp taps it and gets no Trash button', async ({ page }) => {
    await core(page, 1, false);
    const plan = await toStep(page, 1, 'globalsec_installed');
    const uid = plan.info['uids']!.split(',')[0]!;
    expect((await getView(page)).players.runner.tags).toBe(0);
    await passTurn(page);
    let l = await waitIdle(page);
    expect(l.viewer).toBe('corp');
    const card = l.rig.find((c) => c.uid === uid)!;
    expect(card).toBeTruthy();
    await tap(page, card.box);
    await waitIdle(page);
    l = await layout(page);
    expect(l.targets.filter((t) => t.kind === 'trash_resource')).toEqual([]);
    expect((await getView(page)).installedOptions[uid]).toBeUndefined();
    await shot(page, '14-untagged-no-trash-button');
  });
});

test.describe('QA S-09-1 online', () => {
  test('seed 42: Hunter — the Corp bids its Max on its phone (Runner waits), the hopeless Runner is never asked; same result on both; no hidden card in any frame', async ({ browser }) => {
    test.setTimeout(90_000);
    const SEED = 42;
    const ONLINE = { rezWindow: 'always', deckSet: 'core' } as const;
    const plan = planToStep(SEED, 'hunter_encounter', undefined, ONLINE);
    const host = await openPhone(browser);
    const guest = await openPhone(browser);
    const code = await startTestGame(host, 'runner', { seed: SEED, actions: plan.actions as Action[], deckSet: 'core' });
    await joinGame(guest, code);
    await Promise.all([waitPlaying(host), waitPlaying(guest)]);
    const runner = host;
    const corp = guest;
    let rl = await layoutOf(runner);
    const startView = await waitView(runner, (v) => v.run?.step === 'encounter');
    const runnerCredits = startView.players.runner.credits;
    await tap(runner.page, rl.run!.buttons.find((b) => /^Let it fire/.test(b.label))!.box);
    await runner.page.waitForFunction(() => window.__overclock!.layout().trace?.kind === 'trace_corp');
    rl = await layoutOf(runner);
    expect(rl.trace).toMatchObject({ mine: false, stepLabel: 'Corp is choosing its trace bid…', control: null });
    await shot(runner.page, '15-online-runner-waits');
    await corp.page.waitForFunction(() => !!window.__overclock!.layout().trace?.control);
    let cl = await layoutOf(corp);
    const max = cl.trace!.control!.high;
    expect(3 + max - 1).toBeGreaterThan(runnerCredits); // hopeless for the Runner
    await tap(corp.page, cl.trace!.control!.buttons.max.box);
    await corp.page.waitForFunction((m) => window.__overclock!.layout().trace?.control?.bid === m, max);
    cl = await layoutOf(corp);
    expectBidControl(cl);
    await shot(corp.page, '16-online-corp-max');
    await tap(corp.page, cl.trace!.control!.buttons.bid.box);
    // Both phones: tagged, no Runner bid window ever opened.
    const rv = await waitView(runner, (v) => v.players.runner.tags === 1);
    const cv = await waitView(corp, (v) => v.players.runner.tags === 1);
    expect(rv.players.runner.credits).toBe(runnerCredits);
    expect(cv.players.runner.credits).toBe(runnerCredits);
    const runnerFrames = frames(runner.received);
    const allEvents = runnerFrames.flatMap((f) => f.events ?? []);
    expect(allEvents.some((e) => e.type === 'choice_opened' && e.kind === 'trace_runner')).toBe(false);
    expect(allEvents).toContainEqual({ type: 'trace_bid', player: 'runner', credits: 0, total: 1, auto: true });
    expect(allEvents).toContainEqual(expect.objectContaining({ type: 'trace_resolved', cardId: 'c20', strength: 3 + max, total: 1, success: true }));
    // Same as pass-the-phone.
    const m = new LocalMatch(SEED, ONLINE);
    for (const a of [...plan.actions, { type: 'pass', player: 'runner' } as Action, { type: 'trace_bid', player: 'corp', credits: max } as Action]) m.submit(a.player, a);
    expect(rv.players).toEqual(m.view('runner').players);
    expect(cv.players).toEqual(m.view('corp').players);
    // No frame to the Runner's phone carries the Corp's hand or a face-down card name.
    for (const f of runnerFrames) {
      if (f.view) expect(f.view.players.corp.hand).toBeNull();
      for (const e of f.events ?? []) if (e.type === 'trace_started' || e.type === 'trace_resolved') expect(e.cardId).toBe('c20');
      for (const e of f.events ?? []) if (e.type === 'card_drawn' && e.player === 'corp') expect((e as { cardId?: string }).cardId).toBeUndefined();
    }
    expect(m.view('corp').players.runner.tags).toBe(1);
    await shot(runner.page, '17-online-runner-result');
    await Promise.all([host.context.close(), guest.context.close()]);
  });
});

test.describe('QA round 2: the wide trace toast', () => {
  test('QA-S9-4: SEA Source result toast (seed 25) is clear of the Corp\'s End turn button and credits', async ({ page }) => {
    test.fail(test.info().project.name === 'desktop', 'QA-S9-4 (open): on desktop the wide toast covers the left end of End turn');
    await core(page, SEA_BROKE.seed, false);
    await dispatchAll(page, SEA_BROKE.actions);
    const i = (await getView(page)).players.corp.hand!.indexOf('c22');
    let l = await pickHand(page, i);
    await tap(page, targetOf(l, 'play').box);
    l = await waitIdle(page);
    l = await bidTap(page, 'plus');
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, l.trace!.control!.buttons.bid.box);
    l = await waitIdle(page);
    const toast = (await page.evaluate(() => window.__overclock!.anims())).find((a) => a.kind === 'notice' && a.text?.startsWith('SEA Source'))!;
    expect(toast.box).toBeTruthy();
    await shot(page, '18-qa-s9-4-toast-vs-end-turn');
    for (const b of [l.corp.credits, ...(l.endTurn ? [l.endTurn.box] : [])]) {
      const a = toast.box!;
      expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'toast clear of credits / End turn').toBe(true);
    }
  });
});
