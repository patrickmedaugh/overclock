// QA (Sprint 2) extra checks, written independently of the UI developer's specs:
// - S-02-1 AC1/AC3: an asset lights New server AND a remote that holds only an upgrade;
//   a remote with an asset is then closed to agendas/assets but open to upgrades.
// - S-02-2 AC1: with remotes opened, ICE lights every server (built-in + opened + New server), each priced.
// - S-02-2 AC3: the 2-credit ICE is really charged 2 and goes outermost.
// - S-02-4 AC4: the Corp's "needs runs" card (Neural EMP) and the Runner's Inside Job also say "Needs runs".
// - Snappiness: picking a hand card lights its targets inside the same tap (< 100ms).
// - Playthrough screenshots at 2x pixel density on 844x390, 640x360, 1280x800, with notch
//   left/right, and an upright phone (rotate prompt), saved to docs/sprints/sprint-02-qa/.
import { fileURLToPath } from 'node:url';
import { getCard } from '@overclock/cards';
import { expect, test, type Page } from '@playwright/test';
import {
  anims,
  expectCleanLayout,
  getView,
  layout,
  measureTap,
  openBoard,
  passTurn,
  pickCard,
  pressAndHold,
  tap,
  targetOf,
  toBusyBoard,
  toRunnerTurn,
  waitIdle,
} from './helpers';

test.use({ deviceScaleFactor: 2 });

const SHOTS = fileURLToPath(new URL('../../../docs/sprints/sprint-02-qa/', import.meta.url));
const PREFIX: Record<string, string> = {
  phone: 'phone-844x390',
  'phone-small': 'phone-640x360',
  desktop: 'desktop-1280x800',
};

async function shot(page: Page, name: string): Promise<void> {
  const p = PREFIX[test.info().project.name] ?? test.info().project.name;
  await page.screenshot({ path: `${SHOTS}${p}-${name}.png` });
}

test.describe('QA S-02-1 / S-02-2 targets', () => {
  test('an asset can go into a remote that holds only an upgrade; after that the remote is closed to agendas but open to upgrades', async ({ page }) => {
    // Find a seed whose Corp opens with Akitaro Watanabe, PAD Campaign and an agenda.
    let seed = 0;
    for (let s = 1; s <= 40; s++) {
      await openBoard(page, s);
      const cards = (await layout(page)).hand.map((h) => getCard(h.cardId)!);
      if (cards.some((c) => c.id === 'c11') && cards.some((c) => c.id === 'c03') && cards.some((c) => c.type === 'agenda')) {
        seed = s;
        break;
      }
    }
    expect(seed, 'a seed whose Corp opens with Akitaro, PAD Campaign and an agenda').toBeGreaterThan(0);

    // Upgrade alone into a new server: Server 1.
    let l = await pickCard(page, 'Akitaro Watanabe');
    await tap(page, targetOf(l, 'new_server').box);
    await waitIdle(page);
    // The asset is offered Server 1 (only an upgrade there) and New server, never HQ/R&D/Archives.
    l = await pickCard(page, 'PAD Campaign');
    expect(l.targets.map((t) => [t.server, t.label, t.lit])).toEqual([
      ['remote1', 'Install · free', true],
      ['new', 'Install · free', true],
    ]);
    const before = await getView(page);
    await tap(page, targetOf(l, 'server', 'remote1').box);
    l = await waitIdle(page);
    const s1 = l.servers.find((s) => s.id === 'remote1')!;
    expect(s1.content.map((c) => c.cardId).sort()).toEqual(['c03', 'c11']);
    const after = await getView(page);
    expect(after.players.corp.credits).toBe(before.players.corp.credits);
    expect(after.players.corp.clicks).toBe(before.players.corp.clicks - 1);
    // Now an agenda is offered only New server.
    const agenda = l.hand.map((h) => getCard(h.cardId)!).find((c) => c.type === 'agenda')!;
    l = await pickCard(page, agenda.name);
    expect(l.targets.map((t) => t.server)).toEqual(['new']);
  });

  test('with remotes opened, ICE lights HQ, R&D, Archives, every remote and New server, each with its price', async ({ page }) => {
    await openBoard(page, 9); // Corp: Ice Wall x2, Enigma, Wall of Static, Hedge Fund, ...
    // Enigma on a new server (free, creates Server 1), Wall of Static on Server 1 (1 credit).
    let l = await pickCard(page, 'Enigma');
    await tap(page, targetOf(l, 'new_server').box);
    await waitIdle(page);
    l = await pickCard(page, 'Wall of Static');
    expect(l.targets.map((t) => [t.server, t.label])).toEqual([
      ['hq', 'Install · free'],
      ['rd', 'Install · free'],
      ['archives', 'Install · free'],
      ['remote1', 'Install · 1 credit'],
      ['new', 'Install · free'],
    ]);
    for (const t of l.targets) expect(t.lit).toBe(true);
    const c0 = (await getView(page)).players.corp.credits;
    await tap(page, targetOf(l, 'server', 'remote1').box);
    l = await waitIdle(page);
    expect((await getView(page)).players.corp.credits).toBe(c0 - 1);
    await shot(page, 'qa-ice-two-on-server-1');
    // Third click: Ice Wall on Server 1 costs 2 and is really charged 2, placed outermost.
    l = await pickCard(page, 'Ice Wall');
    expect(targetOf(l, 'server', 'remote1').label).toBe('Install · 2 credits');
    await shot(page, 'qa-ice-priced-targets');
    await tap(page, targetOf(l, 'server', 'remote1').box);
    l = await waitIdle(page);
    const v = await getView(page);
    expect(v.players.corp.credits).toBe(c0 - 1 - 2);
    expect(v.players.corp.clicks).toBe(0);
    const s1 = l.servers.find((s) => s.id === 'remote1')!;
    expect(s1.ice.map((c) => c.cardId)).toEqual(['c06', 'c04', 'c05']);
    // Outermost = furthest toward the Runner (up the screen on the Corp's turn).
    expect(s1.ice[2]!.box.y).toBeLessThan(s1.ice[1]!.box.y);
    expectCleanLayout(l);
  });
});

test.describe('QA S-02-4 needs runs', () => {
  test('Neural EMP (Corp) and Inside Job (Runner) say "Needs runs (coming soon)" and spend nothing', async ({ page }) => {
    // Find a seed whose opening hands hold both.
    let found = false;
    for (let s = 1; s <= 40 && !found; s++) {
      await openBoard(page, s);
      const corp = (await layout(page)).hand.map((h) => h.cardId);
      if (!corp.includes('c12')) continue;
      await page.evaluate(() => window.__overclock!.clearAnims());
      const before = await getView(page);
      let l = await pickCard(page, 'Neural EMP');
      expect(targetOf(l, 'play')).toMatchObject({ label: 'Play · 2 credits', reject: 'not_implemented', lit: false });
      let m = await measureTap(page, targetOf(l, 'play').box);
      expect(m.events).toEqual([{ type: 'action_rejected', reason: 'not_implemented' }]);
      expect(m.view).toEqual(before);
      expect(m.anims.map((a) => [a.kind, a.text])).toEqual([['hint', 'Needs runs (coming soon)']]);
      await tap(page, l.hand[l.selected!]!.box); // cancel
      await toRunnerTurn(page);
      const runner = (await layout(page)).hand.map((h) => h.cardId);
      if (!runner.includes('r11')) continue;
      const rb = await getView(page);
      l = await pickCard(page, 'Inside Job');
      expect(targetOf(l, 'play')).toMatchObject({ reject: 'not_implemented' });
      m = await measureTap(page, targetOf(l, 'play').box);
      expect(m.view).toEqual(rb);
      expect(m.anims.find((a) => a.kind === 'hint')?.text).toBe('Needs runs (coming soon)');
      found = true;
    }
    expect(found, 'a seed with Neural EMP and Inside Job in the opening hands').toBe(true);
  });
});

test.describe('QA snappiness: picking a card', () => {
  test('tapping a hand card lights its targets inside the same tap (< 100ms), on both sides', async ({ page }) => {
    await openBoard(page, 2);
    const samples: number[] = [];
    for (const side of ['corp', 'runner'] as const) {
      if (side === 'runner') await toRunnerTurn(page);
      const l = await waitIdle(page);
      for (let i = 0; i < l.hand.length; i++) {
        await page.evaluate(() => {
          const w = window as unknown as { __p?: unknown };
          w.__p = undefined;
          window.addEventListener(
            'pointerup',
            (e) => {
              const hook = window.__overclock!;
              const inp = hook.lastInput();
              const lay = hook.layout();
              w.__p = { at: performance.now(), handled: inp && inp.eventAt === e.timeStamp ? inp.handledAt : NaN, targets: lay.targets.length, selected: lay.selected };
            },
            { once: true },
          );
        });
        await tap(page, l.hand[i]!.box);
        await page.waitForFunction(() => (window as unknown as { __p?: unknown }).__p !== undefined);
        const p = await page.evaluate(() => (window as unknown as { __p: { at: number; handled: number; targets: number; selected: number | null } }).__p);
        const card = getCard(l.hand[i]!.cardId)!;
        expect(p.selected, `${card.name} picked`).toBe(i);
        expect(p.targets, `${card.name} lit targets`).toBeGreaterThan(0);
        expect(p.at - p.handled, `${card.name} answered within 100ms`).toBeLessThan(100);
        samples.push(p.at - p.handled);
        await tap(page, l.hand[i]!.box); // cancel
        expect((await layout(page)).selected).toBeNull();
      }
    }
    test.info().annotations.push({ type: 'pick-ms', description: JSON.stringify(samples.map((x) => Math.round(x * 10) / 10)) });
  });
});

test.describe('QA Sprint 2 playthrough (screenshots)', () => {
  test('Corp installs and plays, Runner installs and plays, both views', async ({ page }) => {
    test.setTimeout(90_000);
    await openBoard(page, 2);
    let l = await waitIdle(page);
    expect(l.text.banner).toBe('TURN 1 · CORP · 3 clicks left');
    await shot(page, '01-corp-turn-1');

    l = await pickCard(page, 'Hostile Takeover');
    await shot(page, '02-agenda-picked-new-server-lit');
    await tap(page, targetOf(l, 'new_server').box);
    l = await waitIdle(page);
    expect(l.servers.map((s) => s.label)).toContain('Server 1');
    await shot(page, '03-agenda-in-server-1-face-down');

    const card = l.servers.find((s) => s.id === 'remote1')!.content[0]!;
    let release = await pressAndHold(page, card.box);
    await page.waitForFunction(() => window.__overclock!.layout().zoom?.cardId === 'c08');
    await page.waitForTimeout(250);
    await shot(page, '04-corp-holds-own-installed-card-zoom');
    await release();
    await page.waitForFunction(() => window.__overclock!.layout().zoom === null);

    l = await pickCard(page, 'Akitaro Watanabe');
    expect(l.targets.map((t) => t.server)).toEqual(['hq', 'rd', 'archives', 'remote1', 'new']);
    await shot(page, '05-upgrade-picked-every-server-lit');
    await tap(page, targetOf(l, 'server', 'hq').box);
    await waitIdle(page);

    l = await pickCard(page, 'Hedge Fund');
    await shot(page, '06-hedge-fund-play-5-credits');
    await tap(page, targetOf(l, 'play').box);
    l = await waitIdle(page);
    expect(l.text.corpCredits).toBe('9');
    expect(l.text.corpDiscard).toBe('1');
    await shot(page, '07-hedge-fund-played-archives-face-up');

    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, l.hand[0]!.box);
    expect((await anims(page)).find((a) => a.kind === 'hint')?.text).toBe('No clicks left');
    await shot(page, '08-no-clicks-left');

    await page.waitForTimeout(350);
    l = await waitIdle(page);
    await tap(page, l.endTurn!.box);
    l = await waitIdle(page);
    if (l.picker) {
      await tap(page, l.hand[0]!.box);
      l = await layout(page);
      await tap(page, l.picker!.confirm.box);
    }
    l = await waitIdle(page);
    expect(l.viewer).toBe('runner');
    for (const c of l.servers.flatMap((s) => [...s.content, ...s.ice])) expect(c.cardId).toBeNull();
    expect((await getView(page)).players.corp.discard).toContain('c01');
    await shot(page, '09-runner-turn-corp-cards-are-backs');

    const back = l.servers.find((s) => s.id === 'remote1')!.content[0]!;
    release = await pressAndHold(page, back.box);
    await page.waitForFunction(() => window.__overclock!.layout().zoom !== null);
    await page.waitForTimeout(250);
    expect((await layout(page)).zoom!.cardId).toBeNull();
    await shot(page, '10-runner-holds-corp-card-sees-back');
    await release();
    await page.waitForFunction(() => window.__overclock!.layout().zoom === null);

    l = await pickCard(page, 'Ninja');
    expect(targetOf(l, 'install').label).toBe('Install · 4 credits');
    await shot(page, '11-runner-program-picked-install-4-credits');
    await tap(page, targetOf(l, 'install').box);
    l = await waitIdle(page);
    expect(l.memory.text).toBe('Memory 1/4');
    await shot(page, '12-ninja-installed-memory-1-of-4');

    await page.evaluate(() => window.__overclock!.clearAnims());
    l = await pickCard(page, "The Maker's Eye");
    await shot(page, '13-makers-eye-needs-runs');
    await tap(page, l.hand[l.selected!]!.box);

    l = await pickCard(page, 'Diesel');
    await tap(page, targetOf(l, 'play').box);
    l = await waitIdle(page);
    await shot(page, '14-diesel-drew-3');

    // Something the Runner (1 credit left) cannot afford.
    const v = await getView(page);
    const poor = v.handOptions.findIndex((opts) => opts.some((o) => o.reject === 'no_credits'));
    if (poor >= 0) {
      l = await layout(page);
      await tap(page, l.hand[poor]!.box);
      l = await layout(page);
      const t = l.targets.find((x) => x.reject === 'no_credits')!;
      await page.evaluate(() => window.__overclock!.clearAnims());
      await tap(page, t.box);
      expect((await anims(page)).find((a) => a.kind === 'hint')?.text).toBe('Not enough credits');
      await shot(page, '15-runner-not-enough-credits');
      await tap(page, l.hand[poor]!.box);
    }

    await passTurn(page);
    l = await waitIdle(page);
    expect(l.viewer).toBe('corp');
    expect(l.rig[0]).toMatchObject({ cardId: 'r06', faceUp: true });
    await shot(page, '16-corp-turn-3-runner-rig-face-up');
  });

  test('busy board, both views, picked upgrade, and notch on either side', async ({ page }) => {
    await openBoard(page, 1);
    await toBusyBoard(page, 1);
    let l = await waitIdle(page);
    await shot(page, `20-busy-board-${l.viewer}-view`);
    l = await pickCard(page, 'Akitaro Watanabe');
    await shot(page, '21-busy-board-upgrade-picked');
    await tap(page, l.hand[l.selected!]!.box);
    await passTurn(page);
    l = await waitIdle(page);
    await shot(page, `22-busy-board-${l.viewer}-view`);
    const ice = l.servers.find((s) => s.ice.length > 0)!.ice[0]!;
    const release = await pressAndHold(page, ice.box);
    await page.waitForFunction(() => window.__overclock!.layout().zoom !== null);
    await page.waitForTimeout(250);
    await shot(page, '23-busy-board-hold-ice');
    await release();

    for (const [name, insets] of [
      ['notch-left', { left: 47, bottom: 21 }],
      ['notch-right', { right: 47, bottom: 21 }],
    ] as const) {
      const p = await page.context().newPage();
      await openBoard(p, { seed: 1, insets });
      await toBusyBoard(p, 1);
      const nl = await waitIdle(p);
      expectCleanLayout(nl);
      await shot(p, `24-busy-board-${name}`);
      await p.close();
    }
  });

  test('upright phone shows "Turn your phone sideways"; turning it back restores the game', async ({ browser }) => {
    test.skip(test.info().project.name !== 'phone', 'one upright check is enough');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto('./?seed=2');
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => window.__overclock!.dispatch({ type: 'gain_credit', player: 'corp' }));
    await page.waitForFunction(() => !window.__overclock!.layout().animating);
    const before = await page.evaluate(() => window.__overclock!.getView());
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#rotate')).toBeVisible();
    await expect(page.locator('#rotate')).toHaveText('Turn your phone sideways');
    await page.screenshot({ path: `${SHOTS}phone-390x844-upright-rotate-prompt.png` });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#rotate')).toBeHidden();
    await page.waitForFunction(() => !window.__overclock!.layout().animating);
    expect(await page.evaluate(() => window.__overclock!.getView())).toEqual(before);
    await page.screenshot({ path: `${SHOTS}phone-844x390-after-rotating-back.png` });
    await ctx.close();
  });
});

// QA-S2-1: hints must stay readable. The toast is scaled down to fit a short rail slot,
// which shrinks long hints to ~5px text on a 640x360 phone. Rough readability bar: at
// least 80 square CSS px of toast per character (about a 10px font).
test.describe('QA-S2-1 hints are readable', () => {
  test('"Needs runs", "Not enough credits", "No clicks left" and "Not your turn" are drawn big enough to read', async ({ page }) => {
    await openBoard(page, 2);
    await toRunnerTurn(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    const seen: Record<string, { width: number; height: number; perChar: number }> = {};
    const record = async (): Promise<void> => {
      const h = (await anims(page)).filter((a) => a.kind === 'hint').pop()!;
      const b = h.box!;
      seen[h.text!] = { width: Math.round(b.width), height: Math.round(b.height), perChar: Math.round((b.width * b.height) / h.text!.length) };
      await page.evaluate(() => window.__overclock!.clearAnims());
    };
    let l = await pickCard(page, "The Maker's Eye");
    await record();
    await tap(page, l.hand[l.selected!]!.box);
    await page.evaluate(() => window.__overclock!.dispatch({ type: 'draw', player: 'corp' }));
    await record();
    l = await pickCard(page, 'Ninja');
    await tap(page, targetOf(l, 'install').box);
    await waitIdle(page);
    l = await pickCard(page, 'Corroder');
    await tap(page, targetOf(l, 'install').box);
    await record();
    await tap(page, l.hand[l.selected!]!.box);
    for (let i = 0; i < 3; i++) await page.evaluate(() => window.__overclock!.dispatch({ type: 'gain_credit', player: 'runner' }));
    await page.evaluate(() => window.__overclock!.dispatch({ type: 'gain_credit', player: 'runner' }));
    await record();
    test.info().annotations.push({ type: 'hint-boxes', description: JSON.stringify(seen) });
    expect(Object.keys(seen).sort()).toEqual(['Needs runs (coming soon)', 'No clicks left', 'Not enough credits', 'Not your turn']);
    for (const [text, b] of Object.entries(seen)) expect.soft(b.perChar, `${text} ${JSON.stringify(b)}`).toBeGreaterThanOrEqual(80);
  });
});

// QA-S2-2: an upgrade installed in HQ must not cover the HQ marker (its card count).
test.describe('QA-S2-2 upgrade in HQ', () => {
  test('an upgrade in HQ sits beside the HQ marker on both views, not on top of it', async ({ page }) => {
    await openBoard(page, 2);
    const l0 = await pickCard(page, 'Akitaro Watanabe');
    await tap(page, targetOf(l0, 'server', 'hq').box);
    const found: string[] = [];
    for (let side = 0; side < 2; side++) {
      const l = await waitIdle(page);
      const hq = l.servers.find((s) => s.id === 'hq')!;
      const a = hq.root!;
      const b = hq.content[0]!.box;
      const eps = 0.5;
      const overlap = a.x + eps < b.x + b.width && b.x + eps < a.x + a.width && a.y + eps < b.y + b.height && b.y + eps < a.y + a.height;
      if (overlap) found.push(`${l.viewer} view: marker ${JSON.stringify(a)} upgrade ${JSON.stringify(b)}`);
      if (side === 0) await passTurn(page);
    }
    expect(found).toEqual([]);
  });
});
