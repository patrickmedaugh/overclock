// Sprint 15 (S-15-2, S-15-3): played cards fly to the board and land; cards fly to and from the
// piles. The movement is frozen with the test switch (`motion('hold')`) and stepped with
// `advanceMotion(ms)`, so each check looks at a card mid-flight without racing the clock.
// Screens at 891x296 go to docs/sprints/sprint-15-screens/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';
import type { CardOption, PlayerView } from '@overclock/engine';
import { type Box, type LayoutSnapshot, anims, center, dragTo, getView, layout, liftHand, openBoard, pickHand, tap, targetOf, toRunnerTurn, toStep, waitIdle } from './helpers';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-15-screens');

async function shot(page: Page, name: string): Promise<void> {
  const p = test.info().project.name;
  const save = p === 'phone-short';
  if (save) mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot(save ? { path: join(SHOTS, `${name}-891x296.png`) } : {});
  await test.info().attach(name, { body, contentType: 'image/png' });
}

function kindOf(o: CardOption): string {
  const a = o.action;
  if (a.type === 'install' && a.server === 'new') return 'new_server';
  return a.type;
}

function cardWith(v: PlayerView, kind: string): number {
  const i = v.handOptions.findIndex((os) => os.some((o) => o.reject === null && kindOf(o) === kind));
  if (i < 0) throw new Error(`no hand card with a lit ${kind} place`);
  return i;
}

async function hold(page: Page): Promise<void> {
  await page.evaluate(() => window.__overclock!.motion('hold'));
}

async function advance(page: Page, ms: number): Promise<LayoutSnapshot> {
  await page.evaluate((t) => window.__overclock!.advanceMotion(t), ms);
  return layout(page);
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

test.describe('S-15-2 played cards fly to the board and land', () => {
  test('a card dropped on a lit place flies from the finger to its spot and lands with a settle', async ({ page }) => {
    await openBoard(page, 1);
    const v = await getView(page);
    const i = cardWith(v, 'new_server');
    const cardId = v.players.corp.hand![i]!;
    const { hold: finger, lifted } = await liftHand(page, i);
    const target = lifted.targets.find((t) => t.kind === 'new_server' && t.lit)!;
    await dragTo(finger, center(lifted.handView!.centre), center(target.box), 6);
    await page.waitForFunction(() => window.__overclock!.layout().drag?.hover?.kind === 'new_server');
    // Touch moves are delivered with the next frame (Chrome aligns them), so the hover can show
    // before the last move lands: wait two frames so `dropped` is where the finger let go.
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const dropped = (await layout(page)).drag!.box;
    await hold(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await finger.release();
    await page.waitForFunction(() => window.__overclock!.layout().motion.active > 0);
    let l = await layout(page);
    const f = l.motion.flights.find((x) => x.kind === 'install')!;
    expect(f, 'the card is flying').toBeTruthy();
    // The Corp's own card (it turns face down on the way); it starts where it was let go.
    expect(f.cardId).toBe(cardId);
    expect(dist(center(f.box), center(dropped)), 'starts at the finger').toBeLessThan(4);
    l = await advance(page, 120);
    const mid = l.motion.flights.find((x) => x.kind === 'install')!;
    await shot(page, 's15-2-install-mid-flight');
    const remote = l.servers.at(-1)!;
    const spot = [...remote.content, ...remote.ice][0]!.box;
    expect(dist(center(mid.box), center(spot)), 'on its way to its spot').toBeLessThan(dist(center(dropped), center(spot)));
    l = await advance(page, 600);
    expect(l.motion.active, 'landed').toBe(0);
    const a = await anims(page);
    const settle = a.find((r) => r.kind === 'land_settle');
    expect(settle, 'a small settle as it lands').toBeTruthy();
    expect(settle!.scheduledMs).toBeLessThanOrEqual(150);
    for (const r of a) expect(r.scheduledMs, `${r.kind} within the 0.6 s budget`).toBeLessThanOrEqual(600);
  });

  test("the Corp's face-down install flies face down to the Runner (pass-the-phone: once the board shows)", async ({ page }) => {
    await openBoard(page, 1);
    const v = await getView(page);
    const i = cardWith(v, 'new_server');
    const opt = v.handOptions[i]!.find((o) => o.reject === null && kindOf(o) === 'new_server')!;
    await page.evaluate((a) => window.__overclock!.dispatch(a), opt.action);
    await waitIdle(page);
    await hold(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    // The Corp ends the turn; the Runner's board comes up (no cover in this test build).
    await page.evaluate(() => {
      const hook = window.__overclock!;
      hook.dispatch({ type: 'end_turn', player: 'corp' });
      const w = hook.getView();
      if (w.pendingDiscard > 0) hook.dispatch({ type: 'discard', player: 'corp', handIndices: Array.from({ length: w.pendingDiscard }, (_, k) => k) });
    });
    // Past the turn change (the Corp's discards, if any, fly first); the Corp's card then flies in from the top.
    for (let k = 0; k < 10 && (await layout(page)).viewer !== 'runner'; k++) await advance(page, 60);
    await page.waitForFunction(() => window.__overclock!.layout().viewer === 'runner' && window.__overclock!.layout().motion.flights.some((f) => f.kind === 'install'));
    const l = await layout(page);
    const f = l.motion.flights.find((x) => x.kind === 'install')!;
    expect(f.cardId, 'a card back: the Runner never sees its face').toBeNull();
    expect(center(f.box).y, 'from the Corp side (top)').toBeLessThan(l.viewport.height / 2);
    await shot(page, 's15-2-corp-face-down-flight');
    const after = await advance(page, 600);
    expect(after.motion.active).toBe(0);
    const opp = (await anims(page)).filter((r) => r.kind === 'opponent_flight');
    expect(opp.length).toBeGreaterThan(0);
    expect(opp.every((r) => r.text === ''), 'no card name in the flight').toBe(true);
    const remote = after.servers.at(-1)!;
    expect([...remote.content, ...remote.ice].every((c) => c.cardId === null)).toBe(true);
  });

  test('a one-shot card picked and played with a tap flies to the middle, shows, then lands on the Heap (count goes up on landing)', async ({ page }) => {
    await openBoard(page, 1);
    await toRunnerTurn(page);
    const v = await getView(page);
    const i = cardWith(v, 'play');
    const cardId = v.players.runner.hand![i]!;
    const picked = await pickHand(page, i);
    await waitIdle(page);
    const heapBefore = picked.text.runnerDiscard;
    await hold(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, targetOf(picked, 'play').box);
    await page.waitForFunction(() => window.__overclock!.layout().motion.active > 0);
    let l = await advance(page, 170);
    const f = l.motion.flights.find((x) => x.kind === 'play')!;
    expect(f.cardId).toBe(cardId);
    const board: Box = { x: 0, y: 0, width: l.viewport.width, height: l.viewport.height };
    expect(dist(center(f.box), center(board)), 'in the middle of the table').toBeLessThan(Math.max(l.viewport.width, l.viewport.height) * 0.2);
    expect(f.box.width, 'shown bigger than in the hand').toBeGreaterThan(l.hand[0]?.box.width ?? 0);
    expect(l.text.runnerDiscard, 'the Heap waits for the card').toBe(heapBefore);
    await shot(page, 's15-2-showcase');
    l = await advance(page, 120);
    expect(l.motion.flights.some((x) => x.kind === 'play'), 'still showing').toBe(true);
    l = await advance(page, 400);
    expect(l.motion.active).toBe(0);
    expect(Number(l.text.runnerDiscard), 'the Heap count went up as it landed').toBe(Number(heapBefore || 0) + 1);
    const a = await anims(page);
    expect(a.some((r) => r.kind === 'showcase' && r.text === cardId)).toBe(true);
    for (const r of a) expect(r.scheduledMs).toBeLessThanOrEqual(600);
  });
});

test.describe('S-15-3 cards fly to and from the piles', () => {
  test('a drawn card flies from the deck into the hand', async ({ page }) => {
    await openBoard(page, 1);
    let l = await waitIdle(page);
    const n = l.hand.length;
    await hold(page);
    await tap(page, l.corp.deck);
    await page.waitForFunction(() => window.__overclock!.layout().motion.flights.some((f) => f.kind === 'draw'));
    l = await layout(page);
    const f = l.motion.flights.find((x) => x.kind === 'draw')!;
    expect(dist(center(f.box), center(l.corp.deck)), 'starts on the deck').toBeLessThan(4);
    l = await advance(page, 500);
    expect(l.motion.active).toBe(0);
    expect(l.hand.length).toBe(n + 1);
    const last = l.hand[n]!.box;
    expect(last.y, 'landed in the hand').toBeGreaterThanOrEqual(l.handArea.y - 1);
  });

  test('a scored agenda flies to the score pile; the points tick up with a glow as it lands', async ({ page }) => {
    await openBoard(page, { seed: 1, decks: 'core' });
    const plan = await toStep(page, 1, 'agenda_at_requirement');
    let l = await waitIdle(page);
    const card = l.servers.flatMap((s) => s.content).find((c) => c.uid === plan.info['uid'])!;
    await tap(page, card.box);
    l = await waitIdle(page);
    const scoreBefore = l.score.corp.text;
    await hold(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, targetOf(l, 'score').box);
    await page.waitForFunction(() => window.__overclock!.layout().motion.flights.some((f) => f.kind === 'score'));
    l = await advance(page, 100);
    expect(l.scored.corp.count, 'the pile waits for the card').toBe(0);
    expect(l.score.corp.text, 'the points wait too').toBe(scoreBefore);
    await shot(page, 's15-3-score-flight');
    l = await advance(page, 200);
    expect(l.scored.corp.count, 'landed').toBe(1);
    const tick = (await anims(page)).find((r) => r.kind === 'score_tick');
    expect(tick, 'the points tick up with a glow').toBeTruthy();
    expect(tick!.scheduledMs).toBeLessThanOrEqual(600);
    l = await advance(page, 400);
    const pts = (await getView(page)).players.corp.points;
    expect(l.score.corp.text).toBe(`Corp ${pts} ${pts === 1 ? 'point' : 'points'}`);
  });
});
