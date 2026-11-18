// QA Sprint 12 (written by QA, not the developers): S-12-1..S-12-6 played with real taps on the
// 45-card decks, on QA's own seeds (201-204; the developers' specs use 1-3), at all 4 sizes.
// Screenshots go to docs/sprints/sprint-12-qa/ only when QA_SCREENS=1 (QA's local run), so CI
// never rewrites them. Online tests are skipped at 891x296 (the online path is size-independent).
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORP_CORE45_DECK, RUNNER_CORE45_DECK, getCard } from '@overclock/cards';
import type { Action, PlayerView } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';
import { planToStep } from '@overclock/match/testing';
import { type Page, expect, test } from '@playwright/test';
import type { InstalledSnapshot, LayoutSnapshot } from '../src/hook-types';
import { getView, inside, layout, measureTap, openBoard, openHand, passTurn, pickHand, safeRect, tap, targetOf, toStep, waitIdle } from './helpers';
import { act, frames, joinGame, layoutOf, openPhone, startGame, startTestGame, tapButton, view, waitPlaying, waitView } from './online';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-12-qa');
const SIZE: Record<string, string> = { phone: '844x390', 'phone-small': '640x360', desktop: '1280x800', 'phone-short': '891x296' };
const KEY = 'overclock.hotseat.v1';
const OUTDATED = "That saved game can't continue on this new version of the game. Start a new game.";

async function shot(page: Page, name: string): Promise<void> {
  const p = test.info().project.name;
  if (process.env.QA_SCREENS === '1') mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot(process.env.QA_SCREENS === '1' ? { path: join(SHOTS, `${SIZE[p] ?? p}-${name}.png`) } : {});
  await test.info().attach(name, { body, contentType: 'image/png' });
}

function installedIn(l: LayoutSnapshot, uid: string): InstalledSnapshot {
  const c = [...l.servers.flatMap((s) => [...s.ice, ...s.content]), ...l.rig].find((x) => x.uid === uid);
  if (!c) throw new Error(`no installed card ${uid}`);
  return c;
}

/** A real tap that changes the game: state within 100 ms of the tap being handled, no blocking animation > 600 ms. */
async function snappyTap(page: Page, box: LayoutSnapshot['targets'][number]['box']) {
  const m = await measureTap(page, box);
  expect(Number.isFinite(m.handledAt), 'the tap reached a game target').toBe(true);
  expect(m.stateAt - m.handledAt, 'state within 100 ms').toBeLessThan(100);
  for (const a of m.anims) if (!['hint', 'notice', 'ice_report'].includes(a.kind)) expect(a.scheduledMs, `${a.kind} <= 600 ms`).toBeLessThanOrEqual(600);
  return m;
}

function thumb(l: LayoutSnapshot, b: { x: number; y: number; width: number; height: number }, what: string): void {
  expect(Math.min(b.width, b.height), `${what} >= 44 px`).toBeGreaterThanOrEqual(44);
  expect(inside(b, safeRect(l)), `${what} on screen`).toBe(true);
}

/** Card ids the Runner may know: everything face up on his screen. */
function publicIds(v: PlayerView): Set<string | null> {
  return new Set([
    ...v.corpServers.flatMap((s) => [...s.ice, ...s.content].map((c) => c.cardId)),
    ...v.players.corp.discard,
    ...v.players.corp.scored,
    ...v.players.runner.scored,
    v.players.corp.identity?.cardId ?? null, // identities are public
    v.players.runner.identity?.cardId ?? null,
  ]);
}

test.describe('QA S-12-1 Accelerated Beta Test (real taps, 45-card decks)', () => {
  test('seed 201, 2 ICE among 3: tap ICE, tap R&D; tap the other ICE, tap New server; "Trash 1 card"; Runner sees backs and counts only', async ({ page }) => {
    const seed = 201;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'abt_scorable');
    expect(plan.info['ice']).toBe('2');
    const truth = new LocalMatch(seed, { deckSet: 'core45' });
    for (const a of plan.actions) truth.submit(a.player, a);
    const top3 = truth.snapshot().players.corp.deck.slice(0, 3);
    const before = await getView(page);

    // Tap the agenda, then Score (real taps).
    let l = await waitIdle(page);
    await tap(page, l.servers.flatMap((s) => s.content).find((c) => c.uid === plan.info['uid'])!.box);
    await page.waitForFunction((u) => window.__overclock!.layout().selectedInstalled === u, plan.info['uid']);
    l = await layout(page);
    await snappyTap(page, targetOf(l, 'score').box);
    await page.waitForFunction(() => window.__overclock!.layout().sheet?.kind === 'look');
    l = await waitIdle(page);
    let v = await getView(page);
    expect(v.players.corp.points).toBe(before.players.corp.points + 2);
    expect(l.sheet!.cards.map((c) => c.cardId), 'the sheet shows the real top 3 of R&D').toEqual(top3);
    const iceIdx = top3.map((id, i) => (getCard(id)!.type === 'ice' ? i : -1)).filter((i) => i >= 0);
    expect(l.sheet!.cards.filter((c) => c.lit).map((c) => c.index)).toEqual(iceIdx);
    expect(targetOf(l, 'look_done')).toMatchObject({ label: 'Trash the rest (3)', lit: true });
    for (const c of l.sheet!.cards) thumb(l, c.box, `look card ${c.cardId}`);
    thumb(l, targetOf(l, 'look_done').box, 'Trash the rest');
    await shot(page, '01-abt-look-at-3');

    // First ICE -> R&D (or the first offered server).
    const credits0 = v.players.corp.credits;
    const clicks0 = v.players.corp.clicks;
    const installedAt: string[] = [];
    for (const [k, wantServer] of [[0, 'rd'], [1, 'new']] as const) {
      l = await layout(page);
      const ice = l.sheet!.cards.find((c) => c.lit)!;
      await tap(page, ice.box);
      await page.waitForFunction(() => window.__overclock!.layout().sheet?.cards.some((c) => c.picked) === true);
      l = await layout(page);
      const lit = l.targets.filter((t) => t.kind === 'look_install');
      expect(lit.length).toBeGreaterThan(0);
      for (const t of lit) {
        expect(t).toMatchObject({ label: 'Install · free', lit: true });
        thumb(l, t.box, `server ${t.server}`);
      }
      if (k === 0) await shot(page, '02-abt-servers-lit');
      const target = lit.find((t) => t.server === wantServer) ?? lit[0]!;
      const n = l.sheet!.cards.length;
      await snappyTap(page, target.box);
      await page.waitForFunction((len) => (window.__overclock!.getView().choice?.looked?.length ?? 0) === len - 1, n);
      l = await waitIdle(page);
      v = await getView(page);
      const placed = v.corpServers.flatMap((s) => s.ice.map((i) => ({ ...i, server: s.id }))).filter((i) => i.cardId === ice.cardId && i.faceUp);
      expect(placed.length, `${ice.cardId} installed face up`).toBeGreaterThan(0);
      installedAt.push(placed.at(-1)!.uid);
      expect(v.players.corp.clicks, 'no click').toBe(clicks0);
    }
    // Free: no credits paid (Haas-Bioroid gives +1 for the turn's first install, at most once).
    expect(v.players.corp.credits - credits0).toBeGreaterThanOrEqual(0);
    expect(v.players.corp.credits - credits0).toBeLessThanOrEqual(1);
    l = await layout(page);
    expect(targetOf(l, 'look_done')).toMatchObject({ label: 'Trash 1 card', lit: true });
    const rest = v.choice!.looked!;
    expect(rest).toEqual(top3.filter((_, i) => !iceIdx.includes(i)));
    await shot(page, '03-abt-two-ice-in');
    const archives = v.players.corp.discardCount;
    await snappyTap(page, targetOf(l, 'look_done').box);
    await page.waitForFunction(() => window.__overclock!.getView().choice === null);
    l = await waitIdle(page);
    v = await getView(page);
    expect(v.players.corp.discard.slice(archives)).toEqual(rest);
    expect(l.sheet).toBeNull();
    expect(l.hand.length, 'the hand is back').toBe(v.players.corp.handCount);
    await shot(page, '04-abt-done-corp');

    // The Runner: both new ICE face up; the trashed card face down; its name nowhere on his screen.
    await passTurn(page);
    l = await waitIdle(page);
    const rv = await getView(page);
    expect(rv.viewer).toBe('runner');
    for (const uid of installedAt) expect(rv.corpServers.flatMap((s) => s.ice).find((i) => i.uid === uid)?.faceUp).toBe(true);
    expect(rv.players.corp.discard.slice(archives, archives + rest.length)).toEqual(rest.map(() => null));
    const pub = publicIds(rv);
    for (const id of rest) if (!pub.has(id)) expect(l.labels.join('\n')).not.toContain(getCard(id!)!.name);
    await shot(page, '05-abt-runner-sees');
  });

  test('seed 202, no ICE among 3: the Corp sees the 3; one tap "Trash 3 cards"', async ({ page }) => {
    const seed = 202;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'abt_scorable_no_ice');
    let l = await waitIdle(page);
    await tap(page, l.servers.flatMap((s) => s.content).find((c) => c.uid === plan.info['uid'])!.box);
    await page.waitForFunction((u) => window.__overclock!.layout().selectedInstalled === u, plan.info['uid']);
    await tap(page, targetOf(await layout(page), 'score').box);
    await page.waitForFunction(() => window.__overclock!.layout().sheet?.kind === 'look');
    l = await waitIdle(page);
    const v = await getView(page);
    expect(l.sheet!.cards).toHaveLength(3);
    expect(l.sheet!.cards.every((c) => !c.lit)).toBe(true);
    for (const c of l.sheet!.cards) expect(getCard(c.cardId!)!.type).not.toBe('ice');
    expect(l.targets.map((t) => t.kind)).toEqual(['look_done']);
    expect(targetOf(l, 'look_done')).toMatchObject({ label: 'Trash 3 cards', lit: true });
    await shot(page, '06-abt-no-ice');
    await snappyTap(page, targetOf(l, 'look_done').box);
    await page.waitForFunction(() => window.__overclock!.getView().choice === null);
    expect((await getView(page)).players.corp.discard.slice(-3)).toEqual(v.choice!.looked);
  });
});

test.describe('QA S-12-2 Archived Memories and Experiential Data (real taps)', () => {
  test('seed 203: Archived Memories shows Archives (face-down cards too); tap the face-down one: it goes to HQ', async ({ page }) => {
    const seed = 203;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'archived_memories_ready');
    const before = await getView(page);
    let l = await pickHand(page, Number(plan.info['handIndex']));
    const play = targetOf(l, 'play');
    expect(play.lit).toBe(true);
    await snappyTap(page, play.box);
    await page.waitForFunction(() => window.__overclock!.layout().sheet?.kind === 'archives');
    l = await waitIdle(page);
    const v = await getView(page);
    expect(l.sheet!.cards.map((c) => c.cardId)).toEqual(v.players.corp.discard);
    for (const c of l.sheet!.cards) thumb(l, c.box, `archives card ${c.index}`);
    await shot(page, '07-archived-memories-sheet');
    const fd = Number(plan.info['faceDownIndex']);
    const pick = l.sheet!.cards.find((c) => c.index === fd)!;
    expect(pick.lit, 'the face-down card can be picked').toBe(true);
    await snappyTap(page, pick.box);
    await page.waitForFunction(() => window.__overclock!.getView().choice === null);
    const w = await getView(page);
    expect(w.players.corp.hand).toContain(pick.cardId);
    expect(w.players.corp.handCount).toBe(before.players.corp.handCount); // -1 Archived Memories, +1 card
    expect(w.players.corp.discardCount).toBe(v.players.corp.discardCount - 1);
    await shot(page, '08-archived-memories-taken');
  });

  test('seed 202, Archives empty: Archived Memories dimmed, "Archives is empty"; a tap plays nothing', async ({ page }) => {
    const seed = 202;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'archived_memories_empty');
    const before = await getView(page);
    const l = await pickHand(page, Number(plan.info['handIndex']));
    const play = targetOf(l, 'play');
    expect(play).toMatchObject({ lit: false, note: 'Archives is empty' });
    thumb(l, play.box, 'dimmed Play');
    await shot(page, '09-archived-memories-empty');
    await tap(page, play.box);
    await page.waitForFunction(() => window.__overclock!.layout().hint?.text === 'Archives is empty');
    const w = await getView(page);
    expect(w.players.corp.handCount).toBe(before.players.corp.handCount);
    expect(w.players.corp.clicks).toBe(before.players.corp.clicks);
  });

  test('seed 202: Experiential Data face up: Enigma shows Str 3 and the run says 3; Gordian dim until pumped; then breaks with real taps', async ({ page }) => {
    const seed = 202;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'experiential_data_encounter');
    let l = await waitIdle(page);
    let v = await getView(page);
    expect(installedIn(l, plan.info['edUid']!).faceUp).toBe(true);
    const ice = installedIn(l, plan.info['iceUid']!);
    expect(ice.strength?.text).toMatch(/^(Str )?3$/);
    expect(v.run!.ice!.strength).toBe(3);
    expect(l.run!.lines.join(' | ')).toContain('Strength 3');
    const gordian = l.run!.buttons.filter((b) => b.source === 'r05');
    const brk = gordian.filter((b) => /break/.test(b.fullLabel ?? b.label));
    expect(brk.length).toBeGreaterThan(0);
    for (const b of brk) expect(b).toMatchObject({ lit: false, reject: 'too_weak' });
    await shot(page, '10-experiential-data-str3');
    const pump = gordian.find((b) => /\+1 str/.test(b.fullLabel ?? b.label))!;
    expect(pump.lit).toBe(true);
    await snappyTap(page, pump.box);
    l = await waitIdle(page);
    const lit = l.run!.buttons.filter((b) => b.source === 'r05' && /break/.test(b.fullLabel ?? b.label) && b.lit);
    expect(lit.length, 'Gordian at 3 can break').toBeGreaterThan(0);
    const credits = (await getView(page)).players.runner.credits;
    await snappyTap(page, lit[0]!.box);
    l = await waitIdle(page);
    v = await getView(page);
    expect(v.players.runner.credits).toBe(credits - 1);
    expect(l.run!.subroutines.some((s) => s.broken)).toBe(true);
    await shot(page, '11-experiential-data-broken');
  });
});

test.describe('QA S-12-3 The Toolbox and Modded (real taps)', () => {
  test('seed 203: Modded lights Magnum Opus at "1 credit (−4)" (3 + Kate 1); a tap installs it, 1 click, 1 credit', async ({ page }) => {
    const seed = 203;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'modded_ready');
    expect(plan.info['cardId']).toBe('r15');
    const before = await getView(page);
    let l = await pickHand(page, Number(plan.info['handIndex']));
    const grip = l.targets.filter((t) => t.kind === 'grip');
    const opus = grip.find((t) => t.index === Number(plan.info['installIndex']))!;
    expect(opus).toMatchObject({ label: '1 credit (−4)', lit: true });
    expect(getCard('r15')!.cost).toBe(5);
    for (const t of grip) thumb(l, t.box, `grip ${t.index}`);
    await shot(page, '12-modded-grip-prices');
    await snappyTap(page, opus.box);
    await page.waitForFunction(() => window.__overclock!.getView().rig.some((c) => c.cardId === 'r15'));
    l = await waitIdle(page);
    const v = await getView(page);
    expect(v.players.runner.clicks).toBe(before.players.runner.clicks - 1);
    expect(v.players.runner.credits).toBe(before.players.runner.credits - 1);
    expect(v.memory.used).toBe(before.memory.used + getCard('r15')!.memory!);
    await shot(page, '13-modded-installed');
  });

  test('seed 202: Modded never goes below 0: Pipeline (3) is "free (−3)"', async ({ page }) => {
    const seed = 202;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'modded_ready');
    expect(plan.info['cardId']).toBe('r16');
    const before = await getView(page);
    const l = await pickHand(page, Number(plan.info['handIndex']));
    const t = l.targets.find((x) => x.kind === 'grip' && x.index === Number(plan.info['installIndex']))!;
    expect(t).toMatchObject({ label: 'free (−3)', lit: true });
    await snappyTap(page, t.box);
    await page.waitForFunction(() => window.__overclock!.getView().rig.some((c) => c.cardId === 'r16'));
    const v = await getView(page);
    expect(v.players.runner.credits).toBe(before.players.runner.credits);
    expect(v.players.runner.clicks).toBe(before.players.runner.clicks - 1);
  });

  test('seed 201: no program or hardware in the Grip: Modded dimmed with the reason', async ({ page }) => {
    const seed = 201;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'modded_no_target');
    const l = await pickHand(page, Number(plan.info['handIndex']));
    expect(targetOf(l, 'play')).toMatchObject({ lit: false, note: 'No program or hardware in your Grip' });
    await shot(page, '14-modded-no-target');
  });

  test('seed 204: The Toolbox (Link and memory up) pays the barrier breaker: a real tap spends its credits, not Kate\'s', async ({ page }) => {
    const seed = 204;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'toolbox_encounter');
    let l = await waitIdle(page);
    let v = await getView(page);
    const tb = v.rig.find((c) => c.uid === plan.info['toolboxUid'])!;
    expect(tb.hostedCredits).toBe(2);
    expect(installedIn(l, tb.uid).hosted).toMatchObject({ text: '2' });
    const kateLink = getCard(v.players.runner.identity!.cardId)!.link ?? 0;
    expect(v.players.runner.link).toBeGreaterThanOrEqual(kateLink + 2);
    expect(l.runnerStatus.link!.text).toBe(`Link ${v.players.runner.link}`);
    expect(v.memory.limit).toBeGreaterThanOrEqual(6);
    const pays = l.run!.buttons.filter((b) => (b.fullLabel ?? b.label).includes('The Toolbox pays'));
    expect(pays.length).toBeGreaterThan(0);
    for (const b of pays) expect(b.source, 'only breaker buttons').toBe(v.rig.find((c) => c.uid === plan.info['breakerUid'])!.cardId);
    await shot(page, '15-toolbox-pays');
    const b = pays.find((x) => x.lit)!;
    const opt = v.run!.options.find((o) => JSON.stringify(o.action) === JSON.stringify(b.action))!;
    const fromBox = opt.hostedPay!.find((h) => h.uid === tb.uid)!.amount;
    const own = v.players.runner.credits;
    await snappyTap(page, b.box);
    l = await waitIdle(page);
    v = await getView(page);
    expect(v.rig.find((c) => c.uid === tb.uid)!.hostedCredits).toBe(2 - fromBox);
    expect(v.players.runner.credits).toBe(own - (opt.cost - opt.hostedPay!.reduce((n, h) => n + h.amount, 0)));
    await shot(page, '16-toolbox-paid');
  });
});

test.describe('QA S-12-4 Infiltration (real taps)', () => {
  test('seed 201: Expose 1 card, tap the face-down ICE: shown big until tapped away; it stays face down (Corp\'s screen too)', async ({ page }) => {
    const seed = 201;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'infiltration_ready');
    const uid = plan.info['uid']!;
    const before = await getView(page);
    let l = await pickHand(page, Number(plan.info['handIndex']));
    expect(targetOf(l, 'play')).toMatchObject({ label: 'Gain 2 credits', lit: true });
    expect(targetOf(l, 'expose_open')).toMatchObject({ label: 'Expose 1 card', lit: true });
    await shot(page, '17-infiltration-two-choices');
    await tap(page, targetOf(l, 'expose_open').box);
    await page.waitForFunction(() => window.__overclock!.layout().targets.some((t) => t.kind === 'expose'));
    l = await layout(page);
    const faceDown = before.corpServers.flatMap((s) => [...s.ice, ...s.content]).filter((c) => !c.faceUp).map((c) => c.uid);
    expect(l.targets.filter((t) => t.kind === 'expose').map((t) => t.uid).sort()).toEqual([...faceDown].sort());
    await snappyTap(page, l.targets.find((t) => t.kind === 'expose' && t.uid === uid)!.box);
    await page.waitForFunction(() => window.__overclock!.layout().exposed !== null);
    l = await waitIdle(page);
    expect(l.exposed).toMatchObject({ uid, cardId: plan.info['cardId'], caption: 'Exposed · tap to hide' });
    thumb(l, l.exposed!.box, 'exposed card');
    const v = await getView(page);
    expect(v.corpServers).toEqual(before.corpServers); // still face down, nothing else changed
    expect(v.players.runner.credits).toBe(before.players.runner.credits);
    await shot(page, '18-infiltration-exposed');
    await tap(page, l.exposed!.box);
    await page.waitForFunction(() => window.__overclock!.layout().exposed === null);
    // The Corp's turn: the card is still unrezzed.
    await passTurn(page);
    const cv = await getView(page);
    expect(cv.viewer).toBe('corp');
    expect(cv.corpServers.flatMap((s) => [...s.ice, ...s.content]).find((c) => c.uid === uid)).toMatchObject({ faceUp: false });
  });

  test('seed 203: Gain 2 credits: one tap', async ({ page }) => {
    const seed = 203;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'infiltration_ready');
    const before = await getView(page);
    const l = await pickHand(page, Number(plan.info['handIndex']));
    const m = await snappyTap(page, targetOf(l, 'play').box);
    expect(m.view.players.runner.credits).toBe(before.players.runner.credits + 2);
  });
});

test.describe('QA S-12-5 45-card decks and Sprint 11 saves', () => {
  test('start screen "Play on this device": both sides dealt from 45 cards (HB and Kate)', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
    await tapButton(page, /Play on this device/);
    await page.waitForFunction(() => !!window.__overclock && window.__overclock.getView().players.corp.identity !== null);
    const v = await getView(page);
    expect(v.players.corp.identity!.cardId).toBe(CORP_CORE45_DECK.identity);
    expect(v.players.runner.identity!.cardId).toBe(RUNNER_CORE45_DECK.identity);
    for (const s of ['corp', 'runner'] as const) expect(v.players[s].deckCount + v.players[s].handCount, s).toBe(45);
    await shot(page, '19-new-game-45-cards');
  });

  test('a real Sprint 11 save (rules 4, 30-card decks, 12 moves): Continue shows the note; then a new game deals 45', async ({ page }) => {
    const m = new LocalMatch(1111, { deckSet: 'core' });
    let moves = 0;
    while (moves < 12) {
      const side = m.view('corp').activePlayer;
      const v = m.view(side);
      const a: Action = v.players[side].clicks > 0 ? { type: 'gain_credit', player: side } : v.pendingDiscard > 0 ? { type: 'discard', player: side, handIndices: Array.from({ length: v.pendingDiscard }, (_, i) => i) } : { type: 'end_turn', player: side };
      expect(m.submit(side, a)[side].events.some((e) => e.type === 'action_rejected')).toBe(false);
      moves++;
    }
    const save = { ...m.save(), rulesVersion: 4 };
    await page.goto('./');
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
    await page.evaluate(([k, s]) => window.localStorage.setItem(k as string, s as string), [KEY, JSON.stringify(save)] as const);
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
    await expect(page.locator('#start').getByRole('button', { name: /^Continue game/ })).toBeVisible();
    await tapButton(page, /^Continue game/);
    await expect(page.locator('#start .error')).toHaveText(OUTDATED);
    await expect(page.locator('#start').getByRole('button', { name: /^Continue game/ })).toHaveCount(0);
    await shot(page, '20-sprint11-save-note');
    await tapButton(page, /Play on this device/);
    await page.waitForFunction(() => !!window.__overclock && window.__overclock.getView().players.corp.identity !== null);
    const v = await getView(page);
    expect(v.turn).toBe(1);
    for (const s of ['corp', 'runner'] as const) expect(v.players[s].deckCount + v.players[s].handCount).toBe(45);
  });
});

test.describe('QA Sprint 12 online (two phones)', () => {
  test.beforeEach(() => test.skip(test.info().project.name === 'phone-short', 'online path is size-independent (as the other online specs)'));

  test('a real online game (codes, no hook moves) deals 45 to each side on both phones', async ({ browser }) => {
    const corp = await openPhone(browser);
    const runner = await openPhone(browser);
    const code = await startGame(corp, 'corp');
    await joinGame(runner, code);
    await Promise.all([waitPlaying(corp), waitPlaying(runner)]);
    for (const p of [corp, runner]) {
      const v = await view(p);
      expect(v.players.corp.identity?.cardId).toBe(CORP_CORE45_DECK.identity);
      for (const s of ['corp', 'runner'] as const) expect(v.players[s].deckCount + v.players[s].handCount).toBe(45);
    }
    await corp.context.close();
    await runner.context.close();
  });

  test('seed 203 ABT online: the Corp\'s phone shows the 3; the Runner\'s phone never receives their ids', async ({ browser }) => {
    const seed = 203;
    const plan = planToStep(seed, 'abt_scorable', undefined, { rezWindow: 'always', deckSet: 'core45' });
    const corp = await openPhone(browser);
    const runner = await openPhone(browser);
    const code = await startTestGame(runner, 'runner', { seed, actions: [...plan.actions], deckSet: 'core45' });
    await joinGame(corp, code);
    await Promise.all([waitPlaying(corp), waitPlaying(runner)]);
    const mark = runner.received.length;
    // Real taps on the Corp's phone: the agenda, Score.
    const l = await layoutOf(corp);
    await tap(corp.page, l.servers.flatMap((s) => s.content).find((c) => c.uid === plan.info['uid'])!.box);
    await corp.page.waitForFunction((u) => window.__overclock!.layout().selectedInstalled === u, plan.info['uid']);
    await tap(corp.page, targetOf(await layoutOf(corp), 'score').box);
    const cv = await waitView(corp, (v) => v.choice?.kind === 'look_install');
    const looked = cv.choice!.looked! as string[];
    expect(looked.every((x) => typeof x === 'string')).toBe(true);
    await corp.page.waitForFunction(() => window.__overclock!.layout().sheet?.kind === 'look');
    const rv = await waitView(runner, (v) => v.choice?.kind === 'look_install');
    expect(rv.choice!.looked).toEqual([null, null, null]);
    expect((await layoutOf(runner)).sheet).toBeNull();
    await shot(corp.page, '21-online-abt-corp');
    await shot(runner.page, '22-online-abt-runner');
    // Corp: Done at once (Skip installs nothing): all 3 to Archives face down.
    await act(corp, { type: 'pass', player: 'corp' });
    const after = await waitView(runner, (v) => v.choice === null);
    expect(after.players.corp.discard.slice(-3)).toEqual([null, null, null]);
    const raw = runner.received.slice(mark).join('\n');
    expect(raw).not.toContain('cardIds');
    const pub = publicIds(after);
    for (const id of looked) if (!pub.has(id)) expect(raw, `Runner never got ${id}`).not.toContain(`"${id}"`);
    const ev = frames(runner.received.slice(mark)).flatMap((f) => f.events ?? []);
    expect(ev.find((e) => e.type === 'rd_cards_trashed')).toEqual({ type: 'rd_cards_trashed', count: 3 });
    await corp.context.close();
    await runner.context.close();
  });

  test('seed 202 Infiltration online: expose Experiential Data: both phones show it; both still see it face down', async ({ browser }) => {
    const seed = 202;
    const plan = planToStep(seed, 'infiltration_ready', undefined, { rezWindow: 'always', deckSet: 'core45' });
    const corp = await openPhone(browser);
    const runner = await openPhone(browser);
    const code = await startTestGame(corp, 'corp', { seed, actions: [...plan.actions], deckSet: 'core45' });
    await joinGame(runner, code);
    await Promise.all([waitPlaying(corp), waitPlaying(runner)]);
    const uid = plan.info['uid']!;
    const rBefore = await view(runner);
    const cBefore = await view(corp);
    const mark = runner.received.length;
    const hand = Number(plan.info['handIndex']);
    await tap(runner.page, (await layoutOf(runner)).hand[hand]!.box);
    await runner.page.waitForFunction((k) => window.__overclock!.layout().handView?.index === k, hand);
    await tap(runner.page, (await layoutOf(runner)).handView!.centre);
    await runner.page.waitForFunction(() => window.__overclock!.layout().targets.some((t) => t.kind === 'expose_open'));
    await tap(runner.page, targetOf(await layoutOf(runner), 'expose_open').box);
    await runner.page.waitForFunction(() => window.__overclock!.layout().targets.some((t) => t.kind === 'expose'));
    await tap(runner.page, (await layoutOf(runner)).targets.find((t) => t.kind === 'expose' && t.uid === uid)!.box);
    for (const p of [runner, corp]) await p.page.waitForFunction((u) => window.__overclock!.layout().exposed?.uid === u, uid);
    for (const p of [runner, corp]) expect((await layoutOf(p)).exposed).toMatchObject({ uid, cardId: plan.info['cardId'] });
    expect(plan.info['cardId']).toBe('c25');
    await shot(runner.page, '23-online-exposed-runner');
    await shot(corp.page, '24-online-exposed-corp');
    const rAfter = await view(runner);
    const cAfter = await view(corp);
    expect(rAfter.corpServers).toEqual(rBefore.corpServers);
    expect(cAfter.corpServers).toEqual(cBefore.corpServers);
    expect(rAfter.players.corp).toEqual(rBefore.players.corp);
    // Only the exposed id is new to the Runner's phone.
    const raw = runner.received.slice(mark).join('\n');
    const pub = publicIds(rBefore);
    const seen = new Set(raw.match(/"c\d\d"/g)?.map((s) => s.slice(1, -1)) ?? []);
    for (const id of seen) expect(id === plan.info['cardId'] || pub.has(id), `${id} reached the Runner`).toBe(true);
    await corp.context.close();
    await runner.context.close();
  });
});

test.describe('QA S-12-6 Melange "Click ×3" on the 45-card deck', () => {
  test('Melange in the opening hand (core45): the hand view shows the symbol and "×3", no "click" words', async ({ page }) => {
    let seed = 0;
    let index = -1;
    for (let s = 201; s < 400 && index < 0; s++) {
      index = new LocalMatch(s, { deckSet: 'core45' }).view('corp').players.corp.hand!.indexOf('c15');
      seed = s;
    }
    expect(index).toBeGreaterThanOrEqual(0);
    await openBoard(page, { seed, decks: 'core45' });
    await waitIdle(page);
    let l = await openHand(page, index);
    await page.waitForFunction(() => !window.__overclock!.layout().animating);
    l = await layout(page);
    expect(l.zoom!.cardId).toBe('c15');
    expect(l.zoom!.clickCost).toMatchObject({ count: 3, text: '×3' });
    expect(l.zoom!.texts).toContain('×3: Gain 7 credits.');
    for (const t of l.zoom!.texts) expect(t.toLowerCase()).not.toContain('click');
    expect(l.zoom!.textOverflow).toBe(false);
    await shot(page, '25-melange-x3-hand-view');
  });
});
