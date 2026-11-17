// Sprint 7 (U6) online: two phones against the local service (test mode).
// S-07-1: a lobby given up with Back is gone ("No game with that code").
// S-07-2/3/4: rezzing PAD Campaign, taking credits from Armitage Codebusting,
// Cyberfeeder paying a break and taking Bank Job's credits give both phones the
// same game as pass-the-phone (LocalMatch with the same actions).
import type { Action, PlayerView, Side } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';
import { type StepGoal, planToStep } from '@overclock/match/testing';
import { type Browser, type Page, expect, test } from '@playwright/test';
import { type LayoutSnapshot, runButtonOf, startRun, tap, targetOf } from './helpers';
import { type Phone, joinGame, layoutOf, openPhone, startGame, startTestGame, tapButton, view, waitPlaying, waitView } from './online';

const ONLINE = { rezWindow: 'always', deckSet: 'starter' } as const;

/** Two phones in a game set up by the planner (`goal`, seed 1); the host plays `hostSide`. */
async function twoPhones(browser: Browser, goal: StepGoal, hostSide: Side) {
  const plan = planToStep(1, goal, undefined, ONLINE);
  const host = await openPhone(browser);
  const guest = await openPhone(browser);
  const code = await startTestGame(host, hostSide, { seed: 1, actions: plan.actions });
  await joinGame(guest, code);
  await Promise.all([waitPlaying(host), waitPlaying(guest)]);
  const corp = hostSide === 'corp' ? host : guest;
  const runner = hostSide === 'corp' ? guest : host;
  return { plan, corp, runner, close: async () => Promise.all([host.context.close(), guest.context.close()]) };
}

/** The same game in pass-the-phone terms: the planner's actions plus `more`, both seats' views. */
function local(plan: { actions: readonly Action[] }, more: Action[]): Record<Side, PlayerView> {
  const m = new LocalMatch(1, ONLINE);
  for (const a of [...plan.actions, ...more]) m.submit(a.player, a);
  return { corp: m.view('corp'), runner: m.view('runner') };
}

function installedIn(l: LayoutSnapshot, uid: string) {
  const c = [...l.servers.flatMap((s) => [...s.ice, ...s.content]), ...l.rig].find((x) => x.uid === uid);
  if (!c) throw new Error(`no installed card ${uid}`);
  return c;
}

async function tapInstalled(page: Page, uid: string): Promise<LayoutSnapshot> {
  const l = await page.evaluate(() => window.__overclock!.layout());
  await tap(page, installedIn(l, uid).box);
  await page.waitForFunction((u) => window.__overclock!.layout().selectedInstalled === u, uid);
  return page.evaluate(() => window.__overclock!.layout());
}

/** Both phones' tables match pass-the-phone: servers, rig, credits, clicks. */
async function expectSame(phones: Record<Side, Phone>, expected: Record<Side, PlayerView>): Promise<void> {
  for (const side of ['corp', 'runner'] as const) {
    const v = await waitView(phones[side], (x) => JSON.stringify(x.corpServers) === JSON.stringify(expected[side].corpServers) && JSON.stringify(x.rig) === JSON.stringify(expected[side].rig));
    expect(v.players, `${side}'s numbers`).toEqual(expected[side].players);
    expect(v.run).toEqual(expected[side].run);
  }
}

test.describe('S-07-1 online: a lobby given up is gone', () => {
  test('Back on the waiting screen closes the game: another phone typing the code sees "No game with that code"', async ({ browser }) => {
    const host = await openPhone(browser);
    const guest = await openPhone(browser);
    const code = await startGame(host, 'corp');
    await tapButton(host.page, /^Back$/);
    await expect(host.page.locator('#start')).not.toContainText(code);
    await joinGame(guest, code);
    await expect(guest.page.locator('#start')).toContainText('No game with that code');
    await host.context.close();
    await guest.context.close();
  });
});

test.describe('S-07-2/3/4 online: both phones show the same result as pass-the-phone', () => {
  test('the Corp rezzes PAD Campaign: face up on both phones', async ({ browser }) => {
    const { plan, corp, runner, close } = await twoPhones(browser, 'corp_rez_asset', 'corp');
    const uid = plan.info['uid']!;
    const l = await tapInstalled(corp.page, uid);
    await tap(corp.page, targetOf(l, 'rez').box);
    await expectSame({ corp, runner }, local(plan, [{ type: 'rez', player: 'corp', uid }]));
    await runner.page.waitForFunction((u) => window.__overclock!.layout().servers.some((s) => s.content.some((c) => c.uid === u && c.faceUp && c.cardId === 'c03')), uid);
    await close();
  });

  test('the Runner takes 2 credits from Armitage Codebusting: the Corp phone shows 10 on the card', async ({ browser }) => {
    const { plan, corp, runner, close } = await twoPhones(browser, 'runner_armitage', 'runner');
    const uid = plan.info['uid']!;
    const l = await tapInstalled(runner.page, uid);
    await tap(runner.page, targetOf(l, 'activate').box);
    await expectSame({ corp, runner }, local(plan, [{ type: 'activate', player: 'runner', uid, ability: 0 }]));
    await corp.page.waitForFunction((u) => window.__overclock!.layout().rig.find((c) => c.uid === u)?.hosted?.text === '10', uid);
    await close();
  });

  test('Cyberfeeder pays a break: its credit is gone on both phones', async ({ browser }) => {
    const { plan, corp, runner, close } = await twoPhones(browser, 'runner_cyberfeeder_ice_wall', 'runner');
    const cf = plan.info['cyberfeederUid']!;
    const l = await layoutOf(runner);
    const brk = runButtonOf(l, /Cyberfeeder pays/);
    await tap(runner.page, brk.box);
    await expectSame({ corp, runner }, local(plan, [brk.action]));
    await corp.page.waitForFunction((u) => window.__overclock!.layout().rig.find((c) => c.uid === u)?.hosted === null, cf);
    await close();
  });

  test('Bank Job: the Runner takes 8 instead of accessing; both phones agree', async ({ browser }) => {
    const { plan, corp, runner, close } = await twoPhones(browser, 'runner_bank_job_remote', 'runner');
    const server = plan.info['server']!;
    await startRun(runner.page, server);
    await runner.page.waitForFunction(() => window.__overclock!.layout().run?.step === 'success');
    // Sprint 10 (S-10-3): "Take credits" opens the amount control at 8; "Take 8" takes all.
    await tap(runner.page, runButtonOf(await layoutOf(runner), 'Take credits').box);
    await runner.page.waitForFunction(() => window.__overclock!.layout().run?.amount?.amount === 8);
    const l = await layoutOf(runner);
    const take = runButtonOf(l, 'Take 8');
    await tap(runner.page, take.box);
    await expectSame({ corp, runner }, local(plan, [{ type: 'run', player: 'runner', server } as Action, take.action]));
    const cv = await view(corp);
    expect(cv.players.runner.discard).toContain('r10');
    expect(cv.run).toBeNull();
    await close();
  });
});
