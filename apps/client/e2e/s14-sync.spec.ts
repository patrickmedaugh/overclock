// S-14-1: your decks are saved online. Against the local deck service (wrangler dev, test mode):
// the "✓ Saved online" line, offline → "Saved on this device · goes online when you're connected"
// → back online by itself, offline building and playing exactly as in Sprint 13, and a device with
// only the standard decks sends nothing.
import { type Page, expect, test } from '@playwright/test';
import { START, expectTextFloor, openDeck, openDecks, openStart, press, reopenStart, screenName, seedDecks, shot, standardPlus, storedDeck, tapStart } from './decks';
import { deckIp, decksRequests, syncInfo, syncLine } from './s14';

const SAVED = '✓ Saved online';
const PENDING = "Saved on this device · goes online when you're connected";

/** Makes a new Corp deck from the standard one and goes back to the list. */
async function newCorpDeck(page: Page): Promise<void> {
  await tapStart(page, /New Corp deck/);
  await tapStart(page, /Start from the standard deck/);
  expect(await screenName(page)).toBe('deck');
  await tapStart(page, /^Back$/);
  expect(await screenName(page)).toBe('decks');
}

test('a deck you make goes online: the Decks screen says "✓ Saved online"', async ({ page }) => {
  const requests = decksRequests(page);
  await openStart(page, `deckip=${deckIp()}`);
  await openDecks(page);
  // Nothing of your own yet: no line, nothing sent.
  await expect(syncLine(page)).toBeHidden();
  await newCorpDeck(page);
  await expect(syncLine(page)).toHaveText(SAVED, { timeout: 8000 });
  const info = await syncInfo(page);
  expect(info.code).toMatch(/^[A-HJKMNP-Z2-9]{12}$/);
  expect(info.syncedRev).toBe(info.rev);
  expect(requests.some((r) => r.endsWith('/v1/decks/new'))).toBe(true);
  await expectTextFloor(page);
  await shot(page, 's14-saved');
  // The line and the two buttons fit the title row and are big enough to tap.
  for (const name of [/My deck code/, /I have a deck code/]) {
    const b = (await page.locator(START).getByRole('button', { name }).boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
});

test('offline: the change stays on the device, the line says so, and it goes online by itself when you are back', async ({ page, context }) => {
  await seedDecks(page, [storedDeck('mine', 'corp', 'Mine', standardPlus('corp', {}))]);
  await openStart(page, `deckip=${deckIp()}`);
  await openDecks(page);
  await expect(syncLine(page)).toHaveText(SAVED, { timeout: 8000 });
  const code = (await syncInfo(page)).code;
  await context.setOffline(true);
  await openDeck(page, 'mine');
  const name = page.locator(`${START} input[data-testid="deck-name"]`);
  await name.fill('Flight mode deck');
  await name.press('Enter');
  await tapStart(page, /^Back$/);
  await expect(syncLine(page)).toHaveText(PENDING, { timeout: 8000 });
  await shot(page, 's14-pending');
  await expectTextFloor(page);
  // Kept on the device: a reload (still offline is not possible with a page load; the store is read again).
  const stored = await page.evaluate(() => window.__overclockStart!.decks());
  expect(stored.decks[0]!.name).toBe('Flight mode deck');
  // Back online: no tap needed.
  await context.setOffline(false);
  await expect(syncLine(page)).toHaveText(SAVED, { timeout: 10_000 });
  const info = await syncInfo(page);
  expect(info.code).toBe(code);
  expect(info.syncedRev).toBe(info.rev);
});

test('offline from the start: build a deck and play it on this device exactly as before', async ({ page, context }) => {
  await openStart(page, `deckip=${deckIp()}`);
  await context.setOffline(true);
  await openDecks(page);
  await newCorpDeck(page);
  await expect(syncLine(page)).toHaveText(PENDING, { timeout: 8000 });
  const id = (await page.evaluate(() => window.__overclockStart!.decks())).decks[0]!.id;
  await tapStart(page, /^Back$/);
  await tapStart(page, /Play on this device/);
  await press(page, page.locator(`${START} [data-testid="deck-pick"][data-deck="${id}"]`));
  await press(page, page.locator(START).getByRole('button', { name: /^Start$/ }));
  await page.waitForFunction(() => !!window.__overclock);
  await expect(page.locator(START)).toBeHidden();
  const opts = await page.evaluate(() => window.__overclockStart!.gameOptions());
  expect(opts?.decks?.corp?.cards.length).toBe(45);
  await context.setOffline(false);
});

test('a device with only the standard decks sends nothing online', async ({ page }) => {
  const requests = decksRequests(page);
  await openStart(page, `deckip=${deckIp()}`);
  await openDecks(page);
  await expect(syncLine(page)).toBeHidden();
  await page.waitForTimeout(1500);
  await tapStart(page, /^Back$/);
  await openDecks(page);
  await page.evaluate(() => window.__overclockStart!.syncNow());
  await reopenStart(page);
  await page.waitForTimeout(500);
  expect(requests).toEqual([]);
  expect((await syncInfo(page)).status).toBe('none');
});
