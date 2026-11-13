// S-06-1 (client part, U1): the start screen. Play on this phone / Play online
// -> Start a game (Corp / Runner) / Join with code, `?join=CODE`, and "Online
// play isn't set up yet" when the build has no online service (`server=none`).
// The e2e web build points at the local service (playwright.config.ts); whole
// online games are in s06-online.spec.ts.
import { type Page, expect, test } from '@playwright/test';
import type { Box } from './helpers';

const START = '#start';
/** Test builds only: as if this build had no online service. */
const NO_SERVER = 'server=none';

async function openStart(page: Page, query = ''): Promise<void> {
  await page.goto(`./${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
}

function screen(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__overclockStart!.screen());
}

async function tapButton(page: Page, name: string | RegExp): Promise<void> {
  const b = page.locator(START).getByRole('button', { name });
  if (test.info().project.use.hasTouch) await b.tap();
  else await b.click();
}

/** Everything on the start screen is inside the window, nothing overlaps, and buttons are big enough to tap. */
async function expectFits(page: Page): Promise<void> {
  const vp = page.viewportSize()!;
  const boxes = await page.locator(`${START} :is(h1, h2, p, button, input)`).evaluateAll((els) =>
    els
      .filter((e) => (e as HTMLElement).offsetParent !== null && (e.tagName === 'INPUT' || (e.textContent ?? '').trim() !== ''))
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { tag: e.tagName, text: (e.textContent ?? '').trim(), box: { x: r.x, y: r.y, width: r.width, height: r.height } };
      }),
  );
  expect(boxes.length).toBeGreaterThan(1);
  for (const b of boxes) {
    expect(b.box.x, `${b.text} inside`).toBeGreaterThanOrEqual(0);
    expect(b.box.y, `${b.text} inside`).toBeGreaterThanOrEqual(0);
    expect(b.box.x + b.box.width, `${b.text} inside`).toBeLessThanOrEqual(vp.width + 0.5);
    expect(b.box.y + b.box.height, `${b.text} inside`).toBeLessThanOrEqual(vp.height + 0.5);
    if (b.tag === 'BUTTON' || b.tag === 'INPUT') {
      expect(b.box.height, `${b.text} tall enough to tap`).toBeGreaterThanOrEqual(44);
      expect(b.box.width, `${b.text} wide enough to tap`).toBeGreaterThanOrEqual(44);
    }
  }
  const overlap = (a: Box, b: Box) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      expect(overlap(boxes[i]!.box, boxes[j]!.box), `"${boxes[i]!.text}" overlaps "${boxes[j]!.text}"`).toBe(false);
    }
  }
}

/** Attached to the report; `S06_SHOTS=<dir>` also writes them there (for review). */
async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.S06_SHOTS;
  const path = dir ? `${dir}/${test.info().project.name}-${name}.png` : undefined;
  await test.info().attach(name, { body: await page.screenshot(path ? { path } : {}), contentType: 'image/png' });
}

test.describe('S-06-1 start screen', () => {
  test('opens on Play on this phone / Play online; Play on this phone starts the pass-the-phone game', async ({ page }) => {
    await openStart(page);
    await expect(page.locator(START)).toBeVisible();
    await expect(page.locator(START).getByRole('button', { name: /Play on this phone/ })).toBeVisible();
    await expect(page.locator(START).getByRole('button', { name: /Play online/ })).toBeVisible();
    // No game yet.
    expect(await page.evaluate(() => typeof window.__overclock)).toBe('undefined');
    await expectFits(page);
    await shot(page, 'start-home');

    const t0 = Date.now();
    await tapButton(page, /Play on this phone/);
    await page.waitForFunction(() => !!window.__overclock);
    const ms = Date.now() - t0;
    test.info().annotations.push({ type: 'play-here-ms', description: String(ms) });
    await expect(page.locator(START)).toBeHidden();
    const v = await page.evaluate(() => window.__overclock!.getView());
    expect(v.viewer).toBe('corp');
    expect(v.activePlayer).toBe('corp');
    // The board itself is on screen, ready to tap.
    const l = await page.evaluate(() => window.__overclock!.layout());
    expect(l.hand.length).toBeGreaterThan(0);
    expect(l.cover).toBeNull();
    expect(l.endTurn).not.toBeNull();
  });

  test('Play online without an online service says it is not set up yet, and Back returns', async ({ page }) => {
    await openStart(page, NO_SERVER);
    await tapButton(page, /Play online/);
    await expect(page.locator(START)).toContainText("Online play isn't set up yet");
    expect(await screen(page)).toBe('not_set_up');
    await expectFits(page);
    await shot(page, 'start-not-set-up');
    await tapButton(page, 'Back');
    expect(await screen(page)).toBe('home');
    // From the notice, Play on this phone still works.
    await tapButton(page, /Play online/);
    await tapButton(page, /Play on this phone/);
    await page.waitForFunction(() => !!window.__overclock);
    await expect(page.locator(START)).toBeHidden();
  });

  test('a shared link (?join=CODE) without an online service says it is not set up yet and drops the code from the address', async ({ page }) => {
    await openStart(page, `join=k7qf&${NO_SERVER}`);
    expect(await screen(page)).toBe('not_set_up');
    await expect(page.locator(START)).toContainText("Online play isn't set up yet");
    expect(new URL(page.url()).searchParams.get('join')).toBeNull();
  });

  test('with an online service: Start a game asks Corp or Runner; Join with code takes a code', async ({ page }) => {
    await openStart(page);
    await tapButton(page, /Play online/);
    expect(await screen(page)).toBe('online');
    await expect(page.locator(START).getByRole('button', { name: /Start a game/ })).toBeVisible();
    await expect(page.locator(START).getByRole('button', { name: /Join with code/ })).toBeVisible();
    await expectFits(page);
    await shot(page, 'start-online');

    await tapButton(page, /Start a game/);
    expect(await screen(page)).toBe('pick');
    await expect(page.locator(START).getByRole('button', { name: /^Corp/ })).toBeVisible();
    await expect(page.locator(START).getByRole('button', { name: /^Runner/ })).toBeVisible();
    await expect(page.locator(START)).toContainText('The other player gets the other side.');
    await expectFits(page);
    await shot(page, 'start-pick-side');
    await tapButton(page, /^Corp/);
    // The lobby: the code to send, Share, waiting (the joining is in s06-online).
    await expect(page.locator(`${START} .code-big`)).toHaveText(/^[A-Z2-9]{4}$/);
    await expect(page.locator(START)).toContainText('Waiting for the other player…');
    await expectFits(page);
    await shot(page, 'start-lobby');
    // Back gives the game up (not offered for Rejoin).
    await tapButton(page, 'Back');
    expect(await screen(page)).toBe('online');
    await tapButton(page, 'Back');
    await expect(page.locator(START).getByRole('button', { name: /Rejoin/ })).toHaveCount(0);
    await tapButton(page, /Play online/);

    await tapButton(page, /Join with code/);
    expect(await screen(page)).toBe('join');
    const input = page.locator(`${START} input`);
    await expectFits(page);
    // A code that can't exist: a plain message, try again.
    await input.fill('ab');
    await tapButton(page, /^Join$/);
    await expect(page.locator(`${START} .error`)).toHaveText('Codes are 4 letters or numbers, like K7QF');
    await shot(page, 'start-join-bad-code');
    // Typed loosely: upper-cased, spaces and dashes dropped.
    await input.fill('');
    await input.pressSequentially('k7-q f');
    await expect(input).toHaveValue('K7QF');
    await expect(page.locator(`${START} .error`)).toHaveText('');
    await input.press('Enter');
    // Nobody started K7QF: a plain message, and the code stays to fix and try again.
    await expect(page.locator(`${START} .error`)).toHaveText('No game with that code');
    expect(await screen(page)).toBe('join');
    await expect(input).toHaveValue('K7QF');
    await expectFits(page);
    await shot(page, 'start-join-no-game');
  });

  test('a shared link (?join=CODE) with an online service goes straight to joining that code', async ({ page }) => {
    await openStart(page, 'join=k7qf');
    // (Nobody started K7QF here; s06-online joins a real one.)
    await expect(page.locator(`${START} .error`)).toHaveText('No game with that code');
    await expect(page.locator(`${START} input`)).toHaveValue('K7QF');
    expect(new URL(page.url()).searchParams.get('join')).toBeNull();
  });

  test("the phone's Back button steps back through the start screen, then closes the app", async ({ page }) => {
    await openStart(page);
    await tapButton(page, /Play online/);
    await tapButton(page, /Join with code/);
    expect(await screen(page)).toBe('join');
    await page.evaluate(() => window.__overclockStart!.back());
    expect(await screen(page)).toBe('online');
    await page.evaluate(() => window.__overclockStart!.back());
    expect(await screen(page)).toBe('home');
    expect(await page.evaluate(() => window.__overclockStart!.exitRequests())).toBe(0);
    expect(await page.evaluate(() => window.__overclockStart!.back())).toBe('exit');
    expect(await page.evaluate(() => window.__overclockStart!.exitRequests())).toBe(1);
  });
});
