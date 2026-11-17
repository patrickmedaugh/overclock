// Sprint 11 (S-11-3, U3): online "Leave for now". Two phones against the real
// service (wrangler dev, test mode; playwright.config.ts). The leaver's start
// screen offers "Continue game · CODE" (no code to type); the other phone reads
// "The Runner left for now. The game is saved" (or the Corp); coming back puts
// the player in their seat with nothing lost. A seat stored under other rules
// shows the plain note (owner Q3 A). The 7-day limit itself is a room test
// (apps/server, fake clock).
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_VERSION, type Side } from '@overclock/engine';
import { STORAGE_KEY } from '@overclock/protocol';
import { type Browser, type Page, expect, test } from '@playwright/test';
import { inside, tap } from './helpers';
import { type Phone, act, frames, joinGame, layoutOf, openPhone, startGame, tapButton, view, waitPlaying, waitView } from './online';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-11-screens');
const NAME: Record<Side, string> = { corp: 'Corp', runner: 'Runner' };

/** Attached to the report; written to the sprint folder at 640x360 only. */
async function shot(phone: Phone | Page, name: string): Promise<void> {
  const page = 'page' in phone ? phone.page : phone;
  const project = test.info().project.name;
  const path = project === 'phone-small' ? join(SHOTS, `s11-3-online-${name}-${project}.png`) : undefined;
  if (path) mkdirSync(SHOTS, { recursive: true });
  await test.info().attach(name, { body: await page.screenshot(path ? { path } : {}), contentType: 'image/png' });
}

async function twoPhones(browser: Browser) {
  const corp = await openPhone(browser);
  const runner = await openPhone(browser);
  const code = await startGame(corp, 'corp');
  await joinGame(runner, code);
  await Promise.all([waitPlaying(corp), waitPlaying(runner)]);
  return { corp, runner, code };
}

const continueOnline = (p: Page, code: string) => p.locator('#start').getByRole('button', { name: new RegExp(`^Continue game · ${code}`) });

/** Back -> "Leave the game?" -> Leave for now, with real taps; the start screen then offers Continue game · CODE. */
async function leaveForNow(phone: Phone, code: string, side: Side): Promise<void> {
  expect(await phone.page.evaluate(() => window.__overclock!.back())).toBe('ask_leave');
  const d = (await layoutOf(phone)).dialog!;
  expect(d.title).toBe('Leave the game?');
  expect(d.text).toBe('The game is saved. Continue it from the start screen.');
  const leave = d.buttons.find((b) => b.label === 'Leave for now');
  expect(leave, 'Leave for now button').toBeDefined();
  expect(Math.min(leave!.box.width, leave!.box.height)).toBeGreaterThanOrEqual(44);
  await tap(phone.page, leave!.box);
  await phone.page.waitForFunction(() => document.body.dataset.ready === 'true' && window.__overclockStart?.screen() === 'home');
  const b = continueOnline(phone.page, code);
  await expect(b).toBeVisible();
  await expect(b).toContainText(`Online · you play the ${NAME[side]}`);
  // The service was told (not just a dropped connection).
  expect(frames(phone.sent).some((f) => f.t === 'leave')).toBe(true);
}

/** Taps Continue game · CODE (no code typed) and waits until the board is back. */
async function continueGame(phone: Phone, code: string): Promise<void> {
  const typed = phone.page.locator('#start input');
  expect(await typed.count()).toBe(0);
  const b = continueOnline(phone.page, code);
  if (test.info().project.use.hasTouch) await b.tap();
  else await b.click();
  await waitPlaying(phone);
  expect(await phone.page.evaluate(() => window.__overclock!.online()!.code)).toBe(code);
}

/** The status line reads `text`, fits the board and is inside the window. */
async function expectStatus(phone: Phone, text: string): Promise<void> {
  await phone.page.waitForFunction((t) => window.__overclock!.layout().status?.text === t, text);
  const l = await layoutOf(phone);
  expect(inside(l.status!.box, { x: 0, y: 0, width: l.viewport.width, height: l.viewport.height })).toBe(true);
}

test.describe('S-11-3 online: Leave for now, Continue game · CODE', () => {
  test('the Runner leaves for now: the Corp reads it, plays on; the Runner continues from the start screen without the code', async ({ browser }) => {
    const { corp, runner, code } = await twoPhones(browser);
    const c0 = (await view(corp)).players.corp.credits;
    await act(corp, { type: 'gain_credit', player: 'corp' });
    await waitView(runner, (v) => v.players.corp.credits === c0 + 1);
    const before = await view(runner);

    await leaveForNow(runner, code, 'runner');
    await shot(runner, 'start-continue');
    // AC: the other player sees it in plain words.
    await expectStatus(corp, 'The Runner left for now. The game is saved');
    expect(await corp.page.evaluate(() => window.__overclock!.online()!.left)).toBe(true);
    await shot(corp, 'runner-left');
    // The Corp plays on meanwhile; nothing is lost.
    await act(corp, { type: 'gain_credit', player: 'corp' });

    await continueGame(runner, code);
    const back = await waitView(runner, (v) => v.players.corp.credits === c0 + 2);
    expect(back.viewer).toBe('runner');
    expect(back.players.runner).toEqual(before.players.runner);
    expect(back.turn).toBe(before.turn);
    // Back in the seat: the Corp's line goes away, and play goes on.
    await corp.page.waitForFunction(() => window.__overclock!.layout().status === null);
    expect(await corp.page.evaluate(() => window.__overclock!.online()!.left)).toBeUndefined();
    await act(corp, { type: 'gain_credit', player: 'corp' });
    await waitView(runner, (v) => v.players.corp.credits === c0 + 3);
    await corp.context.close();
    await runner.context.close();
  });

  test('the Corp leaves for now and closes the app: the Runner reads "The Corp left for now…"; opened again, Continue game · CODE is there', async ({ browser }) => {
    const { corp, runner, code } = await twoPhones(browser);
    const before = await view(corp);
    await leaveForNow(corp, code, 'corp');
    await expectStatus(runner, 'The Corp left for now. The game is saved');
    await shot(runner, 'corp-left');

    // The Corp's app is closed, then opened again later on the same phone.
    await corp.page.close();
    const page = await corp.context.newPage();
    const again: Phone = { ...corp, page, sent: [] };
    page.on('websocket', (ws) => ws.on('framesent', (f) => typeof f.payload === 'string' && again.sent.push(f.payload)));
    await page.goto('./');
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
    await expect(continueOnline(page, code)).toBeVisible();
    await continueGame(again, code);
    const v = await view(again);
    expect(v.viewer).toBe('corp');
    expect(v.players.corp).toEqual(before.players.corp);
    expect(v.activePlayer).toBe(before.activePlayer);
    await runner.page.waitForFunction(() => window.__overclock!.layout().status === null);
    await act(again, { type: 'gain_credit', player: 'corp' });
    await waitView(runner, (x) => x.players.corp.credits === before.players.corp.credits + 1);
    await again.context.close();
    await runner.context.close();
  });

  test('both leave for now; both come back: play goes on where it stopped', async ({ browser }) => {
    const { corp, runner, code } = await twoPhones(browser);
    const clicks = (await view(corp)).players.corp.clicks;
    await act(corp, { type: 'draw', player: 'corp' });
    await waitView(runner, (v) => v.players.corp.clicks === clicks - 1);
    const corpBefore = await view(corp);
    const runnerBefore = await view(runner);
    await leaveForNow(runner, code, 'runner');
    await expectStatus(corp, 'The Runner left for now. The game is saved');
    await leaveForNow(corp, code, 'corp');

    await continueGame(corp, code);
    // The Runner is still away (left): the Corp is told on coming back.
    await expectStatus(corp, 'The Runner left for now. The game is saved');
    await continueGame(runner, code);
    await corp.page.waitForFunction(() => window.__overclock!.layout().status === null);
    expect(await view(corp)).toEqual(corpBefore);
    expect(await view(runner)).toEqual(runnerBefore);
    await act(corp, { type: 'gain_credit', player: 'corp' });
    await waitView(runner, (v) => v.players.corp.credits === corpBefore.players.corp.credits + 1);
    await corp.context.close();
    await runner.context.close();
  });

  test('a seat saved before a rules update: Continue shows the plain note and the seat is forgotten', async ({ browser }) => {
    const { corp, runner, code } = await twoPhones(browser);
    await leaveForNow(runner, code, 'runner');
    await runner.page.evaluate(
      ({ key, v }) => {
        const s = JSON.parse(window.localStorage.getItem(key)!) as Record<string, unknown>;
        window.localStorage.setItem(key, JSON.stringify({ ...s, rulesVersion: v }));
      },
      { key: STORAGE_KEY, v: RULES_VERSION - 1 },
    );
    await runner.page.reload();
    await runner.page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
    await tapButton(runner.page, /^Continue game/);
    await expect(runner.page.locator('#start .error')).toHaveText("That saved game can't continue on this new version of the game. Start a new game.");
    await expect(continueOnline(runner.page, code)).toHaveCount(0);
    expect(await runner.page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY)).toBeNull();
    // No game was opened for it.
    expect(await runner.page.evaluate(() => typeof window.__overclock)).toBe('undefined');
    await shot(runner, 'outdated-note');
    await corp.context.close();
    await runner.context.close();
  });
});
