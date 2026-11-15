// Sprint 8 (U2, S-08-1): each side's identity card on the table, hold to read,
// and what it does on screen. Core decks (as players get them): Haas-Bioroid:
// Engineering the Future (in the HQ slot) and Kate "Mac" McCaffrey (left of the
// Stack). 640x360 screenshots go to docs/sprints/sprint-08-screens/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Side } from '@overclock/engine';
import { type Page, expect, test } from '@playwright/test';
import type { LayoutSnapshot } from '../src/hook-types';
import { expectCleanLayout, getView, holdAt, inside, layout, measureTap, openBoard, overlaps, passTurn, pickHand, safeRect, tap, toStep, waitIdle, waitZoom } from './helpers';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-08-screens');
const IDS = { corp: 'c13', runner: 'r13' } as const;

async function shot(page: Page, name: string): Promise<void> {
  const small = test.info().project.name === 'phone-small';
  if (small) mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot(small ? { path: join(SHOTS, `${name}.png`) } : {});
  await test.info().attach(name, { body, contentType: 'image/png' });
}

/** Both identities drawn, in their slots, full card size, nothing overlapping. */
function expectIdentities(l: LayoutSnapshot): void {
  for (const side of ['corp', 'runner'] as Side[]) {
    const id = l.identities[side];
    expect(id, `${side} identity drawn`).not.toBeNull();
    expect(id!.cardId).toBe(IDS[side]);
    expect(id!.uid).toBe(`id:${side}`);
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
  expect(z.texts.join(' ')).toContain(side === 'corp' ? 'Engineering the Future' : 'Digital Tinker');
  expect(z.box.height).toBeGreaterThan(Math.min(id.box.height * 1.5, page.viewportSize()!.height * 0.85));
  await test.info().attach(`zoom ${id.cardId}`, { body: await page.screenshot(), contentType: 'image/png' });
  await h.release();
  await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
}

test.describe('U2 identity cards on the table (core decks)', () => {
  test('both identities are drawn in their slots on both seats; nothing overlaps', async ({ page }) => {
    await openBoard(page, { seed: 1, decks: 'core' });
    let l = await waitIdle(page);
    expect(l.viewer).toBe('corp');
    expectIdentities(l);
    await shot(page, 'u2-identities-corp-view');
    await passTurn(page);
    l = await waitIdle(page);
    expect(l.viewer).toBe('runner');
    expectIdentities(l);
    await shot(page, 'u2-identities-runner-view');
  });

  test('hold an identity to read it (both sides); a tap does nothing to the game', async ({ page }) => {
    await openBoard(page, { seed: 1, decks: 'core' });
    await waitIdle(page);
    await holdToRead(page, 'corp');
    await holdToRead(page, 'runner');
    const before = JSON.stringify(await getView(page));
    await tap(page, (await layout(page)).identities.runner!.box);
    await waitIdle(page);
    expect(JSON.stringify(await getView(page))).toBe(before);
  });

  test('Haas-Bioroid: the first install of the turn gives +1 credit and says so', async ({ page }) => {
    await openBoard(page, { seed: 1, decks: 'core' });
    const plan = await toStep(page, 1, 'corp_first_install');
    const before = (await getView(page)).players.corp.credits;
    let l = await pickHand(page, Number(plan.info['handIndex']));
    const target = l.targets.find((t) => t.kind === 'new_server' && t.lit);
    expect(target, JSON.stringify(l.targets.map((t) => [t.kind, t.label, t.lit]))).toBeDefined();
    const m = await measureTap(page, target!.box);
    expect(m.events.map((e) => e.type)).toEqual(expect.arrayContaining(['card_installed', 'ability_triggered', 'credit_gained']));
    expect(m.view.players.corp.credits).toBe(before + 1);
    l = await waitIdle(page);
    expect(l.hint?.text).toContain('Engineering the Future: +1 credit');
    expectIdentities(l);
    await shot(page, 'u2-hb-first-install');
  });

  test('Kate: the install price is already lowered and says so; installing notes "1 credit off"', async ({ page }) => {
    await openBoard(page, { seed: 1, decks: 'core' });
    const plan = await toStep(page, 1, 'runner_kate_discount');
    const v = await getView(page);
    const idx = Number(plan.info['corroderIndex']);
    expect(v.handOptions[idx]!.find((o) => o.discount)).toMatchObject({ cost: 1, discount: 1 });
    const l = await pickHand(page, idx);
    const t = l.targets.find((x) => x.lit && x.label.includes('(−1)'));
    expect(t, JSON.stringify(l.targets.map((x) => x.label))).toBeDefined();
    expect(t!.label).toContain('1 credit (−1)');
    await shot(page, 'u2-kate-discount-label');
    const m = await measureTap(page, t!.box);
    expect(m.view.players.runner.credits).toBe(v.players.runner.credits - 1);
    expect((await waitIdle(page)).hint?.text).toContain('Digital Tinker: 1 credit off');
  });
});
