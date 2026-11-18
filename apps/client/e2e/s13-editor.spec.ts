// S-13-2: add and remove cards. Every card of the side, grouped by type with name, cost,
// influence dots and "2 / 3"; + / − (44 px, < 100 ms to the new count and bar); hold to zoom;
// every row reachable by scrolling; the In deck switch.
import { deckPool, getCard } from '@overclock/cards';
import { expect, test } from '@playwright/test';
import {
  START,
  bar,
  boxOf,
  expectTextFloor,
  minus,
  openDeck,
  openDecks,
  openStart,
  plus,
  press,
  row,
  seedDecks,
  shot,
  standardPlus,
  storedDeck,
} from './decks';

const CORP = 'd-corp';
const RUNNER = 'd-run';

test.beforeEach(async ({ page }) => {
  await seedDecks(page, [
    storedDeck(CORP, 'corp', 'My Corp deck 1', standardPlus('corp', { c06: -1 })),
    storedDeck(RUNNER, 'runner', 'My Runner deck 1', standardPlus('runner', {})),
  ]);
  await openStart(page);
  await openDecks(page);
});

test('Corp editor: identity on top, the 24 Corp cards grouped Agendas, ICE, Assets, Upgrades, Operations', async ({ page }) => {
  await openDeck(page, CORP);
  await expect(page.getByTestId('deck-identity')).toContainText('Haas-Bioroid: Engineering the Future');
  const rows = page.locator(`${START} [data-testid="deck-row"]`);
  await expect(rows).toHaveCount(24);
  const groups = await page.locator(`${START} .deck-group`).allTextContents();
  expect(groups).toEqual(['Agendas', 'ICE', 'Assets', 'Upgrades', 'Operations']);
  // Rows in the pool's order (by type, then name), each with name, cost, dots and "n / 3".
  const ids = await rows.evaluateAll((rs) => rs.map((r) => (r as HTMLElement).dataset.card));
  expect(ids).toEqual(deckPool('corp').flatMap((g) => g.cards.map((c) => c.id)));
  const enigma = row(page, 'c06');
  await expect(enigma.locator('.name')).toHaveText('Enigma');
  await expect(enigma.locator('.cost')).toHaveText(String(getCard('c06')!.cost));
  await expect(enigma.getByTestId('deck-count')).toHaveText('1 / 3');
  await expect(row(page, 'c07').locator('.dots')).toHaveText('●●'); // Neural Katana: 2 influence
  await expectTextFloor(page);
  await shot(page, 'editor-corp');
});

test('Runner editor: the 20 Runner cards grouped Events, Hardware, Resources, Programs', async ({ page }) => {
  await openDeck(page, RUNNER);
  await expect(page.locator(`${START} [data-testid="deck-row"]`)).toHaveCount(20);
  expect(await page.locator(`${START} .deck-group`).allTextContents()).toEqual(['Events', 'Hardware', 'Resources', 'Programs']);
  await expect(page.getByTestId('deck-identity')).toContainText('Kate');
  await shot(page, 'editor-runner');
});

test('+ adds a copy and − removes one (down to 0); the count and the bar change within 100 ms', async ({ page }) => {
  await openDeck(page, CORP);
  const size = bar(page).locator('[data-part="size"]');
  await expect(size).toHaveText('44 / 45 cards');
  // Time from the finger going down to the bar's new text (in the page's own clock).
  const timedTap = async (fn: () => Promise<void>): Promise<number> => {
    await page.evaluate(() => {
      const w = window as unknown as { __t: { down: number; changed: number } };
      w.__t = { down: 0, changed: 0 };
      document.addEventListener('pointerdown', (e) => (w.__t.down = e.timeStamp), { once: true, capture: true });
      document.addEventListener('mousedown', (e) => (w.__t.down ||= e.timeStamp), { once: true, capture: true });
      const bar = document.querySelector('[data-testid="deck-bar"]')!;
      const mo = new MutationObserver(() => {
        w.__t.changed = performance.now();
        mo.disconnect();
      });
      mo.observe(bar, { subtree: true, characterData: true, childList: true });
    });
    await fn();
    await page.waitForFunction(() => (window as unknown as { __t: { changed: number } }).__t.changed > 0);
    return page.evaluate(() => {
      const t = (window as unknown as { __t: { down: number; changed: number } }).__t;
      return t.changed - t.down;
    });
  };
  const up = await timedTap(() => plus(page, 'c06'));
  await expect(row(page, 'c06').getByTestId('deck-count')).toHaveText('2 / 3');
  await expect(size).toHaveText('45 / 45 cards');
  expect(up, '+ to the new bar (ms)').toBeLessThan(100);
  const down = await timedTap(() => minus(page, 'c06'));
  await expect(size).toHaveText('44 / 45 cards');
  expect(down, '− to the new bar (ms)').toBeLessThan(100);
  await minus(page, 'c06');
  await expect(row(page, 'c06').getByTestId('deck-count')).toHaveText('0 / 3');
  // At 0 the − is dimmed and does nothing.
  await expect(row(page, 'c06').getByTestId('deck-minus')).toHaveAttribute('aria-disabled', 'true');
  await minus(page, 'c06', true);
  await expect(row(page, 'c06').getByTestId('deck-count')).toHaveText('0 / 3');
  await expect(size).toHaveText('43 / 45 cards');
});

test('hold a card: its full face as in a game (text and numbers); letting go returns to the list', async ({ page }) => {
  await openDeck(page, CORP);
  const info = row(page, 'c17').locator('.card-info'); // Viktor 1.0
  await info.scrollIntoViewIfNeeded();
  const b = await boxOf(info);
  const x = b.x + 30;
  const y = b.y + b.height / 2;
  // Touch hold on phones (CDP touch events), mouse hold on desktop.
  const touch = test.info().project.use.hasTouch;
  const cdp = touch ? await page.context().newCDPSession(page) : null;
  if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  else {
    await page.mouse.move(x, y);
    await page.mouse.down();
  }
  await expect(page.getByTestId('deck-zoom')).toBeVisible();
  const z = await page.evaluate(() => window.__overclockStart!.zoom());
  expect(z?.cardId).toBe('c17');
  expect(z!.overflow).toBe(false);
  expect(z!.texts).toContain('Viktor 1.0');
  expect(z!.texts.some((t) => t.includes('Strength'))).toBe(true);
  // Big enough to read: the zoom face is drawn at the game's zoom size, inside the screen.
  const zb = await boxOf(page.getByTestId('deck-zoom').locator('canvas'));
  const vp = page.viewportSize()!;
  expect(zb.height).toBeGreaterThan(Math.min(250, vp.height * 0.8));
  expect(zb.y).toBeGreaterThanOrEqual(0);
  expect(zb.y + zb.height).toBeLessThanOrEqual(vp.height + 0.5);
  await shot(page, 'editor-zoom');
  if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  else await page.mouse.up();
  await expect(page.getByTestId('deck-zoom')).toHaveCount(0);
  // The hold changed nothing.
  await expect(row(page, 'c17').getByTestId('deck-count')).toHaveText('2 / 3');
});

for (const id of [CORP, RUNNER]) {
  test(`every card reachable by scrolling; + and − at least 44 px (${id === CORP ? 'Corp' : 'Runner'})`, async ({ page }) => {
    await openDeck(page, id);
    const list = page.getByTestId('deck-list');
    const lb = await boxOf(list);
    const vp = page.viewportSize()!;
    expect(lb.y + lb.height).toBeLessThanOrEqual(vp.height + 0.5);
    const rows = page.locator(`${START} [data-testid="deck-row"]`);
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      const r = rows.nth(i);
      // Native scroll (as a thumb would), then the row's buttons are inside the list's window.
      await r.evaluate((e) => e.scrollIntoView({ block: 'nearest' }));
      for (const t of ['deck-minus', 'deck-plus']) {
        const b = await boxOf(r.getByTestId(t));
        expect(b.width, `${t} width`).toBeGreaterThanOrEqual(44);
        expect(b.height, `${t} height`).toBeGreaterThanOrEqual(44);
        expect(b.y, `${t} visible`).toBeGreaterThanOrEqual(lb.y - 0.5);
        expect(b.y + b.height, `${t} visible`).toBeLessThanOrEqual(lb.y + lb.height + 0.5);
        expect(b.x + b.width).toBeLessThanOrEqual(vp.width + 0.5);
      }
    }
    // The last card can be changed after scrolling to it.
    const last = rows.nth(n - 1);
    const lastId = await last.getAttribute('data-card');
    const before = await last.getByTestId('deck-count').textContent();
    await minus(page, lastId!);
    await expect(last.getByTestId('deck-count')).not.toHaveText(before!);
    await expectTextFloor(page);
    await shot(page, `editor-scrolled-${id}`);
  });
}

test('the list scrolls with a thumb swipe (native scrolling)', async ({ page }) => {
  test.skip(!test.info().project.use.hasTouch, 'touch only');
  await openDeck(page, CORP);
  const list = page.getByTestId('deck-list');
  const lb = await boxOf(list);
  const cdp = await page.context().newCDPSession(page);
  // A thumb on a card's name (not a button), dragged up.
  const info = await boxOf(row(page, 'c20').locator('.names'));
  const x = info.x + 10;
  const y0 = Math.min(info.y + info.height / 2, lb.y + lb.height - 10);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 - i * 15 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => list.evaluate((e) => e.scrollTop)).toBeGreaterThan(20);
  // Scrolling is not a hold: no zoom, nothing changed.
  await expect(page.getByTestId('deck-zoom')).toHaveCount(0);
});

test('In deck hides the cards with 0 copies; switching it off shows them again', async ({ page }) => {
  await openDeck(page, CORP);
  const rows = page.locator(`${START} [data-testid="deck-row"]`);
  const sw = page.getByTestId('deck-in-deck');
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  const inDeck = await rows.evaluateAll((rs) => rs.filter((r) => (r as HTMLElement).dataset.count !== '0').length);
  await press(page, sw);
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await expect(rows.filter({ visible: true })).toHaveCount(inDeck);
  await expect(row(page, 'c08')).toBeHidden(); // Hostile Takeover: 0 copies
  await shot(page, 'editor-in-deck');
  await press(page, sw);
  await expect(rows.filter({ visible: true })).toHaveCount(24);
});
