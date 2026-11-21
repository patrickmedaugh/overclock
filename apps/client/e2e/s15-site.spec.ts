// Sprint 15 (S-15-5, owner Q4 A): the play site's start screen offers "Get the Android app" when
// the site has an app file (`app/latest.json` next to the game); without one (a test link, a
// local build) there is no button. The Android app's bundle never has it (check-android-bundle).
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-15-screens');

const LATEST = { buildTime: '2026-11-20 17:00 UTC', versionCode: 120, branch: 'sprint-15', commit: 'abc1234', apk: 'overclock-sprint-15-120.apk' };

async function openStart(page: Page): Promise<void> {
  await page.goto('./');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && window.__overclockStart?.screen() === 'home');
}

test.describe('S-15-5 Get the Android app', () => {
  test('the start screen shows the button when the site has an app file, linking the newest one', async ({ page }) => {
    await page.route('**/app/latest.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LATEST) }));
    await openStart(page);
    const link = page.locator('#start a.get-app');
    await expect(link).toBeVisible();
    await expect(link).toHaveText('Get the Android app');
    const href = await link.getAttribute('href');
    expect(href).toMatch(/\/app\/overclock-sprint-15-120\.apk$/);
    expect(href).not.toContain('github');
    expect(await link.getAttribute('download')).not.toBeNull();
    // A thumb-sized target, on screen, clear of the start choices.
    const box = (await link.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    for (const c of await page.locator('#start .choice, #start h1').all()) {
      const b = (await c.boundingBox())!;
      const apart = b.x >= box.x + box.width || box.x >= b.x + b.width || b.y >= box.y + box.height || box.y >= b.y + b.height;
      expect(apart, 'the button covers nothing on the start screen').toBe(true);
    }
    const save = test.info().project.name === 'phone-short';
    if (save) mkdirSync(SHOTS, { recursive: true });
    await test.info().attach('get-app', { body: await page.screenshot(save ? { path: join(SHOTS, 's15-5-get-app-891x296.png') } : {}), contentType: 'image/png' });
    // Only on the home screen.
    await page.locator('#start [data-action="play-online"]').click();
    await expect(link).toHaveCount(0);
  });

  test('no app file on the site (a test link): no button', async ({ page }) => {
    await page.route('**/app/latest.json', (r) => r.fulfill({ status: 404, body: 'not found' }));
    await openStart(page);
    await page.waitForTimeout(300);
    await expect(page.locator('#start a.get-app')).toHaveCount(0);
  });
});
