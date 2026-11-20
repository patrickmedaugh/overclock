// S-14-3 / S-14-4: pick your own deck for an online game. Two phones (browser contexts) against the
// local service: own vs own, own vs standard (a friend with no decks taps straight through), the
// deal survives leaving and deleting the deck, a refused deck says why, the other phone never gets
// a deck list, and another protocol version says "Update the game to play online".
import { type Browser, type Page, expect, test } from '@playwright/test';
import { PROTOCOL_VERSION } from '@overclock/protocol';
import type { StoredDeck } from '@overclock/match';
import { START, expectTextFloor, shot, standardPlus, storedDeck } from './decks';
import { type Phone, frames, joinGame, openPhone, tapButton, view, waitPlaying } from './online';

const CORP46 = storedDeck('corp46', 'corp', 'Big Corp', standardPlus('corp', { c06: 1 }));
const RUN48 = storedDeck('run48', 'runner', 'Splash Kate', standardPlus('runner', { r06: 1, r01: 1, r08: 1 }));
const SHORT = storedDeck('short', 'corp', 'Half done', standardPlus('corp', { c10: -1, c01: -3 }));

const pickOpt = (page: Page, id: string) => page.locator(`${START} [data-testid="deck-pick"][data-deck="${id}"]`);
const screen = (page: Page) => page.evaluate(() => window.__overclockStart!.screen());

/** A phone with `decks` in its store (written, then the page opened again). */
async function phoneWith(browser: Browser, decks: StoredDeck[]): Promise<Phone> {
  const p = await openPhone(browser);
  if (decks.length > 0) {
    await p.page.evaluate((raw) => localStorage.setItem('overclock.decks.v1', raw), JSON.stringify({ format: 2, decks, deleted: [] }));
    await p.page.reload();
    await p.page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
  }
  return p;
}

/** Play online → Start a game → side → (picker: `deck`, Get the code) → the lobby's code. */
async function hostWith(phone: Phone, side: 'corp' | 'runner', deck: string | null): Promise<string> {
  await tapButton(phone.page, /Play online/);
  await tapButton(phone.page, /Start a game/);
  await tapButton(phone.page, side === 'corp' ? /^Corp/ : /^Runner/);
  if (deck !== null) {
    expect(await screen(phone.page)).toBe('online_deck');
    await expect(phone.page.locator(START)).toContainText(`Pick your ${side === 'corp' ? 'Corp' : 'Runner'} deck`);
    await expect(pickOpt(phone.page, `standard-${side}`)).toHaveAttribute('aria-checked', 'true');
    const opt = pickOpt(phone.page, deck);
    if (test.info().project.use.hasTouch) await opt.tap();
    else await opt.click();
    await tapButton(phone.page, /Get the code/);
  }
  const code = phone.page.locator('#start .code-big');
  await expect(code).toHaveText(/^[A-Z2-9]{4}$/, { timeout: 10_000 });
  return (await code.textContent())!;
}

async function totals(p: Phone, side: 'corp' | 'runner'): Promise<number> {
  const v = await view(p);
  return v.players[side].handCount + v.players[side].deckCount;
}

test('own deck against own deck: each side is dealt from its own list', async ({ browser }) => {
  const host = await phoneWith(browser, [CORP46, SHORT]);
  const guest = await phoneWith(browser, [RUN48]);
  await tapButton(host.page, /Play online/);
  await expect(host.page.locator(START)).not.toContainText('standard decks for now');
  await tapButton(host.page, /^Back$/);
  const code = await (async () => {
    await tapButton(host.page, /Play online/);
    await tapButton(host.page, /Start a game/);
    await tapButton(host.page, /^Corp/);
    expect(await screen(host.page)).toBe('online_deck');
    // The unfinished deck is dimmed with its red note and can't be picked.
    await expect(pickOpt(host.page, 'short')).toHaveAttribute('data-ready', 'false');
    await expect(pickOpt(host.page, 'short')).toHaveClass(/dim/);
    await expectTextFloor(host.page);
    await shot(host.page, 's14-host-picker');
    const opt = pickOpt(host.page, 'corp46');
    if (test.info().project.use.hasTouch) await opt.tap();
    else await opt.click();
    await expect(opt).toHaveAttribute('aria-checked', 'true');
    await tapButton(host.page, /Get the code/);
    const big = host.page.locator('#start .code-big');
    await expect(big).toHaveText(/^[A-Z2-9]{4}$/, { timeout: 10_000 });
    return (await big.textContent())!;
  })();
  await joinGame(guest, code);
  await expect.poll(() => screen(guest.page), { timeout: 10_000 }).toBe('choose');
  await expect(guest.page.locator(START)).toContainText("You'll play the Runner");
  await expect(host.page.locator('#start [data-role="lobby-status"]')).toHaveText('Your friend is picking a deck…');
  await shot(guest.page, 's14-guest-picker');
  const opt = pickOpt(guest.page, 'run48');
  if (test.info().project.use.hasTouch) await opt.tap();
  else await opt.click();
  await tapButton(guest.page, /^Join$/);
  await Promise.all([waitPlaying(host), waitPlaying(guest)]);
  expect(await totals(host, 'corp')).toBe(46);
  expect(await totals(guest, 'runner')).toBe(48);
  // S-14-4: the other phone never got a deck list or the host's hidden cards.
  for (const [phone, other] of [[guest, /"c\d+"/g], [host, /"r\d+"/g]] as const) {
    for (const f of phone.received) {
      expect(f).not.toMatch(/"(deck|decks|options)"\s*:/);
      const ids = (f.match(other) ?? []).filter((id) => id !== '"c13"' && id !== '"r13"');
      expect(ids, 'hidden card ids of the other side').toEqual([]);
    }
  }
  await host.context.close();
  await guest.context.close();
});

test('own deck against a friend with no decks: the friend goes straight in with the standard deck', async ({ browser }) => {
  const host = await phoneWith(browser, [CORP46]);
  const guest = await phoneWith(browser, []);
  const code = await hostWith(host, 'corp', 'corp46');
  await joinGame(guest, code);
  await Promise.all([waitPlaying(host), waitPlaying(guest)]);
  expect(frames(guest.sent).find((f) => f.t === 'pick')).toBeDefined();
  expect(guest.sent.some((s) => s.includes('"deck"'))).toBe(false);
  expect(await totals(host, 'corp')).toBe(46);
  expect(await totals(guest, 'runner')).toBe(45);
  await host.context.close();
  await guest.context.close();
});

test('a starter with no Ready deck for the side goes straight to the code (standard deck)', async ({ browser }) => {
  const host = await phoneWith(browser, [CORP46]);
  const guest = await phoneWith(browser, [CORP46]);
  const code = await hostWith(host, 'runner', null);
  expect(frames(host.sent).find((f) => f.t === 'create')).toBeDefined();
  expect(host.sent.some((s) => s.includes('"deck"'))).toBe(false);
  // The guest has a Ready Corp deck, so they see the picker; the standard deck is picked already (one tap).
  await joinGame(guest, code);
  await expect.poll(() => screen(guest.page), { timeout: 10_000 }).toBe('choose');
  await expect(guest.page.locator(START)).toContainText("You'll play the Corp");
  await tapButton(guest.page, /^Join$/);
  await Promise.all([waitPlaying(host), waitPlaying(guest)]);
  expect(await totals(guest, 'corp')).toBe(45);
  expect(await totals(host, 'runner')).toBe(45);
  await host.context.close();
  await guest.context.close();
});

test('closing the app and deleting the deck: Continue game still plays the deck as dealt', async ({ browser }) => {
  const host = await phoneWith(browser, [CORP46]);
  const guest = await phoneWith(browser, []);
  const code = await hostWith(host, 'corp', 'corp46');
  await joinGame(guest, code);
  await Promise.all([waitPlaying(host), waitPlaying(guest)]);
  const hand = (await view(host)).players.corp.hand;
  await host.page.reload();
  await host.page.waitForFunction(() => document.body.dataset.ready === 'true' && window.__overclockStart?.screen() === 'home');
  // Delete the deck that was dealt.
  await tapButton(host.page, /^Decks/);
  await host.page.locator(`${START} [data-testid="deck-item"][data-deck="corp46"]`).click();
  await tapButton(host.page, /^Delete$/);
  await host.page.locator(`${START} [data-testid="deck-delete-dialog"]`).getByRole('button', { name: /^Delete$/ }).click();
  await tapButton(host.page, /^Back$/);
  await tapButton(host.page, new RegExp(`^Continue game · ${code}`));
  await waitPlaying(host);
  expect(await totals(host, 'corp')).toBe(46);
  expect((await view(host)).players.corp.hand).toEqual(hand);
  await host.context.close();
  await guest.context.close();
});

test('a deck the service refuses: the phone says why in plain words and no game starts', async ({ browser }) => {
  const host = await phoneWith(browser, [CORP46]);
  // A deck changed by hand on the way out (4 copies): the service checks every deck itself.
  await host.context.unrouteAll({ behavior: 'ignoreErrors' });
  await host.context.routeWebSocket(/\/v1\//, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => {
      if (typeof m === 'string' && m.includes('"t":"create"')) {
        const msg = JSON.parse(m) as { deck?: { cards: Record<string, number> } };
        if (msg.deck) msg.deck.cards['c06'] = 4;
        server.send(JSON.stringify(msg));
      } else server.send(m);
    });
  });
  await tapButton(host.page, /Play online/);
  await tapButton(host.page, /Start a game/);
  await tapButton(host.page, /^Corp/);
  const opt = pickOpt(host.page, 'corp46');
  if (test.info().project.use.hasTouch) await opt.tap();
  else await opt.click();
  await tapButton(host.page, /Get the code/);
  const why = host.page.locator(`${START} [data-testid="deck-refused"]`);
  await expect(why).toHaveText(/^This deck isn't ready to play: 4 copies of /, { timeout: 10_000 });
  expect(await screen(host.page)).toBe('online_deck');
  await expect(host.page.locator('#start .code-big')).toHaveCount(0);
  await expectTextFloor(host.page);
  await shot(host.page, 's14-refused');
  await host.context.close();
});

test('another version of the game online: "Update the game to play online"', async ({ browser }) => {
  const guest = await phoneWith(browser, []);
  await guest.context.unrouteAll({ behavior: 'ignoreErrors' });
  await guest.context.routeWebSocket(/\/v1\//, (ws) => {
    ws.onMessage(() => ws.send(JSON.stringify({ v: PROTOCOL_VERSION + 1, t: 'error', code: 'version' })));
  });
  await joinGame(guest, 'K7QF');
  await expect(guest.page.locator(START)).toContainText('Update the game to play online', { timeout: 10_000 });
  await guest.context.close();
});
