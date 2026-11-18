// QA Sprint 13 (written by QA): S-13-4 in the Android app's bundle (no test hook): a deck made in
// the app is kept in the app's own storage across a reload (the closest automated stand-in for
// closing the app; the real app close on the phone is a manual owner check), and the app's
// picker offers it. Runs in the `android` project (844x390, touch).
import { expect, test } from '@playwright/test';

const START = '#start';

test('app bundle: Decks → New Corp deck → standard → −1 Hedge Fund; kept after a reload; picker shows it dimmed with "1 card short"', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator(START)).toBeVisible();
  const tap = (name: string | RegExp) => page.locator(START).getByRole('button', { name }).tap();
  await tap(/^Decks/);
  await tap('New Corp deck');
  await tap(/Start from the standard deck/);
  await expect(page.locator(`${START} [data-part="size"]`)).toHaveText('45 / 45 cards');
  await page.locator(`${START} [data-testid="deck-row"][data-card="c01"] [data-testid="deck-minus"]`).tap();
  await expect(page.locator(`${START} [data-part="size"]`)).toHaveText('44 / 45 cards');
  await page.reload();
  await expect(page.locator(START)).toBeVisible();
  await tap(/^Decks/);
  const mine = page.locator(`${START} [data-testid="deck-item"]`).filter({ hasText: 'My Corp deck 1' });
  await expect(mine).toContainText('44 cards');
  await expect(mine.locator('.note.bad')).toHaveText('1 card short');
  await tap('Back');
  await tap(/Play on this device/);
  const opt = page.locator(`${START} [data-testid="deck-pick"]`).filter({ hasText: 'My Corp deck 1' });
  await expect(opt).toHaveAttribute('aria-disabled', 'true');
  await expect(opt.locator('.note.bad')).toHaveText('1 card short');
});
