// Sprint 7 (U6): the sleeping cards work on screen. S-07-1 empty servers go,
// S-07-2 the Corp rezzes PAD Campaign / Akitaro Watanabe, S-07-3 Armitage
// Codebusting and Akamatsu Mem Chip, S-07-4 Cyberfeeder and Bank Job, S-07-5
// Ice Wall advanced. Real taps on the board; setups through the planner
// (`planToStep` Sprint 7 goals). 640x360 screenshots go to
// docs/sprints/sprint-07-screens/ (phone-small project only).
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Action } from '@overclock/engine';
import { getCard } from '@overclock/cards';
import { type Page, expect, test } from '@playwright/test';
import {
  type InstalledSnapshot,
  type LayoutSnapshot,
  anims,
  dispatch,
  expectCleanLayout,
  getView,
  layout,
  measureTap,
  openBoard,
  passTurn,
  pickCard,
  runButtonOf,
  startRun,
  tap,
  targetOf,
  toRunnerTurn,
  toStep,
  waitIdle,
} from './helpers';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-07-screens');

/** A 640x360 screenshot for the demo (phone-small only); attached on every size. */
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

/** Taps installed card `uid` and returns the layout with its buttons. */
async function tapInstalled(page: Page, uid: string): Promise<LayoutSnapshot> {
  await tap(page, installedIn(await layout(page), uid).box);
  await page.waitForFunction((u) => window.__overclock!.layout().selectedInstalled === u, uid);
  return layout(page);
}

/** Dispatches through the hook (as each action's player), failing on a refusal. */
async function ok(page: Page, a: Action): Promise<void> {
  const events = await dispatch(page, a);
  expect(events.find((e) => e.type === 'action_rejected'), JSON.stringify(a)).toBeUndefined();
}

test.describe('S-07-1 empty servers vanish', () => {
  test('stealing the only card of a remote with no ICE removes it; the others keep their names; the next server gets a new number; one New server place, no gap', async ({ page }) => {
    await openBoard(page, 3);
    const plan = await toStep(page, 3, 'remote_last_card');
    const server = plan.info['server']!;
    const l0 = await layout(page);
    const names = Object.fromEntries(l0.servers.map((s) => [s.id, s.label]));
    let l = await startRun(page, server);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, runButtonOf(l, 'Steal').box);
    l = await waitIdle(page);
    expect(l.run).toBeNull();
    expect(l.servers.map((s) => s.id)).not.toContain(server);
    // Every other server keeps its name.
    for (const s of l.servers) expect(s.label).toBe(names[s.id]);
    const fold = (await anims(page)).filter((a) => a.kind === 'server_close');
    expect(fold.length).toBe(1);
    expect(fold[0]!.scheduledMs).toBeLessThanOrEqual(200);
    expect(l.labels).not.toContain(names[server]);
    expectCleanLayout(l);
    await shot(page, 's07-1-server-gone');
    // The Corp: one New server place, right after the last column (no blank gap).
    await passTurn(page);
    l = await waitIdle(page);
    const v = await getView(page);
    const i = v.handOptions.findIndex((os) => os.some((o) => o.reject === null && o.action.type === 'install' && o.action.server === 'new'));
    expect(i).toBeGreaterThanOrEqual(0);
    l = await pickCard(page, getCard(v.players.corp.hand![i]!)!.name);
    const fresh = l.targets.filter((t) => t.kind === 'new_server');
    expect(fresh.length).toBe(1);
    const cols = l.servers.map((s) => s.box).sort((a, b) => a.x - b.x);
    const steps = cols.slice(1).map((b, k) => b.x - cols[k]!.x);
    const step = Math.max(...steps);
    const last = cols.at(-1)!;
    expect(fresh[0]!.box.x - last.x, 'New server sits one column past the last server').toBeLessThanOrEqual(step + 1);
    await tap(page, fresh[0]!.box);
    l = await waitIdle(page);
    const numbers = (await getView(page)).corpServers.map((s) => s.id).filter((id) => id.startsWith('remote')).map((id) => Number(id.slice(6)));
    expect(Math.max(...numbers)).toBeGreaterThan(Number(server.slice(6)));
    expect(l.servers.map((s) => s.label)).not.toContain(names[server]);
  });
});

test.describe('S-07-2 PAD Campaign and Akitaro Watanabe', () => {
  test('tapping the face-down PAD Campaign shows "Rez · 2 credits"; it takes 2 credits and no click and turns face up for both', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'corp_rez_asset');
    const uid = plan.info['uid']!;
    const before = await getView(page);
    let l = await tapInstalled(page, uid);
    const rez = targetOf(l, 'rez');
    expect(rez).toMatchObject({ label: 'Rez · 2 credits', lit: true, uid });
    expect(Math.min(rez.box.width, rez.box.height)).toBeGreaterThanOrEqual(44);
    expectCleanLayout(l);
    await shot(page, 's07-2-rez-pad-campaign');
    const m = await measureTap(page, rez.box);
    expect(m.events.map((e) => e.type)).toEqual(['credits_spent', 'card_rezzed']);
    expect(m.view.players.corp.credits).toBe(before.players.corp.credits - 2);
    expect(m.view.players.corp.clicks).toBe(before.players.corp.clicks);
    l = await waitIdle(page);
    expect(installedIn(l, uid)).toMatchObject({ cardId: 'c03', faceUp: true });
    expect((await anims(page)).some((a) => a.kind === 'card_rez' && a.scheduledMs <= 300)).toBe(true);
    // The Runner's board shows it face up too.
    await passTurn(page);
    l = await waitIdle(page);
    expect(l.viewer).toBe('runner');
    expect(installedIn(l, uid)).toMatchObject({ cardId: 'c03', faceUp: true });
    // At the Corp's next turn start: +1 credit and a short note.
    const credits = (await getView(page)).players.corp.credits;
    await page.evaluate(() => window.__overclock!.clearAnims());
    await passTurn(page);
    expect((await getView(page)).players.corp.credits).toBe(credits + 1);
    const notes = (await anims(page)).filter((a) => a.kind === 'notice').map((a) => a.text);
    expect(notes).toContain('PAD Campaign: +1 credit');
    await shot(page, 's07-2-pad-campaign-gives-1');
  });

  test('with the cover on, the PAD Campaign note waits until the cover is tapped away', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'corp_rez_asset');
    await ok(page, { type: 'rez', player: 'corp', uid: plan.info['uid']! });
    // The same game from here with the S-06-5 cover on: replay to this point.
    const actions = [...plan.actions, { type: 'rez', player: 'corp', uid: plan.info['uid']! } as Action];
    await page.goto(`./?seed=1&play=here`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
    await page.evaluate((as) => {
      for (const a of as) window.__overclock!.dispatch(a);
    }, actions);
    // Corp ends; the Runner ends: each turn change raises the cover.
    for (let k = 0; k < 2; k++) {
      await page.evaluate(() => {
        const hook = window.__overclock!;
        const v = hook.getView();
        hook.dispatch({ type: 'end_turn', player: v.activePlayer });
        const w = hook.getView();
        if (w.pendingDiscard > 0) hook.dispatch({ type: 'discard', player: w.viewer, handIndices: Array.from({ length: w.pendingDiscard }, (_, i) => i) });
      });
      await page.waitForFunction(() => window.__overclock!.layout().cover !== null);
      if (k === 0) {
        await tap(page, (await layout(page)).cover!.box);
        await page.waitForFunction(() => window.__overclock!.layout().cover === null);
        await page.evaluate(() => window.__overclock!.clearAnims());
      }
    }
    // Under the cover: not shown yet.
    await page.waitForTimeout(300);
    expect((await anims(page)).filter((a) => a.kind === 'notice')).toEqual([]);
    await tap(page, (await layout(page)).cover!.box);
    await page.waitForFunction(() => window.__overclock!.layout().hint?.text === 'PAD Campaign: +1 credit');
  });

  test('with fewer credits than the rez cost the Rez button is dimmed and says "Not enough credits"', async ({ page }) => {
    await openBoard(page, 5);
    const plan = await toStep(page, 5, 'corp_rez_asset');
    const uid = plan.info['uid']!;
    // Spend the Corp's credits on ICE (each one more costs more) until PAD Campaign is too dear.
    const reached = await page.evaluate((u) => {
      const hook = window.__overclock!;
      for (let g = 0; g < 40; g++) {
        const v = hook.getView();
        const me = v.viewer;
        if (me === 'corp' && v.players.corp.credits < 2 && v.installedOptions[u]?.[0]?.reject === 'no_credits') return true;
        if (v.pendingDiscard > 0) hook.dispatch({ type: 'discard', player: me, handIndices: Array.from({ length: v.pendingDiscard }, (_, i) => i) });
        else if (me === 'corp' && v.players.corp.clicks > 0) {
          const ice = v.handOptions
            .flatMap((os, i) => os.map((x) => ({ x, id: v.players.corp.hand![i]! })))
            .filter(({ x, id }) => x.reject === null && x.action.type === 'install' && ['c04', 'c05', 'c06', 'c07'].includes(id))
            .sort((p, q) => q.x.cost - p.x.cost)[0];
          hook.dispatch(ice ? ice.x.action : { type: 'draw', player: 'corp' });
        } else hook.dispatch({ type: 'end_turn', player: me });
      }
      return false;
    }, uid);
    expect(reached).toBe(true);
    await waitIdle(page);
    const before = await getView(page);
    const l = await tapInstalled(page, uid);
    const rez = targetOf(l, 'rez');
    expect(rez).toMatchObject({ label: 'Rez · 2 credits', lit: false, reject: 'no_credits', note: 'Not enough credits' });
    await shot(page, 's07-2-rez-not-enough-credits');
    const m = await measureTap(page, rez.box);
    expect(m.events).toEqual([{ type: 'action_rejected', reason: 'no_credits' }]);
    expect(m.view).toEqual(before);
  });

  test('Akitaro Watanabe face up: the Corp with 1 credit is asked to rez Wall of Static for 1', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'runner_approach_akitaro');
    const l = await waitIdle(page);
    expect(l.run).toMatchObject({ step: 'approach', deciding: 'corp' });
    const rez = runButtonOf(l, /^Rez /);
    expect(rez).toMatchObject({ label: 'Rez Wall of Static · 1 credit', lit: true });
    expect(installedIn(l, plan.info['akitaroUid']!)).toMatchObject({ faceUp: true, cardId: 'c11' });
    await shot(page, 's07-2-akitaro-discount');
    const m = await measureTap(page, rez.box);
    expect(m.events.map((e) => e.type)).toContain('ice_rezzed');
  });
});

test.describe('S-07-3 Armitage Codebusting and Akamatsu Mem Chip', () => {
  test('Armitage shows 12 to both players; "Take 2 credits · 1 click" moves 2 to the Runner', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'runner_armitage');
    const uid = plan.info['uid']!;
    let l = await waitIdle(page);
    const disc = installedIn(l, uid).hosted!;
    expect(disc.text).toBe('12');
    expect(disc.fontPx).toBeGreaterThanOrEqual(14);
    expectCleanLayout(l);
    const before = await getView(page);
    l = await tapInstalled(page, uid);
    const take = targetOf(l, 'activate');
    expect(take).toMatchObject({ label: 'Take 2 credits · 1 click', lit: true });
    await shot(page, 's07-3-armitage-take-2');
    const m = await measureTap(page, take.box);
    expect(m.view.players.runner.credits).toBe(before.players.runner.credits + 2);
    expect(m.view.players.runner.clicks).toBe(before.players.runner.clicks - 1);
    l = await waitIdle(page);
    expect(installedIn(l, uid).hosted?.text).toBe('10');
    // The Corp sees the same 10.
    await passTurn(page);
    l = await waitIdle(page);
    expect(l.viewer).toBe('corp');
    expect(installedIn(l, uid).hosted?.text).toBe('10');
  });

  test('with no clicks left the button is dimmed and says "No clicks left"', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'runner_armitage');
    const uid = plan.info['uid']!;
    while ((await getView(page)).players.runner.clicks > 0) await ok(page, { type: 'gain_credit', player: 'runner' });
    await waitIdle(page);
    const l = await tapInstalled(page, uid);
    expect(targetOf(l, 'activate')).toMatchObject({ label: 'Take 2 credits · 1 click', lit: false, reject: 'no_clicks', note: 'No clicks left' });
    await shot(page, 's07-3-armitage-no-clicks');
  });

  test('taking the last 2 credits sends Armitage to the Heap', async ({ page }) => {
    test.setTimeout(60_000);
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'runner_armitage');
    const uid = plan.info['uid']!;
    for (let g = 0; g < 20; g++) {
      const v = await getView(page);
      const hosted = v.rig.find((c) => c.uid === uid)!.hostedCredits;
      if (hosted <= 2 && v.viewer === 'runner' && v.players.runner.clicks > 0) break;
      if (v.viewer === 'runner' && v.players.runner.clicks > 0) await ok(page, { type: 'activate', player: 'runner', uid, ability: 0 });
      else await passTurn(page);
    }
    let l = await waitIdle(page);
    expect(installedIn(l, uid).hosted?.text).toBe('2');
    const heap = (await getView(page)).players.runner.discardCount;
    l = await tapInstalled(page, uid);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, targetOf(l, 'activate').box);
    l = await waitIdle(page);
    expect(l.rig.some((c) => c.uid === uid)).toBe(false);
    const v = await getView(page);
    expect(v.players.runner.discardCount).toBe(heap + 1);
    expect(v.players.runner.discard).toContain('r02');
    expect((await anims(page)).some((a) => a.kind === 'rig_trash_flight')).toBe(true);
  });

  test('Akamatsu Mem Chip makes the memory counter read …/5', async ({ page }) => {
    await openBoard(page, 1); // seed 1: the Runner opens with Akamatsu Mem Chip
    await toRunnerTurn(page);
    expect((await layout(page)).memory.text).toMatch(/\/4$/);
    const l = await pickCard(page, 'Akamatsu Mem Chip');
    await tap(page, targetOf(l, 'install').box);
    const after = await waitIdle(page);
    expect(after.memory.limit).toBe(5);
    expect(after.memory.text).toMatch(/\/5$/);
    await shot(page, 's07-3-memory-5');
  });
});

test.describe('S-07-4 Cyberfeeder and Bank Job', () => {
  test('Cyberfeeder pays for breaking Ice Wall with no credits of his own; the button says so; the credit is back next turn', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'runner_cyberfeeder_ice_wall');
    const cf = plan.info['cyberfeederUid']!;
    let l = await waitIdle(page);
    expect(installedIn(l, cf).hosted?.text).toBe('1');
    expect((await getView(page)).players.runner.credits).toBe(0);
    const brk = runButtonOf(l, /Cyberfeeder pays/);
    expect(brk.label).toBe('Break "End the run" · Cyberfeeder pays');
    expect(brk.lit).toBe(true);
    await shot(page, 's07-4-cyberfeeder-pays');
    await tap(page, brk.box);
    l = await waitIdle(page);
    expect(installedIn(l, cf).hosted).toBeNull();
    expect(l.run!.subroutines.every((s) => s.broken)).toBe(true);
    expect((await getView(page)).players.runner.credits).toBe(0);
    // Finish the run any way, then back to the Runner's next turn: 1 credit again.
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
    expect(installedIn(l, cf).hosted?.text).toBe('1');
  });

  test('Bank Job shows 8; a run on a remote offers "Take 8 credits from Bank Job" or "Access cards"; taking gives 8 and accesses nothing', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'runner_bank_job_remote');
    const bj = plan.info['bankJobUid']!;
    let l = await waitIdle(page);
    expect(installedIn(l, bj).hosted?.text).toBe('8');
    l = await startRun(page, plan.info['server']!);
    expect(l.run!.step).toBe('success');
    expect(l.run!.buttons.map((b) => b.label)).toEqual(['Take 8 credits from Bank Job', 'Access cards']);
    await shot(page, 's07-4-bank-job-choice');
    const credits = (await getView(page)).players.runner.credits;
    await page.evaluate(() => window.__overclock!.clearAnims());
    const m = await measureTap(page, runButtonOf(l, 'Take 8 credits from Bank Job').box);
    expect(m.events.some((e) => e.type === 'card_accessed')).toBe(false);
    expect(m.view.players.runner.credits).toBe(credits + 8);
    expect(m.view.run).toBeNull();
    l = await waitIdle(page);
    expect(l.rig.some((c) => c.uid === bj)).toBe(false);
    expect((await getView(page)).players.runner.discard).toContain('r10');
    expect((await anims(page)).filter((a) => a.kind === 'notice').map((a) => a.text)).toContain('Bank Job: +8 credits, nothing accessed');
  });

  test('"Access cards" accesses as usual; a run on HQ never offers Bank Job', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'runner_bank_job_remote');
    let l = await startRun(page, plan.info['server']!);
    await tap(page, runButtonOf(l, 'Access cards').box);
    l = await waitIdle(page);
    expect(l.run?.step).toBe('access');
    // Back out of the access, then run on HQ.
    for (let g = 0; g < 5 && (await getView(page)).run; g++) {
      const run = (await layout(page)).run!;
      await tap(page, (run.buttons.find((b) => /^(Leave it|Done|Steal)$/.test(b.label)) ?? run.buttons[0]!).box);
      await waitIdle(page);
    }
    if ((await getView(page)).players.runner.clicks === 0) return;
    l = await startRun(page, 'hq');
    for (let g = 0; g < 8 && l.run; g++) {
      expect(l.run.buttons.some((b) => b.label.includes('Bank Job'))).toBe(false);
      expect(l.run.step).not.toBe('success');
      if (l.run.step === 'access') break;
      const b = l.run.buttons.find((x) => x.lit && /^(Don't rez|Continue|Let it)/.test(x.label)) ?? l.run.buttons.find((x) => x.lit)!;
      await tap(page, b.box);
      l = await waitIdle(page);
    }
  });
});

test.describe('S-07-5 Ice Wall can be advanced', () => {
  test('tapping Ice Wall shows "Advance · 1 credit"; 2 counters make it strength 3 against Corroder', async ({ page }) => {
    test.setTimeout(60_000);
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'corp_ice_wall');
    const uid = plan.info['uid']!;
    const server = plan.info['server']!;
    let l = await tapInstalled(page, uid);
    const adv = targetOf(l, 'advance');
    expect(adv).toMatchObject({ label: 'Advance · 1 credit', lit: true, uid });
    await tap(page, adv.box);
    l = await waitIdle(page);
    expect(installedIn(l, uid).counter).toBe('1');
    // Still picked: a second tap advances again.
    await tap(page, targetOf(l, 'advance').box);
    l = await waitIdle(page);
    expect(installedIn(l, uid).counter).toBe('2');
    await shot(page, 's07-5-ice-wall-2-counters');
    // The Runner runs there; the Corp rezzes; strength 3.
    await passTurn(page);
    l = await startRun(page, server);
    expect(l.run).toMatchObject({ step: 'approach', deciding: 'corp' });
    await tap(page, runButtonOf(l, /^Rez Ice Wall/).box);
    l = await waitIdle(page);
    expect(l.run).toMatchObject({ step: 'encounter' });
    expect(l.run!.lines).toContain('Strength 3');
    expect(installedIn(l, uid).counter).toBe('2');
    // Corroder (strength 2) must pump before it can break: Break is dimmed (too weak).
    const brk = runButtonOf(l, /^Break/);
    expect(brk.lit).toBe(false);
    expect(brk.reject).toBe('too_weak');
    expect(l.run!.buttons.some((b) => /^\+1 strength/.test(b.label))).toBe(true);
    await shot(page, 's07-5-ice-wall-strength-3');
  });

  test('tapping other ICE shows no Advance', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'corp_ice_wall');
    const l0 = await layout(page);
    const others = l0.servers.flatMap((s) => s.ice).filter((c) => c.uid !== plan.info['uid'] && c.cardId !== 'c05');
    for (const c of others) {
      await tap(page, c.box);
      const l = await layout(page);
      expect(l.targets.filter((t) => t.kind === 'advance')).toEqual([]);
    }
  });
});
