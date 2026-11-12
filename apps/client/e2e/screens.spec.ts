// S-02-5 demo screenshots: the busy board (3 remote servers with 2 ICE each,
// 4 Runner cards) for both seats, on every project. `SAVE_SCREENS=1` also
// writes them to docs/sprints/sprint-02-screens/ for the demo notes.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { dispatch, expectCleanLayout, expectCleanTable, findSeed, getView, layout, openBoard, pick, toBusyBoard, toRunnerTurn, typeOf } from './helpers';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'sprints', 'sprint-02-screens');

for (const side of ['corp', 'runner'] as const) {
  test(`busy board, ${side} at the bottom`, async ({ page }, info) => {
    await openBoard(page, 3);
    await toBusyBoard(page, { seed: 3, side });
    const l = await layout(page);
    expectCleanLayout(l);
    expectCleanTable(l);
    const shot = await page.screenshot();
    await info.attach(`busy-${side}`, { body: shot, contentType: 'image/png' });
    if (process.env.SAVE_SCREENS) {
      mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: join(OUT, `busy-board-${info.project.name}-${side}.png`) });
    }
    expect(l.servers.filter((s) => s.id.startsWith('remote')).length).toBeGreaterThanOrEqual(3);
  });
}

test('picking an ICE lights every server with its price', async ({ page }, info) => {
  const seed = findSeed((c) => c.filter((id) => typeOf(id) === 'ice').length >= 2 && c.some((id) => typeOf(id) === 'agenda'));
  await openBoard(page, seed);
  const hand = (await getView(page)).players.corp.hand!;
  await dispatch(page, { type: 'install', player: 'corp', handIndex: hand.findIndex((id) => typeOf(id) === 'agenda'), server: 'new' });
  const h2 = (await getView(page)).players.corp.hand!;
  await dispatch(page, { type: 'install', player: 'corp', handIndex: h2.findIndex((id) => typeOf(id) === 'ice'), server: 'remote1' });
  const h3 = (await getView(page)).players.corp.hand!;
  const l = await pick(page, h3.findIndex((id) => typeOf(id) === 'ice'));
  expect(l.targets.map((t) => t.label)).toContain('Server 1 · 1 credit');
  await info.attach('targets-corp', { body: await page.screenshot(), contentType: 'image/png' });
  if (process.env.SAVE_SCREENS) await page.screenshot({ path: join(OUT, `targets-ice-${info.project.name}.png`) });
});

test('picking a program lights the Install spot with its price', async ({ page }, info) => {
  const seed = findSeed((_c, r) => r.some((id) => typeOf(id) === 'program') && r.includes('r01'));
  await openBoard(page, seed);
  await toRunnerTurn(page);
  const hand = (await getView(page)).players.runner.hand!;
  const l = await pick(page, hand.findIndex((id) => typeOf(id) === 'program'));
  expect(l.targets[0]!.label).toMatch(/^Install · /);
  await info.attach('targets-runner', { body: await page.screenshot(), contentType: 'image/png' });
  if (process.env.SAVE_SCREENS) await page.screenshot({ path: join(OUT, `targets-install-${info.project.name}.png`) });
});
