// Sprint 15 (S-15-1): cards lift and lean in your hand. In the open hand view the big card rises
// and grows the moment the finger lands (and settles back when the finger moves on without a
// hold); a lifted card follows the finger and leans the way it moves (more when faster), and
// straightens when it stops; let go away from a lit place it glides home; a swipe slides the
// cards; with a mouse, the pointed-at hand card lifts a little and leans toward the pointer.
// Screens at 891x296 go to docs/sprints/sprint-15-screens/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';
import type { CardOption, PlayerView } from '@overclock/engine';
import { type Hold, type LayoutSnapshot, anims, center, emptySpot, getView, holdAt, layout, liftHand, openBoard, openHand, waitIdle } from './helpers';

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

/**
 * A quick flick on `b`: touch events carry the times they were made (down at once, each move 20 ms
 * after the one before), as a phone's touch screen stamps them, so a busy test machine that delivers
 * them late still sends a quick flick (QA-S15-2: a press is judged by its own times). Mouse: a plain
 * press and moves (no stamps to give).
 */
async function flickAt(page: Page, b: { x: number; y: number; width: number; height: number }): Promise<Hold> {
  if (test.info().project.use.hasTouch !== true) return holdAt(page, b);
  const { x, y } = center(b);
  const cdp = await page.context().newCDPSession(page);
  const t0 = Date.now();
  let k = 0;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }], timestamp: t0 / 1000 });
  return {
    move: async (mx, my) => {
      k++;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: mx, y: my }], timestamp: Math.min(Date.now(), t0 + 20 * k) / 1000 });
    },
    release: async () => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    },
  };
}

/** Decorative movement is pinned on (a busy test machine would otherwise count as a slow phone). */
async function fastFrames(page: Page): Promise<void> {
  await page.evaluate(() => window.__overclock!.frameSpeed('fast'));
}

function rotation(page: Page): Promise<number> {
  return page.evaluate(() => window.__overclock!.layout().drag?.rotation ?? NaN);
}

/** The lean the last finger move gave the lifted card (before it eases back). */
function lean(page: Page): Promise<number> {
  return page.evaluate(() => window.__overclock!.layout().drag?.lean ?? NaN);
}

test.describe('S-15-1 cards lift and lean in your hand', () => {
  test.skip(() => test.info().project.name === 'desktop', 'touch hand view (the mouse hover has its own test)');

  test('pressing the big card makes it rise and grow within 0.1 s of the press', async ({ page }) => {
    await openBoard(page, 1);
    await fastFrames(page);
    const open = await openHand(page, 1);
    await waitIdle(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    const centre = open.handView!.centre;
    // Watch the big card from inside the page (a slow test machine may lift it before a poll from here sees it).
    await page.evaluate(() => {
      const w = window as unknown as { __press: { width: number; mid: number }; __probe: number };
      w.__press = { width: 0, mid: Infinity };
      w.__probe = window.setInterval(() => {
        const z = window.__overclock!.layout().zoom;
        if (!z) return;
        w.__press.width = Math.max(w.__press.width, z.box.width);
        w.__press.mid = Math.min(w.__press.mid, z.box.y + z.box.height / 2);
      }, 4);
    });
    const hold = await holdAt(page, centre);
    await page.waitForFunction((cw) => (window as unknown as { __press: { width: number } }).__press.width > cw * 1.04, centre.width);
    const seen = await page.evaluate(() => {
      const w = window as unknown as { __press: { width: number; mid: number }; __probe: number };
      clearInterval(w.__probe);
      return w.__press;
    });
    expect(seen.mid, 'it rises').toBeLessThan(centre.y + centre.height / 2 - 2);
    expect(seen.width, 'a little (8 %)').toBeLessThan(centre.width * 1.1);
    const rec = (await anims(page)).find((a) => a.kind === 'hand_press');
    expect(rec, 'the press feedback started').toBeTruthy();
    expect(rec!.startedAt - rec!.inputAt!, 'within a tenth of a second of the press').toBeLessThan(100);
    expect(rec!.scheduledMs).toBeLessThanOrEqual(100);
    await shot(page, 's15-1-press-lift');
    await hold.release();
  });

  test('a press that moves on without a hold (a swipe) settles the big card back', async ({ page }) => {
    await openBoard(page, 1);
    await fastFrames(page);
    const open = await openHand(page, 1);
    await waitIdle(page);
    const centre = open.handView!.centre;
    const c = center(centre);
    const hold = await flickAt(page, centre);
    await hold.move(c.x - 30, c.y);
    await hold.move(c.x - 60, c.y);
    await hold.release();
    await page.waitForFunction((w) => {
      const z = window.__overclock!.layout().zoom;
      return !!z && Math.abs(z.box.width - w) < 1;
    }, centre.width);
    const l = await layout(page);
    expect(l.drag, 'nothing was lifted').toBeNull();
    expect(Math.abs(l.zoom!.box.y - centre.y), 'back in its place').toBeLessThan(1);
  });

  test('a lifted card leans the way the finger moves, more when faster, and straightens when it stops', async ({ page }) => {
    await openBoard(page, 1);
    await fastFrames(page);
    const v = await getView(page);
    const { hold, lifted } = await liftHand(page, cardWith(v, 'new_server'));
    await fastFrames(page);
    const from = center(lifted.handView!.centre);
    // Slow to the right: small steps with pauses.
    let slow = 0;
    let x = from.x;
    for (let k = 0; k < 4; k++) {
      x += 6;
      await hold.move(x, from.y);
      slow = Math.max(slow, await lean(page));
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(250);
    expect(await rotation(page), 'straight again once the finger stops').toBeCloseTo(0, 3);
    // Fast to the right: big steps back to back.
    let fast = 0;
    for (let k = 0; k < 4; k++) {
      x += 40;
      await hold.move(x, from.y);
      fast = Math.max(fast, await lean(page));
    }
    expect(slow, 'leans right when moving right').toBeGreaterThan(0);
    expect(fast, 'more lean when faster').toBeGreaterThan(slow);
    expect(fast, 'never more than 14 degrees').toBeLessThanOrEqual((14 * Math.PI) / 180 + 1e-6);
    await shot(page, 's15-1-drag-lean');
    // Back to the left: leans left.
    let left = 0;
    for (let k = 0; k < 3; k++) {
      x -= 40;
      await hold.move(x, from.y);
      left = Math.min(left, await lean(page));
    }
    expect(left, 'leans left when moving left').toBeLessThan(0);
    await page.waitForTimeout(250);
    expect(await rotation(page), 'straight again once the finger stops').toBeCloseTo(0, 3);
    // Let go away from every lit place: it glides home (not a jump) and the hand view is back.
    const l = await layout(page);
    const away = center(emptySpot(l));
    await hold.move(away.x, away.y);
    await page.waitForFunction(() => window.__overclock!.layout().drag?.hover === null);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await hold.release();
    await page.waitForFunction(() => window.__overclock!.layout().drag === null);
    const back = (await anims(page)).filter((a) => a.kind === 'hand_return');
    expect(back.length, 'it glides back').toBe(1);
    expect(back[0]!.scheduledMs).toBeGreaterThan(0);
    expect(back[0]!.scheduledMs).toBeLessThanOrEqual(200);
    expect((await layout(page)).handView).not.toBeNull();
  });

  test('swiping in the hand view slides the cards into place instead of jumping', async ({ page }) => {
    await openBoard(page, 1);
    await fastFrames(page);
    const open = await openHand(page, 1);
    await waitIdle(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    const c = center(open.handView!.centre);
    const hold = await flickAt(page, open.handView!.centre);
    const step = Math.max(40, Math.round(open.zoom!.box.width * 0.32));
    for (let k = 1; k <= 4; k++) await hold.move(c.x - (step * 1.2 * k) / 4, c.y);
    await page.waitForFunction(() => window.__overclock!.layout().handView?.index === 2);
    // Mid-slide the new big card is still on its way from the right.
    const mid = await layout(page);
    await hold.release();
    const slides = (await anims(page)).filter((a) => a.kind === 'carousel_slide');
    expect(slides.length).toBeGreaterThan(0);
    for (const s of slides) {
      expect(s.scheduledMs, 'a slide, not a jump').toBeGreaterThan(0);
      expect(s.scheduledMs).toBeLessThanOrEqual(600);
    }
    expect(mid.zoom!.box.x, 'the new card slides in from its side').toBeGreaterThanOrEqual(open.handView!.centre.x - 0.5);
    // And lands exactly in the middle.
    await page.waitForFunction((x) => Math.abs((window.__overclock!.layout().zoom?.box.x ?? -1) - x) < 0.5, open.handView!.centre.x);
  });
});

test.describe('S-15-1 with a mouse', () => {
  test.skip(() => test.info().project.use.hasTouch === true, 'mouse only');

  test('pointing at a hand card lifts it a little and leans it toward the pointer', async ({ page }) => {
    await openBoard(page, 1);
    const l: LayoutSnapshot = await waitIdle(page);
    const card = l.hand[2]!.box;
    // The right part of the card: leans right.
    await page.mouse.move(card.x + card.width * 0.85, card.y + card.height / 2);
    await page.waitForFunction(() => {
      const h = window.__overclock!.layout().hand[2]?.hover;
      return !!h && h.rise > 2 && h.rotation > 0.02;
    });
    let now = await layout(page);
    expect(now.hand[2]!.box, 'its place and touch area stay put').toEqual(card);
    expect(now.hand.filter((h) => h.hover).length).toBe(1);
    // The left part: leans left.
    await page.mouse.move(card.x + card.width * 0.15, card.y + card.height / 2);
    await page.waitForFunction(() => (window.__overclock!.layout().hand[2]?.hover?.rotation ?? 0) < -0.02);
    // Away: back to rest.
    await page.mouse.move(2, 2);
    await page.waitForFunction(() => window.__overclock!.layout().hand.every((h) => !h.hover));
    now = await layout(page);
    expect(now.hand[2]!.box).toEqual(card);
  });
});
