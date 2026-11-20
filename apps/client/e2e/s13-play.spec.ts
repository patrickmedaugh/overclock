// S-13-5: pick your decks for a pass-the-phone game. The picker (standard decks picked, Start),
// your own decks dealt (R&D + HQ = the deck), not-Ready decks can't be picked, Continue keeps the
// game's own copy after the deck is edited or deleted, online games say they use the standard
// decks; New game after an own-deck game opens the picker with the same decks (lead decision).
import { deckFromCounts } from '@overclock/cards';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { START, minus, openDeck, openDecks, openStart, press, reopenStart, screenName, seedDecks, shot, standardPlus, storedDeck, tapStart } from './decks';

const CORP46 = storedDeck('corp46', 'corp', 'Big Corp', standardPlus('corp', { c06: 1 }));
const RUN48 = storedDeck('run48', 'runner', 'Splash Kate', standardPlus('runner', { r06: 1, r01: 1, r08: 1 }));
const SHORT = storedDeck('short', 'corp', 'Half done', standardPlus('corp', { c10: -1, c01: -3 }));

const pickOpt = (page: Page, id: string) => page.locator(`${START} [data-testid="deck-pick"][data-deck="${id}"]`);

async function startedGame(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.__overclock);
  await expect(page.locator(START)).toBeHidden();
}

/** Moves in the pass-the-phone save (-1: none). */
function savedMoves(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('overclock.hotseat.v1');
    return raw ? (JSON.parse(raw) as { actions: unknown[] }).actions.length : -1;
  });
}

test.beforeEach(async ({ page }) => {
  await seedDecks(page, [CORP46, RUN48, SHORT]);
});

test('Play on this device: Corp deck and Runner deck choices, standard decks picked, and Start', async ({ page }) => {
  await openStart(page);
  await tapStart(page, /Play on this device/);
  expect(await screenName(page)).toBe('here');
  await expect(page.locator(START).getByRole('radiogroup', { name: 'Corp deck' })).toBeVisible();
  await expect(page.locator(START).getByRole('radiogroup', { name: 'Runner deck' })).toBeVisible();
  await expect(pickOpt(page, 'standard-corp')).toHaveAttribute('aria-checked', 'true');
  await expect(pickOpt(page, 'standard-runner')).toHaveAttribute('aria-checked', 'true');
  await expect(pickOpt(page, 'corp46')).toHaveAttribute('aria-checked', 'false');
  const start = page.locator(START).getByRole('button', { name: /^Start$/ });
  await expect(start).toBeVisible();
  const b = (await start.boundingBox())!;
  expect(b.height).toBeGreaterThanOrEqual(44);
  await shot(page, 'picker');
  await press(page, start);
  await startedGame(page);
  // Standard picks: today's game exactly (no deck lists in its options).
  const opts = await page.evaluate(() => window.__overclockStart!.gameOptions());
  expect(opts && 'decks' in opts).toBe(false);
  const v = await page.evaluate(() => window.__overclock!.getView());
  expect(v.players.corp.handCount + v.players.corp.deckCount).toBe(45);
  expect(v.players.runner.handCount + v.players.runner.deckCount).toBe(45);
});

test('your own decks: R&D and HQ hold exactly the 46 cards built, and the Runner gets his 48', async ({ page }) => {
  await openStart(page);
  await tapStart(page, /Play on this device/);
  await press(page, pickOpt(page, 'corp46'));
  await press(page, pickOpt(page, 'run48'));
  await expect(pickOpt(page, 'corp46')).toHaveAttribute('aria-checked', 'true');
  await expect(pickOpt(page, 'standard-corp')).toHaveAttribute('aria-checked', 'false');
  await expect(pickOpt(page, 'run48')).toHaveAttribute('aria-checked', 'true');
  await shot(page, 'picker-own');
  await tapStart(page, /^Start$/);
  await startedGame(page);
  const v = await page.evaluate(() => window.__overclock!.getView());
  expect(v.players.corp.handCount + v.players.corp.deckCount).toBe(46);
  expect(v.players.runner.handCount + v.players.runner.deckCount).toBe(48);
  // The game holds those exact lists (the Corp's hand is part of them).
  const opts = (await page.evaluate(() => window.__overclockStart!.gameOptions()))!;
  expect(opts.decks?.corp).toEqual(deckFromCounts(CORP46.identity, CORP46.cards));
  expect(opts.decks?.runner).toEqual(deckFromCounts(RUN48.identity, RUN48.cards));
  const pool = [...opts.decks!.corp!.cards];
  for (const id of v.players.corp.hand!) {
    const i = pool.indexOf(id);
    expect(i, `${id} in the deck`).toBeGreaterThanOrEqual(0);
    pool.splice(i, 1);
  }
});

test('a deck that isn\'t Ready to play is dimmed with its red note and can\'t be picked', async ({ page }) => {
  await openStart(page);
  await tapStart(page, /Play on this device/);
  const short = pickOpt(page, 'short');
  await expect(short).toHaveAttribute('aria-disabled', 'true');
  await expect(short).toHaveClass(/\bdim\b/);
  await expect(short.locator('.note.bad')).toHaveText('4 cards short');
  expect(await short.evaluate((e) => Number(getComputedStyle(e).opacity))).toBeLessThan(0.8);
  await press(page, short, true);
  await expect(short).toHaveAttribute('aria-checked', 'false');
  await expect(pickOpt(page, 'standard-corp')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('toast')).toHaveText('4 cards short');
  // A New-game link naming it falls back to the standard deck too.
  await openStart(page, 'play=pick&corp=short&runner=run48');
  expect(await screenName(page)).toBe('here');
  await expect(pickOpt(page, 'standard-corp')).toHaveAttribute('aria-checked', 'true');
  await expect(pickOpt(page, 'run48')).toHaveAttribute('aria-checked', 'true');
});

test('Continue after the deck was edited and then deleted: the game goes on with the decks it was dealt', async ({ page }) => {
  await openStart(page);
  await tapStart(page, /Play on this device/);
  await press(page, pickOpt(page, 'corp46'));
  await press(page, pickOpt(page, 'run48'));
  await tapStart(page, /^Start$/);
  await startedGame(page);
  await page.evaluate(() => window.__overclock!.dispatch({ type: 'gain_credit', player: 'corp' }));
  await expect.poll(() => savedMoves(page)).toBe(1);
  const before = await page.evaluate(() => window.__overclock!.getView());
  const dealt = await page.evaluate(() => window.__overclockStart!.gameOptions());

  // Leave; edit the Corp deck (one Enigma fewer).
  await reopenStart(page);
  await openDecks(page);
  await openDeck(page, 'corp46');
  await minus(page, 'c06');
  await tapStart(page, 'Back');
  await expect(page.locator(`${START} [data-deck="corp46"]`)).toContainText('45 cards');
  await reopenStart(page);
  await tapStart(page, /Continue game/);
  await startedGame(page);
  expect(await page.evaluate(() => window.__overclockStart!.gameOptions())).toEqual(dealt);
  let v = await page.evaluate(() => window.__overclock!.getView());
  expect(v.players.corp.handCount + v.players.corp.deckCount).toBe(46);
  expect(v.players.corp.credits).toBe(before.players.corp.credits);
  expect(v.players.corp.hand).toEqual(before.players.corp.hand);

  // Leave again; delete both decks.
  await reopenStart(page);
  await openDecks(page);
  for (const id of ['corp46', 'run48']) {
    await openDeck(page, id);
    await tapStart(page, 'Delete');
    await press(page, page.getByTestId('deck-delete-dialog').getByRole('button', { name: 'Delete' }));
  }
  await expect(page.locator(`${START} [data-deck="corp46"], ${START} [data-deck="run48"]`)).toHaveCount(0);
  await reopenStart(page);
  await tapStart(page, /Continue game/);
  await startedGame(page);
  expect(await page.evaluate(() => window.__overclockStart!.gameOptions())).toEqual(dealt);
  v = await page.evaluate(() => window.__overclock!.getView());
  expect(v.players.corp.handCount + v.players.corp.deckCount).toBe(46);
  expect(v.players.runner.handCount + v.players.runner.deckCount).toBe(48);
  expect(v.players.corp.hand).toEqual(before.players.corp.hand);
});

test('online games say "Online games use the standard decks for now."', async ({ page }) => {
  const NOTE = 'Online games use the standard decks for now.';
  await openStart(page);
  await tapStart(page, /Play online/);
  expect(await screenName(page)).toBe('online');
  await expect(page.locator(START)).toContainText(NOTE);
  await shot(page, 'online-note');
  await tapStart(page, /Start a game/);
  await expect(page.locator(START)).toContainText(NOTE);
  await tapStart(page, 'Back');
  await tapStart(page, /Join with code/);
  await expect(page.locator(START)).toContainText(NOTE);
});

test('New game after a game with your own decks: the picker opens with the same decks picked', async ({ page }) => {
  // The game-over box's New game goes to this address (lead decision); the ids come from the dealt lists.
  await openStart(page, 'play=pick&corp=corp46&runner=standard-runner');
  expect(await screenName(page)).toBe('here');
  expect(new URL(page.url()).searchParams.get('play')).toBeNull();
  await expect(pickOpt(page, 'corp46')).toHaveAttribute('aria-checked', 'true');
  await expect(pickOpt(page, 'standard-runner')).toHaveAttribute('aria-checked', 'true');
  await tapStart(page, /^Start$/);
  await startedGame(page);
  const v = await page.evaluate(() => window.__overclock!.getView());
  expect(v.players.corp.handCount + v.players.corp.deckCount).toBe(46);
});
