// S-13-3: the real deck rules, checked as you go. Bar texts (green / red), "Max 3 copies",
// "Haas-Bioroid can't use Weyland agendas", "Influence 17 / 15" + "2 influence over the limit",
// "Ready to play", and the editor agreeing with the game's own rule check (`checkDeck`).
import { checkDeck, deckFromCounts } from '@overclock/cards';
import { expect, test } from '@playwright/test';
import { START, barPart, minus, openDeck, openDecks, openStart, plus, row, seedDecks, shot, standardPlus, storedDeck } from './decks';
import type { StoredDeck } from '@overclock/match';

async function expectPart(page: Parameters<typeof barPart>[0], part: 'size' | 'influence' | 'agenda', text: string, ok: boolean): Promise<void> {
  const p = barPart(page, part);
  await expect(p).toHaveText(text);
  await expect(p).toHaveClass(ok ? /\bok\b/ : /\bbad\b/);
}

test('the standard deck copy: every part green and "Ready to play" with a tick', async ({ page }) => {
  await seedDecks(page, [storedDeck('d', 'corp', 'Std', standardPlus('corp', {}))]);
  await openStart(page);
  await openDecks(page);
  await openDeck(page, 'd');
  await expectPart(page, 'size', '45 / 45 cards', true);
  await expectPart(page, 'influence', 'Influence 8 / 15', true);
  await expectPart(page, 'agenda', 'Agenda points 21 (needs 20–21)', true);
  await expect(barPart(page, 'note')).toHaveText('✓ Ready to play');
  await shot(page, 'rules-ready');
});

test('41 cards, 18 points: "41 / 45 cards" red, "4 cards short"; points as the rule says for that size', async ({ page }) => {
  // −1 Priority Requisition (3 points), −3 Hedge Fund.
  await seedDecks(page, [storedDeck('d', 'corp', 'Short', standardPlus('corp', { c10: -1, c01: -3 }))]);
  await openStart(page);
  await openDecks(page);
  await openDeck(page, 'd');
  await expectPart(page, 'size', '41 / 45 cards', false);
  await expectPart(page, 'agenda', 'Agenda points 18 (needs 18–19)', true);
  await expect(barPart(page, 'note')).toContainText('4 cards short');
  // Back to 45 with Hedge Funds: the points range moves to 20–21 and 18 is red.
  for (let i = 0; i < 3; i++) await plus(page, 'c01');
  await plus(page, 'c06');
  await expectPart(page, 'size', '45 / 45 cards', true);
  await expectPart(page, 'agenda', 'Agenda points 18 (needs 20–21)', false);
  await expect(barPart(page, 'note')).toContainText('2 agenda points short');
  await shot(page, 'rules-points-short');
});

test('a card at 3 copies: its + is dimmed and says "Max 3 copies"', async ({ page }) => {
  await seedDecks(page, [storedDeck('d', 'corp', 'Std', standardPlus('corp', {}))]);
  await openStart(page);
  await openDecks(page);
  await openDeck(page, 'd');
  const r = row(page, 'c01'); // Hedge Fund ×3
  await expect(r.getByTestId('deck-count')).toHaveText('3 / 3');
  await expect(r.getByTestId('deck-plus')).toHaveClass(/\bdim\b/);
  await plus(page, 'c01', true);
  await expect(page.getByTestId('toast')).toHaveText('Max 3 copies');
  await expect(r.getByTestId('deck-count')).toHaveText('3 / 3');
  await shot(page, 'rules-max3');
});

test('Hostile Takeover in a Haas-Bioroid deck: + dimmed, "Haas-Bioroid can\'t use Weyland agendas"', async ({ page }) => {
  await seedDecks(page, [storedDeck('d', 'corp', 'Std', standardPlus('corp', {}))]);
  await openStart(page);
  await openDecks(page);
  await openDeck(page, 'd');
  const r = row(page, 'c08');
  await expect(r.getByTestId('deck-plus')).toHaveClass(/\bdim\b/);
  await expect(r).toContainText("Haas-Bioroid can't use Weyland agendas");
  await plus(page, 'c08', true);
  await expect(page.getByTestId('toast')).toHaveText("Haas-Bioroid can't use Weyland agendas");
  await expect(r.getByTestId('deck-count')).toHaveText('0 / 3');
  await shot(page, 'rules-weyland');
});

test('past 15 influence: "Influence 17 / 15" red and "2 influence over the limit"; removing cards fixes it', async ({ page }) => {
  // Standard Runner deck (10) + 1 Ninja (2) + 1 Cyberfeeder (1) + 2 Easy Mark (2) = 15; the test adds one Ninja (+2).
  await seedDecks(page, [storedDeck('d', 'runner', 'Splash', standardPlus('runner', { r06: 1, r08: 1, r01: 2 }))]);
  await openStart(page);
  await openDecks(page);
  await openDeck(page, 'd');
  await expectPart(page, 'influence', 'Influence 15 / 15', true);
  await expect(barPart(page, 'note')).toHaveText('✓ Ready to play');
  // Influence never dims a +.
  await expect(row(page, 'r06').getByTestId('deck-plus')).not.toHaveClass(/\bdim\b/);
  await plus(page, 'r06');
  await expectPart(page, 'influence', 'Influence 17 / 15', false);
  await expect(barPart(page, 'note')).toHaveText('2 influence over the limit');
  await shot(page, 'rules-influence');
  await minus(page, 'r06');
  await expectPart(page, 'influence', 'Influence 15 / 15', true);
  await expect(barPart(page, 'note')).toHaveText('✓ Ready to play');
});

test('the editor, the Decks list and the picker agree with the game\'s rule check on seeded decks', async ({ page }) => {
  const decks: StoredDeck[] = [
    storedDeck('a', 'corp', 'Standard copy', standardPlus('corp', {})),
    storedDeck('b', 'corp', '46 cards', standardPlus('corp', { c06: 1 })),
    storedDeck('c', 'corp', 'Too few points', standardPlus('corp', { c10: -1, c06: 1, c04: 1, c20: -1, c05: 1 })),
    storedDeck('d', 'corp', 'Weyland agenda', { ...standardPlus('corp', { c09: -1 }), c08: 1 }),
    storedDeck('e', 'corp', 'Four copies', standardPlus('corp', { c01: 1, c03: -1 })),
    storedDeck('f', 'corp', 'Empty', {}),
    storedDeck('g', 'runner', 'Standard copy', standardPlus('runner', {})),
    storedDeck('h', 'runner', 'Big', standardPlus('runner', { r06: 1, r01: 1, r08: 1 })),
    storedDeck('i', 'runner', 'Over influence', standardPlus('runner', { r06: 3, r11: 2 })),
    storedDeck('j', 'runner', 'Unknown card', { ...standardPlus('runner', {}), zz99: 1 }),
    storedDeck('k', 'runner', 'Corp card inside', { ...standardPlus('runner', {}), c01: 1 }),
  ];
  await seedDecks(page, decks);
  await openStart(page);
  await openDecks(page);
  const legal = (d: StoredDeck) => checkDeck(deckFromCounts(d.identity, d.cards)).length === 0;
  // Both kinds are in the set.
  expect(decks.filter(legal).length).toBeGreaterThan(1);
  expect(decks.filter((d) => !legal(d)).length).toBeGreaterThan(3);
  for (const d of decks) {
    await expect(page.locator(`${START} [data-testid="deck-item"][data-deck="${d.id}"]`), d.name).toHaveAttribute('data-ready', String(legal(d)));
  }
  for (const d of decks) {
    await openDeck(page, d.id);
    await expect(page.getByTestId('deck-bar'), d.name).toHaveAttribute('data-legal', String(legal(d)));
    await page.locator(START).getByRole('button', { name: 'Back' }).click();
  }
  await page.locator(START).getByRole('button', { name: 'Back' }).click();
  await page.locator(START).getByRole('button', { name: /Play on this device/ }).click();
  for (const d of decks) {
    await expect(page.locator(`${START} [data-testid="deck-pick"][data-deck="${d.id}"]`), d.name).toHaveAttribute('data-ready', String(legal(d)));
  }
});
