// QA Sprint 5 (written by QA, not the developers): independent checks of
// S-05-1..3 on the phone (844x390), small phone (640x360) and desktop, with
// screenshots for the QA report in docs/sprints/sprint-05-qa/.
// The "QA timing" tests are the S-05-3 timing criterion; per docs/TESTING.md they
// are the only ones run repeated / at 6x CPU slow-down (E2E_CPU_THROTTLE=6).
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';
import {
  type LayoutSnapshot,
  center,
  getView,
  holdAt,
  inside,
  layout,
  openBoard,
  runButtonOf,
  safeRect,
  startRun,
  tap,
  toRunnerTurn,
  toStep,
  waitIdle,
  waitZoom,
} from './helpers';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-05-qa');

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  const p = test.info().project;
  const vp = page.viewportSize()!;
  await page.screenshot({ path: join(SHOTS, `${p.name}-${vp.width}x${vp.height}-${name}.png`) });
}

/** Hold `b`, check the zoom shows `cardId` readably (all text inside, big), lift, zoom gone. */
async function holdToRead(page: Page, b: { x: number; y: number; width: number; height: number }, cardId: string, name?: string): Promise<void> {
  const h = await holdAt(page, b);
  await waitZoom(page, cardId);
  await page.waitForTimeout(250);
  const z = (await layout(page)).zoom!;
  expect(z.textOverflow, `${cardId}: all text fits on the zoomed card`).toBe(false);
  expect(z.texts.length).toBeGreaterThan(2);
  const vh = page.viewportSize()!.height;
  // As big as a hand-card zoom: well over half the screen's height.
  expect(z.box.height).toBeGreaterThan(vh * 0.6);
  if (name) await shot(page, name);
  await h.release();
  await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
}

const labels = (l: LayoutSnapshot) => l.run?.buttons.map((b) => b.label) ?? [];

/** Finish the current access without taking anything (Leave it / Done / Steal as last resort). */
async function finishAccess(page: Page): Promise<void> {
  let l = await waitIdle(page);
  for (let i = 0; i < 6 && l.run; i++) {
    const b = l.run.buttons.find((x) => /^(Leave it|Done|No action|Jack out)$/.test(x.label)) ?? l.run.buttons.find((x) => /^(Steal|Continue)/.test(x.label));
    expect(b, JSON.stringify(labels(l))).toBeDefined();
    await tap(page, b!.box);
    l = await waitIdle(page);
  }
  expect(l.run).toBeNull();
}

test.describe('QA S-05-1 read the cards you find', () => {
  test('Archives access with several cards: hold each one to read it; lifting leaves the same buttons and changes nothing; Last run then lists them all', async ({ page }) => {
    test.setTimeout(90_000); // 2 x (up to 6) holds of 250 ms+ each: ~30 s on CI's slower runners
    await openBoard(page, 1);
    await toStep(page, 1, 'runner_at_access');
    let l = await waitIdle(page);
    expect(l.run?.step).toBe('access');
    const cards = l.run!.access!.cards;
    expect(cards.length).toBeGreaterThanOrEqual(2);
    const btns = labels(l);
    const before = await getView(page);
    for (const [i, c] of cards.entries()) {
      expect(c.cardId).not.toBeNull();
      await holdToRead(page, c.box, c.cardId!, i === 0 ? '01-access-hold-to-read' : undefined);
      await page.waitForTimeout(100);
      l = await layout(page);
      expect(labels(l), 'same choices after lifting').toEqual(btns);
      expect(await getView(page), 'a hold changes nothing').toEqual(before);
    }
    const found = cards.map((c) => c.cardId);
    await finishAccess(page);
    l = await waitIdle(page);
    expect(l.lastRun.button).not.toBeNull();
    await tap(page, l.lastRun.button!.box);
    l = await layout(page);
    expect(l.lastRun.strip!.cards.map((c) => c.cardId)).toEqual(found);
    for (const c of l.lastRun.strip!.cards) expect(inside(c.box, safeRect(l)), 'strip card on screen').toBe(true);
    await shot(page, '02-last-run-strip');
    for (const [i, c] of l.lastRun.strip!.cards.entries()) await holdToRead(page, c.box, c.cardId, i === 0 ? '03-last-run-hold' : undefined);
  });

  test('HQ run: a Corp hand card can be read at access and in Last run; a new run hides Last run; End turn removes it for good (Corp seat and the Runner\'s next turn)', async ({ page }) => {
    test.setTimeout(60_000);
    await openBoard(page, 1);
    await toRunnerTurn(page);
    let l = await startRun(page, 'hq');
    expect(l.run?.step).toBe('access');
    const hq = l.run!.access!.cards[0]!;
    await holdToRead(page, hq.box, hq.cardId!);
    await finishAccess(page);
    l = await waitIdle(page);
    expect((await getView(page)).lastRun!.cards.map((c) => c.cardId)).toEqual([hq.cardId]);
    await tap(page, l.lastRun.button!.box);
    l = await layout(page);
    await holdToRead(page, l.lastRun.strip!.cards[0]!.box, hq.cardId!);
    // A new run: Last run (button and strip) is gone while it is on.
    l = await startRun(page, 'rd');
    expect(l.run).not.toBeNull();
    expect(l.lastRun).toEqual({ button: null, strip: null });
    expect((await getView(page)).lastRun).toBeNull();
    await finishAccess(page);
    // Spend the turn and end it (discard if asked).
    await page.evaluate(() => {
      const hook = window.__overclock!;
      while (hook.getView().activePlayer === 'runner' && hook.getView().players.runner.clicks > 0) hook.dispatch({ type: 'gain_credit', player: 'runner' });
    });
    l = await waitIdle(page);
    await tap(page, l.endTurn!.box);
    await page.waitForTimeout(400);
    let v = await getView(page);
    if (v.pendingDiscard > 0) {
      await page.evaluate((n) => window.__overclock!.dispatch({ type: 'discard', player: 'runner', handIndices: [...Array(n).keys()] }), v.pendingDiscard);
    }
    l = await waitIdle(page);
    v = await getView(page);
    expect(v.viewer).toBe('corp');
    expect(v.lastRun).toBeNull();
    expect(l.lastRun).toEqual({ button: null, strip: null });
    await shot(page, '04-corp-seat-no-last-run');
    // Corp ends its turn: the Runner's new turn starts without a Last run.
    await page.evaluate(() => {
      const hook = window.__overclock!;
      while (hook.getView().activePlayer === 'corp' && hook.getView().players.corp.clicks > 0) hook.dispatch({ type: 'gain_credit', player: 'corp' });
      hook.dispatch({ type: 'end_turn', player: 'corp' });
      const p = hook.getView().pendingDiscard;
      if (p > 0) hook.dispatch({ type: 'discard', player: 'corp', handIndices: [...Array(p).keys()] });
    });
    l = await waitIdle(page);
    v = await getView(page);
    expect(v.viewer).toBe('runner');
    expect(v.lastRun).toBeNull();
    expect(l.lastRun).toEqual({ button: null, strip: null });
  });
});

test.describe('QA S-05-2 the ICE says what it does', () => {
  test('Wall of Static: "Let it fire: run ends"; the message stays 5 s; the tap that closes it picks nothing; the next tap picks a card at once', async ({ page }) => {
    await openBoard(page, 2);
    await toStep(page, 2, 'wall_of_static_encounter');
    let l = await waitIdle(page);
    expect(labels(l)).toContain('Let it fire: run ends');
    expect(labels(l).some((x) => x === 'Let it through')).toBe(false);
    for (const b of l.run!.buttons) expect(inside(b.box, safeRect(l)), b.label).toBe(true);
    await shot(page, '05-let-it-fire-label');
    await tap(page, runButtonOf(l, 'Let it fire: run ends').box);
    await page.waitForFunction(() => window.__overclock!.layout().report !== null);
    l = await layout(page);
    expect(l.report!.text).toBe('Wall of Static ended your run.');
    expect(inside(l.report!.box, safeRect(l)), 'message on screen').toBe(true);
    await shot(page, '06-ice-report');
    for (let t = 0; t < 5; t++) {
      await page.waitForTimeout(1000);
      expect((await layout(page)).report?.text, `still showing after ${t + 1}s`).toBe('Wall of Static ended your run.');
    }
    const before = await getView(page);
    const i = before.handOptions.findIndex((o) => o.some((x) => x.reject === null));
    expect(i).toBeGreaterThanOrEqual(0);
    // The closing tap lands on a playable hand card: it only closes the message.
    await tap(page, l.hand[i]!.box);
    await page.waitForTimeout(150);
    l = await layout(page);
    expect(l.report).toBeNull();
    expect(l.selected).toBeNull();
    expect(l.targets).toEqual([]);
    expect(await getView(page)).toEqual(before);
    // The next tap picks the card: handled and lit within 0.1 s of the game seeing it.
    await page.evaluate(() => {
      const w = window as unknown as { __sel?: number };
      w.__sel = undefined;
      const loop = () => {
        if (window.__overclock!.layout().selected !== null) w.__sel = performance.now();
        else requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await tap(page, l.hand[i]!.box);
    await page.waitForFunction(() => (window as unknown as { __sel?: number }).__sel !== undefined);
    const r = await page.evaluate(() => ({ sel: (window as unknown as { __sel: number }).__sel, input: window.__overclock!.lastInput() }));
    expect((await layout(page)).selected).toBe(i);
    test.info().annotations.push({ type: 'pick-after-report', description: `handled ${(r.input!.handledAt - r.input!.eventAt).toFixed(1)}ms after the tap; lit on frame ${(r.sel - r.input!.eventAt).toFixed(1)}ms after the tap` });
    expect(r.sel - r.input!.handledAt).toBeLessThan(100);
  });

  test('Enigma and Neural Katana messages name the ICE (screenshots)', async ({ page }) => {
    await openBoard(page, 1);
    await toStep(page, 1, 'enigma_encounter');
    let l = await waitIdle(page);
    expect(labels(l)).toContain('Let it fire: lose 1 click, run ends');
    await shot(page, '07-enigma-label');
    await tap(page, runButtonOf(l, /^Let it fire/).box);
    await page.waitForFunction(() => window.__overclock!.layout().report !== null);
    l = await layout(page);
    expect(l.report!.text).toBe('Enigma: you lost 1 click. Enigma ended your run.');
    expect(inside(l.report!.box, safeRect(l))).toBe(true);
    await shot(page, '08-enigma-report');

    await openBoard(page, 1);
    await toStep(page, 1, 'neural_katana_encounter');
    l = await waitIdle(page);
    expect(labels(l)).toContain('Let it fire: take 3 damage');
    await tap(page, runButtonOf(l, 'Let it fire: take 3 damage').box);
    await page.waitForFunction(() => window.__overclock!.layout().report !== null);
    l = await layout(page);
    expect(l.report!.text).toBe('Neural Katana: you took 3 damage.');
    expect(inside(l.report!.box, safeRect(l))).toBe(true);
    await shot(page, '09-katana-report');
    // The run goes on after the message is tapped away; its buttons work.
    await tap(page, l.report!.box);
    l = await waitIdle(page);
    expect(l.report).toBeNull();
    expect(l.run).not.toBeNull();
    expect(l.run!.buttons.length).toBeGreaterThan(0);
  });
});

test.describe('QA S-05-3 carousel', () => {
  test('carousel screenshots: neighbours behind the zoom, mid-slide and after (frames pinned fast)', async ({ page }) => {
    await openBoard(page, 1);
    const l = await layout(page);
    await page.evaluate(() => window.__overclock!.frameSpeed('fast'));
    const h = await holdAt(page, l.hand[1]!.box);
    await waitZoom(page, l.hand[1]!.cardId);
    await page.waitForFunction(() => window.__overclock!.layout().zoom!.carousel.every((c) => c.full));
    await page.waitForTimeout(300);
    const z = (await layout(page)).zoom!;
    expect(z.carousel.length).toBeGreaterThanOrEqual(2);
    for (const c of z.carousel) expect(c.box.height).toBeLessThan(z.box.height);
    await shot(page, '10-carousel');
    const c = center(l.hand[2]!.box);
    await h.move(c.x, c.y);
    await waitZoom(page, l.hand[2]!.cardId);
    await shot(page, '11-carousel-sliding');
    await page.waitForTimeout(300);
    const after = (await layout(page)).zoom!;
    expect(after.carousel.find((x) => x.index === 1)!.offset).toBe(-1);
    await shot(page, '12-carousel-after-slide');
    await h.release();
    await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
  });
});

/** Logs the first animation frame in which each new zoom_swap is visible. */
async function watchSwaps(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __qs: { t: number }[] };
    w.__qs = [];
    let seen = window.__overclock!.anims().filter((a) => a.kind === 'zoom_swap').length;
    const loop = () => {
      const n = window.__overclock!.anims().filter((a) => a.kind === 'zoom_swap').length;
      if (n !== seen) {
        seen = n;
        w.__qs.push({ t: performance.now() });
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

/** Moves to hand slot `k`, waits for the frame showing it; returns input -> frame ms and whether it was drawn ahead. */
async function slideTo(page: Page, h: { move(x: number, y: number): Promise<void> }, hand: LayoutSnapshot['hand'], k: number): Promise<{ ms: number; predrawn: boolean }> {
  const n = await page.evaluate(() => (window as unknown as { __qs: unknown[] }).__qs.length);
  const c = center(hand[k]!.box);
  await h.move(c.x, c.y);
  await waitZoom(page, hand[k]!.cardId);
  await page.waitForFunction((m) => (window as unknown as { __qs: unknown[] }).__qs.length > m, n);
  return page.evaluate(() => {
    const swap = window.__overclock!.anims().filter((a) => a.kind === 'zoom_swap').at(-1)!;
    return { ms: (window as unknown as { __qs: { t: number }[] }).__qs.at(-1)!.t - swap.inputAt!, predrawn: swap.predrawn === true };
  });
}

test.describe('QA timing S-05-3', () => {
  test('QA timing: slide the moment the zoom opens (no waiting for the pre-draw), across the hand: every new face on screen < 100 ms', async ({ page }) => {
    await openBoard(page, 1);
    const hand = (await layout(page)).hand;
    expect(hand.length).toBeGreaterThanOrEqual(5);
    const last = hand.length - 1;
    await watchSwaps(page);
    const h = await holdAt(page, hand[0]!.box);
    await waitZoom(page, hand[0]!.cardId);
    // No pause: straight to the far end, then back card by card.
    const path = [last, ...Array.from({ length: last }, (_, i) => last - 1 - i)];
    const res: { ms: number; predrawn: boolean }[] = [];
    for (const k of path) {
      // Skip a slot that shows the same card as the one already zoomed (no swap happens).
      const cur = (await layout(page)).zoom!.cardId;
      if (hand[k]!.cardId === cur) continue;
      res.push(await slideTo(page, h, hand, k));
    }
    test.info().annotations.push({ type: 'qa-early-slide-ms', description: res.map((r) => `${r.ms.toFixed(1)}${r.predrawn ? '' : '*'}`).join(',') });
    for (const r of res) expect(r.ms).toBeLessThan(100);
    await h.release();
  });

  test('QA timing: with the slide animation on (frames pinned fast), quick back-and-forth moves: every new face on screen < 100 ms', async ({ page }) => {
    await openBoard(page, 1);
    const hand = (await layout(page)).hand;
    await page.evaluate(() => window.__overclock!.frameSpeed('fast'));
    await watchSwaps(page);
    const h = await holdAt(page, hand[0]!.box);
    await waitZoom(page, hand[0]!.cardId);
    await page.waitForFunction(() => window.__overclock!.layout().zoom!.carousel.every((c) => c.full));
    const res: { ms: number; predrawn: boolean }[] = [];
    // Each move comes while the previous slide is still running (no pause between moves).
    for (const k of [1, 2, 3, 2, 1, 0, 1, 2, 3, 4]) {
      if (hand[k]!.cardId === (await layout(page)).zoom!.cardId) continue;
      res.push(await slideTo(page, h, hand, k));
    }
    const slides = (await page.evaluate(() => window.__overclock!.anims())).filter((a) => a.kind === 'carousel_slide');
    expect(slides.length).toBeGreaterThan(0);
    test.info().annotations.push({ type: 'qa-fast-slide-ms', description: res.map((r) => r.ms.toFixed(1)).join(',') });
    for (const r of res) expect(r.ms).toBeLessThan(100);
    await h.release();
    await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
    // Nothing played or spent by the whole slide.
    expect((await layout(page)).selected).toBeNull();
  });
});
