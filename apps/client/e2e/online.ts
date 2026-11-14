// Sprint 6 (U5): helpers for two-phone e2e. Each phone is its own browser
// context (own storage, own socket), sized like the project's phone. The
// service is the local `wrangler dev` from playwright.config.ts (test mode).
import { type Browser, type BrowserContext, type Page, type WebSocket as PwSocket, expect, test } from '@playwright/test';
import type { Action, GameEvent, PlayerView, Side } from '@overclock/engine';
import type { LayoutSnapshot } from './helpers';

export interface Phone {
  context: BrowserContext;
  page: Page;
  /** Every frame this phone's game socket(s) received / sent, in order (text frames only). */
  received: string[];
  sent: string[];
  /** While true, the phone has no signal: its game sockets are cut and new ones fail. */
  noSignal: boolean;
  /** Cuts every game socket this phone has open (both ends see it drop). */
  cut: () => void;
}

/** A new phone (context) like the current project's, on the start screen. */
export async function openPhone(browser: Browser, query = ''): Promise<Phone> {
  const use = test.info().project.use;
  const context = await browser.newContext({
    viewport: use.viewport ?? null,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    baseURL: use.baseURL,
  });
  const page = await context.newPage();
  const links: { close: () => Promise<void> }[] = [];
  const phone: Phone = {
    context,
    page,
    received: [],
    sent: [],
    noSignal: false,
    cut: () => {
      for (const l of links.splice(0)) void l.close();
    },
  };
  // Game sockets pass through the test, so "no signal" can really cut them
  // (the browser's offline switch leaves open sockets alone).
  await context.routeWebSocket(/\/v1\//, (ws) => {
    if (phone.noSignal) {
      void ws.close({ code: 1006, reason: 'no signal' }).catch(() => undefined);
      return;
    }
    const server = ws.connectToServer();
    links.push({
      close: async () => {
        await server.close().catch(() => undefined);
        await ws.close({ code: 1006, reason: 'no signal' }).catch(() => undefined);
      },
    });
  });
  page.on('websocket', (ws: PwSocket) => {
    ws.on('framereceived', (f) => {
      if (typeof f.payload === 'string') phone.received.push(f.payload);
    });
    ws.on('framesent', (f) => {
      if (typeof f.payload === 'string') phone.sent.push(f.payload);
    });
  });
  await page.goto(`./${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
  return phone;
}

/** The phone loses its signal: open game sockets drop, new ones fail, the browser goes offline. */
export async function loseSignal(phone: Phone): Promise<void> {
  phone.noSignal = true;
  await phone.context.setOffline(true);
  phone.cut();
}

/** The signal is back. */
export async function regainSignal(phone: Phone): Promise<void> {
  phone.noSignal = false;
  await phone.context.setOffline(false);
}

export async function tapButton(page: Page, name: string | RegExp): Promise<void> {
  const b = page.locator('#start').getByRole('button', { name });
  if (test.info().project.use.hasTouch) await b.tap();
  else await b.click();
}

/** Starts a game from the start screen with real taps; returns the code shown in the lobby. */
export async function startGame(phone: Phone, side: Side): Promise<string> {
  await tapButton(phone.page, /Play online/);
  await tapButton(phone.page, /Start a game/);
  await tapButton(phone.page, side === 'corp' ? /^Corp/ : /^Runner/);
  return lobbyCode(phone);
}

/** Starts a game with a fixed deal and a prelude of actions (service test mode); returns the code. */
export async function startTestGame(phone: Phone, side: Side, test: { seed: number; actions: Action[] }): Promise<string> {
  await phone.page.evaluate(({ side, test }) => window.__overclockStart!.startOnline(side, test), { side, test });
  return lobbyCode(phone);
}

async function lobbyCode(phone: Phone): Promise<string> {
  const code = phone.page.locator('#start .code-big');
  await expect(code).toHaveText(/^[A-Z2-9]{4}$/);
  return (await code.textContent())!;
}

/** Joins with real taps: Play online, Join with code, type it, Join. */
export async function joinGame(phone: Phone, code: string): Promise<void> {
  await tapButton(phone.page, /Play online/);
  await tapButton(phone.page, /Join with code/);
  await phone.page.locator('#start input').fill(code);
  await tapButton(phone.page, /^Join$/);
}

/** Waits until this phone's online game is on the board. */
export async function waitPlaying(phone: Phone): Promise<void> {
  await phone.page.waitForFunction(() => window.__overclock?.online()?.phase === 'playing');
  await expect(phone.page.locator('#start')).toBeHidden();
}

export function view(phone: Phone): Promise<PlayerView> {
  return phone.page.evaluate(() => window.__overclock!.getView());
}

export function layoutOf(phone: Phone): Promise<LayoutSnapshot> {
  return phone.page.evaluate(() => window.__overclock!.layout());
}

/** Sends an action from this phone (as a tap would) and waits for the server's answer. */
export async function act(phone: Phone, action: Action): Promise<void> {
  await phone.page.waitForFunction(() => !window.__overclock!.online()!.busy && window.__overclock!.online()!.connection === 'open');
  await phone.page.evaluate((a) => window.__overclock!.dispatch(a), action);
  await phone.page.waitForFunction(() => !window.__overclock!.online()!.busy);
}

/** Waits until `pred` holds for this phone's view (polled from the test: the page's CSP forbids string eval). */
export async function waitView(phone: Phone, pred: (v: PlayerView) => boolean, timeout = 10_000): Promise<PlayerView> {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await view(phone);
    if (pred(v)) return v;
    if (Date.now() > until) throw new Error(`view never matched ${pred.toString()}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

export interface ParsedFrame {
  t: string;
  seq?: number;
  ack?: number;
  view?: PlayerView;
  events?: GameEvent[];
  id?: number;
  action?: Action;
}

export function frames(list: readonly string[]): ParsedFrame[] {
  return list.filter((f) => f.startsWith('{') && !f.includes('"t":"ping"') && !f.includes('"t":"pong"')).map((f) => JSON.parse(f) as ParsedFrame);
}
