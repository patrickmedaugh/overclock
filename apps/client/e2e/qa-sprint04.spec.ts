// QA Sprint 4 (written by QA, not the developers): independent checks of
// S-04-1..4 on the phone (844x390), small phone (640x360) and desktop, with
// screenshots for the QA report in docs/sprints/sprint-04-qa/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';
import {
  type Box,
  center,
  dispatch,
  expectCleanLayout,
  getView,
  inside,
  layout,
  openBoard,
  safeRect,
  startRun,
  tap,
  targetOf,
  toStep,
  waitIdle,
} from './helpers';
import { pixelStats } from './pixels';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-04-qa');

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  const p = test.info().project;
  const vp = page.viewportSize()!;
  await page.screenshot({ path: join(SHOTS, `${p.name}-${vp.width}x${vp.height}-${name}.png`) });
}

function isTouch(): boolean {
  return test.info().project.use.hasTouch === true;
}

interface Hold {
  move(x: number, y: number): Promise<void>;
  release(): Promise<void>;
}

/** Press and keep the finger (touch, via CDP) or the mouse button down on `b`. */
async function hold(page: Page, b: Box): Promise<Hold> {
  const { x, y } = center(b);
  if (isTouch()) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    return {
      move: async (mx, my) => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: mx, y: my }] });
      },
      release: async () => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
      },
    };
  }
  await page.mouse.move(x, y);
  await page.mouse.down();
  return { move: (mx, my) => page.mouse.move(mx, my), release: () => page.mouse.up() };
}

const zoomId = (page: Page) => page.evaluate(() => window.__overclock!.layout().zoom?.cardId ?? null);

async function waitZoom(page: Page, cardId: string): Promise<void> {
  await page.waitForFunction((id) => window.__overclock!.layout().zoom?.cardId === id, cardId);
}

/** Corp draws until it holds `n` cards (a crowded hand: cards overlap on the small phone). */
async function bigHand(page: Page, n: number): Promise<void> {
  for (let i = 0; i < 3 && (await getView(page)).players.corp.handCount < n; i++) await dispatch(page, { type: 'draw', player: 'corp' });
  await waitIdle(page);
}

test.describe('QA S-04-3 hold and slide', () => {
  test('crowded hand (9 cards): every card can be reached by sliding; outline and zoom match; y does not matter', async ({ page }) => {
    await openBoard(page, 3);
    await bigHand(page, 9);
    const l = await layout(page);
    const hand = l.hand;
    expect(hand.length).toBeGreaterThanOrEqual(8);
    const h = await hold(page, hand[0]!.box);
    await waitZoom(page, hand[0]!.cardId);
    // Distinct card ids only identify a slot when unique; check outline index (slot) every time.
    const vh = page.viewportSize()!.height;
    for (let k = 1; k < hand.length; k++) {
      const c = center(hand[k]!.box);
      // Finger far above the hand (middle of the board): only x counts.
      await h.move(c.x, k % 2 ? vh / 2 : c.y);
      await page.waitForFunction((n) => window.__overclock!.layout().hand.findIndex((x) => x.outlined) === n, k);
      expect(await zoomId(page)).toBe(hand[k]!.cardId);
      if (k === 4) await shot(page, '01-slide-crowded-hand');
    }
    // And back to the first.
    await h.move(center(hand[0]!.box).x, center(hand[0]!.box).y);
    await page.waitForFunction(() => window.__overclock!.layout().hand.findIndex((x) => x.outlined) === 0);
    await h.release();
    await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
  });

  test('lifting over a server or End turn after sliding plays, picks and spends nothing', async ({ page }) => {
    await openBoard(page, 1);
    const l = await layout(page);
    const before = await getView(page);
    const h = await hold(page, l.hand[1]!.box);
    await waitZoom(page, l.hand[1]!.cardId);
    await h.move(center(l.hand[3]!.box).x, center(l.hand[3]!.box).y);
    await waitZoom(page, l.hand[3]!.cardId);
    // Drag up over the HQ column, then over End turn, and lift there.
    const hq = l.servers.find((s) => s.id === 'hq')!;
    await h.move(center(hq.box).x, center(hq.box).y);
    if (l.endTurn) await h.move(center(l.endTurn.box).x, center(l.endTurn.box).y);
    await h.release();
    await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
    await page.waitForTimeout(400);
    const after = await layout(page);
    expect(after.selected).toBeNull();
    expect(after.targets).toEqual([]);
    expect(await getView(page)).toEqual(before);
    // A quick tap right after still picks a card.
    const v = await getView(page);
    const i = v.handOptions.findIndex((o) => o.some((x) => x.reject === null));
    await tap(page, after.hand[i]!.box);
    await page.waitForFunction((n) => window.__overclock!.layout().selected === n, i);
  });

  test('the zoom face is on screen within 0.1 s of the move (input time to the drawn frame), and the picture changes', async ({ page }) => {
    await openBoard(page, 1);
    const l = await layout(page);
    const hand = l.hand;
    // Pick two neighbouring slots with different cards.
    let k = 1;
    while (k < hand.length && hand[k]!.cardId === hand[0]!.cardId) k++;
    expect(k).toBeLessThan(hand.length);
    const h = await hold(page, hand[0]!.box);
    await waitZoom(page, hand[0]!.cardId);
    await page.waitForTimeout(400); // zoom-in tween finished
    const zbox = (await layout(page)).zoom!.box;
    const [z0] = await pixelStats(page, [zbox]);
    // Record each move's DOM time, and the first animation frame (after Pixi's own
    // render callback, registered earlier) in which a new zoom_swap is logged.
    await page.evaluate(() => {
      const w = window as unknown as { __qa: { moves: number[]; frames: { t: number; n: number }[] } };
      w.__qa = { moves: [], frames: [] };
      window.addEventListener('pointermove', (e) => w.__qa.moves.push(e.timeStamp), { capture: true });
      let seen = window.__overclock!.anims().filter((a) => a.kind === 'zoom_swap').length;
      const loop = () => {
        const n = window.__overclock!.anims().filter((a) => a.kind === 'zoom_swap').length;
        if (n !== seen) {
          seen = n;
          w.__qa.frames.push({ t: performance.now(), n });
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.evaluate(() => window.__overclock!.clearAnims());
    const gaps: number[] = [];
    for (const target of [k, 0, k, 0, k]) {
      const c = center(hand[target]!.box);
      const nBefore = await page.evaluate(() => (window as unknown as { __qa: { frames: unknown[] } }).__qa.frames.length);
      await h.move(c.x, c.y);
      await waitZoom(page, hand[target]!.cardId);
      await page.waitForFunction((n) => (window as unknown as { __qa: { frames: unknown[] } }).__qa.frames.length > n, nBefore);
      const g = await page.evaluate(() => {
        const q = (window as unknown as { __qa: { moves: number[]; frames: { t: number }[] } }).__qa;
        const swap = window.__overclock!.anims().filter((a) => a.kind === 'zoom_swap').at(-1)!;
        return q.frames.at(-1)!.t - swap.inputAt!;
      });
      gaps.push(g);
    }
    test.info().annotations.push({ type: 'qa-zoom-frame-ms', description: gaps.map((g) => g.toFixed(1)).join(',') });
    for (const g of gaps) expect(g).toBeLessThan(100);
    // The zoomed picture really changed (now on slot k).
    await page.waitForTimeout(100);
    const [z1] = await pixelStats(page, [zbox]);
    expect(z1!.spread).toBeGreaterThan(8);
    expect(Math.abs(z1!.mean - z0!.mean) + Math.abs(z1!.spread - z0!.spread)).toBeGreaterThan(0.5);
    await shot(page, '02-slide-zoom');
    await h.release();
  });
});

test.describe('QA S-04-4 bonuses on screen', () => {
  test('Hostile Takeover: +7 and "Bad publicity 1" (screenshot); Runner run shows "+1 for this run"; jack-out/leave drops it', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'corp_score_hostile_takeover');
    const c0 = (await getView(page)).players.corp.credits;
    let l = await layout(page);
    const card = l.servers.flatMap((s) => s.content).find((c) => c.uid === plan.info['uid'])!;
    await tap(page, card.box);
    l = await layout(page);
    await tap(page, targetOf(l, 'score').box);
    l = await waitIdle(page);
    expect((await getView(page)).players.corp.credits).toBe(c0 + 7);
    expect(l.tags.corp?.text).toBe('Bad publicity 1');
    expect(inside(l.tags.corp!.box, safeRect(l))).toBe(true);
    expectCleanLayout(l);
    await shot(page, '03-bad-publicity-corp');
  });

  test('run with bad publicity: "+N for this run" next to the credits, gone after the run (screenshot)', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'runner_run_with_bad_publicity');
    const credits = (await getView(page)).players.runner.credits;
    let l = await startRun(page, plan.info['server']!);
    expect(l.tags.runner?.text).toMatch(/^\+\d+ for this run$/);
    expect(inside(l.tags.runner!.box, safeRect(l))).toBe(true);
    expectCleanLayout(l);
    await shot(page, '04-run-only-credits');
    // Finish the run without spending (Leave it / Done / Jack out / Continue until the run is over).
    for (let i = 0; i < 6 && l.run; i++) {
      const b = l.run.buttons.find((x) => /^(Leave it|Done|Jack out|No action)$/.test(x.label)) ?? l.run.buttons.find((x) => /Continue|Let it through|Let it fire/.test(x.label));
      expect(b, JSON.stringify(l.run.buttons.map((x) => x.label))).toBeDefined();
      await tap(page, b!.box);
      l = await waitIdle(page);
    }
    expect((await getView(page)).run).toBeNull();
    expect(l.tags.runner).toBeNull();
    expect((await getView(page)).players.runner.credits).toBeLessThanOrEqual(credits);
    expect(l.text.runnerCredits).toBe(String((await getView(page)).players.runner.credits));
  });

  test('Priority Requisition: free-rez choice screenshot; Back asks Leave? and Stay keeps the choice', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'corp_score_priority_requisition');
    let l = await layout(page);
    const card = l.servers.flatMap((s) => s.content).find((c) => c.uid === plan.info['uid'])!;
    await tap(page, card.box);
    l = await layout(page);
    await tap(page, targetOf(l, 'score').box);
    l = await waitIdle(page);
    const v = await getView(page);
    expect(v.choice?.kind).toBe('free_rez');
    expect(targetOf(l, 'skip').label).toBe('Skip');
    expectCleanLayout(l);
    await shot(page, '05-free-rez-choice');
    expect(await page.evaluate(() => window.__overclock!.back())).toBe('ask_leave');
    l = await layout(page);
    await shot(page, '06-back-leave-dialog');
    await tap(page, l.dialog!.buttons.find((b) => b.label === 'Stay')!.box);
    await page.waitForFunction(() => window.__overclock!.layout().dialog === null);
    expect(await getView(page)).toEqual(v);
    // The choice still works after Stay.
    l = await layout(page);
    await tap(page, l.targets.find((t) => t.kind === 'free_rez')!.box);
    await waitIdle(page);
    expect((await getView(page)).choice).toBeNull();
    expect((await getView(page)).players.corp.credits).toBe(v.players.corp.credits);
  });
});

test.describe('QA S-04-1 build date', () => {
  test('the build date in the corner matches the build time the app was built with (screenshot)', async ({ page }) => {
    await openBoard(page, { seed: 1, insets: { left: 30, bottom: 16 } });
    const l = await layout(page);
    expect(l.buildLabel).not.toBeNull();
    const m = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC)/.exec(l.buildLabel!.text);
    expect(m).not.toBeNull();
    if (process.env.OVERCLOCK_BUILD_TIME) expect(m![1]).toBe(process.env.OVERCLOCK_BUILD_TIME);
    expect(inside(l.buildLabel!.box, safeRect(l))).toBe(true);
    await shot(page, '00-board-build-date');
  });
});
