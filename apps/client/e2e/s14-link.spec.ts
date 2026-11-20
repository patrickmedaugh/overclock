// S-14-2: the same decks on two devices. Each device is its own browser context (own storage)
// against the local deck service: My deck code (format, Copy), linking keeps both devices' decks
// (owner Q2 A), changes reach the other device, wiped data comes back with the code, a wrong code
// says so, and too many wrong codes make the device wait.
import { type Browser, type Page, expect, test } from '@playwright/test';
import { START, expectTextFloor, openDeck, openDecks, openStart, press, screenName, seedDecks, shot, standardPlus, storedDeck, tapStart } from './decks';
import { deckIp, linkCode, listNames, myCode, syncInfo, waitSaved } from './s14';

const A_CORP = storedDeck('a-corp', 'corp', 'Desk Corp', standardPlus('corp', {}));
const B_RUN = storedDeck('b-run', 'runner', 'Phone Kate', standardPlus('runner', {}));

/** A second device like this project's (own storage), on the start screen. */
async function device(browser: Browser, seed: Parameters<typeof storedDeck>[] = []): Promise<Page> {
  const use = test.info().project.use;
  const ctx = await browser.newContext({ viewport: use.viewport ?? null, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch, baseURL: use.baseURL });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
  const page = await ctx.newPage();
  if (seed.length > 0) await seedDecks(page, seed.map((s) => storedDeck(...s)));
  await openStart(page, `deckip=${deckIp()}`);
  return page;
}

const err = (page: Page) => page.locator(`${START} [data-testid="deck-link-error"]`);

test('My deck code: 12 letters in three groups, none of 0/O/1/I/L, and a Copy button', async ({ browser }) => {
  const a = await device(browser, [['a-corp', 'corp', 'Desk Corp', standardPlus('corp', {})]]);
  await openDecks(a);
  await waitSaved(a);
  const code = await myCode(a);
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  expect(code).not.toMatch(/[0O1IL]/);
  expect(code.replace(/-/g, '')).toBe((await syncInfo(a)).code);
  await expect(a.locator(START)).toContainText('Keep it safe');
  const copy = a.locator(START).getByRole('button', { name: /^Copy$/ });
  expect((await copy.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await press(a, copy);
  await expect(a.locator(`${START} [data-testid="toast"]`)).toHaveText('Code copied');
  expect(await a.evaluate(() => navigator.clipboard.readText())).toBe(code);
  await expectTextFloor(a);
  await shot(a, 's14-code');
  await a.context().close();
});

test('My deck code on a device with no decks of its own still gives a code', async ({ browser }) => {
  const a = await device(browser);
  await openDecks(a);
  const code = await myCode(a);
  expect(code.replace(/-/g, '')).toBe((await syncInfo(a)).code);
  await a.context().close();
});

test('linking keeps both devices\' decks, and later changes on one reach the other', async ({ browser }) => {
  const a = await device(browser, [['a-corp', A_CORP.side, A_CORP.name, A_CORP.cards]]);
  await openDecks(a);
  await waitSaved(a);
  const code = await myCode(a);
  const b = await device(browser, [['b-run', B_RUN.side, B_RUN.name, B_RUN.cards]]);
  await openDecks(b);
  await linkCode(b, code.toLowerCase().replace(/-/g, ' '));
  await expect.poll(() => screenName(b)).toBe('decks');
  await expect(b.locator(`${START} [data-testid="toast"]`)).toHaveText(/Linked/);
  expect(await listNames(b, 'corp')).toContain('Desk Corp');
  expect(await listNames(b, 'runner')).toContain('Phone Kate');
  await waitSaved(b);
  await shot(b, 's14-linked');
  // Device A: its open Decks list picks up B's deck by itself (the 10 s check).
  await tapStart(a, /^Back$/);
  expect(await screenName(a)).toBe('decks');
  await expect.poll(() => listNames(a, 'runner'), { timeout: 15_000 }).toContain('Phone Kate');
  // Rename on B → shows on A; delete on B → gone on A.
  await openDeck(b, 'a-corp');
  const name = b.locator(`${START} input[data-testid="deck-name"]`);
  await name.fill('Renamed on phone');
  await name.press('Enter');
  await tapStart(b, /^Back$/);
  await waitSaved(b);
  await expect.poll(() => listNames(a, 'corp'), { timeout: 15_000 }).toContain('Renamed on phone');
  await openDeck(b, 'b-run');
  await press(b, b.locator(START).getByRole('button', { name: /^Delete$/ }));
  await press(b, b.locator(`${START} [data-testid="deck-delete-dialog"]`).getByRole('button', { name: /^Delete$/ }));
  await waitSaved(b);
  // A sees it the next time it opens Decks (no wait for the 10 s check).
  await tapStart(a, /^Back$/);
  await openDecks(a);
  await expect.poll(() => listNames(a, 'runner'), { timeout: 8000 }).not.toContain('Phone Kate');
  // Deleted stays deleted: A going online again doesn't bring it back to B.
  await a.evaluate(() => window.__overclockStart!.syncNow());
  await b.evaluate(() => window.__overclockStart!.syncNow());
  expect(await listNames(b, 'runner')).not.toContain('Phone Kate');
  await a.context().close();
  await b.context().close();
});

test('cleared browser data: type the deck code and every deck comes back', async ({ browser }) => {
  const a = await device(browser, [
    ['a-corp', 'corp', 'Desk Corp', standardPlus('corp', {})],
    ['a-run', 'runner', 'Desk Kate', standardPlus('runner', {})],
  ]);
  await openDecks(a);
  await waitSaved(a);
  const code = (await syncInfo(a)).code!;
  // A fresh device (= the same browser after its data was wiped).
  const wiped = await device(browser);
  await openDecks(wiped);
  expect(await listNames(wiped, 'corp')).toHaveLength(1);
  await linkCode(wiped, code);
  await expect.poll(() => screenName(wiped)).toBe('decks');
  expect(await listNames(wiped, 'corp')).toContain('Desk Corp');
  expect(await listNames(wiped, 'runner')).toContain('Desk Kate');
  await a.context().close();
  await wiped.context().close();
});

test('a wrong code says "No decks with that code"; after many wrong tries the device has to wait', async ({ browser }) => {
  const a = await device(browser);
  await openDecks(a);
  await linkCode(a, 'KX4P');
  await expect(err(a)).toHaveText('Deck codes are 12 letters or numbers, like KX4P-9MTR-QZ7D');
  const input = a.locator(`${START} [data-testid="deck-code-input"]`);
  const link = a.locator(START).getByRole('button', { name: /^Link$/ });
  let waited = false;
  for (let i = 0; i < 8 && !waited; i++) {
    await input.fill(`KX4P-9MTR-QZ${'ABCDEFGH'[i]}7`);
    await press(a, link);
    await expect(err(a)).toHaveText(/No decks with that code|Too many wrong codes/);
    waited = /Too many/.test((await err(a).textContent()) ?? '');
    if (!waited) expect(i).toBeLessThan(7);
  }
  expect(waited).toBe(true);
  await expect(err(a)).toHaveText(/^Too many wrong codes\. Try again in \d+ minutes?\.$/);
  await expect(input).toBeDisabled();
  await expectTextFloor(a);
  await shot(a, 's14-wait');
  // Remembered: leaving and coming back keeps the wait.
  await tapStart(a, /^Back$/);
  await press(a, a.locator(START).getByRole('button', { name: /I have a deck code/ }));
  await expect(input).toBeDisabled();
  await expect(err(a)).toHaveText(/Too many wrong codes/);
  await a.context().close();
});

test('the wait says how many minutes (service answer "wait")', async ({ page }) => {
  await page.route(/\/v1\/decks\/sync$/, (route) =>
    route.fulfill({ status: 429, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ v: 1, error: 'wait', retryAfterMs: 180_000 }) }),
  );
  await openStart(page, `deckip=${deckIp()}`);
  await openDecks(page);
  await linkCode(page, 'KX4P-9MTR-QZ7D');
  await expect(err(page)).toHaveText('Too many wrong codes. Try again in 3 minutes.');
  await expect(page.locator(`${START} [data-testid="deck-code-input"]`)).toBeDisabled();
});
