// Sprint 11 (S-11-3, U2): pass-the-phone saves itself after every move.
// Close the tab (or reload) and the start screen offers Continue game; it
// brings back the same board on the same player's turn, behind the "Pass to …"
// cover for the seat that must act. A finished game has no Continue; a save
// from other rules shows a plain note and a new game is one tap away.
// Setups: real games planned with `planToStep` (@overclock/match/testing), played
// through the hook on the page (core decks, cover on).
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_VERSION } from '@overclock/engine';
import { type StepGoal, goalDeckSet } from '@overclock/match/testing';
import { type Page, expect, test } from '@playwright/test';
import type { Box } from './helpers';
import { dispatch, getView, layout, tap, toStep, waitIdle } from './helpers';
import { tapButton } from './online';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-11-screens');
const KEY = 'overclock.hotseat.v1';
const START = '#start';

/** Attached to the report; written to the sprint folder at 640x360 only (keeps the folder small). */
async function shot(page: Page, name: string): Promise<void> {
  const project = test.info().project.name;
  const path = project === 'phone-small' ? join(SHOTS, `s11-3-${name}-${project}.png`) : undefined;
  if (path) mkdirSync(SHOTS, { recursive: true });
  await test.info().attach(name, { body: await page.screenshot(path ? { path } : {}), contentType: 'image/png' });
}

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
}

/** A pass-the-phone game (cover on; the goal's decks) played to `goal`; waits until its save holds every move. */
async function savedGameAt(page: Page, seed: number, goal: StepGoal) {
  await page.goto(`./?seed=${seed}&play=here${goalDeckSet(goal) === 'starter' ? '&decks=starter' : ''}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
  const plan = await toStep(page, seed, goal);
  await expect.poll(() => savedMoves(page)).toBe(plan.actions.length);
  return plan;
}

/** Moves in the stored save (-1: none stored). */
function savedMoves(page: Page): Promise<number> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw === null ? -1 : (JSON.parse(raw) as { actions: unknown[] }).actions.length;
  }, KEY);
}

const continueHere = (page: Page) => page.locator(START).getByRole('button', { name: /^Continue game/ });

/** Opens the start screen in a new tab of the same browser (the old tab closed). */
async function reopen(page: Page): Promise<Page> {
  const context = page.context();
  await page.close();
  const next = await context.newPage();
  await next.goto('./');
  await ready(next);
  return next;
}

/** Everything on the start screen inside the window, nothing overlapping, buttons >= 44 px (as s06-start). */
async function expectStartFits(page: Page): Promise<void> {
  const vp = page.viewportSize()!;
  const boxes = await page.locator(`${START} :is(h1, h2, p, button)`).evaluateAll((els) =>
    els
      .filter((e) => (e as HTMLElement).offsetParent !== null && (e.textContent ?? '').trim() !== '')
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { tag: e.tagName, text: (e.textContent ?? '').trim(), box: { x: r.x, y: r.y, width: r.width, height: r.height } };
      }),
  );
  for (const b of boxes) {
    expect(b.box.x, `${b.text} inside`).toBeGreaterThanOrEqual(0);
    expect(b.box.y, `${b.text} inside`).toBeGreaterThanOrEqual(0);
    expect(b.box.x + b.box.width, `${b.text} inside`).toBeLessThanOrEqual(vp.width + 0.5);
    expect(b.box.y + b.box.height, `${b.text} inside`).toBeLessThanOrEqual(vp.height + 0.5);
    if (b.tag === 'BUTTON') expect(Math.min(b.box.width, b.box.height), `${b.text} big enough to tap`).toBeGreaterThanOrEqual(44);
  }
  const overlap = (a: Box, b: Box) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!.box, boxes[j]!.box), `"${boxes[i]!.text}" overlaps "${boxes[j]!.text}"`).toBe(false);
  }
}

/** Taps Continue game; the board comes back behind the cover for `to`; returns once the cover is up. */
async function continueBehindCover(page: Page, to: 'corp' | 'runner') {
  await tapButton(page, /^Continue game/);
  await page.waitForFunction(() => !!window.__overclock);
  await expect(page.locator(START)).toBeHidden();
  const l = await layout(page);
  expect(l.cover, 'a restored game opens behind the pass cover').not.toBeNull();
  expect(l.cover!.to).toBe(to);
  expect(l.cover!.title).toBe(`Pass to the ${to === 'corp' ? 'Corp' : 'Runner'} — tap when ready`);
  // The cover hides the whole screen (nothing of either hand shows before the right player taps).
  expect(l.cover!.box).toEqual({ x: 0, y: 0, width: l.viewport.width, height: l.viewport.height });
  return l;
}

async function liftCover(page: Page): Promise<void> {
  const l = await layout(page);
  await tap(page, l.cover!.content);
  await page.waitForFunction(() => window.__overclock!.layout().cover === null);
}

test.describe('S-11-3 pass-the-phone: save and continue', () => {
  test('close the tab mid-game, open again: Continue game brings back the same board on the same turn, behind the cover', async ({ page }) => {
    // Core decks, mid-run: the Runner meets a rezzed Ice Wall with Battering Ram and Gordian Blade installed.
    const plan = await savedGameAt(page, 1, 'ice_wall_ram_gordian');
    expect(plan.activePlayer).toBe('runner');
    const before = await getView(page);
    const beforeLayout = await waitIdle(page);

    const next = await reopen(page);
    // AC: the start screen shows Continue game (with whose turn it is).
    await expect(continueHere(next)).toBeVisible();
    await expect(continueHere(next)).toContainText("On this device · Runner's turn");
    await expect(next.locator(START).getByRole('button', { name: /Play on this device/ })).toBeVisible();
    await expectStartFits(next);
    await shot(next, 'start-continue');

    await continueBehindCover(next, 'runner');
    await shot(next, 'restored-cover');
    // Same board, hands, credits, clicks and turn (the whole projected view).
    expect(await getView(next)).toEqual(before);
    await liftCover(next);
    const after = await waitIdle(next);
    expect(await getView(next)).toEqual(before);
    expect(after.hand.map((h) => h.cardId)).toEqual(beforeLayout.hand.map((h) => h.cardId));
    expect(after.run?.iceUid).toBe(plan.info.iceUid);
    expect(after.run?.buttons.map((b) => b.label)).toEqual(beforeLayout.run?.buttons.map((b) => b.label));
    await shot(next, 'restored-board');

    // Play goes on (Battering Ram breaks Ice Wall's subroutine), and keeps saving.
    const brk = before.run!.options.find((o) => o.action.type === 'use_ability' && o.action.uid === plan.info.ramUid && (o.action.sub !== undefined || o.action.subs !== undefined) && o.reject === null);
    expect(brk).toBeDefined();
    expect((await dispatch(next, brk!.action)).some((e) => e.type === 'action_rejected')).toBe(false);
    await expect.poll(() => savedMoves(next)).toBe(plan.actions.length + 1);
  });

  test('reload mid-game: the address no longer starts a new game; Continue game brings it back', async ({ page }) => {
    const plan = await savedGameAt(page, 2, 'agenda_one_advance');
    expect(new URL(page.url()).searchParams.get('play'), 'play=here leaves the address').toBeNull();
    const before = await getView(page);
    await page.reload();
    await ready(page);
    expect(await page.evaluate(() => typeof window.__overclock)).toBe('undefined');
    await expect(continueHere(page)).toContainText("Corp's turn");
    await continueBehindCover(page, plan.activePlayer);
    expect(await getView(page)).toEqual(before);
  });

  test("mid-run with the Corp's rez decision open: the cover goes to the Corp, and the decision is back", async ({ page }) => {
    await savedGameAt(page, 1, 'corp_rez_prompt');
    const before = await getView(page);
    const decision = await page.evaluate(() => window.__overclock!.decision());
    expect(decision?.seat).toBe('corp');
    await page.reload();
    await ready(page);
    // The Runner's turn (the Runner is running), but the Corp must act: the cover says so.
    await expect(continueHere(page)).toContainText("Runner's turn");
    await continueBehindCover(page, 'corp');
    expect(await getView(page)).toEqual(before);
    expect(await page.evaluate(() => window.__overclock!.decision())).toEqual(decision);
    await liftCover(page);
    const l = await waitIdle(page);
    expect(l.run?.buttons.some((b) => /^Rez/.test(b.label))).toBe(true);
  });

  test('a finished game: its save is deleted and the start screen offers no Continue', async ({ page }) => {
    await savedGameAt(page, 1, 'corp_one_score_from_win');
    const score = (await getView(page)).legalActions.find((a) => a.type === 'score');
    expect(score).toBeDefined();
    await dispatch(page, score!);
    expect((await getView(page)).result).not.toBeNull();
    await expect.poll(() => savedMoves(page)).toBe(-1);
    const next = await reopen(page);
    await expect(next.locator(START).getByRole('button', { name: /Play on this device/ })).toBeVisible();
    await expect(continueHere(next)).toHaveCount(0);
  });

  test('a save from before a rules update: Continue shows a plain note, the save is gone, and a new game starts', async ({ page }) => {
    await savedGameAt(page, 3, 'runner_one_steal_from_win');
    await page.evaluate(
      ({ key, v }) => {
        const s = JSON.parse(window.localStorage.getItem(key)!) as { rulesVersion: number };
        window.localStorage.setItem(key, JSON.stringify({ ...s, rulesVersion: v }));
      },
      { key: KEY, v: RULES_VERSION - 1 },
    );
    const next = await reopen(page);
    await expect(continueHere(next)).toBeVisible();
    await tapButton(next, /^Continue game/);
    await expect(next.locator(`${START} .error`)).toHaveText("That saved game can't continue on this new version of the game. Start a new game.");
    expect(await next.evaluate(() => window.__overclockStart!.screen())).toBe('home');
    expect(await next.evaluate(() => typeof window.__overclock)).toBe('undefined');
    await expect(continueHere(next)).toHaveCount(0);
    expect(await savedMoves(next)).toBe(-1);
    await expectStartFits(next);
    await shot(next, 'outdated-note');
    // A new game is one tap away.
    await tapButton(next, /Play on this device/);
    await next.waitForFunction(() => !!window.__overclock);
    const v = await getView(next);
    expect(v.activePlayer).toBe('corp');
    expect(v.turn).toBe(1);
  });

  test('one save slot: Play on this device replaces the saved game', async ({ page }) => {
    await savedGameAt(page, 3, 'runner_one_steal_from_win');
    const next = await reopen(page);
    await expect(continueHere(next)).toBeVisible();
    await tapButton(next, /Play on this device/);
    await next.waitForFunction(() => !!window.__overclock);
    // The new game is the save now (no moves yet), so the old one can't come back.
    await expect.poll(() => savedMoves(next)).toBe(0);
    const again = await reopen(next);
    await expect(continueHere(again)).toContainText("Corp's turn");
  });

  test('Leave the game? says the game is saved', async ({ page }) => {
    await savedGameAt(page, 2, 'agenda_one_advance');
    await liftCoverIfUp(page);
    expect(await page.evaluate(() => window.__overclock!.back())).toBe('ask_leave');
    const d = (await layout(page)).dialog!;
    expect(d.text).toBe('The game is saved. Continue it from the start screen.');
    expect(d.buttons.map((b) => b.label).sort()).toEqual(['Leave for now', 'Stay']);
    for (const b of d.buttons) expect(Math.min(b.box.width, b.box.height)).toBeGreaterThanOrEqual(44);
    await shot(page, 'leave-dialog');
  });

  test('with storage blocked, the game still plays (nothing offered to continue)', async ({ page }) => {
    await page.addInitScript(() => {
      const no = () => {
        throw new Error('blocked');
      };
      Storage.prototype.getItem = no;
      Storage.prototype.setItem = no;
      Storage.prototype.removeItem = no;
    });
    await page.goto('./');
    await ready(page);
    await expect(continueHere(page)).toHaveCount(0);
    await tapButton(page, /Play on this device/);
    await page.waitForFunction(() => !!window.__overclock);
    const c = (await getView(page)).players.corp.credits;
    await dispatch(page, { type: 'gain_credit', player: 'corp' });
    await page.waitForTimeout(50);
    expect((await getView(page)).players.corp.credits).toBe(c + 1);
  });
});

async function liftCoverIfUp(page: Page): Promise<void> {
  if ((await layout(page)).cover) await liftCover(page);
}
