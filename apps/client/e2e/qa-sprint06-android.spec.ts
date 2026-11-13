// QA Sprint 6 (written by QA): the Android app's bundle opens on the start
// screen (S-06-1 AC1 "web link or app"), at both phone sizes, with real taps.
// This e2e app build has no online service, so Play online says so. Runs in the
// `android` project (no test hook in this bundle).
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-06-qa');

for (const vp of [
  { width: 844, height: 390 },
  { width: 640, height: 360 },
]) {
  test(`app bundle ${vp.width}x${vp.height}: start screen, Play online (not set up in this build), Play on this phone`, async ({ page }) => {
    mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize(vp);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./');
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    const start = page.locator('#start');
    await expect(start.getByRole('button', { name: /Play on this phone/ })).toBeVisible();
    await expect(start.getByRole('button', { name: /Play online/ })).toBeVisible();
    for (const b of await start.getByRole('button').all()) {
      if (!(await b.isVisible())) continue;
      const box = (await b.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 0.5);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: join(SHOTS, `android-app-${vp.width}x${vp.height}-01-start.png`) });
    await start.getByRole('button', { name: /Play online/ }).tap();
    await expect(start).toContainText("Online play isn't set up yet");
    await page.screenshot({ path: join(SHOTS, `android-app-${vp.width}x${vp.height}-02-online-not-set-up.png`) });
    await start.getByRole('button', { name: /Play on this phone/ }).tap();
    await expect(start).toBeHidden();
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(SHOTS, `android-app-${vp.width}x${vp.height}-03-board.png`) });
    expect(errors).toEqual([]);
  });
}
