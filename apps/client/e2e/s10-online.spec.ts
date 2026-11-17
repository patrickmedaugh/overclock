// Sprint 10 online: two phones against the local service (test mode).
// S-10-3: the Runner picks an amount from Bank Job; both phones show the same credits on it
// (and the same game as pass-the-phone). S-10-1: the Corp's scored pile shows the same on
// both phones. Runs at the 3 main sizes only (not phone-short: the online path is
// size-independent; the layout specs cover 891x296).
import type { Action, PlayerView, Side } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';
import { type StepGoal, planToStep } from '@overclock/match/testing';
import { type Browser, expect, test } from '@playwright/test';
import { runButtonOf, startRun, tap } from './helpers';
import { type Phone, joinGame, layoutOf, openPhone, startTestGame, waitPlaying, waitView } from './online';

type Decks = 'starter' | 'core';

async function twoPhones(browser: Browser, goal: StepGoal, hostSide: Side, deckSet: Decks) {
  const opts = { rezWindow: 'always', deckSet } as const;
  const plan = planToStep(1, goal, undefined, opts);
  const host = await openPhone(browser);
  const guest = await openPhone(browser);
  const code = await startTestGame(host, hostSide, { seed: 1, actions: plan.actions, deckSet });
  await joinGame(guest, code);
  await Promise.all([waitPlaying(host), waitPlaying(guest)]);
  const corp = hostSide === 'corp' ? host : guest;
  const runner = hostSide === 'corp' ? guest : host;
  return { plan, corp, runner, opts, close: async () => Promise.all([host.context.close(), guest.context.close()]) };
}

function local(plan: { actions: readonly Action[] }, more: Action[], opts: { rezWindow: 'always'; deckSet: Decks }): Record<Side, PlayerView> {
  const m = new LocalMatch(1, opts);
  for (const a of [...plan.actions, ...more]) m.submit(a.player, a);
  return { corp: m.view('corp'), runner: m.view('runner') };
}

async function expectSame(phones: Record<Side, Phone>, expected: Record<Side, PlayerView>): Promise<void> {
  for (const side of ['corp', 'runner'] as const) {
    const v = await waitView(phones[side], (x) => JSON.stringify([x.corpServers, x.rig, x.players]) === JSON.stringify([expected[side].corpServers, expected[side].rig, expected[side].players]));
    expect(v.run).toEqual(expected[side].run);
  }
}

test.describe('S-10-3 online: Bank Job amount', () => {
  test('the Runner takes 3 of 8: both phones show 5 on Bank Job and the same credits', async ({ browser }) => {
    const { plan, corp, runner, opts, close } = await twoPhones(browser, 'runner_bank_job_remote', 'runner', 'starter');
    const server = plan.info['server']!;
    const bj = plan.info['bankJobUid']!;
    await startRun(runner.page, server);
    await runner.page.waitForFunction(() => window.__overclock!.layout().run?.step === 'success');
    await tap(runner.page, runButtonOf(await layoutOf(runner), 'Take credits').box);
    await runner.page.waitForFunction(() => window.__overclock!.layout().run?.amount?.amount === 8);
    for (let n = 8; n > 3; n--) {
      await tap(runner.page, runButtonOf(await layoutOf(runner), '−').box);
      await runner.page.waitForFunction((k) => window.__overclock!.layout().run?.amount?.amount === k, n - 1);
    }
    const take = runButtonOf(await layoutOf(runner), 'Take 3');
    expect(take.action).toEqual({ type: 'activate', player: 'runner', uid: bj, ability: 0, amount: 3 });
    await tap(runner.page, take.box);
    await expectSame({ corp, runner }, local(plan, [{ type: 'run', player: 'runner', server } as Action, take.action], opts));
    for (const p of [corp, runner]) await p.page.waitForFunction((u) => window.__overclock!.layout().rig.find((c) => c.uid === u)?.hosted?.text === '5', bj);
    await close();
  });
});

test.describe('S-10-1 online: scored piles', () => {
  test('the Corp\'s scored pile reads the same on both phones', async ({ browser }) => {
    const { plan, corp, runner, close } = await twoPhones(browser, 'corp_two_scored', 'corp', 'core');
    const count = Number(plan.info['count']);
    const points = Number(plan.info['points']);
    const want = `${count} agendas · ${points} ${points === 1 ? 'point' : 'points'}`;
    for (const p of [corp, runner]) {
      await p.page.waitForFunction((t) => window.__overclock!.layout().scored.corp.text === t, want);
      const l = await layoutOf(p);
      expect(l.scored.corp.top).toBe(plan.info['scored']!.split(',').at(-1));
    }
    await close();
  });
});
