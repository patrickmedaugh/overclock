// S-02-1 (Corp: hide a card in a new server) and S-02-2 (Corp: ICE in front of a server).
import { getCard } from '@overclock/cards';
import { expect, test } from '@playwright/test';
import {
  emptySpot,
  expectSnappy,
  getView,
  handIndexByName,
  layout,
  measureTap,
  openBoard,
  passTurn,
  pickCard,
  pressAndHold,
  tap,
  targetOf,
  waitIdle,
} from './helpers';

// Seed 2: the Corp opens with Private Security Force, Hostile Takeover (agendas),
// Akitaro Watanabe (upgrade), Anonymous Tip and two Hedge Funds.
// Seed 9: the Corp opens with four ICE (Ice Wall x2, Enigma, Wall of Static).

test.describe('S-02-1 Corp: hide a card in a new server', () => {
  test('tapping an agenda lights only New server (agendas go in remotes), with its price', async ({ page }) => {
    await openBoard(page, 2);
    const l = await pickCard(page, 'Hostile Takeover');
    expect(l.targets.map((t) => t.kind)).toEqual(['new_server']);
    expect(l.targets[0]).toMatchObject({ label: 'Install · free', lit: true, reject: null });
    for (const t of l.targets) expect(Math.min(t.box.width, t.box.height)).toBeGreaterThanOrEqual(44);
    expect(l.labels).toContain('New server');
    await test.info().attach('agenda picked', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('tapping New server slides the card face down into "Server 1": one click, no credits, quick', async ({ page }) => {
    await openBoard(page, 2);
    const before = await getView(page);
    const l = await pickCard(page, 'Hostile Takeover');
    const m = await measureTap(page, targetOf(l, 'new_server').box);
    expect(m.events.map((e) => e.type)).toEqual(['server_created', 'card_installed']);
    expect(m.view.players.corp.clicks).toBe(before.players.corp.clicks - 1);
    expect(m.view.players.corp.credits).toBe(before.players.corp.credits);
    expectSnappy(m, ['install_flight', 'server_open']);
    const after = await waitIdle(page);
    const s1 = after.servers.find((s) => s.id === 'remote1')!;
    expect(s1.label).toBe('Server 1');
    expect(s1.content).toHaveLength(1);
    // Face down on the table; the Corp's own view still knows what it is.
    expect(s1.content[0]).toMatchObject({ faceUp: false, cardId: 'c08' });
    expect(after.targets).toEqual([]);
    expect(after.selected).toBeNull();
    expect(after.hand).toHaveLength(before.players.corp.handCount - 1);

    // The next one is Server 2.
    const l2 = await pickCard(page, 'Private Security Force');
    await tap(page, targetOf(l2, 'new_server').box);
    const after2 = await waitIdle(page);
    expect(after2.servers.map((s) => s.label)).toEqual(['HQ', 'R&D', 'Archives', 'Server 1', 'Server 2']);
  });

  test('one agenda or asset per server; upgrades go in any server, HQ, R&D and Archives included', async ({ page }) => {
    await openBoard(page, 2);
    let l = await pickCard(page, 'Hostile Takeover');
    await tap(page, targetOf(l, 'new_server').box);
    await waitIdle(page);
    // Server 1 holds an agenda now: not offered for the other agenda.
    l = await pickCard(page, 'Private Security Force');
    expect(l.targets.map((t) => t.server)).toEqual(['new']);
    await tap(page, l.hand[l.selected!]!.box); // cancel
    // The upgrade: every server, plus New server.
    l = await pickCard(page, 'Akitaro Watanabe');
    expect(l.targets.map((t) => t.server)).toEqual(['hq', 'rd', 'archives', 'remote1', 'new']);
    await tap(page, targetOf(l, 'server', 'hq').box);
    const after = await waitIdle(page);
    const hq = after.servers.find((s) => s.id === 'hq')!;
    expect(hq.content).toHaveLength(1);
    expect(hq.content[0]!.cardId).toBe('c11');
    expect((await getView(page)).corpServers[0]!.content).toHaveLength(1);
  });

  test('tapping the card again, or an empty part of the board, cancels: nothing installed, no click used', async ({ page }) => {
    await openBoard(page, 2);
    const before = await getView(page);
    let l = await pickCard(page, 'Hostile Takeover');
    await tap(page, l.hand[l.selected!]!.box);
    l = await layout(page);
    expect(l.selected).toBeNull();
    expect(l.targets).toEqual([]);
    l = await pickCard(page, 'Hostile Takeover');
    await tap(page, emptySpot(l));
    l = await layout(page);
    expect(l.selected).toBeNull();
    expect(l.targets).toEqual([]);
    expect(await getView(page)).toEqual(before);
  });

  test('holding a card in a server zooms it face up for the Corp', async ({ page }) => {
    await openBoard(page, 2);
    const l = await pickCard(page, 'Hostile Takeover');
    await tap(page, targetOf(l, 'new_server').box);
    const after = await waitIdle(page);
    const card = after.servers.find((s) => s.id === 'remote1')!.content[0]!;
    const release = await pressAndHold(page, card.box);
    await page.waitForFunction(() => window.__overclock!.layout().zoom !== null);
    const z = (await layout(page)).zoom!;
    expect(z.cardId).toBe('c08');
    expect(z.texts).toContain(getCard('c08')!.name);
    expect(z.texts).toContain(getCard('c08')!.text);
    await release();
    await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
  });

  test("on the Runner's turn the Corp's installed cards are card backs, and the Runner's view never names them", async ({ page }) => {
    await openBoard(page, 2);
    let l = await pickCard(page, 'Hostile Takeover');
    await tap(page, targetOf(l, 'new_server').box);
    await waitIdle(page);
    l = await pickCard(page, 'Akitaro Watanabe');
    await tap(page, targetOf(l, 'server', 'rd').box);
    await waitIdle(page);
    await passTurn(page);
    const view = await getView(page);
    expect(view.viewer).toBe('runner');
    const json = JSON.stringify(view.corpServers);
    expect(json).not.toContain('c08');
    expect(json).not.toContain('c11');
    const r = await layout(page);
    const installed = r.servers.flatMap((s) => s.content);
    expect(installed).toHaveLength(2);
    for (const c of installed) expect(c).toMatchObject({ cardId: null, faceUp: false });
    expect(r.labels.join(' ')).not.toContain('Hostile Takeover');
    // Holding one shows only a back.
    const release = await pressAndHold(page, installed[0]!.box);
    await page.waitForFunction(() => window.__overclock!.layout().zoom !== null);
    const z = (await layout(page)).zoom!;
    expect(z.cardId).toBeNull();
    expect(z.texts.join(' ')).not.toContain('Hostile Takeover');
    await release();
  });
});

test.describe('S-02-2 Corp: ICE in front of a server', () => {
  test('tapping ICE lights every server and New server, each with its price', async ({ page }) => {
    await openBoard(page, 9);
    const l = await pickCard(page, 'Enigma');
    expect(l.targets.map((t) => [t.kind, t.server, t.label])).toEqual([
      ['server', 'hq', 'Install · free'],
      ['server', 'rd', 'Install · free'],
      ['server', 'archives', 'Install · free'],
      ['new_server', 'new', 'Install · free'],
    ]);
    for (const t of l.targets) expect(t.lit).toBe(true);
  });

  test('first ICE on a server is free; the next costs 1 credit per ICE already there and goes outside', async ({ page }) => {
    await openBoard(page, 9);
    const before = await getView(page);
    let l = await pickCard(page, 'Enigma');
    let m = await measureTap(page, targetOf(l, 'server', 'rd').box);
    expectSnappy(m, ['install_flight']);
    expect(m.view.players.corp.credits).toBe(before.players.corp.credits);
    expect(m.view.players.corp.clicks).toBe(before.players.corp.clicks - 1);
    l = await waitIdle(page);
    let rd = l.servers.find((s) => s.id === 'rd')!;
    expect(rd.ice).toHaveLength(1);
    // Drawn sideways.
    expect(rd.ice[0]!.box.width).toBeGreaterThan(rd.ice[0]!.box.height);

    l = await pickCard(page, 'Wall of Static');
    expect(targetOf(l, 'server', 'rd').label).toBe('Install · 1 credit');
    expect(targetOf(l, 'server', 'hq').label).toBe('Install · free');
    m = await measureTap(page, targetOf(l, 'server', 'rd').box);
    expectSnappy(m, ['install_flight', 'credit_pop']);
    expect(m.view.players.corp.credits).toBe(before.players.corp.credits - 1);
    l = await waitIdle(page);
    rd = l.servers.find((s) => s.id === 'rd')!;
    expect(rd.ice).toHaveLength(2);
    // The new one is outermost: further from R&D (toward the Runner, up the screen for the Corp).
    expect(rd.ice[1]!.box.y).toBeLessThan(rd.ice[0]!.box.y);
    expect(rd.ice.map((c) => c.cardId)).toEqual(['c06', 'c04']);

    l = await pickCard(page, 'Ice Wall');
    expect(targetOf(l, 'server', 'rd').label).toBe('Install · 2 credits');
  });

  test("when you can't afford a server's price, only a small \"Not enough credits\" hint appears", async ({ page }) => {
    await openBoard(page, 9);
    // R&D gets three ICE (0 + 1 + 2 credits: 5 -> 2), then the Runner's turn passes.
    for (const name of ['Enigma', 'Wall of Static', 'Ice Wall']) {
      const l = await pickCard(page, name);
      await tap(page, targetOf(l, 'server', 'rd').box);
      await waitIdle(page);
    }
    expect((await getView(page)).players.corp.credits).toBe(2);
    await passTurn(page);
    await passTurn(page);
    let l = await layout(page);
    expect(l.viewer).toBe('corp');
    handIndexByName(l, 'Ice Wall');
    l = await pickCard(page, 'Ice Wall');
    const rd = targetOf(l, 'server', 'rd');
    expect(rd).toMatchObject({ label: 'Install · 3 credits', lit: false, reject: 'no_credits' });
    const before = await getView(page);
    const m = await measureTap(page, rd.box);
    expect(m.events).toEqual([{ type: 'action_rejected', reason: 'no_credits' }]);
    expect(m.view).toEqual(before);
    const hint = m.anims.find((a) => a.kind === 'hint');
    expect(hint?.text).toBe('Not enough credits');
    expect(hint!.startedAt - m.handledAt).toBeLessThan(100);
    expect(m.anims.filter((a) => a.kind !== 'hint')).toEqual([]);
    // Still picked, so another server can be chosen.
    expect((await layout(page)).selected).not.toBeNull();
  });

  test("on the Runner's turn you see how many ICE guard each server, only as backs", async ({ page }) => {
    await openBoard(page, 9);
    for (const [name, server] of [['Enigma', 'rd'], ['Wall of Static', 'rd'], ['Ice Wall', 'hq']] as const) {
      const l = await pickCard(page, name);
      await tap(page, targetOf(l, 'server', server).box);
      await waitIdle(page);
    }
    await passTurn(page);
    const l = await layout(page);
    expect(l.viewer).toBe('runner');
    expect(l.servers.find((s) => s.id === 'rd')!.ice).toHaveLength(2);
    expect(l.servers.find((s) => s.id === 'hq')!.ice).toHaveLength(1);
    for (const c of l.servers.flatMap((s) => s.ice)) expect(c).toMatchObject({ cardId: null, faceUp: false });
    // ICE sits toward the Runner: below the server for the Runner (Corp on top).
    const rd = l.servers.find((s) => s.id === 'rd')!;
    expect(rd.ice[0]!.box.y).toBeGreaterThan(rd.root!.y);
    expect(rd.ice[1]!.box.y).toBeGreaterThan(rd.ice[0]!.box.y);
  });
});
