// S-02-3 (Runner: install programs, hardware and resources) and S-02-4 (play money and draw cards).
import { getCard } from '@overclock/cards';
import { expect, test } from '@playwright/test';
import {
  anims,
  dispatch,
  expectSnappy,
  getView,
  layout,
  measureTap,
  openBoard,
  passTurn,
  pickCard,
  tap,
  targetOf,
  toRunnerTurn,
  waitIdle,
} from './helpers';

// Seed 12: the Runner opens with Ninja, Corroder, Gordian Blade, Easy Mark, Armitage Codebusting.
// Seed 2: Corp has Hedge Fund x2 and Anonymous Tip; Runner has Diesel, Ninja, The Maker's Eye.
// Seed 9: Corp has Hedge Fund and four ICE.

test.describe('S-02-3 Runner: install programs, hardware and resources', () => {
  test('tapping a program lights an Install spot in your area with its price; tapping it installs face up', async ({ page }) => {
    await openBoard(page, 12);
    await toRunnerTurn(page);
    const before = await getView(page);
    const l = await pickCard(page, 'Corroder');
    expect(l.targets).toHaveLength(1);
    const t = targetOf(l, 'install');
    expect(t).toMatchObject({ label: 'Install · 2 credits', lit: true });
    expect(Math.min(t.box.width, t.box.height)).toBeGreaterThanOrEqual(44);
    await test.info().attach('program picked', { body: await page.screenshot(), contentType: 'image/png' });
    const m = await measureTap(page, t.box);
    expect(m.events.map((e) => e.type)).toEqual(['credits_spent', 'card_installed']);
    expect(m.view.players.runner.credits).toBe(before.players.runner.credits - 2);
    expect(m.view.players.runner.clicks).toBe(before.players.runner.clicks - 1);
    expectSnappy(m, ['install_flight', 'credit_pop']);
    const after = await waitIdle(page);
    expect(after.rig).toHaveLength(1);
    expect(after.rig[0]).toMatchObject({ cardId: 'r04', faceUp: true });
    // Memory counter (S-02-3 AC4).
    expect(after.memory).toMatchObject({ used: 1, limit: 4, text: 'Memory 1/4' });
    expect(after.labels).toContain('MEMORY');
  });

  test('hardware and resources install too; memory counts programs only', async ({ page }) => {
    await openBoard(page, 12);
    await toRunnerTurn(page);
    let l = await pickCard(page, 'Armitage Codebusting');
    expect(targetOf(l, 'install').label).toBe('Install · 1 credit');
    await tap(page, targetOf(l, 'install').box);
    await waitIdle(page);
    l = await pickCard(page, 'Ninja');
    await tap(page, targetOf(l, 'install').box);
    l = await waitIdle(page);
    expect(l.rig.map((c) => c.cardId)).toEqual(['r02', 'r06']);
    expect(l.memory.text).toBe('Memory 1/4');
    // Install order, left to right, nothing overlapping.
    expect(l.rig[1]!.box.x).toBeGreaterThan(l.rig[0]!.box.x + l.rig[0]!.box.width - 0.5);
  });

  test("without enough credits, Install only shows \"Not enough credits\" and nothing changes", async ({ page }) => {
    await openBoard(page, 12);
    await toRunnerTurn(page);
    let l = await pickCard(page, 'Ninja');
    await tap(page, targetOf(l, 'install').box); // 5 -> 1 credit
    await waitIdle(page);
    l = await pickCard(page, 'Gordian Blade');
    const t = targetOf(l, 'install');
    expect(t).toMatchObject({ label: 'Install · 4 credits', lit: false, reject: 'no_credits' });
    const before = await getView(page);
    const m = await measureTap(page, t.box);
    expect(m.events).toEqual([{ type: 'action_rejected', reason: 'no_credits' }]);
    expect(m.view).toEqual(before);
    expect(m.anims.map((a) => [a.kind, a.text])).toEqual([['hint', 'Not enough credits']]);
  });

  test("on the Corp's turn the Runner's installed cards are face up", async ({ page }) => {
    await openBoard(page, 12);
    await toRunnerTurn(page);
    const l = await pickCard(page, 'Corroder');
    await tap(page, targetOf(l, 'install').box);
    await waitIdle(page);
    await passTurn(page);
    const c = await layout(page);
    expect(c.viewer).toBe('corp');
    expect(c.rig).toHaveLength(1);
    expect(c.rig[0]).toMatchObject({ cardId: 'r04', faceUp: true });
    expect(c.memory.text).toBe('Memory 1/4');
    expect((await getView(page)).rig[0]!.cardId).toBe('r04');
  });
});

test.describe('S-02-4 play money and draw cards', () => {
  test('Play shows each card\'s price: Hedge Fund 5 credits, Anonymous Tip free', async ({ page }) => {
    await openBoard(page, 2);
    let l = await pickCard(page, 'Hedge Fund');
    expect(l.targets.map((t) => [t.kind, t.label, t.lit])).toEqual([['play', 'Play · 5 credits', true]]);
    l = await pickCard(page, 'Anonymous Tip');
    expect(l.targets.map((t) => [t.kind, t.label])).toEqual([['play', 'Play · free']]);
  });

  test('Hedge Fund: pay 5, gain 9, one click, and it lands face up on Archives for both players', async ({ page }) => {
    await openBoard(page, 2);
    const before = await getView(page);
    const l = await pickCard(page, 'Hedge Fund');
    const m = await measureTap(page, targetOf(l, 'play').box);
    expect(m.events.map((e) => e.type)).toEqual(['credits_spent', 'card_played', 'credit_gained']);
    expect(m.view.players.corp.credits).toBe(before.players.corp.credits - 5 + 9);
    expect(m.view.players.corp.clicks).toBe(before.players.corp.clicks - 1);
    expect(m.view.players.corp.discard).toEqual(['c01']);
    expectSnappy(m, ['play_flight', 'credit_pop']);
    const after = await waitIdle(page);
    expect(after.text.corpCredits).toBe(String(before.players.corp.credits + 4));
    expect(after.text.corpDiscard).toBe('1');
    await passTurn(page);
    expect((await getView(page)).players.corp.discard).toEqual(['c01']);
  });

  test('Anonymous Tip draws 3 with the usual draw flights', async ({ page }) => {
    await openBoard(page, 2);
    const before = await getView(page);
    const l = await pickCard(page, 'Anonymous Tip');
    const m = await measureTap(page, targetOf(l, 'play').box);
    expect(m.events.map((e) => e.type)).toEqual(['card_played', 'card_drawn', 'card_drawn', 'card_drawn']);
    expect(m.view.players.corp.handCount).toBe(before.players.corp.handCount - 1 + 3);
    expectSnappy(m, ['play_flight', 'draw_flight']);
    const after = await waitIdle(page);
    expect(after.hand.map((h) => h.cardId)).toEqual(m.view.players.corp.hand);
  });

  test('Runner: Easy Mark gains 3; Diesel draws 3, and a hand over 5 brings the hand-limit step at End turn', async ({ page }) => {
    await openBoard(page, 4); // Runner: The Maker's Eye, Easy Mark, Sacrificial Construct, Diesel, Armitage Codebusting
    await toRunnerTurn(page);
    const before = await getView(page);
    let l = await pickCard(page, 'Easy Mark');
    expect(targetOf(l, 'play').label).toBe('Play · free');
    let m = await measureTap(page, targetOf(l, 'play').box);
    expect(m.view.players.runner.credits).toBe(before.players.runner.credits + 3);
    expect(m.view.players.runner.discard).toEqual(['r01']);
    expectSnappy(m, ['play_flight', 'credit_pop']);
    await waitIdle(page);
    l = await pickCard(page, 'Diesel');
    m = await measureTap(page, targetOf(l, 'play').box);
    expect(m.view.players.runner.handCount).toBe(before.players.runner.handCount - 2 + 3);
    expectSnappy(m, ['play_flight', 'draw_flight']);
    l = await waitIdle(page);
    expect(l.text.runnerDiscard).toBe('2');
    expect(l.hand).toHaveLength(6);
    await page.waitForTimeout(350); // End turn double-tap guard
    await tap(page, l.endTurn!.box);
    const picking = await waitIdle(page);
    expect(picking.picker).toMatchObject({ remaining: 1, label: 'Discard 1' });
  });

  test("can't afford Hedge Fund: Play only says \"Not enough credits\"", async ({ page }) => {
    await openBoard(page, 9);
    for (const name of ['Enigma', 'Wall of Static']) {
      const l = await pickCard(page, name);
      await tap(page, targetOf(l, 'server', 'rd').box);
      await waitIdle(page);
    }
    expect((await getView(page)).players.corp.credits).toBe(4);
    const l = await pickCard(page, 'Hedge Fund');
    const t = targetOf(l, 'play');
    expect(t).toMatchObject({ label: 'Play · 5 credits', lit: false, reject: 'no_credits' });
    const before = await getView(page);
    const m = await measureTap(page, t.box);
    expect(m.view).toEqual(before);
    expect(m.anims.map((a) => [a.kind, a.text])).toEqual([['hint', 'Not enough credits']]);
  });

  test('cards that need runs say "Needs runs (coming soon)" and spend nothing', async ({ page }) => {
    await openBoard(page, 2);
    await toRunnerTurn(page);
    const before = await getView(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    const l = await pickCard(page, "The Maker's Eye");
    expect(targetOf(l, 'play')).toMatchObject({ label: 'Play · 2 credits', reject: 'not_implemented' });
    expect((await anims(page)).find((a) => a.kind === 'hint')?.text).toBe('Needs runs (coming soon)');
    const m = await measureTap(page, targetOf(l, 'play').box);
    expect(m.events).toEqual([{ type: 'action_rejected', reason: 'not_implemented' }]);
    expect(m.view).toEqual(before);
    expect(m.anims.find((a) => a.kind === 'hint')?.text).toBe('Needs runs (coming soon)');
    // The card's text says what it will do later.
    expect(getCard('r07')!.text).toContain('Make a run');
  });

  test('with no clicks left, tapping a card says so instead of lighting targets', async ({ page }) => {
    await openBoard(page, 2);
    for (let i = 0; i < 3; i++) await dispatch(page, { type: 'gain_credit', player: 'corp' });
    const l0 = await waitIdle(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, l0.hand[0]!.box);
    const l = await layout(page);
    expect(l.selected).toBeNull();
    expect(l.targets).toEqual([]);
    expect((await anims(page)).find((a) => a.kind === 'hint')?.text).toBe('No clicks left');
  });
});
