// QA (Sprint 3) extra checks, written independently of the UI developer's specs.
// Situations come from QA's own game finder (qa-s03-scenarios.ts: seeded games played
// in Node, replayed through the test hook), not from the team's planToStep.
// - S-03-1 AC2/AC4: a remote server with PAD Campaign: "Trash · 4 credits" / "Leave it";
//   too poor: Trash is dim and only says "Not enough credits".
// - S-03-3 AC1: the Corp can't afford the rez: no question, the ICE is passed face down.
// - S-03-3 AC3: rezzed ICE stays face up for both players on later turns.
// - S-03-3 AC4/AC5: Neural Katana let through: 3 net damage to the Heap; with fewer than
//   3 cards in the Grip the Corp wins at once ("Runner flatlined").
// - S-03-4 AC1/AC2/AC3: Ninja against Neural Katana (prices, dim until strong enough, 4 credits).
// - S-03-4 AC6: Gordian Blade's raised strength is still raised at the second code gate (UI).
// - S-03-2 AC1: Advance with no credits: "Not enough credits", nothing spent; ICE offers no Advance.
// - S-03-5 AC2: Inside Job's bypass waits when the Corp doesn't rez.
// - Snappiness: every run step's tap answers < 100ms, animations <= 600ms, and the next
//   step's buttons are there right after the tap (no waiting for animations).
// - Playthrough screenshots (QA_SCREENS=1 only, so normal runs leave docs untouched)
//   into docs/sprints/sprint-03-qa-pass2/.
import { fileURLToPath } from 'node:url';
import { getCard } from '@overclock/cards';
import type { Action, PlayerView } from '@overclock/engine';
import { type Page, expect, test } from '@playwright/test';
import {
  anims,
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
  type AnimRecord,
  type LayoutSnapshot,
} from './helpers';
import { type Scenario, type Views, findScenario } from './qa-s03-scenarios';

const SHOTS = fileURLToPath(new URL('../../../docs/sprints/sprint-03-qa-pass2/', import.meta.url));
const SAVE = process.env.QA_SCREENS === '1';
const PREFIX: Record<string, string> = {
  phone: 'phone-844x390',
  'phone-small': 'phone-640x360',
  desktop: 'desktop-1280x800',
};

async function shot(page: Page, name: string): Promise<void> {
  if (!SAVE) return;
  const p = PREFIX[test.info().project.name] ?? test.info().project.name;
  await page.screenshot({ path: `${SHOTS}${p}-${name}.png` });
}

const nameOf = (id: string | null | undefined) => (id ? getCard(id)?.name : null);
const costOf = (id: string | null | undefined) => (id ? (getCard(id)?.cost ?? 99) : 99);
const runnerHas = (v: PlayerView, id: string) => v.rig.some((c) => c.cardId === id);

// ---- situations (found once per worker, deterministic) ------------------------------

const SITUATIONS = {
  /** Runner meets a rezzed Neural Katana with 3+ cards in the Grip. */
  katanaBigGrip: (v: Views) => v.runner.run?.step === 'encounter' && v.corp.run?.ice?.cardId === 'c07' && v.runner.players.runner.handCount >= 3,
  /** Runner meets a rezzed Neural Katana with fewer than 3 cards in the Grip. */
  katanaSmallGrip: (v: Views) => v.runner.run?.step === 'encounter' && v.corp.run?.ice?.cardId === 'c07' && v.runner.players.runner.handCount < 3,
  /** Runner meets a rezzed Neural Katana with Ninja installed and 4+ credits. */
  ninjaKatana: (v: Views) =>
    v.runner.run?.step === 'encounter' && v.corp.run?.ice?.cardId === 'c07' && runnerHas(v.runner, 'r06') && v.runner.players.runner.credits >= 4,
  /** Runner accesses PAD Campaign in a remote with 4+ credits. */
  padRich: (v: Views) =>
    v.runner.run?.step === 'access' && v.runner.run.access!.cards.some((c) => c.cardId === 'c03' && c.from === 'remote') && v.runner.players.runner.credits >= 4,
  /** Runner accesses PAD Campaign in a remote with fewer than 4 credits. */
  padPoor: (v: Views) =>
    v.runner.run?.step === 'access' && v.runner.run.access!.cards.some((c) => c.cardId === 'c03' && c.from === 'remote') && v.runner.players.runner.credits < 4,
  /** Runner's turn (action phase, clicks left); some server's outermost ICE is face down and the Corp can't pay for it. */
  cantAffordRez: (v: Views) =>
    v.runner.activePlayer === 'runner' &&
    v.runner.phase === 'action' &&
    v.runner.players.runner.clicks > 0 &&
    v.corp.corpServers.some((s) => {
      const o = s.ice.at(-1);
      return !!o && !o.faceUp && costOf(o.cardId) > v.corp.players.corp.credits;
    }),
  /** Corp's turn, clicks left, 0 credits, an installed agenda. */
  advanceBroke: (v: Views) =>
    v.corp.activePlayer === 'corp' &&
    v.corp.phase === 'action' &&
    v.corp.players.corp.clicks > 0 &&
    v.corp.players.corp.credits === 0 &&
    Object.keys(v.corp.installedOptions).length > 0,
} as const;

/** Gordian Blade at the outer of two Enigmas (the inner one rezzed or affordable), 5+ credits. */
function gordianReached(v: Views): boolean {
  const r = v.corp.run;
  if (r?.step !== 'encounter' || !runnerHas(v.runner, 'r05') || v.runner.players.runner.credits < 5) return false;
  const sv = v.corp.corpServers.find((s) => s.id === r.server)!;
  return sv.ice[r.position]?.cardId === 'c06' && sv.ice.slice(0, r.position).some((c) => c.cardId === 'c06' && (c.faceUp || v.corp.players.corp.credits >= 3));
}

/** Steers the random games toward two Enigmas on HQ and a rich Runner with Gordian Blade. */
function gordianWeigh(a: Action, v: PlayerView, base: number): number {
  const hand = v.players[v.viewer].hand ?? [];
  const twoGates = (v.corpServers.find((s) => s.id === 'hq')?.ice.length ?? 0) >= 2;
  if (v.viewer === 'corp') {
    if (a.type === 'install') return hand[a.handIndex] === 'c06' && a.server === 'hq' ? 20 : 0;
    if (a.type === 'rez') return 50;
    if (a.type === 'pass' && v.run) return 0.01;
    if (a.type === 'draw') return 5;
    if (a.type === 'advance' || a.type === 'play') return 0;
    return base;
  }
  if (v.run) return a.type === 'use_ability' || a.type === 'jack_out' ? 0 : base;
  if (a.type === 'install') return hand[a.handIndex] === 'r05' ? 20 : 0;
  if (a.type === 'run') return a.server === 'hq' && twoGates && v.players.runner.credits >= 6 && runnerHas(v, 'r05') ? 50 : 0;
  if (a.type === 'play') return 0;
  if (a.type === 'gain_credit') return 5;
  return base;
}

const found = new Map<string, Scenario>();
function situation(name: keyof typeof SITUATIONS | 'gordian'): Scenario {
  let s = found.get(name);
  if (!s) {
    s = name === 'gordian' ? findScenario(gordianReached, { tries: 600, maxActions: 700, weigh: gordianWeigh }) : findScenario(SITUATIONS[name], { tries: 2000 });
    found.set(name, s);
  }
  return s;
}

/** Opens the scenario's seed and replays its actions through the hook (each as its own player). */
async function toSituation(page: Page, name: keyof typeof SITUATIONS | 'gordian'): Promise<Scenario> {
  const s = situation(name);
  await openBoard(page, s.seed);
  const rejected = await page.evaluate((actions) => {
    const hook = window.__overclock!;
    for (const a of actions) {
      const r = hook.dispatch(a).find((e) => e.type === 'action_rejected');
      if (r) return JSON.stringify({ a, r });
    }
    return null;
  }, s.actions);
  expect(rejected).toBeNull();
  await waitIdle(page);
  await page.evaluate(() => window.__overclock!.clearAnims());
  return s;
}

function iceBox(l: LayoutSnapshot, uid: string) {
  return l.servers.flatMap((s) => s.ice).find((c) => c.uid === uid)!;
}

// ---- S-03-1: remote access, trash / leave ------------------------------------------------

test.describe('QA S-03-1 a remote server: Trash · 4 credits / Leave it', () => {
  test('PAD Campaign in a remote: "Trash · 4 credits" pays 4 and puts it face up in Archives for both players', async ({ page }) => {
    const s = await toSituation(page, 'padRich');
    const before = await getView(page);
    const l = await layout(page);
    expect(l.viewer).toBe('runner');
    expect(l.run!.access!.cards.map((c) => nameOf(c.cardId))).toContain('PAD Campaign');
    expect(l.run!.buttons.map((b) => [b.label, b.lit])).toEqual([
      ['Trash · 4 credits', true],
      ['Leave it', true],
    ]);
    expectCleanLayout(l);
    await shot(page, 'qa-01-remote-pad-campaign-trash-4');
    const server = s.views.runner.run!.server;
    const m = await measureTap(page, runButtonOf(l, 'Trash · 4 credits').box);
    expect(m.events.map((e) => e.type)).toEqual(expect.arrayContaining(['credits_spent', 'card_trashed']));
    expectSnappy(m, ['trash_flight']);
    const v = await getView(page);
    expect(v.players.runner.credits).toBe(before.players.runner.credits - 4);
    expect(v.players.corp.discard.at(-1)).toBe('c03'); // face up to the Runner
    expect(v.corpServers.find((x) => x.id === server)?.content.some((c) => c.uid === s.views.runner.run!.access!.cards.find((a) => a.cardId === 'c03')!.uid) ?? false).toBe(false);
    await waitIdle(page);
    await shot(page, 'qa-02-pad-campaign-trashed-to-archives');
  });

  test('Leave it: PAD Campaign stays in its server, face down again for the Runner, nothing spent', async ({ page }) => {
    const s = await toSituation(page, 'padRich');
    const uid = s.views.runner.run!.access!.cards.find((a) => a.cardId === 'c03')!.uid!;
    const before = await getView(page);
    const l = await layout(page);
    // Leave it (if it is not the last card, keep pressing the default until the run ends).
    await tap(page, runButtonOf(l, 'Leave it').box);
    for (let i = 0; i < 5; i++) {
      const x = await waitIdle(page);
      if (!x.run) break;
      await tap(page, runButtonOf(x, /^(Steal|Leave it|Done)$/).box);
    }
    const v = await getView(page);
    expect(v.run).toBeNull();
    expect(v.players.runner.credits).toBe(before.players.runner.credits);
    const card = v.corpServers.flatMap((x) => x.content).find((c) => c.uid === uid)!;
    expect(card).toMatchObject({ cardId: null, faceUp: false });
    expect(JSON.stringify(v)).not.toContain('"c03"');
  });

  test('too few credits: Trash · 4 credits is dim and only says "Not enough credits"; Leave it still works', async ({ page }) => {
    await toSituation(page, 'padPoor');
    const before = await getView(page);
    const l = await layout(page);
    const trash = runButtonOf(l, 'Trash · 4 credits');
    expect(trash).toMatchObject({ lit: false, reject: 'no_credits' });
    const m = await measureTap(page, trash.box);
    expect(m.events).toEqual([{ type: 'action_rejected', reason: 'no_credits' }]);
    expect(m.view).toEqual(before);
    expect(m.anims.map((a) => [a.kind, a.text])).toEqual([['hint', 'Not enough credits']]);
    await waitIdle(page);
    await shot(page, 'qa-03-pad-campaign-not-enough-credits');
  });
});

// ---- S-03-3: rez skipped, stays face up, Neural Katana, flatline ---------------------------

test.describe('QA S-03-3 ICE fights back', () => {
  test("the Corp can't afford the rez: no question; the ICE is passed face down and the Runner decides", async ({ page }) => {
    const s = await toSituation(page, 'cantAffordRez');
    const sv = s.views.corp.corpServers.find((x) => {
      const o = x.ice.at(-1);
      return !!o && !o.faceUp && costOf(o.cardId) > s.views.corp.players.corp.credits;
    })!;
    const outer = sv.ice.at(-1)!;
    const corpCredits = s.views.corp.players.corp.credits;
    let l = await layout(page);
    await tap(page, l.runButton!.box);
    const m = await measureTap(page, targetOf(await layout(page), 'run', sv.id).box);
    expect(m.events.map((e) => e.type).slice(0, 3)).toEqual(['run_started', 'ice_approached', 'ice_passed']);
    expect(m.events.some((e) => e.type === 'ice_rezzed')).toBe(false);
    l = await waitIdle(page);
    expect(l.run).toMatchObject({ step: 'continue', deciding: 'runner' });
    expect(l.run!.buttons.map((b) => b.label)).toEqual(['Continue', 'Jack out']);
    expect(l.run!.buttons.some((b) => /Rez/.test(b.label))).toBe(false);
    expect(iceBox(l, outer.uid)).toMatchObject({ faceUp: false, cardId: null });
    expect((await getView(page)).players.corp.credits).toBe(corpCredits);
    expect(await page.evaluate(() => window.__overclock!.decision())).toBeNull();
    await shot(page, 'qa-04-corp-cannot-afford-rez-skipped');
  });

  test('rezzed ICE stays face up for both players on later turns', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'corp_rez_prompt');
    await tap(page, runButtonOf(await layout(page), /^Rez /).box);
    let l = await waitIdle(page);
    await tap(page, runButtonOf(l, 'Let it through').box); // Enigma: lose a click, end the run
    await waitIdle(page);
    await passTurn(page); // Corp's turn
    l = await waitIdle(page);
    expect(l.viewer).toBe('corp');
    expect(iceBox(l, plan.info.iceUid!)).toMatchObject({ faceUp: true, cardId: 'c06' });
    await passTurn(page); // Runner's next turn
    l = await waitIdle(page);
    expect(l.viewer).toBe('runner');
    expect(iceBox(l, plan.info.iceUid!)).toMatchObject({ faceUp: true, cardId: 'c06' });
    // Running there again: no rez question, straight to the encounter.
    await tap(page, l.runButton!.box);
    await tap(page, targetOf(await layout(page), 'run', plan.info.server).box);
    l = await waitIdle(page);
    expect(l.run).toMatchObject({ step: 'encounter', deciding: 'runner', stepLabel: 'Encounter: Enigma' });
  });

  test('Neural Katana let through: 3 net damage sends 3 random Grip cards face up to the Heap', async ({ page }) => {
    await toSituation(page, 'katanaBigGrip');
    const before = await getView(page);
    const l = await layout(page);
    expect(l.run!.stepLabel).toBe('Encounter: Neural Katana');
    expect(l.run!.subroutines).toEqual([{ text: 'Do 3 net damage', broken: false }]);
    await shot(page, 'qa-05-neural-katana-encounter');
    const m = await measureTap(page, runButtonOf(l, 'Let it through').box);
    const dmg = m.events.find((e) => e.type === 'net_damage') as { amount: number; cardIds: string[] } | undefined;
    expect(dmg?.amount).toBe(3);
    expect(dmg?.cardIds).toHaveLength(3);
    expectSnappy(m, ['sub_fired', 'net_damage']);
    const v = await getView(page);
    expect(v.players.runner.handCount).toBe(before.players.runner.handCount - 3);
    expect(v.players.runner.discard.slice(-3)).toEqual(dmg!.cardIds);
    expect(v.result).toBeNull();
    const after = await waitIdle(page);
    expect(after.text.runnerDiscard).toBe(String(v.players.runner.discardCount));
    await shot(page, 'qa-06-neural-katana-3-net-damage');
  });

  test('Neural Katana against a Grip of fewer than 3 cards: the Corp wins at once, "Runner flatlined"', async ({ page }) => {
    await toSituation(page, 'katanaSmallGrip');
    const l = await layout(page);
    const m = await measureTap(page, runButtonOf(l, 'Let it through').box);
    expect(m.events.map((e) => e.type)).toEqual(expect.arrayContaining(['net_damage', 'game_over']));
    expect(m.view.result).toEqual({ winner: 'corp', reason: 'flatline' });
    const after = await waitIdle(page);
    expect(after.gameOver).toMatchObject({ title: 'Corp wins', reason: 'Runner flatlined' });
    expect(after.run).toBeNull();
    expectCleanLayout(after);
    await shot(page, 'qa-07-corp-wins-runner-flatlined');
  });
});

// ---- S-03-4: Ninja, Gordian Blade ----------------------------------------------------------

test.describe('QA S-03-4 icebreakers', () => {
  test('Ninja on Neural Katana: "+5 strength · 3 credits", Break dim until strong enough; 4 credits in all, then passed', async ({ page }) => {
    await toSituation(page, 'ninjaKatana');
    const before = await getView(page);
    let l = await layout(page);
    const BREAK = 'Break "Do 3 net damage" · 1 credit';
    expect(l.run!.lines).toEqual(expect.arrayContaining(['Strength 3', 'Ninja 0']));
    expect(runButtonOf(l, BREAK)).toMatchObject({ lit: false, reject: 'too_weak' });
    expect(runButtonOf(l, '+5 strength · 3 credits')).toMatchObject({ lit: true });
    expect(l.run!.buttons.some((b) => b.label === 'Jack out')).toBe(false);
    expectCleanLayout(l);
    await shot(page, 'qa-08-ninja-vs-neural-katana');
    let m = await measureTap(page, runButtonOf(l, '+5 strength · 3 credits').box);
    expectSnappy(m, ['strength_pop']);
    l = await waitIdle(page);
    expect(l.run!.lines).toContain('Ninja 5');
    m = await measureTap(page, runButtonOf(l, BREAK).box);
    expect(m.events.map((e) => e.type)).toEqual(expect.arrayContaining(['subroutine_broken', 'ice_passed']));
    expectSnappy(m, ['sub_broken']);
    const v = await getView(page);
    expect(v.players.runner.credits).toBe(before.players.runner.credits - 4);
    expect(v.players.runner.handCount).toBe(before.players.runner.handCount);
    l = await waitIdle(page);
    expect(l.run).toMatchObject({ step: 'continue' });
    expect(l.run!.subroutines).toEqual([{ text: 'Do 3 net damage', broken: true }]);
    // Ninja's raised strength dropped back after the ICE.
    expect(v.run!.breakerStrength[v.rig.find((c) => c.cardId === 'r06')!.uid]).toBe(0);
    await shot(page, 'qa-09-ninja-broke-katana');
  });

  test("Gordian Blade's raised strength is still raised at the second code gate in the same run", async ({ page }) => {
    await toSituation(page, 'gordian');
    let l = await layout(page);
    expect(l.run!.stepLabel).toBe('Encounter: Enigma');
    expect(l.run!.lines).toEqual(expect.arrayContaining(['Strength 2', 'Gordian Blade 2']));
    const pump = runButtonOf(l, /strength/);
    expect(pump.label).toBe('+1 strength · 1 credit');
    await tap(page, pump.box);
    l = await waitIdle(page);
    expect(l.run!.lines).toContain('Gordian Blade 3');
    await shot(page, 'qa-10-gordian-pumped-first-enigma');
    // Break both subroutines.
    for (let i = 0; i < 2; i++) {
      await tap(page, runButtonOf(l, /^Break/).box);
      l = await waitIdle(page);
    }
    expect(l.run).toMatchObject({ step: 'continue' });
    await tap(page, runButtonOf(l, 'Continue').box);
    l = await waitIdle(page);
    if (l.run?.step === 'approach') {
      expect(l.run.deciding).toBe('corp');
      await tap(page, runButtonOf(l, /^Rez /).box);
      l = await waitIdle(page);
    }
    expect(l.run).toMatchObject({ step: 'encounter', stepLabel: 'Encounter: Enigma' });
    expect(l.run!.lines).toContain('Gordian Blade 3');
    // Strong enough already: both breaks are lit without another pump.
    for (const b of l.run!.buttons.filter((x) => x.label.startsWith('Break'))) expect(b.lit).toBe(true);
    await shot(page, 'qa-11-gordian-still-3-at-second-enigma');
  });
});

// ---- S-03-2: advance edge cases --------------------------------------------------------------

test.describe('QA S-03-2 advance', () => {
  test('with 0 credits, Advance · 1 credit is dim and only says "Not enough credits"; nothing is spent', async ({ page }) => {
    const s = await toSituation(page, 'advanceBroke');
    const uid = Object.keys(s.views.corp.installedOptions)[0]!;
    const before = await getView(page);
    let l = await layout(page);
    const card = l.servers.flatMap((x) => x.content).find((c) => c.uid === uid)!;
    await tap(page, card.box);
    l = await layout(page);
    const adv = targetOf(l, 'advance');
    expect(adv).toMatchObject({ label: 'Advance · 1 credit', lit: false, reject: 'no_credits' });
    await page.evaluate(() => window.__overclock!.clearAnims());
    const m = await measureTap(page, adv.box);
    expect(m.events).toEqual([{ type: 'action_rejected', reason: 'no_credits' }]);
    expect(m.view).toEqual(before);
    expect(m.anims.map((a) => [a.kind, a.text])).toEqual([['hint', 'Not enough credits']]);
  });

  test('tapping installed ICE or an asset as the Corp shows no Advance (only agendas can be advanced this sprint)', async ({ page }) => {
    const s = await toSituation(page, 'advanceBroke');
    const agendaUids = new Set(Object.keys(s.views.corp.installedOptions));
    const l0 = await layout(page);
    const others = l0.servers.flatMap((x) => [...x.ice, ...x.content]).filter((c) => !agendaUids.has(c.uid));
    for (const c of others.slice(0, 4)) {
      await tap(page, c.box);
      const l = await layout(page);
      expect(l.targets.filter((t) => t.kind === 'advance' || t.kind === 'score'), `${nameOf(c.cardId)} offers no Advance`).toEqual([]);
      await tap(page, c.box);
    }
  });
});

// ---- S-03-5: Inside Job when the Corp doesn't rez -----------------------------------------------

test.describe('QA S-03-5 Inside Job', () => {
  test("Don't rez: the face-down ICE doesn't use up Inside Job's bypass", async ({ page }) => {
    await openBoard(page, 14);
    await page.evaluate(() => {
      const hook = window.__overclock!;
      const v = hook.getView();
      const i = v.players.corp.hand!.indexOf('c05');
      const o = v.handOptions[i]!.find((x) => x.action.type === 'install' && x.action.server === 'hq')!;
      hook.dispatch(o.action);
      hook.dispatch({ type: 'end_turn', player: 'corp' });
    });
    await waitIdle(page);
    let l = await pickCard(page, 'Inside Job');
    await tap(page, targetOf(l, 'play', 'hq').box);
    l = await waitIdle(page);
    await tap(page, runButtonOf(l, "Don't rez").box);
    l = await waitIdle(page);
    expect(l.run).toMatchObject({ step: 'continue' });
    expect(l.run!.lines).toContain('Inside Job: next ICE bypassed');
    expect((await getView(page)).run!.bypassPending).toBe(true);
  });
});

// ---- snappiness: a whole run tapped straight through ----------------------------------------------

test.describe('QA snappiness: run steps', () => {
  test('every run step answers within 100ms, animates within 600ms, and the next buttons are there at once', async ({ page }) => {
    await openBoard(page, 2);
    await toStep(page, 2, 'wall_of_static_encounter');
    // Encounter: +1 strength, Break, then Continue -> access; no waiting for animations between taps.
    // (This server holds only the ICE, so Continue ends the run: nothing to animate; see QA-S3-3.)
    const steps: [RegExp, AnimRecord['kind'][]][] = [
      [/^\+1 strength/, ['strength_pop']],
      [/^Break/, ['sub_broken', 'run_step']],
      [/^Continue$/, []],
    ];
    for (const [label, kinds] of steps) {
      const l = await layout(page); // no waitIdle: tap as soon as the buttons are there
      const m = await measureTap(page, runButtonOf(l, label).box);
      expectSnappy(m, kinds);
      for (const a of m.anims) expect(a.scheduledMs, `${a.kind} scheduled <= 600ms`).toBeLessThanOrEqual(600);
    }
    const l = await layout(page);
    if (l.run) {
      expect(l.run.step).toBe('access');
      const m = await measureTap(page, runButtonOf(l, /^(Steal|Trash|Leave it|Done)/).box);
      expect(Number.isFinite(m.handledAt)).toBe(true);
      expect(m.stateAt - m.handledAt).toBeLessThan(100);
    }
  });

  test('the Corp rez prompt: Rez answers within 100ms and the Runner can act at once', async ({ page }) => {
    await openBoard(page, 1);
    await toStep(page, 1, 'corp_rez_prompt');
    const m = await measureTap(page, runButtonOf(await layout(page), /^Rez /).box);
    expectSnappy(m, ['ice_rez']);
    const l = await layout(page);
    expect(l.run!.buttons.map((b) => b.label)).toEqual(['Let it through']);
    const m2 = await measureTap(page, runButtonOf(l, 'Let it through').box);
    expectSnappy(m2, ['sub_fired']);
    // Step animations <= 600ms; the notice ("Enigma: End the run", ~1.4s) is a toast that never blocks input:
    // the very next tap (Run, while the notice still shows) is answered at once.
    const all = await anims(page);
    expect(all.some((a) => a.kind === 'notice')).toBe(true);
    for (const a of all.filter((x) => x.kind !== 'notice' && x.kind !== 'hint')) expect(a.scheduledMs, a.kind).toBeLessThanOrEqual(600);
    const run = await layout(page);
    expect(run.runButton).not.toBeNull();
    await tap(page, run.runButton!.box);
    const lit = await layout(page);
    expect(lit.runButton?.picking).toBe(true);
    expect(lit.targets.length).toBeGreaterThan(0);
    expect((await anims(page)).some((a) => a.kind === 'notice')).toBe(true);
  });
});

// ---- bugs found by QA (known failures until fixed) -------------------------------------------------

test.describe('QA-S3-3 a successful run with nothing to access ends silently', () => {
  test('Continue into a server that holds only ICE: some notice says the run got in and found nothing', async ({ page }) => {
    test.fail(true, 'QA-S3-3: run_ended{accessed} with no card accessed shows no notice; the run panel just disappears');
    await openBoard(page, 2);
    await toStep(page, 2, 'wall_of_static_encounter');
    await tap(page, runButtonOf(await layout(page), /^\+1 strength/).box);
    await waitIdle(page);
    await tap(page, runButtonOf(await layout(page), /^Break/).box);
    await waitIdle(page);
    const m = await measureTap(page, runButtonOf(await layout(page), 'Continue').box);
    expect(m.events.map((e) => e.type)).toEqual(['run_successful', 'run_ended']);
    expect(m.anims.filter((a) => a.kind === 'notice').length, 'a notice explains the run result').toBeGreaterThan(0);
  });
});

// ---- playthrough screenshots ------------------------------------------------------------------------

test.describe('QA Sprint 3 playthrough (screenshots)', () => {
  test('Run, rez, break, access, steal, score pills, advance, score, win', async ({ page }) => {
    test.skip(!SAVE, 'screenshots only with QA_SCREENS=1');
    test.setTimeout(120_000);
    await openBoard(page, 1);
    await toRunnerTurn(page);
    await shot(page, '01-runner-turn-run-button');
    await tap(page, (await layout(page)).runButton!.box);
    await waitIdle(page);
    await shot(page, '02-run-servers-lit');
    await tap(page, targetOf(await layout(page), 'run', 'rd').box);
    await waitIdle(page);
    await shot(page, '03-access-rd-agenda-steal');
    await tap(page, runButtonOf(await layout(page), 'Steal').box);
    await waitIdle(page);
    await shot(page, '04-runner-2-points');
    await tap(page, (await layout(page)).runButton!.box);
    await tap(page, targetOf(await layout(page), 'run', 'hq').box);
    await waitIdle(page);
    await shot(page, '05-access-hq-done');

    await openBoard(page, 1);
    await toStep(page, 1, 'corp_rez_prompt');
    await shot(page, '06-corp-rez-prompt');
    await tap(page, runButtonOf(await layout(page), "Don't rez").box);
    await waitIdle(page);
    await shot(page, '07-dont-rez-continue-jack-out');

    await openBoard(page, 2);
    await toStep(page, 2, 'wall_of_static_encounter');
    await shot(page, '08-encounter-wall-of-static-break-dim');
    await tap(page, runButtonOf(await layout(page), /strength/).box);
    await waitIdle(page);
    await shot(page, '09-corroder-raised-break-lit');
    await tap(page, runButtonOf(await layout(page), /^Break/).box);
    await waitIdle(page);
    await shot(page, '10-subroutine-crossed-out-passed');

    await openBoard(page, 2);
    await toStep(page, 2, 'wall_of_static_encounter');
    await tap(page, runButtonOf(await layout(page), 'Let it through').box);
    await page.waitForTimeout(150);
    await shot(page, '11-let-it-through-end-the-run-notice');

    await openBoard(page, 1);
    const adv = await toStep(page, 1, 'agenda_one_advance');
    await tap(page, (await layout(page)).servers.flatMap((s) => s.content).find((c) => c.uid === adv.info.uid)!.box);
    await waitIdle(page);
    await shot(page, '12-corp-advance-1-credit');
    await tap(page, targetOf(await layout(page), 'advance').box);
    await waitIdle(page);
    await shot(page, '13-corp-score-button');

    await openBoard(page, 1);
    const st = await toStep(page, 1, 'runner_one_steal_from_win');
    await tap(page, (await layout(page)).runButton!.box);
    await tap(page, targetOf(await layout(page), 'run', st.info.server).box);
    await waitIdle(page);
    await tap(page, runButtonOf(await layout(page), 'Steal').box);
    await waitIdle(page);
    await shot(page, '14-runner-wins-7-points');

    await openBoard(page, 2);
    await toRunnerTurn(page);
    await pickCard(page, "The Maker's Eye");
    await tap(page, targetOf(await layout(page), 'play').box);
    await waitIdle(page);
    await shot(page, '15-makers-eye-first-of-3');
  });
});
