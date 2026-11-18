// Sprint 13 (U4): helpers for the deck builder specs. Decks are seeded straight into this
// device's store (`overclock.decks.v1`) before the page loads, once per browser context, so a
// reload ("closing the browser") keeps whatever the test changed.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { IDENTITIES, STANDARD_DECKS, countsOf } from '@overclock/cards';
import type { Side } from '@overclock/engine';
import type { DeckStore, StoredDeck } from '@overclock/match';
import type { Box } from './helpers';

export const START = '#start';
export const DECKS_KEY = 'overclock.decks.v1';

/** A stored deck for seeding (`cards` = id → copies). */
export function storedDeck(id: string, side: Side, name: string, cards: Record<string, number>): StoredDeck {
  return { id, side, name, identity: IDENTITIES[side], cards, createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000 };
}

/** The standard deck's counts plus/minus `delta` (0 or less removes the card). */
export function standardPlus(side: Side, delta: Record<string, number>): Record<string, number> {
  const c = { ...countsOf(STANDARD_DECKS[side]) };
  for (const [id, d] of Object.entries(delta)) {
    const n = (c[id] ?? 0) + d;
    if (n > 0) c[id] = n;
    else delete c[id];
  }
  return c;
}

/** Writes `decks` into the deck store before the first page load of this context (not on later reloads). */
export async function seedDecks(page: Page, decks: StoredDeck[]): Promise<void> {
  const store: DeckStore = { format: 1, decks };
  await page.addInitScript(
    ({ key, raw }) => {
      if (localStorage.getItem('e2e.decksSeeded') === null) {
        localStorage.setItem(key, raw);
        localStorage.setItem('e2e.decksSeeded', '1');
      }
    },
    { key: DECKS_KEY, raw: JSON.stringify(store) },
  );
}

export async function openStart(page: Page, query = ''): Promise<void> {
  await page.goto(`./${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
}

/** Reload, as closing and reopening the browser or app would (the store is read again). */
export async function reopenStart(page: Page): Promise<void> {
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
}

/** A real tap on phones, a click on desktop. `force`: dimmed (aria-disabled) buttons too. */
export async function press(page: Page, target: Locator, force = false): Promise<void> {
  if (test.info().project.use.hasTouch) await target.tap({ force });
  else await target.click({ force });
}

export async function tapStart(page: Page, name: string | RegExp): Promise<void> {
  await press(page, page.locator(START).getByRole('button', { name }));
}

export function screenName(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__overclockStart!.screen());
}

export function storedDecks(page: Page): Promise<DeckStore> {
  return page.evaluate(() => window.__overclockStart!.decks());
}

/** The editor row of a card. */
export function row(page: Page, cardId: string): Locator {
  return page.locator(`${START} [data-testid="deck-row"][data-card="${cardId}"]`);
}

export function bar(page: Page): Locator {
  return page.locator(`${START} [data-testid="deck-bar"]`);
}

export function barPart(page: Page, part: 'size' | 'influence' | 'agenda' | 'note'): Locator {
  return page.locator(`${START} [data-testid="deck-bar"] [data-part="${part}"]`);
}

export async function plus(page: Page, cardId: string, force = false): Promise<void> {
  await press(page, row(page, cardId).getByTestId('deck-plus'), force);
}

export async function minus(page: Page, cardId: string, force = false): Promise<void> {
  await press(page, row(page, cardId).getByTestId('deck-minus'), force);
}

/** Opens Decks from the home screen. */
export async function openDecks(page: Page): Promise<void> {
  await tapStart(page, /^Decks/);
  expect(await screenName(page)).toBe('decks');
}

/** Opens a deck from the Decks list. */
export async function openDeck(page: Page, id: string): Promise<void> {
  await press(page, page.locator(`${START} [data-testid="deck-item"][data-deck="${id}"]`));
  expect(await screenName(page)).toBe('deck');
}

export function boxOf(l: Locator): Promise<Box> {
  return l.evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

/** Every visible text in the start screen is at least `min` px (the 10 px floor). */
export async function expectTextFloor(page: Page, min = 10): Promise<void> {
  const small = await page.locator(START).evaluate((root, floor) => {
    const out: string[] = [];
    const walk = (n: Element) => {
      for (const c of n.childNodes) {
        if (c.nodeType === Node.TEXT_NODE && (c.textContent ?? '').trim() !== '') {
          const e = c.parentElement!;
          if (e.offsetParent === null && getComputedStyle(e).position !== 'fixed') continue;
          const px = parseFloat(getComputedStyle(e).fontSize);
          if (px < floor) out.push(`${(c.textContent ?? '').trim()} (${px}px)`);
        } else if (c.nodeType === Node.ELEMENT_NODE) walk(c as Element);
      }
    };
    walk(root);
    return out;
  }, min);
  expect(small, 'text under the floor').toEqual([]);
}

/** Attached to the report; `S13_SHOTS=<dir>` also writes them there (for review). */
export async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.S13_SHOTS;
  const path = dir ? `${dir}/${test.info().project.name}-${name}.png` : undefined;
  await test.info().attach(name, { body: await page.screenshot(path ? { path } : {}), contentType: 'image/png' });
}
