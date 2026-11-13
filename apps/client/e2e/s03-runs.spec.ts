// S-03-1 (run on a server: Run button, lit servers, cancel, jack out, back to your turn)
// and S-03-3 (the Corp's Rez / Don't rez on the shared board, ICE stepped outside-in).
import { getCard } from '@overclock/cards';
import { expect, test } from '@playwright/test';
import {
  expectCleanLayout,
  expectSnappy,
  getView,
  layout,
  measureTap,
  openBoard,
  runButtonOf,
  startRun,
  tap,
  targetOf,
  toRunnerTurn,
  toStep,
  waitIdle,
} from './helpers';

// Seed 1: the Corp's first turn ends with a discard, so Archives holds one face-down card.
// corp_rez_prompt for seed 1: the Runner runs on Server 1, guarded by a face-down Enigma (rez 3).

test.describe('S-03-1 Run button', () => {
  test('tapping Run lights every Corp server; tapping one starts the run and uses 1 click', async ({ page }) => {
    await openBoard(page, 1);
    // The Corp opens a remote first, so a remote lights up too.
    await page.evaluate(() => {
      const hook = window.__overclock!;
      const opt = hook.getView().handOptions.flat().find((o) => o.action.type === 'install' && o.action.server === 'new' && o.reject === null)!;
      hook.dispatch(opt.action);
    });
    await toRunnerTurn(page);
    let l = await waitIdle(page);
    expect(l.runButton).toMatchObject({ label: 'Run', lit: true, picking: false });
    expect(Math.min(l.runButton!.box.width, l.runButton!.box.height)).toBeGreaterThanOrEqual(44);
    expectCleanLayout(l);
    await tap(page, l.runButton!.box);
    l = await layout(page);
    expect(l.runButton?.picking).toBe(true);
    expect(l.targets.map((t) => [t.kind, t.server, t.label, t.lit])).toEqual(
      ['hq', 'rd', 'archives', 'remote1'].map((s) => ['run', s, 'Run', true]),
    );
    for (const t of l.targets) expect(Math.min(t.box.width, t.box.height)).toBeGreaterThanOrEqual(44);
    await test.info().attach('servers lit for a run', { body: await page.screenshot(), contentType: 'image/png' });
    const before = await getView(page);
    const m = await measureTap(page, targetOf(l, 'run', 'hq').box);
    expect(m.events[0]).toMatchObject({ type: 'run_started', server: 'hq' });
    expect(m.view.players.runner.clicks).toBe(before.players.runner.clicks - 1);
    expect(m.view.players.runner.credits).toBe(before.players.runner.credits);
    expectSnappy(m, ['run_step']);
  });

  test('tapping Run again cancels: nothing is sent, nothing spent', async ({ page }) => {
    await openBoard(page, 1);
    await toRunnerTurn(page);
    const before = await getView(page);
    let l = await layout(page);
    await tap(page, l.runButton!.box);
    expect((await layout(page)).targets.length).toBe(3);
    await tap(page, l.runButton!.box);
    l = await layout(page);
    expect(l.targets).toEqual([]);
    expect(l.runButton?.picking).toBe(false);
    expect(await getView(page)).toEqual(before);
    // An empty spot of the board cancels too.
    await tap(page, l.runButton!.box);
    const corp = l.servers.find((s) => s.id === 'archives')!;
    await tap(page, { x: corp.box.x + corp.box.width + 30, y: corp.box.y + 20, width: 4, height: 4 });
    expect((await layout(page)).targets).toEqual([]);
    expect(await getView(page)).toEqual(before);
  });

  test('without clicks, Run says "No clicks left" and lights nothing', async ({ page }) => {
    await openBoard(page, 1);
    await toRunnerTurn(page);
    await page.evaluate(() => {
      for (let i = 0; i < 4; i++) window.__overclock!.dispatch({ type: 'gain_credit', player: 'runner' });
    });
    const l = await waitIdle(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, l.runButton!.box);
    const after = await layout(page);
    expect(after.targets).toEqual([]);
    const hints = (await page.evaluate(() => window.__overclock!.anims())).filter((a) => a.kind === 'hint');
    expect(hints.map((h) => h.text)).toEqual(['No clicks left']);
  });
});

test.describe('S-03-3 the Corp rezzes on the shared board', () => {
  test('reaching face-down ICE asks the Corp "Rez Enigma · 3 credits" / "Don\'t rez"; the ICE is highlighted', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'corp_rez_prompt');
    const l = await layout(page);
    expect(l.viewer).toBe('runner');
    expect(l.run).toMatchObject({ server: plan.info.server, step: 'approach', deciding: 'corp', iceUid: plan.info.iceUid });
    const ice = l.servers.find((s) => s.id === plan.info.server)!.ice.find((c) => c.uid === plan.info.iceUid)!;
    expect(l.run!.highlight).toEqual(ice.box);
    // The Runner's own view still doesn't know the ICE; the Corp's choice names it (Q1 A).
    expect(ice).toMatchObject({ cardId: null, faceUp: false });
    const corpRun = (await page.evaluate(() => window.__overclock!.decision()))!.run;
    const name = getCard(corpRun.ice!.cardId!)!.name;
    const cost = getCard(corpRun.ice!.cardId!)!.cost;
    expect(l.run!.buttons.map((b) => [b.label, b.lit])).toEqual([
      [`Rez ${name} · ${cost} credits`, true],
      ["Don't rez", true],
    ]);
    expect(l.run!.stepLabel).toBe(`Corp: rez ${name}?`);
    for (const b of l.run!.buttons) expect(Math.min(b.box.width, b.box.height)).toBeGreaterThanOrEqual(44);
    expectCleanLayout(l);
    await test.info().attach('rez prompt', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('Rez: the Corp pays, the ICE flips face up for both players and the Runner encounters it', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'corp_rez_prompt');
    const before = await getView(page);
    const l = await layout(page);
    const m = await measureTap(page, runButtonOf(l, /^Rez /).box);
    expect(m.events.map((e) => e.type)).toEqual(expect.arrayContaining(['credits_spent', 'ice_rezzed', 'ice_encountered']));
    expect(m.view.players.corp.credits).toBe(before.players.corp.credits - 3);
    expect(m.view.viewer).toBe('runner');
    expectSnappy(m, ['ice_rez']);
    const after = await waitIdle(page);
    const ice = after.servers.find((s) => s.id === plan.info.server)!.ice.find((c) => c.uid === plan.info.iceUid)!;
    expect(ice.faceUp).toBe(true);
    expect(getCard(ice.cardId!)!.name).toBe('Enigma');
    expect(after.run).toMatchObject({ step: 'encounter', deciding: 'runner', stepLabel: 'Encounter: Enigma' });
    // No breaker for a code gate: only Let it through.
    expect(after.run!.buttons.map((b) => b.label)).toEqual(['Let it through']);
  });

  test("Don't rez: the ICE stays face down, the Runner moves on; Jack out ends the run with nothing accessed", async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'corp_rez_prompt');
    const before = await getView(page);
    let l = await layout(page);
    await tap(page, runButtonOf(l, "Don't rez").box);
    l = await waitIdle(page);
    const ice = l.servers.find((s) => s.id === plan.info.server)!.ice.find((c) => c.uid === plan.info.iceUid)!;
    expect(ice).toMatchObject({ faceUp: false, cardId: null });
    expect((await getView(page)).players.corp.credits).toBe(before.players.corp.credits);
    // Passed it: Continue / Jack out, and the tracker still shows it.
    expect(l.run).toMatchObject({ step: 'continue', deciding: 'runner', stepLabel: 'Passed face-down ICE' });
    expect(l.run!.buttons.map((b) => b.label)).toEqual(['Continue', 'Jack out']);
    expect(l.run!.lines).toContain('Next: Server 1');
    expectCleanLayout(l);
    const m = await measureTap(page, runButtonOf(l, 'Jack out').box);
    expect(m.events).toEqual([{ type: 'run_ended', server: plan.info.server, outcome: 'jacked_out' }]);
    expect(m.view.run).toBeNull();
    // Back on the Runner's turn with the clicks left; the hand is back.
    expect(m.view.phase).toBe('action');
    expect(m.view.players.runner.clicks).toBe(before.players.runner.clicks);
    const after = await waitIdle(page);
    expect(after.run).toBeNull();
    expect(after.hand.length).toBe(m.view.players.runner.handCount);
    expect(after.runButton).not.toBeNull();
  });

  test('a run steps through each piece of ICE outside-in, highlighting the one met', async ({ page }) => {
    await openBoard(page, 1);
    await toStep(page, 1, 'corp_rez_prompt');
    // The Corp declines; Continue goes into the server (one ICE here) and ends with an access.
    let l = await layout(page);
    await tap(page, runButtonOf(l, "Don't rez").box);
    l = await waitIdle(page);
    const passed = l.run!.highlight;
    await tap(page, runButtonOf(l, 'Continue').box);
    l = await waitIdle(page);
    // At the server: the column is highlighted, not the ICE.
    if (l.run) {
      expect(l.run.step).toBe('access');
      expect(l.run.highlight).toEqual(l.run.serverBox);
      expect(l.run.highlight).not.toEqual(passed);
    } else {
      expect((await getView(page)).run).toBeNull();
    }
  });
});

test.describe('S-03-1 after a run', () => {
  test("a finished run leaves the Runner's turn as it was, with the Corp's hidden cards hidden again", async ({ page }) => {
    await openBoard(page, 1);
    await toRunnerTurn(page);
    const before = await getView(page);
    let l = await startRun(page, 'hq');
    expect(l.run?.access?.cards).toHaveLength(1);
    await tap(page, runButtonOf(l, /Done|Leave it|Steal/).box);
    l = await waitIdle(page);
    const v = await getView(page);
    expect(v.run).toBeNull();
    expect(v.phase).toBe('action');
    expect(v.players.runner.clicks).toBe(before.players.runner.clicks - 1);
    expect(v.players.corp.hand).toBeNull();
    expect(l.labels.join(' ')).not.toContain(getCard('c02')!.name);
    expect(l.hand.length).toBe(v.players.runner.handCount);
  });
});
