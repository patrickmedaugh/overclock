// S-13-1 (the Decks screen) and S-13-4 (decks stay on the device): Decks button, the list,
// New deck (standard / empty), standard decks read only + Copy to edit, Back, kept across a
// reload (closing the browser), rename, delete.
import { expect, test } from '@playwright/test';
import {
  START,
  boxOf,
  expectTextFloor,
  openDeck,
  openDecks,
  openStart,
  press,
  reopenStart,
  screenName,
  seedDecks,
  shot,
  standardPlus,
  storedDeck,
  storedDecks,
  tapStart,
  plus,
  minus,
} from './decks';

test.describe('S-13-1 the Decks screen', () => {
  test('the start screen has Decks next to Play on this device and Play online', async ({ page }) => {
    await openStart(page);
    const buttons = page.locator(`${START} button.choice`);
    await expect(buttons).toHaveCount(3);
    const names = await buttons.evaluateAll((bs) => bs.map((b) => b.querySelector('b')!.textContent));
    expect(names).toEqual(['Play on this device', 'Play online', 'Decks']);
    // Side by side, inside the screen, big enough to tap, no overlap.
    const vp = page.viewportSize()!;
    const boxes = await Promise.all([0, 1, 2].map((i) => boxOf(buttons.nth(i))));
    for (const b of boxes) {
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(vp.width + 0.5);
      expect(b.y + b.height).toBeLessThanOrEqual(vp.height + 0.5);
    }
    expect(boxes[0]!.x + boxes[0]!.width).toBeLessThanOrEqual(boxes[1]!.x);
    expect(boxes[1]!.x + boxes[1]!.width).toBeLessThanOrEqual(boxes[2]!.x);
    await expectTextFloor(page);
    await shot(page, 'home');
  });

  test('first time: the two standard decks with their counts, New Corp deck / New Runner deck; Back returns', async ({ page }) => {
    await openStart(page);
    await openDecks(page);
    const items = page.locator(`${START} [data-testid="deck-item"]`);
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('Standard Corp deck (Haas-Bioroid)');
    await expect(items.nth(0)).toContainText('45 cards');
    await expect(items.nth(0)).toContainText('Ready to play');
    await expect(items.nth(1)).toContainText('Standard Runner deck (Kate)');
    await expect(items.nth(1)).toContainText('45 cards');
    await expect(page.locator(START).getByRole('button', { name: 'New Corp deck' })).toBeVisible();
    await expect(page.locator(START).getByRole('button', { name: 'New Runner deck' })).toBeVisible();
    await expectTextFloor(page);
    await shot(page, 'decks-first');
    await tapStart(page, 'Back');
    expect(await screenName(page)).toBe('home');
    // The phone's Back button too.
    await openDecks(page);
    expect(await page.evaluate(() => window.__overclockStart!.back())).toBe('close_panel');
    expect(await screenName(page)).toBe('home');
  });

  test('New Corp deck: Start from the standard deck -> editor "My Corp deck 1" with the 45 cards', async ({ page }) => {
    await openStart(page);
    await openDecks(page);
    await tapStart(page, 'New Corp deck');
    expect(await screenName(page)).toBe('new_deck');
    await expect(page.locator(START).getByRole('button', { name: /Start from the standard deck/ })).toBeVisible();
    await expect(page.locator(START).getByRole('button', { name: /Start empty/ })).toBeVisible();
    await shot(page, 'new-deck');
    await tapStart(page, /Start from the standard deck/);
    expect(await screenName(page)).toBe('deck');
    await expect(page.getByTestId('deck-name')).toHaveValue('My Corp deck 1');
    await expect(page.locator(`${START} [data-part="size"]`)).toHaveText('45 / 45 cards');
    // Back: the list shows it.
    await tapStart(page, 'Back');
    await expect(page.locator(`${START} [data-testid="deck-item"]`).filter({ hasText: 'My Corp deck 1' })).toContainText('45 cards');
  });

  test('New Runner deck: Start empty -> editor "My Runner deck 1" with no cards', async ({ page }) => {
    await openStart(page);
    await openDecks(page);
    await tapStart(page, 'New Runner deck');
    await tapStart(page, /Start empty/);
    await expect(page.getByTestId('deck-name')).toHaveValue('My Runner deck 1');
    await expect(page.locator(`${START} [data-part="size"]`)).toHaveText('0 / 45 cards');
    await expect(page.locator(`${START} [data-part="note"]`)).toContainText('45 cards short');
  });

  test('a standard deck can be read but not changed; Copy to edit makes your own copy', async ({ page }) => {
    await openStart(page);
    await openDecks(page);
    await openDeck(page, 'standard-corp');
    await expect(page.getByTestId('deck-name')).toHaveText('Standard Corp deck (Haas-Bioroid)');
    await expect(page.locator(`${START} [data-testid="deck-plus"], ${START} [data-testid="deck-minus"]`)).toHaveCount(0);
    await expect(page.locator(START).getByRole('button', { name: 'Delete' })).toHaveCount(0);
    // Its cards are listed with their copies.
    await expect(page.locator(`${START} [data-testid="deck-row"][data-card="c01"]`)).toContainText('3 / 3');
    await shot(page, 'standard-read-only');
    await tapStart(page, 'Copy to edit');
    expect(await screenName(page)).toBe('deck');
    await expect(page.getByTestId('deck-name')).toHaveValue('My Corp deck 1');
    await expect(page.locator(`${START} [data-testid="deck-plus"]`).first()).toBeVisible();
    const store = await storedDecks(page);
    expect(store.decks).toHaveLength(1);
    expect(store.decks[0]!.cards['c01']).toBe(3);
  });
});

test.describe('S-13-4 decks stay on this device', () => {
  test('a change is kept with no Save button, even when the page closes straight from the editor', async ({ page }) => {
    await seedDecks(page, [storedDeck('d-corp', 'corp', 'Glacier', standardPlus('corp', {}))]);
    await openStart(page);
    await openDecks(page);
    await openDeck(page, 'd-corp');
    await expect(page.locator(START).getByRole('button', { name: /^Save/ })).toHaveCount(0);
    for (let i = 0; i < 3; i++) await minus(page, 'c01');
    await expect(page.locator(`${START} [data-part="size"]`)).toHaveText('42 / 45 cards');
    // Close straight from the editor (no Back).
    await reopenStart(page);
    await openDecks(page);
    const item = page.locator(`${START} [data-deck="d-corp"]`);
    await expect(item).toContainText('Glacier');
    await expect(item).toContainText('42 cards');
    await expect(item).toContainText('3 cards short');
    await expect(item).toHaveAttribute('data-ready', 'false');
  });

  test('after closing the browser: name, card count and a Ready tick or a short red note', async ({ page }) => {
    await seedDecks(page, [
      storedDeck('d-ready', 'runner', 'Rig builder', standardPlus('runner', {})),
      storedDeck('d-short', 'corp', 'Half done', standardPlus('corp', { c01: -3, c03: -1 })),
    ]);
    await openStart(page);
    await openDecks(page);
    await reopenStart(page);
    await openDecks(page);
    const ready = page.locator(`${START} [data-deck="d-ready"]`);
    await expect(ready).toContainText('Rig builder');
    await expect(ready).toContainText('45 cards');
    await expect(ready.locator('.note.ok')).toHaveText('✓ Ready to play');
    const short = page.locator(`${START} [data-deck="d-short"]`);
    await expect(short).toContainText('41 cards');
    await expect(short.locator('.note.bad')).toHaveText('4 cards short');
    await expectTextFloor(page);
    await shot(page, 'decks-kept');
  });

  test('tap the name in the editor to rename the deck', async ({ page }) => {
    await seedDecks(page, [storedDeck('d-corp', 'corp', 'My Corp deck 1', standardPlus('corp', {}))]);
    await openStart(page);
    await openDecks(page);
    await openDeck(page, 'd-corp');
    const name = page.getByTestId('deck-name');
    await press(page, name);
    await name.fill('Bioroid wall');
    await name.press('Enter');
    await tapStart(page, 'Back');
    await expect(page.locator(`${START} [data-deck="d-corp"]`)).toContainText('Bioroid wall');
    await reopenStart(page);
    await openDecks(page);
    await expect(page.locator(`${START} [data-deck="d-corp"]`)).toContainText('Bioroid wall');
  });

  test('Delete asks first; Keep keeps it, Delete removes it; the standard decks have no Delete', async ({ page }) => {
    await seedDecks(page, [storedDeck('d-run', 'runner', 'Throwaway', standardPlus('runner', {}))]);
    await openStart(page);
    await openDecks(page);
    await openDeck(page, 'd-run');
    await tapStart(page, 'Delete');
    const dialog = page.getByTestId('deck-delete-dialog');
    await expect(dialog).toContainText('Delete "Throwaway"?');
    await shot(page, 'delete-ask');
    await tapStart(page, 'Keep');
    await expect(dialog).toHaveCount(0);
    // The phone's Back closes the question first.
    await tapStart(page, 'Delete');
    expect(await page.evaluate(() => window.__overclockStart!.back())).toBe('close_panel');
    await expect(dialog).toHaveCount(0);
    expect(await screenName(page)).toBe('deck');
    await tapStart(page, 'Delete');
    await press(page, dialog.getByRole('button', { name: 'Delete' }));
    expect(await screenName(page)).toBe('decks');
    await expect(page.locator(`${START} [data-deck="d-run"]`)).toHaveCount(0);
    await reopenStart(page);
    await openDecks(page);
    await expect(page.locator(`${START} [data-deck="d-run"]`)).toHaveCount(0);
    expect((await storedDecks(page)).decks).toEqual([]);
    for (const id of ['standard-corp', 'standard-runner']) {
      await openDeck(page, id);
      await expect(page.locator(START).getByRole('button', { name: 'Delete' })).toHaveCount(0);
      await tapStart(page, 'Back');
    }
  });

  test('a + right before closing is kept too', async ({ page }) => {
    await seedDecks(page, [storedDeck('d-run', 'runner', 'Quick', standardPlus('runner', { r14: -3 }))]);
    await openStart(page);
    await openDecks(page);
    await openDeck(page, 'd-run');
    await plus(page, 'r14');
    await reopenStart(page);
    expect((await storedDecks(page)).decks[0]!.cards['r14']).toBe(1);
  });
});
