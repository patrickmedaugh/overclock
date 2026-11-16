// Sprint 9 (U1-U4): the trace bid panel, the Tagged marker and link, the remove-tag /
// trash-resource / Private Security Force buttons, and the new messages, drawn from
// made-up views (the test hook's `stub`) on a real core-deck board. Every number on
// screen comes from the stub view; the engine's traces/tags (E3-E5) get their own
// story e2e on real play in s09-cards / s09-online (U5). Real taps; screens are attached to the report only.
import { type Page, expect, test } from '@playwright/test';
import type { CardOption, ChoiceView, GameEvent, PlayerView, RunView, TraceView } from '@overclock/engine';
import type { LayoutSnapshot } from '../src/hook-types';
import { dismissReport, expectCleanLayout, overlaps, getView, layout, openBoard, passTurn, pickHand, tap, targetOf, toStep, waitIdle } from './helpers';

const SEED = 1;

/** Stub-view screens are attached to the report only; the demo screenshots come from s09-cards (real play). */
async function shot(page: Page, name: string): Promise<void> {
  const body = await page.screenshot();
  await test.info().attach(name, { body, contentType: 'image/png' });
}

type Decision = { seat: 'corp' | 'runner'; run: RunView | null; choice: ChoiceView | null };

async function stub(page: Page, view: PlayerView, events: GameEvent[] = [], decision: Decision | null = null): Promise<LayoutSnapshot> {
  await page.evaluate(({ v, e, d }) => window.__overclock!.stub(v, e, d), { v: view, e: events, d: decision });
  return waitIdle(page);
}

function sent(page: Page) {
  return page.evaluate(() => window.__overclock!.sent());
}

function bids(player: 'corp' | 'runner', max: number): CardOption[] {
  return Array.from({ length: max + 1 }, (_, credits) => ({ action: { type: 'trace_bid', player, credits }, cost: credits, reject: null }) as CardOption);
}

function trace(kind: 'trace_corp' | 'trace_runner', cardId: string, t: Partial<TraceView>, options: CardOption[]): ChoiceView {
  const view: TraceView = { base: 3, strength: 3, corpBid: null, link: 1, runnerMaxBid: 5, corpMaxBid: 4, needed: 2, ...t };
  return { kind, waitingOn: kind === 'trace_corp' ? 'corp' : 'runner', cardId, trace: view, options };
}

/** Every bid-control button is a real touch target, and the number is big. */
function expectBigControl(l: LayoutSnapshot): void {
  const c = l.trace?.control;
  expect(c, 'the bid control shows').toBeTruthy();
  for (const [name, b] of Object.entries(c!.buttons)) expect(Math.min(b.box.width, b.box.height), `${name} >= 44 px`).toBeGreaterThanOrEqual(44);
  expect(Math.min(c!.tile.width, c!.tile.height)).toBeGreaterThanOrEqual(44);
  expect(c!.numberPx, 'bid number >= 20 px').toBeGreaterThanOrEqual(20);
  expect(c!.captionPx, 'caption >= 10 px').toBeGreaterThanOrEqual(10);
  expect(c!.buttons.minus.fontPx, '− / + glyphs >= 20 px').toBeGreaterThanOrEqual(20);
  expect(l.trace!.infoFontPx, 'panel text >= 9 px').toBeGreaterThanOrEqual(9);
}

/** The Runner at a rezzed Hunter (real run), seen from the Runner's seat. */
async function hunterRun(page: Page): Promise<PlayerView> {
  await openBoard(page, { seed: SEED, decks: 'core' });
  await toStep(page, SEED, 'pipeline_hunter_encounter');
  return getView(page);
}

function hunterId(v: PlayerView): string {
  return v.run!.ice!.cardId!;
}

test.describe('S-09-1 trace bid panel', () => {
  test('in a run, pass-the-phone: the Corp bids on the shared screen: − / + / Max / Bid, the total as it changes', async ({ page }) => {
    const v = await hunterRun(page);
    const ice = hunterId(v);
    const choice = trace('trace_corp', ice, {}, []);
    const runnerView: PlayerView = { ...v, phase: 'choice', choice, run: { ...v.run!, waitingOn: 'corp', options: [], letFire: null } };
    const corpChoice = trace('trace_corp', ice, {}, bids('corp', 4));
    let l = await stub(page, runnerView, [], { seat: 'corp', run: { ...runnerView.run! }, choice: corpChoice });
    expect(l.viewer).toBe('runner');
    expect(l.trace).toMatchObject({ kind: 'trace_corp', deciding: 'corp', mine: true, stepLabel: 'Trace 3: add credits?' });
    expect(l.run?.choice?.kind).toBe('trace_corp');
    expect(l.trace!.control).toMatchObject({ bid: 0, low: 0, high: 4, caption: 'strength 3' });
    expect(l.trace!.control!.buttons.minus.lit).toBe(false);
    expect(l.trace!.control!.buttons.bid).toMatchObject({ label: 'Bid 0', lit: true });
    expect(l.hand).toEqual([]);
    expectBigControl(l);
    // + twice: 2, strength 5.
    await tap(page, l.trace!.control!.buttons.plus.box);
    await tap(page, l.trace!.control!.buttons.plus.box);
    l = await layout(page);
    expect(l.trace!.control).toMatchObject({ bid: 2, caption: 'strength 5' });
    expect(l.trace!.lines[0]).toBe('Trace 3 + 2 → strength 5');
    expect(l.trace!.control!.buttons.bid.label).toBe('Bid 2');
    await shot(page, 's09-1-corp-bid-in-run');
    // − once, then Max: 4 (the highest offered bid).
    await tap(page, l.trace!.control!.buttons.minus.box);
    expect((await layout(page)).trace!.control!.bid).toBe(1);
    await tap(page, l.trace!.control!.buttons.max.box);
    l = await layout(page);
    expect(l.trace!.control).toMatchObject({ bid: 4, caption: 'strength 7' });
    expect(l.trace!.control!.buttons.plus.lit).toBe(false);
    expect(l.trace!.control!.buttons.max.lit).toBe(false);
    // + at the top stays at 4.
    await tap(page, l.trace!.control!.buttons.plus.box);
    expect((await layout(page)).trace!.control!.bid).toBe(4);
    // Bid sends the engine's own option for that amount, as the Corp.
    await tap(page, l.trace!.control!.buttons.bid.box);
    expect((await sent(page)).at(-1)).toEqual({ type: 'trace_bid', player: 'corp', credits: 4 });
  });

  test('the Runner answers: "Trace strength 5 · your link 1 · spend 4 to stop it"; his total says when he escapes', async ({ page }) => {
    const v = await hunterRun(page);
    const ice = hunterId(v);
    const choice = trace('trace_runner', ice, { strength: 5, corpBid: 2, needed: 4, runnerMaxBid: 6 }, bids('runner', 6));
    let l = await stub(page, { ...v, phase: 'choice', choice, run: { ...v.run!, options: [], letFire: null } });
    expect(l.trace).toMatchObject({ kind: 'trace_runner', deciding: 'runner', mine: true, stepLabel: 'Trace strength 5 · your link 1 · spend 4 to stop it' });
    expectBigControl(l);
    for (let i = 0; i < 4; i++) await tap(page, l.trace!.control!.buttons.plus.box);
    l = await layout(page);
    expect(l.trace!.control).toMatchObject({ bid: 4, caption: 'link 5 · escape' });
    expect(l.trace!.lines).toContain('Link 1 + 4 = 5: you escape');
    expectCleanLayout(l);
    await shot(page, 's09-1-runner-bid');
    await tap(page, l.trace!.control!.buttons.bid.box);
    expect((await sent(page)).at(-1)).toEqual({ type: 'trace_bid', player: 'runner', credits: 4 });
  });

  test('online: the other phone bids; this one says "Corp is choosing its trace bid…" and shows no control', async ({ page }) => {
    const v = await hunterRun(page);
    const choice = trace('trace_corp', hunterId(v), {}, []);
    const l = await stub(page, { ...v, phase: 'choice', choice, run: { ...v.run!, waitingOn: 'corp', options: [], letFire: null } });
    expect(l.trace).toMatchObject({ mine: false, stepLabel: 'Corp is choosing its trace bid…', control: null });
    expect(l.run!.buttons).toEqual([]);
    expect(l.text.help === '' || l.text.help === 'Corp is choosing its trace bid…').toBe(true);
  });

  test("SEA Source on the Corp's turn: the bid panel takes the hand's room; the Runner's bid is handed over (no hand shows)", async ({ page }) => {
    await openBoard(page, { seed: SEED, decks: 'core' });
    const v = await getView(page);
    expect(v.viewer).toBe('corp');
    const sea = 'c22';
    let l = await stub(page, { ...v, phase: 'choice', choice: trace('trace_corp', sea, { corpMaxBid: 5 }, bids('corp', 5)) });
    expect(l.run).toBeNull();
    expect(l.trace).toMatchObject({ title: 'Trace · SEA Source', stepLabel: 'Trace 3: add credits?', mine: true });
    expect(l.hand).toEqual([]);
    expectBigControl(l);
    expectCleanLayout(l);
    await shot(page, 's09-1-sea-source-corp-bid');
    // The Runner's window: his decision on the Corp's board; the Corp's hand stays hidden.
    const runnerChoice = trace('trace_runner', sea, { strength: 5, corpBid: 2, needed: 4 }, bids('runner', 5));
    const corpSide = trace('trace_runner', sea, { strength: 5, corpBid: 2, needed: 4 }, []);
    l = await stub(page, { ...v, phase: 'choice', choice: corpSide }, [], { seat: 'runner', run: null, choice: runnerChoice });
    expect(l.trace).toMatchObject({ deciding: 'runner', mine: true, stepLabel: 'Trace strength 5 · your link 1 · spend 4 to stop it' });
    expect(l.hand).toEqual([]);
    await tap(page, l.trace!.control!.buttons.max.box);
    await tap(page, l.trace!.control!.buttons.bid.box);
    expect((await sent(page)).at(-1)).toEqual({ type: 'trace_bid', player: 'runner', credits: 5 });
  });

  test('the result toast says both totals; a skipped window says "Corp bid 0"', async ({ page }) => {
    await openBoard(page, { seed: SEED, decks: 'core' });
    const v = await getView(page);
    const events: GameEvent[] = [
      { type: 'trace_started', cardId: 'c22', base: 3, link: 1 },
      { type: 'trace_bid', player: 'corp', credits: 0, total: 3, auto: true },
      { type: 'trace_bid', player: 'runner', credits: 0, total: 1, auto: true },
      { type: 'trace_resolved', cardId: 'c22', strength: 3, total: 1, success: true },
      { type: 'tags_changed', amount: 1, tags: 1 },
    ];
    const l = await stub(page, { ...v, players: { ...v.players, runner: { ...v.players.runner, tags: 1 } } }, events);
    // QA-S9-1: one sentence, the skipped bids in brackets, in a wide bubble (not the rail's narrow slot).
    expect(l.hint?.text).toBe('SEA Source: trace 3 vs link 1: Runner tagged (Corp bid 0, Runner bid 0)');
    const hint = (await page.evaluate(() => window.__overclock!.anims())).find((a) => a.kind === 'notice' && a.text?.startsWith('SEA Source'))!;
    expect(hint.fontPx!, 'toast text >= 12 px').toBeGreaterThanOrEqual(12);
    expect(hint.box!.height, 'at most 2 lines').toBeLessThanOrEqual(hint.fontPx! * 2 * 1.3 + 20);
    expect(hint.box!.width).toBeGreaterThan(l.runner.credits.width);
    expect(hint.box!.x).toBeGreaterThanOrEqual(0);
    expect(hint.box!.x + hint.box!.width).toBeLessThanOrEqual(l.viewport.width);
    await shot(page, 'qa-s9-1-trace-result-toast');
    expect((await page.evaluate(() => window.__overclock!.anims())).some((a) => a.kind === 'tags_changed' && a.scheduledMs <= 600)).toBe(true);
  });
});

test.describe('S-09-1 Hunter trace through the pass-the-phone cover (real engine)', () => {
  /** Taps the cover away (if up) and waits for the board. */
  async function lift(page: Page): Promise<LayoutSnapshot> {
    const l = await layout(page);
    if (l.cover) {
      await tap(page, { x: l.viewport.width / 2 - 5, y: l.viewport.height - 40, width: 10, height: 10 });
      await page.waitForFunction(() => window.__overclock!.layout().cover === null);
    }
    return waitIdle(page);
  }

  test('Runner lets Hunter fire -> cover -> Corp bids 2 -> cover -> Runner bids; the report says both totals', async ({ page }) => {
    await page.goto(`./?seed=${SEED}&play=here`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
    await toStep(page, SEED, 'pipeline_hunter_encounter');
    let l = await lift(page);
    expect(l.viewer).toBe('runner');
    const fire = l.run!.buttons.find((b) => /^Let it fire/.test(b.label))!;
    expect(fire.label).toContain('trace 3');
    await tap(page, fire.box);
    l = await layout(page);
    expect(l.cover).toMatchObject({ to: 'corp', title: 'Pass to the Corp — tap when ready' });
    expect(l.trace?.deciding).toBe('corp');
    await shot(page, 's09-1-cover-to-corp');
    l = await lift(page);
    expect(l.trace).toMatchObject({ kind: 'trace_corp', mine: true, stepLabel: 'Trace 3: add credits?' });
    expectBigControl(l);
    await tap(page, l.trace!.control!.buttons.plus.box);
    await tap(page, l.trace!.control!.buttons.plus.box);
    l = await layout(page);
    expect(l.trace!.control).toMatchObject({ bid: 2, caption: 'strength 5' });
    await tap(page, l.trace!.control!.buttons.bid.box);
    l = await waitIdle(page);
    const corp = (await page.evaluate(() => window.__overclock!.lastEvents())).find((e) => e.type === 'trace_bid');
    expect(corp).toMatchObject({ player: 'corp', credits: 2, total: 5 });
    if (l.cover) {
      // The Runner can answer: the device comes back to him with his own bid control.
      expect(l.cover).toMatchObject({ to: 'runner', title: 'Pass back to the Runner — tap when ready' });
      l = await lift(page);
      expect(l.trace).toMatchObject({ kind: 'trace_runner', mine: true });
      expect(l.trace!.stepLabel).toMatch(/^Trace strength 5 · your link 1 · spend 4 to stop it$/);
      await shot(page, 's09-1-runner-answers-hunter');
      await tap(page, l.trace!.control!.buttons.bid.box);
      l = await waitIdle(page);
    }
    // The Runner bid 0 (or could not answer): strength 5 beats link 1.
    expect(l.report?.text).toMatch(/^Hunter: trace 5 vs link 1: you got 1 tag\./);
    expect(l.runnerStatus.tagged?.text).toBe('Tagged 1');
    await shot(page, 's09-1-hunter-report');
    await dismissReport(page);
    // S-09-2 (real engine): jack out, then the Runner removes the tag from his marker.
    l = await waitIdle(page);
    await tap(page, l.run!.buttons.find((b) => b.label === 'Jack out')!.box);
    l = await lift(page);
    expect(l.run).toBeNull();
    await tap(page, l.runnerStatus.tagged!.hit);
    l = await layout(page);
    const remove = targetOf(l, 'remove_tag');
    expect(remove).toMatchObject({ label: 'Remove 1 tag · 1 click + 2 credits', lit: true });
    const credits = (await getView(page)).players.runner.credits;
    await tap(page, remove.box);
    l = await waitIdle(page);
    const v = await getView(page);
    expect(v.players.runner.tags).toBe(0);
    expect(v.players.runner.credits).toBe(credits - 2);
    expect(l.runnerStatus.tagged).toBeNull();
    expect(l.hint?.text).toContain('Runner removed 1 tag');
  });
});

test.describe('S-09-2 tags and link', () => {
  test('"Tagged 1" by the Runner\'s credits on both screens; Link 1 on his identity', async ({ page }) => {
    await openBoard(page, { seed: SEED, decks: 'core' });
    const v = await getView(page);
    let l = await layout(page);
    expect(l.runnerStatus.link?.text).toBe('Link 1');
    expect(l.runnerStatus.tagged).toBeNull();
    l = await stub(page, { ...v, players: { ...v.players, runner: { ...v.players.runner, tags: 1 } } });
    expect(l.viewer).toBe('corp');
    expect(l.runnerStatus.tagged?.text).toBe('Tagged 1');
    expect(l.tags.runner?.text).toBe('Tagged 1');
    expectCleanLayout(l);
    await shot(page, 's09-2-tagged-corp-view');
  });

  test('the Runner taps his tag marker: "Remove 1 tag · 1 click + 2 credits"; dim with the reason when short', async ({ page }) => {
    await openBoard(page, { seed: SEED, decks: 'core' });
    await passTurn(page);
    const v = await getView(page);
    expect(v.viewer).toBe('runner');
    const remove = (reject: CardOption['reject']): CardOption => ({ action: { type: 'remove_tag', player: 'runner' }, cost: 2, clicks: 1, reject });
    let l = await stub(page, { ...v, players: { ...v.players, runner: { ...v.players.runner, tags: 2 } }, basicOptions: [remove(null)] });
    const tagged = l.runnerStatus.tagged!;
    expect(tagged.text).toBe('Tagged 2');
    expect(Math.min(tagged.hit.width, tagged.hit.height)).toBeGreaterThanOrEqual(44);
    // The hit area never covers the credits / clicks pills next to the note.
    expect(overlaps(tagged.hit, l.runner.credits)).toBe(false);
    expect(overlaps(tagged.hit, l.runner.clicks)).toBe(false);
    await tap(page, tagged.hit);
    l = await layout(page);
    expect(l.selectedInstalled).toBe('basic:tags');
    const t = targetOf(l, 'remove_tag');
    expect(t).toMatchObject({ label: 'Remove 1 tag · 1 click + 2 credits', lit: true });
    expect(Math.min(t.box.width, t.box.height)).toBeGreaterThanOrEqual(44);
    await shot(page, 's09-2-remove-tag');
    await tap(page, t.box);
    expect((await sent(page)).at(-1)).toEqual({ type: 'remove_tag', player: 'runner' });
    // Too few credits: dimmed, and says why.
    await waitIdle(page);
    l = await stub(page, { ...v, players: { ...v.players, runner: { ...v.players.runner, tags: 1 } }, basicOptions: [remove('no_credits')] });
    await tap(page, l.runnerStatus.tagged!.hit);
    l = await layout(page);
    expect(targetOf(l, 'remove_tag')).toMatchObject({ lit: false, reject: 'no_credits', note: 'Not enough credits' });
  });

  test("the Corp taps a Runner resource while he is tagged: \"Trash · 1 click + 2 credits\"; the message names it", async ({ page }) => {
    // runner_armitage plans on the Sprint 7 decks.
    await openBoard(page, SEED);
    const plan = await toStep(page, SEED, 'runner_armitage');
    const uid = plan.info['uid']!;
    await passTurn(page);
    const v = await getView(page);
    expect(v.viewer).toBe('corp');
    const trash: CardOption = { action: { type: 'trash_resource', player: 'corp', uid }, cost: 2, clicks: 1, reject: null };
    let l = await stub(page, { ...v, players: { ...v.players, runner: { ...v.players.runner, tags: 1 } }, installedOptions: { ...v.installedOptions, [uid]: [trash] } });
    const card = l.rig.find((c) => c.uid === uid)!;
    await tap(page, card.box);
    await page.waitForFunction((u) => window.__overclock!.layout().selectedInstalled === u, uid);
    l = await layout(page);
    expect(targetOf(l, 'trash_resource')).toMatchObject({ label: 'Trash · 1 click + 2 credits', lit: true });
    await shot(page, 's09-2-corp-trash-resource');
    await tap(page, targetOf(l, 'trash_resource').box);
    expect((await sent(page)).at(-1)).toEqual(trash.action);
    // The engine's answer (stubbed): Armitage to the Heap with a message.
    await waitIdle(page);
    const after = await getView(page);
    l = await stub(page, after, [{ type: 'rig_card_trashed', uid, cardId: 'r02', cause: 'tagged' }]);
    expect(l.hint?.text).toContain('Corp trashed Armitage Codebusting (Runner tagged)');
  });
});

test.describe('S-09-3 Private Security Force, S-09-4 SEA Source', () => {
  test('the Corp taps its score: "Do 1 meat damage · 1 click"; dim "Runner isn\'t tagged" when he is not', async ({ page }) => {
    await openBoard(page, { seed: SEED, decks: 'core' });
    const v = await getView(page);
    const psf = (reject: CardOption['reject']): CardOption => ({ action: { type: 'activate', player: 'corp', uid: 'score:corp:0', ability: 0 }, cost: 0, clicks: 1, reject });
    const scored = { ...v.players.corp, scored: ['c09'], points: 2 };
    let l = await stub(page, { ...v, players: { ...v.players, corp: scored }, installedOptions: { ...v.installedOptions, 'score:corp:0': [psf('condition_not_met')] } });
    await tap(page, l.score.corp.box);
    l = await layout(page);
    expect(l.selectedInstalled).toBe('score:corp:0');
    expect(targetOf(l, 'activate')).toMatchObject({ label: 'Do 1 meat damage · 1 click', lit: false, note: "Runner isn't tagged" });
    await shot(page, 's09-3-psf-untagged');
    // Tagged: lit; tapping sends the activate on the scored uid.
    l = await stub(page, { ...v, players: { ...v.players, corp: scored, runner: { ...v.players.runner, tags: 1 } }, installedOptions: { ...v.installedOptions, 'score:corp:0': [psf(null)] } });
    if (l.selectedInstalled !== 'score:corp:0') {
      await tap(page, l.score.corp.box);
      l = await layout(page);
    }
    expect(targetOf(l, 'activate')).toMatchObject({ label: 'Do 1 meat damage · 1 click', lit: true });
    await tap(page, targetOf(l, 'activate').box);
    expect((await sent(page)).at(-1)).toEqual(psf(null).action);
  });

  test('QA-S9-2: when meat damage flatlines the Runner, no button or toast stays over the game-over box', async ({ page }) => {
    await openBoard(page, { seed: SEED, decks: 'core' });
    const v = await getView(page);
    const psf: CardOption = { action: { type: 'activate', player: 'corp', uid: 'score:corp:0' as string, ability: 0 }, cost: 0, clicks: 1, reject: null };
    const scored = { ...v.players.corp, scored: ['c09'], points: 2 };
    const tagged = { ...v.players.runner, tags: 1 };
    let l = await stub(page, { ...v, players: { ...v.players, corp: scored, runner: tagged }, installedOptions: { ...v.installedOptions, 'score:corp:0': [psf] } });
    await tap(page, l.score.corp.box);
    l = await layout(page);
    expect(targetOf(l, 'activate').label).toBe('Do 1 meat damage · 1 click');
    await page.evaluate(() => window.__overclock!.clearAnims());
    const over: PlayerView = { ...v, phase: 'over', result: { winner: 'corp', reason: 'flatline' }, players: { ...v.players, corp: scored, runner: tagged }, installedOptions: { ...v.installedOptions, 'score:corp:0': [{ ...psf, reject: 'game_over' }] } };
    l = await stub(page, over, [{ type: 'meat_damage', amount: 1, cardIds: [] }, { type: 'game_over', winner: 'corp', reason: 'flatline' }]);
    expect(l.gameOver).toMatchObject({ title: 'Corp wins', reason: 'Runner flatlined' });
    expect(l.targets).toEqual([]);
    expect(l.selectedInstalled).toBeNull();
    expect((await page.evaluate(() => window.__overclock!.anims())).filter((a) => a.kind === 'notice')).toEqual([]);
    await shot(page, 'qa-s9-2-flatline-clean');
  });

  test('meat damage flies a Grip card to the Heap and names it', async ({ page }) => {
    await openBoard(page, { seed: SEED, decks: 'core' });
    const v = await getView(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    const l = await stub(page, v, [{ type: 'meat_damage', amount: 1, cardIds: ['r03'] }]);
    expect(l.hint?.text).toContain('1 meat damage: Diesel to the Heap');
    const a = (await page.evaluate(() => window.__overclock!.anims())).find((x) => x.kind === 'meat_damage');
    expect(a && a.scheduledMs <= 600).toBe(true);
  });

  test('SEA Source without a successful run last turn: dimmed, "Runner made no successful run last turn"', async ({ page }) => {
    await openBoard(page, { seed: SEED, decks: 'core' });
    const v = await getView(page);
    const hand = [...(v.players.corp.hand ?? [])];
    hand[0] = 'c22';
    const handOptions = [[{ action: { type: 'play', player: 'corp', handIndex: 0 }, cost: 2, reject: 'condition_not_met' } as CardOption], ...v.handOptions.slice(1)];
    await stub(page, { ...v, players: { ...v.players, corp: { ...v.players.corp, hand } }, handOptions });
    const l = await pickHand(page, 0);
    expect(targetOf(l, 'play')).toMatchObject({ label: 'Play · 2 credits', lit: false, reject: 'condition_not_met', note: 'Runner made no successful run last turn' });
    await shot(page, 's09-4-sea-source-dim');
  });
});
