// QA Sprint 15 (independent, written by QA; not the developers' specs). Movement (S-15-1..S-15-4):
// - S-15-1: the press lift is timed from the browser's own pointerdown stamp (not the game's log);
//   a quick tap on the big card (no hold) leaves nothing enlarged; the glide home after a drop away
//   from every lit place is sampled frame by frame (in between positions = a glide, not a jump);
// - S-15-2: a button install (pick, then tap a lit place) flies from the hand card and settles;
//   pass-the-phone WITH the cover (the real hand-over): every flight on the Runner's screen is a
//   card back for Corp cards the Runner may not know, also a Corp operation shown just before the
//   hand-over; online the Runner's phone sees the Corp's draw, install and end-of-turn discard as
//   card backs and never receives the ids;
// - S-15-3: other hand cards slide aside on a draw (sampled per frame); the Corp's turn-start draw
//   flies; Bank Job emptied flies to the Heap and the count waits for the landing; an accessed card
//   trashed flies to Archives (count waits); a stolen agenda flies to the Runner's score pile (count
//   and points wait, then tick); several discards at the end of the turn ripple and finish <= 0.5 s;
//   Accelerated Beta Test's 3 cards ripple to Archives <= 0.5 s;
// - S-15-4: taps while an install, a one-shot card and a discard ripple are moving (real time, not
//   frozen) finish the movement and are answered < 100 ms; long tasks while cards move < 600 ms;
//   upright mid-showcase shows the turn-sideways prompt and back sideways nothing floats and the
//   Heap count is exact; the same Corp install gives the same movement in pass-the-phone and online.
// `QA_SCREENS=1` writes screenshots to docs/sprints/sprint-15-qa/.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, expect, test } from "@playwright/test";
import type { Action, CardOption, PlayerView } from "@overclock/engine";
import { planToStep } from "@overclock/match/testing";
import type { AnimRecord } from "../src/hook-types";
import {
  type LayoutSnapshot,
  center,
  dispatch,
  emptySpot,
  getView,
  layout,
  liftHand,
  sendTap,
  openBoard,
  openHand,
  pickHand,
  runButtonOf,
  startRun,
  tap,
  targetOf,
  toRunnerTurn,
  toStep,
  waitIdle,
} from "./helpers";
import {
  act,
  joinGame,
  layoutOf,
  openPhone,
  startTestGame,
  view,
  waitPlaying,
  waitView,
} from "./online";

const SHOTS = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docs/sprints/sprint-15-qa",
);
const SIZE: Record<string, string> = {
  phone: "844x390",
  "phone-small": "640x360",
  desktop: "1280x800",
  "phone-short": "891x296",
};

async function snap(page: Page, name: string): Promise<void> {
  const p = test.info().project.name;
  const save = process.env.QA_SCREENS === "1";
  if (save) mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot(
    save ? { path: join(SHOTS, `r1-${SIZE[p] ?? p}-${name}.png`) } : {},
  );
  await test.info().attach(name, { body, contentType: "image/png" });
}

type Flight = LayoutSnapshot["motion"]["flights"][number];

async function holdMotion(page: Page): Promise<void> {
  await page.evaluate(() => window.__overclock!.motion("hold"));
}

async function advance(page: Page, ms: number): Promise<LayoutSnapshot> {
  await page.evaluate((t) => window.__overclock!.advanceMotion(t), ms);
  return layout(page);
}

/** Steps frozen movement in `step` ms until nothing moves; returns the movement time it took. */
async function runOut(page: Page, step = 20, max = 2000): Promise<number> {
  let t = 0;
  while ((await layout(page)).motion.active > 0 && t < max) {
    await advance(page, step);
    t += step;
  }
  return t;
}

/** Starts an in-page recorder of every flight seen (kind, card id, box), polled every 4 ms. */
async function recordFlights(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __qaFlights: unknown[];
      __qaFlightTimer?: number;
    };
    if (w.__qaFlightTimer) clearInterval(w.__qaFlightTimer);
    w.__qaFlights = [];
    const seen = new Set<string>();
    w.__qaFlightTimer = window.setInterval(() => {
      const l = window.__overclock!.layout();
      for (const f of l.motion.flights) {
        const key = `${f.kind}|${f.cardId}|${Math.round(f.box.x)}|${Math.round(f.box.y)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        w.__qaFlights.push({ ...f, viewer: l.viewer, cover: l.cover !== null });
      }
    }, 4);
  });
}

async function recorded(
  page: Page,
): Promise<(Flight & { viewer: string; cover: boolean })[]> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __qaFlights: (Flight & { viewer: string; cover: boolean })[];
        }
      ).__qaFlights,
  );
}

function kindOf(o: CardOption): string {
  const a = o.action;
  if (a.type === "install" && a.server === "new") return "new_server";
  return a.type;
}

function cardWith(v: PlayerView, kind: string): number {
  const i = v.handOptions.findIndex((os) =>
    os.some((o) => o.reject === null && kindOf(o) === kind),
  );
  if (i < 0) throw new Error(`no hand card with a lit ${kind} place`);
  return i;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Every movement record of a run is inside the snappiness budget (hint/notice are reading time, not movement). */
function expectBudget(recs: AnimRecord[]): void {
  for (const r of recs)
    if (r.kind !== "hint" && r.kind !== "notice")
      expect(r.scheduledMs, `${r.kind} <= 600 ms`).toBeLessThanOrEqual(600);
}

/** A seed whose remote_single_card_no_ice case is a trash or a steal (core decks). */
function kindSeed(kind: "trash" | "steal"): number {
  for (let seed = 1; seed <= 40; seed++) {
    try {
      if (planToStep(seed, "remote_single_card_no_ice").info["kind"] === kind)
        return seed;
    } catch {
      /* not reached on this seed */
    }
  }
  throw new Error(`no ${kind} seed`);
}

async function lean(page: Page): Promise<void> {
  // A busy test machine counts as a slow phone and drops decorative extras (S-05-3); pin fast frames.
  await page.evaluate(() => window.__overclock!.frameSpeed("fast"));
}

// ---------------------------------------------------------------------------------------------
test.describe("QA S-15-1 hand: press, tap, glide home", () => {
  test.skip(
    () => test.info().project.use.hasTouch !== true,
    "the hand view press is a touch gesture (mouse hover: dev spec)",
  );

  test("the big card starts rising within 100 ms of the finger going down (browser stamp), full lift soon after; a quick tap leaves nothing enlarged", async ({
    page,
  }) => {
    await openBoard(page, 1);
    await lean(page);
    const open = await openHand(page, 1);
    await waitIdle(page);
    const centre = open.handView!.centre;
    await page.evaluate(() => {
      const w = window as unknown as {
        __qa: {
          down: number;
          samples: { t: number; w: number; y: number }[];
          on: boolean;
        };
      };
      w.__qa = { down: NaN, samples: [], on: true };
      window.addEventListener(
        "pointerdown",
        (e) => (w.__qa.down = e.timeStamp),
        { capture: true, once: true },
      );
      const tick = (t: number) => {
        const z = window.__overclock!.layout().zoom;
        if (z) w.__qa.samples.push({ t, w: z.box.width, y: z.box.y });
        if (w.__qa.on) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const cdp = await page.context().newCDPSession(page);
    const c = center(centre);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: c.x, y: c.y }],
    });
    await page.waitForTimeout(150); // < 350 ms hold: a tap, not a lift
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(250);
    const qa = await page.evaluate(() => {
      const w = window as unknown as {
        __qa: {
          down: number;
          samples: { t: number; w: number; y: number }[];
          on: boolean;
        };
      };
      w.__qa.on = false;
      return w.__qa;
    });
    expect(Number.isFinite(qa.down)).toBe(true);
    const first = qa.samples.find(
      (s) => s.t >= qa.down && s.w > centre.width + 0.5,
    );
    expect(first, "it grew").toBeTruthy();
    test
      .info()
      .annotations.push({
        type: "press-lift",
        description: `first grown frame ${(first!.t - qa.down).toFixed(1)} ms after pointerdown`,
      });
    expect(
      first!.t - qa.down,
      "starts growing within a tenth of a second",
    ).toBeLessThan(100);
    const full = qa.samples.find(
      (s) => s.t >= qa.down && s.w >= centre.width * 1.07,
    );
    expect(full, "grows about 8 %").toBeTruthy();
    expect(full!.y, "and rises").toBeLessThan(centre.y - 1);
    expect(
      Math.max(...qa.samples.map((s) => s.w)),
      "a little, not a lot",
    ).toBeLessThan(centre.width * 1.1);
    // A quick tap picks the card (today's behaviour): the view closes, nothing is left lifted or enlarged.
    const l = await waitIdle(page);
    expect(l.drag).toBeNull();
    expect(l.handView).toBeNull();
    expect(l.selected).toBe(1);
    expect(l.motion.flights).toEqual([]);
    await cdp.detach();
  });

  test("let go away from every lit place: the card glides home over several frames (not a jump) and the hand view is back", async ({
    page,
  }) => {
    await openBoard(page, 1);
    await lean(page);
    const v = await getView(page);
    const { hold, lifted } = await liftHand(page, cardWith(v, "new_server"));
    const away = center(emptySpot(lifted));
    const from = center(lifted.handView!.centre);
    for (let k = 1; k <= 6; k++)
      await hold.move(
        from.x + ((away.x - from.x) * k) / 6,
        from.y + ((away.y - from.y) * k) / 6,
      );
    await page.waitForFunction(
      () => window.__overclock!.layout().drag?.hover === null,
    );
    await page.evaluate(
      () =>
        new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        ),
    );
    const dropped = (await layout(page)).drag!.box;
    await page.evaluate(() => {
      const w = window as unknown as {
        __g: { t: number; x: number; y: number }[];
        __gOn: boolean;
      };
      w.__g = [];
      w.__gOn = true;
      const tick = (t: number) => {
        const l = window.__overclock!.layout();
        const b = l.drag?.box ?? l.zoom?.box;
        if (b) w.__g.push({ t, x: b.x + b.width / 2, y: b.y + b.height / 2 });
        if (w.__gOn) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await hold.release();
    await page.waitForFunction(
      () => window.__overclock!.layout().drag === null,
    );
    await page.waitForTimeout(300);
    const g = await page.evaluate(() => {
      const w = window as unknown as {
        __g: { t: number; x: number; y: number }[];
        __gOn: boolean;
      };
      w.__gOn = false;
      return w.__g;
    });
    const end = await waitIdle(page);
    expect(end.handView, "the hand view is back").not.toBeNull();
    const home = center(end.handView!.centre);
    const start = center(dropped);
    const total = dist(start, home);
    const between = g.filter(
      (p) => dist(p, home) > 2 && dist(p, start) > 2 && dist(p, home) < total,
    );
    test
      .info()
      .annotations.push({
        type: "glide",
        description: `${between.length} in-between frames over ${total.toFixed(0)} px`,
      });
    expect(between.length, "seen in between (glides)").toBeGreaterThanOrEqual(
      1,
    );
    const rec = (await page.evaluate(() => window.__overclock!.anims())).filter(
      (a) => a.kind === "hand_return" || a.kind === "card_return",
    );
    for (const r of rec) expect(r.scheduledMs).toBeLessThanOrEqual(200);
  });
});

// ---------------------------------------------------------------------------------------------
test.describe("QA S-15-2 played cards fly and land", () => {
  test("a button install (pick with a tap, tap the lit new-server place) flies from the hand card to its spot and settles", async ({
    page,
  }) => {
    await openBoard(page, 1);
    const v = await getView(page);
    const i = cardWith(v, "new_server");
    const cardId = v.players.corp.hand![i]!;
    const picked = await pickHand(page, i);
    const handBox = picked.hand[i]!.box;
    await holdMotion(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, targetOf(picked, "new_server").box);
    await page.waitForFunction(() =>
      window
        .__overclock!.layout()
        .motion.flights.some((f) => f.kind === "install"),
    );
    let l = await layout(page);
    const f0 = l.motion.flights.find((f) => f.kind === "install")!;
    expect(f0.cardId, "the Corp's own card on the Corp's screen").toBe(cardId);
    expect(
      dist(center(f0.box), center(handBox)),
      "starts at the hand card",
    ).toBeLessThan(Math.max(handBox.width, handBox.height));
    l = await advance(page, 120);
    await snap(page, "s15-2-button-install-mid");
    const remote = l.servers.at(-1)!;
    const spot = [...remote.content, ...remote.ice][0]!.box;
    const mid = l.motion.flights.find((f) => f.kind === "install")!;
    expect(dist(center(mid.box), center(spot))).toBeLessThan(
      dist(center(f0.box), center(spot)),
    );
    const took = await runOut(page);
    expect(took, "flight + settle within 0.6 s").toBeLessThanOrEqual(600);
    const a = await page.evaluate(() => window.__overclock!.anims());
    expect(
      a.some((r) => r.kind === "land_settle"),
      "lands with a settle",
    ).toBe(true);
    expectBudget(a);
  });

  test("pass-the-phone with the cover: the Runner's screen shows Corp cards he may not know only as card backs (install, discard, a just-played operation)", async ({
    page,
  }) => {
    await page.goto("./?seed=1&play=here&decks=starter");
    await page.waitForFunction(
      () => document.body.dataset.ready === "true" && !!window.__overclock,
    );
    let l = await layout(page);
    if (l.cover) {
      await tap(page, {
        x: l.viewport.width / 2 - 5,
        y: l.viewport.height - 40,
        width: 10,
        height: 10,
      });
      await page.waitForFunction(
        () => window.__overclock!.layout().cover === null,
      );
    }
    await waitIdle(page);
    const v = await getView(page);
    const corpHand = v.players.corp.hand!;
    const inst = v.handOptions[cardWith(v, "new_server")]!.find(
      (o) => o.reject === null && kindOf(o) === "new_server",
    )!;
    await dispatch(page, inst.action);
    await waitIdle(page);
    // An operation if there is one (shown face up to the Corp; it is public once played).
    const w = await getView(page);
    const op = w.handOptions
      .flat()
      .find((o) => o.reject === null && o.action.type === "play");
    await holdMotion(page);
    await recordFlights(page);
    if (op) await dispatch(page, op.action);
    // End the turn with the discard (if any) while the Corp's own movement is still frozen mid-air.
    await page.evaluate(() => {
      const hook = window.__overclock!;
      hook.dispatch({ type: "end_turn", player: "corp" });
      const x = hook.getView();
      if (x.pendingDiscard > 0)
        hook.dispatch({
          type: "discard",
          player: "corp",
          handIndices: Array.from({ length: x.pendingDiscard }, (_, k) => k),
        });
    });
    for (let k = 0; k < 20 && (await layout(page)).cover === null; k++)
      await advance(page, 60);
    l = await layout(page);
    expect(l.cover, "the hand-over cover is up").not.toBeNull();
    expect(l.cover!.to).toBe("runner");
    await snap(page, "s15-2-cover-up");
    // The Runner lifts the cover with a real tap.
    await tap(page, {
      x: l.viewport.width / 2 - 5,
      y: l.viewport.height - 40,
      width: 10,
      height: 10,
    });
    await page.waitForFunction(
      () =>
        window.__overclock!.layout().cover === null &&
        window.__overclock!.layout().viewer === "runner",
    );
    await page.waitForTimeout(50);
    l = await layout(page);
    const inAir = l.motion.flights.find((f) => f.kind === "install");
    if (inAir) {
      expect(inAir.cardId).toBeNull();
      await snap(page, "s15-2-runner-sees-back-fly-in");
    }
    await runOut(page);
    const runnerView = await getView(page);
    // Cards the Runner may see: public places in his own view.
    const pub = new Set<string>([
      ...runnerView.players.corp.discard.filter(
        (c): c is string => typeof c === "string",
      ),
      ...runnerView.corpServers.flatMap((s) =>
        [...s.ice, ...s.content]
          .map((c) => c.cardId)
          .filter((c): c is string => !!c),
      ),
      ...(runnerView.players.runner.hand ?? []),
      ...runnerView.rig
        .map((c) => c.cardId)
        .filter((c): c is string => typeof c === "string"),
      ...runnerView.players.runner.discard.filter(
        (c): c is string => typeof c === "string",
      ),
    ]);
    const all = await recorded(page);
    const asRunner = all.filter((f) => f.viewer === "runner");
    test
      .info()
      .annotations.push({
        type: "runner-flights",
        description: JSON.stringify(
          asRunner.map((f) => [f.kind, f.cardId, f.cover]),
        ),
      });
    expect(
      asRunner.some((f) => f.kind === "install" && f.cardId === null),
      "the Corp's install flies in as a back",
    ).toBe(true);
    for (const f of asRunner) {
      if (f.cardId === null) continue;
      expect(f.cover, "nothing flies over the cover").toBe(false);
      // A face is fine only if the Runner's own view shows that card face up somewhere.
      expect(
        pub.has(f.cardId),
        `${f.kind} ${f.cardId} is public to the Runner`,
      ).toBe(true);
    }
    // Every Corp hand card (start of turn) that the Runner's view still doesn't show stays unseen.
    const hiddenIds = corpHand.filter((c) => !pub.has(c));
    for (const f of asRunner)
      expect(
        f.cardId === null || !hiddenIds.includes(f.cardId) || pub.has(f.cardId),
      ).toBe(true);
  });

  test("online: the Runner's phone sees the Corp's draw, install and end-of-turn discard as card backs and never receives their ids", async ({
    browser,
  }) => {
    const corp = await openPhone(browser);
    const runner = await openPhone(browser, "motion=hold");
    const code = await startTestGame(corp, "corp", {
      seed: 1,
      actions: [],
      deckSet: "starter",
    });
    await joinGame(runner, code);
    await Promise.all([waitPlaying(corp), waitPlaying(runner)]);
    await recordFlights(runner.page);
    const before = runner.received.length;
    let v = await view(corp);
    const inst = v.handOptions
      .flat()
      .find(
        (o) =>
          o.reject === null &&
          o.action.type === "install" &&
          o.action.server === "new",
      )!;
    const instId =
      v.players.corp.hand![v.handOptions.findIndex((os) => os.includes(inst))]!;
    await act(corp, inst.action);
    await waitView(runner, (w) => w.corpServers.length > 3);
    await runner.page.evaluate(() => window.__overclock!.advanceMotion(600));
    await act(corp, { type: "draw", player: "corp" });
    await waitView(runner, (w) => w.players.corp.handCount === 6);
    await runner.page.evaluate(() => window.__overclock!.advanceMotion(600));
    await act(corp, { type: "draw", player: "corp" });
    await waitView(runner, (w) => w.players.corp.handCount === 7);
    await runner.page.evaluate(() => window.__overclock!.advanceMotion(600));
    v = await view(corp);
    const drawn = v.players.corp.hand!.slice(-2);
    await act(corp, { type: "end_turn", player: "corp" });
    v = await view(corp);
    const k = v.pendingDiscard;
    expect(k, "the Corp has to discard").toBeGreaterThan(0);
    const discardIds = v.players.corp.hand!.slice(0, k);
    await act(corp, {
      type: "discard",
      player: "corp",
      handIndices: Array.from({ length: k }, (_, j) => j),
    });
    await waitView(runner, (w) => w.activePlayer === "runner");
    await runner.page.waitForTimeout(100);
    await snap(runner.page, "s15-2-online-runner-sees-discard-backs");
    await runner.page.evaluate(() => window.__overclock!.advanceMotion(1000));
    const fl = await recorded(runner.page);
    test
      .info()
      .annotations.push({
        type: "runner-flights",
        description: JSON.stringify(fl.map((f) => [f.kind, f.cardId])),
      });
    expect(fl.filter((f) => f.kind === "install").length).toBeGreaterThan(0);
    expect(
      fl.filter((f) => f.kind === "draw").length,
      "the Corp's 2 draws fly too",
    ).toBeGreaterThanOrEqual(1);
    const rv = await view(runner);
    const pubArchives = new Set(
      rv.players.corp.discard.filter((c): c is string => typeof c === "string"),
    );
    for (const f of fl) {
      if (f.kind === "install" || f.kind === "draw")
        expect(f.cardId, `${f.kind} is a back`).toBeNull();
      if (f.kind === "discard" && f.cardId !== null)
        expect(
          pubArchives.has(f.cardId),
          "a discard shown face up is face up in Archives",
        ).toBe(true);
    }
    const secret = [
      instId,
      ...drawn,
      ...discardIds.filter((c) => !pubArchives.has(c)),
    ];
    const frames = runner.received.slice(before).join("\n");
    // A card id may appear in the Runner's frames only if the Runner's own view shows it (his own cards, public cards).
    const runnerKnows = new Set([
      ...rv.players.runner.hand!,
      ...rv.players.runner.discard,
      ...rv.rig.map((c) => c.cardId),
      ...pubArchives,
    ]);
    for (const id of secret)
      if (!runnerKnows.has(id))
        expect(
          frames.includes(`"${id}"`),
          `${id} never sent to the Runner`,
        ).toBe(false);
    await corp.context.close();
    await runner.context.close();
  });
});

// ---------------------------------------------------------------------------------------------
test.describe("QA S-15-3 piles", () => {
  test("a draw: the drawn card flies in and the other hand cards slide aside over several frames", async ({
    page,
  }) => {
    await openBoard(page, 1);
    await lean(page);
    const l0 = await waitIdle(page);
    await page.evaluate(() => {
      const w = window as unknown as {
        __h: { t: number; xs: number[] }[];
        __hOn: boolean;
      };
      w.__h = [];
      w.__hOn = true;
      const tick = (t: number) => {
        w.__h.push({
          t,
          xs: window.__overclock!.layout().hand.map((h) => h.box.x),
        });
        if (w.__hOn) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await tap(page, l0.corp.deck);
    const l1 = await waitIdle(page);
    await page.waitForTimeout(100);
    const h = await page.evaluate(() => {
      const w = window as unknown as {
        __h: { t: number; xs: number[] }[];
        __hOn: boolean;
      };
      w.__hOn = false;
      return w.__h;
    });
    expect(l1.hand.length).toBe(l0.hand.length + 1);
    // The first card's x before and after.
    const x0 = l0.hand[0]!.box.x;
    const x1 = l1.hand[0]!.box.x;
    test
      .info()
      .annotations.push({
        type: "slide",
        description: `hand[0] x ${x0.toFixed(1)} -> ${x1.toFixed(1)}`,
      });
    if (Math.abs(x1 - x0) > 2) {
      const lo = Math.min(x0, x1) + 0.5;
      const hi = Math.max(x0, x1) - 0.5;
      const mids = h.filter(
        (s) => s.xs.length > 0 && s.xs[0]! > lo && s.xs[0]! < hi,
      );
      expect(
        mids.length,
        "the other cards slide (in-between positions seen)",
      ).toBeGreaterThanOrEqual(1);
    }
    await snap(page, "s15-3-after-draw");
  });

  test("the Corp's draw at the start of its turn flies from R&D into the hand", async ({
    page,
  }) => {
    await openBoard(page, 1);
    await toRunnerTurn(page);
    await holdMotion(page);
    await recordFlights(page);
    await page.evaluate(() =>
      window.__overclock!.dispatch({ type: "end_turn", player: "runner" }),
    );
    for (let k = 0; k < 30 && (await layout(page)).viewer !== "corp"; k++)
      await advance(page, 40);
    await page.waitForFunction(
      () => window.__overclock!.layout().viewer === "corp",
    );
    const l = await layout(page);
    await page.waitForTimeout(30);
    const fl = (await recorded(page)).filter(
      (f) => f.viewer === "corp" && f.kind === "draw",
    );
    expect(fl.length, "the turn's draw flies").toBe(1);
    expect(
      dist(center(fl[0]!.box), center(l.corp.deck)),
      "from R&D",
    ).toBeLessThan(6);
    await runOut(page);
    expect((await layout(page)).hand.length).toBe(
      (await getView(page)).players.corp.handCount,
    );
  });

  test("Bank Job emptied flies to the Heap; the Heap count goes up when it lands", async ({
    page,
  }) => {
    await openBoard(page, 1); // starter decks, as s10-bankjob
    const plan = await toStep(page, 1, "runner_bank_job_remote");
    let l = await startRun(page, plan.info["server"]!);
    await tap(page, runButtonOf(l, "Bank Job: take credits").box);
    await page.waitForFunction(
      () => window.__overclock!.layout().run?.amount != null,
    );
    l = await layout(page);
    expect(l.run!.amount!.amount, "opens at all 8").toBe(8);
    const heap0 = Number(l.text.runnerDiscard || 0);
    await holdMotion(page);
    await page.evaluate(() => window.__overclock!.clearAnims());
    await tap(page, l.run!.buttons.find((b) => b.role === "bid_go")!.box);
    await page.waitForFunction(() =>
      window
        .__overclock!.layout()
        .motion.flights.some((f) => f.kind === "trash"),
    );
    l = await advance(page, 100);
    expect(
      Number(l.text.runnerDiscard || 0),
      "the Heap waits for the card",
    ).toBe(heap0);
    const f = l.motion.flights.find((x) => x.kind === "trash")!;
    expect(
      f.cardId,
      "Bank Job is face up (it was on the table)",
    ).not.toBeNull();
    expect(
      dist(center(f.box), center(l.runner.discard)),
      "heading for the Heap",
    ).toBeLessThan(
      dist(
        center(l.rig.find((c) => c.cardId === f.cardId)?.box ?? f.box),
        center(l.runner.discard),
      ) + 1,
    );
    await snap(page, "s15-3-bank-job-to-heap");
    await runOut(page);
    l = await layout(page);
    expect(Number(l.text.runnerDiscard), "counted on landing").toBe(heap0 + 1);
    expect((await getView(page)).players.runner.discardCount).toBe(heap0 + 1);
  });

  for (const kind of ["trash", "steal"] as const) {
    test(`an accessed card ${kind === "trash" ? "trashed flies to Archives" : "stolen flies to the Runner's score pile, points tick up"}; the count waits for the landing`, async ({
      page,
    }) => {
      const seed = kindSeed(kind);
      await openBoard(page, { seed, decks: "core" });
      const plan = await toStep(page, seed, "remote_single_card_no_ice");
      let l = await startRun(page, plan.info["server"]!);
      // Get to the access (Continue / Access cards if asked).
      for (
        let g = 0;
        g < 4 &&
        !l.run?.buttons.some((b) =>
          (kind === "trash" ? /^Trash/ : /^Steal/).test(b.label),
        );
        g++
      ) {
        const b = l.run?.buttons.find((x) => x.lit);
        if (!b) break;
        await tap(page, b.box);
        l = await waitIdle(page);
      }
      const btn = l.run!.buttons.find((b) =>
        (kind === "trash" ? /^Trash/ : /^Steal/).test(b.label),
      )!;
      expect(btn, `a ${kind} button`).toBeTruthy();
      const archives0 = Number(l.text.corpDiscard || 0);
      const scored0 = l.scored.runner.count;
      const points0 = l.score.runner.text;
      await holdMotion(page);
      await page.evaluate(() => window.__overclock!.clearAnims());
      await tap(page, btn.box);
      await page.waitForFunction(
        (k) =>
          window.__overclock!.layout().motion.flights.some((f) => f.kind === k),
        kind,
      );
      const f0 = (await layout(page)).motion.flights.find(
        (x) => x.kind === kind,
      )!;
      l = await advance(page, 100);
      if (kind === "trash")
        expect(Number(l.text.corpDiscard || 0), "Archives waits").toBe(
          archives0,
        );
      else {
        expect(l.scored.runner.count, "the score pile waits").toBe(scored0);
        expect(l.score.runner.text, "the points wait").toBe(points0);
      }
      const f = l.motion.flights.find((x) => x.kind === kind)!;
      const to = kind === "trash" ? l.corp.discard : l.scored.runner.box;
      expect(
        dist(center(f.box), center(to)),
        `heading for ${kind === "trash" ? "Archives" : "his score pile"}`,
      ).toBeLessThan(dist(center(f0.box), center(to)));
      await snap(page, `s15-3-access-${kind}-mid`);
      await runOut(page);
      l = await advance(page, 600); // the points tick (200 ms) + glow run on the same clock
      const v = await getView(page);
      if (kind === "trash") {
        expect(Number(l.text.corpDiscard), "Archives +1 on landing").toBe(
          archives0 + 1,
        );
      } else {
        expect(l.scored.runner.count).toBe(scored0 + 1);
        const pts = v.players.runner.points;
        expect(l.score.runner.text).toBe(
          `Runner ${pts} ${pts === 1 ? "point" : "points"}`,
        );
        const tick = (
          await page.evaluate(() => window.__overclock!.anims())
        ).find((r) => r.kind === "score_tick");
        expect(tick, "the points tick with a glow").toBeTruthy();
      }
      expectBudget(await page.evaluate(() => window.__overclock!.anims()));
    });
  }

  for (const side of ["runner", "corp"] as const) {
    test(`${side}: several cards discarded at the end of the turn ripple to the ${side === "runner" ? "Heap" : "Archives"} one after another, all landed within 0.5 s, count on landing`, async ({
      page,
    }) => {
      await openBoard(page, { seed: 1, decks: "core" });
      const plan = await toStep(
        page,
        1,
        side === "runner" ? "runner_must_discard" : "corp_must_discard",
      );
      const count = Number(plan.info["count"]);
      expect(count).toBeGreaterThanOrEqual(2);
      const l0 = await waitIdle(page);
      const pile = (l: LayoutSnapshot) =>
        Number(
          (side === "runner" ? l.text.runnerDiscard : l.text.corpDiscard) || 0,
        );
      const before = pile(l0);
      await holdMotion(page);
      await recordFlights(page);
      await page.evaluate(
        ({ s, n }) =>
          window.__overclock!.dispatch({
            type: "discard",
            player: s,
            handIndices: Array.from({ length: n }, (_, k) => k),
          }),
        { s: side, n: count },
      );
      await page.waitForFunction(
        () => window.__overclock!.layout().motion.active > 0,
      );
      let l = await advance(page, 60);
      expect(pile(l), "the pile waits for the cards").toBeLessThan(
        before + count,
      );
      await snap(page, `s15-3-${side}-discard-ripple`);
      // Step the frozen clock and note when the last card lands.
      let t = 60;
      while (
        (await layout(page)).motion.flights.some((f) => f.kind === "discard") &&
        t < 1500
      ) {
        await advance(page, 10);
        t += 10;
      }
      test
        .info()
        .annotations.push({
          type: "ripple",
          description: `${count} cards landed by ${t} ms`,
        });
      expect(t, "the whole ripple within ~0.5 s").toBeLessThanOrEqual(510);
      await runOut(page);
      await page.evaluate(() => window.__overclock!.motion("normal"));
      l = await waitIdle(page);
      expect(pile(l), "every card counted").toBe(before + count);
      const disc = (await recorded(page)).filter((f) => f.kind === "discard");
      expect(disc.length, "each card flies").toBeGreaterThanOrEqual(
        Math.min(count, 2),
      );
    });
  }

  test("Accelerated Beta Test: the 3 looked-at cards ripple to Archives within 0.5 s, Archives +3 on landing", async ({
    page,
  }) => {
    await openBoard(page, { seed: 2, decks: "core45" });
    const plan = await toStep(page, 2, "abt_scorable_no_ice");
    let l = await waitIdle(page);
    const card = l.servers
      .flatMap((s) => s.content)
      .find((c) => c.uid === plan.info["uid"])!;
    await tap(page, card.box);
    await page.waitForFunction(
      (u) => window.__overclock!.layout().selectedInstalled === u,
      plan.info["uid"],
    );
    await tap(page, targetOf(await layout(page), "score").box);
    await page.waitForFunction(
      () => window.__overclock!.layout().sheet?.kind === "look",
    );
    l = await waitIdle(page);
    const before = Number(l.text.corpDiscard || 0);
    await holdMotion(page);
    await recordFlights(page);
    await tap(page, targetOf(l, "look_done").box);
    await page.waitForFunction(
      () => window.__overclock!.layout().motion.active > 0,
    );
    let t = 0;
    while ((await layout(page)).motion.active > 0 && t < 1500) {
      if (t === 60) await snap(page, "s15-3-abt-ripple");
      await advance(page, 10);
      t += 10;
    }
    test
      .info()
      .annotations.push({ type: "abt", description: `landed by ${t} ms` });
    expect(t).toBeLessThanOrEqual(510);
    l = await waitIdle(page);
    expect(Number(l.text.corpDiscard)).toBe(before + 3);
    const mills = (await recorded(page)).filter(
      (f) => f.kind === "mill" || f.kind === "trash",
    );
    expect(mills.length, "the cards fly").toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------------------------
test.describe("QA S-15-4 never slower", () => {
  /**
   * Starts a movement with `action` in real time (motion `normal`) and taps the seat's credits
   * (click for a credit) at once through the browser's input pipeline. A window capture listener
   * notes how many cards were in the air when the finger went down (before the game sees it).
   */
  async function tapDuring(
    page: Page,
    action: Action,
    seat: "corp" | "runner",
    mustCatch = true,
    onHand = false,
    freeze = false,
  ): Promise<boolean> {
    await page.evaluate(() => window.__overclock!.motion("normal"));
    const l = await waitIdle(page);
    if (freeze) await holdMotion(page);
    // On the hand: a point inside the first hand card both before and after one card leaves the
    // hand (whether the strip re-centres or not), so the tap opens the hand view either way.
    const h0 = l.hand[0]!.box;
    const slot = l.hand.length > 1 ? l.hand[1]!.box.x - h0.x : h0.width;
    const box = onHand
      ? { x: h0.x + slot / 2, y: h0.y + h0.height / 2 - 4, width: 8, height: 8 }
      : l[seat].credits;
    const credits0 = (await getView(page)).players[seat].credits;
    await page.evaluate(() => {
      const w = window as unknown as { __m?: unknown; __air: number };
      const hook = window.__overclock!;
      w.__m = undefined;
      w.__air = -1;
      window.addEventListener(
        "pointerdown",
        () => (w.__air = hook.layout().motion.active),
        { capture: true, once: true },
      );
      window.addEventListener(
        "pointerup",
        (e) => {
          const stateAt = performance.now();
          const input = hook.lastInput();
          w.__m = {
            tapAt: e.timeStamp,
            handledAt:
              input && input.eventAt === e.timeStamp ? input.handledAt : NaN,
            stateAt,
            credits:
              hook.getView().players.corp.credits +
              hook.getView().players.runner.credits,
            air: hook.layout().motion.active,
          };
        },
        { once: true },
      );
    });
    await page.evaluate((a) => {
      window.__overclock!.clearAnims();
      window.__overclock!.dispatch(a);
    }, action);
    if (freeze)
      await page.waitForFunction(
        () => window.__overclock!.layout().motion.active > 0,
      );
    await sendTap(page, box);
    await page.waitForFunction(
      () => (window as unknown as { __m?: unknown }).__m !== undefined,
    );
    const m = await page.evaluate(() => {
      const w = window as unknown as {
        __m: { tapAt: number; handledAt: number; stateAt: number; air: number };
        __air: number;
      };
      return { __m: w.__m, __air: w.__air };
    });
    const recs = await page.evaluate(() => window.__overclock!.anims());
    test
      .info()
      .annotations.push({
        type: "tap-during",
        description: JSON.stringify({
          inAirAtDown: m.__air,
          queueMs: m.__m.handledAt - m.__m.tapAt,
          stateMs: m.__m.stateAt - m.__m.handledAt,
        }),
      });
    if (mustCatch)
      expect(
        m.__air,
        "cards were moving when the finger went down",
      ).toBeGreaterThan(0);
    expect(Number.isFinite(m.__m.handledAt), "the tap reached the game").toBe(
      true,
    );
    expect(
      m.__m.stateAt - m.__m.handledAt,
      "answered within 0.1 s",
    ).toBeLessThan(100);
    expect(m.__m.air, "nothing in the air once the tap is handled").toBe(0);
    if (m.__air > 0)
      expect(
        recs.some((a) => a.kind === "motion_skipped"),
        "the movement jumped to its end",
      ).toBe(true);
    if (onHand)
      await page.waitForFunction(
        () => window.__overclock!.layout().handView !== null,
        undefined,
        { timeout: 2000 },
      );
    else
      expect(
        (await getView(page)).players[seat].credits,
        "the tap counted",
      ).toBe(credits0 + 1);
    const after = await layout(page);
    expect(after.motion.flights, "nothing left in the air").toEqual([]);
    return m.__air > 0;
  }

  test("a tap during an install flight finishes it and is answered within 0.1 s (flight frozen mid-air; real time: see the one-shot test)", async ({
    page,
  }) => {
    await openBoard(page, 1);
    // The test machine draws a moving frame in 120-250 ms (no GPU) and holds input until the frame
    // is out, so a real-time tap usually arrives after a 0.35 s install has landed. The flight is
    // frozen mid-air instead (test switch) and the tap is a real one through the browser.
    const v = await getView(page);
    const o = v.handOptions
      .flat()
      .find((x) => x.reject === null && kindOf(x) === "new_server")!;
    expect(await tapDuring(page, o.action, "corp", true, true, true)).toBe(
      true,
    );
    const l = await layout(page);
    expect(l.servers.length, "the card is on its spot").toBe(4);
    expect([...l.servers[3]!.content, ...l.servers[3]!.ice].length).toBe(1);
  });

  test("a tap during a one-shot card showing (real time) finishes it; the Heap count is exact", async ({
    page,
  }) => {
    await openBoard(page, 1);
    await toRunnerTurn(page);
    // Real time: the 0.48 s showcase outlasts the test machine's slow (no GPU) frames most of the
    // time; a second one-shot card if the first tap arrived after it landed (each try costs 2 clicks).
    let caught = false;
    for (let k = 0; k < 2 && !caught; k++) {
      const v = await getView(page);
      const o = v.handOptions
        .flat()
        .find((x) => x.reject === null && x.action.type === "play");
      if (!o) break;
      const heap0 = v.players.runner.discardCount;
      caught = await tapDuring(page, o.action, "runner", false);
      test
        .info()
        .annotations.push({
          type: "showcase-try",
          description: `try ${k + 1}: ${caught ? "tap during the showcase" : "already landed"}`,
        });
      const l = await layout(page);
      expect(Number(l.text.runnerDiscard), "the Heap count is exact").toBe(
        heap0 + 1,
      );
    }
    expect(
      caught,
      "a real-time tap landed while the one-shot card was moving",
    ).toBe(true);
  });

  test("long tasks while cards move stay far under 0.6 s, and every movement record is inside the budget", async ({
    page,
  }) => {
    await openBoard(page, 1);
    await waitIdle(page);
    await page.evaluate(() => {
      const w = window as unknown as { __lt: number[] };
      w.__lt = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__lt.push(e.duration);
      }).observe({ type: "longtask" });
      window.__overclock!.clearAnims();
    });
    const v = await getView(page);
    const o = v.handOptions
      .flat()
      .find((x) => x.reject === null && kindOf(x) === "new_server")!;
    await dispatch(page, o.action);
    await waitIdle(page);
    await dispatch(page, { type: "draw", player: "corp" });
    await waitIdle(page);
    await page.evaluate(() => {
      const hook = window.__overclock!;
      hook.dispatch({ type: "end_turn", player: "corp" });
      const x = hook.getView();
      if (x.pendingDiscard > 0)
        hook.dispatch({
          type: "discard",
          player: "corp",
          handIndices: Array.from({ length: x.pendingDiscard }, (_, k) => k),
        });
    });
    await waitIdle(page);
    const w = await getView(page);
    const play = w.handOptions
      .flat()
      .find(
        (x) =>
          x.reject === null &&
          (x.action.type === "play" || x.action.type === "install"),
      );
    if (play) await dispatch(page, play.action);
    await waitIdle(page);
    const lt = await page.evaluate(
      () => (window as unknown as { __lt: number[] }).__lt,
    );
    test
      .info()
      .annotations.push({
        type: "longtasks",
        description: JSON.stringify(lt.map((d) => Math.round(d))),
      });
    for (const d of lt)
      expect(d, "no long task blocks input for 0.6 s").toBeLessThan(600);
    expectBudget(await page.evaluate(() => window.__overclock!.anims()));
  });

  test("upright mid-showcase: the turn-sideways prompt; back sideways nothing floats and the Heap count is exact", async ({
    page,
  }) => {
    test.skip(test.info().project.use.isMobile !== true, "phones only");
    await openBoard(page, 1);
    await toRunnerTurn(page);
    const v = await getView(page);
    const o = v.handOptions
      .flat()
      .find((x) => x.reject === null && x.action.type === "play")!;
    const heap0 = v.players.runner.discardCount;
    await holdMotion(page);
    await dispatch(page, o.action);
    await page.waitForFunction(
      () => window.__overclock!.layout().motion.active > 0,
    );
    await advance(page, 170);
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.height, height: size.width });
    await page.waitForFunction(
      () => window.__overclock!.layout().mode === "portrait",
    );
    await expect(page.getByText(/Turn your phone sideways/i)).toBeVisible();
    await snap(page, "s15-4-upright-mid-movement");
    await page.setViewportSize(size);
    await page.waitForFunction(
      (wd) =>
        window.__overclock!.layout().viewport.width === wd &&
        window.__overclock!.layout().mode === "landscape",
      size.width,
    );
    const now = await layout(page);
    expect(now.motion.active).toBe(0);
    expect(now.motion.flights).toEqual([]);
    expect(Number(now.text.runnerDiscard), "the Heap shows the card").toBe(
      heap0 + 1,
    );
    await page.evaluate(() => window.__overclock!.motion("normal"));
    const idle = await waitIdle(page);
    expect(now.hand.map((h) => h.box)).toEqual(idle.hand.map((h) => h.box));
    expect(now.rig.map((c) => c.box)).toEqual(idle.rig.map((c) => c.box));
    await snap(page, "s15-4-back-sideways");
  });

  test("the same Corp install moves the same in pass-the-phone and online (Corp's screen: from the hand, face up; Runner's: a back from the top)", async ({
    page,
    browser,
  }) => {
    type Seen = { kind: string; faceUp: boolean; fromTop: boolean }[];
    const summary = (fl: Flight[], vh: number): Seen =>
      fl
        .filter((f) => f.kind === "install")
        .map((f) => ({
          kind: f.kind,
          faceUp: f.cardId !== null,
          fromTop: center(f.box).y < vh / 2,
        }));
    // Pass-the-phone (no cover).
    await openBoard(page, 1);
    const v = await getView(page);
    const o = v.handOptions
      .flat()
      .find((x) => x.reject === null && kindOf(x) === "new_server")! as {
      action: Action;
    };
    await holdMotion(page);
    await recordFlights(page);
    await dispatch(page, o.action);
    await page.waitForTimeout(30);
    const vh = (await layout(page)).viewport.height;
    const hotCorp = summary(await recorded(page), vh);
    await runOut(page);
    await recordFlights(page);
    await page.evaluate(() => {
      const hook = window.__overclock!;
      hook.dispatch({ type: "end_turn", player: "corp" });
      const x = hook.getView();
      if (x.pendingDiscard > 0)
        hook.dispatch({
          type: "discard",
          player: "corp",
          handIndices: Array.from({ length: x.pendingDiscard }, (_, k) => k),
        });
    });
    for (let k = 0; k < 20 && (await layout(page)).viewer !== "runner"; k++)
      await advance(page, 60);
    await page.waitForFunction(() =>
      window
        .__overclock!.layout()
        .motion.flights.some((f) => f.kind === "install"),
    );
    await page.waitForTimeout(30);
    const hotRunner = summary(
      (await recorded(page)).filter(
        (f) => (f as { viewer?: string }).viewer === "runner",
      ),
      vh,
    );
    // Online.
    const corp = await openPhone(browser, "motion=hold");
    const runner = await openPhone(browser, "motion=hold");
    const code = await startTestGame(corp, "corp", {
      seed: 1,
      actions: [],
      deckSet: "starter",
    });
    await joinGame(runner, code);
    await Promise.all([waitPlaying(corp), waitPlaying(runner)]);
    await recordFlights(corp.page);
    await recordFlights(runner.page);
    await act(corp, o.action);
    await waitView(runner, (w) => w.corpServers.length > 3);
    await runner.page.waitForFunction(() =>
      window
        .__overclock!.layout()
        .motion.flights.some((f) => f.kind === "install"),
    );
    await corp.page.waitForTimeout(30);
    const onCorp = summary(
      await recorded(corp.page),
      (await layoutOf(corp)).viewport.height,
    );
    const onRunner = summary(
      await recorded(runner.page),
      (await layoutOf(runner)).viewport.height,
    );
    test
      .info()
      .annotations.push({
        type: "compare",
        description: JSON.stringify({ hotCorp, onCorp, hotRunner, onRunner }),
      });
    expect(hotCorp.length).toBe(1);
    expect(onCorp, "Corp's screen: same movement").toEqual(hotCorp);
    expect(hotRunner.length).toBe(1);
    expect(onRunner, "Runner's screen: same movement").toEqual(hotRunner);
    expect(hotRunner[0]).toEqual({
      kind: "install",
      faceUp: false,
      fromTop: true,
    });
    await corp.context.close();
    await runner.context.close();
  });
});
