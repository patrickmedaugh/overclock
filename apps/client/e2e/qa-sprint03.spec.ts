// QA (Sprint 3) extra checks, written independently of the UI developer's specs:
// - Hidden info (S-03-1 AC7, S-03-3 AC1): through a whole run the Runner seat's view
//   never names an unrezzed ICE or any other face-down Corp card; only what is
//   face up, accessed or rezzed.
// - S-03-3 AC6: two ICE on one server are met outside-in, the one met is highlighted.
// - S-03-4 AC1: the most crowded encounter (Enigma vs Gordian Blade: 4 buttons) fits
//   on every size, and breaking both subroutines passes the ICE.
// - S-03-1 AC2/AC3: Archives with several cards (two agendas) shows them all at once,
//   inside the screen and clear of the buttons; each agenda is stolen by name.
// - S-03-3 AC5: Neural Katana let through with 2 cards in the Grip: "Corp wins" /
//   "Runner flatlined", played with real taps.
// - S-03-2 AC1: the agenda stays picked after Advance (a second Advance is one tap).
// - Run notices are toasts: they never block a tap and never cover a button.
// - During access nothing behind the large cards can be tapped by accident.
// - Playthrough screenshots at 2x pixel density, saved to docs/sprints/sprint-03-qa/.
import { fileURLToPath } from 'node:url';
import { getCard } from '@overclock/cards';
import type { Action, PlayerView } from '@overclock/engine';
import { expect, test, type Page } from '@playwright/test';
import {
  type Box,
  dispatch,
  expectCleanLayout,
  expectSnappy,
  getView,
  layout,
  measureTap,
  openBoard,
  overlaps,
  inside,
  safeRect,
  runButtonOf,
  startRun,
  tap,
  targetOf,
  toRunnerTurn,
  toStep,
  waitIdle,
  dismissReport,
} from './helpers';

test.use({ deviceScaleFactor: 2 });

const SHOTS = fileURLToPath(new URL('../../../docs/sprints/sprint-03-qa/', import.meta.url));
const PREFIX: Record<string, string> = {
  phone: 'phone-844x390',
  'phone-small': 'phone-640x360',
  desktop: 'desktop-1280x800',
};

async function shot(page: Page, name: string): Promise<void> {
  // Only with QA_SCREENS=1, so a normal e2e run leaves the committed PNGs alone.
  if (process.env.QA_SCREENS !== '1') return;
  const p = PREFIX[test.info().project.name] ?? test.info().project.name;
  await page.screenshot({ path: `${SHOTS}${p}-${name}.png` });
}

const CORP_ID = /"c\d\d"/g;

/**
 * The Runner's view with every place a Corp card may legitimately be named removed
 * (face-up Archives entries, score areas, face-up installed cards, the cards being
 * accessed, a rezzed current ICE). Whatever is left must not name a Corp card.
 */
function leftover(v: PlayerView): string[] {
  const faceUp = new Set(v.corpServers.flatMap((s) => [...s.ice, ...s.content]).filter((c) => c.faceUp).map((c) => c.uid));
  const rest = {
    ...v,
    players: { corp: { ...v.players.corp, discard: [], scored: [] }, runner: { ...v.players.runner, scored: [] } },
    corpServers: v.corpServers.map((s) => ({ ...s, ice: s.ice.filter((c) => !faceUp.has(c.uid)), content: s.content.filter((c) => !faceUp.has(c.uid)) })),
    run: v.run
      ? { ...v.run, access: null, ice: v.run.iceUid && faceUp.has(v.run.iceUid) ? null : v.run.ice }
      : null,
  };
  return JSON.stringify(rest).match(CORP_ID) ?? [];
}

/** Hand index of `cardId` in the bottom seat's hand. */
async function handIndex(page: Page, cardId: string): Promise<number> {
  const i = (await getView(page)).players[(await getView(page)).viewer].hand!.indexOf(cardId);
  expect(i, `${cardId} in hand`).toBeGreaterThanOrEqual(0);
  return i;
}

async function corpInstallIce(page: Page, cardId: string, server: string): Promise<void> {
  const v = await getView(page);
  const i = v.players.corp.hand!.indexOf(cardId);
  expect(i, `${cardId} in the Corp's hand`).toBeGreaterThanOrEqual(0);
  const o = v.handOptions[i]!.find((x) => x.action.type === 'install' && x.action.server === server && x.reject === null);
  expect(o, `${cardId} can be installed on ${server}`).toBeDefined();
  const ev = await dispatch(page, o!.action);
  expect(ev.find((e) => e.type === 'action_rejected')).toBeUndefined();
}

async function ok(page: Page, a: Action): Promise<void> {
  const ev = await dispatch(page, a);
  expect(ev.find((e) => e.type === 'action_rejected'), JSON.stringify(a)).toBeUndefined();
}

function iceBox(l: Awaited<ReturnType<typeof layout>>, server: string, uid: string): Box {
  return l.servers.find((s) => s.id === server)!.ice.find((c) => c.uid === uid)!.box;
}

test.describe('QA hidden info during a run', () => {
  test('the Runner seat never receives the name of an unrezzed ICE or any face-down Corp card, at any step', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'corp_rez_prompt');
    const corpRun = (await page.evaluate(() => window.__overclock!.decision()))!.run;
    const iceId = corpRun.ice!.cardId!;
    expect(iceId).toMatch(/^c\d\d$/);
    // At the rez prompt.
    let v = await getView(page);
    expect(v.viewer).toBe('runner');
    expect(v.run!.ice?.cardId ?? null).toBeNull();
    expect(leftover(v)).toEqual([]);
    expect(JSON.stringify(v.corpServers)).not.toContain(`"${iceId}"`);
    // The screen shows the name only in the Corp's own Rez button (Q1 A), nowhere else.
    let l = await layout(page);
    const name = getCard(iceId)!.name;
    expect(l.labels.filter((t) => t.includes(name)).every((t) => t.startsWith('Rez ') || t.includes('rez'))).toBe(true);
    // Don't rez, Continue, access, Done: still nothing.
    await tap(page, runButtonOf(l, "Don't rez").box);
    l = await waitIdle(page);
    v = await getView(page);
    expect(leftover(v)).toEqual([]);
    expect(JSON.stringify(v.corpServers)).not.toContain(`"${iceId}"`);
    expect(l.labels.some((t) => t.includes(name))).toBe(false);
    await tap(page, runButtonOf(l, 'Continue').box);
    l = await waitIdle(page);
    v = await getView(page);
    expect(leftover(v)).toEqual([]);
    while (l.run) {
      await tap(page, runButtonOf(l, /^(Steal|Leave it|Done)/).box);
      l = await waitIdle(page);
      expect(leftover(await getView(page))).toEqual([]);
    }
    // The ICE stays face down and unnamed for the rest of the turn.
    const ice = l.servers.find((s) => s.id === plan.info.server)!.ice.find((c) => c.uid === plan.info.iceUid)!;
    expect(ice).toMatchObject({ faceUp: false, cardId: null });
  });
});

test.describe('QA S-03-3 AC6: two ICE, outside-in', () => {
  test('the outer ICE is approached first and highlighted, then the inner one, then the server', async ({ page }) => {
    // Seed 2: the Corp opens with Enigma and Neural Katana.
    await openBoard(page, 2);
    await corpInstallIce(page, 'c06', 'hq'); // Enigma, inner (free)
    await corpInstallIce(page, 'c07', 'hq'); // Neural Katana, outer (1 credit)
    await ok(page, { type: 'end_turn', player: 'corp' });
    await waitIdle(page);
    let l = await layout(page);
    const [inner, outer] = l.servers.find((s) => s.id === 'hq')!.ice;
    expect(l.servers.find((s) => s.id === 'hq')!.ice).toHaveLength(2);
    l = await startRun(page, 'hq');
    expect(l.run).toMatchObject({ step: 'approach', deciding: 'corp', iceUid: outer!.uid });
    expect(l.run!.highlight).toEqual(iceBox(l, 'hq', outer!.uid));
    expect(l.run!.buttons.map((b) => b.label)).toEqual(['Rez Neural Katana · 4 credits', "Don't rez"]);
    expectCleanLayout(l);
    await shot(page, '01-two-ice-outer-approached');
    await tap(page, runButtonOf(l, "Don't rez").box);
    l = await waitIdle(page);
    expect(l.run).toMatchObject({ step: 'continue', iceUid: outer!.uid });
    expect(l.run!.lines).toContain('Next: 1 more ICE');
    await tap(page, runButtonOf(l, 'Continue').box);
    l = await waitIdle(page);
    expect(l.run).toMatchObject({ step: 'approach', deciding: 'corp', iceUid: inner!.uid });
    expect(l.run!.highlight).toEqual(iceBox(l, 'hq', inner!.uid));
    expect(l.run!.highlight).not.toEqual(iceBox(l, 'hq', outer!.uid));
    expect(l.run!.buttons.map((b) => b.label)).toEqual(['Rez Enigma · 3 credits', "Don't rez"]);
    await shot(page, '02-two-ice-inner-approached');
    await tap(page, runButtonOf(l, "Don't rez").box);
    l = await waitIdle(page);
    expect(l.run).toMatchObject({ step: 'continue', iceUid: inner!.uid });
    expect(l.run!.lines).toContain('Next: HQ');
    await tap(page, runButtonOf(l, 'Continue').box);
    l = await waitIdle(page);
    expect(l.run).toMatchObject({ step: 'access', server: 'hq' });
    expect(l.run!.highlight).toEqual(l.run!.serverBox);
  });
});

test.describe('QA S-03-4: the most crowded encounter', () => {
  test('Enigma vs Gordian Blade: 2 breaks, +1 strength and Let it through all fit; breaking both passes the ICE', async ({ page }) => {
    await openBoard(page, 2);
    await corpInstallIce(page, 'c06', 'hq'); // Enigma
    await ok(page, { type: 'end_turn', player: 'corp' });
    await waitIdle(page);
    await ok(page, { type: 'install', player: 'runner', handIndex: await handIndex(page, 'r05') }); // Gordian Blade, 4 credits
    await ok(page, { type: 'gain_credit', player: 'runner' });
    await waitIdle(page);
    let l = await startRun(page, 'hq');
    await tap(page, runButtonOf(l, /^Rez Enigma/).box);
    l = await waitIdle(page);
    expect(l.run).toMatchObject({ step: 'encounter', deciding: 'runner', stepLabel: 'Encounter: Enigma' });
    expect(l.run!.lines).toEqual(['Strength 2', 'Gordian Blade 2']);
    expect(l.run!.buttons.map((b) => [b.label, b.lit])).toEqual([
      ['Break "The Runner loses 1 click, if able" · 1 credit', true],
      ['Break "End the run" · 1 credit', true],
      ['+1 strength · 1 credit', true],
      ['Let it fire: lose 1 click, run ends', true],
    ]);
    for (const b of l.run!.buttons) expect(Math.min(b.box.width, b.box.height), b.label).toBeGreaterThanOrEqual(44);
    // Every button and the info panel are inside the safe area and clear of each other.
    expectCleanLayout(l);
    for (const b of l.run!.buttons) expect(overlaps(b.box, l.run!.infoBox), `${b.label} vs info`).toBe(false);
    expect(inside(l.run!.infoBox, safeRect(l))).toBe(true);
    await shot(page, '03-enigma-vs-gordian-4-buttons');
    const credits = (await getView(page)).players.runner.credits;
    let m = await measureTap(page, runButtonOf(l, /^Break "The Runner loses/).box);
    expect(m.events.map((e) => e.type)).toEqual(['credits_spent', 'subroutine_broken']);
    expectSnappy(m, ['sub_broken']);
    l = await waitIdle(page);
    expect(l.run!.subroutines).toEqual([
      { text: 'The Runner loses 1 click, if able', broken: true },
      { text: 'End the run', broken: false },
    ]);
    expect(l.run!.buttons.map((b) => b.label)).toEqual(['Break "End the run" · 1 credit', '+1 strength · 1 credit', 'Let it fire: run ends']);
    await shot(page, '04-enigma-one-sub-crossed-out');
    m = await measureTap(page, runButtonOf(l, /^Break "End the run"/).box);
    expect(m.events.map((e) => e.type)).toEqual(expect.arrayContaining(['subroutine_broken', 'ice_passed']));
    expect(m.view.players.runner.credits).toBe(credits - 2);
    l = await waitIdle(page);
    expect(l.run).toMatchObject({ step: 'continue', stepLabel: 'Passed Enigma' });
    // Nothing fired: no click lost.
    expect((await getView(page)).players.runner.clicks).toBe(m.view.players.runner.clicks);
  });
});

test.describe('QA S-03-1 Archives with several cards', () => {
  test('four cards at once, two agendas stolen by name, all inside the screen and clear of the buttons', async ({ page }) => {
    test.setTimeout(60_000);
    // Find a seed whose Corp holds at least two agendas after drawing 3.
    let seed = 0;
    for (let s = 1; s <= 30 && !seed; s++) {
      await openBoard(page, s);
      for (let i = 0; i < 3; i++) await ok(page, { type: 'draw', player: 'corp' });
      const hand = (await getView(page)).players.corp.hand!;
      if (hand.filter((id) => getCard(id)!.type === 'agenda').length >= 2) seed = s;
    }
    expect(seed).toBeGreaterThan(0);
    await ok(page, { type: 'end_turn', player: 'corp' });
    const hand = (await getView(page)).players.corp.hand!;
    const agendas = hand.map((id, i) => [id, i] as const).filter(([id]) => getCard(id)!.type === 'agenda').slice(0, 2).map(([, i]) => i);
    const others = hand.map((_, i) => i).filter((i) => !agendas.includes(i)).slice(0, 2);
    const discarded = [...agendas, ...others].map((i) => hand[i]!);
    await ok(page, { type: 'discard', player: 'corp', handIndices: [...agendas, ...others] });
    await waitIdle(page);
    expect((await getView(page)).players.corp.discard).toEqual([null, null, null, null]);
    let l = await startRun(page, 'archives');
    expect(l.run).toMatchObject({ server: 'archives', step: 'access', stepLabel: 'Access: 4 cards' });
    expect(l.run!.access!.cards.map((c) => c.cardId).sort()).toEqual([...discarded].sort());
    const names = discarded.slice(0, 2).map((id) => getCard(id)!.name);
    // Agendas must be stolen first (one named Steal each); no Done yet, nothing trashable.
    expect(l.run!.buttons.map((b) => b.label).sort()).toEqual(names.map((n) => `Steal ${n}`).sort());
    const safe = safeRect(l);
    const cards = l.run!.access!.cards;
    for (const c of cards) {
      expect(inside(c.box, safe), `access card ${c.cardId} ${JSON.stringify(c.box)} inside ${JSON.stringify(safe)}`).toBe(true);
      expect(Math.min(c.box.width, c.box.height), `access card ${c.cardId} at least 44px`).toBeGreaterThanOrEqual(44);
      for (const b of l.run!.buttons) expect(overlaps(c.box, b.box), `access card ${c.cardId} vs ${b.label}`).toBe(false);
      expect(overlaps(c.box, l.run!.infoBox), `access card ${c.cardId} vs run info`).toBe(false);
    }
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) expect(overlaps(cards[i]!.box, cards[j]!.box), `access cards ${i} and ${j}`).toBe(false);
    for (const b of l.run!.buttons) expect(Math.min(b.box.width, b.box.height)).toBeGreaterThanOrEqual(44);
    expectCleanLayout(l);
    await shot(page, '05-archives-four-cards');
    const pts = discarded.slice(0, 2).reduce((n, id) => n + getCard(id)!.agendaPoints!, 0);
    let m = await measureTap(page, l.run!.buttons[0]!.box);
    expect(m.events.map((e) => e.type)).toEqual(['agenda_stolen']);
    expectSnappy(m, ['score_flight']);
    l = await waitIdle(page);
    // The other agenda, still named (3 cards left).
    const first = m.events[0]!.type === 'agenda_stolen' ? m.events[0]!.cardId : '';
    const rest = discarded.slice(0, 2);
    rest.splice(rest.indexOf(first), 1);
    expect(l.run!.buttons.map((b) => b.label)).toEqual([`Steal ${getCard(rest[0]!)!.name}`]);
    await shot(page, '06-archives-one-stolen');
    m = await measureTap(page, l.run!.buttons[0]!.box);
    l = await waitIdle(page);
    // Only non-agendas left: Done.
    expect(l.run!.buttons.map((b) => b.label)).toEqual(['Done']);
    await tap(page, runButtonOf(l, 'Done').box);
    l = await waitIdle(page);
    expect(l.run).toBeNull();
    const v = await getView(page);
    expect(v.players.runner.points).toBe(pts);
    expect(v.players.corp.discard).toHaveLength(2);
    expect(v.players.corp.discard.every((d) => d !== null)).toBe(true);
    expect(l.score.runner.text).toBe(`Runner ${pts} ${pts === 1 ? 'point' : 'points'}`);
  });
});

test.describe('QA S-03-1 a late-game Archives', () => {
  test('twelve cards in Archives are all shown, each at least 44px wide, clear of the buttons', async ({ page }) => {
    test.setTimeout(60_000);
    // QA-S3-1 (fixed): the cards wrap into rows instead of shrinking one row below 44px.
    await openBoard(page, 1);
    // Three Corp turns of "draw 3, discard 4"; the Runner just passes.
    for (let t = 0; t < 3; t++) {
      for (let i = 0; i < 3; i++) await ok(page, { type: 'draw', player: 'corp' });
      await ok(page, { type: 'end_turn', player: 'corp' });
      await ok(page, { type: 'discard', player: 'corp', handIndices: [0, 1, 2, 3] });
      if (t < 2) {
        await ok(page, { type: 'end_turn', player: 'runner' });
        const v = await getView(page);
        if (v.pendingDiscard > 0) await ok(page, { type: 'discard', player: 'runner', handIndices: Array.from({ length: v.pendingDiscard }, (_, k) => k) });
      }
    }
    await waitIdle(page);
    const v = await getView(page);
    expect(v.viewer).toBe('runner');
    expect(v.players.corp.discardCount).toBe(12);
    const l = await startRun(page, 'archives');
    const cards = l.run!.access!.cards;
    expect(cards).toHaveLength(12);
    const widths = cards.map((c) => Math.round(c.box.width));
    test.info().annotations.push({ type: 'access-card-widths', description: JSON.stringify({ widths, viewport: l.viewport }) });
    await shot(page, '12-archives-twelve-cards');
    const safe = safeRect(l);
    for (const c of cards) {
      expect(inside(c.box, safe), `access card inside the safe area`).toBe(true);
      for (const b of l.run!.buttons) expect(overlaps(c.box, b.box), `access card vs ${b.label}`).toBe(false);
    }
    for (let i = 1; i < cards.length; i++) expect(overlaps(cards[i - 1]!.box, cards[i]!.box)).toBe(false);
    expect(Math.min(...widths), 'each Archives card at least 44px wide').toBeGreaterThanOrEqual(44);
  });
});

test.describe('QA S-03-3 AC5: flatline', () => {
  test('Neural Katana let through with 2 cards in the Grip: "Corp wins" / "Runner flatlined"', async ({ page }) => {
    // Seed 8: the Corp opens with Neural Katana; the Runner can install 3 cards first.
    await openBoard(page, 8);
    await corpInstallIce(page, 'c07', 'hq');
    await ok(page, { type: 'end_turn', player: 'corp' });
    await waitIdle(page);
    for (let i = 0; i < 3; i++) await ok(page, { type: 'install', player: 'runner', handIndex: 0 });
    let v = await getView(page);
    expect(v.players.runner.handCount).toBe(2);
    expect(v.players.runner.clicks).toBe(1);
    let l = await startRun(page, 'hq');
    await tap(page, runButtonOf(l, /^Rez Neural Katana/).box);
    l = await waitIdle(page);
    expect(l.run!.subroutines).toEqual([{ text: 'Do 3 net damage', broken: false }]);
    await shot(page, '07-neural-katana-encounter');
    const m = await measureTap(page, runButtonOf(l, /^Let it fire/).box);
    expect(m.events.map((e) => e.type)).toEqual(expect.arrayContaining(['subroutine_fired', 'net_damage', 'game_over']));
    // S-05-2: the game-over screen shows once the ICE's message is tapped away.
    await waitIdle(page);
    await dismissReport(page);
    l = await waitIdle(page);
    expect(l.gameOver).toMatchObject({ title: 'Corp wins', reason: 'Runner flatlined' });
    v = await getView(page);
    expect(v.result).toMatchObject({ winner: 'corp', reason: 'flatline' });
    expect(v.players.runner.handCount).toBe(0);
    expectCleanLayout(l);
    await page.waitForTimeout(300);
    await shot(page, '08-corp-wins-runner-flatlined');
  });
});

test.describe('QA S-03-2 AC1: the agenda stays picked', () => {
  test('after Advance the agenda is still picked: a second Advance is one tap; tapping it again drops the pick', async ({ page }) => {
    // Corp's first turn: an agenda into a new server (1 click), then two advances (2 clicks).
    await openBoard(page, 1);
    const v0 = await getView(page);
    const i = v0.players.corp.hand!.findIndex((id) => getCard(id)!.type === 'agenda');
    expect(i).toBeGreaterThanOrEqual(0);
    const cardId = v0.players.corp.hand![i]!;
    await ok(page, { type: 'install', player: 'corp', handIndex: i, server: 'new' });
    let l = await waitIdle(page);
    const uid = l.servers.flatMap((s) => s.content)[0]!.uid;
    const card = () => layout(page).then((x) => x.servers.flatMap((s) => s.content).find((c) => c.uid === uid)!);
    await tap(page, (await card()).box);
    l = await layout(page);
    expect(l.selectedInstalled).toBe(uid);
    await tap(page, targetOf(l, 'advance').box);
    l = await waitIdle(page);
    expect(l.selectedInstalled, 'still picked after the first Advance').toBe(uid);
    expect((await card()).counter).toBe('1');
    const m = await measureTap(page, targetOf(l, 'advance').box);
    expect(m.events.map((e) => e.type)).toEqual(['credits_spent', 'card_advanced']);
    expect(m.view.players.corp.clicks).toBe(0);
    expectSnappy(m, ['advance_pop']);
    l = await waitIdle(page);
    expect((await card()).counter).toBe('2');
    expect(l.selectedInstalled).toBe(uid);
    const need = getCard(cardId)!.advancementRequirement!;
    // Score shows only once the agenda has enough counters.
    expect(l.targets.map((t) => t.kind)).toEqual(need <= 2 ? ['advance', 'score'] : ['advance']);
    expectCleanLayout(l);
    await shot(page, '09-agenda-still-picked-after-advance');
    await tap(page, (await card()).box);
    l = await layout(page);
    expect(l.selectedInstalled).toBeNull();
    expect(l.targets).toEqual([]);
  });
});

test.describe('QA run notices and input', () => {
  // S-05-2 (owner answer A) replaced the Sprint 3 toast: the message now stays until a tap,
  // that tap only closes it, and the next tap acts at once.
  test('"Wall of Static ended your run." stays until a tap; that tap only closes it; the next tap (Run) answers at once', async ({ page }) => {
    await openBoard(page, 2);
    await toStep(page, 2, 'wall_of_static_encounter');
    await tap(page, runButtonOf(await layout(page), /^Let it fire/).box);
    await page.waitForFunction(() => window.__overclock!.layout().report !== null, undefined, { polling: 'raf' });
    let l = await layout(page);
    expect(l.run).toBeNull();
    expect(l.report?.text).toBe('Wall of Static ended your run.');
    expect(inside(l.report!.box, safeRect(l))).toBe(true);
    await shot(page, '10-end-the-run-notice');
    // The first tap on Run only closes the message.
    await tap(page, l.runButton!.box);
    l = await layout(page);
    expect(l.report).toBeNull();
    expect(l.runButton?.picking).toBe(false);
    // The next tap on Run lights the servers inside the same tap.
    const t0 = await page.evaluate(() => performance.now());
    await tap(page, l.runButton!.box);
    const after = await layout(page);
    const t1 = await page.evaluate(() => performance.now());
    expect(after.runButton?.picking).toBe(true);
    expect(after.targets.length).toBeGreaterThanOrEqual(3);
    test.info().annotations.push({ type: 'run-after-notice', description: `${Math.round(t1 - t0)}ms round trip` });
  });

  test('jack out shows a notice and leaves a clean board', async ({ page }) => {
    await openBoard(page, 1);
    await toStep(page, 1, 'corp_rez_prompt');
    let l = await layout(page);
    await tap(page, runButtonOf(l, "Don't rez").box);
    l = await waitIdle(page);
    const m = await measureTap(page, runButtonOf(l, 'Jack out').box);
    expectSnappy(m, []);
    expect(m.anims.find((a) => a.kind === 'notice')?.text).toMatch(/jack/i);
    l = await layout(page);
    expectCleanLayout(l);
  });

  test('during access, taps on whatever the large cards cover (End turn, banner, hand strip) change nothing', async ({ page }) => {
    await openBoard(page, 1);
    await toRunnerTurn(page);
    const before = await layout(page);
    const l = await startRun(page, 'hq');
    const v = await getView(page);
    const covered = l.run!.access!.cards.map((c) => c.box);
    await shot(page, '11-access-hq-large-card');
    // Tap the spots of End turn, the Run button and the first hand card as they were before the run.
    const spots: [string, Box | undefined][] = [
      ['End turn', before.endTurn?.box],
      ['Run button', before.runButton?.box],
      ['hand card 0', before.hand[0]?.box],
    ];
    const coveredNames: string[] = [];
    for (const [n, b] of spots) {
      if (!b) continue;
      if (covered.some((c) => overlaps(c, b))) coveredNames.push(n);
      await tap(page, b);
      await waitIdle(page);
      const now = await getView(page);
      expect(now.run, `${n}: still in the run`).not.toBeNull();
      expect(now.players.runner.clicks, `${n}: no click spent`).toBe(v.players.runner.clicks);
      expect(now.activePlayer).toBe('runner');
    }
    test.info().annotations.push({ type: 'covered-by-access', description: coveredNames.join(', ') || 'none' });
    expect((await layout(page)).run?.step).toBe('access');
  });
});
