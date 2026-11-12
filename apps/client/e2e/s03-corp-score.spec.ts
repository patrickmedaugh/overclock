// S-03-2 (advance and score agendas; 7 points wins) and S-03-5 (The Maker's Eye,
// Inside Job, Neural EMP; no "Needs runs (coming soon)" anywhere).
import { getCard } from '@overclock/cards';
import { type Page, expect, test } from '@playwright/test';
import {
  anims,
  dispatch,
  expectCleanLayout,
  expectSnappy,
  getView,
  layout,
  measureTap,
  openBoard,
  passTurn,
  pickCard,
  runButtonOf,
  tap,
  targetOf,
  toRunnerTurn,
  toStep,
  waitIdle,
} from './helpers';

/** The installed card `uid` as drawn, wherever it is. */
async function installed(page: Page, uid: string) {
  const l = await layout(page);
  const c = l.servers.flatMap((s) => [...s.content, ...s.ice]).find((x) => x.uid === uid);
  if (!c) throw new Error(`${uid} not on the table`);
  return c;
}

test.describe('S-03-2 advance and score', () => {
  test('tapping an installed agenda shows "Advance · 1 credit"; it uses a click and a credit and adds a counter', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'agenda_one_advance');
    const card = await installed(page, plan.info.uid!);
    // The Corp's own face-down card: a back with its counters drawn on it.
    expect(card.faceUp).toBe(false);
    const need = getCard(plan.info.cardId!)!.advancementRequirement!;
    expect(card.counter).toBe(need - 1 > 0 ? String(need - 1) : null);
    await tap(page, card.box);
    let l = await layout(page);
    expect(l.selectedInstalled).toBe(plan.info.uid);
    const adv = targetOf(l, 'advance');
    expect(adv).toMatchObject({ label: 'Advance · 1 credit', lit: true, uid: plan.info.uid });
    expect(Math.min(adv.box.width, adv.box.height)).toBeGreaterThanOrEqual(44);
    expect(l.targets.some((t) => t.kind === 'score')).toBe(false);
    expectCleanLayout(l);
    const before = await getView(page);
    const m = await measureTap(page, adv.box);
    expect(m.events.map((e) => e.type)).toEqual(['credits_spent', 'card_advanced']);
    expect(m.view.players.corp.clicks).toBe(before.players.corp.clicks - 1);
    expect(m.view.players.corp.credits).toBe(before.players.corp.credits - 1);
    expectSnappy(m, ['advance_pop']);
    l = await waitIdle(page);
    expect((await installed(page, plan.info.uid!)).counter).toBe(String(need));
    // Enough counters now: Score shows next to Advance (the agenda stays picked).
    expect(l.targets.map((t) => [t.kind, t.label])).toEqual([
      ['advance', 'Advance · 1 credit'],
      ['score', 'Score'],
    ]);
    expectCleanLayout(l);
    await test.info().attach('advance and score', { body: await page.screenshot(), contentType: 'image/png' });
    const pts = getCard(plan.info.cardId!)!.agendaPoints!;
    const clicks = (await getView(page)).players.corp.clicks;
    const s = await measureTap(page, targetOf(l, 'score').box);
    expect(s.events.map((e) => e.type)).toEqual(['agenda_scored']);
    expect(s.view.players.corp.points).toBe(before.players.corp.points + pts);
    expect(s.view.players.corp.clicks).toBe(clicks); // no click needed
    expectSnappy(s, ['score_flight']);
    l = await waitIdle(page);
    expect(l.score.corp.text).toBe(`Corp ${before.players.corp.points + pts} ${before.players.corp.points + pts === 1 ? 'point' : 'points'}`);
    expect(l.targets).toEqual([]);
  });

  test('the Runner sees the counters on a face-down card, but only its back', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'agenda_one_advance');
    await dispatch(page, { type: 'advance', player: 'corp', uid: plan.info.uid! });
    // End the Corp's turn: the Runner's board.
    await page.evaluate(() => {
      const hook = window.__overclock!;
      hook.dispatch({ type: 'end_turn', player: 'corp' });
      const v = hook.getView();
      if (v.pendingDiscard > 0) hook.dispatch({ type: 'discard', player: 'corp', handIndices: Array.from({ length: v.pendingDiscard }, (_, i) => i) });
    });
    const l = await waitIdle(page);
    expect(l.viewer).toBe('runner');
    const card = await installed(page, plan.info.uid!);
    const need = getCard(plan.info.cardId!)!.advancementRequirement!;
    expect(card).toMatchObject({ faceUp: false, cardId: null, counter: String(need) });
    expect(JSON.stringify(await getView(page))).not.toContain(`"${plan.info.cardId}"`);
    await test.info().attach('runner sees counters', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('scoring to 7 ends the game at once: "Corp wins" / "7 agenda points"', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'corp_one_score_from_win');
    await tap(page, (await installed(page, plan.info.uid!)).box);
    const m = await measureTap(page, targetOf(await layout(page), 'score').box);
    expect(m.events.map((e) => e.type)).toEqual(['agenda_scored', 'game_over']);
    const l = await waitIdle(page);
    expect(l.gameOver).toMatchObject({ title: 'Corp wins', reason: '7 agenda points', text: 'Corp wins: 7 agenda points' });
    expectCleanLayout(l);
    await test.info().attach('corp wins', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('stealing to 7 ends the game at once: "Runner wins" / "7 agenda points"', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'runner_one_steal_from_win');
    let l = await layout(page);
    await tap(page, l.runButton!.box);
    await tap(page, targetOf(await layout(page), 'run', plan.info.server).box);
    l = await waitIdle(page);
    expect(l.run!.access!.cards.map((c) => c.cardId)).toEqual([plan.info.cardId]);
    const m = await measureTap(page, runButtonOf(l, 'Steal').box);
    expect(m.events.map((e) => e.type)).toEqual(['agenda_stolen', 'run_ended', 'game_over']);
    l = await waitIdle(page);
    expect(l.gameOver).toMatchObject({ title: 'Runner wins', reason: '7 agenda points' });
    expect(l.run).toBeNull();
    expectCleanLayout(l);
    await test.info().attach('runner wins', { body: await page.screenshot(), contentType: 'image/png' });
  });
});

test.describe('S-03-5 run cards', () => {
  // Seed 2: the Runner opens with The Maker's Eye; R&D has plenty of cards.
  test("The Maker's Eye: a run on R&D that accesses the top 3 cards one after another", async ({ page }) => {
    await openBoard(page, 2);
    await toRunnerTurn(page);
    const l0 = await pickCard(page, "The Maker's Eye");
    const m = await measureTap(page, targetOf(l0, 'play').box);
    expect(m.events.map((e) => e.type)).toEqual(expect.arrayContaining(['credits_spent', 'card_played', 'run_started', 'run_successful', 'card_accessed']));
    expect(m.view.run?.server).toBe('rd');
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      const l = await waitIdle(page);
      if (!l.run) break;
      expect(l.run.access!.cards).toHaveLength(1);
      seen.push(l.run.access!.cards[0]!.cardId!);
      await tap(page, runButtonOf(l, /^(Steal|Leave it|Done)$/).box);
    }
    expect(seen).toHaveLength(3);
  });

  // Seed 14: the Corp opens with Neural EMP and Ice Wall; the Runner with Inside Job.
  test('Neural EMP before any run: "Only after the Runner made a run", nothing spent', async ({ page }) => {
    await openBoard(page, 14);
    const before = await getView(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    const l = await pickCard(page, 'Neural EMP');
    expect(targetOf(l, 'play')).toMatchObject({ label: 'Play · 2 credits', lit: false, reject: 'condition_not_met' });
    const m = await measureTap(page, targetOf(l, 'play').box);
    expect(m.events).toEqual([{ type: 'action_rejected', reason: 'condition_not_met' }]);
    expect(m.view).toEqual(before);
    expect(m.anims.map((a) => [a.kind, a.text])).toEqual([['hint', 'Only after the Runner made a run']]);
  });

  test('Inside Job: pick a server; the first rezzed ICE met is bypassed. Then Neural EMP does 1 net damage', async ({ page }) => {
    await openBoard(page, 14);
    // Corp: Ice Wall in front of HQ, then end the turn (5 cards: no discard).
    await page.evaluate(() => {
      const hook = window.__overclock!;
      const v = hook.getView();
      const i = v.players.corp.hand!.indexOf('c05');
      const o = v.handOptions[i]!.find((x) => x.action.type === 'install' && x.action.server === 'hq')!;
      hook.dispatch(o.action);
      hook.dispatch({ type: 'end_turn', player: 'corp' });
    });
    await waitIdle(page);
    expect((await getView(page)).viewer).toBe('runner');
    let l = await pickCard(page, 'Inside Job');
    expect(l.targets.map((t) => [t.kind, t.server, t.label])).toEqual(['hq', 'rd', 'archives'].map((s) => ['play', s, 'Play · 2 credits']));
    await tap(page, targetOf(l, 'play', 'hq').box);
    l = await waitIdle(page);
    expect(l.run).toMatchObject({ server: 'hq', step: 'approach', deciding: 'corp' });
    expect(l.run!.lines).toContain('Inside Job: next ICE bypassed');
    const m = await measureTap(page, runButtonOf(l, /^Rez /).box);
    expect(m.events.map((e) => e.type)).toEqual(expect.arrayContaining(['ice_rezzed', 'ice_bypassed']));
    expect(m.events.some((e) => e.type === 'subroutine_fired')).toBe(false);
    expect(m.anims.find((a) => a.kind === 'notice')?.text).toBe('Inside Job: ICE bypassed');
    l = await waitIdle(page);
    // Past the Ice Wall without breaking it: Continue / Jack out, then into HQ.
    expect(l.run).toMatchObject({ step: 'continue', stepLabel: 'Passed Ice Wall' });
    await tap(page, runButtonOf(l, 'Continue').box);
    l = await waitIdle(page);
    expect(l.run?.step).toBe('access');
    await tap(page, runButtonOf(l, /^(Steal|Leave it|Done)$/).box);
    await waitIdle(page);
    // Next Corp turn: Neural EMP works now.
    await passTurn(page);
    const grip = (await getView(page)).players.runner.handCount;
    const e = await pickCard(page, 'Neural EMP');
    expect(targetOf(e, 'play')).toMatchObject({ lit: true, reject: null });
    const d = await measureTap(page, targetOf(e, 'play').box);
    expect(d.events.map((x) => x.type)).toEqual(['credits_spent', 'card_played', 'net_damage']);
    expect(d.view.players.runner.handCount).toBe(grip - 1);
    expectSnappy(d, ['net_damage']);
    expect(d.anims.find((a) => a.kind === 'notice')?.text).toBe('1 net damage');
  });

  test('no card in either starter deck says "Needs runs (coming soon)"', async ({ page }) => {
    for (const seed of [2, 5, 14, 18]) {
      await openBoard(page, seed);
      for (const side of ['corp', 'runner'] as const) {
        if (side === 'runner') await toRunnerTurn(page);
        await page.evaluate(() => window.__overclock!.clearAnims());
        const view = await getView(page);
        expect(view.handOptions.flat().some((o) => o.reject === 'not_implemented')).toBe(false);
        const hand = (await layout(page)).hand;
        for (let i = 0; i < hand.length; i++) {
          await tap(page, (await layout(page)).hand[i]!.box);
          await tap(page, (await layout(page)).hand[i]!.box); // tap again: cancel
        }
        const texts = (await anims(page)).map((a) => a.text ?? '');
        expect(texts.some((t) => t.includes('Needs runs'))).toBe(false);
        expect((await layout(page)).labels.some((t) => t.includes('Needs runs'))).toBe(false);
      }
    }
  });
});
