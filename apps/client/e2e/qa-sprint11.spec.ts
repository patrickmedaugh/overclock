// QA (Sprint 11), written independently of the developers' s11-* specs.
// - S-11-1: on Ice Wall the Battering Ram buttons say "Battering Ram: break barrier sub · 2 credits"
//   and "Battering Ram: +1 str · 1 credit", with no "up to"; every button that comes from a card
//   starts with that card's whole name and keeps its price; readable (text floors) and thumb size.
// - S-11-2: Ice Wall: one real tap breaks the subroutine and pays 2 (no pick step); Heimdall 1.0:
//   the pick hint is "Pick up to N" with N the most subroutines the engine offers in one break, a
//   third pick never makes it more than N; with one subroutine left the button is plain.
// - S-11-3 pass-the-phone: real taps are saved; close the tab, open again: Continue game; the cover
//   goes to the seat that must act, and the cover's pixels are the same whatever the game (nothing
//   of either hand shows); after the cover, the board is that seat's. Finished game (through the
//   game-over box): no Continue. Outdated (newer rules version, or a move the rules now refuse):
//   the plain note. A broken save: no Continue, no crash. A pass-the-phone save and an online seat
//   together: both rows fit.
// - S-11-3 online: the Corp leaves for now while its own rez decision is open (Runner waiting): the
//   Runner reads "The Corp left for now. The game is saved"; the Corp's start screen offers
//   Continue game · CODE; tapping it brings the decision back; the Corp rezzes with a real tap.
//   The Leave for now tap is answered at once and the start screen is there within 1.5 s.
// - S-11-4: every card of both decks, full face from 120 px wide up to this screen's zoom size:
//   each stat shows its label and number, inside the card, not overlapping.
// Screenshots (QA_SCREENS=1 only) go to docs/sprints/sprint-11-qa/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORP_CORE_DECK, CORP_STARTER_DECK, RUNNER_CORE_DECK, RUNNER_STARTER_DECK, getCard } from '@overclock/cards';
import { RULES_VERSION, type Action } from '@overclock/engine';
import { type StepGoal, goalDeckSet, planToStep } from '@overclock/match/testing';
import { STORAGE_KEY } from '@overclock/protocol';
import { type Page, expect, test } from '@playwright/test';
import type { Box, LayoutSnapshot } from '../src/hook-types';
import { dispatch, getView, layout, measureTap, openBoard, overlaps, pressAndHold, runButtonOf, tap, toStep, waitIdle } from './helpers';
import { joinGame, layoutOf, openPhone, startTestGame, tapButton, view, waitPlaying, waitView } from './online';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-11-qa');
const SIZE: Record<string, string> = { phone: '844x390', 'phone-small': '640x360', desktop: '1280x800', 'phone-short': '891x296' };
const KEY = 'overclock.hotseat.v1';
/** The e2e online service's address (playwright.config.ts: E2E_SERVER_PORT, default E2E_PORT + 600). */
const SERVER_URL = `ws://127.0.0.1:${Number(process.env.E2E_SERVER_PORT ?? Number(process.env.E2E_PORT ?? 4173) + 600)}`;
/** QA-S3-4 run-button text floors per screen (DECISIONS 2026-11-17: desktop 12, 844x390 14, small screens 11.5). */
const FLOOR: Record<string, number> = { desktop: 12, phone: 14, 'phone-small': 11.5, 'phone-short': 11.5 };

async function shot(page: Page, name: string): Promise<void> {
  const p = test.info().project.name;
  const body = await page.screenshot(process.env.QA_SCREENS === '1' ? { path: join(SHOTS, `${SIZE[p] ?? p}-${name}.png`) } : {});
  if (process.env.QA_SCREENS === '1') mkdirSync(SHOTS, { recursive: true });
  await test.info().attach(name, { body, contentType: 'image/png' });
}

type Btn = NonNullable<LayoutSnapshot['run']>['buttons'][number];

/** Every run button readable and thumb size; a card's button names the whole card and keeps its price. */
function expectRunButtonsGood(l: LayoutSnapshot): void {
  const floor = FLOOR[test.info().project.name] ?? 12;
  for (const b of l.run!.buttons) {
    expect(b.fontPx, `"${b.label}" text ${b.fontPx}px`).toBeGreaterThanOrEqual(floor);
    expect(Math.min(b.box.width, b.box.height), `"${b.label}" thumb size`).toBeGreaterThanOrEqual(44);
    expect(b.box.x).toBeGreaterThanOrEqual(0);
    expect(b.box.x + b.box.width).toBeLessThanOrEqual(l.viewport.width + 0.5);
    expect(b.box.y + b.box.height).toBeLessThanOrEqual(l.viewport.height + 0.5);
    expect(overlaps(b.box, l.run!.infoBox), `"${b.label}" vs run panel`).toBe(false);
    for (const o of l.run!.buttons) if (o !== b) expect(overlaps(b.box, o.box), `"${b.label}" vs "${o.label}"`).toBe(false);
  }
  for (const b of fromCards(l)) {
    const name = getCard(b.source!)!.name;
    expect(b.label.startsWith(`${name}: `), `"${b.label}" starts with the whole name ${name}`).toBe(true);
    const full = b.fullLabel ?? b.label;
    const price = / · (\d+ credits?|.* pays.*)$/.exec(full)?.[1];
    if (price) expect(b.label.endsWith(` · ${price}`), `"${b.label}" keeps its price`).toBe(true);
  }
}

const fromCards = (l: LayoutSnapshot): Btn[] => l.run!.buttons.filter((b) => !!b.source);

// ---- S-11-1 / S-11-2 ------------------------------------------------------------------------------

test.describe('QA S-11-1 / S-11-2 break buttons', () => {
  test('Ice Wall with Battering Ram (and Gordian Blade): named buttons, "barrier", price; one real tap breaks it and pays 2, no pick step', async ({ page }) => {
    await openBoard(page, { seed: 4, decks: 'core' });
    const plan = await toStep(page, 4, 'ice_wall_ram_gordian');
    let l = await waitIdle(page);
    expect(l.run).toMatchObject({ step: 'encounter', stepLabel: 'Encounter: Ice Wall' });
    const v = await getView(page);
    expect(v.rig.map((c) => c.cardId)).toEqual(expect.arrayContaining(['r17', 'r05']));
    // AC1 / AC2.
    const brk = runButtonOf(l, 'Battering Ram: break barrier sub · 2 credits');
    expect(brk.source).toBe('r17');
    expect(brk.role, 'a plain button (S-11-2)').toBeUndefined();
    const pump = runButtonOf(l, 'Battering Ram: +1 str · 1 credit');
    expect(pump.source).toBe('r17');
    expect(l.run!.buttons.some((b) => /up to/.test(b.fullLabel ?? b.label)), 'no "up to" on a one-subroutine ICE').toBe(false);
    // AC3 / AC4: every button that comes from a card says which, from its own words; Gordian Blade
    // (code gates) has nothing to do on Ice Wall and no button pretends it does.
    expect(fromCards(l).length).toBe(2);
    expect(l.run!.buttons.filter((b) => !b.source).map((b) => b.label)).toEqual([expect.stringMatching(/^Let it fire/)]);
    // AC6 at this size.
    expectRunButtonsGood(l);
    for (const b of l.run!.buttons) expect(b.label, 'nothing shortened').toBe(b.fullLabel ?? b.label);
    await shot(page, '01-ice-wall-ram-gordian');
    // S-11-2 AC1: strong enough already (planner goal: Ice Wall strength <= 3)? else pump with real taps.
    for (let i = 0; i < 4 && !runButtonOf(l, /^Battering Ram: break/).lit; i++) {
      await tap(page, runButtonOf(l, /^Battering Ram: \+1 str/).box);
      l = await waitIdle(page);
    }
    const credits = (await getView(page)).players.runner.credits;
    const m = await measureTap(page, runButtonOf(l, 'Battering Ram: break barrier sub · 2 credits').box);
    expect(m.stateAt - m.handledAt, 'break answered < 100 ms').toBeLessThan(100);
    expect(m.events.filter((e) => e.type === 'subroutine_broken')).toHaveLength(1);
    expect(m.view.players.runner.credits).toBe(credits - 2);
    l = await waitIdle(page);
    expect(l.run!.buttons.some((b) => b.role === 'toggle' || b.role === 'confirm' || b.role === 'back'), 'no pick step').toBe(false);
    expect(l.run!.subroutines.map((s) => s.broken)).toEqual([true]);
    expect(plan.info.iceUid).toBe(l.run!.iceUid);
    await shot(page, '02-ice-wall-broken-no-pick');
  });

  test('Heimdall 1.0 with Battering Ram: "break up to 2 barrier subs"; pick hint "Pick up to 2" matches the offered picks; one left: plain button', async ({ page }) => {
    test.setTimeout(60_000);
    await openBoard(page, { seed: 1, decks: 'core' });
    await toStep(page, 1, 'heimdall_ram_encounter');
    let l = await waitIdle(page);
    expect(l.run!.stepLabel).toBe('Encounter: Heimdall 1.0');
    const multi = () => l.run!.buttons.find((b) => b.role === 'multi');
    expect(multi()).toMatchObject({ fullLabel: 'Battering Ram: break up to 2 barrier subs · 2 credits', source: 'r17' });
    expectRunButtonsGood(l);
    await shot(page, '03-heimdall-ram-up-to-2');
    for (let i = 0; i < 6 && !multi()!.lit; i++) {
      await tap(page, runButtonOf(l, /^Battering Ram: \+1 str/).box);
      l = await waitIdle(page);
    }
    expect(multi()!.lit, 'Ram strong enough (enough credits in this plan)').toBe(true);
    await tap(page, multi()!.box);
    l = await waitIdle(page);
    // AC4: what the words say vs what the engine offers.
    const offered = (await getView(page)).run!.options.flatMap((o) => (o.action.type === 'use_ability' && o.action.uid !== undefined && o.action.subs ? [o.action.subs] : []));
    const most = Math.max(...offered.map((s) => s.length));
    const confirm = () => l.run!.buttons.find((b) => b.role === 'confirm')!;
    expect(confirm().label).toBe(`Pick up to ${most}`);
    expect(most).toBe(2);
    expect(confirm().lit).toBe(false);
    const toggles = () => l.run!.buttons.filter((b) => b.role === 'toggle');
    expect(toggles().map((t) => t.sub)).toEqual([0, 1, 2]);
    expectRunButtonsGood(l);
    await shot(page, '04-heimdall-pick-up-to-2');
    // Pick 1: "Break 1 · 2 credits" (an offered single), lit.
    await tap(page, toggles()[1]!.box);
    l = await waitIdle(page);
    expect(confirm()).toMatchObject({ label: 'Break 1 · 2 credits', lit: true });
    // Pick all three in turn: never more than `most` picked, and the confirm stays an offered option.
    await tap(page, toggles()[0]!.box);
    l = await waitIdle(page);
    await tap(page, toggles()[2]!.box);
    l = await waitIdle(page);
    const picked = toggles().filter((t) => t.picked).map((t) => t.sub!);
    expect(picked.length).toBe(most);
    expect(offered.some((s) => JSON.stringify(s) === JSON.stringify([...picked].sort()))).toBe(true);
    expect(confirm()).toMatchObject({ label: 'Break 2 · 2 credits', lit: true });
    const c0 = (await getView(page)).players.runner.credits;
    const m = await measureTap(page, confirm().box);
    expect(m.events.filter((e) => e.type === 'subroutine_broken').map((e) => (e as { sub: number }).sub).sort()).toEqual([...picked].sort());
    expect(m.view.players.runner.credits).toBe(c0 - 2);
    l = await waitIdle(page);
    // S-11-2 AC3: one unbroken subroutine left: a plain button (no pick, no "up to").
    const last = runButtonOf(l, /^Battering Ram: break/);
    expect(last.role).toBeUndefined();
    expect(last.fullLabel).toBe('Battering Ram: break barrier sub · 2 credits');
    // The plain button carries the engine's one offered option for the last open subroutine.
    const open = l.run!.subroutines.map((x, i) => (x.broken ? -1 : i)).filter((i) => i >= 0);
    expect(open).toHaveLength(1);
    expect(last.action).toMatchObject({ type: 'use_ability', subs: open });
    expect(l.run!.buttons.some((b) => b.role === 'toggle' || b.role === 'confirm')).toBe(false);
    expectRunButtonsGood(l);
    await shot(page, '05-heimdall-one-left-plain');
    if (last.lit) {
      const m2 = await measureTap(page, last.box);
      expect(m2.events.filter((e) => e.type === 'subroutine_broken')).toHaveLength(1);
      l = await waitIdle(page);
      expect(l.run?.buttons.some((b) => b.role === 'toggle') ?? false).toBe(false);
    } else {
      test.info().annotations.push({ type: 'note', description: `last break dim (${last.reject}); the 7-credit case is in s11-break` });
    }
  });
});

// ---- S-11-3 pass-the-phone -------------------------------------------------------------------------

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
}

function savedMoves(page: Page): Promise<number> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw === null ? -1 : (JSON.parse(raw) as { actions: unknown[] }).actions.length;
  }, KEY);
}

const continueHere = (page: Page) => page.locator('#start').getByRole('button', { name: /^Continue game/ });

/** Closes `page` and opens the start screen in a new tab of the same browser. */
async function reopen(page: Page): Promise<Page> {
  const context = page.context();
  await page.close();
  const next = await context.newPage();
  await next.goto('./');
  await ready(next);
  return next;
}

/** A pass-the-phone game (cover on) played to `goal` through the hook; returns once its save holds every move. */
async function savedAt(page: Page, seed: number, goal: StepGoal) {
  await page.goto(`./?seed=${seed}&play=here&decks=${goalDeckSet(goal)}`); // Sprint 12: always name the plan's decks
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
  const plan = await toStep(page, seed, goal);
  await expect.poll(() => savedMoves(page)).toBe(plan.actions.length);
  return plan;
}

/** Start-screen buttons and text inside the window, apart, buttons >= 44 px. */
async function expectStartFits(page: Page): Promise<void> {
  const vp = page.viewportSize()!;
  const boxes = await page.locator('#start :is(h1, h2, p, button)').evaluateAll((els) =>
    els
      .filter((e) => (e as HTMLElement).offsetParent !== null && (e.textContent ?? '').trim() !== '')
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { tag: e.tagName, text: (e.textContent ?? '').trim(), box: { x: r.x, y: r.y, width: r.width, height: r.height } };
      }),
  );
  const over = (a: Box, b: Box) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
  for (const b of boxes) {
    expect(b.box.x >= 0 && b.box.y >= 0 && b.box.x + b.box.width <= vp.width + 0.5 && b.box.y + b.box.height <= vp.height + 0.5, `"${b.text}" inside the window`).toBe(true);
    if (b.tag === 'BUTTON') expect(Math.min(b.box.width, b.box.height), `"${b.text}" thumb size`).toBeGreaterThanOrEqual(44);
  }
  for (let i = 0; i < boxes.length; i++) for (let k = i + 1; k < boxes.length; k++) expect(over(boxes[i]!.box, boxes[k]!.box), `"${boxes[i]!.text}" vs "${boxes[k]!.text}"`).toBe(false);
}

test.describe('QA S-11-3 pass-the-phone save', () => {
  test('real taps are saved; close the tab, open again: Continue game, cover to the seat that acts; the same board after the cover', async ({ page }) => {
    await page.goto('./');
    await ready(page);
    await expect(continueHere(page)).toHaveCount(0);
    await tapButton(page, /Play on this device/);
    await page.waitForFunction(() => !!window.__overclock);
    // The first cover (Corp) is lifted with a real tap; then the Corp clicks for credits twice with real taps.
    let l = await layout(page);
    if (l.cover) {
      await tap(page, l.cover.content);
      await page.waitForFunction(() => window.__overclock!.layout().cover === null);
    }
    l = await waitIdle(page);
    expect(l.viewer).toBe('corp');
    const c0 = (await getView(page)).players.corp.credits;
    for (let i = 0; i < 2; i++) {
      await tap(page, (await waitIdle(page)).corp.credits);
      await page.waitForFunction((n) => window.__overclock!.getView().players.corp.credits === n, c0 + i + 1);
    }
    await expect.poll(() => savedMoves(page), { message: 'the two real taps are saved' }).toBe(2);
    const before = await getView(page);
    const handBefore = (await waitIdle(page)).hand.map((h) => h.cardId);
    const next = await reopen(page);
    await expect(continueHere(next)).toBeVisible();
    await expect(continueHere(next)).toContainText("Corp's turn");
    await expectStartFits(next);
    await shot(next, '06-start-continue-game');
    await tapButton(next, /^Continue game/);
    await next.waitForFunction(() => !!window.__overclock);
    l = await layout(next);
    expect(l.cover?.to).toBe('corp');
    expect(l.cover!.box).toEqual({ x: 0, y: 0, width: l.viewport.width, height: l.viewport.height });
    await shot(next, '07-restored-cover-corp');
    await tap(next, l.cover!.content);
    await next.waitForFunction(() => window.__overclock!.layout().cover === null);
    l = await waitIdle(next);
    expect(l.viewer).toBe('corp');
    expect(await getView(next)).toEqual(before);
    expect(l.hand.map((h) => h.cardId)).toEqual(handBefore);
    expect(l.text.help ?? '').not.toMatch(/Runner's turn/);
    // Play goes on with a real tap, and the save follows.
    await tap(next, l.corp.credits);
    await next.waitForFunction((n) => window.__overclock!.getView().players.corp.credits === n, c0 + 3);
    await expect.poll(() => savedMoves(next)).toBe(3);
    await shot(next, '08-restored-board-corp');
  });

  test('hidden information: the restored cover looks exactly the same for two different games; after it, only the acting seat\'s hand', async ({ page }) => {
    test.setTimeout(60_000);
    const covers: Buffer[] = [];
    // Two different games, both mid-run where the Corp must decide (rez): the cover must go to the Corp.
    for (const seed of [1, 5]) {
      const plan = await savedAt(page, seed, 'corp_rez_prompt');
      expect(plan.activePlayer).toBe('runner');
      const v = await page.evaluate(() => window.__overclock!.decision());
      expect(v?.seat).toBe('corp');
      page = await reopen(page);
      await expect(continueHere(page)).toContainText("Runner's turn");
      await tapButton(page, /^Continue game/);
      await page.waitForFunction(() => !!window.__overclock && window.__overclock.layout().cover !== null);
      const l = await layout(page);
      expect(l.cover!.to, 'the Corp must act, so the cover is for the Corp').toBe('corp');
      await page.waitForTimeout(300);
      covers.push(await page.screenshot());
      if (seed === 1) await shot(page, '09-restored-cover-to-corp-mid-run');
      await tap(page, l.cover!.content);
      await page.waitForFunction(() => window.__overclock!.layout().cover === null);
      // As in live play (Sprint 6 cover rules): the Corp's decision in the Runner's run is shown on a
      // board with no hand drawn at all (neither the Runner's nor the Corp's), only Rez / Don't rez.
      const after = await waitIdle(page);
      expect(after.hand, 'no hand is drawn while the Corp decides').toEqual([]);
      expect(after.run?.buttons.map((b) => b.label)).toEqual([expect.stringMatching(/^Rez /), "Don't rez"]);
      expect(after.handView ?? null).toBeNull();
      page = await reopen(page);
    }
    expect(covers[0]!.equals(covers[1]!), 'the cover shows nothing that depends on the game').toBe(true);
  });

  test('a game finished (game-over box showing): no save is kept, and the start screen opened later shows no Continue', async ({ page }) => {
    await savedAt(page, 1, 'corp_one_score_from_win');
    let l = await layout(page);
    if (l.cover) {
      await tap(page, l.cover.content);
      await page.waitForFunction(() => window.__overclock!.layout().cover === null);
    }
    const score = (await getView(page)).legalActions.find((a) => a.type === 'score');
    expect(score).toBeDefined();
    await dispatch(page, score!);
    await page.waitForFunction(() => window.__overclock!.layout().gameOver !== null);
    l = await waitIdle(page);
    expect(l.gameOver).toMatchObject({ title: 'Corp wins', button: 'New game' });
    await expect.poll(() => savedMoves(page)).toBe(-1);
    await shot(page, '15-game-over-hotseat');
    // The owner closes the app on the game-over box and opens it later: no Continue.
    const next = await reopen(page);
    await expect(continueHere(next)).toHaveCount(0);
    await expect(next.locator('#start').getByRole('button', { name: /Play on this device/ })).toBeVisible();
  });

  for (const how of ['newer rules version', 'a move the rules now refuse'] as const) {
    test(`outdated save (${how}): Continue shows the plain note; a new game is one tap away`, async ({ page }) => {
      await savedAt(page, 2, 'agenda_one_advance');
      await page.evaluate(
        ({ key, how, v }) => {
          const s = JSON.parse(window.localStorage.getItem(key)!) as { rulesVersion: number; actions: Record<string, unknown>[] };
          if (how === 'newer rules version') s.rulesVersion = v + 1;
          // A well-formed move that the rules refuse at that point (the Runner acting on turn 1).
          else s.actions.splice(1, 0, { type: 'gain_credit', player: 'runner' });
          window.localStorage.setItem(key, JSON.stringify(s));
        },
        { key: KEY, how, v: RULES_VERSION },
      );
      const next = await reopen(page);
      await expect(continueHere(next)).toBeVisible();
      await tapButton(next, /^Continue game/);
      await expect(next.locator('#start .error')).toHaveText("That saved game can't continue on this new version of the game. Start a new game.");
      expect(await next.evaluate(() => typeof window.__overclock)).toBe('undefined');
      await expect(continueHere(next)).toHaveCount(0);
      await expectStartFits(next);
      if (how === 'newer rules version') await shot(next, '10-outdated-note');
      await tapButton(next, /Play on this device/);
      await next.waitForFunction(() => !!window.__overclock);
      expect((await getView(next)).turn).toBe(1);
    });
  }

  test('a broken save (cut-off text): no Continue, nothing breaks, Play on this device works', async ({ page }) => {
    await page.goto('./');
    await ready(page);
    await page.evaluate((key) => window.localStorage.setItem(key, '{"format":1,"rulesVersion":4,"seed":3,"opt'), KEY);
    await page.reload();
    await ready(page);
    await expect(continueHere(page)).toHaveCount(0);
    await tapButton(page, /Play on this device/);
    await page.waitForFunction(() => !!window.__overclock);
    expect((await getView(page)).turn).toBe(1);
  });

  test('a pass-the-phone save and an online seat on one device: both Continue rows show and fit', async ({ page }) => {
    await savedAt(page, 2, 'agenda_one_advance');
    await page.evaluate(
      ({ key, v, server }) => window.localStorage.setItem(key, JSON.stringify({ server, code: 'K7QF', seat: 'runner', token: 'x'.repeat(32), rulesVersion: v, savedAt: Date.now() })),
      { key: STORAGE_KEY, v: RULES_VERSION, server: SERVER_URL },
    );
    const next = await reopen(page);
    const rows = next.locator('#start').getByRole('button', { name: /^Continue game/ });
    await expect(rows).toHaveCount(2);
    await expect(next.locator('#start').getByRole('button', { name: /^Continue game · K7QF/ })).toBeVisible();
    await expectStartFits(next);
    await shot(next, '11-start-two-continue-rows');
  });
});

// ---- S-11-3 online -----------------------------------------------------------------------------------

test.describe('QA S-11-3 online Leave for now', () => {
  test('the Corp leaves for now with its rez decision open: the Runner reads it; Continue game · CODE brings the decision back; Rez with a real tap', async ({ browser }) => {
    test.skip(test.info().project.name === 'phone-short', 'online runs on the 3 main sizes (as s10/s11-online)');
    test.setTimeout(90_000);
    const options = { rezWindow: 'always', deckSet: 'starter' } as const;
    const plan = planToStep(1, 'corp_rez_prompt', 1500, options);
    // Prelude: everything but the Runner's run; the Runner starts it on the board so both phones see it.
    const runAt = plan.actions.map((a) => a.type).lastIndexOf('run');
    expect(runAt).toBeGreaterThan(0);
    const prelude = plan.actions.slice(0, runAt) as Action[];
    const runAction = plan.actions[runAt]!;
    const corp = await openPhone(browser);
    const runner = await openPhone(browser);
    const code = await startTestGame(corp, 'corp', { seed: 1, actions: prelude, deckSet: 'starter' });
    await joinGame(runner, code);
    await Promise.all([waitPlaying(corp), waitPlaying(runner)]);
    await runner.page.waitForFunction(() => !window.__overclock!.online()!.busy && window.__overclock!.online()!.connection === 'open');
    await runner.page.evaluate((a) => window.__overclock!.dispatch(a), runAction);
    // Follow the plan to the Corp's rez prompt (any moves after the run start).
    for (const a of plan.actions.slice(runAt + 1)) {
      const p = a.player === 'corp' ? corp : runner;
      await p.page.waitForFunction(() => !window.__overclock!.online()!.busy && window.__overclock!.online()!.connection === 'open');
      await p.page.evaluate((x) => window.__overclock!.dispatch(x), a);
    }
    const corpBefore = await waitView(corp, (v) => v.run?.step === 'approach' && v.run.waitingOn === 'corp');
    const runnerBefore = await waitView(runner, (v) => v.run?.step === 'approach');
    // Leave for now with real taps; the tap is answered at once, the start screen comes within 1.5 s.
    expect(await corp.page.evaluate(() => window.__overclock!.back())).toBe('ask_leave');
    const d = (await layoutOf(corp)).dialog!;
    expect(d.text).toBe('The game is saved. Continue it from the start screen.');
    const leave = d.buttons.find((b) => b.label === 'Leave for now')!;
    // In the page: when the tap was handled and when the dialog had closed with "Saving…" on the board
    // (kept in sessionStorage: the page then goes to the start screen).
    await corp.page.evaluate(() => {
      const hook = window.__overclock!;
      const loop = () => {
        const l = hook.layout();
        const input = hook.lastInput();
        if (input && l.dialog === null && l.status?.text === 'Saving…') {
          sessionStorage.setItem('qa-leave', JSON.stringify({ handledAt: input.handledAt, shownAt: performance.now(), wall: Date.now() }));
        } else requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    const t0 = Date.now();
    await tap(corp.page, leave.box);
    await corp.page.waitForFunction(() => window.__overclockStart?.screen() === 'home');
    const took = Date.now() - t0;
    const rec = JSON.parse((await corp.page.evaluate(() => sessionStorage.getItem('qa-leave'))) ?? 'null') as { handledAt: number; shownAt: number; wall: number } | null;
    expect(rec, 'the dialog closed and "Saving…" showed before the start screen').not.toBeNull();
    expect(rec!.shownAt - rec!.handledAt, 'Leave for now answered < 100 ms').toBeLessThan(100);
    expect(took, 'start screen within the 1.5 s cap (+ test overhead)').toBeLessThan(2500);
    test.info().annotations.push({ type: 'leave-ms', description: JSON.stringify({ answerMs: rec!.shownAt - rec!.handledAt, toStartMs: took }) });
    await runner.page.waitForFunction(() => window.__overclock!.layout().status?.text === 'The Corp left for now. The game is saved');
    await shot(runner.page, '12-online-runner-reads-corp-left');
    const cont = corp.page.locator('#start').getByRole('button', { name: new RegExp(`^Continue game · ${code}`) });
    await expect(cont).toBeVisible();
    await expect(cont).toContainText('Online · you play the Corp');
    await expectStartFits(corp.page);
    await shot(corp.page, '13-online-corp-continue-code');
    // The Runner's taps while the Corp is away change nothing.
    expect(await view(runner)).toEqual(runnerBefore);
    // Back, without typing the code.
    expect(await corp.page.locator('#start input').count()).toBe(0);
    if (test.info().project.use.hasTouch) await cont.tap();
    else await cont.click();
    await waitPlaying(corp);
    const back = await waitView(corp, (v) => v.run?.step === 'approach');
    expect(back).toEqual(corpBefore);
    expect(back.players.runner.hand, 'no Runner cards on the Corp phone').toBeNull();
    expect(back.run?.waitingOn).toBe('corp');
    await runner.page.waitForFunction(() => window.__overclock!.layout().status === null || !/left for now/.test(window.__overclock!.layout().status!.text));
    await corp.page.waitForFunction(() => !window.__overclock!.layout().animating);
    const cl = await layoutOf(corp);
    const rez = runButtonOf(cl, /^Rez /);
    await tap(corp.page, rez.box);
    await waitView(runner, (v) => v.run?.step !== 'approach');
    const rv = await view(runner);
    expect(rv.run?.ice?.cardId ?? null, 'the Runner sees the rezzed ICE').not.toBeNull();
    await corp.context.close();
    await runner.context.close();
  });
});

// ---- S-11-4 ----------------------------------------------------------------------------------------

const CARDS = [...new Set([CORP_CORE_DECK.identity, ...CORP_CORE_DECK.cards, RUNNER_CORE_DECK.identity, ...RUNNER_CORE_DECK.cards, ...CORP_STARTER_DECK, ...RUNNER_STARTER_DECK])].filter((id) => getCard(id));

function stats(id: string): { label: RegExp; value: number }[] {
  const c = getCard(id)!;
  const out: { label: RegExp; value: number }[] = [];
  if (c.strength !== undefined) out.push({ label: /^(Strength|Str)$/, value: c.strength });
  if (c.memory !== undefined) out.push({ label: /^(Memory|MU)$/, value: c.memory });
  if (c.advancementRequirement !== undefined) out.push({ label: /^(Advance|Adv)$/, value: c.advancementRequirement });
  if (c.agendaPoints !== undefined) out.push({ label: /^(Points|Pts)$/, value: c.agendaPoints });
  if (c.trashCost !== undefined) out.push({ label: /^Trash$/, value: c.trashCost });
  return out;
}

test.describe('QA S-11-4 card numbers', () => {
  test('every card of both decks, full face from 120 px up to the zoom size: each label shows with its number, inside the card, apart', async ({ page }) => {
    test.setTimeout(90_000);
    await openBoard(page, { seed: 1, decks: 'core' });
    expect(CARDS.length).toBeGreaterThan(30);
    const zoom = await page.evaluate((id) => window.__overclock!.fullFace(id), CARDS[0]!);
    const zw = zoom!.width;
    const widths = [...new Set([120, 140, 170, 210, Math.round(zw)].filter((w) => w <= zw))];
    let checked = 0;
    for (const w of widths) {
      const h = Math.round(w * (zoom!.height / zoom!.width));
      const faces = await page.evaluate(([ids, fw, fh]) => (ids as string[]).map((id) => window.__overclock!.fullFace(id, fw as number, fh as number)), [CARDS, w, h] as const);
      faces.forEach((f, i) => {
        const id = CARDS[i]!;
        const want = stats(id);
        const name = `${getCard(id)!.name} @${w}px`;
        expect(f, name).not.toBeNull();
        expect(f!.stats.length, `${name}: every stat`).toBe(want.length);
        f!.stats.forEach((s, k) => {
          const mm = /^(.+) (\d+)$/.exec(s.text);
          expect(mm, `${name}: "${s.text}" is a label and a number`).not.toBeNull();
          expect(mm![1], `${name}: "${s.text}" label`).toMatch(want[k]!.label);
          expect(Number(mm![2]), `${name}: "${s.text}" number`).toBe(want[k]!.value);
          // At the zoom size the full words show (owner: "Strength 4", not "Str 4").
          if (w === Math.round(zw)) expect(mm![1]!.length, `${name}: full label at zoom size`).toBeGreaterThan(3);
          expect(s.box.x >= -f!.width / 2 && s.box.x + s.box.width <= f!.width / 2 - 1, `${name}: "${s.text}" inside left/right`).toBe(true);
          expect(s.box.y >= -f!.height / 2 && s.box.y + s.box.height <= f!.height / 2, `${name}: "${s.text}" inside top/bottom`).toBe(true);
          expect(s.fontPx, `${name}: "${s.text}" size`).toBeGreaterThanOrEqual(8);
          checked++;
        });
        for (let a = 0; a < f!.stats.length; a++) for (let b = a + 1; b < f!.stats.length; b++) expect(overlaps(f!.stats[a]!.box, f!.stats[b]!.box), `${name}: stats apart`).toBe(false);
      });
    }
    expect(checked).toBeGreaterThan(100);
    test.info().annotations.push({ type: 'stats-checked', description: `${checked} stats at widths ${widths.join(', ')}` });
  });

  test('screens: real long-press zoom of Wall of Static / Corroder style cards at this size', async ({ page }) => {
    await openBoard(page, { seed: 1, decks: 'core' });
    await toStep(page, 1, 'heimdall_corroder_encounter');
    const l = await waitIdle(page);
    const corroder = l.rig.find((c) => c.cardId === 'r04');
    expect(corroder, 'Corroder installed').toBeDefined();
    const release = await pressAndHold(page, corroder!.box);
    await page.waitForFunction(() => window.__overclock!.layout().zoom?.cardId === 'r04' && !window.__overclock!.layout().animating);
    const z = (await layout(page)).zoom!;
    expect(z.stats.map((s) => s.text)).toEqual(['Strength 2', 'Memory 1']);
    expect(z.textOverflow).toBe(false);
    await shot(page, '14-zoom-corroder-stats');
    await release();
  });
});

