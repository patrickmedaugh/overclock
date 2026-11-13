// S-04-4: agendas' "when scored" bonuses on screen. Every step is a real tap;
// the game is set up through the test hook with @overclock/match/testing plans.
// AC4 (a stolen agenda gives no bonus) is an engine rule, tested in packages/engine;
// here: no bad-publicity mark shows before the Corp scores Hostile Takeover.
import { type Page, expect, test } from '@playwright/test';
import { type LayoutSnapshot, anims, dispatch, expectCleanLayout, getView, layout, openBoard, runButtonOf, startRun, tap, targetOf, toStep, waitIdle } from './helpers';

const SEED = 1;

/** Taps the installed agenda `uid`, then Score. */
async function scoreAgenda(page: Page, uid: string): Promise<LayoutSnapshot> {
  let l = await layout(page);
  const card = l.servers.flatMap((s) => s.content).find((c) => c.uid === uid);
  expect(card, `agenda ${uid} on the table`).toBeDefined();
  await tap(page, card!.box);
  l = await layout(page);
  await page.evaluate(() => window.__overclock!.clearAnims());
  await tap(page, targetOf(l, 'score').box);
  return waitIdle(page);
}

/**
 * The note sits by the credits: touching or nearly (sideways: above the rail pill or left of the
 * header chip), or in the same row as the pills (the desktop column: right of the clicks pill).
 */
function byCredits(tag: { x: number; y: number; width: number; height: number }, credits: typeof tag): boolean {
  const cy = tag.y + tag.height / 2;
  return gap(tag, credits) < 20 || (cy > credits.y && cy < credits.y + credits.height && gap(tag, credits) < 2 * credits.width + 40);
}

/** Distance between two boxes' nearest edges (0 when touching or overlapping). */
function gap(a: { x: number; y: number; width: number; height: number }, b: typeof a): number {
  const dx = Math.max(0, b.x - (a.x + a.width), a.x - (b.x + b.width));
  const dy = Math.max(0, b.y - (a.y + a.height), a.y - (b.y + b.height));
  return Math.hypot(dx, dy);
}

test.describe('S-04-4 Hostile Takeover: +7 credits and bad publicity', () => {
  test('scoring it gives the Corp 7 credits and shows "Bad publicity 1" by the Corp\'s credits, on both turns', async ({ page }) => {
    await openBoard(page, SEED);
    const plan = await toStep(page, SEED, 'corp_score_hostile_takeover');
    const before = await getView(page);
    expect(before.badPublicity).toBe(0);
    expect((await layout(page)).tags.corp).toBeNull();

    const l = await scoreAgenda(page, plan.info['uid']!);
    const v = await getView(page);
    expect(v.players.corp.credits).toBe(before.players.corp.credits + 7);
    expect(l.text.corpCredits).toBe(String(v.players.corp.credits));
    expect(v.badPublicity).toBe(1);
    expect(l.tags.corp?.text).toBe('Bad publicity 1');
    // By the Corp's credits.
    expect(byCredits(l.tags.corp!.box, l.corp.credits)).toBe(true);
    expectCleanLayout(l);
    // Animated on the fx queue, within budget.
    const a = await anims(page);
    const pop = a.find((r) => r.kind === 'tag_pop');
    expect(pop?.text).toBe('Bad publicity 1');
    expect(pop!.scheduledMs).toBeLessThanOrEqual(300);
    expect(a.some((r) => r.kind === 'notice' && /Corp takes 1 bad publicity/.test(r.text ?? ''))).toBe(true);
    await test.info().attach('bad-publicity', { body: await page.screenshot(), contentType: 'image/png' });

    // The Runner's turn: the mark stays by the Corp's credits at the top.
    await dispatch(page, { type: 'end_turn', player: 'corp' });
    const w = await getView(page);
    if (w.pendingDiscard > 0) await dispatch(page, { type: 'discard', player: 'corp', handIndices: Array.from({ length: w.pendingDiscard }, (_, i) => i) });
    const r = await waitIdle(page);
    expect(r.viewer).toBe('runner');
    expect(r.tags.corp?.text).toBe('Bad publicity 1');
    expect(byCredits(r.tags.corp!.box, r.corp.credits)).toBe(true);
    expect(r.tags.runner).toBeNull();
    expectCleanLayout(r);
  });
});

test.describe('S-04-4 bad publicity: the Runner\'s run-only credits', () => {
  test('a run shows "+1 for this run" (never added to the credits); it is spent first and gone when the run ends', async ({ page }) => {
    await openBoard(page, SEED);
    const plan = await toStep(page, SEED, 'runner_run_with_bad_publicity');
    const bp = Number(plan.info['badPublicity']);
    expect(bp).toBeGreaterThan(0);
    const credits = (await getView(page)).players.runner.credits;
    expect((await layout(page)).tags.runner).toBeNull();

    await page.evaluate(() => window.__overclock!.clearAnims());
    let l = await startRun(page, plan.info['server']!);
    const v = await getView(page);
    expect(v.run?.tempCredits).toBe(bp);
    expect(l.tags.runner?.text).toBe(`+${bp} for this run`);
    expect(byCredits(l.tags.runner!.box, l.runner.credits)).toBe(true);
    // The credits pill shows the Runner's own credits only.
    expect(l.text.runnerCredits).toBe(String(credits));
    expectCleanLayout(l);
    const a = await anims(page);
    expect(a.some((r) => r.kind === 'tag_pop' && r.text === `+${bp} for this run` && r.scheduledMs <= 300)).toBe(true);
    await test.info().attach('run-only-credits', { body: await page.screenshot(), contentType: 'image/png' });

    // Trash the accessed card when it costs money: run-only credits pay first.
    const trash = l.run?.buttons.find((b) => /^Trash · (\d+) credit/.test(b.label) && b.lit);
    if (trash) {
      const cost = Number(/(\d+) credit/.exec(trash.label)![1]);
      await tap(page, trash.box);
      l = await waitIdle(page);
      const after = await getView(page);
      expect(after.players.runner.credits).toBe(credits - Math.max(0, cost - bp));
    } else {
      await tap(page, runButtonOf(l, /Leave it|Done|Jack out/).box);
      l = await waitIdle(page);
      expect((await getView(page)).players.runner.credits).toBe(credits);
    }
    // The run is over: the left-over run-only credits are gone, never added to the credits.
    expect((await getView(page)).run).toBeNull();
    expect(l.tags.runner).toBeNull();
    expect(l.text.runnerCredits).toBe(String((await getView(page)).players.runner.credits));
    expect(l.tags.corp?.text).toBe(`Bad publicity ${bp}`);
  });
});

test.describe('S-04-4 Priority Requisition: rez one ICE for free, or Skip', () => {
  async function toChoice(page: Page) {
    await openBoard(page, SEED);
    const plan = await toStep(page, SEED, 'corp_score_priority_requisition');
    const before = await getView(page);
    const l = await scoreAgenda(page, plan.info['uid']!);
    const v = await getView(page);
    expect(v.choice?.kind).toBe('free_rez');
    return { plan, before, l, v };
  }

  test('scoring it lights the face-down ICE and shows Skip and the hint; nothing else can be done meanwhile', async ({ page }) => {
    const { plan, l, v } = await toChoice(page);
    const offered = v.choice!.options.flatMap((o) => (o.action.type === 'rez' ? [o.action.uid] : []));
    expect(offered).toContain(plan.info['iceUid']);
    const lit = l.targets.filter((t) => t.kind === 'free_rez');
    expect(lit.map((t) => t.uid).sort()).toEqual([...offered].sort());
    for (const t of lit) {
      expect(t.lit).toBe(true);
      const ice = l.servers.flatMap((s) => s.ice).find((c) => c.uid === t.uid)!;
      expect(t.box).toEqual(ice.box);
      expect(ice.faceUp).toBe(false);
    }
    const skip = targetOf(l, 'skip');
    expect(skip.label).toBe('Skip');
    expect(skip.lit).toBe(true);
    // Only the choice shows.
    expect(l.targets.every((t) => t.kind === 'free_rez' || t.kind === 'skip')).toBe(true);
    expect(l.runButton).toBeNull();
    expect(l.text.help).toContain('Priority Requisition: rez one ICE for free');
    expectCleanLayout(l);
    expect((await anims(page)).some((r) => r.kind === 'choice_open' && r.scheduledMs <= 300)).toBe(true);
    await test.info().attach('free-rez-choice', { body: await page.screenshot(), contentType: 'image/png' });

    // A hand card or R&D does nothing but say what to do.
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, l.hand[0]!.box);
    await tap(page, l.corp.deck);
    await page.waitForTimeout(150);
    expect(await getView(page)).toEqual(v);
    expect((await anims(page)).filter((r) => r.kind === 'hint').map((r) => r.text)).toContain('Rez one ICE for free, or tap Skip');
  });

  test('tapping a lit ICE flips it face up for free and the turn goes on', async ({ page }) => {
    const { plan, v } = await toChoice(page);
    const credits = v.players.corp.credits;
    const l = await layout(page);
    const t = l.targets.find((x) => x.kind === 'free_rez' && x.uid === plan.info['iceUid'])!;
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, t.box);
    const after = await waitIdle(page);
    const w = await getView(page);
    expect(w.choice).toBeNull();
    expect(w.phase).toBe('action');
    expect(w.players.corp.credits).toBe(credits);
    expect(after.text.corpCredits).toBe(String(credits));
    const ice = after.servers.flatMap((s) => s.ice).find((c) => c.uid === t.uid)!;
    expect(ice.faceUp).toBe(true);
    expect(ice.cardId).not.toBeNull();
    expect(after.targets).toEqual([]);
    const a = await anims(page);
    expect(a.some((r) => r.kind === 'ice_rez')).toBe(true);
    expect(a.some((r) => r.kind === 'notice' && /rezzed for free/.test(r.text ?? ''))).toBe(true);
    expectCleanLayout(after);
  });

  test('Skip closes the choice: no ICE flips, nothing is spent', async ({ page }) => {
    const { v } = await toChoice(page);
    const l = await layout(page);
    const faceDown = l.servers.flatMap((s) => s.ice).filter((c) => !c.faceUp).map((c) => c.uid);
    await tap(page, targetOf(l, 'skip').box);
    const after = await waitIdle(page);
    const w = await getView(page);
    expect(w.choice).toBeNull();
    expect(w.players.corp.credits).toBe(v.players.corp.credits);
    expect(after.servers.flatMap((s) => s.ice).filter((c) => !c.faceUp).map((c) => c.uid)).toEqual(faceDown);
    expect(after.targets).toEqual([]);
    expect(after.text.help).not.toContain('rez one ICE for free');
    // The Corp's turn goes on (End turn works again).
    expect(w.phase).toBe('action');
    expect(after.endTurn?.enabled).toBe(true);
  });
});
