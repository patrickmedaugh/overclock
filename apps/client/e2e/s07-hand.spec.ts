// S-07-6 (owner's design, PR #17 answer 1B): tap the hand to open it big and
// readable; long-press a card to light every place it can go; drag it onto a
// lit place and let go to play it there; let go anywhere else and the hand
// view is back; tap outside (or Back) closes it. The dragged card follows the
// finger in under 0.1 s per move (timing spec below: also run at 6x CPU
// slow-down, E2E_CPU_THROTTLE=6, per docs/TESTING.md). Pass-the-phone and
// online play the same.
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import type { CardOption, PlayerView } from '@overclock/engine';
import {
  type Box,
  type LayoutSnapshot,
  anims,
  center,
  dispatch,
  dragTo,
  emptySpot,
  getView,
  holdAt,
  layout,
  liftHand,
  openBoard,
  openHand,
  pickHand,
  tap,
  toRunnerTurn,
  waitIdle,
} from './helpers';
import { joinGame, layoutOf, openPhone, startTestGame, view as phoneView, waitPlaying, waitView } from './online';

/** Kinds of place an option lights (as the board names them). */
function kindOf(o: CardOption): string {
  const a = o.action;
  if (a.type === 'install' && a.server === 'new') return 'new_server';
  if (a.type === 'install' && a.server !== undefined) return 'server';
  if (a.type === 'install') return 'install';
  return 'play';
}

/** The first hand card (index) whose options include a lit `kind` place. */
function cardWith(v: PlayerView, kind: string): number {
  const i = v.handOptions.findIndex((os) => os.some((o) => o.reject === null && kindOf(o) === kind));
  if (i < 0) throw new Error(`no hand card with a lit ${kind} place`);
  return i;
}

const sorted = (xs: string[]) => [...xs].sort();

/** A spot on the board away from every lit place (and on screen). */
function awaySpot(l: LayoutSnapshot): { x: number; y: number } {
  const s = emptySpot(l);
  const p = center(s);
  const inAny = (b: Box) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
  expect(l.targets.some((t) => inAny(t.box)), 'the away spot is off every lit place').toBe(false);
  return { x: Math.min(p.x, l.viewport.width - 4), y: p.y };
}

test.describe('S-07-6 hand: tap to open, long-press to light places, drag to play', () => {
  test('tapping the hand opens it big and readable, with neighbours either side', async ({ page }) => {
    await openBoard(page, 1);
    const l = await layout(page);
    const n = l.hand.length;
    expect(n).toBeGreaterThanOrEqual(5);
    const open = await openHand(page, 2);
    await page.waitForTimeout(250); // the zoom-in finished
    const after = await layout(page);
    const z = after.zoom!;
    expect(z.cardId).toBe(l.hand[2]!.cardId);
    expect(after.handView).toMatchObject({ index: 2, cardId: l.hand[2]!.cardId, lifted: false });
    // Readable: the zoom size (most of a phone's height; on desktop at least 3x the hand card), every text inside the card.
    expect(z.box.width).toBeCloseTo(open.handView!.centre.width, 0);
    expect(z.box.height).toBeGreaterThan(Math.min(after.viewport.height * 0.8, l.hand[2]!.box.height * 3));
    expect(z.textOverflow).toBe(false);
    // Two neighbours each side, smaller.
    expect(z.carousel.map((c) => c.index)).toEqual([0, 1, 3, 4]);
    for (const c of z.carousel) expect(c.box.height).toBeLessThan(z.box.height);
    // Opening it changes nothing in the game.
    expect(after.selected).toBeNull();
    expect(after.targets).toEqual([]);
    await test.info().attach('hand-view', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('swiping browses the hand; tapping a neighbour brings it to the middle', async ({ page }) => {
    await openBoard(page, 1);
    const l = await layout(page);
    const open = await openHand(page, 1);
    const c = center(open.handView!.centre);
    const h = await holdAt(page, open.handView!.centre);
    // Drag the cards left: the later ones come to the middle (no lift: the finger moved).
    await dragTo(h, c, { x: c.x - open.handView!.centre.width * 0.7, y: c.y }, 6);
    await page.waitForFunction(() => (window.__overclock!.layout().handView?.index ?? 0) >= 2);
    await h.release();
    let now = await layout(page);
    expect(now.drag).toBeNull();
    const k = now.handView!.index;
    expect(now.zoom!.cardId).toBe(l.hand[k]!.cardId);
    await page.waitForTimeout(200);
    now = await layout(page);
    const left = now.zoom!.carousel.find((x) => x.offset === -1)!;
    await tap(page, left.box);
    await page.waitForFunction((i) => window.__overclock!.layout().handView?.index === i, k - 1);
    expect((await layout(page)).zoom!.cardId).toBe(l.hand[k - 1]!.cardId);
    // Nothing was played or picked.
    expect((await layout(page)).selected).toBeNull();
  });

  test('a tap on the big card picks it the no-drag way: the view closes, its places light up', async ({ page }) => {
    await openBoard(page, 1);
    const v = await getView(page);
    const i = cardWith(v, 'new_server');
    const l = await pickHand(page, i);
    expect(l.handView).toBeNull();
    expect(l.selected).toBe(i);
    expect(sorted(l.targets.map((t) => t.kind))).toEqual(sorted(v.handOptions[i]!.map(kindOf)));
  });

  test('long-pressing a card in the hand view lights every place it can go (refused ones dimmed)', async ({ page }) => {
    await openBoard(page, 1);
    const v = await getView(page);
    for (const kind of ['new_server', 'play'] as const) {
      const i = v.handOptions.findIndex((os) => os.some((o) => kindOf(o) === kind));
      if (i < 0) continue;
      const { hold, lifted } = await liftHand(page, i);
      expect(lifted.handView).toMatchObject({ index: i, lifted: true });
      expect(lifted.zoom, 'the hand view fades out').toBeNull();
      expect(lifted.drag).toMatchObject({ index: i, cardId: lifted.hand[i]!.cardId });
      const options = v.handOptions[i]!;
      expect(sorted(lifted.targets.map((t) => t.kind))).toEqual(sorted(options.map(kindOf)));
      expect(lifted.targets.map((t) => t.lit).sort()).toEqual(options.map((o) => o.reject === null).sort());
      await test.info().attach(`lifted-${kind}`, { body: await page.screenshot(), contentType: 'image/png' });
      // Let go away from every place: it goes home; Back closes the view.
      await dragTo(hold, center(lifted.handView!.centre), awaySpot(lifted), 4);
      await hold.release();
      await page.waitForFunction(() => window.__overclock!.layout().drag === null);
      await page.evaluate(() => window.__overclock!.back());
      await page.waitForFunction(() => window.__overclock!.layout().handView === null);
    }
  });

  test('dragging onto a lit place and letting go plays it there', async ({ page }) => {
    await openBoard(page, 1);
    const before = await getView(page);
    const i = cardWith(before, 'new_server');
    const cardId = before.players.corp.hand![i]!;
    const { hold, lifted } = await liftHand(page, i);
    const target = lifted.targets.find((t) => t.kind === 'new_server' && t.lit)!;
    const from = center(lifted.handView!.centre);
    const to = center(target.box);
    await dragTo(hold, from, to, 8);
    await page.waitForFunction(() => window.__overclock!.layout().drag?.hover?.kind === 'new_server');
    const over = await layout(page);
    // The card is drawn under the finger (just above it), over the place.
    expect(over.drag!.hover).toEqual({ kind: 'new_server', server: 'new', lit: true });
    expect(Math.abs(center(over.drag!.box).x - to.x)).toBeLessThan(2);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await hold.release();
    const l = await waitIdle(page);
    const v = await getView(page);
    expect(v.players.corp.handCount).toBe(before.players.corp.handCount - 1);
    expect(v.players.corp.clicks).toBe(before.players.corp.clicks - 1);
    const remote = v.corpServers.find((s) => !['hq', 'rd', 'archives'].includes(s.id))!;
    expect(remote.content.map((c) => c.cardId).concat(remote.ice.map((c) => c.cardId))).toContain(cardId);
    expect(l.drag).toBeNull();
    expect(l.handView).toBeNull();
    expect(l.targets).toEqual([]);
    // Played at once, its flight inside the budget.
    const flights = (await anims(page)).filter((a) => a.kind === 'install_flight');
    expect(flights.length).toBe(1);
    expect(flights[0]!.scheduledMs).toBeLessThanOrEqual(600);
  });

  test('letting go away from a lit place plays nothing and the hand view is back', async ({ page }) => {
    await openBoard(page, 1);
    const before = await getView(page);
    const i = cardWith(before, 'new_server');
    const { hold, lifted } = await liftHand(page, i);
    const from = center(lifted.handView!.centre);
    await dragTo(hold, from, awaySpot(lifted), 6);
    await page.waitForFunction(() => window.__overclock!.layout().drag !== null && window.__overclock!.layout().drag!.hover === null);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await hold.release();
    await page.waitForFunction(() => window.__overclock!.layout().drag === null);
    const l = await layout(page);
    expect(l.handView).toMatchObject({ index: i, lifted: false });
    expect(l.zoom!.cardId).toBe(lifted.hand[i]!.cardId);
    expect(l.targets).toEqual([]);
    expect(l.selected).toBeNull();
    expect(await getView(page)).toEqual(before);
    // The card flies home within 150 ms; nothing blocks for longer than the budget.
    const back = (await anims(page)).filter((a) => a.kind === 'card_return');
    expect(back.length).toBe(1);
    expect(back[0]!.scheduledMs).toBeLessThanOrEqual(150);
    await waitIdle(page);
    const home = await layout(page);
    await page.waitForTimeout(200);
    expect((await layout(page)).hand[i]!.box).toEqual(home.hand[i]!.box);
  });

  test('letting go on a dimmed place says why and plays nothing', async ({ page }) => {
    // Seed 2: the Runner installs Gordian Blade (4 of his 5 credits); the 2-credit cards are then too dear.
    await openBoard(page, 2);
    await toRunnerTurn(page);
    let v = await getView(page);
    const blade = v.players.runner.hand!.indexOf('r05');
    expect(blade).toBeGreaterThanOrEqual(0);
    await dispatch(page, { type: 'install', player: 'runner', handIndex: blade });
    await waitIdle(page);
    v = await getView(page);
    expect(v.players.runner.credits).toBe(1);
    const i = v.handOptions.findIndex((os) => os.length > 0 && os.every((o) => o.reject === 'no_credits'));
    expect(i, 'a card the Runner cannot afford').toBeGreaterThanOrEqual(0);
    const { hold, lifted } = await liftHand(page, i);
    const dim = lifted.targets.find((t) => !t.lit)!;
    expect(dim).toBeTruthy();
    await dragTo(hold, center(lifted.handView!.centre), center(dim.box), 6);
    await page.waitForFunction(() => window.__overclock!.layout().drag?.hover?.lit === false);
    await hold.release();
    await page.waitForFunction(() => window.__overclock!.layout().hint !== null);
    const l = await layout(page);
    expect(l.hint!.text).toBe('Not enough credits');
    expect(l.drag).toBeNull();
    expect(l.handView).toBeNull();
    expect(await getView(page)).toEqual(v);
  });

  test('a card that cannot be played now: long-press says why and lights nothing', async ({ page }) => {
    await openBoard(page, 1);
    for (let k = 0; k < 3; k++) await dispatch(page, { type: 'gain_credit', player: 'corp' });
    await waitIdle(page);
    const before = await getView(page);
    const open = await openHand(page, 0);
    const h = await holdAt(page, open.handView!.centre);
    await page.waitForFunction(() => window.__overclock!.layout().hint !== null);
    const l = await layout(page);
    expect(l.hint!.text).toBe('No clicks left');
    expect(l.drag).toBeNull();
    expect(l.targets).toEqual([]);
    await h.release();
    expect(await getView(page)).toEqual(before);
  });

  test('tapping outside the hand view closes it, and that tap does nothing else', async ({ page }) => {
    await openBoard(page, 1);
    const before = await getView(page);
    const open = await openHand(page, 0);
    // R&D (a tap there would draw a card) is outside the cards.
    await tap(page, open.corp.deck);
    await page.waitForFunction(() => window.__overclock!.layout().handView === null);
    await page.waitForTimeout(200);
    expect(await getView(page)).toEqual(before);
    expect((await layout(page)).zoom).toBeNull();
  });

  test('Back closes the hand view; Back while a card is lifted puts it home and plays nothing', async ({ page }) => {
    await openBoard(page, 1);
    const before = await getView(page);
    await openHand(page, 1);
    expect(await page.evaluate(() => window.__overclock!.back())).toBe('close_zoom');
    expect((await layout(page)).handView).toBeNull();
    const { hold } = await liftHand(page, cardWith(before, 'new_server'));
    expect(await page.evaluate(() => window.__overclock!.back())).toBe('close_zoom');
    let l = await layout(page);
    expect(l.handView).toBeNull();
    expect(l.drag).toBeNull();
    expect(l.targets).toEqual([]);
    // The finger lifting afterwards does nothing.
    await hold.release();
    await page.waitForTimeout(200);
    l = await layout(page);
    expect(l.handView).toBeNull();
    expect(await getView(page)).toEqual(before);
  });

  test('the dragged card follows the finger: each move drawn in under 0.1 seconds', async ({ page }) => {
    await openBoard(page, 1);
    const v = await getView(page);
    const i = cardWith(v, 'new_server');
    const { hold, lifted } = await liftHand(page, i);
    await page.waitForTimeout(200); // the view's fade finished
    // Each move: when the page saw it (event time), and the first frame after the game handled it.
    // A bubble listener on window runs after the game's own move handler; the rAF loop is
    // registered after Pixi's ticker, so it runs right after the frame that drew the move.
    await page.evaluate(() => {
      const w = window as unknown as { __dm: { at: number; x: number; y: number; drawn: number | null }[] };
      w.__dm = [];
      window.addEventListener('pointermove', (e) => w.__dm.push({ at: e.timeStamp, x: e.clientX, y: e.clientY, drawn: null }));
      const loop = (t: number) => {
        for (const m of w.__dm) if (m.drawn === null) m.drawn = t;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    const from = center(lifted.handView!.centre);
    const W = lifted.viewport.width;
    const H = lifted.viewport.height;
    const path: { x: number; y: number }[] = [];
    for (let k = 1; k <= 24; k++) path.push({ x: from.x + Math.sin(k / 3) * W * 0.3, y: from.y - Math.cos(k / 4) * H * 0.2 });
    for (const p of path) {
      const n = await page.evaluate(() => (window as unknown as { __dm: unknown[] }).__dm.length);
      await hold.move(p.x, p.y);
      await page.waitForFunction((m) => {
        const dm = (window as unknown as { __dm: { drawn: number | null }[] }).__dm;
        return dm.length > m && dm.every((d) => d.drawn !== null);
      }, n);
      // The card is where the finger is (centred just above it, kept on screen).
      const d = (await layout(page)).drag!;
      expect(Math.abs(center(d.box).x - Math.max(d.box.width / 2, Math.min(W - d.box.width / 2, p.x)))).toBeLessThan(1.5);
    }
    const moves = await page.evaluate(() => (window as unknown as { __dm: { at: number; drawn: number }[] }).__dm);
    expect(moves.length).toBeGreaterThanOrEqual(path.length);
    // rAF time is the frame's start; never earlier than the move it shows.
    const gaps = moves.map((m) => Math.max(0, m.drawn - m.at));
    test.info().annotations.push({ type: 'drag-move-ms', description: gaps.map((g) => g.toFixed(1)).join(',') });
    for (const g of gaps) expect(g).toBeLessThan(100);
    await hold.release();
  });
});

/** Drags hand card `i` onto the "new server" place with real input; resolves once released. */
async function dragToNewServer(page: Page, i: number, read: () => Promise<LayoutSnapshot>): Promise<void> {
  const open = await openHand(page, i);
  const hold = await holdAt(page, open.handView!.centre);
  await page.waitForFunction(() => window.__overclock!.layout().drag !== null);
  const l = await read();
  const t = l.targets.find((x) => x.kind === 'new_server' && x.lit)!;
  await dragTo(hold, center(open.handView!.centre), center(t.box), 6);
  await page.waitForFunction(() => window.__overclock!.layout().drag?.hover?.kind === 'new_server');
  await hold.release();
}

test.describe('S-07-6 drag to play: pass-the-phone and online play the same', () => {
  test('the same card dragged to a new server gives the same game in both', async ({ browser, page }) => {
    const seed = 7;
    // Pass-the-phone.
    await openBoard(page, seed);
    const v0 = await getView(page);
    const i = cardWith(v0, 'new_server');
    await dragToNewServer(page, i, () => layout(page));
    await waitIdle(page);
    const here = await getView(page);
    expect(here.players.corp.handCount).toBe(v0.players.corp.handCount - 1);

    // Online: the Corp's phone drags the same card; the Runner's phone sees it arrive.
    const corp = await openPhone(browser);
    const runner = await openPhone(browser);
    const code = await startTestGame(corp, 'corp', { seed, actions: [] });
    await joinGame(runner, code);
    await Promise.all([waitPlaying(corp), waitPlaying(runner)]);
    const c0 = await phoneView(corp);
    expect(c0.players.corp.hand).toEqual(v0.players.corp.hand);
    await dragToNewServer(corp.page, i, () => layoutOf(corp));
    const there = await waitView(corp, (v) => v.players.corp.handCount === c0.players.corp.handCount - 1);
    expect(there.corpServers).toEqual(here.corpServers);
    expect(there.players.corp).toEqual(here.players.corp);
    const seen = await waitView(runner, (v) => v.corpServers.length === here.corpServers.length);
    const remote = seen.corpServers.at(-1)!;
    expect(remote.content.length + remote.ice.length).toBe(1);
    // The Runner sees a face-down card, never which one.
    expect([...remote.content, ...remote.ice].every((c) => c.cardId === null && !c.faceUp)).toBe(true);
    const cl = await layoutOf(corp);
    expect(cl.drag).toBeNull();
    expect(cl.handView).toBeNull();
    await corp.context.close();
    await runner.context.close();
  });
});
