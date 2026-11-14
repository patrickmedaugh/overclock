# Sprint 6 — QA report

QA date: 2026-11-13/14 · Branch `sprint-06` · Code verified at **d2feed1**, QA tests added in **50da0cb** and **be8c8ee** (the second only changes how QA's own "move arrives fast" test measures; see Checks run) · QA did not write the code under test.

**Summary: 22 acceptance criteria. 19 PASS, 0 FAIL, 3 BLOCKED ON OWNER SETUP** (S-06-4: the live service on your Cloudflare account can't be checked until the account exists; everything that can be checked before then passes). **2 low-severity findings** (QA-S6-1, QA-S6-2), neither breaks an acceptance criterion. All checks green: lint, typecheck, 1140 unit tests (incl. 5 QA room tests), the `wrangler dev` integration check; full screen-test suite in CI on be8c8ee (includes QA's specs) **786 passed / 6 skipped / 0 failed / 0 flaky**; android build + publish green; `server` workflow skipped green (no Cloudflare secret yet).

"P" = developers' Playwright test (projects `phone` 844×390 touch, `phone-small` 640×360 touch, `desktop` 1280×800 mouse, `android` = the app's bundle). "E" = developers' Vitest test (engine / match / protocol / server room / client). "QA" = test written by QA: `apps/client/e2e/qa-sprint06.spec.ts` (3 sizes), `apps/client/e2e/qa-sprint06-android.spec.ts` (app bundle, 2 sizes), `apps/server/test/qa-sprint06.test.ts`. Online e2e runs two separate browser contexts ("two phones") against the real service (`wrangler dev`, the same Worker + Durable Object code that will be deployed). Screenshots: `docs/sprints/sprint-06-qa/` — `<project>-NN-<what>.png`.

## Acceptance criteria

### S-06-1 Start screen, start a game, join with a code

| Criterion (short) | Result | Evidence |
|---|---|---|
| Opening the game (web or app) shows **Play on this phone** and **Play online**; Play on this phone starts pass-the-phone | **PASS** | P `s06-start` "opens on Play on this phone / Play online…" (fits the screen, ≥ 44 px buttons, no overlap). QA cover test starts from the start screen with a real tap and plays 4 turns. QA android: the app bundle opens on the start screen at 844×390 and 640×360, Play online says "Online play isn't set up yet" (the e2e app build has no service address), Play on this phone starts the board, no page errors. Screens `*-01-start-screen.png`, `android-app-*-01-start.png`, `android-app-*-02-online-not-set-up.png`, `android-app-*-03-board.png`. |
| Play online → Start a game → pick Corp/Runner → short code, **Share**, "Waiting for the other player…" | **PASS** | P `s06-start` "with an online service: Start a game asks Corp or Runner…", P `s06-online` "Start a game shows a code…". QA "real taps: Play online, Start a game, Runner": code matches the 31-letter alphabet (no 0/O/1/I/L), Share and waiting text shown on all 3 sizes (`*-01b-start-pick-side.png`, `*-01c-lobby-code.png`). |
| **Share** sends a link that opens the game and joins straight away | **PASS** (+ owner check) | P `s06-online` "Share sends a link…": the shared text has the code, the URL is this page with `?join=CODE`, and a second phone opening it joins with no taps. A real share sheet needs a person; see owner check 2. |
| The other phone: Play online → Join → types the code → both boards start; joiner plays the other side | **PASS** | P `s06-online` (starter Runner → joiner Corp, each board's own side at the bottom). Every QA online test joins with real taps (Play online, Join with code, type, Join) on all 3 sizes. |
| Wrong or old code → "No game with that code", can try again | **PASS** | P `s06-start`: K7QF (never started) → "No game with that code", the code stays to fix; malformed → "Codes are 4 letters or numbers, like K7QF"; typed loosely (`k7-q f`) is cleaned to `K7QF`. E room `join` "no game with that code". |

### S-06-2 Play a whole game across two phones

| Criterion (short) | Result | Evidence |
|---|---|---|
| My side at the bottom, my hand shown, the other player's hand and face-down cards only as backs | **PASS** | P `s06-online` "own side at the bottom…" (Corp install arrives face down with no card id). QA long game: every frame each phone received equals that seat's own projection (see AC6). Screens `*-03-online-corp-mid-game.png`, `*-04-online-runner-mid-game.png` (Corp's R&D ICE and remote card are backs on the Runner's phone). |
| The other player's move shows within about a second (installs arrive face down) | **PASS** | P `s06-online` (< 1000 ms, wall clock). QA "a move on my own turn reaches … the other phone fast": measured inside the pages on direct sockets, 3 moves × 3 sizes: the other phone shows it **16–24 ms** after the tap (local service). Real-network delay: owner check 1. |
| Not my turn: my taps play nothing and the screen says whose turn it is | **PASS** | P `s06-online` (tapping the Stack draws nothing; help "Corp's turn…"). QA "the waiting phone's real taps…": credits, Stack, two hand cards and the End turn spot on the Runner's phone during the Corp's turn — each answered at once with "Not your turn", **0 moves accepted**, the Runner's view unchanged, then the line goes back to "Corp's turn. Their moves show up here." (`*-09-online-runner-not-your-turn.png`). QA room test: a Runner socket sending Corp actions (credit, end turn, draw, Don't rez) is refused and the Corp's phone hears nothing. |
| Run reaches face-down ICE: Corp's phone shows **Rez / Don't rez**, Runner's phone "Corp is deciding…" | **PASS** | P `s06-online` (Don't rez path). QA: Rez path on all 3 sizes; the Runner's phone has no buttons and no Corp decision object at all (`*-05-online-corp-rez-choice.png`, `*-06-online-runner-corp-is-deciding.png`). |
| Corp can't afford the rez → the Runner can't tell (automated) | **PASS** | E `sprint06-rez-window` "the Runner sees exactly the same for cheap and unaffordable face-down ICE" (+ control showing hot-seat rules *would* differ). E room auto-pass tests: random 1.2–2.4 s pause, plain update with no `ack`, never while the Corp is away (architect fix in d2feed1). P `s06-online` "the Corp can't pay…" (Rez dim, Runner sees "Corp is deciding…", service passes, frames leak-checked). See note QA-S6-2 about how long a decision takes. |
| No phone ever receives the other side's hidden cards; the service runs the rules and sends each phone only its view (automated) | **PASS** | QA long game (3 sizes): seed 606, **84 accepted moves incl. 15 runs**, played from both phones; QA rebuilt the true game at every frame and checked **every** `sync`/`update`/`rejected` frame of **both** phones (85 each) is byte-for-byte that seat's projection, **events included**; no frame carries the other seat's token; no `seed`/`rng`/`deck` field on the wire. QA room test: 12 random games, > 2000 frames — no other-seat token, no `seed`/`rng`/`deck`/`token` keys (except a phone's own `seated`). E `leak.test.ts` (25 random games through the room), P `s06-online` Runner-frame check. |
| Someone wins → both phones show who won and **Back to start** | **PASS** | P `s06-online` "someone wins…". QA: both phones show "Runner wins / R&D is empty / Back to start" on all 3 sizes (`*-07-…-corp.png`, `*-08-…-runner.png`); Back to start → start screen with no Rejoin for the finished game. |

### S-06-3 Come back after switching away

| Criterion (short) | Result | Evidence |
|---|---|---|
| Switch away / lose signal briefly and come back → board catches up by itself | **PASS** | P `s06-online` "signal lost for a while…" (sockets really cut both ends, reconnect with `resume`). QA "offline for the whole of the other player's turn": the Runner is offline while the Corp takes 3 credits, ends its turn and discards; signal back → the Runner's board shows the Corp's credits, it is the Runner's turn with 4 clicks, and the Runner plays a move (`*-12-online-runner-reconnecting.png`). E `OnlineMatch` unit tests (backoff, wake on visibility/app resume, ping). |
| Other player away → "Waiting for the other player to come back…" | **PASS** | P `s06-online` (page closed). QA: shown on the Corp's phone while the Runner reloads, gone once it is back (`*-10-online-waiting-for-other-player.png`). |
| App fully closed and opened again → **Rejoin game K7QF** puts you back in your seat | **PASS** | P `s06-online` (page closed, new page). QA "reload mid-game": the start screen offers "Rejoin game CODE" (`*-11-start-rejoin.png`), tapping it gives a view **identical** to before the reload, and play goes on from both phones. P: Android Back → "Leave the game?" keeps the seat for Rejoin. |
| A third phone with the code can't take a seat (automated) | **PASS** | P `s06-online` (third phone: "That game already has two players"). QA e2e: also **while the Runner is away** (on its start screen after a reload) the third phone is refused, and the Runner then rejoins. QA room: join → `full`; guessed token, token minus/plus a character, the stored token *hash* → `bad_token`; a stranger's act/create refused; the two players receive nothing and stay connected. E room "a third phone gets full", CI `test:dev` (real Worker: `full`, `no_game`, `bad_token`, Origin). |

### S-06-4 The online service goes live on the free account

| Criterion (short) | Result | Evidence |
|---|---|---|
| Once the account exists, updating the game updates the online service by itself (automated) | **BLOCKED ON OWNER SETUP** | Can't be run until the `CLOUDFLARE_API_TOKEN` secret exists. What QA checked: `server` workflow on d2feed1, 50da0cb, be8c8ee — **success, deploy steps skipped** with the notice (no red build). The `/health` step, run locally against `wrangler dev`: passes when the service reports the commit, fails when it reports another one, fails with a clear message when `OVERCLOCK_SERVER_URL` is unset. Test mode can't be on in production: `wrangler.jsonc` ships it off, and a live `wrangler dev` with the production settings and `BUILD` = a commit **ignored a requested seed** (3 games asked for seed 1 → 3 different deals) and **refused** `http://localhost:*` and `https://evil.example` pages; E `config.test.ts`. |
| Web link and app (**app-sprint-06**) both play online; web phone vs app phone | **BLOCKED ON OWNER SETUP** | Needs the live service. What QA checked: a web build with `OVERCLOCK_SERVER_URL=wss://overclock.example.workers.dev` has CSP `connect-src 'self' wss://overclock.example.workers.dev` and nothing else; the app build likewise; `check-android-bundle` passes on that exact origin and **fails** for a different origin, for no origin, and for `ws://` in the app; a non-`ws(s)` address fails the build. The app has the INTERNET permission, and `https://localhost` (the app) is on the service's allowed list. |
| Nothing charged, no card needed | **BLOCKED ON OWNER SETUP** | Only you can see your account (owner check 4). |

### S-06-5 "Hand the phone over" screen (pass-the-phone)

| Criterion (short) | Result | Evidence |
|---|---|---|
| End turn → cover "Pass the phone to the Runner. Tap when ready" hides every card until tapped | **PASS** | P `s06-cover` (card places pixel-flat under the cover; Back under it; resize). QA: from the start screen with real taps, 4 turns (credits tap, End turn, discard picker when needed): recorded **every drawn frame** — not one frame shows the next player's board without the cover (`*-02-cover-to-runner-0.png`, `*-02-cover-to-corp-1.png`). |
| Run: cover to the Corp before **Rez / Don't rez**, and another one back to the Runner | **PASS** | P `s06-cover` "Rez / Don't rez…". QA frame by frame: the Corp's choice never shows before the "to the Corp" cover; under the Corp's choice there are no Runner cards; after Don't rez no frame shows the Runner's cards before the "back to the Runner" cover. |
| Tapping the cover shows the board straight away (< 0.1 s, automated) | **PASS** | P `s06-cover` (cover gone and next frame drawn < 100 ms; the tap changes nothing). QA: tap placed **exactly on End turn** — only the cover goes, the game view is identical; lift-to-next-frame **1.9–15.8 ms** (4 lifts × 3 sizes); at **6× CPU slow-down**, 3 repeats × 2 phone sizes (24 lifts): **max 13.8 ms**. |

## Bugs / findings

**QA-S6-1 — A lobby you give up with Back can still be joined (Low)**
- Steps: phone A: Play online → Start a game → Corp, note the code, tap **Back** (the game is given up; it isn't offered for Rejoin). Phone B: Play online → Join with code → the code.
- Expected: phone B gets "No game with that code".
- Actual: phone B joins and sees the board with "Waiting for the other player to come back…", which never goes away (the service keeps the empty lobby for 2 hours). Shown against the local service with a raw socket: create, close, join → `sync` with `opponent: "away"`.
- Severity: low (only after someone backs out of their own lobby). Fix idea: a "leave lobby" message, or close the room when its creator gives it up.

**QA-S6-2 — How long the Corp takes can show the Runner the Corp *can* pay (Low; note for the architect and owner)**
- When the Corp can't pay, the service answers Don't rez after 1.2–2.4 s. When it can pay, a real person decides, often for longer. So if "Corp is deciding…" stays up more than ~2.4 s while the Corp is connected, the Runner can guess the Corp has the credits. The criterion as written (when the Corp *can't* pay, the Runner can't tell) **passes**: that case looks exactly like a quick "Don't rez". The proposal's risk note covers the short wait but not this guess. Options: accept it (it's how the real game feels with a slow opponent too), or stretch the automatic pause to a wider spread.

### Notes (not bugs)
- **Own board after a tap in the test browsers:** on the tapping phone the result (+1 credit) showed 115–300 ms after the tap in the headless test browser, while the other phone showed it in ~16 ms. Traced: the service answers in ~3 ms; the delay is the test browser's software drawing of the button's press animation (one long frame) holding the message, the same slow-frame effect seen in earlier sprints. The press itself reacts at once (button shrinks). Worth a look on a real phone (owner check 1).
- QA's first version of the "move arrives fast" test measured through the test runner's socket relay and failed in CI shard 1 at 1635 ms (twice) — the relay, not the game: measured in the pages on direct sockets it is 16–24 ms. Changed in be8c8ee to measure in the pages; the 1-second limit is unchanged.
- Card art on the Corp's own unrezzed ICE is a card back on its own phone (same as before this sprint); the run panel names the ICE.

## Hidden information (what was inspected)
Actual WebSocket frames, as received by each browser, were captured for every online QA test. Beyond "no card ids", QA compared each frame **in full** with the engine's projection of the true game for that seat (view and events), so any extra field would fail. No frame to either phone carries the seed, the random-number state, deck order, or the other seat's token. Seat tokens are kept only as hashes on the service (a stored hash used as a token is refused).

## Snappiness and rules checks
- Cover lift: < 16 ms normally, ≤ 13.8 ms at 6× slow-down (budget 100 ms). No animation added that blocks input; the pass-the-phone suites written before Sprint 6 all pass.
- Empty timing windows: the engine still auto-passes them (Sprint 3/4 tests green). Online, the Corp's approach of a face-down ICE is deliberately *not* empty (Don't rez is a real choice even when Rez is unaffordable); the service answers it after 1.2–2.4 s. Not a violation: it's the agreed hidden-information rule (DECISIONS 2026-11-13).
- Pass-the-phone still fully working: every earlier sprint's screen tests pass in CI (they skip the cover with a test switch); QA played 4 covered turns with real taps from the start screen and the covered rez decision.
- IP: real card names allowed (owner decision 2026-11-12); no images, fonts or logos added this sprint; the start screen and cover are drawn at runtime. **No IP violation.**

## Checks run
- `npm run lint` (QA files), `npm run typecheck`, `npm test` locally: **1140 unit tests pass** (ai 6, cards 25, engine 427, match 165, protocol 51, android 13, client 397, server 56 incl. QA 5).
- QA specs locally, `--retries=0`: web 30/30 (10 tests × 3 sizes), android 2/2; timing repeats only for S-06-5 (6×, 3 repeats, 2 sizes: 12/12).
- Full suite: not re-run locally (docs/TESTING.md). CI on 50da0cb: shards 2–4 green, shard 1 red only on QA's own relay-timed test (see notes). **CI on be8c8ee: all green** — e2e 4/4 shards **786 passed / 6 skipped / 0 failed / 0 flaky** (197/196/197/196), checks (incl. `test:dev` wrangler integration), guard-mutation, build, deploy, android build + publish, server (skipped green).
- Developers' CI on d2feed1: all green.

## Owner checks at demo
1. Once the service is live: play one online game on two phones. Does the other phone's move show in about a second? Does your own tap feel instant?
2. Tap **Share** in the lobby, send it in a messaging app, and open the link on the other phone: does it go straight into the game?
3. Pass-the-phone: tap End turn and check that nothing of your cards shows before "Pass the phone to…", and that the tap shows the next board at once.
4. In your Cloudflare dashboard: no card on file and nothing charged.
5. Releases page: **app-sprint-06** opens on the start screen; once the service is live, an app phone can play a web phone.
