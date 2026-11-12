// Sprint 2 layout screenshots for review (docs/sprints/sprint-02-screens/).
// Skipped unless OVERCLOCK_SCREENS=1, so normal runs never write into docs:
//   OVERCLOCK_SCREENS=1 npx playwright test e2e/screens.spec.ts --project=phone
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { dispatch, openBoard, toRunnerTurn, waitIdle } from './helpers';

const OUT = fileURLToPath(new URL('../../../docs/sprints/sprint-02-screens/', import.meta.url));

test.skip(!process.env['OVERCLOCK_SCREENS'], 'screenshots only on request (OVERCLOCK_SCREENS=1)');

const SIZES = [
  { name: '844x390', width: 844, height: 390 },
  { name: '640x360', width: 640, height: 360 },
] as const;

const INSETS = [
  { name: '', insets: {} },
  { name: '-notch-left', insets: { left: 47, bottom: 21 } },
  { name: '-notch-right', insets: { right: 47, bottom: 21 } },
] as const;

test.use({ deviceScaleFactor: 2, isMobile: true, hasTouch: true });

for (const size of SIZES) {
  for (const ins of INSETS) {
    test(`landscape ${size.name}${ins.name}`, async ({ page }) => {
      test.skip(test.info().project.name !== 'phone', 'one run is enough');
      await page.setViewportSize({ width: size.width, height: size.height });
      const shot = async (file: string) => {
        await waitIdle(page);
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${OUT}${file}.png` });
      };
      // Busy board preview (S-02-5 fixture) from both seats, then the plain Sprint 1 board.
      await openBoard(page, { seed: 1, insets: ins.insets, query: 'preview=busy' });
      expect((await page.evaluate(() => window.__overclock!.layout())).mode).toBe('phone');
      await shot(`busy-corp-${size.name}${ins.name}`);
      if (ins.name !== '') return;
      await toRunnerTurn(page);
      await shot(`busy-runner-${size.name}`);
      await openBoard(page, { seed: 1 });
      await shot(`empty-corp-${size.name}`);
      for (let i = 0; i < 3; i++) await dispatch(page, { type: 'draw', player: 'corp' });
      await dispatch(page, { type: 'end_turn', player: 'corp' });
      await shot(`discard-picker-${size.name}`);
    });
  }
}
