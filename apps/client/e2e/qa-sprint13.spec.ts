// QA Sprint 13 (independent, written by QA; not the developers' specs). Everything here is done by
// taps from an empty device (no seeded decks), the way the owner would: build a deck from empty,
// keep it, rename it, play it, edit/delete it, Continue. Plus layout checks (44 px, 10 px text,
// everything inside the screen) at all 4 sizes, tap-to-paint timing, and the upright prompt.
// `QA_SCREENS=1` writes screenshots to docs/sprints/sprint-13-qa/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { START, barPart, expectTextFloor, openStart, press, reopenStart, row, screenName, storedDecks, tapStart } from './decks';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-13-qa');
const SIZE: Record<string, string> = { phone: '844x390', 'phone-small': '640x360', desktop: '1280x800', 'phone-short': '891x296' };

async function snap(page: Page, name: string): Promise<void> {
  const p = test.info().project.name;
  if (process.env.QA_SCREENS === '1') mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot(process.env.QA_SCREENS === '1' ? { path: join(SHOTS, `r1-${SIZE[p] ?? p}-${name}.png`) } : {});
  await test.info().attach(name, { body, contentType: 'image/png' });
}

/** QA's 46-card Corp deck: the 9 HB/neutral agendas + 37 HB/neutral cards (0 influence). */
const CORP46: Record<string, number> = {
  c10: 3, c09: 3, c23: 3,
  c01: 3, c03: 3, c04: 3, c06: 3, c14: 3, c15: 3, c16: 3, c17: 3, c18: 3, c19: 3, c20: 3, c21: 3,
  c24: 1,
};

const item = (page: Page, name: string) => page.locator(`${START} [data-testid="deck-item"]`).filter({ hasText: name });
const pick = (page: Page, name: string) => page.locator(`${START} [data-testid="deck-pick"]`).filter({ hasText: name });

/** Every visible button / switch in the start screen is at least 44 px both ways and inside the viewport. */
async function expectTargets(page: Page, sel = 'button'): Promise<void> {
  const vp = page.viewportSize()!;
  const bad = await page.locator(START).evaluate(
    (root, { sel, w, h }) => {
      const out: string[] = [];
      for (const b of Array.from(root.querySelectorAll<HTMLElement>(sel))) {
        if (b.offsetParent === null) continue;
        const r = b.getBoundingClientRect();
        // Rows inside a scrolling list may be scrolled out; only check what is on screen.
        const scroller = b.closest('.deck-list, .deck-col');
        if (scroller) {
          const s = scroller.getBoundingClientRect();
          if (r.bottom <= s.top || r.top >= s.bottom) continue;
        }
        const name = (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().slice(0, 30);
        if (r.width < 44 || r.height < 44) out.push(`${name}: ${r.width.toFixed(0)}x${r.height.toFixed(0)}`);
        if (r.left < -0.5 || r.right > w + 0.5) out.push(`${name}: off screen x`);
        if (!scroller && (r.top < -0.5 || r.bottom > h + 0.5)) out.push(`${name}: off screen y ${r.top.toFixed(0)}..${r.bottom.toFixed(0)}`);
      }
      return out;
    },
    { sel, w: vp.width, h: vp.height },
  );
  expect(bad, 'buttons under 44 px or off screen').toEqual([]);
}

/** Taps + on `cardId` `n` times (scrolling to it as a thumb would). */
async function plusN(page: Page, cardId: string, n: number): Promise<void> {
  const b = row(page, cardId).getByTestId('deck-plus');
  for (let i = 0; i < n; i++) await press(page, b);
}

/**
 * Time from the tap's pointerdown to the frame after the row's count changed (≈ painted), in ms,
 * measured inside the page (no test-runner overhead).
 */
async function tapToPaint(page: Page, target: Locator, watch: Locator): Promise<number> {
  await watch.evaluate((w) => {
    const win = window as unknown as { __qaT: { down: number; painted: number } };
    win.__qaT = { down: -1, painted: -1 };
    document.addEventListener('pointerdown', (e) => (win.__qaT.down = e.timeStamp), { capture: true, once: true });
    const mo = new MutationObserver(() => {
      mo.disconnect();
      requestAnimationFrame(() => (win.__qaT.painted = performance.now()));
    });
    mo.observe(w, { childList: true, characterData: true, subtree: true });
  });
  await press(page, target);
  await page.waitForFunction(() => (window as unknown as { __qaT: { painted: number } }).__qaT.painted > 0);
  return page.evaluate(() => {
    const t = (window as unknown as { __qaT: { down: number; painted: number } }).__qaT;
    return t.painted - t.down;
  });
}

test.describe('QA S-13-1 the Decks screen', () => {
  test('home: Decks next to Play on this device and Play online; 44 px; text >= 10 px; also with Continue game showing', async ({ page }) => {
    await openStart(page);
    const home = page.locator(START);
    const names = await home.locator('.choices.three .choice b').allTextContents();
    expect(names).toEqual(['Play on this device', 'Play online', 'Decks']);
    // Same row: the three tops line up.
    const tops = await home.locator('.choices.three .choice').evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
    await expectTargets(page);
    await expectTextFloor(page);
    await snap(page, 'home');
    // With a saved game: Continue game shows too and everything still fits on screen.
    await tapStart(page, /Play on this device/);
    await tapStart(page, /^Start$/);
    await page.waitForFunction(() => !!window.__overclock);
    await page.evaluate(() => window.__overclock!.dispatch({ type: 'gain_credit', player: 'corp' }));
    await expect.poll(() => page.evaluate(() => localStorage.getItem('overclock.hotseat.v1') !== null)).toBe(true);
    await reopenStart(page);
    await expect(home.getByRole('button', { name: /Continue game/ })).toBeVisible();
    await expectTargets(page);
    await expectTextFloor(page);
    await snap(page, 'home-continue');
  });

  test('first visit: exact names and counts, New Corp/Runner deck, start choice, "My Corp deck 1", read-only standard, Copy to edit, Back', async ({ page }) => {
    await openStart(page);
    await tapStart(page, /^Decks/);
    expect(await screenName(page)).toBe('decks');
    const list = await page.locator(`${START} [data-testid="deck-item"]`).allInnerTexts();
    expect(list.map((t) => t.replace(/\s+/g, ' ').trim())).toEqual([
      'Standard Corp deck (Haas-Bioroid) 45 cards · ✓ Ready to play',
      'Standard Runner deck (Kate) 45 cards · ✓ Ready to play',
    ]);
    await expect(page.locator(START).getByRole('button', { name: 'New Corp deck' })).toBeVisible();
    await expect(page.locator(START).getByRole('button', { name: 'New Runner deck' })).toBeVisible();
    await expectTargets(page);
    await expectTextFloor(page);
    await snap(page, 'decks-first');

    // New Corp deck → the two choices → Start empty → "My Corp deck 1", 0 cards.
    await tapStart(page, 'New Corp deck');
    expect(await screenName(page)).toBe('new_deck');
    await expect(page.locator(START).getByRole('button', { name: /Start from the standard deck/ })).toBeVisible();
    await expect(page.locator(START).getByRole('button', { name: /Start empty/ })).toBeVisible();
    await expectTargets(page);
    await expectTextFloor(page);
    await snap(page, 'new-deck-choice');
    await tapStart(page, /Start empty/);
    expect(await screenName(page)).toBe('deck');
    await expect(page.getByTestId('deck-name')).toHaveValue('My Corp deck 1');
    await expect(barPart(page, 'size')).toHaveText('0 / 45 cards');
    await snap(page, 'editor-empty');
    await tapStart(page, 'Back');

    // New Corp deck from the standard deck → "My Corp deck 2", 45 cards, Ready.
    await tapStart(page, 'New Corp deck');
    await tapStart(page, /Start from the standard deck/);
    await expect(page.getByTestId('deck-name')).toHaveValue('My Corp deck 2');
    await expect(barPart(page, 'size')).toHaveText('45 / 45 cards');
    await expect(barPart(page, 'note')).toHaveText('✓ Ready to play');
    await tapStart(page, 'Back');

    // A Runner deck is numbered on its own.
    await tapStart(page, 'New Runner deck');
    await tapStart(page, /Start empty/);
    await expect(page.getByTestId('deck-name')).toHaveValue('My Runner deck 1');
    await tapStart(page, 'Back');

    // The standard deck: readable, no + / −, no Delete, Copy to edit → own copy.
    await press(page, item(page, 'Standard Runner deck (Kate)'));
    expect(await screenName(page)).toBe('deck');
    await expect(page.getByTestId('deck-name')).toHaveText('Standard Runner deck (Kate)');
    await expect(page.locator(`${START} [data-testid="deck-plus"], ${START} [data-testid="deck-minus"]`)).toHaveCount(0);
    await expect(page.locator(START).getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await expect(page.locator(START).locator('input.deck-name')).toHaveCount(0);
    await expect(row(page, 'r14').getByTestId('deck-count')).toHaveText('3 / 3');
    await expectTargets(page);
    await snap(page, 'standard-read-only');
    await tapStart(page, 'Copy to edit');
    await expect(page.getByTestId('deck-name')).toHaveValue('My Runner deck 2');
    await expect(barPart(page, 'size')).toHaveText('45 / 45 cards');
    await expect(row(page, 'r14').getByTestId('deck-plus')).toBeVisible();

    // Back → Decks list (5 own decks + 2 standard), Back → home.
    await tapStart(page, 'Back');
    expect(await screenName(page)).toBe('decks');
    await expect(page.locator(`${START} [data-testid="deck-item"]`)).toHaveCount(6);
    await tapStart(page, 'Back');
    expect(await screenName(page)).toBe('home');
  });
});

test.describe('QA S-13-2 / S-13-3 editing and the rules bar (built by taps)', () => {
  test('build a 46-card Corp deck from empty by taps: bar texts, colours, Weyland, Max 3, Ready; taps < 100 ms to paint', async ({ page }) => {
    await openStart(page);
    await tapStart(page, /^Decks/);
    await tapStart(page, 'New Corp deck');
    await tapStart(page, /Start empty/);
    // Every Corp card, grouped, with "0 / 3"; 44 px buttons, text >= 10 px.
    await expect(page.locator(`${START} [data-testid="deck-row"]`)).toHaveCount(24);
    expect(await page.locator(`${START} .deck-group`).allTextContents()).toEqual(['Agendas', 'ICE', 'Assets', 'Upgrades', 'Operations']);
    await expect(page.getByTestId('deck-identity')).toContainText('Haas-Bioroid');
    await expectTargets(page);
    await expectTextFloor(page);
    // Empty: size red, influence green, agenda red, note lists what's wrong.
    await expect(barPart(page, 'size')).toHaveText('0 / 45 cards');
    await expect(barPart(page, 'size')).toHaveClass(/\bbad\b/);
    await expect(barPart(page, 'influence')).toHaveText('Influence 0 / 15');
    await expect(barPart(page, 'influence')).toHaveClass(/\bok\b/);
    await expect(barPart(page, 'agenda')).toHaveText('Agenda points 0 (needs 2–3)');
    await expect(barPart(page, 'note')).toContainText('45 cards short');

    // Hostile Takeover: dimmed, says why, tap does nothing but say it.
    const ht = row(page, 'c08');
    await expect(ht.getByTestId('deck-plus')).toHaveClass(/\bdim\b/);
    await expect(ht).toContainText("Haas-Bioroid can't use Weyland agendas");
    await press(page, ht.getByTestId('deck-plus'), true);
    await expect(page.getByTestId('toast')).toHaveText("Haas-Bioroid can't use Weyland agendas");
    await expect(ht.getByTestId('deck-count')).toHaveText('0 / 3');

    // Tap timing: + on Hedge Fund, measured pointerdown → frame after the count changed.
    // `QA_THROTTLE=6`: the same at 6× CPU slow-down (timing check, docs/TESTING.md §3).
    if (process.env.QA_THROTTLE) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.QA_THROTTLE) });
    }
    const times: number[] = [];
    const hf = row(page, 'c01');
    for (let i = 0; i < 3; i++) times.push(await tapToPaint(page, hf.getByTestId('deck-plus'), hf.getByTestId('deck-count')));
    await expect(hf.getByTestId('deck-count')).toHaveText('3 / 3');
    await expect(barPart(page, 'size')).toHaveText('3 / 45 cards');
    // − then + again (timed too).
    times.push(await tapToPaint(page, hf.getByTestId('deck-minus'), hf.getByTestId('deck-count')));
    await expect(hf.getByTestId('deck-count')).toHaveText('2 / 3');
    times.push(await tapToPaint(page, hf.getByTestId('deck-plus'), hf.getByTestId('deck-count')));
    test.info().annotations.push({ type: 'tap-to-paint ms', description: times.map((t) => t.toFixed(1)).join(', ') });
    for (const t of times) expect(t, 'tap → painted').toBeLessThan(100);

    // Max 3 on Hedge Fund.
    await expect(hf.getByTestId('deck-plus')).toHaveClass(/\bdim\b/);
    await press(page, hf.getByTestId('deck-plus'), true);
    await expect(page.getByTestId('toast')).toHaveText('Max 3 copies');
    await expect(hf.getByTestId('deck-count')).toHaveText('3 / 3');
    await snap(page, 'editor-max3');

    // The rest of QA's 46 cards.
    for (const [id, n] of Object.entries(CORP46)) if (id !== 'c01') await plusN(page, id, n);
    await expect(barPart(page, 'size')).toHaveText('46 / 45 cards');
    await expect(barPart(page, 'size')).toHaveClass(/\bok\b/);
    await expect(barPart(page, 'influence')).toHaveText('Influence 0 / 15');
    await expect(barPart(page, 'agenda')).toHaveText('Agenda points 21 (needs 20–21)');
    await expect(barPart(page, 'agenda')).toHaveClass(/\bok\b/);
    await expect(barPart(page, 'note')).toHaveText('✓ Ready to play');
    await expect(page.getByTestId('deck-bar')).toHaveAttribute('data-legal', 'true');
    await snap(page, 'editor-ready-46');

    // One agenda fewer: 18 points at 45 → agenda red "(needs 20–21)", "3 agenda points short"? (PR = 3 points)
    await press(page, row(page, 'c10').getByTestId('deck-minus'));
    await expect(barPart(page, 'size')).toHaveText('45 / 45 cards');
    await expect(barPart(page, 'agenda')).toHaveText('Agenda points 18 (needs 20–21)');
    await expect(barPart(page, 'agenda')).toHaveClass(/\bbad\b/);
    await expect(barPart(page, 'note')).toHaveText('2 agenda points short');
    await snap(page, 'editor-agenda-short');
    await press(page, row(page, 'c10').getByTestId('deck-plus'));
    await expect(barPart(page, 'note')).toHaveText('✓ Ready to play');

    // In deck: only the 16 kinds of card in it.
    await press(page, page.getByTestId('deck-in-deck'));
    await expect(page.locator(`${START} [data-testid="deck-row"]`).filter({ visible: true })).toHaveCount(Object.keys(CORP46).length);
    await expectTargets(page);
    await snap(page, 'editor-in-deck');
    await press(page, page.getByTestId('deck-in-deck'));

    // Kept: leave and come back after a reload (closing the browser).
    await reopenStart(page);
    const store = await storedDecks(page);
    expect(store.decks).toHaveLength(1);
    expect(store.decks[0]!.cards).toEqual(CORP46);
    await tapStart(page, /^Decks/);
    const mine = item(page, 'My Corp deck 1');
    await expect(mine).toContainText('46 cards');
    await expect(mine.locator('.note.ok')).toHaveText('✓ Ready to play');
  });

  test('Runner: past 15 influence goes red "Influence 17 / 15" with "2 influence over the limit", + not dimmed; removing fixes it', async ({ page }) => {
    await openStart(page);
    await tapStart(page, /^Decks/);
    await tapStart(page, 'New Runner deck');
    await tapStart(page, /Start from the standard deck/);
    await expect(barPart(page, 'influence')).toHaveText('Influence 10 / 15');
    // +1 Ninja (2), +2 Easy Mark (2), +1 Cyberfeeder (1) = 15.
    await plusN(page, 'r06', 1);
    await plusN(page, 'r01', 2);
    await plusN(page, 'r08', 1);
    await expect(barPart(page, 'influence')).toHaveText('Influence 15 / 15');
    await expect(barPart(page, 'influence')).toHaveClass(/\bok\b/);
    await expect(row(page, 'r06').getByTestId('deck-plus')).not.toHaveClass(/\bdim\b/);
    await plusN(page, 'r06', 1);
    await expect(barPart(page, 'influence')).toHaveText('Influence 17 / 15');
    await expect(barPart(page, 'influence')).toHaveClass(/\bbad\b/);
    await expect(barPart(page, 'note')).toHaveText('2 influence over the limit');
    await expect(page.locator(START).locator('[data-part="agenda"]')).toHaveCount(0);
    await expectTextFloor(page);
    await snap(page, 'editor-influence-over');
    await press(page, row(page, 'r06').getByTestId('deck-minus'));
    await expect(barPart(page, 'influence')).toHaveText('Influence 15 / 15');
    await expect(barPart(page, 'note')).toHaveText('✓ Ready to play');
  });

  test('hold the identity and a card: the game zoom face, letting go returns; a held + count is unchanged', async ({ page }) => {
    await openStart(page);
    await tapStart(page, /^Decks/);
    await press(page, item(page, 'Standard Corp deck'));
    const touch = test.info().project.use.hasTouch;
    const cdp = touch ? await page.context().newCDPSession(page) : null;
    for (const [sel, id, text] of [
      ['[data-testid="deck-identity"]', 'c13', 'Haas-Bioroid'],
      ['[data-testid="deck-row"][data-card="c18"] .card-info', 'c18', 'Heimdall 1.0'],
    ] as const) {
      const t = page.locator(`${START} ${sel}`);
      await t.scrollIntoViewIfNeeded();
      const b = (await t.boundingBox())!;
      const x = b.x + 20;
      const y = b.y + b.height / 2;
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      else {
        await page.mouse.move(x, y);
        await page.mouse.down();
      }
      await expect(page.getByTestId('deck-zoom')).toBeVisible();
      const z = await page.evaluate(() => window.__overclockStart!.zoom());
      expect(z?.cardId).toBe(id);
      expect(z!.overflow).toBe(false);
      expect(z!.texts.join(' ')).toContain(text);
      const zb = (await page.getByTestId('deck-zoom').locator('canvas').boundingBox())!;
      const vp = page.viewportSize()!;
      expect(zb.y).toBeGreaterThanOrEqual(-0.5);
      expect(zb.y + zb.height).toBeLessThanOrEqual(vp.height + 0.5);
      await snap(page, `zoom-${id}`);
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      else await page.mouse.up();
      await expect(page.getByTestId('deck-zoom')).toHaveCount(0);
    }
  });
});

test.describe('QA S-13-4 kept on the device', () => {
  test('rename by typing then Done; rename then Back without Done; both survive a reload; Delete asks, Keep keeps, Delete removes', async ({ page }) => {
    await openStart(page);
    await tapStart(page, /^Decks/);
    await tapStart(page, 'New Corp deck');
    await tapStart(page, /Start from the standard deck/);
    await expect(page.locator(START).getByRole('button', { name: /save/i })).toHaveCount(0);
    const name = page.getByTestId('deck-name');
    await press(page, name);
    await name.fill('Glacier');
    await name.press('Enter');
    await tapStart(page, 'Back');
    await expect(item(page, 'Glacier')).toHaveCount(1);
    // Rename again, then the on-screen Back straight away (no Done).
    await press(page, item(page, 'Glacier'));
    await press(page, name);
    await name.fill('Glacier two');
    await tapStart(page, 'Back');
    await expect(item(page, 'Glacier two')).toHaveCount(1);
    await reopenStart(page);
    await tapStart(page, /^Decks/);
    await expect(item(page, 'Glacier two')).toContainText('45 cards');
    await expect(item(page, 'Glacier two').locator('.note.ok')).toHaveText('✓ Ready to play');
    // Delete: asks; Keep keeps; Delete removes; gone after a reload.
    await press(page, item(page, 'Glacier two'));
    await tapStart(page, 'Delete');
    await expect(page.getByTestId('deck-delete-dialog')).toContainText('Delete "Glacier two"?');
    await expectTargets(page, '.deck-dialog button');
    await snap(page, 'delete-ask');
    await press(page, page.getByTestId('deck-delete-dialog').getByRole('button', { name: 'Keep' }));
    await expect(page.getByTestId('deck-delete-dialog')).toHaveCount(0);
    await tapStart(page, 'Delete');
    await press(page, page.getByTestId('deck-delete-dialog').getByRole('button', { name: 'Delete' }));
    expect(await screenName(page)).toBe('decks');
    await expect(item(page, 'Glacier')).toHaveCount(0);
    await reopenStart(page);
    expect((await storedDecks(page)).decks).toEqual([]);
  });

  test('an unfinished deck is kept with its short red note ("4 cards short") after closing the browser from the editor', async ({ page }) => {
    await openStart(page);
    await tapStart(page, /^Decks/);
    await tapStart(page, 'New Runner deck');
    await tapStart(page, /Start from the standard deck/);
    for (let i = 0; i < 3; i++) await press(page, row(page, 'r14').getByTestId('deck-minus'));
    await press(page, row(page, 'r21').getByTestId('deck-minus'));
    await expect(barPart(page, 'size')).toHaveText('41 / 45 cards');
    // Close straight from the editor.
    await reopenStart(page);
    await tapStart(page, /^Decks/);
    const d = item(page, 'My Runner deck 1');
    await expect(d).toContainText('41 cards');
    await expect(d.locator('.note.bad')).toHaveText('4 cards short');
    await expectTextFloor(page);
    await snap(page, 'decks-kept');
  });

  test('a rename typed and left without Done or Back, then the browser closed: is the new name kept?', async ({ page }) => {
    // QA-S13-1 (fixed): the name is now kept on each keystroke, so closing the app with the name
    // field still focused keeps the new name.
    await openStart(page);
    await tapStart(page, /^Decks/);
    await tapStart(page, 'New Corp deck');
    await tapStart(page, /Start empty/);
    const name = page.getByTestId('deck-name');
    await press(page, name);
    await name.fill('Typed then closed');
    await reopenStart(page);
    await tapStart(page, /^Decks/);
    await expect(item(page, 'Typed then closed')).toHaveCount(1);
  });
});

test.describe('QA S-13-5 pick your decks', () => {
  async function buildCorp46(page: Page): Promise<void> {
    await tapStart(page, /^Decks/);
    await tapStart(page, 'New Corp deck');
    await tapStart(page, /Start empty/);
    for (const [id, n] of Object.entries(CORP46)) await plusN(page, id, n);
    await expect(barPart(page, 'note')).toHaveText('✓ Ready to play');
    const name = page.getByTestId('deck-name');
    await press(page, name);
    await name.fill('QA forty-six');
    await name.press('Enter');
    await tapStart(page, 'Back');
  }

  test('built by taps: pick it, Start → R&D + HQ = those 46 cards; not-Ready dimmed and unpickable; Continue after edit and delete', async ({ page }) => {
    await openStart(page);
    await buildCorp46(page);
    // An unfinished Runner deck.
    await tapStart(page, 'New Runner deck');
    await tapStart(page, /Start empty/);
    await plusN(page, 'r14', 3);
    await tapStart(page, 'Back');
    await expect(item(page, 'My Runner deck 1').locator('.note.bad')).toHaveText('42 cards short');
    await tapStart(page, 'Back');

    await tapStart(page, /Play on this device/);
    expect(await screenName(page)).toBe('here');
    await expect(page.locator(START).getByRole('radiogroup', { name: 'Corp deck' })).toBeVisible();
    await expect(page.locator(START).getByRole('radiogroup', { name: 'Runner deck' })).toBeVisible();
    await expect(pick(page, 'Standard Corp deck')).toHaveAttribute('aria-checked', 'true');
    await expect(pick(page, 'Standard Runner deck')).toHaveAttribute('aria-checked', 'true');
    const unfinished = pick(page, 'My Runner deck 1');
    await expect(unfinished).toHaveAttribute('aria-disabled', 'true');
    await expect(unfinished.locator('.note.bad')).toHaveText('42 cards short');
    expect(await unfinished.evaluate((e) => Number(getComputedStyle(e).opacity))).toBeLessThan(0.8);
    await press(page, unfinished, true);
    await expect(unfinished).toHaveAttribute('aria-checked', 'false');
    await expect(pick(page, 'Standard Runner deck')).toHaveAttribute('aria-checked', 'true');
    await press(page, pick(page, 'QA forty-six'));
    await expect(pick(page, 'QA forty-six')).toHaveAttribute('aria-checked', 'true');
    await expect(pick(page, 'Standard Corp deck')).toHaveAttribute('aria-checked', 'false');
    await expectTargets(page);
    await expectTextFloor(page);
    await snap(page, 'picker');
    await tapStart(page, /^Start$/);
    await page.waitForFunction(() => !!window.__overclock);
    await expect(page.locator(START)).toBeHidden();
    const v = await page.evaluate(() => window.__overclock!.getView());
    expect(v.players.corp.handCount + v.players.corp.deckCount).toBe(46);
    expect(v.players.runner.handCount + v.players.runner.deckCount).toBe(45);
    const expected = Object.entries(CORP46).flatMap(([id, n]) => Array<string>(n).fill(id)).sort();
    const opts = (await page.evaluate(() => window.__overclockStart!.gameOptions()))!;
    expect([...opts.decks!.corp!.cards].sort()).toEqual(expected);
    expect(opts.decks?.runner).toBeUndefined();
    for (const id of v.players.corp.hand!) expect(expected).toContain(id);
    await snap(page, 'game-own-deck');
    // Make a move so the game is saved, then leave.
    await page.evaluate(() => window.__overclock!.dispatch({ type: 'gain_credit', player: 'corp' }));
    await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('overclock.hotseat.v1') ?? '{"actions":[]}') as { actions: unknown[] }).actions.length)).toBe(1);
    const hand = v.players.corp.hand;

    // Edit the deck (−1 Archived Memories → 45), Continue: still 46, same hand.
    await reopenStart(page);
    await tapStart(page, /^Decks/);
    await press(page, item(page, 'QA forty-six'));
    await press(page, row(page, 'c24').getByTestId('deck-minus'));
    await expect(barPart(page, 'size')).toHaveText('45 / 45 cards');
    await tapStart(page, 'Back');
    await tapStart(page, 'Back');
    await tapStart(page, /Continue game/);
    await page.waitForFunction(() => !!window.__overclock);
    let w = await page.evaluate(() => window.__overclock!.getView());
    expect(w.players.corp.handCount + w.players.corp.deckCount).toBe(46);
    expect(w.players.corp.hand).toEqual(hand);
    expect(w.players.corp.credits).toBe(v.players.corp.credits + 1);

    // Delete the deck, Continue: still the same game.
    await reopenStart(page);
    await tapStart(page, /^Decks/);
    await press(page, item(page, 'QA forty-six'));
    await tapStart(page, 'Delete');
    await press(page, page.getByTestId('deck-delete-dialog').getByRole('button', { name: 'Delete' }));
    await tapStart(page, 'Back');
    await tapStart(page, /Continue game/);
    await page.waitForFunction(() => !!window.__overclock);
    w = await page.evaluate(() => window.__overclock!.getView());
    expect(w.players.corp.handCount + w.players.corp.deckCount).toBe(46);
    expect(w.players.corp.hand).toEqual(hand);
    expect([...(await page.evaluate(() => window.__overclockStart!.gameOptions()))!.decks!.corp!.cards].sort()).toEqual(expected);
  });

  test('Play online screens say "Online games use the standard decks for now." (readable, >= 10 px)', async ({ page }) => {
    const NOTE = 'Online games use the standard decks for now.';
    await openStart(page);
    await tapStart(page, /Play online/);
    test.skip((await screenName(page)) !== 'online', 'this build has no online service');
    await expect(page.locator(START).getByText(NOTE)).toBeVisible();
    await expectTextFloor(page);
    await expectTargets(page);
    await snap(page, 'online-note');
    await tapStart(page, /Start a game/);
    await expect(page.locator(START).getByText(NOTE)).toBeVisible();
    await expectTargets(page);
    await snap(page, 'online-pick-note');
    await tapStart(page, 'Back');
    await tapStart(page, /Join with code/);
    await expect(page.locator(START).getByText(NOTE)).toBeVisible();
    await snap(page, 'online-join-note');
  });
});

test('QA: an upright phone shows "Turn your phone sideways" over the Decks screen and the editor', async ({ page }) => {
  test.skip(!test.info().project.use.isMobile, 'phones only');
  await openStart(page);
  await tapStart(page, /^Decks/);
  const vp = page.viewportSize()!;
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await expect(page.locator('#rotate')).toBeVisible();
  await expect(page.locator('#rotate')).toHaveText('Turn your phone sideways');
  await snap(page, 'upright-decks');
  await page.setViewportSize(vp);
  await expect(page.locator('#rotate')).toBeHidden();
  await press(page, item(page, 'Standard Corp deck'));
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await expect(page.locator('#rotate')).toBeVisible();
  await page.setViewportSize(vp);
  await expect(page.locator('#rotate')).toBeHidden();
  expect(await screenName(page)).toBe('deck');
});
