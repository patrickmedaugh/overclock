// Sprint 14 (U4): helpers for the deck sync specs. Each test is its own "device" for the deck
// service's guess limit (`?deckip=`, test builds only), so parallel tests never lock each other out.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { START, press } from './decks';

let n = 0;
/** A "device" name unique to this test run (`deckip=` value). */
export function deckIp(): string {
  const info = test.info();
  return `${info.project.name}-${info.testId}-${info.retry}-${++n}-${Date.now()}`.replace(/[^A-Za-z0-9-]/g, '');
}

/** URLs of every request this page makes to the deck service (`/v1/decks/…`), as they happen. */
export function decksRequests(page: Page): string[] {
  const out: string[] = [];
  page.on('request', (r) => {
    if (/\/v1\/decks\//.test(r.url()) && r.method() === 'POST') out.push(r.url());
  });
  return out;
}

export function syncLine(page: Page): Locator {
  return page.locator(`${START} [data-testid="deck-sync"]`);
}

export function syncInfo(page: Page): Promise<{ status: string; code: string | null; rev: number; syncedRev: number }> {
  return page.evaluate(() => window.__overclockStart!.deckSync());
}

/** Waits until this device's decks are online (the line says so). */
export async function waitSaved(page: Page): Promise<void> {
  await expect.poll(async () => (await syncInfo(page)).status, { timeout: 10_000 }).toBe('saved');
}

/** Decks → My deck code → the code as shown (`KX4P-9MTR-QZ7D`). */
export async function myCode(page: Page): Promise<string> {
  await press(page, page.locator(START).getByRole('button', { name: /My deck code/ }));
  const big = page.locator(`${START} [data-testid="deck-code"]`);
  await expect(big).toHaveText(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/, { timeout: 8000 });
  return (await big.textContent())!;
}

/** Decks → I have a deck code → type it → Link. */
export async function linkCode(page: Page, code: string): Promise<void> {
  await press(page, page.locator(START).getByRole('button', { name: /I have a deck code/ }));
  await page.locator(`${START} [data-testid="deck-code-input"]`).fill(code);
  await press(page, page.locator(START).getByRole('button', { name: /^Link$/ }));
}

/** The names on the Decks list, per side (the standard deck first). */
export function listNames(page: Page, side: 'corp' | 'runner'): Promise<string[]> {
  return page.locator(`${START} .deck-col.${side} [data-testid="deck-item"] b`).allTextContents();
}
