// Sprint 8 (U6) online: two phones against the local service (test mode), core
// decks. S-08-1 Haas-Bioroid's first-install credit, S-08-2 Adonis Campaign,
// S-08-3 Viktor's brain damage, S-08-4 Battering Ram's break of 2, S-08-7
// Rototurret's in-run choices (the Corp picks on its phone, the Runner saves or
// not on his): both phones end up with the same game as pass-the-phone
// (LocalMatch with the same actions), and each phone sees only its own buttons.
import type { Action, PlayerView, Side } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';
import { type StepGoal, planToStep } from '@overclock/match/testing';
import { type Browser, type Page, expect, test } from '@playwright/test';
import { type LayoutSnapshot, pickHand, runButtonOf, tap, targetOf } from './helpers';
import { type Phone, joinGame, layoutOf, openPhone, startTestGame, view, waitPlaying, waitView } from './online';

const ONLINE_CORE = { rezWindow: 'always', deckSet: 'core' } as const;

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

/** Both phones' tables match pass-the-phone: servers, rig, numbers, run, choice. */
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

test.describe('Sprint 8 online: both phones show the same result as pass-the-phone (core decks)', () => {
  test('S-08-1/2: the Corp rezzes Adonis Campaign: 12 on it on both phones; identities on both', async ({ browser }) => {
    const { plan, corp, runner, close } = await twoPhones(browser, 1, 'corp_rez_adonis', 'corp');
    const uid = plan.info['uid']!;
    let l = await layoutOf(corp);
    const card = [...l.servers.flatMap((s) => s.content)].find((c) => c.uid === uid)!;
    await tap(corp.page, card.box);
    l = await waitLayout(corp.page, (x) => x.selectedInstalled === uid);
    await tap(corp.page, targetOf(l, 'rez').box);
    await expectSame({ corp, runner }, local(1, plan, [{ type: 'rez', player: 'corp', uid }]));
    for (const p of [corp, runner]) {
      const pl = await waitLayout(p.page, (x) => x.servers.some((s) => s.content.some((c) => c.uid === uid && c.hosted?.text === '12')));
      expect(pl.identities.corp?.cardId).toBe('c13');
      expect(pl.identities.runner?.cardId).toBe('r13');
    }
    await close();
  });

  test('S-08-1: the Corp installs on its phone: Haas-Bioroid gives +1 credit on both phones, and the Corp phone says so', async ({ browser }) => {
    const { plan, corp, runner, close } = await twoPhones(browser, 1, 'corp_first_install', 'corp');
    const idx = Number(plan.info['handIndex']);
    const install = (await view(corp)).handOptions[idx]!.find((o) => o.action.type === 'install' && o.action.server === 'new')!.action;
    const l = await pickHand(corp.page, idx);
    const t = l.targets.find((x) => x.kind === 'new_server' && x.lit)!;
    await tap(corp.page, t.box);
    const cv = await waitView(corp, (v) => v.corpServers.length > 3);
    const expected = local(1, plan, [install]);
    expect(cv.players.corp.credits).toBe(expected.corp.players.corp.credits);
    await expectSame({ corp, runner }, expected);
    await waitLayout(corp.page, (x) => x.hint?.text.includes('Engineering the Future: +1 credit') === true);
    await close();
  });

  test('S-08-3: Viktor 1.0 fires on the Runner phone: brain damage, "Hand max 4" on both phones', async ({ browser }) => {
    const { plan, corp, runner, close } = await twoPhones(browser, 1, 'viktor_encounter', 'runner');
    const l = await layoutOf(runner);
    const fire = runButtonOf(l, /^Let it fire/);
    await tap(runner.page, fire.box);
    await expectSame({ corp, runner }, local(1, plan, [fire.action]));
    for (const p of [corp, runner]) await waitLayout(p.page, (x) => x.tags.runner?.text.includes('Hand max 4') === true);
    await close();
  });

  test('S-08-4: Battering Ram breaks 2 subroutines of Heimdall in one go; the Corp phone sees both broken', async ({ browser }) => {
    test.setTimeout(60_000);
    const { plan, corp, runner, close } = await twoPhones(browser, 1, 'heimdall_ram_encounter', 'runner');
    const sent: Action[] = [];
    let l = await layoutOf(runner);
    const start = (await view(runner)).players.runner.credits;
    while (!l.run!.buttons.find((b) => b.role === 'multi')!.lit) {
      const pump = runButtonOf(l, /\+1 strength/);
      sent.push(pump.action);
      await tap(runner.page, pump.box);
      // Each pump costs 1 credit (Battering Ram: +1 strength for 1).
      const spent = sent.length;
      await waitView(runner, (v) => v.players.runner.credits === start - spent);
      l = await waitLayout(runner.page, (x) => x.run !== null);
    }
    await tap(runner.page, l.run!.buttons.find((b) => b.role === 'multi')!.box);
    l = await waitLayout(runner.page, (x) => x.run!.buttons.some((b) => b.role === 'toggle'));
    await tap(runner.page, l.run!.buttons.filter((b) => b.role === 'toggle')[0]!.box);
    l = await waitLayout(runner.page, (x) => x.run!.buttons.filter((b) => b.picked).length === 1);
    await tap(runner.page, l.run!.buttons.filter((b) => b.role === 'toggle')[2]!.box);
    l = await waitLayout(runner.page, (x) => x.run!.buttons.filter((b) => b.picked).length === 2);
    const confirm = l.run!.buttons.find((b) => b.role === 'confirm')!;
    expect(confirm.action).toMatchObject({ type: 'use_ability', subs: [0, 2] });
    await tap(runner.page, confirm.box);
    await expectSame({ corp, runner }, local(1, plan, [...sent, confirm.action]));
    const cl = await waitLayout(corp.page, (x) => (x.run?.subroutines ?? []).filter((s) => s.broken).length === 2);
    expect(cl.run!.subroutines.map((s) => s.broken)).toEqual([true, false, true]);
    await close();
  });

  test('S-08-7: Rototurret: the Corp picks on its phone, the Runner sees "Corp is choosing…", then saves with Sacrificial Construct', async ({ browser }) => {
    // Sprint 9 decks: seed 11 has Sacrificial Construct installed (was 2).
    const { plan, corp, runner, close } = await twoPhones(browser, 11, 'rototurret_two_programs', 'runner');
    expect(plan.info['construct']).not.toBe('');
    let rl = await layoutOf(runner);
    const fire = runButtonOf(rl, /^Let it fire/);
    await tap(runner.page, fire.box);
    // Runner phone: the run stays up, no buttons, "Corp is choosing…".
    rl = await waitLayout(runner.page, (x) => x.run?.choice?.kind === 'trash_target');
    expect(rl.run!.stepLabel).toBe('Corp is choosing…');
    expect(rl.run!.buttons).toEqual([]);
    // Corp phone: one button per program.
    let cl = await waitLayout(corp.page, (x) => x.run?.choice?.kind === 'trash_target' && x.run.buttons.length >= 2);
    expect(cl.run!.stepLabel).toBe('Rototurret: pick a program to trash');
    const pick = cl.run!.buttons[0]!;
    await tap(corp.page, pick.box);
    // Runner phone: save it or not.
    rl = await waitLayout(runner.page, (x) => x.run?.choice?.kind === 'prevent_trash' && x.run.buttons.length === 2);
    expect(rl.run!.buttons.map((b) => b.label)).toEqual(['Trash Sacrificial Construct instead', 'Let it be trashed']);
    cl = await waitLayout(corp.page, (x) => x.run?.choice?.kind === 'prevent_trash');
    expect(cl.run!.stepLabel).toBe('Runner is choosing…');
    const save = rl.run!.buttons[0]!;
    await tap(runner.page, save.box);
    await expectSame({ corp, runner }, local(11, plan, [fire.action, pick.action, save.action]));
    await close();
  });
});
