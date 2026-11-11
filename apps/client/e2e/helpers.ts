import { type Page, expect } from '@playwright/test';
import type { Box, LayoutSnapshot } from '../src/hook-types';

export type { Box, LayoutSnapshot };

/** Opens the board with a fixed deal and waits until the test hook is live. */
export async function openBoard(page: Page, seed = 1): Promise<void> {
  await page.goto(`./?seed=${seed}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
}

export function layout(page: Page): Promise<LayoutSnapshot> {
  return page.evaluate(() => window.__overclock!.layout());
}

export async function waitIdle(page: Page): Promise<LayoutSnapshot> {
  await page.waitForFunction(() => !window.__overclock!.layout().animating, undefined, { polling: 'raf' });
  return layout(page);
}

export function center(b: Box): { x: number; y: number } {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

function isTouch(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1000) < 600;
}

/** A real tap: touchscreen on the phone project, mouse click on desktop. */
export async function tap(page: Page, b: Box): Promise<void> {
  const { x, y } = center(b);
  if (isTouch(page)) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/**
 * Presses and holds on a box. Returns a function that releases it.
 * Phone uses raw touch events (CDP) so it exercises the real touch path.
 */
export async function pressAndHold(page: Page, b: Box): Promise<() => Promise<void>> {
  const { x, y } = center(b);
  if (isTouch(page)) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    return async () => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    };
  }
  await page.mouse.move(x, y);
  await page.mouse.down();
  return async () => {
    await page.mouse.up();
  };
}

export function inside(b: Box, vw: number, vh: number): boolean {
  const eps = 0.5;
  return b.width > 0 && b.height > 0 && b.x >= -eps && b.y >= -eps && b.x + b.width <= vw + eps && b.y + b.height <= vh + eps;
}

export function overlaps(a: Box, b: Box): boolean {
  const eps = 0.5;
  return a.x + eps < b.x + b.width && b.x + eps < a.x + a.width && a.y + eps < b.y + b.height && b.y + eps < a.y + a.height;
}

/** Named boxes for every board element (not counting hand cards). */
export function boardElements(l: LayoutSnapshot): [string, Box][] {
  return [
    ['corp deck', l.corp.deck],
    ['corp credits', l.corp.credits],
    ['corp clicks', l.corp.clicks],
    ['runner deck', l.runner.deck],
    ['runner credits', l.runner.credits],
    ['runner clicks', l.runner.clicks],
  ];
}

/** Asserts every element is on screen and no two elements overlap. */
export function expectCleanLayout(l: LayoutSnapshot): void {
  const { width: vw, height: vh } = l.viewport;
  const elements = boardElements(l);
  const hand = l.hand.map((h, i): [string, Box] => [`hand card ${i} (${h.cardId})`, h.box]);
  for (const [name, b] of [...elements, ...hand]) {
    expect(inside(b, vw, vh), `${name} ${JSON.stringify(b)} is fully on screen`).toBe(true);
  }
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const [an, a] = elements[i]!;
      const [bn, b] = elements[j]!;
      expect(overlaps(a, b), `${an} overlaps ${bn}`).toBe(false);
    }
    for (const [hn, h] of hand) {
      expect(overlaps(elements[i]![1], h), `${elements[i]![0]} overlaps ${hn}`).toBe(false);
    }
  }
  // Hand cards may only overlap when there are too many to fit; with <= 10
  // cards they sit side by side.
  if (hand.length <= 10) {
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        expect(overlaps(hand[i]![1], hand[j]![1]), `${hand[i]![0]} overlaps ${hand[j]![0]}`).toBe(false);
      }
    }
  }
}
