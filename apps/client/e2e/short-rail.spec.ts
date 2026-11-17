// Owner bug (Sprint 9): on an Android phone in Chrome with the address bar
// showing (a sideways screen only ~300-345 CSS px tall), the Score button was
// squashed to a sliver under the build date. At short heights the rail drops
// its build date and slims the clicks pill first, so a picked card's two
// buttons (Advance + Score, or a scored agenda's ability) stay full size.
// Runs in the `phone-short` project only (see playwright.config.ts), at several
// short sideways sizes.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCard } from '@overclock/cards';
import { type Page, expect, test } from '@playwright/test';
import type { Box, LayoutSnapshot } from '../src/hook-types';
import { boardElements, expectCleanLayout, getView, inside, layout, openBoard, overlaps, tap, targetOf, toStep, waitIdle } from './helpers';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-09-screens');

/** Android Chrome sideways with its bars (the owner's phone measures ~891x296), and nearby sizes. */
const SIZES = [
  { width: 915, height: 330 },
  { width: 900, height: 345 },
  { width: 844, height: 340 },
  { width: 891, height: 296 },
];

/** The button is full size, on screen, and clear of every other rail / board element. */
function expectFullButton(l: LayoutSnapshot, name: string, b: Box): void {
  const view: Box = { x: 0, y: 0, width: l.viewport.width, height: l.viewport.height };
  expect(inside(b, view), `${name} ${JSON.stringify(b)} inside the viewport`).toBe(true);
  expect(b.height, `${name} is at least 44px tall`).toBeGreaterThanOrEqual(44);
  const others: [string, Box][] = [...boardElements(l)];
  if (l.status) others.push(['status', l.status.box]);
  for (const t of l.targets) if (t.box !== b && !(t.box.x === b.x && t.box.y === b.y)) others.push([`target ${t.label}`, t.box]);
  for (const [n, o] of others) expect(overlaps(b, o), `${name} ${JSON.stringify(b)} overlaps ${n} ${JSON.stringify(o)}`).toBe(false);
}

async function save(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

for (const size of SIZES) {
  test.describe(`short sideways screen ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    // Sprint 10 (S-10-3): Advance stops at the requirement, so a ready agenda shows only Score
    // (the two-button room is still checked by the layout unit tests and the PSF test below).
    test('an agenda with enough advancements: Score shows in full; tapping Score scores it', async ({ page }) => {
      await openBoard(page, 1);
      const plan = await toStep(page, 1, 'agenda_one_advance');
      let l = await waitIdle(page);
      const card = l.servers.flatMap((s) => s.content).find((c) => c.uid === plan.info.uid)!;
      await tap(page, card.box);
      await tap(page, targetOf(await layout(page), 'advance').box);
      l = await waitIdle(page);
      expect(l.targets.map((t) => t.kind)).toEqual(['score']);
      if (size.height === 296) await save(page, 'score-short-after');
      expectFullButton(l, 'Score', targetOf(l, 'score').box);
      expectCleanLayout(l);
      const before = await getView(page);
      await tap(page, targetOf(l, 'score').box);
      await waitIdle(page);
      expect((await getView(page)).players.corp.points).toBe(before.players.corp.points + getCard(plan.info.cardId!)!.agendaPoints!);
    });

    test('Private Security Force in the score area, Runner tagged: "Do 1 meat damage · 1 click" shows in full', async ({ page }) => {
      await page.goto('./?seed=1&play=here&cover=off');
      await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
      await toStep(page, 1, 'psf_scored_tagged');
      let l = await waitIdle(page);
      await tap(page, l.score.corp.box);
      l = await layout(page);
      const use = targetOf(l, 'activate');
      expect(use).toMatchObject({ label: 'Do 1 meat damage · 1 click', lit: true });
      expectFullButton(l, 'PSF', use.box);
      const before = await getView(page);
      await tap(page, use.box);
      await waitIdle(page);
      expect((await getView(page)).players.runner.handCount).toBe(before.players.runner.handCount - 1);
    });
  });
}
