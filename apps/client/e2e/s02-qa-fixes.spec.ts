// Fixes for Sprint 2 QA round 1 (QA-S2-1, QA-S2-2, QA-S2-3), on every screen size.
import { ALL_CARDS } from '@overclock/cards';
import { expect, test, type Page } from '@playwright/test';
import {
  type AnimRecord,
  type LayoutSnapshot,
  anims,
  dispatch,
  expectCleanLayout,
  layout,
  openBoard,
  passTurn,
  pickCard,
  tap,
  targetOf,
  toRunnerTurn,
  waitIdle,
} from './helpers';

/** Readable hint text on a phone (CSS px). */
const MIN_HINT_PX = 10;

async function lastHint(page: Page): Promise<AnimRecord> {
  const h = (await anims(page)).filter((a) => a.kind === 'hint').pop();
  expect(h, 'a hint appeared').toBeDefined();
  await page.evaluate(() => window.__overclock!.clearAnims());
  return h!;
}

function expectReadableHint(l: LayoutSnapshot, h: AnimRecord): void {
  expect(h.fontPx, `"${h.text}" text size`).toBeGreaterThanOrEqual(MIN_HINT_PX);
  // Inside the safe area and clear of every board element and hand card.
  expectCleanLayout({ ...l, hint: { text: h.text!, box: h.box! } });
}

test.describe('QA-S2-1 hints are readable and clear of the board', () => {
  test('"Needs runs (coming soon)", "Not your turn", "Not enough credits" and "No clicks left" at >= 10px', async ({ page }) => {
    await openBoard(page, 2);
    await toRunnerTurn(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    const seen: string[] = [];
    const check = async (): Promise<void> => {
      const h = await lastHint(page);
      seen.push(h.text!);
      expectReadableHint(await layout(page), h);
    };

    let l = await pickCard(page, "The Maker's Eye");
    await check();
    await tap(page, l.hand[l.selected!]!.box);
    await dispatch(page, { type: 'draw', player: 'corp' });
    await check();
    l = await pickCard(page, 'Ninja');
    await tap(page, targetOf(l, 'install').box);
    await waitIdle(page);
    l = await pickCard(page, 'Corroder');
    await tap(page, targetOf(l, 'install').box);
    await check();
    await tap(page, l.hand[l.selected!]!.box);
    for (let i = 0; i < 4; i++) await dispatch(page, { type: 'gain_credit', player: 'runner' });
    await check();
    expect(seen).toEqual(['Needs runs (coming soon)', 'Not your turn', 'Not enough credits', 'No clicks left']);
  });

  test('sideways, the help text steps aside while a hint shows and comes back after', async ({ page }) => {
    await openBoard(page, 2);
    const l0 = await layout(page);
    test.skip(l0.viewport.height > 500, 'sideways phones only (the column layout has its own hint slot)');
    const help = 'Tap a lit spot to play it.\nTap the card again to cancel.';
    await toRunnerTurn(page);
    await pickCard(page, "The Maker's Eye");
    const l = await layout(page);
    expect((await anims(page)).find((a) => a.kind === 'hint')?.text).toBe('Needs runs (coming soon)');
    expect(l.labels).not.toContain(help);
    await page.waitForFunction(() => window.__overclock!.layout().hint !== null, undefined, { timeout: 3000 });
    expect((await layout(page)).labels).not.toContain(help);
    // Back once the hint has faded (about 1.4s).
    await page.waitForFunction((t) => window.__overclock!.layout().hint === null && window.__overclock!.layout().labels.includes(t), help, { timeout: 3000 });
  });
});

test.describe('QA-S2-2 an upgrade in HQ never covers the HQ marker', () => {
  test('Akitaro Watanabe in HQ: clean board (marker included) on both views', async ({ page }) => {
    await openBoard(page, 2);
    const l0 = await pickCard(page, 'Akitaro Watanabe');
    await tap(page, targetOf(l0, 'server', 'hq').box);
    for (let side = 0; side < 2; side++) {
      const l = await waitIdle(page);
      const hq = l.servers.find((s) => s.id === 'hq')!;
      expect(hq.content).toHaveLength(1);
      expect(hq.root).toBeTruthy();
      // boardElements counts the HQ marker even when the row is fanned.
      expectCleanLayout(l);
      expect(l.text.corpHand).toMatch(/cards? in HQ/);
      if (side === 0) await passTurn(page);
    }
  });
});

test.describe('QA-S2-3 long card names fit on small cards', () => {
  test('every starter card name stays clear of its type label, hand and installed size', async ({ page }) => {
    await openBoard(page, 2);
    const l = await waitIdle(page);
    const hand = l.hand[0]!.box;
    const unit = l.servers.find((s) => s.id === 'hq')!.root!;
    const longest = [...ALL_CARDS].sort((a, b) => b.name.length - a.name.length)[0]!;
    expect(longest.name).toBe('Private Security Force');
    const sizes = [
      ['hand', hand.width, hand.height],
      ['installed', unit.width, unit.height],
    ] as const;
    for (const [what, w, h] of sizes) {
      const faces = await page.evaluate(
        ({ ids, w, h }) => ids.map((id) => [id, window.__overclock!.smallFace(id, w, h)] as const),
        { ids: ALL_CARDS.map((c) => c.id), w, h },
      );
      for (const [id, f] of faces) {
        const card = ALL_CARDS.find((c) => c.id === id)!;
        const tag = `${card.name} (${what} ${w}x${h})`;
        expect(f, tag).not.toBeNull();
        const { name, type } = f!;
        expect(name.y + name.height, `${tag}: name ends above the type label`).toBeLessThanOrEqual(type.y + 0.01);
        expect(name.x + name.width, `${tag}: name inside the card`).toBeLessThanOrEqual(w / 2 + 0.5);
        expect(name.y, `${tag}: name inside the card`).toBeGreaterThanOrEqual(-h / 2);
        expect(type.y + type.height, `${tag}: type inside the card`).toBeLessThanOrEqual(h / 2 + 0.5);
      }
      // The longest name is drawn whole (not cut), at the normal size.
      const psf = faces.find(([id]) => id === longest.id)![1]!;
      expect(psf.nameText, `${longest.name} at ${what} size`).toBe(longest.name);
      const typical = faces.find(([id]) => ALL_CARDS.find((c) => c.id === id)!.name.length < 10)![1]!;
      expect(psf.nameFontPx).toBe(typical.nameFontPx);
    }
  });
});
