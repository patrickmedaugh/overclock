// Sprint 9 (U5) online: two phones against the local service (test mode), core
// decks, real taps. S-09-1 a Hunter trace and a SEA Source trace: each phone bids
// on its own device while the other says "Corp is choosing its trace bid…" /
// "Runner is choosing his trace bid…"; S-09-2 the Corp's trash and the Runner's
// Remove 1 tag; S-09-3 Private Security Force. Both phones end with the same game
// as pass-the-phone (LocalMatch with the same actions).
import type { Action, PlayerView, Side } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';
import { type StepGoal, planToStep } from '@overclock/match/testing';
import { type Browser, type Page, expect, test } from '@playwright/test';
import { type LayoutSnapshot, tap, targetOf } from './helpers';
import { type Phone, joinGame, layoutOf, openPhone, startTestGame, waitPlaying, waitView } from './online';

const ONLINE_CORE = { rezWindow: 'always', deckSet: 'core' } as const;
const SEED = 1;

async function twoPhones(browser: Browser, seed: number, goal: StepGoal, hostSide: Side) {
  const plan = planToStep(seed, goal, undefined, ONLINE_CORE);
  expect(plan.deckSet).toBe('core');
  const host = await openPhone(browser);
  const guest = await openPhone(browser);
  const code = await startTestGame(host, hostSide, { seed, actions: plan.actions, deckSet: 'core' });
  await joinGame(guest, code);
  await Promise.all([waitPlaying(host), waitPlaying(guest)]);
  const corp = hostSide === 'corp' ? host : guest;
  const runner = hostSide === 'corp' ? guest : host;
  return { plan, corp, runner, close: async () => Promise.all([host.context.close(), guest.context.close()]) };
}

function local(seed: number, plan: { actions: readonly Action[] }, more: Action[]): Record<Side, PlayerView> {
  const m = new LocalMatch(seed, ONLINE_CORE);
  for (const a of [...plan.actions, ...more]) m.submit(a.player, a);
  return { corp: m.view('corp'), runner: m.view('runner') };
}

/** Both phones' tables match pass-the-phone: servers, rig, numbers (tags, link, piles), run, choice. */
async function expectSame(phones: Record<Side, Phone>, expected: Record<Side, PlayerView>): Promise<void> {
  for (const side of ['corp', 'runner'] as const) {
    const v = await waitView(phones[side], (x) => JSON.stringify([x.corpServers, x.rig, x.players]) === JSON.stringify([expected[side].corpServers, expected[side].rig, expected[side].players]));
    expect(v.run).toEqual(expected[side].run);
    expect(v.choice).toEqual(expected[side].choice);
  }
}

async function waitLayout(page: Page, pred: (l: LayoutSnapshot) => boolean): Promise<LayoutSnapshot> {
  const until = Date.now() + 10_000;
  for (;;) {
    const l = await page.evaluate(() => window.__overclock!.layout());
    if (pred(l) && !l.animating) return l;
    if (Date.now() > until) throw new Error(`layout never matched ${pred.toString()}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Real taps on + (from 0) and Bid on this phone; returns the action it sent. */
async function bidOn(phone: Phone, amount: number): Promise<Action> {
  let l = await waitLayout(phone.page, (x) => !!x.trace?.control);
  for (let i = 0; i < amount; i++) await tap(phone.page, l.trace!.control!.buttons.plus.box);
  l = await layoutOf(phone);
  expect(l.trace!.control!.bid).toBe(amount);
  await tap(phone.page, l.trace!.control!.buttons.bid.box);
  const sent = await phone.page.evaluate(() => window.__overclock!.sent());
  return sent.at(-1)!;
}

test.describe('Sprint 9 online: traces and tags on two phones (core decks)', () => {
  test('S-09-1 Hunter: the Corp bids on its phone while the Runner waits, then the Runner bids; same result as pass-the-phone', async ({ browser }) => {
    const { plan, corp, runner, close } = await twoPhones(browser, SEED, 'hunter_encounter', 'runner');
    let rl = await layoutOf(runner);
    const fire = rl.run!.buttons.find((b) => /^Let it fire/.test(b.label))!;
    await tap(runner.page, fire.box);
    const fireAction = (await runner.page.evaluate(() => window.__overclock!.sent())).at(-1)!;
    rl = await waitLayout(runner.page, (x) => x.trace?.kind === 'trace_corp');
    expect(rl.trace).toMatchObject({ mine: false, stepLabel: 'Corp is choosing its trace bid…', control: null });
    let cl = await waitLayout(corp.page, (x) => !!x.trace?.control);
    expect(cl.trace).toMatchObject({ kind: 'trace_corp', stepLabel: 'Trace 3: add credits?' });
    const corpBid = await bidOn(corp, 2);
    expect(corpBid).toEqual({ type: 'trace_bid', player: 'corp', credits: 2 });
    cl = await waitLayout(corp.page, (x) => x.trace?.kind === 'trace_runner');
    expect(cl.trace).toMatchObject({ mine: false, stepLabel: 'Runner is choosing his trace bid…', control: null });
    rl = await waitLayout(runner.page, (x) => x.trace?.kind === 'trace_runner' && !!x.trace.control);
    expect(rl.trace!.stepLabel).toBe('Trace strength 5 · your link 1 · spend 4 to stop it');
    const runnerBid = await bidOn(runner, 3);
    await expectSame({ corp, runner }, local(SEED, plan, [fireAction, corpBid, runnerBid]));
    rl = await waitLayout(runner.page, (x) => x.report !== null);
    expect(rl.report!.text).toBe('Hunter: trace 5 vs link 4: you got 1 tag.');
    cl = await waitLayout(corp.page, (x) => x.runnerStatus.tagged !== null);
    expect(cl.runnerStatus.tagged!.text).toBe('Tagged 1');
    await close();
  });

  test("S-09-4 SEA Source: the Corp bids, the Runner bids on his phone (the Corp's says who is bidding); both show Tagged 1", async ({ browser }) => {
    const { plan, corp, runner, close } = await twoPhones(browser, SEED, 'sea_source_ready', 'corp');
    const play: Action = { type: 'play', player: 'corp', handIndex: Number(plan.info['handIndex']) };
    await corp.page.evaluate((a) => window.__overclock!.dispatch(a), play);
    let rl = await waitLayout(runner.page, (x) => x.trace?.kind === 'trace_corp');
    expect(rl.trace).toMatchObject({ title: 'Trace · SEA Source', stepLabel: 'Corp is choosing its trace bid…', control: null });
    const corpBid = await bidOn(corp, 1);
    const cl = await waitLayout(corp.page, (x) => x.trace?.kind === 'trace_runner');
    expect(cl.trace).toMatchObject({ mine: false, stepLabel: 'Runner is choosing his trace bid…' });
    rl = await waitLayout(runner.page, (x) => !!x.trace?.control);
    expect(rl.trace!.stepLabel).toBe('Trace strength 4 · your link 1 · spend 3 to stop it');
    const runnerBid = await bidOn(runner, 0);
    await expectSame({ corp, runner }, local(SEED, plan, [play, corpBid, runnerBid]));
    for (const p of [corp, runner]) {
      const l = await waitLayout(p.page, (x) => x.runnerStatus.tagged !== null && x.trace === null);
      expect(l.runnerStatus.tagged!.text).toBe('Tagged 1');
    }
    await close();
  });

  test('S-09-2: the Corp trashes Armitage while the Runner is tagged; both phones show it in the Heap', async ({ browser }) => {
    const { plan, corp, runner, close } = await twoPhones(browser, SEED, 'runner_tagged_corp_turn', 'corp');
    const uid = plan.info['armitageUid']!;
    let l = await layoutOf(corp);
    await tap(corp.page, l.rig.find((c) => c.uid === uid)!.box);
    l = await waitLayout(corp.page, (x) => x.selectedInstalled === uid);
    const trash = targetOf(l, 'trash_resource');
    expect(trash.label).toBe('Trash · 1 click + 2 credits');
    await tap(corp.page, trash.box);
    await expectSame({ corp, runner }, local(SEED, plan, [{ type: 'trash_resource', player: 'corp', uid }]));
    const rv = await waitView(runner, (v) => v.players.runner.discard.includes('r02'));
    expect(rv.rig.some((c) => c.uid === uid)).toBe(false);
    await close();
  });

  test('S-09-2: the Runner removes a tag on his phone; both phones lose the marker', async ({ browser }) => {
    const { plan, corp, runner, close } = await twoPhones(browser, SEED, 'runner_tagged_own_turn', 'runner');
    let l = await waitLayout(runner.page, (x) => x.runnerStatus.tagged !== null);
    await tap(runner.page, l.runnerStatus.tagged!.hit);
    l = await waitLayout(runner.page, (x) => x.targets.some((t) => t.kind === 'remove_tag'));
    await tap(runner.page, targetOf(l, 'remove_tag').box);
    await expectSame({ corp, runner }, local(SEED, plan, [{ type: 'remove_tag', player: 'runner' }]));
    for (const p of [corp, runner]) await waitLayout(p.page, (x) => x.runnerStatus.tagged === null);
    await close();
  });

  test('S-09-3: Private Security Force on the Corp phone; both phones show the same card face up in the Heap', async ({ browser }) => {
    const { plan, corp, runner, close } = await twoPhones(browser, SEED, 'psf_scored_tagged', 'corp');
    let l = await layoutOf(corp);
    await tap(corp.page, l.score.corp.box);
    l = await waitLayout(corp.page, (x) => x.targets.some((t) => t.kind === 'activate'));
    const use = targetOf(l, 'activate');
    expect(use).toMatchObject({ label: 'Do 1 meat damage · 1 click', lit: true });
    await tap(corp.page, use.box);
    const action = (await corp.page.evaluate(() => window.__overclock!.sent())).at(-1)!;
    const expected = local(SEED, plan, [action]);
    await expectSame({ corp, runner }, expected);
    const lost = expected.corp.players.runner.discard.at(-1);
    expect(lost).toBeTruthy();
    expect(expected.runner.players.runner.discard.at(-1)).toBe(lost);
    await close();
  });
});
