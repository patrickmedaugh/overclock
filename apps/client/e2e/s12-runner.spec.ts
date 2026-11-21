// Sprint 12 (U4, S-12-3 / S-12-4): Kate's new cards.
// - Modded: picked, every program / hardware in the Grip lights with its install price from the
//   engine ("5 credits (−4)": Modded's 3 off plus Kate's 1 on her first install); a tap installs
//   it (the lit card shows the price; the help column says to tap it to install). With none in the Grip it is dimmed and says "No program or hardware in your Grip".
// - The Toolbox: memory +2, link +2, 2 credits on it; its credits pay icebreakers ("The Toolbox pays").
// - Infiltration (S-15-6: while held): "Gain 2 credits" and every face-down card it can expose light at once;
//   Corp card; a tap shows that card over its place until tapped away. It stays face down.
// 45-card decks (the default). 640x360 and 891x296 screenshots go to docs/sprints/sprint-12-screens/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCard } from '@overclock/cards';
import { type Page, expect, test } from '@playwright/test';
import type { InstalledSnapshot, LayoutSnapshot } from '../src/hook-types';
import { getView, inside, layout, openBoard, overlaps, pickHand, safeRect, tap, targetOf, toStep, waitIdle } from './helpers';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-12-screens');
const TOOLBOX = 'r19';

async function shot(page: Page, name: string): Promise<void> {
  const p = test.info().project.name;
  const save = p === 'phone-small' || p === 'phone-short';
  if (save) mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot(save ? { path: join(SHOTS, `${name}-${p === 'phone-small' ? '640x360' : '891x296'}.png`) } : {});
  await test.info().attach(name, { body, contentType: 'image/png' });
}

function installedIn(l: LayoutSnapshot, uid: string): InstalledSnapshot | undefined {
  return [...l.servers.flatMap((s) => [...s.ice, ...s.content]), ...l.rig].find((x) => x.uid === uid);
}

function expectThumb(l: LayoutSnapshot, b: { x: number; y: number; width: number; height: number }, what: string): void {
  expect(Math.min(b.width, b.height), `${what}: thumb-size`).toBeGreaterThanOrEqual(44);
  expect(inside(b, safeRect(l)), `${what}: on screen`).toBe(true);
}

/**
 * QA-S12-1: each lit Grip card's price pill sits on its own card, clear of the card's name
 * (and of every other Grip card's name), with readable text, so you can tell which card it prices.
 */
async function expectPricesClearOfNames(page: Page, l: LayoutSnapshot): Promise<void> {
  const grip = l.targets.filter((t) => t.kind === 'grip');
  expect(grip.length).toBeGreaterThan(0);
  const names = await Promise.all(
    l.hand.map(async (h) => {
      const f = await page.evaluate(([id, w, hh]) => window.__overclock!.smallFace(id, w, hh), [h.cardId, h.box.width, h.box.height] as const);
      const cx = h.box.x + h.box.width / 2;
      const cy = h.box.y + h.box.height / 2;
      return { ...f!.name, x: cx + f!.name.x, y: cy + f!.name.y, text: f!.nameText };
    }),
  );
  for (const t of grip) {
    const what = `price "${t.label}" on ${names[t.index!]!.text}`;
    expect(t.pill.width * t.pill.height, `${what}: drawn`).toBeGreaterThan(0);
    expect(inside(t.pill, t.box), `${what}: inside its target`).toBe(true);
    expect(t.pillFontPx, `${what}: readable (10 px label floor)`).toBeGreaterThanOrEqual(10);
    for (const [i, n] of names.entries()) expect(overlaps(t.pill, n), `${what} clear of the name of Grip card ${i} (${n.text})`).toBe(false);
  }
}

test.describe('S-12-3 Modded and The Toolbox', () => {
  test('Modded lights each Grip program / hardware with its price; tapping The Toolbox installs it 4 cheaper (3 + Kate 1), no extra click: memory +2, link +2, 2 credits on it', async ({ page }) => {
    const seed = 3;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'modded_ready');
    expect(plan.info['cardId']).toBe(TOOLBOX);
    const before = await getView(page);
    let l = await pickHand(page, Number(plan.info['handIndex']));
    // One lit Grip card per engine option (Grip order), with the engine's price and discount.
    const options = before.handOptions[Number(plan.info['handIndex'])]!;
    const grip = l.targets.filter((t) => t.kind === 'grip');
    expect(grip.map((t) => t.index)).toEqual(options.map((o) => (o.action.type === 'play' ? o.action.installIndex : -1)));
    for (const [k, o] of options.entries()) {
      const off = o.discount ? ` (−${o.discount})` : '';
      expect(grip[k]!.label).toBe(`${o.cost === 0 ? 'free' : `${o.cost} ${o.cost === 1 ? 'credit' : 'credits'}`}${off}`);
      expect(grip[k]!.lit).toBe(o.reject === null);
      // On the Grip card it installs.
      expect(overlaps(grip[k]!.box, l.hand[grip[k]!.index!]!.box)).toBe(true);
      // The card's own box (widened to 44 px about its middle where hand cards are narrower).
      const hb = l.hand[grip[k]!.index!]!.box;
      const gb = grip[k]!.box;
      expect(Math.abs(gb.x + gb.width / 2 - (hb.x + hb.width / 2))).toBeLessThan(0.6);
      expect(gb.width).toBe(Math.max(hb.width, 44));
      expect(gb.y + gb.height).toBeCloseTo(hb.y + hb.height, 0);
      if (k > 0) expect(overlaps(gb, grip[k - 1]!.box), 'Grip targets apart').toBe(false);
    }
    await expectPricesClearOfNames(page, l);
    const toolbox = grip.find((t) => t.index === Number(plan.info['installIndex']))!;
    expect(toolbox).toMatchObject({ label: `${plan.info['cost']} credits (−${plan.info['discount']})`, lit: true });
    await page.waitForFunction(() => window.__overclock!.layout().hint === null);
    expect((await layout(page)).text.help).toContain('Let go on a lit card in your Grip to install it');
    expect(plan.info['discount']).toBe('4');
    expect(l.hand[toolbox.index!]!.cardId).toBe(TOOLBOX);
    expectThumb(l, toolbox.box, 'Toolbox target');
    expect(l.hand[Number(plan.info['handIndex'])]!.selected).toBe(true);
    await shot(page, 's12-3-modded-grip');

    await tap(page, toolbox.box);
    await page.waitForFunction(() => window.__overclock!.getView().rig.some((c) => c.cardId === 'r19'));
    l = await waitIdle(page);
    const v = await getView(page);
    expect(v.players.runner.clicks, 'only Modded\'s own click').toBe(before.players.runner.clicks - 1);
    expect(v.players.runner.credits).toBe(before.players.runner.credits - Number(plan.info['cost']));
    expect(v.memory.limit).toBe(before.memory.limit + 2);
    expect(v.players.runner.link).toBe(before.players.runner.link + 2);
    const tb = v.rig.find((c) => c.cardId === TOOLBOX)!;
    expect(tb.hostedCredits).toBe(2);
    const drawn = installedIn(l, tb.uid)!;
    expect(drawn.hosted).toMatchObject({ text: '2', icon: 'coin' });
    expect(l.memory.text).toContain(`/${v.memory.limit}`);
    expect(l.runnerStatus.link!.text).toBe(`Link ${v.players.runner.link}`);
    expect(l.targets.filter((t) => t.kind === 'grip')).toEqual([]);
    await shot(page, 's12-3-toolbox-installed');
  });

  test('QA-S12-1: with two Magnum Opus and Cyberfeeder in the Grip (seed 203), every price label leaves its card name readable', async ({ page }) => {
    const seed = 203;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'modded_ready');
    const l = await pickHand(page, Number(plan.info['handIndex']));
    const grip = l.targets.filter((t) => t.kind === 'grip');
    const named = grip.map((t) => getCard(l.hand[t.index!]!.cardId)?.name);
    expect(named.filter((n) => n === 'Magnum Opus')).toHaveLength(2);
    expect(named).toContain('Cyberfeeder');
    for (const t of grip) expectThumb(l, t.box, `Grip target ${t.index}`);
    await expectPricesClearOfNames(page, l);
    await shot(page, 's12-3-modded-grip-prices');
  });

  test('no program or hardware in the Grip: Modded is dimmed and says why', async ({ page }) => {
    const seed = 1;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'modded_no_target');
    // S-15-6: held up it lifts dimmed (nothing lit) and says why.
    const l = await pickHand(page, Number(plan.info['handIndex']));
    expect(l.targets).toEqual([]);
    // Said at the lift (read from the log: the toast may have faded on a slow runner).
    expect((await page.evaluate(() => window.__overclock!.anims())).filter((a) => a.kind === 'hint').map((a) => a.text)).toContain('No program or hardware in your Grip');
    await shot(page, 's12-3-modded-no-target');
  });

  test('The Toolbox pays for icebreakers: the break / pump buttons say "The Toolbox pays"', async ({ page }) => {
    const seed = 1;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'toolbox_encounter');
    const l = await waitIdle(page);
    const v = await getView(page);
    const paid = v.run!.options.filter((o) => (o.hostedPay ?? []).some((p) => p.uid === plan.info['toolboxUid']));
    expect(paid.length, 'the engine lets The Toolbox pay a breaker').toBeGreaterThan(0);
    for (const o of paid) expect(o.action.type === 'use_ability' && o.action.uid === plan.info['breakerUid']).toBe(true);
    const labels = l.run!.buttons.map((b) => b.fullLabel ?? b.label);
    expect(labels.some((t) => t.includes('The Toolbox pays')), labels.join(' | ')).toBe(true);
    // Never on anything but a breaker's buttons.
    for (const b of l.run!.buttons) if ((b.fullLabel ?? b.label).includes('Toolbox')) expect(b.source).toBe(getCard(v.rig.find((c) => c.uid === plan.info['breakerUid'])!.cardId!)!.id);
    await shot(page, 's12-3-toolbox-pays');
  });
});

test.describe('S-12-4 Infiltration', () => {
  test('two buttons; Expose lights the face-down Corp cards; the exposed card shows until tapped away and stays face down', async ({ page }) => {
    const seed = 1;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'infiltration_ready');
    const hand = Number(plan.info['handIndex']);
    const before = await getView(page);
    // S-15-6: while Infiltration is held, "Gain 2 credits" and every card it can expose light at once
    // (letting go on a card exposes it; the separate "Expose 1 card" step is gone).
    let l = await pickHand(page, hand);
    const gain = targetOf(l, 'play');
    expect(gain).toMatchObject({ label: 'Gain 2 credits', lit: true });
    expectThumb(l, gain.box, 'Gain 2 credits');
    expect(l.targets.some((t) => t.kind === 'expose_open')).toBe(false);
    // One lit card per engine option (each face-down installed Corp card).
    const offered = before.handOptions[hand]!.flatMap((o) => (o.action.type === 'play' && o.action.uid !== undefined ? [o.action.uid] : []));
    const lit = l.targets.filter((t) => t.kind === 'expose');
    expect(lit.map((t) => t.uid)).toEqual(offered);
    for (const t of lit) {
      const c = installedIn(l, t.uid!)!;
      expect(c.faceUp).toBe(false);
      expect(t.box).toEqual(c.box);
      expect(t).toMatchObject({ label: 'Expose', lit: true });
      expect(overlaps(gain.box, t.box)).toBe(false);
    }
    await shot(page, 's12-4-infiltration-modes');

    await tap(page, l.targets.find((t) => t.kind === 'expose' && t.uid === plan.info['uid'])!.box);
    await page.waitForFunction(() => window.__overclock!.layout().exposed !== null);
    l = await waitIdle(page);
    const v = await getView(page);
    expect(l.exposed).toMatchObject({ uid: plan.info['uid'], cardId: plan.info['cardId'], caption: 'Exposed · tap to hide' });
    expectThumb(l, l.exposed!.box, 'exposed card');
    // Still face down: no rez, the Runner's view still has no id for it.
    const still = v.corpServers.flatMap((s) => [...s.ice, ...s.content]).find((c) => c.uid === plan.info['uid'])!;
    expect(still).toMatchObject({ cardId: null, faceUp: false });
    expect(v.players.runner.credits).toBe(before.players.runner.credits);
    expect(v.players.runner.clicks).toBe(before.players.runner.clicks - 1);
    await shot(page, 's12-4-exposed');

    // A tap hides it (and does nothing else).
    const sent = (await page.evaluate(() => window.__overclock!.sent())).length;
    await tap(page, l.exposed!.box);
    await page.waitForFunction(() => window.__overclock!.layout().exposed === null);
    expect((await page.evaluate(() => window.__overclock!.sent())).length).toBe(sent);
  });

  test('Gain 2 credits: one tap, +2', async ({ page }) => {
    const seed = 2;
    await openBoard(page, { seed, decks: 'core45' });
    const plan = await toStep(page, seed, 'infiltration_ready');
    const before = await getView(page);
    const l = await pickHand(page, Number(plan.info['handIndex']));
    await tap(page, targetOf(l, 'play').box);
    await page.waitForFunction((c) => window.__overclock!.getView().players.runner.credits === c, before.players.runner.credits + 2);
    expect((await layout(page)).exposed).toBeNull();
  });
});
