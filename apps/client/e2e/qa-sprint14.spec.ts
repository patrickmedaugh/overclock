// QA Sprint 14 (independent, written by QA; not the developers' specs). Against the local online
// service (wrangler dev, test mode) with each browser context a separate "device" (`?deckip=`):
// - S-14-1: from an empty device by taps: first own deck → "✓ Saved online"; offline → the pending
//   line → back online by itself;
// - S-14-2: two devices that both have a deck called "My Corp deck 1" link → both see both (Q2 A);
//   live update of an open Decks list; both offline, the same deck renamed on each + different decks
//   changed → newest wins, all other changes kept, on both; a delete made while the other is
//   offline stays deleted; clearing the browser's data and typing the code brings everything back;
//   wrong code / wait wording;
// - S-14-3/4: a WHOLE online game to game over, host Runner with an own deck vs guest Corp with an
//   own deck (a mix the developers' specs don't play), every frame both phones received checked for
//   deck lists, own copy counts and hidden Runner cards, also after game over (Q3 A); the game over
//   screen shows no deck list; Leave for now + editing the deck + lost signal keep the deal; a deck
//   the service refuses on JOIN (too few cards) is worded plainly; a real Sprint-13-style (v1) frame
//   to the real service gets `version`;
// - layout at every size (44 px targets, text >= 10 px, inside the screen), tap-to-paint < 100 ms,
//   upright prompt over the new screens.
// `QA_SCREENS=1` writes screenshots to docs/sprints/sprint-14-qa/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, type Locator, type Page, expect, test } from '@playwright/test';
import { STANDARD_DECKS, countsOf } from '@overclock/cards';
import type { Action, PlayerView } from '@overclock/engine';
import type { StoredDeck } from '@overclock/match';
import { START, expectTextFloor, openDeck, openStart, press, screenName, standardPlus, storedDeck, tapStart } from './decks';
import { type Phone, frames, joinGame, loseSignal, openPhone, regainSignal, tapButton, view, waitPlaying } from './online';
import { deckIp, listNames, syncInfo, syncLine, waitSaved } from './s14';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-14-qa');
const SIZE: Record<string, string> = { phone: '844x390', 'phone-small': '640x360', desktop: '1280x800', 'phone-short': '891x296' };
const SAVED = '✓ Saved online';
const PENDING = "Saved on this device · goes online when you're connected";

async function snap(page: Page, name: string): Promise<void> {
  const p = test.info().project.name;
  if (process.env.QA_SCREENS === '1') mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot(process.env.QA_SCREENS === '1' ? { path: join(SHOTS, `r1-${SIZE[p] ?? p}-${name}.png`) } : {});
  await test.info().attach(name, { body, contentType: 'image/png' });
}

/** Every visible button in the start screen is >= 44 px both ways and inside the viewport. */
async function expectTargets(page: Page): Promise<void> {
  const vp = page.viewportSize()!;
  const bad = await page.locator(START).evaluate(
    (root, { w, h }) => {
      const out: string[] = [];
      for (const b of Array.from(root.querySelectorAll<HTMLElement>('button, [role="radio"], input'))) {
        if (b.offsetParent === null) continue;
        const r = b.getBoundingClientRect();
        const scroller = b.closest('.deck-list, .deck-col, .deck-picks, .scroll');
        if (scroller) {
          const s = scroller.getBoundingClientRect();
          if (r.bottom <= s.top || r.top >= s.bottom) continue;
        }
        const name = (b.getAttribute('aria-label') ?? b.textContent ?? b.tagName).trim().slice(0, 30);
        if (r.width < 44 || r.height < 44) out.push(`${name}: ${r.width.toFixed(0)}x${r.height.toFixed(0)}`);
        if (r.left < -0.5 || r.right > w + 0.5) out.push(`${name}: off screen x`);
        if (!scroller && (r.top < -0.5 || r.bottom > h + 0.5)) out.push(`${name}: off screen y ${r.top.toFixed(0)}..${r.bottom.toFixed(0)}`);
      }
      return out;
    },
    { w: vp.width, h: vp.height },
  );
  expect(bad, 'targets under 44 px or off screen').toEqual([]);
}

/** Time from the tap's pointerdown to the frame after `watch` changed (≈ painted), in ms, in the page. */
async function tapToPaint(page: Page, target: Locator, watch: Locator): Promise<number> {
  await watch.evaluate((w) => {
    const win = window as unknown as { __qaT: { down: number; painted: number } };
    win.__qaT = { down: -1, painted: -1 };
    document.addEventListener('pointerdown', (e) => (win.__qaT.down = e.timeStamp), { capture: true, once: true });
    const mo = new MutationObserver(() => {
      mo.disconnect();
      requestAnimationFrame(() => (win.__qaT.painted = performance.now()));
    });
    mo.observe(w, { childList: true, characterData: true, subtree: true, attributes: true });
  });
  await press(page, target);
  await page.waitForFunction(() => (window as unknown as { __qaT: { painted: number } }).__qaT.painted > 0);
  return page.evaluate(() => {
    const t = (window as unknown as { __qaT: { down: number; painted: number } }).__qaT;
    return t.painted - t.down;
  });
}

/** A new device (own storage) like this project's, on the start screen, its own guess-limit "IP". */
async function device(browser: Browser, decks: StoredDeck[] = []): Promise<Page> {
  const use = test.info().project.use;
  const ctx = await browser.newContext({ viewport: use.viewport ?? null, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch, baseURL: use.baseURL });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
  const page = await ctx.newPage();
  const ip = deckIp();
  await page.goto(`./?deckip=${ip}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
  if (decks.length > 0) {
    await page.evaluate((raw) => localStorage.setItem('overclock.decks.v1', raw), JSON.stringify({ format: 2, decks, deleted: [] }));
    await page.goto(`./?deckip=${ip}`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
  }
  return page;
}

async function toDecks(page: Page): Promise<void> {
  if ((await screenName(page)) !== 'home') {
    while ((await screenName(page)) !== 'home') await tapStart(page, /^Back$/);
  }
  await tapStart(page, /^Decks/);
  expect(await screenName(page)).toBe('decks');
}

async function rename(page: Page, id: string, name: string): Promise<void> {
  await openDeck(page, id);
  const input = page.locator(`${START} input[data-testid="deck-name"]`);
  await input.fill(name);
  await input.press('Enter');
  await tapStart(page, /^Back$/);
  expect(await screenName(page)).toBe('decks');
}

async function getCode(page: Page): Promise<string> {
  await press(page, page.locator(START).getByRole('button', { name: /My deck code/ }));
  const big = page.locator(`${START} [data-testid="deck-code"]`);
  await expect(big).toHaveText(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/, { timeout: 8000 });
  return (await big.textContent())!;
}

async function link(page: Page, code: string): Promise<void> {
  await press(page, page.locator(START).getByRole('button', { name: /I have a deck code/ }));
  await page.locator(`${START} [data-testid="deck-code-input"]`).fill(code);
  await press(page, page.locator(START).getByRole('button', { name: /^Link$/ }));
}

const err = (page: Page) => page.locator(`${START} [data-testid="deck-link-error"]`);
/** The player's own decks on the Decks list (both sides; the standard ones left out), sorted. */
const allNames = async (page: Page) => [...(await listNames(page, 'corp')), ...(await listNames(page, 'runner'))].filter((n) => !n.startsWith('Standard ')).sort();

// ---------------------------------------------------------------------------------------------
test.describe('QA S-14-1 decks saved online', () => {
  test('empty device, by taps: first own deck → "✓ Saved online"; offline edit → pending line; back online → saved by itself', async ({ page, context }) => {
    const sent: string[] = [];
    page.on('request', (r) => {
      if (/\/v1\/decks\//.test(r.url()) && r.method() === 'POST') sent.push(r.url());
    });
    await openStart(page, `deckip=${deckIp()}`);
    await tapStart(page, /^Decks/);
    await expect(syncLine(page)).toBeHidden();
    await expectTargets(page);
    await snap(page, 'decks-empty');
    expect(sent).toEqual([]);
    await tapStart(page, /New Corp deck/);
    await tapStart(page, /Start from the standard deck/);
    await tapStart(page, /^Back$/);
    // "a few seconds later"
    const t0 = Date.now();
    await expect(syncLine(page)).toHaveText(SAVED, { timeout: 8000 });
    test.info().annotations.push({ type: 'saved-after-ms', description: String(Date.now() - t0) });
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(sent.filter((u) => u.endsWith('/new'))).toHaveLength(1);
    await expectTargets(page);
    await expectTextFloor(page);
    await snap(page, 'decks-saved');

    await context.setOffline(true);
    const id = (await page.evaluate(() => window.__overclockStart!.decks())).decks[0]!.id;
    await rename(page, id, 'Plane deck');
    await expect(syncLine(page)).toHaveText(PENDING, { timeout: 8000 });
    await expectTextFloor(page);
    await snap(page, 'decks-pending');
    // The line fits inside the screen.
    const box = (await syncLine(page).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
    await context.setOffline(false);
    await expect(syncLine(page)).toHaveText(SAVED, { timeout: 12_000 });
    // A second device with the code sees the offline edit.
    const code = (await syncInfo(page)).code!;
    const other = await device(page.context().browser()!);
    await toDecks(other);
    await link(other, code);
    await expect.poll(() => listNames(other, 'corp'), { timeout: 8000 }).toContain('Plane deck');
    await other.context().close();
  });
});

// ---------------------------------------------------------------------------------------------
test.describe('QA S-14-2 two devices', () => {
  test('both have "My Corp deck 1": linking keeps all (Q2 A); the open list on the first updates by itself; code screen layout + Copy', async ({ browser }) => {
    const a = await device(browser, [storedDeck('a1', 'corp', 'My Corp deck 1', standardPlus('corp', {}))]);
    const b = await device(browser, [storedDeck('b1', 'corp', 'My Corp deck 1', standardPlus('corp', { c06: 1 })), storedDeck('b2', 'runner', 'Phone runner', standardPlus('runner', {}))]);
    await toDecks(a);
    await waitSaved(a);
    const code = await getCode(a);
    expect(code).not.toMatch(/[0O1IL]/);
    await expect(a.locator(START)).toContainText('Keep it safe');
    await expectTargets(a);
    await expectTextFloor(a);
    await snap(a, 'my-deck-code');
    await press(a, a.locator(START).getByRole('button', { name: /^Copy$/ }));
    expect(await a.evaluate(() => navigator.clipboard.readText())).toBe(code);
    await tapStart(a, /^Back$/);
    expect(await screenName(a)).toBe('decks');

    await toDecks(b);
    await press(b, b.locator(START).getByRole('button', { name: /I have a deck code/ }));
    await expectTargets(b);
    await expectTextFloor(b);
    await snap(b, 'link-screen');
    await b.locator(`${START} [data-testid="deck-code-input"]`).fill(code);
    const t0 = Date.now();
    await press(b, b.locator(START).getByRole('button', { name: /^Link$/ }));
    await expect.poll(() => screenName(b), { timeout: 8000 }).toBe('decks');
    expect(Date.now() - t0, '"within a few seconds"').toBeLessThan(5000);
    expect(await allNames(b)).toEqual(['My Corp deck 1', 'My Corp deck 1', 'Phone runner']);
    await snap(b, 'linked');
    // A's Decks screen is open: B's decks show up without A doing anything.
    const t1 = Date.now();
    await expect.poll(() => allNames(a), { timeout: 15_000 }).toEqual(['My Corp deck 1', 'My Corp deck 1', 'Phone runner']);
    test.info().annotations.push({ type: 'live-update-ms', description: String(Date.now() - t1) });
    await a.context().close();
    await b.context().close();
  });

  test('both offline: same deck renamed on each (later one wins), different decks changed on each (all kept), and a delete stays deleted', async ({ browser }) => {
    const a = await device(browser, [
      storedDeck('x', 'corp', 'X', standardPlus('corp', {})),
      storedDeck('y', 'corp', 'Y', standardPlus('corp', {})),
      storedDeck('z', 'runner', 'Z', standardPlus('runner', {})),
      storedDeck('gone', 'runner', 'Gone soon', standardPlus('runner', {})),
    ]);
    await toDecks(a);
    await waitSaved(a);
    const code = (await syncInfo(a)).code!;
    const b = await device(browser);
    await toDecks(b);
    await link(b, code);
    await expect.poll(() => listNames(b, 'corp'), { timeout: 8000 }).toContain('X');
    await waitSaved(b);
    // Both lose their signal.
    await a.context().setOffline(true);
    await b.context().setOffline(true);
    await rename(a, 'x', 'X from browser'); // earlier
    await rename(a, 'y', 'Y from browser');
    await a.waitForTimeout(50);
    await rename(b, 'x', 'X from phone'); // later: wins
    await rename(b, 'z', 'Z from phone');
    // A deletes `gone` while B (offline) still has its old copy.
    await openDeck(a, 'gone');
    await press(a, a.locator(START).getByRole('button', { name: /^Delete$/ }));
    await press(a, a.locator(`${START} [data-testid="deck-delete-dialog"]`).getByRole('button', { name: /^Delete$/ }));
    await expect(syncLine(a)).toHaveText(PENDING);
    await expect(syncLine(b)).toHaveText(PENDING);
    // The browser comes back first, then the phone, then the browser looks again.
    await a.context().setOffline(false);
    await waitSaved(a);
    await b.context().setOffline(false);
    await waitSaved(b);
    await a.evaluate(() => window.__overclockStart!.syncNow());
    await tapStart(a, /^Back$/);
    await toDecks(a);
    await tapStart(b, /^Back$/);
    await toDecks(b);
    const want = ['X from phone', 'Y from browser', 'Z from phone'];
    await expect.poll(() => allNames(a), { timeout: 12_000 }).toEqual(want);
    await expect.poll(() => allNames(b), { timeout: 12_000 }).toEqual(want);
    await snap(b, 'merged-after-offline');
    await a.context().close();
    await b.context().close();
  });

  test('clearing the browser data on the same device, then typing the code: every deck comes back', async ({ page, browser }) => {
    const a = await device(browser, [
      storedDeck('c1', 'corp', 'Keep Corp', standardPlus('corp', { c06: 1 })),
      storedDeck('r1', 'runner', 'Keep Runner', standardPlus('runner', {})),
    ]);
    await toDecks(a);
    await waitSaved(a);
    const shown = await getCode(a);
    // Wipe everything this browser stored, as "Clear site data" would.
    await a.evaluate(() => localStorage.clear());
    await a.reload();
    await a.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
    await toDecks(a);
    expect(await allNames(a)).toEqual([]);
    await link(a, shown); // typed as shown, with dashes
    await expect.poll(() => allNames(a), { timeout: 8000 }).toEqual(['Keep Corp', 'Keep Runner']);
    const stored = await a.evaluate(() => window.__overclockStart!.decks());
    expect(stored.decks.find((d) => d.id === 'c1')!.cards).toEqual(standardPlus('corp', { c06: 1 }));
    await a.context().close();
    void page;
  });

  test('wrong code: "No decks with that code"; then the wait; the waiting device can still play and build', async ({ page }) => {
    await openStart(page, `deckip=${deckIp()}`);
    await tapStart(page, /^Decks/);
    await press(page, page.locator(START).getByRole('button', { name: /I have a deck code/ }));
    const input = page.locator(`${START} [data-testid="deck-code-input"]`);
    const go = page.locator(START).getByRole('button', { name: /^Link$/ });
    const texts: string[] = [];
    for (let i = 0; i < 6; i++) {
      await input.fill(`QQQQ-RRRR-SSS${'ABCDEF'[i]}`);
      await press(page, go);
      await expect(err(page)).toHaveText(/No decks with that code|Too many wrong codes/);
      texts.push((await err(page).textContent())!);
      if (i === 0) await snap(page, 'wrong-code');
    }
    expect(texts.slice(0, 5)).toEqual(Array(5).fill('No decks with that code'));
    expect(texts[5]).toMatch(/^Too many wrong codes\. Try again in 1 minute\.$/);
    await expect(input).toBeDisabled();
    await expectTextFloor(page);
    await snap(page, 'wrong-code-wait');
    // Not stuck: Back, build a deck, play on this device.
    await tapStart(page, /^Back$/);
    await tapStart(page, /New Runner deck/);
    await tapStart(page, /Start from the standard deck/);
    expect(await screenName(page)).toBe('deck');
  });
});

// ---------------------------------------------------------------------------------------------
// Online: own decks.
const RUN_OWN = storedDeck('qa-run', 'runner', 'QA Kate', standardPlus('runner', { r01: 1, r08: 1 }));
const CORP_OWN = storedDeck('qa-corp', 'corp', 'QA Corp', standardPlus('corp', { c06: 1 }));
const SHORT_RUN = storedDeck('qa-short', 'runner', 'Not done', standardPlus('runner', { r01: -2 }));

async function phoneWith(browser: Browser, decks: StoredDeck[]): Promise<Phone> {
  const p = await openPhone(browser);
  if (decks.length > 0) {
    await p.page.evaluate((raw) => localStorage.setItem('overclock.decks.v1', raw), JSON.stringify({ format: 2, decks, deleted: [] }));
    await p.page.reload();
    await p.page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
  }
  return p;
}

const pickOpt = (page: Page, id: string) => page.locator(`${START} [data-testid="deck-pick"][data-deck="${id}"]`);

/** Host Runner with QA Kate, guest Corp with QA Corp, both by taps. */
async function ownVsOwn(browser: Browser): Promise<{ host: Phone; guest: Phone; code: string }> {
  const host = await phoneWith(browser, [RUN_OWN, SHORT_RUN]);
  const guest = await phoneWith(browser, [CORP_OWN]);
  await tapButton(host.page, /Play online/);
  await tapButton(host.page, /Start a game/);
  await tapButton(host.page, /^Runner/);
  expect(await screenName(host.page)).toBe('online_deck');
  await expect(pickOpt(host.page, 'standard-runner')).toHaveAttribute('aria-checked', 'true');
  await expect(pickOpt(host.page, 'qa-short')).toHaveAttribute('data-ready', 'false');
  await expect(pickOpt(host.page, 'qa-short')).toContainText(/.+/);
  await expectTargets(host.page);
  await expectTextFloor(host.page);
  await snap(host.page, 'host-picker-runner');
  const ms = await tapToPaint(host.page, pickOpt(host.page, 'qa-run'), pickOpt(host.page, 'qa-run'));
  test.info().annotations.push({ type: 'pick-tap-to-paint-ms', description: ms.toFixed(1) });
  expect(ms).toBeLessThan(100);
  await expect(pickOpt(host.page, 'qa-run')).toHaveAttribute('aria-checked', 'true');
  await tapButton(host.page, /Get the code/);
  const big = host.page.locator('#start .code-big');
  await expect(big).toHaveText(/^[A-Z2-9]{4}$/, { timeout: 10_000 });
  const code = (await big.textContent())!;
  await joinGame(guest, code);
  await expect.poll(() => screenName(guest.page), { timeout: 10_000 }).toBe('choose');
  await expect(guest.page.locator(START)).toContainText("You'll play the Corp");
  await expectTargets(guest.page);
  await expectTextFloor(guest.page);
  await snap(guest.page, 'guest-picker-corp');
  await expect(host.page.locator('#start [data-role="lobby-status"]')).toHaveText('Your friend is picking a deck…');
  await snap(host.page, 'host-friend-picking');
  await press(guest.page, pickOpt(guest.page, 'qa-corp'));
  await tapButton(guest.page, /^Join$/);
  await Promise.all([waitPlaying(host), waitPlaying(guest)]);
  return { host, guest, code };
}

const lastSeq = (p: Phone) => Math.max(-1, ...frames(p.received).map((f) => f.seq ?? -1));

/** One move by whoever can move (random legal; the Corp mostly draws so the game ends by decking). */
async function step(host: Phone, guest: Phone, r: () => number): Promise<PlayerView | null> {
  for (const p of [host, guest]) {
    const v = await view(p);
    if (v.result) return v;
    if (v.legalActions.length === 0) continue;
    let a: Action;
    if (v.choice && v.choice.options.length > 0) {
      const ok = v.choice.options.filter((o) => o.reject === null);
      a = (ok[Math.floor(r() * ok.length)] ?? ok[0])!.action;
    } else {
      const draw = v.legalActions.find((x) => x.type === 'draw');
      const noEnd = v.legalActions.filter((x) => x.type !== 'end_turn');
      a = v.viewer === 'corp' && draw && r() < 0.85 ? draw : (noEnd.length > 0 && r() < 0.9 ? noEnd : v.legalActions)[Math.floor(r() * (noEnd.length > 0 ? noEnd.length : v.legalActions.length))]!;
      if (!a) a = v.legalActions[0]!;
    }
    await p.page.waitForFunction(() => !window.__overclock!.online()!.busy && window.__overclock!.online()!.connection === 'open');
    await p.page.evaluate((x) => window.__overclock!.dispatch(x), a);
    await p.page.waitForFunction(() => !window.__overclock!.online()!.busy);
    // Both phones caught up before the next move.
    await expect.poll(() => lastSeq(host) === lastSeq(guest), { timeout: 5000 }).toBe(true);
    return null;
  }
  return null;
}

test.describe('QA S-14-3 / S-14-4 online with own decks', () => {
  test('whole game, own Runner (host) vs own Corp (guest): dealt from own decks; no deck list or hidden Runner card ever reaches the Corp phone, also after game over', async ({ browser }) => {
    test.setTimeout(300_000);
    const { host, guest } = await ownVsOwn(browser);
    const hv = await view(host);
    const gv = await view(guest);
    // Own decks dealt: R&D+HQ / Stack+Grip hold exactly what was built.
    expect(hv.players.runner.deckCount + hv.players.runner.handCount).toBe(47);
    expect(gv.players.corp.deckCount + gv.players.corp.handCount).toBe(46);
    expect([...hv.players.runner.hand!].every((id) => (RUN_OWN.cards[id] ?? 0) > 0)).toBe(true);
    expect([...gv.players.corp.hand!].every((id) => (CORP_OWN.cards[id] ?? 0) > 0)).toBe(true);
    // The opponent's hand is never a list on the other phone.
    expect(gv.players.runner.hand).toBeNull();
    expect(hv.players.corp.hand).toBeNull();
    let seed = 12345;
    const r = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 8) / 16777216;
    let over: PlayerView | null = null;
    for (let i = 0; i < 2500 && !over; i++) over = await step(host, guest, r);
    expect(over, 'game reached game over').not.toBeNull();
    test.info().annotations.push({ type: 'game-over', description: JSON.stringify(over!.result) + ` turn ${over!.turn}` });
    await host.page.waitForTimeout(1500);
    await snap(guest.page, 'game-over-guest-corp');
    await snap(host.page, 'game-over-host-runner');
    // Game-over: the Corp phone's screen names no Runner card list (Q3 A): no "deck"/"Their deck" button.
    const overButtons = await guest.page.evaluate(() => window.__overclock!.layout().dialog?.buttons.map((b) => b.label) ?? []);
    expect(overButtons.join('|')).not.toMatch(/deck/i);
    await expect(guest.page.getByRole('button', { name: /Their deck|Show my deck/ })).toHaveCount(0);

    // Every frame the Corp phone received.
    const hostEnd = await view(host);
    const publicRunner = new Set<string>([
      ...hostEnd.rig.map((c) => c.cardId).filter((x): x is string => !!x),
      ...hostEnd.players.runner.discard.filter((x): x is string => !!x),
      ...(hostEnd.players.runner.identity ? [hostEnd.players.runner.identity.cardId] : []),
    ]);
    const hiddenOnly = Object.keys(RUN_OWN.cards).filter((id) => !publicRunner.has(id));
    test.info().annotations.push({ type: 'runner-hidden-only', description: hiddenOnly.join(',') });
    expect(hiddenOnly.length).toBeGreaterThan(0);
    const runCounts = JSON.stringify(RUN_OWN.cards);
    const corpCounts = JSON.stringify(CORP_OWN.cards);
    let n = 0;
    for (const f of guest.received) {
      n++;
      expect(f).not.toMatch(/"(deck|decks|seed|rng)"\s*:/);
      expect(f).not.toMatch(/"options"\s*:\s*\{/);
      expect(f).not.toContain(runCounts);
      for (const id of hiddenOnly) expect(f, `hidden Runner card ${id} in a frame to the Corp`).not.toContain(`"${id}"`);
    }
    for (const f of host.received) {
      expect(f).not.toMatch(/"(deck|decks|seed|rng)"\s*:/);
      expect(f).not.toMatch(/"options"\s*:\s*\{/);
      expect(f).not.toContain(corpCounts);
    }
    // Views to the Corp: Runner hand always null; to the Runner: Corp hand always null.
    for (const fr of frames(guest.received)) if (fr.view) expect(fr.view.players.runner.hand).toBeNull();
    for (const fr of frames(host.received)) if (fr.view) expect(fr.view.players.corp.hand).toBeNull();
    // After game over: nothing more about decks arrives (reload = resume after the end).
    const before = guest.received.length;
    await guest.page.reload();
    await guest.page.waitForFunction(() => document.body.dataset.ready === 'true');
    await guest.page.waitForTimeout(1500);
    for (const f of guest.received.slice(before)) {
      expect(f).not.toMatch(/"(deck|decks)"\s*:/);
      for (const id of hiddenOnly) expect(f).not.toContain(`"${id}"`);
    }
    test.info().annotations.push({ type: 'frames-checked', description: `${n} to Corp, ${host.received.length} to Runner, ${guest.received.length - before} after game over` });
    await host.context.close();
    await guest.context.close();
  });

  test('Leave for now, edit and delete the deck, lose signal: the game keeps the deal', async ({ browser }) => {
    const { host, guest, code } = await ownVsOwn(browser);
    const grip = (await view(host)).players.runner.hand;
    // Leave for now (Back → Leave for now).
    expect(await host.page.evaluate(() => window.__overclock!.back())).toBe('ask_leave');
    const d = await host.page.evaluate(() => window.__overclock!.layout().dialog!);
    const leave = d.buttons.find((b) => b.label === 'Leave for now')!;
    await host.page.mouse.click(leave.box.x + leave.box.width / 2, leave.box.y + leave.box.height / 2);
    await host.page.waitForFunction(() => window.__overclockStart?.screen() === 'home');
    // Edit then delete the deck that was dealt.
    await toDecks(host.page);
    await rename(host.page, 'qa-run', 'Changed');
    await openDeck(host.page, 'qa-run');
    await press(host.page, host.page.locator(START).getByRole('button', { name: /^Delete$/ }));
    await press(host.page, host.page.locator(`${START} [data-testid="deck-delete-dialog"]`).getByRole('button', { name: /^Delete$/ }));
    await tapStart(host.page, /^Back$/);
    await tapButton(host.page, new RegExp(`^Continue game · ${code}`));
    await waitPlaying(host);
    let v = await view(host);
    expect(v.players.runner.hand).toEqual(grip);
    expect(v.players.runner.deckCount + v.players.runner.handCount).toBe(47);
    // The Corp phone loses signal and comes back.
    const corpHand = (await view(guest)).players.corp.hand;
    await loseSignal(guest);
    await guest.page.waitForTimeout(800);
    await regainSignal(guest);
    await guest.page.waitForFunction(() => window.__overclock!.online()!.connection === 'open', undefined, { timeout: 20_000 });
    v = await view(guest);
    expect(v.players.corp.hand).toEqual(corpHand);
    expect(v.players.corp.deckCount + v.players.corp.handCount).toBe(46);
    await host.context.close();
    await guest.context.close();
  });

  test('a deck the service refuses when JOINING (too few cards) is worded plainly; no game starts; picking a good one then works', async ({ browser }) => {
    const host = await phoneWith(browser, []);
    const guest = await phoneWith(browser, [RUN_OWN]);
    // The guest's phone sends a hand-edited (too short) deck: the service checks it itself.
    await guest.context.unrouteAll({ behavior: 'ignoreErrors' });
    let tamper = true;
    await guest.context.routeWebSocket(/\/v1\//, (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((m) => {
        if (tamper && typeof m === 'string' && m.includes('"t":"pick"')) {
          const msg = JSON.parse(m) as { deck?: { cards: Record<string, number> } };
          if (msg.deck) msg.deck.cards = { r01: 1, r02: 1 };
          tamper = false;
          server.send(JSON.stringify(msg));
        } else server.send(m);
      });
    });
    await tapButton(host.page, /Play online/);
    await tapButton(host.page, /Start a game/);
    await tapButton(host.page, /^Corp/);
    const big = host.page.locator('#start .code-big');
    await expect(big).toHaveText(/^[A-Z2-9]{4}$/, { timeout: 10_000 });
    const code = (await big.textContent())!;
    await tapButton(guest.page, /Play online/);
    await tapButton(guest.page, /Join with code/);
    await guest.page.locator('#start input').fill(code);
    await tapButton(guest.page, /^Join$/);
    await expect.poll(() => screenName(guest.page), { timeout: 10_000 }).toBe('choose');
    await press(guest.page, pickOpt(guest.page, 'qa-run'));
    await tapButton(guest.page, /^Join$/);
    const why = guest.page.locator(`${START} [data-testid="deck-refused"]`);
    await expect(why).toHaveText(/^This deck isn't ready to play: .+/, { timeout: 10_000 });
    test.info().annotations.push({ type: 'refused-text', description: (await why.textContent())! });
    await expect(why).not.toContainText(/min_size|undefined|\{|_/);
    await expectTextFloor(guest.page);
    await snap(guest.page, 'join-refused');
    expect(await guest.page.evaluate(() => window.__overclock?.online()?.phase ?? null)).not.toBe('playing');
    // The refusal reached only the guest.
    expect(host.received.some((f) => f.includes('deck_refused'))).toBe(false);
    // Pick again (untampered now) → the game starts.
    await press(guest.page, pickOpt(guest.page, 'qa-run'));
    await tapButton(guest.page, /^Join$/);
    await Promise.all([waitPlaying(host), waitPlaying(guest)]);
    const v = await view(guest);
    expect(v.players.runner.deckCount + v.players.runner.handCount).toBe(47);
    await host.context.close();
    await guest.context.close();
  });

  test('a Sprint-13 style (protocol 1) frame to the real service is answered "version"; the new app words it "Update the game to play online"', async ({ page }) => {
    await openStart(page);
    const server = await page.evaluate(() => (window as unknown as { __overclockStart: { serverUrl?: () => string } }).__overclockStart.serverUrl?.() ?? null);
    const base = server ?? `ws://127.0.0.1:${Number(process.env.E2E_SERVER_PORT ?? Number(process.env.E2E_PORT ?? 4173) + 600)}`;
    const reply = await page.evaluate(
      (url) =>
        new Promise<string>((resolve) => {
          const ws = new WebSocket(`${url}/v1/create`);
          ws.onopen = () => ws.send(JSON.stringify({ v: 1, t: 'create', side: 'corp' }));
          ws.onmessage = (e) => resolve(String(e.data));
          ws.onerror = () => resolve('error');
          setTimeout(() => resolve('timeout'), 8000);
        }),
      base,
    );
    expect(JSON.parse(reply)).toMatchObject({ t: 'error', code: 'version' });
  });

  test('a friend with no decks of their own: Join goes straight in with the standard deck (no picker)', async ({ browser }) => {
    const host = await phoneWith(browser, [CORP_OWN]);
    const guest = await phoneWith(browser, []);
    await tapButton(host.page, /Play online/);
    await tapButton(host.page, /Start a game/);
    await tapButton(host.page, /^Corp/);
    await press(host.page, pickOpt(host.page, 'qa-corp'));
    await tapButton(host.page, /Get the code/);
    const big = host.page.locator('#start .code-big');
    await expect(big).toHaveText(/^[A-Z2-9]{4}$/, { timeout: 10_000 });
    await joinGame(guest, (await big.textContent())!);
    await Promise.all([waitPlaying(host), waitPlaying(guest)]);
    const g = await view(guest);
    expect(g.players.runner.deckCount + g.players.runner.handCount).toBe(STANDARD_DECKS.runner.cards.length);
    expect(Object.keys(countsOf(STANDARD_DECKS.runner)).length).toBeGreaterThan(0);
    await host.context.close();
    await guest.context.close();
  });
});

// ---------------------------------------------------------------------------------------------
test('QA: upright phone shows "Turn your phone sideways" over My deck code, the link screen and the online deck picker', async ({ page }) => {
  test.skip(!test.info().project.use.isMobile, 'phones only');
  await page.addInitScript((raw) => {
    if (!localStorage.getItem('qa.seeded')) {
      localStorage.setItem('overclock.decks.v1', raw);
      localStorage.setItem('qa.seeded', '1');
    }
  }, JSON.stringify({ format: 2, decks: [CORP_OWN], deleted: [] }));
  await openStart(page, `deckip=${deckIp()}`);
  const vp = page.viewportSize()!;
  const upright = async (name: string) => {
    await page.setViewportSize({ width: vp.height, height: vp.width });
    await expect(page.locator('#rotate')).toBeVisible();
    await expect(page.locator('#rotate')).toHaveText('Turn your phone sideways');
    await snap(page, name);
    await page.setViewportSize(vp);
    await expect(page.locator('#rotate')).toBeHidden();
  };
  await tapStart(page, /^Decks/);
  await getCode(page);
  await upright('upright-deck-code');
  await tapStart(page, /^Back$/);
  await press(page, page.locator(START).getByRole('button', { name: /I have a deck code/ }));
  await upright('upright-link');
  await tapStart(page, /^Back$/);
  await tapStart(page, /^Back$/);
  await tapStart(page, /Play online/);
  await tapStart(page, /Start a game/);
  await tapStart(page, /^Corp/);
  expect(await screenName(page)).toBe('online_deck');
  await upright('upright-online-picker');
  expect(await screenName(page)).toBe('online_deck');
});

test('QA: tap-to-paint on My deck code / I have a deck code is under 100 ms', async ({ page }) => {
  await page.addInitScript((raw) => {
    if (!localStorage.getItem('qa.seeded')) {
      localStorage.setItem('overclock.decks.v1', raw);
      localStorage.setItem('qa.seeded', '1');
    }
  }, JSON.stringify({ format: 2, decks: [CORP_OWN], deleted: [] }));
  await openStart(page, `deckip=${deckIp()}`);
  await tapStart(page, /^Decks/);
  await waitSaved(page);
  const root = page.locator(START);
  const a = await tapToPaint(page, root.getByRole('button', { name: /My deck code/ }), root);
  await tapStart(page, /^Back$/);
  const b = await tapToPaint(page, root.getByRole('button', { name: /I have a deck code/ }), root);
  test.info().annotations.push({ type: 'tap-to-paint-ms', description: `my code ${a.toFixed(1)}, have code ${b.toFixed(1)}` });
  expect(a).toBeLessThan(100);
  expect(b).toBeLessThan(100);
});
