// Sprint 8 (U2, S-08-1): each side's identity card on the table, hold to read.
// The Corp's identity takes the HQ slot (it stands for HQ); the Runner's sits
// left of the Stack. Until E1's view carries identities these checks draw
// stand-in cards through the test hook (`stubIdentities`); once E1 lands they
// switch to the real Haas-Bioroid / Kate identities on the core decks.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Side } from '@overclock/engine';
import { type Page, expect, test } from '@playwright/test';
import type { LayoutSnapshot } from '../src/hook-types';
import { expectCleanLayout, holdAt, inside, layout, openBoard, overlaps, passTurn, safeRect, tap, toStep, waitIdle, waitZoom } from './helpers';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-08-screens');
const STUB = { corp: 'c01', runner: 'r01' } as const;

async function shot(page: Page, name: string): Promise<void> {
  const small = test.info().project.name === 'phone-small';
  if (small) mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot(small ? { path: join(SHOTS, `${name}.png`) } : {});
  await test.info().attach(name, { body, contentType: 'image/png' });
}

async function withIdentities(page: Page): Promise<LayoutSnapshot> {
  await page.evaluate((ids) => window.__overclock!.stubIdentities(ids), STUB);
  return waitIdle(page);
}

/** Both identities drawn, in their slots, full card size, nothing overlapping. */
function expectIdentities(l: LayoutSnapshot): void {
  for (const side of ['corp', 'runner'] as Side[]) {
    const id = l.identities[side];
    expect(id, `${side} identity drawn`).not.toBeNull();
    expect(id!.cardId).toBe(STUB[side]);
    expect(inside(id!.box, safeRect(l)), `${side} identity on screen`).toBe(true);
    expect(Math.min(id!.box.width, id!.box.height), `${side} identity at least 44 px`).toBeGreaterThanOrEqual(44);
    for (const h of l.hand) expect(overlaps(id!.box, h.box), `${side} identity over a hand card`).toBe(false);
  }
  const corp = l.identities.corp!.box;
  const runner = l.identities.runner!.box;
  // Corp: inside the HQ column. Runner: left of the Stack, clear of it and the Heap.
  const hq = l.servers.find((s) => s.id === 'hq')!;
  expect(inside(corp, hq.box)).toBe(true);
  expect(runner.x + runner.width).toBeLessThanOrEqual(l.runner.deck.x + 0.5);
  expect(overlaps(runner, l.runner.deck)).toBe(false);
  expect(overlaps(runner, l.runner.discard)).toBe(false);
  expect(overlaps(corp, runner)).toBe(false);
  for (const c of [...l.servers.flatMap((s) => [...s.ice, ...s.content]), ...l.rig]) {
    expect(overlaps(c.box, corp), `${c.uid} over the Corp identity`).toBe(false);
    expect(overlaps(c.box, runner), `${c.uid} over the Runner identity`).toBe(false);
  }
  expectCleanLayout(l);
}

/** Holding the card opens it big and readable; letting go closes it. */
async function holdToRead(page: Page, side: Side): Promise<void> {
  const l = await layout(page);
  const id = l.identities[side]!;
  const h = await holdAt(page, id.box);
  await waitZoom(page, id.cardId);
  await page.waitForTimeout(200);
  const z = (await layout(page)).zoom!;
  expect(z.textOverflow).toBe(false);
  expect(z.box.height).toBeGreaterThan(Math.min(id.box.height * 1.5, page.viewportSize()!.height * 0.85));
  await h.release();
  await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
}

test.describe('U2 identity cards on the table', () => {
  test('both identities are drawn in their slots on both seats; nothing overlaps', async ({ page }) => {
    await openBoard(page, 1);
    let l = await withIdentities(page);
    expect(l.viewer).toBe('corp');
    expectIdentities(l);
    await shot(page, 'u2-identities-corp-view');
    await passTurn(page);
    l = await waitIdle(page);
    expect(l.viewer).toBe('runner');
    expectIdentities(l);
    await shot(page, 'u2-identities-runner-view');
  });

  test('busy board: identities keep their place and the card size does not drop', async ({ page }) => {
    await openBoard(page, 1);
    const plain = await layout(page);
    await toStep(page, 1, 'runner_armitage');
    const l = await withIdentities(page);
    expectIdentities(l);
    // Same card size as without identities (room kept for them, 640x360 included).
    const unit = (x: LayoutSnapshot) => x.runner.deck.width;
    expect(unit(l)).toBe(unit(plain));
    await shot(page, 'u2-identities-with-rig');
  });

  test('hold an identity to read it (both sides); a tap does nothing to the game', async ({ page }) => {
    await openBoard(page, 1);
    await withIdentities(page);
    await holdToRead(page, 'corp');
    await holdToRead(page, 'runner');
    const before = await page.evaluate(() => JSON.stringify(window.__overclock!.getView()));
    const l = await layout(page);
    const b = l.identities.runner!.box;
    await tap(page, b);
    await waitIdle(page);
    expect(await page.evaluate(() => JSON.stringify(window.__overclock!.getView()))).toBe(before);
  });

  test('without identities (starter decks) the HQ marker and the Stack stay where they were', async ({ page }) => {
    await openBoard(page, 1);
    const l = await layout(page);
    expect(l.identities).toEqual({ corp: null, runner: null });
    const hq = l.servers.find((s) => s.id === 'hq')!;
    expect(hq.root).not.toBeNull();
  });
});
