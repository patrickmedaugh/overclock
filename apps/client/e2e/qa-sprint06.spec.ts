// QA Sprint 6 (written by QA, not the developers): two phones against the real
// service (local `wrangler dev`, test mode; playwright.config.ts) and the
// pass-the-phone cover. Screenshots go to docs/sprints/sprint-06-qa/.
//
// - S-06-2: a longer game played from both phones; EVERY frame either phone's
//   socket received is compared with that seat's projection of the true game
//   (rebuilt from the test seed + the accepted moves), events included; no
//   frame carries the other seat's token.
// - S-06-2: not your turn: real taps on the waiting phone send nothing.
// - S-06-3: reload mid-game -> Rejoin -> the same seat and board, play goes on;
//   a third phone while a player is away; a whole opponent turn missed offline.
// - S-06-5: frame by frame, End turn / rez decision never shows the next
//   player's board before the cover; a tap on the cover where End turn sits
//   only lifts it.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Action, Side } from '@overclock/engine';
import { LocalMatch } from '@overclock/match';
import { planToStep } from '@overclock/match/testing';
import { type Page, expect, test } from '@playwright/test';
import { getView, layout, runButtonOf, tap, waitEndTurnArmed, waitIdle } from './helpers';
import { type Phone, act, frames, joinGame, layoutOf, loseSignal, openPhone, regainSignal, startTestGame, tapButton, view, waitPlaying, waitView } from './online';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-06-qa');
const ONLINE = { rezWindow: 'always' } as const;

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${test.info().project.name}-${name}.png`) });
}

function prng(seed: number): (n: number) => number {
  let x = (seed * 2654435761) >>> 0 || 7;
  return (n) => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x % n;
  };
}

async function twoPhones(browser: Parameters<typeof openPhone>[0], hostSide: Side, setup: { seed: number; actions: Action[] }) {
  const host = await openPhone(browser);
  const guest = await openPhone(browser);
  const code = await startTestGame(host, hostSide, setup);
  await joinGame(guest, code);
  await Promise.all([waitPlaying(host), waitPlaying(guest)]);
  const corp = hostSide === 'corp' ? host : guest;
  const runner = hostSide === 'corp' ? guest : host;
  return { corp, runner, code };
}

function tokenOf(p: Phone): string {
  const s = frames(p.received).find((f) => f.t === 'seated') as unknown as { token: string } | undefined;
  return s!.token;
}

/**
 * Rebuilds the true game at every frame `seat`'s phone received and checks the
 * frame is exactly that seat's projection (view and, for updates, events).
 * Accepted move at seq s: the receiver's own acked act, else the other phone's
 * acked act at s, else the service's Don't rez for the Corp.
 */
function checkFrames(seed: number, prelude: Action[], me: Phone, other: Phone, seat: Side): { checked: number; problems: string[] } {
  const actsOf = (p: Phone) => new Map(frames(p.sent).filter((f) => f.t === 'act').map((f) => [f.id!, f.action!]));
  const mine = actsOf(me);
  const theirs = actsOf(other);
  const theirAcks = new Map(frames(other.received).filter((f) => f.t === 'update' && f.ack !== undefined).map((f) => [f.seq!, f.ack!]));
  const bySeq = new Map<number, Action>();
  for (const f of frames(me.received)) {
    if (f.t !== 'update') continue;
    const a = f.ack !== undefined ? mine.get(f.ack) : theirAcks.has(f.seq!) ? theirs.get(theirAcks.get(f.seq!)!) : ({ type: 'pass', player: 'corp' } as Action);
    bySeq.set(f.seq!, a!);
  }
  const problems: string[] = [];
  let checked = 0;
  let seq = prelude.length;
  for (const f of frames(me.received)) {
    if (f.t !== 'sync' && f.t !== 'update' && f.t !== 'rejected') continue;
    if (f.t !== 'rejected') seq = f.seq!;
    const moves = [...prelude];
    for (let s = prelude.length + 1; s <= seq; s++) moves.push(bySeq.get(s)!);
    if (f.t === 'update') {
      const before = LocalMatch.restore(seed, moves.slice(0, -1), ONLINE);
      const last = moves[moves.length - 1]!;
      const u = before.submit(last.player, last);
      if (JSON.stringify(u[seat].view) !== JSON.stringify(f.view)) problems.push(`seq ${seq} update: view is not the ${seat}'s projection`);
      if (JSON.stringify(u[seat].events) !== JSON.stringify(f.events)) problems.push(`seq ${seq} update: events are not the ${seat}'s projection`);
    } else {
      const m = LocalMatch.restore(seed, moves, ONLINE);
      if (f.t === 'sync' && JSON.stringify(m.view(seat)) !== JSON.stringify(f.view)) problems.push(`seq ${seq} sync: view is not the ${seat}'s projection`);
      if (f.t === 'rejected' && JSON.stringify(m.view(seat)) !== JSON.stringify(f.view)) problems.push(`seq ${seq} rejected: view is not the ${seat}'s projection`);
    }
    checked++;
  }
  return { checked, problems };
}

/** The phone whose turn / decision it is, and an action from its own view. */
async function nextMove(corp: Phone, runner: Phone, pick: (n: number) => number): Promise<{ phone: Phone; action: Action } | null> {
  for (const phone of [corp, runner]) {
    const v = await view(phone);
    if (v.result) return null;
    const legal = v.legalActions;
    if (legal.length === 0) continue;
    const runs = legal.filter((a) => a.type === 'run');
    const notEnd = legal.filter((a) => a.type !== 'end_turn');
    let action: Action;
    if (runs.length > 0 && pick(3) === 0) action = runs[pick(runs.length)]!;
    else if (notEnd.length > 0 && pick(6) !== 0) action = notEnd[pick(notEnd.length)]!;
    else action = legal[pick(legal.length)]!;
    return { phone, action };
  }
  return null;
}

test.describe('QA S-06-2 hidden information over a longer game', () => {
  test('every frame both phones receive is exactly their own projection; no token crosses over', async ({ browser }) => {
    test.setTimeout(180_000);
    const seed = 606;
    const { corp, runner } = await twoPhones(browser, 'runner', { seed, actions: [] });
    const pick = prng(seed);
    let moves = 0;
    let runs = 0;
    let midShot = false;
    for (let i = 0; i < 90; i++) {
      const next = await nextMove(corp, runner, pick);
      if (!next) {
        // The Corp's pass-only window may be answered by the service: wait for it.
        await corp.page.waitForTimeout(150);
        continue;
      }
      if (next.action.type === 'run') runs++;
      const seqBefore = frames(next.phone.received).filter((f) => f.t === 'update').length;
      await act(next.phone, next.action);
      if (frames(next.phone.received).filter((f) => f.t === 'update').length > seqBefore) moves++;
      if (!midShot && moves >= 30) {
        midShot = true;
        await corp.page.waitForTimeout(400);
        await shot(corp.page, '03-online-corp-mid-game');
        await shot(runner.page, '04-online-runner-mid-game');
      }
    }
    test.info().annotations.push({ type: 'qa-moves', description: JSON.stringify({ moves, runs }) });
    expect(moves).toBeGreaterThan(40);
    expect(runs).toBeGreaterThan(0);
    const r = checkFrames(seed, [], runner, corp, 'runner');
    const c = checkFrames(seed, [], corp, runner, 'corp');
    test.info().annotations.push({ type: 'qa-frames', description: JSON.stringify({ runner: r.checked, corp: c.checked }) });
    expect(r.problems).toEqual([]);
    expect(c.problems).toEqual([]);
    expect(r.checked).toBeGreaterThan(40);
    expect(c.checked).toBeGreaterThan(40);
    // Seat tokens: each phone gets only its own.
    expect(runner.received.some((f) => f.includes(tokenOf(corp)))).toBe(false);
    expect(corp.received.some((f) => f.includes(tokenOf(runner)))).toBe(false);
    // Nothing but protocol frames on the wire (no debug state).
    for (const f of [...runner.received, ...corp.received]) expect(f).not.toMatch(/"(seed|rng|deck)"\s*:/);
    await corp.context.close();
    await runner.context.close();
  });
});

test.describe('QA S-06-2 screens: Corp is deciding / game over on both phones', () => {
  test('rez decision on both phones (screenshots); Corp\'s Rez and the Runner\'s board', async ({ browser }) => {
    const seed = 1;
    const prelude = planToStep(seed, 'corp_rez_prompt').actions.slice();
    const { corp, runner } = await twoPhones(browser, 'corp', { seed, actions: prelude });
    await waitView(runner, (v) => v.run?.waitingOn === 'corp');
    await corp.page.waitForTimeout(400);
    const rl = await layoutOf(runner);
    expect(rl.run!.stepLabel).toBe('Corp is deciding…');
    expect(rl.run!.buttons).toEqual([]);
    // The Runner's phone has no decision of the Corp's on it.
    expect(await runner.page.evaluate(() => window.__overclock!.decision())).toBeNull();
    await shot(corp.page, '05-online-corp-rez-choice');
    await shot(runner.page, '06-online-runner-corp-is-deciding');
    // Rez it (the Corp can pay here): the Runner sees the ICE rezzed.
    const cl = await layoutOf(corp);
    await tap(corp.page, runButtonOf(cl, /^Rez /).box);
    await waitView(runner, (v) => v.run === null || v.run.waitingOn === 'runner');
    expect(checkFrames(seed, prelude, runner, corp, 'runner').problems).toEqual([]);
    await corp.context.close();
    await runner.context.close();
  });

  test('game over: both phones show who won and Back to start (screenshots)', async ({ browser }) => {
    const seed = 4;
    const m = new LocalMatch(seed, ONLINE);
    const actions: Action[] = [];
    let last: Action | null = null;
    for (let guard = 0; guard < 2000 && !last; guard++) {
      const active = m.view('corp').activePlayer;
      const v = m.view(active);
      let a: Action;
      if (v.pendingDiscard > 0) {
        const n = v.players[active].handCount;
        a = { type: 'discard', player: active, handIndices: Array.from({ length: v.pendingDiscard }, (_, k) => n - v.pendingDiscard + k) };
      } else if (active === 'corp' && v.legalActions.some((x) => x.type === 'draw')) a = { type: 'draw', player: 'corp' };
      else a = { type: 'end_turn', player: active };
      const u = m.submit(a.player, a);
      if (u[a.player].view.result) last = a;
      else actions.push(a);
    }
    const { corp, runner } = await twoPhones(browser, 'runner', { seed, actions });
    await act(last!.player === 'corp' ? corp : runner, last!);
    for (const p of [corp, runner]) {
      await p.page.waitForFunction(() => window.__overclock!.layout().gameOver !== null);
      const go = (await layoutOf(p)).gameOver!;
      expect(go.title).toBe('Runner wins');
      expect(go.button).toBe('Back to start');
    }
    await corp.page.waitForTimeout(500);
    await shot(corp.page, '07-online-game-over-corp');
    await shot(runner.page, '08-online-game-over-runner');
    // Back to start on the Corp: start screen, no Rejoin for a finished game.
    await tap(corp.page, (await layoutOf(corp)).gameOver!.buttonBox);
    await corp.page.waitForFunction(() => window.__overclockStart?.screen() === 'home');
    await expect(corp.page.locator('#start').getByRole('button', { name: /Rejoin/ })).toHaveCount(0);
    await corp.context.close();
    await runner.context.close();
  });
});

test.describe('QA S-06-2 not your turn', () => {
  test("the waiting phone's real taps (credits, Stack, hand card, End turn spot) send nothing and change nothing", async ({ browser }) => {
    const { corp, runner } = await twoPhones(browser, 'corp', { seed: 7, actions: [] });
    const rv = await view(runner);
    const rl = await layoutOf(runner);
    expect(rl.text.help).toMatch(/Corp's turn/);
    const sentBefore = frames(runner.sent).filter((f) => f.t === 'act').length;
    const boxes = [rl.runner.credits, rl.runner.deck, ...rl.hand.slice(0, 2).map((h) => h.box)];
    if (rl.endTurn) boxes.push(rl.endTurn.box);
    for (const b of boxes) {
      await tap(runner.page, b);
      await runner.page.waitForTimeout(150);
      // Each tap is answered at once with a plain "Not your turn".
      expect((await layoutOf(runner)).hint?.text).toBe('Not your turn');
    }
    const cl = await layoutOf(corp);
    expect(cl.text.help).not.toMatch(/Corp's turn/);
    await runner.page.waitForTimeout(300);
    const sent = frames(runner.sent).filter((f) => f.t === 'act').length - sentBefore;
    const after = await view(runner);
    const accepted = frames(runner.received).filter((f) => f.t === 'update').length;
    test.info().annotations.push({ type: 'qa-not-your-turn', description: JSON.stringify({ sent, accepted }) });
    expect(accepted, 'nothing was played').toBe(0);
    expect(after.players.runner).toEqual(rv.players.runner);
    expect(after.activePlayer).toBe('corp');
    await shot(runner.page, '09-online-runner-not-your-turn');
    // The hint goes; the line says whose turn it is again.
    await runner.page.waitForFunction(() => /Corp's turn/.test(window.__overclock!.layout().text.help), undefined, { timeout: 6000 });
    // The Corp still plays normally.
    await act(corp, { type: 'gain_credit', player: 'corp' });
    await waitView(runner, (v) => v.players.corp.credits === rv.players.corp.credits + 1);
    await corp.context.close();
    await runner.context.close();
  });

  test('a move on my own turn reaches my board and the other phone fast (local service)', async ({ browser }) => {
    const { corp, runner } = await twoPhones(browser, 'corp', { seed: 7, actions: [] });
    const before = (await view(corp)).players.corp.credits;
    const cl = await layoutOf(corp);
    const t0 = Date.now();
    await tap(corp.page, cl.corp.credits);
    await waitView(corp, (v) => v.players.corp.credits === before + 1);
    const own = Date.now() - t0;
    await waitView(runner, (v) => v.players.corp.credits === before + 1);
    const other = Date.now() - t0;
    test.info().annotations.push({ type: 'qa-move-ms', description: JSON.stringify({ own, other }) });
    expect(other).toBeLessThan(1000);
    await corp.context.close();
    await runner.context.close();
  });
});

test.describe('QA S-06-3 coming back', () => {
  test('reload mid-game: Rejoin game CODE puts the Runner back in its seat with the same board; play goes on', async ({ browser }) => {
    const { corp, runner, code } = await twoPhones(browser, 'corp', { seed: 11, actions: [] });
    await act(corp, { type: 'gain_credit', player: 'corp' });
    await waitView(runner, (v) => v.players.corp.credits === 6);
    const before = await view(runner);
    await runner.page.reload();
    await runner.page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
    await corp.page.waitForFunction(() => window.__overclock!.layout().status?.text === 'Waiting for the other player to come back…');
    await shot(corp.page, '10-online-waiting-for-other-player');
    const rejoin = runner.page.locator('#start').getByRole('button', { name: new RegExp(`Rejoin game ${code}`) });
    await expect(rejoin).toBeVisible();
    await shot(runner.page, '11-start-rejoin');
    // While the Runner is on its start screen, a third phone can't take the empty-looking seat.
    const third = await openPhone(browser);
    await joinGame(third, code);
    await expect(third.page.locator('#start .error')).toHaveText('That game already has two players');
    await third.context.close();
    await tapButton(runner.page, /Rejoin game/);
    await waitPlaying(runner);
    const back = await view(runner);
    expect(back).toEqual(before);
    await corp.page.waitForFunction(() => window.__overclock!.layout().status === null);
    // Play on: Corp ends its turn, the Runner (rejoined) acts.
    await act(corp, { type: 'end_turn', player: 'corp' });
    const cv = await view(corp);
    if (cv.pendingDiscard > 0) {
      const n = cv.players.corp.handCount;
      await act(corp, { type: 'discard', player: 'corp', handIndices: Array.from({ length: cv.pendingDiscard }, (_, k) => n - cv.pendingDiscard + k) });
    }
    await waitView(runner, (v) => v.activePlayer === 'runner');
    const rc = (await view(runner)).players.runner.credits;
    await act(runner, { type: 'gain_credit', player: 'runner' });
    await waitView(corp, (v) => v.players.runner.credits === rc + 1);
    await corp.context.close();
    await runner.context.close();
  });

  test('offline for the whole of the other player\'s turn: it catches up by itself and it is my turn', async ({ browser }) => {
    const { corp, runner } = await twoPhones(browser, 'corp', { seed: 12, actions: [] });
    await loseSignal(runner);
    await runner.page.waitForFunction(() => window.__overclock!.layout().status?.text === 'Reconnecting…');
    await shot(runner.page, '12-online-runner-reconnecting');
    for (let i = 0; i < 3; i++) await act(corp, { type: 'gain_credit', player: 'corp' });
    await act(corp, { type: 'end_turn', player: 'corp' });
    const cv = await view(corp);
    if (cv.pendingDiscard > 0) {
      const n = cv.players.corp.handCount;
      await act(corp, { type: 'discard', player: 'corp', handIndices: Array.from({ length: cv.pendingDiscard }, (_, k) => n - cv.pendingDiscard + k) });
    }
    const truth = await view(corp);
    expect(truth.activePlayer).toBe('runner');
    await runner.page.waitForTimeout(2000);
    await regainSignal(runner);
    const v = await waitView(runner, (x) => x.activePlayer === 'runner', 15_000);
    expect(v.players.corp.credits).toBe(truth.players.corp.credits);
    expect(v.players.runner.clicks).toBe(4);
    await runner.page.waitForFunction(() => window.__overclock!.layout().status === null);
    await act(runner, { type: 'gain_credit', player: 'runner' });
    await waitView(corp, (x) => x.players.runner.clicks === 3);
    await corp.context.close();
    await runner.context.close();
  });
});

/** Records every animation frame's (viewer, cover, bottom hand) from now on. */
async function recordFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __qaFrames: { viewer: string; cover: string | null; hand: number; decision: boolean }[]; __qaStop?: boolean };
    w.__qaFrames = [];
    w.__qaStop = false;
    const loop = () => {
      if (w.__qaStop) return;
      const l = window.__overclock!.layout();
      w.__qaFrames.push({ viewer: l.viewer, cover: l.cover?.to ?? null, hand: l.hand.length, decision: !!l.run?.buttons.some((b) => b.label === "Don't rez") });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

async function stopFrames(page: Page): Promise<{ viewer: string; cover: string | null; hand: number; decision: boolean }[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __qaFrames: { viewer: string; cover: string | null; hand: number; decision: boolean }[]; __qaStop?: boolean };
    w.__qaStop = true;
    return w.__qaFrames;
  });
}

/** `E2E_CPU_THROTTLE=6`: the page's CPU 6x slower (timing check only). */
async function throttle(page: Page): Promise<void> {
  const rate = Number(process.env.E2E_CPU_THROTTLE ?? '1');
  if (!(rate > 1)) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
}

test.describe('QA S-06-1 lobby', () => {
  test('real taps: Play online, Start a game, Runner: code, Share, waiting (screenshot)', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
    await tapButton(page, /Play online/);
    await tapButton(page, /Start a game/);
    await shot(page, '01b-start-pick-side');
    await tapButton(page, /^Runner/);
    await expect(page.locator('#start .code-big')).toHaveText(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}$/);
    await expect(page.locator('#start').getByRole('button', { name: /Share/ })).toBeVisible();
    await expect(page.locator('#start')).toContainText('Waiting for the other player…');
    await shot(page, '01c-lobby-code');
  });
});

test.describe('QA S-06-5 pass-the-phone cover', () => {
  test('from the start screen with real taps: no frame ever shows the next player\'s board before the cover; a tap on the End turn spot only lifts it', async ({ page }) => {
    await throttle(page);
    await page.goto('./?seed=3');
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclockStart);
    await shot(page, '01-start-screen');
    await tapButton(page, /Play on this phone/);
    await page.waitForFunction(() => !!window.__overclock);
    await waitIdle(page);
    expect((await layout(page)).cover).toBeNull();

    for (let turn = 0; turn < 4; turn++) {
      const l = await waitIdle(page);
      const me = l.viewer;
      // Gain a credit with a real tap, then End turn.
      const credits = (await getView(page)).players[me].credits;
      await tap(page, l[me].credits);
      await page.waitForFunction(([s, c]) => window.__overclock!.getView().players[s as 'corp'].credits === c, [me, credits + 1] as const);
      await waitIdle(page);
      await waitEndTurnArmed(page);
      await recordFrames(page);
      await tap(page, (await layout(page)).endTurn!.box);
      // A hand-size discard: pick the first card, confirm.
      let k = await layout(page);
      if (k.picker) {
        await tap(page, k.hand[0]!.box);
        k = await layout(page);
        await tap(page, k.picker!.confirm.box);
      }
      await page.waitForFunction(() => window.__overclock!.layout().cover !== null);
      await page.waitForTimeout(300);
      const fr = await stopFrames(page);
      const next = me === 'corp' ? 'runner' : 'corp';
      const peek = fr.filter((f) => f.viewer === next && f.cover === null);
      expect(peek, `no frame of the ${next}'s board without the cover`).toEqual([]);
      const c = (await layout(page)).cover!;
      expect(c.to).toBe(next);
      if (turn < 2) await shot(page, `02-cover-to-${next}-${turn}`);
      // Tap the cover exactly where End turn would be: only the cover goes.
      const v0 = await getView(page);
      const box = (await layout(page)).endTurn?.box ?? { x: 10, y: 10, width: 10, height: 10 };
      await page.evaluate(() => {
        const w = window as unknown as { __lift?: unknown };
        w.__lift = undefined;
        window.addEventListener(
          'pointerup',
          (e) => {
            const hook = window.__overclock!;
            const input = hook.lastInput();
            const stateAt = performance.now();
            const gone = hook.layout().cover === null;
            requestAnimationFrame((frameAt) => {
              w.__lift = { handledAt: input?.eventAt === e.timeStamp ? input.handledAt : NaN, stateAt, frameAt, gone, target: input?.target };
            });
          },
          { once: true },
        );
      });
      await tap(page, box);
      await page.waitForFunction(() => (window as unknown as { __lift?: unknown }).__lift !== undefined);
      const m = await page.evaluate(() => (window as unknown as { __lift: { handledAt: number; stateAt: number; frameAt: number; gone: boolean; target?: string } }).__lift);
      test.info().annotations.push({ type: 'qa-cover-lift', description: JSON.stringify({ turn, stateMs: m.stateAt - m.handledAt, frameMs: m.frameAt - m.handledAt }) });
      expect(m.target).toBe('cover');
      expect(m.gone).toBe(true);
      expect(m.frameAt - m.handledAt).toBeLessThan(100);
      expect(await getView(page)).toEqual(v0);
      expect((await layout(page)).viewer).toBe(next);
    }
  });

  test('rez decision: frame by frame the Corp choice never shows before the cover, and the Runner board never shows before the cover back', async ({ page }) => {
    await throttle(page);
    await page.goto('./?seed=1&play=here');
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__overclock);
    const plan = planToStep(1, 'corp_rez_prompt');
    // Everything but the move that opens the Corp's choice, through the hook.
    const head = plan.actions.slice(0, -1);
    const last = plan.actions[plan.actions.length - 1]!;
    const rejected = await page.evaluate((as) => {
      for (const a of as) if (window.__overclock!.dispatch(a).some((e) => e.type === 'action_rejected')) return a;
      return null;
    }, head);
    expect(rejected).toBeNull();
    // Lift any cover the head left up.
    for (let i = 0; i < 3 && (await layout(page)).cover; i++) {
      await tap(page, { x: 10, y: 10, width: 10, height: 10 });
      await page.waitForTimeout(100);
    }
    await waitIdle(page);
    await recordFrames(page);
    await page.evaluate((a) => window.__overclock!.dispatch(a), last);
    await page.waitForFunction(() => window.__overclock!.layout().cover !== null);
    await page.waitForTimeout(300);
    let fr = await stopFrames(page);
    expect(fr.filter((f) => f.decision && f.cover === null), 'Corp choice shown without the cover').toEqual([]);
    expect((await layout(page)).cover!.to).toBe('corp');
    await tap(page, { x: 10, y: 10, width: 10, height: 10 });
    await waitIdle(page);
    const l = await layout(page);
    expect(l.hand, 'no Runner cards while the Corp decides').toEqual([]);
    await recordFrames(page);
    await tap(page, runButtonOf(l, "Don't rez").box);
    await page.waitForFunction(() => window.__overclock!.layout().cover !== null);
    await page.waitForTimeout(300);
    fr = await stopFrames(page);
    expect(fr.filter((f) => !f.decision && f.cover === null && f.hand > 0), 'Runner cards shown without the cover back').toEqual([]);
    expect((await layout(page)).cover!.to).toBe('runner');
  });
});
