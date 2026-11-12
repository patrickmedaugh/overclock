// S-02-1 (hide a card in a new server) and S-02-2 (ICE in front of a server),
// tapped on screen: pick a hand card, the engine's offered spots light up with
// prices, tap one to install. Runner-side hiding checked on the Runner's turn.
import { getCard } from '@overclock/cards';
import type { Action, PlayerView } from '@overclock/engine';
import { type Page, expect, test } from '@playwright/test';
import {
  type LayoutSnapshot,
  dispatch,
  expectCleanLayout,
  expectCleanTable,
  expectSnappy,
  findSeed,
  getView,
  inside,
  layout,
  measureTap,
  openBoard,
  pick,
  planTo,
  pressAndHold,
  replayOnPage,
  tap,
  typeOf,
  waitIdle,
} from './helpers';

const isContent = (id: string) => typeOf(id) === 'agenda' || typeOf(id) === 'asset';
const indexWhere = (hand: readonly string[], pred: (id: string) => boolean, from = 0) => hand.findIndex((id, i) => i >= from && pred(id));

// Opening Corp hand with two agendas/assets, the upgrade and two ICE.
const SEED = findSeed((corp) => corp.filter(isContent).length >= 2 && corp.some((id) => typeOf(id) === 'upgrade') && corp.filter((id) => typeOf(id) === 'ice').length >= 2);

function corpHand(v: PlayerView): readonly string[] {
  return v.players.corp.hand ?? [];
}

function target(l: LayoutSnapshot, label: string) {
  const t = l.targets.find((x) => x.label === label);
  expect(t, `target "${label}" in ${JSON.stringify(l.targets.map((x) => x.label))}`).toBeDefined();
  return t!;
}

/** Ends the Corp's turn (discarding the last cards over the limit) so the Runner looks at the board. */
async function passToRunner(page: Page): Promise<void> {
  await dispatch(page, { type: 'end_turn', player: 'corp' });
  const v = await getView(page);
  if (v.pendingDiscard > 0) {
    const n = v.players.corp.handCount;
    await dispatch(page, { type: 'discard', player: 'corp', handIndices: Array.from({ length: v.pendingDiscard }, (_, k) => n - v.pendingDiscard + k) });
  }
  await waitIdle(page);
  expect((await getView(page)).activePlayer).toBe('runner');
}

test.describe('S-02-1 Corp: hide a card in a new server', () => {
  test('an agenda or asset lights New server only; tapping it installs face down into Server 1, then Server 2, for one click and no credits', async ({ page }) => {
    await openBoard(page, SEED);
    const v0 = await getView(page);
    const i = indexWhere(corpHand(v0), isContent);
    const id = corpHand(v0)[i]!;
    let l = await pick(page, i);
    expect(l.hand[i]!.selected).toBe(true);
    // No remotes yet, and agendas/assets never go into HQ, R&D or Archives.
    expect(l.targets.map((t) => t.label)).toEqual(['New server · free']);

    const m = await measureTap(page, target(l, 'New server · free').box);
    expect(m.events.map((e) => e.type)).toEqual(['server_created', 'card_installed']);
    expect(m.view.corpServers.map((s) => s.id)).toEqual(['hq', 'rd', 'archives', 'remote1']);
    expect(m.view.corpServers[3]!.content.map((c) => c.cardId)).toEqual([id]);
    expect(m.view.players.corp.clicks).toBe(v0.players.corp.clicks - 1);
    expect(m.view.players.corp.credits).toBe(v0.players.corp.credits);
    expect(m.view.players.corp.handCount).toBe(v0.players.corp.handCount - 1);
    expectSnappy(m, ['install_flight', 'server_open']);

    l = await waitIdle(page);
    expect(l.targets).toEqual([]);
    const s1 = l.servers.find((s) => s.id === 'remote1')!;
    expect(s1.label).toBe('Server 1');
    expect(s1.content).toHaveLength(1);
    expect(s1.content[0]!.faceUp).toBe(false); // face down on the table
    expect(inside(s1.content[0]!.box, s1.box)).toBe(true);
    expectCleanLayout(l);
    expectCleanTable(l);

    // The next agenda/asset: Server 1 is taken (one per server), so New server again -> Server 2.
    const v1 = await getView(page);
    const j = indexWhere(corpHand(v1), isContent);
    l = await pick(page, j);
    expect(l.targets.map((t) => t.label)).toEqual(['New server · free']);
    await tap(page, target(l, 'New server · free').box);
    l = await waitIdle(page);
    expect(l.servers.map((s) => s.label)).toEqual(['HQ', 'R&D', 'Archives', 'Server 1', 'Server 2']);
    expect((await getView(page)).corpServers[4]!.content).toHaveLength(1);
  });

  test('an upgrade can go into any server, the three built-in ones included', async ({ page }) => {
    await openBoard(page, SEED);
    // Server 1 with an agenda first (through the hook), then the upgrade by tapping.
    const v0 = await getView(page);
    await dispatch(page, { type: 'install', player: 'corp', handIndex: indexWhere(corpHand(v0), isContent), server: 'new' });
    const v1 = await getView(page);
    const u = indexWhere(corpHand(v1), (id) => typeOf(id) === 'upgrade');
    const l = await pick(page, u);
    expect(l.targets.map((t) => t.label)).toEqual(['HQ · free', 'R&D · free', 'Archives · free', 'Server 1 · free', 'New server · free']);
    await tap(page, target(l, 'HQ · free').box);
    await waitIdle(page);
    const v2 = await getView(page);
    expect(v2.corpServers[0]!.content.map((c) => c.cardId)).toEqual([corpHand(v1)[u]]);
    expect(v2.players.corp.clicks).toBe(v1.players.corp.clicks - 1);
  });

  test('tapping the card again, or an empty part of the board, puts it back: nothing installed, no click used', async ({ page }) => {
    await openBoard(page, SEED);
    const before = await getView(page);
    const i = indexWhere(corpHand(before), isContent);
    let l = await pick(page, i);
    expect(l.targets.length).toBeGreaterThan(0);
    await tap(page, l.hand[i]!.box);
    l = await layout(page);
    expect(l.targets).toEqual([]);
    expect(l.hand.every((h) => !h.selected)).toBe(true);
    expect(await getView(page)).toEqual(before);

    // Empty board: below the Runner's memory counter (no card or spot there yet).
    l = await pick(page, i);
    const empty = { x: l.memory.box.x + l.memory.box.width - 30, y: l.memory.box.y + l.memory.box.height + 20, width: 4, height: 4 };
    for (const t of l.targets) expect(inside(empty, t.box)).toBe(false);
    await tap(page, empty);
    l = await layout(page);
    expect(l.targets).toEqual([]);
    expect(await getView(page)).toEqual(before);
  });

  test('holding a card in a server zooms it face up for the Corp', async ({ page }) => {
    await openBoard(page, SEED);
    const v0 = await getView(page);
    const i = indexWhere(corpHand(v0), isContent);
    const id = corpHand(v0)[i]!;
    await dispatch(page, { type: 'install', player: 'corp', handIndex: i, server: 'new' });
    const l = await waitIdle(page);
    const card = l.servers.find((s) => s.id === 'remote1')!.content[0]!;
    expect(card.cardId).toBe(id);
    const release = await pressAndHold(page, card.box);
    await page.waitForFunction((cid) => window.__overclock!.layout().zoom?.cardId === cid, id);
    const z = (await layout(page)).zoom!;
    expect(z.texts).toContain(getCard(id)!.name);
    expect(z.texts).toContain(getCard(id)!.text);
    await release();
    await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
  });

  test("on the Runner's turn, installed Corp cards are card backs, the Runner's view never has their names, and holding one shows nothing", async ({ page }) => {
    await openBoard(page, SEED);
    const v0 = await getView(page);
    const i = indexWhere(corpHand(v0), isContent);
    const hidden = corpHand(v0)[i]!;
    await dispatch(page, { type: 'install', player: 'corp', handIndex: i, server: 'new' });
    const v1 = await getView(page);
    await dispatch(page, { type: 'install', player: 'corp', handIndex: indexWhere(corpHand(v1), (id) => typeOf(id) === 'ice'), server: 'remote1' });
    await passToRunner(page);
    const v = await getView(page);
    const r1 = v.corpServers.find((s) => s.id === 'remote1')!;
    expect([...r1.ice, ...r1.content].every((c) => c.cardId === null && !c.faceUp)).toBe(true);
    // Not anywhere in what the Runner's side of the game got (the uid is all it knows).
    const json = JSON.stringify(v);
    expect(json).toContain(r1.content[0]!.uid);
    expect(v.players.corp.discard.filter((d) => d !== null)).not.toContain(hidden);
    expect(json.split(`"${hidden}"`).length - 1).toBe(0);
    expect(JSON.stringify(await page.evaluate(() => window.__overclock!.lastEvents()))).not.toContain(`"${hidden}"`);

    const l = await layout(page);
    const s1 = l.servers.find((s) => s.id === 'remote1')!;
    for (const c of [...s1.ice, ...s1.content]) {
      expect(c.cardId).toBeNull();
      expect(c.faceUp).toBe(false);
    }
    const release = await pressAndHold(page, s1.content[0]!.box);
    await page.waitForTimeout(600);
    expect((await layout(page)).zoom).toBeNull();
    await release();
  });
});

/** The Corp spends its credits on ICE in HQ until the next ICE there costs more than it has. */
function planIceUnaffordable(): { seed: number; actions: Action[] } {
  const iceOpt = (v: PlayerView, server: string) =>
    v.handOptions.flatMap((list, i) => list.map((o) => ({ o, id: corpHand(v)[i] ?? '' }))).find(({ o, id }) => typeOf(id) === 'ice' && o.action.type === 'install' && o.action.server === server);
  for (let seed = 1; seed < 200; seed++) {
    try {
      const actions = planTo(
        seed,
        (v) => {
          if (v.viewer !== 'corp') return null;
          const hq = iceOpt(v, 'hq');
          if (hq && hq.o.reject === null) return hq.o.action;
          if (v.players.corp.deckCount > 3) return { type: 'draw', player: 'corp' };
          return null;
        },
        (v) => v.viewer === 'corp' && v.phase === 'action' && v.players.corp.clicks > 0 && iceOpt(v, 'hq')?.o.reject === 'no_credits',
      );
      return { seed, actions };
    } catch {
      // try the next seed
    }
  }
  throw new Error('no seed reaches unaffordable ICE');
}

test.describe('S-02-2 Corp: ICE in front of a server', () => {
  test('ICE lights every server with its price; the first ICE on a server is free, the next costs 1 and goes on the outside', async ({ page }) => {
    await openBoard(page, SEED);
    const v0 = await getView(page);
    const i = indexWhere(corpHand(v0), (id) => typeOf(id) === 'ice');
    let l = await pick(page, i);
    expect(l.targets.map((t) => t.label)).toEqual(['HQ · free', 'R&D · free', 'Archives · free', 'New server · free']);

    const m = await measureTap(page, target(l, 'HQ · free').box);
    expect(m.view.corpServers[0]!.ice).toHaveLength(1);
    expect(m.view.players.corp.credits).toBe(v0.players.corp.credits);
    expect(m.view.players.corp.clicks).toBe(v0.players.corp.clicks - 1);
    expectSnappy(m, ['install_flight']);
    l = await waitIdle(page);
    const first = l.servers[0]!.ice[0]!;
    expect(first.faceUp).toBe(false);
    // Drawn sideways.
    expect(first.drawn.width).toBeGreaterThan(first.drawn.height);

    const v1 = await getView(page);
    const j = indexWhere(corpHand(v1), (id) => typeOf(id) === 'ice');
    l = await pick(page, j);
    expect(l.targets.map((t) => t.label)).toEqual(['HQ · 1 credit', 'R&D · free', 'Archives · free', 'New server · free']);
    const m2 = await measureTap(page, target(l, 'HQ · 1 credit').box);
    expect(m2.events[0]).toEqual({ type: 'credits_spent', player: 'corp', amount: 1 });
    expect(m2.view.players.corp.credits).toBe(v1.players.corp.credits - 1);
    expectSnappy(m2, ['install_flight', 'credit_pop']);
    l = await waitIdle(page);
    const [inner, outer] = l.servers[0]!.ice;
    expect(outer!.uid).toBe((m2.events.find((e) => e.type === 'card_installed') as { uid: string }).uid);
    // The Corp is at the bottom: outside = further up, toward the Runner.
    expect(outer!.box.y).toBeLessThan(inner!.box.y);
    expect(l.text.corpCredits).toBe(String(v1.players.corp.credits - 1));
  });

  test('a server you cannot afford shows only "Not enough credits" and nothing changes', async ({ page }) => {
    const plan = planIceUnaffordable();
    await openBoard(page, plan.seed);
    await replayOnPage(page, plan.actions);
    const before = await getView(page);
    const i = before.handOptions.findIndex((list, k) => typeOf(corpHand(before)[k]) === 'ice' && list.some((o) => o.reject === 'no_credits'));
    const cost = before.handOptions[i]!.find((o) => o.action.type === 'install' && o.action.server === 'hq')!.cost;
    expect(cost).toBeGreaterThan(before.players.corp.credits);
    const l = await pick(page, i);
    const hq = target(l, `HQ · ${cost} credits`);
    expect(hq.reject).toBe('no_credits');
    const m = await measureTap(page, hq.box);
    expect(m.events).toEqual([{ type: 'action_rejected', reason: 'no_credits' }]);
    expect(m.view).toEqual(before);
    expect(m.anims.find((a) => a.kind === 'hint')?.text).toBe('Not enough credits');
    expect(m.anims.some((a) => a.kind === 'install_flight')).toBe(false);
    // The card stays picked, so another spot can be tapped.
    expect((await layout(page)).targets.length).toBeGreaterThan(0);
  });

  test("on the Runner's turn you see how many ICE guard each server, only as card backs", async ({ page }) => {
    await openBoard(page, SEED);
    for (const server of ['hq', 'hq'] as const) {
      const v = await getView(page);
      await dispatch(page, { type: 'install', player: 'corp', handIndex: indexWhere(corpHand(v), (id) => typeOf(id) === 'ice'), server });
    }
    await passToRunner(page);
    const l = await layout(page);
    expect(l.servers[0]!.ice).toHaveLength(2);
    for (const c of l.servers[0]!.ice) {
      expect(c.cardId).toBeNull();
      expect(c.faceUp).toBe(false);
    }
    // The Runner is at the bottom now: the outer ICE is the lower one (toward the Runner).
    expect(l.servers[0]!.ice[1]!.box.y).toBeGreaterThan(l.servers[0]!.ice[0]!.box.y);
  });
});
