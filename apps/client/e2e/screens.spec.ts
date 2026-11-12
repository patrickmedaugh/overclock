// S-02-5 demo screenshots: the busy board (3 remote servers with 2 ICE each,
// 4 Runner cards) for both seats, on every project. `SAVE_SCREENS=1` also
// writes them to docs/sprints/sprint-02-screens/ for the demo notes.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { expectCleanLayout, layout, openBoard, toBusyBoard } from './helpers';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'sprints', 'sprint-02-screens');

for (const side of ['corp', 'runner'] as const) {
  test(`busy board, ${side} at the bottom`, async ({ page }, info) => {
    await openBoard(page, 3);
    await toBusyBoard(page, { seed: 3, side });
    const l = await layout(page);
    expectCleanLayout(l);
    const shot = await page.screenshot();
    await info.attach(`busy-${side}`, { body: shot, contentType: 'image/png' });
    if (process.env.SAVE_SCREENS) {
      mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: join(OUT, `busy-board-${info.project.name}-${side}.png`) });
    }
    expect(l.servers.filter((s) => s.id.startsWith('remote')).length).toBeGreaterThanOrEqual(3);
  });
}
