// Sprint 12 online (U5): two phones against the local service (test mode).
// - S-12-1: Accelerated Beta Test scored online: only the Corp's phone shows the 3 cards (the
//   Runner's phone never receives their ids); the installed ICE and the face-down trash show on both.
// - S-12-4: Infiltration's expose: both phones show the exposed card; nothing else is revealed
//   (the Runner's view of the Corp's cards is unchanged, the card stays face down).
// - S-12-5: a new online game deals 45-card decks to both sides; a Sprint 11 online seat or
//   pass-the-phone save shows "That saved game can't continue on this new version of the game".
// Runs at the 3 main sizes (not phone-short: the online path is size-independent).
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORP_CORE45_DECK, RUNNER_CORE45_DECK } from '@overclock/cards';
import type { Action, Side } from '@overclock/engine';
import { type StepGoal, planToStep } from '@overclock/match/testing';
import { STORAGE_KEY } from '@overclock/protocol';
import { type Browser, type Page, expect, test } from '@playwright/test';
import { pickHand, tap } from './helpers';
import { type Phone, act, frames, joinGame, layoutOf, openPhone, startGame, startTestGame, tapButton, view, waitPlaying, waitView } from './online';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-12-screens');
const OUTDATED = "That saved game can't continue on this new version of the game. Start a new game.";
const OPTS = { rezWindow: 'always', deckSet: 'core45' } as const;

async function shot(page: Page, name: string): Promise<void> {
  const save = test.info().project.name === 'phone-small';
  if (save) mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot(save ? { path: join(SHOTS, `${name}-640x360.png`) } : {});
  await test.info().attach(name, { body, contentType: 'image/png' });
}

async function twoPhones(browser: Browser, seed: number, goal: StepGoal, hostSide: Side) {
  const plan = planToStep(seed, goal, undefined, OPTS);
  const host = await openPhone(browser);
  const guest = await openPhone(browser);
  const code = await startTestGame(host, hostSide, { seed, actions: [...plan.actions], deckSet: 'core45' });
  await joinGame(guest, code);
  await Promise.all([waitPlaying(host), waitPlaying(guest)]);
  const corp = hostSide === 'corp' ? host : guest;
  const runner = hostSide === 'corp' ? guest : host;
  return { plan, corp, runner, close: async () => Promise.all([host.context.close(), guest.context.close()]) };
}

/** Every frame the phone received, as text, from index `from` on. */
function textSince(p: Phone, from: number): string {
  return p.received.slice(from).join('\n');
}

test.describe('S-12-1 online: Accelerated Beta Test', () => {
  test('only the Corp\'s phone shows the 3 cards; the Runner gets counts only, then sees the installed ICE and 2 face-down cards in Archives', async ({ browser }) => {
    const { plan, corp, runner, close } = await twoPhones(browser, 1, 'abt_scorable', 'corp');
    const mark = runner.received.length;
    await act(corp, { type: 'score', player: 'corp', uid: plan.info['uid']! } as Action);
    const cv = await waitView(corp, (v) => v.choice?.kind === 'look_install');
    const looked = cv.choice!.looked!;
    expect(looked).toHaveLength(3);
    expect(looked.every((id) => typeof id === 'string')).toBe(true);
    await corp.page.waitForFunction(() => window.__overclock!.layout().sheet?.kind === 'look');
    expect((await layoutOf(corp)).sheet!.cards.map((c) => c.cardId)).toEqual(looked);

    // The Runner's phone: the choice with 3 nulls, no sheet, "Corp looks at the top 3 cards of R&D".
    const rv = await waitView(runner, (v) => v.choice?.kind === 'look_install');
    expect(rv.choice!.looked).toEqual([null, null, null]);
    expect(rv.choice!.options).toEqual([]);
    const rl = await layoutOf(runner);
    expect(rl.sheet).toBeNull();
    await runner.page.waitForFunction(() => window.__overclock!.layout().text.help.includes('Corp looks at the top 3 cards of R&D') || (window.__overclock!.layout().hint?.text ?? '').includes('Corp looks at the top 3 cards of R&D'));
    await shot(runner.page, 's12-online-abt-runner');
    await shot(corp.page, 's12-online-abt-corp');

    // Corp installs the ICE (in a new server), then Done.
    const sel = cv.choice!.options.find((o) => o.action.type === 'select' && o.action.server === 'new')!;
    const iceId = looked[(sel.action as { card: number }).card]!;
    await act(corp, sel.action);
    await waitView(corp, (v) => v.choice?.looked?.length === 2);
    const rest = (await view(corp)).choice!.looked!;
    await act(corp, { type: 'pass', player: 'corp' });
    await waitView(corp, (v) => v.choice === null);
    const after = await waitView(runner, (v) => v.choice === null);
    // The installed ICE is face up (rezzed): public. The 2 trashed cards are face down to the Runner.
    expect(after.corpServers.flatMap((s) => s.ice).some((c) => c.cardId === iceId && c.faceUp)).toBe(true);
    expect(after.players.corp.discard.slice(-2)).toEqual([null, null]);
    // Nothing the Runner's phone received carried the looked-at ids (only counts).
    const got = frames(runner.received.slice(mark));
    const events = got.flatMap((f) => f.events ?? []);
    expect(events.find((e) => e.type === 'cards_looked_at')).toEqual({ type: 'cards_looked_at', count: 3 });
    expect(events.find((e) => e.type === 'rd_cards_trashed')).toEqual({ type: 'rd_cards_trashed', count: 2 });
    const raw = textSince(runner, mark);
    expect(raw).not.toContain('cardIds');
    const publicIds = new Set([...after.corpServers.flatMap((s) => [...s.ice, ...s.content].map((c) => c.cardId)), ...after.players.corp.discard, ...after.players.corp.scored]);
    for (const id of rest) if (!publicIds.has(id)) expect(raw, `the Runner never got ${id}`).not.toContain(`"${id}"`);
    await close();
  });
});

test.describe('S-12-4 online: Infiltration expose', () => {
  test('both phones show the exposed card; it stays face down and nothing else is revealed', async ({ browser }) => {
    const { plan, corp, runner, close } = await twoPhones(browser, 1, 'infiltration_ready', 'runner');
    const uid = plan.info['uid']!;
    const before = await view(runner);
    const corpBefore = await view(corp);
    // Real taps on the Runner's phone: Infiltration, Expose 1 card, the lit card.
    const hand = Number(plan.info['handIndex']);
    let l = await layoutOf(runner);
    // S-15-6: held up, Infiltration lights every card it can expose at once.
    await pickHand(runner.page, hand);
    await runner.page.waitForFunction(() => window.__overclock!.layout().targets.some((t) => t.kind === 'expose'));
    l = await layoutOf(runner);
    await tap(runner.page, l.targets.find((t) => t.kind === 'expose' && t.uid === uid)!.box);
    for (const p of [runner, corp]) await p.page.waitForFunction((u) => window.__overclock!.layout().exposed?.uid === u, uid);
    for (const p of [runner, corp]) expect((await layoutOf(p)).exposed).toMatchObject({ uid, cardId: plan.info['cardId'] });
    await shot(corp.page, 's12-online-exposed-corp');
    await shot(runner.page, 's12-online-exposed-runner');
    // Nothing else changed on the Corp's side; the card is still face down to the Runner.
    const after = await view(runner);
    expect(after.corpServers).toEqual(before.corpServers);
    expect(after.players.corp).toEqual(before.players.corp);
    const corpAfter = await view(corp);
    expect(corpAfter.corpServers).toEqual(corpBefore.corpServers);
    // Each phone taps it away by itself.
    await tap(runner.page, (await layoutOf(runner)).exposed!.box);
    await runner.page.waitForFunction(() => window.__overclock!.layout().exposed === null);
    expect((await layoutOf(corp)).exposed).not.toBeNull();
    await tap(corp.page, (await layoutOf(corp)).exposed!.box);
    await corp.page.waitForFunction(() => window.__overclock!.layout().exposed === null);
    await close();
  });
});

test.describe('S-12-5 45-card decks and Sprint 11 saves', () => {
  test('a new online game (real taps) deals 45-card decks to both sides', async ({ browser }) => {
    expect(CORP_CORE45_DECK.cards).toHaveLength(45);
    expect(RUNNER_CORE45_DECK.cards).toHaveLength(45);
    const corp = await openPhone(browser);
    const runner = await openPhone(browser);
    const code = await startGame(corp, 'corp');
    await joinGame(runner, code);
    await Promise.all([waitPlaying(corp), waitPlaying(runner)]);
    for (const p of [corp, runner]) {
      const v = await view(p);
      expect(v.players.corp.identity?.cardId).toBe(CORP_CORE45_DECK.identity);
      expect(v.players.runner.identity?.cardId).toBe(RUNNER_CORE45_DECK.identity);
      // Nothing has been played yet: every card is in the deck or the hand.
      for (const s of ['corp', 'runner'] as const) expect(v.players[s].deckCount + v.players[s].handCount, `${s} deck`).toBe(45);
      // The deck badges show it.
      const l = await layoutOf(p);
      expect(l.corp.deck.width).toBeGreaterThan(0);
    }
    const cl = await layoutOf(corp);
    const cv = await view(corp);
    expect(cl.text.corpHand).toContain(`${cv.players.corp.handCount} cards`);
    await corp.context.close();
    await runner.context.close();
  });

  test('a Sprint 11 pass-the-phone save (rules version 4): Continue shows the plain note', async ({ browser }) => {
    const phone = await openPhone(browser);
    // A save as Sprint 11 wrote it: its own rules version (4) and the 30-card decks.
    const save = { format: 1, rulesVersion: 4, seed: 1117, options: { rezWindow: 'affordable', deckSet: 'core' }, actions: [{ type: 'gain_credit', player: 'corp' }] };
    await phone.page.evaluate((s) => window.localStorage.setItem('overclock.hotseat.v1', JSON.stringify(s)), save);
    await phone.page.reload();
    await phone.page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
    await tapButton(phone.page, /^Continue game/);
    await expect(phone.page.locator('#start .error')).toHaveText(OUTDATED);
    expect(await phone.page.evaluate(() => window.localStorage.getItem('overclock.hotseat.v1'))).toBeNull();
    await phone.context.close();
  });

  test('a Sprint 11 online seat (rules version 4): Continue shows the plain note', async ({ browser }) => {
    const corp = await openPhone(browser);
    const runner = await openPhone(browser);
    const code = await startGame(corp, 'corp');
    await joinGame(runner, code);
    await Promise.all([waitPlaying(corp), waitPlaying(runner)]);
    const seat = await runner.page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY);
    expect(seat).not.toBeNull();
    // The seat as a Sprint 11 phone stored it, then the phone opens the app again.
    const next = await openPhone(browser);
    await next.page.evaluate(([k, s]) => window.localStorage.setItem(k as string, JSON.stringify({ ...(JSON.parse(s as string) as object), rulesVersion: 4 })), [STORAGE_KEY, seat] as const);
    await next.page.reload();
    await next.page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
    await tapButton(next.page, /^Continue game/);
    await expect(next.page.locator('#start .error')).toHaveText(OUTDATED);
    expect(await next.page.evaluate(() => typeof window.__overclock)).toBe('undefined');
    await shot(next.page, 's12-5-sprint11-seat-note');
    for (const p of [corp, runner, next]) await p.context.close();
  });
});
