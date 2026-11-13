// Sprint 6 (U5): two phones, one game, against the real service (wrangler dev,
// test mode; playwright.config.ts). S-06-1 start / join / share link,
// S-06-2 a game across two phones (own side at the bottom, backs only, moves
// arrive, not your turn, Rez / "Corp is deciding…", nothing hidden in the
// Runner's frames, game over), S-06-3 come back (network loss, away, Rejoin,
// a third phone).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Action, GameEvent, PlayerView, Side } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';
import { planToStep, runnerEventLeaks, runnerViewLeaks } from '@overclock/match/testing';
import { type Browser, expect, test } from '@playwright/test';
import { runButtonOf, tap } from './helpers';
import { type Phone, act, frames, loseSignal, regainSignal, joinGame, layoutOf, openPhone, startGame, startTestGame, tapButton, view, waitPlaying, waitView } from './online';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../server/test/fixtures');
const ONLINE = { rezWindow: 'always' } as const;

/** Attached to the report; `S06_SHOTS=<dir>` also writes them there (for review). */
async function shot(phone: Phone, name: string): Promise<void> {
  const dir = process.env.S06_SHOTS;
  const path = dir ? `${dir}/${test.info().project.name}-${name}.png` : undefined;
  await test.info().attach(name, { body: await phone.page.screenshot(path ? { path } : {}), contentType: 'image/png' });
}

/** The prelude the service accepts (it skips refused actions), as the room does. */
function accepted(seed: number, actions: readonly Action[]): Action[] {
  const m = new LocalMatch(seed, ONLINE);
  return actions.filter((a) => !m.submit(a.player, a)[a.player].events.some((e) => e.type === 'action_rejected'));
}

/** Two phones in one game: the host starts (with an optional test setup), the guest joins with real taps. */
async function twoPhones(browser: Browser, hostSide: Side, setup?: { seed: number; actions: Action[] }) {
  const host = await openPhone(browser);
  const guest = await openPhone(browser);
  const code = setup ? await startTestGame(host, hostSide, setup) : await startGame(host, hostSide);
  await joinGame(guest, code);
  await Promise.all([waitPlaying(host), waitPlaying(guest)]);
  const corp = hostSide === 'corp' ? host : guest;
  const runner = hostSide === 'corp' ? guest : host;
  return { host, guest, corp, runner, code };
}

test.describe('S-06-1 start a game, join with a code', () => {
  test('Start a game shows a code, Share and Waiting; the other phone types the code and both boards start, each on its own side', async ({ browser }) => {
    const host = await openPhone(browser);
    const guest = await openPhone(browser);
    const code = await startGame(host, 'runner');
    await expect(host.page.locator('#start').getByRole('button', { name: /Share/ })).toBeVisible();
    await expect(host.page.locator('#start')).toContainText('Waiting for the other player…');
    await shot(host, 'lobby');

    await joinGame(guest, code);
    await Promise.all([waitPlaying(host), waitPlaying(guest)]);
    // The starter picked Runner; the joiner plays the other side.
    expect((await view(host)).viewer).toBe('runner');
    expect((await view(guest)).viewer).toBe('corp');
    expect((await layoutOf(host)).viewer).toBe('runner');
    expect((await layoutOf(guest)).viewer).toBe('corp');
    await shot(guest, 'corp-board');
    await shot(host, 'runner-board');
    await host.context.close();
    await guest.context.close();
  });

  test('Share sends a link that opens the game and joins straight away', async ({ browser }) => {
    const host = await openPhone(browser);
    // The phone's share sheet, recorded (a real one needs a person to pick an app).
    await host.page.evaluate(() => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (d: ShareData) => {
          (window as unknown as { __shared: ShareData }).__shared = d;
        },
      });
    });
    const code = await startGame(host, 'corp');
    await tapButton(host.page, /Share/);
    const shared = await host.page.waitForFunction(() => (window as unknown as { __shared?: ShareData }).__shared).then((h) => h.jsonValue() as Promise<ShareData>);
    expect(shared.text).toContain(code);
    const url = new URL(shared.url!);
    expect(url.searchParams.get('join')).toBe(code);
    expect(url.pathname).toBe(new URL(host.page.url()).pathname);

    // The other phone opens the link: no taps, it joins.
    const guest = await openPhone(browser, `join=${code}`);
    await Promise.all([waitPlaying(host), waitPlaying(guest)]);
    expect((await view(guest)).viewer).toBe('runner');
    await host.context.close();
    await guest.context.close();
  });
});

test.describe('S-06-2 a whole game across two phones', () => {
  test("own side at the bottom, own hand shown, the other's hand and face-down cards only as backs", async ({ browser }) => {
    const { corp, runner } = await twoPhones(browser, 'corp');
    const rv = await view(runner);
    const cv = await view(corp);
    expect(rv.viewer).toBe('runner');
    expect(rv.players.runner.hand?.length).toBe(5);
    expect(rv.players.corp.hand ?? null).toBeNull();
    expect(cv.players.runner.hand ?? null).toBeNull();
    const rl = await layoutOf(runner);
    expect(rl.hand.map((h) => h.cardId)).toEqual(rv.players.runner.hand);

    // The Corp installs a card: it arrives face down on the Runner's phone.
    const install = cv.handOptions.flat().find((o) => o.action.type === 'install' && o.reject === null)!.action;
    await act(corp, install);
    await waitView(runner, (v) => v.corpServers.some((s) => s.ice.length + s.content.length > 0));
    const installed = (await view(runner)).corpServers.flatMap((s) => [...s.ice, ...s.content]);
    expect(installed.length).toBe(1);
    expect(installed[0]!.faceUp).toBe(false);
    expect(installed[0]!.cardId).toBeNull();
    await corp.context.close();
    await runner.context.close();
  });

  test("the other player's move shows within a second; on their turn my taps play nothing and the screen says whose turn it is", async ({ browser }) => {
    const { corp, runner } = await twoPhones(browser, 'runner');
    const before = (await view(runner)).players.corp.credits;
    const cl = await layoutOf(corp);
    const t0 = Date.now();
    await tap(corp.page, cl.corp.credits);
    await waitView(runner, (v) => v.players.corp.credits === before + 1);
    const ms = Date.now() - t0;
    test.info().annotations.push({ type: 'opponent-move-ms', description: String(ms) });
    expect(ms).toBeLessThan(1000);

    // The Runner's turn hasn't come: tapping the Stack draws nothing.
    const rl = await layoutOf(runner);
    expect(rl.text.help).toMatch(/^Corp's turn/);
    expect(rl.text.banner).toMatch(/CORP/);
    const rv = await view(runner);
    await tap(runner.page, rl.runner.deck);
    await runner.page.waitForFunction(() => !window.__overclock!.online()!.busy);
    await runner.page.waitForTimeout(300);
    const after = await view(runner);
    expect(after.players.runner.handCount).toBe(rv.players.runner.handCount);
    expect(after.players.runner.deckCount).toBe(rv.players.runner.deckCount);
    await shot(runner, 'not-your-turn');
    await corp.context.close();
    await runner.context.close();
  });

  test('a run reaches face-down ICE: the Corp gets Rez / Don\'t rez, the Runner sees "Corp is deciding…"; nothing hidden reaches the Runner', async ({ browser }) => {
    const seed = 1;
    const prelude = planToStep(seed, 'corp_rez_prompt').actions.slice();
    const { corp, runner } = await twoPhones(browser, 'corp', { seed, actions: prelude });
    await waitView(runner, (v) => v.run?.waitingOn === 'corp');
    const cl = await layoutOf(corp);
    const labels = cl.run!.buttons.map((b) => b.label);
    expect(labels).toEqual(expect.arrayContaining([expect.stringMatching(/^Rez /), "Don't rez"]));
    expect(cl.run!.buttons.find((b) => b.label.startsWith('Rez '))!.lit).toBe(true);
    const rl = await layoutOf(runner);
    expect(rl.run!.stepLabel).toBe('Corp is deciding…');
    expect(rl.run!.buttons).toEqual([]);
    await shot(corp, 'corp-rez-choice');
    await shot(runner, 'runner-corp-deciding');

    await tap(corp.page, runButtonOf(cl, "Don't rez").box);
    await waitView(runner, (v) => v.run === null || v.run.waitingOn === 'runner');

    // Every frame the Runner's phone got matches the game rebuilt from the same moves, and names no hidden Corp card.
    const leaks = checkRunnerFrames(seed, accepted(seed, prelude), corp, runner);
    expect(leaks).toEqual([]);
    await corp.context.close();
    await runner.context.close();
  });

  test("the Corp can't pay: Rez is dim, the Runner still just sees \"Corp is deciding…\", and the game moves on by itself", async ({ browser }) => {
    const fixture = JSON.parse(readFileSync(join(FIXTURES, 'corp-only-pass.json'), 'utf8')) as { seed: number; actions: Action[] };
    const { corp, runner } = await twoPhones(browser, 'runner', fixture);
    await waitView(runner, (v) => v.run?.waitingOn === 'corp');
    const cl = await layoutOf(corp);
    const rez = cl.run!.buttons.find((b) => b.label.startsWith('Rez '));
    expect(rez, 'Rez shows').toBeTruthy();
    expect(rez!.lit, 'Rez is dim (not enough credits)').toBe(false);
    const rl = await layoutOf(runner);
    expect(rl.run!.stepLabel).toBe('Corp is deciding…');
    await shot(corp, 'corp-cannot-pay');
    // The service answers Don't rez for the Corp after 1.2-2.4 s.
    const t0 = Date.now();
    await waitView(runner, (v) => v.run === null || v.run.waitingOn === 'runner');
    const ms = Date.now() - t0;
    test.info().annotations.push({ type: 'auto-pass-ms', description: String(ms) });
    expect(ms).toBeLessThan(4000);
    expect(checkRunnerFrames(fixture.seed, accepted(fixture.seed, fixture.actions), corp, runner)).toEqual([]);
    await corp.context.close();
    await runner.context.close();
  });

  test('someone wins: both phones show who won and Back to start', async ({ browser }) => {
    // Played ahead to one action before the Corp draws from an empty R&D.
    const seed = 4;
    const { actions, last } = planToDeckOut(seed);
    const { corp, runner } = await twoPhones(browser, 'corp', { seed, actions });
    const actor = last.player === 'corp' ? corp : runner;
    await act(actor, last);
    for (const p of [corp, runner]) {
      await p.page.waitForFunction(() => window.__overclock!.layout().gameOver !== null);
      const go = (await layoutOf(p)).gameOver!;
      expect(go.title).toBe('Runner wins');
      expect(go.button).toBe('Back to start');
    }
    await shot(runner, 'game-over');
    // Back to start: the start screen, and the finished game isn't offered for Rejoin.
    await tap(runner.page, (await layoutOf(runner)).gameOver!.buttonBox);
    await runner.page.waitForFunction(() => document.body.dataset.ready === 'true' && window.__overclockStart?.screen() === 'home');
    await expect(runner.page.locator('#start').getByRole('button', { name: /Rejoin/ })).toHaveCount(0);
    await corp.context.close();
    await runner.context.close();
  });
});

test.describe('S-06-3 come back after switching away', () => {
  test('signal lost for a while: the board catches up by itself and play goes on', async ({ browser }) => {
    const { corp, runner } = await twoPhones(browser, 'corp');
    const credits = (await view(runner)).players.corp.credits;
    await loseSignal(runner);
    await runner.page.waitForFunction(() => window.__overclock!.online()!.connection === 'reconnecting');
    await runner.page.waitForFunction(() => window.__overclock!.layout().status?.text === 'Reconnecting…');
    await shot(runner, 'reconnecting');
    // The service sees the Runner gone; the Corp plays on meanwhile.
    await corp.page.waitForFunction(() => window.__overclock!.layout().status?.text === 'Waiting for the other player to come back…');
    await act(corp, { type: 'gain_credit', player: 'corp' });
    await act(corp, { type: 'gain_credit', player: 'corp' });
    await runner.page.waitForTimeout(1500);
    expect((await view(runner)).players.corp.credits).toBe(credits);
    await regainSignal(runner);
    await waitView(runner, (v) => v.players.corp.credits === credits + 2);
    await runner.page.waitForFunction(() => window.__overclock!.online()!.connection === 'open');
    // It came back through a new connection that resumed its seat (not a socket that never noticed).
    expect(frames(runner.sent).filter((f) => f.t === 'resume').length).toBeGreaterThan(0);
    // And play goes on from the Runner's phone too.
    await act(corp, { type: 'end_turn', player: 'corp' });
    await waitView(corp, (v) => v.activePlayer === 'runner' || v.pendingDiscard > 0);
    await corp.context.close();
    await runner.context.close();
  });

  test('the other player away: "Waiting for the other player to come back…"; after a full close, Rejoin puts them back in their seat', async ({ browser }) => {
    const { corp, runner, code } = await twoPhones(browser, 'corp');
    const before = await view(runner);
    // The Runner's app is closed.
    await runner.page.close();
    await corp.page.waitForFunction(() => window.__overclock!.layout().status?.text === 'Waiting for the other player to come back…');
    await shot(corp, 'opponent-away');
    // Opened again: the start screen offers Rejoin.
    const page = await runner.context.newPage();
    const back: Phone = { ...runner, page };
    await page.goto('./');
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
    const rejoin = page.locator('#start').getByRole('button', { name: new RegExp(`Rejoin game ${code}`) });
    await expect(rejoin).toBeVisible();
    await shot(back, 'rejoin');
    await tapButton(page, /Rejoin game/);
    await waitPlaying(back);
    expect((await view(back)).viewer).toBe('runner');
    expect((await view(back)).players.runner.hand).toEqual(before.players.runner.hand);
    await corp.page.waitForFunction(() => window.__overclock!.layout().status === null);
    await corp.context.close();
    await runner.context.close();
  });

  test("the phone's Back button: Leave the game? keeps the seat, and the start screen offers Rejoin", async ({ browser }) => {
    const { corp, runner, code } = await twoPhones(browser, 'corp');
    expect(await runner.page.evaluate(() => window.__overclock!.back())).toBe('ask_leave');
    const d = (await layoutOf(runner)).dialog!;
    expect(d.title).toBe('Leave the game?');
    expect(d.text).toBe('You can come back with Rejoin on the start screen.');
    await tap(runner.page, d.buttons.find((b) => b.label === 'Leave')!.box);
    await runner.page.waitForFunction(() => document.body.dataset.ready === 'true' && window.__overclockStart?.screen() === 'home');
    await expect(runner.page.locator('#start').getByRole('button', { name: new RegExp(`Rejoin game ${code}`) })).toBeVisible();
    await expect(runner.page.locator('#start')).toBeVisible();
    await corp.page.waitForFunction(() => window.__overclock!.layout().status?.text === 'Waiting for the other player to come back…');
    await corp.context.close();
    await runner.context.close();
  });

  test("a third phone with the code can't take anyone's seat", async ({ browser }) => {
    const { corp, runner, code } = await twoPhones(browser, 'corp');
    const third = await openPhone(browser);
    await joinGame(third, code);
    await expect(third.page.locator('#start .error')).toHaveText('That game already has two players');
    expect(await third.page.evaluate(() => typeof window.__overclock)).toBe('undefined');
    // Both players still play.
    await act(corp, { type: 'gain_credit', player: 'corp' });
    await waitView(runner, (v) => v.players.corp.credits >= 6);
    for (const p of [corp, runner, third]) await p.context.close();
  });
});

/**
 * Plays `seed` (online rules) the dumb way until the Corp draws from an empty
 * R&D; returns every action but the one that ends it.
 */
function planToDeckOut(seed: number): { actions: Action[]; last: Action } {
  const m = new LocalMatch(seed, ONLINE);
  const actions: Action[] = [];
  for (let guard = 0; guard < 2000; guard++) {
    const active = m.view('corp').activePlayer;
    const v = m.view(active);
    const runner = m.view('runner');
    // The Runner never runs; a run would wait on the Corp.
    let a: Action;
    if (runner.run) a = { type: 'pass', player: runner.run.waitingOn };
    else if (v.pendingDiscard > 0) {
      const n = v.players[active].handCount;
      a = { type: 'discard', player: active, handIndices: Array.from({ length: v.pendingDiscard }, (_, k) => n - v.pendingDiscard + k) };
    } else if (active === 'corp' && v.legalActions.some((x) => x.type === 'draw')) a = { type: 'draw', player: 'corp' };
    else a = { type: 'end_turn', player: active };
    const u = m.submit(a.player, a);
    if (u[a.player].view.result) return { actions, last: a };
    actions.push(a);
  }
  throw new Error('no deck-out');
}

/**
 * Rebuilds the game at every `seq` the Runner's phone received (prelude + each
 * accepted move: the Corp's or Runner's own acked `act`, else the service's
 * auto-pass) and checks each Runner view and event list for hidden Corp cards.
 */
function checkRunnerFrames(seed: number, prelude: Action[], corp: Phone, runner: Phone): string[] {
  const sentBy = (p: Phone) => new Map(frames(p.sent).filter((f) => f.t === 'act').map((f) => [f.id!, f.action!]));
  const corpActs = sentBy(corp);
  const runnerActs = sentBy(runner);
  const corpAcks = new Map(frames(corp.received).filter((f) => f.t === 'update' && f.ack !== undefined).map((f) => [f.seq!, f.ack!]));
  const rframes = frames(runner.received).filter((f) => f.t === 'sync' || f.t === 'update' || f.t === 'rejected');
  const bySeq = new Map<number, Action>();
  for (const f of frames(runner.received)) {
    if (f.t !== 'update') continue;
    const action = f.ack !== undefined ? runnerActs.get(f.ack) : corpAcks.has(f.seq!) ? corpActs.get(corpAcks.get(f.seq!)!) : ({ type: 'pass', player: 'corp' } as Action);
    if (action) bySeq.set(f.seq!, action);
  }
  const out: string[] = [];
  expect(rframes.length).toBeGreaterThan(0);
  let seq = prelude.length;
  for (const f of rframes) {
    if (f.t !== 'rejected') seq = f.seq!;
    const moves = [...prelude];
    for (let s = prelude.length + 1; s <= seq; s++) moves.push(bySeq.get(s)!);
    const match = LocalMatch.restore(seed, moves, ONLINE);
    const state = match.snapshot();
    const v = f.view as PlayerView;
    for (const l of runnerViewLeaks(state, v)) out.push(`seq ${seq} ${f.t} view: ${l}`);
    for (const l of runnerEventLeaks((f.events ?? []) as GameEvent[], state)) out.push(`seq ${seq} ${f.t} events: ${l}`);
    // The frame is exactly the projection of that state.
    if (f.t !== 'rejected') expect(JSON.stringify(v), `seq ${seq} view is the Runner's projection`).toBe(JSON.stringify(match.view('runner')));
  }
  return out;
}
