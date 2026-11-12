// S-02-5 (a busy board fits on a phone, real words and cards) and S-02-6 (landscape phones:
// desktop unchanged, a Sprint 1 turn played sideways).
import { fileURLToPath } from 'node:url';
import { getCard } from '@overclock/cards';
import { expect, test, type Page } from '@playwright/test';
import {
  type Box,
  type LayoutSnapshot,
  dispatch,
  expectCleanLayout,
  expectSnappy,
  getView,
  layout,
  measureTap,
  openBoard,
  passTurn,
  pickCard,
  pressAndHold,
  safeRect,
  inside,
  tap,
  targetOf,
  toBusyBoard,
  waitEndTurnArmed,
  waitIdle,
} from './helpers';

const SCREENS = fileURLToPath(new URL('../../../docs/sprints/sprint-02-screens/', import.meta.url));
const PHONES = ['phone', 'phone-small'];

async function shoot(page: Page, name: string): Promise<void> {
  const project = test.info().project.name;
  const body = await page.screenshot();
  await test.info().attach(name, { body, contentType: 'image/png' });
  if (PHONES.includes(project)) await page.screenshot({ path: `${SCREENS}${name}-${project}.png` });
}

/** Holds every installed card in turn: each zooms (face up for its owner's view, a back otherwise). */
async function holdEveryCard(page: Page, l: LayoutSnapshot): Promise<void> {
  const cards = [...l.servers.flatMap((s) => [...s.content, ...s.ice]), ...l.rig];
  for (const c of cards) {
    const release = await pressAndHold(page, c.box);
    await page.waitForFunction(() => window.__overclock!.layout().zoom !== null);
    const z = (await layout(page)).zoom!;
    expect(z.cardId, `card ${c.uid} zooms`).toBe(c.cardId);
    expect(inside(z.box, safeRect(l))).toBe(true);
    await release();
    await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
  }
}

function every44(boxes: Box[]): void {
  for (const b of boxes) {
    expect(b.width, JSON.stringify(b)).toBeGreaterThanOrEqual(44);
    expect(b.height, JSON.stringify(b)).toBeGreaterThanOrEqual(44);
  }
}

test.describe('S-02-5 a busy board fits on a phone', () => {
  test('3 servers with 2 ICE each and 4 Runner cards: nothing overlaps, every card can be tapped and held', async ({ page }) => {
    await openBoard(page, 1);
    await toBusyBoard(page, 1);
    // Both sides of the table: as planned, then after the turn passes.
    for (let side = 0; side < 2; side++) {
      const l = await waitIdle(page);
      const remotes = l.servers.filter((s) => s.id.startsWith('remote'));
      expect(remotes.length).toBeGreaterThanOrEqual(3);
      for (const r of remotes.slice(0, 3)) expect(r.ice).toHaveLength(2);
      expect(l.rig).toHaveLength(4);
      expectCleanLayout(l);
      // The whole board is on one screen: no page scrolling.
      expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([l.viewport.width, l.viewport.height]);
      every44([...l.servers.flatMap((s) => [s.box, ...s.content.map((c) => c.box), ...s.ice.map((c) => c.box)]), ...l.rig.map((c) => c.box), l[l.viewer].deck, l[l.viewer].credits, l.endTurn!.box, ...l.hand.map((h) => h.box)]);
      await shoot(page, `busy-board-${l.viewer}-view`);
      await holdEveryCard(page, l);
      if (side === 0) await passTurn(page);
    }
  });

  test('with a card picked on the busy board, every lit server fits and shows its price', async ({ page }) => {
    await openBoard(page, 1);
    await toBusyBoard(page, 1);
    expect((await layout(page)).viewer).toBe('corp');
    // Seed 1's Corp holds Akitaro Watanabe (an upgrade: any server, or a new one).
    const l = await pickCard(page, 'Akitaro Watanabe');
    expect(l.targets.map((t) => t.server)).toEqual([...l.servers.map((s) => s.id), 'new']);
    for (const t of l.targets) {
      expect(inside(t.box, safeRect(l))).toBe(true);
      expect(t.label).toBe('Install · free');
    }
    every44(l.targets.map((t) => t.box));
    await shoot(page, 'busy-board-upgrade-picked');
  });

  test('installs and plays answer in under 0.1s and animate within 0.6s (snappiness)', async ({ page }) => {
    await openBoard(page, 2);
    let l = await pickCard(page, 'Hostile Takeover');
    expectSnappy(await measureTap(page, targetOf(l, 'new_server').box), ['install_flight', 'server_open']);
    await waitIdle(page);
    l = await pickCard(page, 'Akitaro Watanabe');
    expectSnappy(await measureTap(page, targetOf(l, 'server', 'remote1').box), ['install_flight']);
    await waitIdle(page);
    l = await pickCard(page, 'Hedge Fund');
    expectSnappy(await measureTap(page, targetOf(l, 'play').box), ['play_flight', 'credit_pop']);
  });
});

test.describe('S-02-5 real words and real cards', () => {
  test("board labels use the real game's words on both sides", async ({ page }) => {
    await openBoard(page, 2);
    const l = await pickCard(page, 'Hostile Takeover');
    await tap(page, targetOf(l, 'new_server').box);
    const corp = await waitIdle(page);
    const words = (s: LayoutSnapshot) => s.labels.join(' | ');
    for (const w of ['HQ', 'R&D', 'Archives', 'Server 1', 'STACK', 'HEAP', 'MEMORY', 'CREDITS', 'CLICKS', 'End turn', 'cards in HQ', 'cards in Grip']) {
      expect(words(corp), w).toContain(w);
    }
    await passTurn(page);
    const runner = await layout(page);
    expect(words(runner)).toContain('Tap your Stack to draw');
    // Our old placeholder words are gone.
    for (const old of ['DISCARD', 'in hand', 'deck']) {
      expect(words(corp)).not.toContain(old);
      expect(words(runner)).not.toContain(old);
    }
  });

  test('held cards show real core-set names and text; long text fits the zoomed card', async ({ page }) => {
    await openBoard(page, 5); // Runner: Easy Mark, Inside Job, Armitage Codebusting, Bank Job, Diesel
    await toRunnerTurn(page);
    let l = await layout(page);
    for (const h of l.hand) {
      const def = getCard(h.cardId)!;
      const release = await pressAndHold(page, h.box);
      await page.waitForFunction((id) => window.__overclock!.layout().zoom?.cardId === id, h.cardId);
      await page.waitForTimeout(150);
      const z = (await layout(page)).zoom!;
      expect(z.texts).toContain(def.name);
      expect(z.texts).toContain(def.text);
      expect(z.textOverflow, `${def.name}: text fits the card`).toBe(false);
      if (def.name === 'Bank Job') await shoot(page, 'zoom-bank-job');
      await release();
      await page.waitForFunction(() => window.__overclock!.layout().zoom === null);
    }
    // Installed, too.
    l = await pickCard(page, 'Armitage Codebusting');
    await tap(page, targetOf(l, 'install').box);
    l = await waitIdle(page);
    const release = await pressAndHold(page, l.rig[0]!.box);
    await page.waitForFunction(() => window.__overclock!.layout().zoom?.cardId === 'r02');
    expect((await layout(page)).zoom!.textOverflow).toBe(false);
    await release();
  });
});

async function toRunnerTurn(page: Page): Promise<void> {
  await dispatch(page, { type: 'end_turn', player: 'corp' });
  await dispatch(page, { type: 'discard', player: 'corp', handIndices: [5] });
  await waitIdle(page);
}

test.describe('S-02-6 phones sideways, computers unchanged', () => {
  test('phones use the sideways layout; the computer keeps the column, with servers and the Runner row in the middle', async ({ page }) => {
    await openBoard(page, 1);
    await toBusyBoard(page, 1);
    const l = await waitIdle(page);
    const project = test.info().project.name;
    if (PHONES.includes(project)) {
      expect(l.mode).toBe('landscape');
      // The rail: End turn and your credits right of every server.
      const right = Math.max(...l.servers.map((s) => s.box.x + s.box.width));
      expect(l.endTurn!.box.x).toBeGreaterThan(right);
    } else {
      expect(l.mode).toBe('portrait');
      const opp = l.viewer === 'corp' ? 'runner' : 'corp';
      // Opponent row on top, viewer row below, the table in between, hand at the bottom.
      expect(l[opp].credits.y).toBeLessThan(Math.min(...l.servers.map((s) => s.box.y)));
      expect(l[l.viewer].credits.y).toBeGreaterThan(Math.max(...l.rig.map((c) => c.box.y)));
      expect(l.handArea.y).toBeGreaterThan(l[l.viewer].credits.y);
      await shoot(page, 'desktop-busy-board');
      if (project === 'desktop') await page.screenshot({ path: `${SCREENS}busy-board-desktop.png` });
    }
  });

  test('a full Sprint 1 turn sideways: draw, credits, End turn, hand-limit discard, all quick', async ({ page }) => {
    await openBoard(page, 3);
    let l = await layout(page);
    let m = await measureTap(page, l.corp.deck);
    expectSnappy(m, ['draw_flight']);
    l = await waitIdle(page);
    m = await measureTap(page, l.corp.credits);
    expectSnappy(m, ['credit_pop']);
    l = await waitIdle(page);
    m = await measureTap(page, l.corp.deck);
    expectSnappy(m, ['draw_flight']);
    l = await waitIdle(page);
    expect((await getView(page)).players.corp.clicks).toBe(0);
    expect(l.endTurn).toMatchObject({ glowing: true });
    m = await measureTap(page, l.endTurn!.box);
    expect(m.view.pendingDiscard).toBe(3);
    l = await waitIdle(page);
    expect(l.picker?.label).toBe('Discard 3');
    expectCleanLayout(l);
    await shoot(page, 'hand-limit-sideways');
    for (const i of [0, 1, 2]) await tap(page, l.hand[i]!.box);
    l = await layout(page);
    m = await measureTap(page, l.picker!.confirm.box);
    expectSnappy(m, ['discard_flight', 'turn_change']);
    expect(m.view.viewer).toBe('runner');
    l = await waitIdle(page);
    expect(l.text.banner).toBe('TURN 2 · RUNNER · 4 clicks left');
    await waitEndTurnArmed(page);
    m = await measureTap(page, l.endTurn!.box);
    expectSnappy(m, ['turn_change', 'draw_flight']);
    expect(m.view.viewer).toBe('corp');
  });
});
