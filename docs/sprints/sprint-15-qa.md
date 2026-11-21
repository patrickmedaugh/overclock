# Sprint 15 QA report

## Round 1 (2026-11-20, product code at ace31ae; branch head b10ef43 adds only STATE.md; QA's commits 041e9a1, 096d799 add only QA tests, one config line, screenshots and this report)

QA did not write the Sprint 15 code. Every criterion was checked with QA's own tests as well as the developers'. Movement is checked through the test hook's live flight list (`layout().motion`), the browser's own input timestamps and per-frame samples taken inside the page; where a flight had to be inspected mid-air it was frozen with the test switch (`motion=hold`) and stepped, and the taps were real taps through the browser.

**Result: S-15-1, S-15-2, S-15-3 and S-15-4 pass QA. S-15-5 passes everything checkable from here; the live play link, the real download on a phone and the demo-note links are manual owner checks (not passes).** No product bugs found. **One test-infrastructure bug (QA-S15-1): a developer unit test in `checks` times out on CI** (see Bugs; it made `checks` fail on QA's first push).

### QA's tests (new in this round)
- `apps/client/e2e/qa-sprint15.spec.ts` (18 tests; runs on `phone-short` 891×296, `phone` 844×390, `phone-small` 640×360, `desktop` 1280×800; added to `SHORT_SPECS`). `QA_SCREENS=1` writes screenshots to `docs/sprints/sprint-15-qa/` (only the 891×296 set and the upright shots of the other phones are kept in the repo, because of QA-S15-1). What it checks that the developers' specs don't:
  - press lift timed from the browser's **own** `pointerdown` timestamp with a per-frame sampler (not the game's log record); a quick tap (150 ms) leaves nothing lifted or enlarged;
  - the glide home after a drop away from every lit place, sampled frame by frame (in-between positions seen = a glide, not a jump);
  - a **button** install (tap to pick, tap the lit place): the flight starts at the hand card, moves toward the spot, settles, ≤ 0.6 s;
  - **pass-the-phone with the real cover on** (the developers' spec turns the cover off): the Corp installs, plays an operation and ends the turn while its own movement is frozen mid-air; the cover comes up; the Runner lifts it with a real tap; every flight the Runner's screen ever showed is recorded: nothing flies over the cover, the Corp's install flies in as a card back, and any face shown is a card the Runner's own view shows face up;
  - **online, the Corp's draws (2), install and end-of-turn discard (2)** seen on the Runner's phone: draws and install are card backs, a discard shows a face only if it is face up in the Runner's view of Archives, and none of those ids ever reaches the Runner's phone in a frame;
  - draw: the other hand cards slide (in-between positions sampled per frame); the Corp's start-of-turn draw flies from R&D;
  - Bank Job emptied → Heap; an accessed card **trashed** → Archives; an agenda **stolen** → the Runner's score pile, points tick with `score_tick`; each count/points value unchanged mid-flight and exact after landing;
  - end-of-turn discards for **both** sides (core decks, ≥ 2 cards) and Accelerated Beta Test's 3 cards: a ripple, all landed within 0.5 s of game time, counts exact;
  - taps during movement: a **real-time** tap during a one-shot card (no freezing) and a real tap during a frozen install; window listeners confirm cards were in the air when the finger went down and none once the tap was handled; answered < 100 ms; the tap's action happened;
  - long tasks (browser `longtask` entries) while a few turns of movement play: all < 600 ms; every movement record ≤ 600 ms;
  - upright mid-showcase → "Turn your phone sideways"; back sideways nothing in the air, Heap count exact, hand and rig where an idle board puts them;
  - the same Corp install in pass-the-phone and online: the same flight on the Corp's screen (from the hand, face up) and on the Runner's (a card back from the top).
- `play` branch served locally (static server on the exact branch contents) in a 891×296 phone browser: the start screen shows **Get the Android app**, tapping it downloads `overclock-sprint-15-20261120-1847-b125.1.apk` (3,452,828 bytes, same as the branch), no page errors (`r1-891x296-s15-5-play-branch-served-locally.png`).

### Runs
- `qa-sprint15.spec.ts`, `--retries=0`: phone-short first on its own **18/18 passed**; then phone, phone-small, desktop **51 passed, 3 skipped** (the touch-only hand tests and the upright test on desktop). After the CI fixes below, all 4 sizes again: **69 passed, 3 skipped**.
- QA's own test fixes after the first CI run (041e9a1): (1) the quick-tap test failed on CI at 844×390 (2 of 2 tries): the busy runner acknowledged the press late, so by the browser's stamps the "150 ms tap" was > 350 ms, which the game rightly treats as a hold (QA-S3-7 rule), leaving the hand view open. The test now stamps the press and release itself (150 ms apart): `--repeat-each=4` at the 3 phone sizes 12/12, at 6× throttle 3/3. (2) the real-time tap during a one-shot card missed the showcase once on a CI shard (passed on retry) because 4 workers on a no-GPU runner draw slowly; a second try now freezes the showcase (the tap stays real). Locally the real-time tap caught the showcase 12/12 at 4 sizes (×3 repeats).
- Timing: the "tap during movement" tests `--repeat-each=3` at all 4 sizes: **24/24**. 6× CPU throttle (TESTING §3, timing specs only): `s15-snappy` all sizes **11 passed, 1 skipped** (rotate on desktop, by design); QA's S-15-4 group at phone-short + desktop **9 passed, 1 skipped**.
- Developers' `s15-hand`, `s15-flights`, `s15-online`, `s15-snappy`, `s15-site` + `rotate` at phone-short/portrait: **20 passed, 1 skipped**.
- `npm run lint`, `npm run typecheck`, `npm test` (incl. `s15-motion-leak` over 30 seeded games both seats, `links.test`, `scripts/test/site.test.mjs`): all pass. `node scripts/check-workflows.mjs`: "workflows OK (50 files free of github.io / Releases links)".
- Full e2e pass: CI manual runs (see "CI result").

**Note on the test machine:** this sandbox draws a *moving* frame in ~100–250 ms (no GPU; idle frames 17 ms; a plain credit pop costs the same as a flight, so this is not caused by the movement). A real-time tap therefore often arrives after a 0.35 s install has already landed; that test freezes the flight instead (the tap is still real). The 0.48 s one-shot card was caught in real time at every size. The phone smoothness itself can only be judged on the owner's phone (manual check below).

### Per-criterion results

**S-15-1 Cards lift and lean in your hand: PASSED QA (5/5)**
| AC | Result | Evidence |
|---|---|---|
| Press the big card → rises and grows within 0.1 s; settles back if let go without holding | PASS | qa "the big card starts rising within 100 ms…" (first grown frame measured from the browser's pointerdown stamp, < 100 ms; reaches ≥ 7 % bigger and rises; < 10 %; quick tap → nothing lifted); dev `s15-hand` press + swipe-settle tests; dev screen `docs/sprints/sprint-15-screens/s15-1-press-lift-891x296.png` |
| Drag: stays under the finger, leans with the movement (more when faster), straightens when stopped | PASS | dev `s15-hand` "a lifted card leans…" (sign, slow < fast, ≤ 14°, back to 0) run by QA at 891×296; `leanAngle` unit tests |
| Let go away from a lit place → glides back | PASS | qa "let go away from every lit place…" (in-between frames seen; `hand_return`/`card_return` ≤ 200 ms; hand view back) |
| Swipe card to card → slides | PASS | dev `s15-hand` swipe (`carousel_slide` > 0 and ≤ 600 ms, new card comes in from its side), run by QA |
| Mouse: point at a hand card → lifts a little, leans toward the pointer | PASS | dev `s15-hand` "with a mouse" (desktop; hover rise/rotation, touch area unchanged) in CI's full pass |

**S-15-2 Played cards fly to the board and land: PASSED QA (5/5)**
| AC | Result | Evidence |
|---|---|---|
| Drop on a lit place → flies from the finger to its spot, lands with a settle | PASS | dev `s15-flights` drop test (starts at the finger, `land_settle` ≤ 150 ms) run by QA; qa button install (`land_settle`, ≤ 0.6 s); `r1-891x296-s15-2-button-install-mid.png` |
| Corp face-down install flies face down; the Runner never sees its face (pass-the-phone and online) | PASS | qa pass-the-phone **with the cover** (install = back from the top; nothing over the cover; no hidden face) and qa online (install + 2 draws = backs; ids never in the Runner's frames); dev `s15-flights`, `s15-online`; unit `s15-motion-leak`; `r1-891x296-s15-2-cover-up.png`, `r1-891x296-s15-2-runner-sees-back-fly-in.png`, `r1-891x296-s15-2-online-runner-sees-discard-backs.png` |
| One-shot card → middle, shows, then to the discard pile | PASS | dev `s15-flights` showcase (middle, bigger, Heap +1 on landing); qa real-time tap during a showcase (Heap exact) and upright mid-showcase |
| Install/play from a button → flies from the hand the same way | PASS | qa "a button install…" (starts at the hand card, all sizes incl. desktop); dev showcase test plays by tap |
| Other player's card flies in from their side (online / after passing) | PASS | qa pass-the-phone with cover + online; qa "same Corp install… pass-the-phone and online"; dev `s15-online` |

**S-15-3 Cards fly to and from the piles: PASSED QA (4/4)**
| AC | Result | Evidence |
|---|---|---|
| Draw (click or Corp turn start) flies from the deck, other cards slide aside | PASS | qa "a draw…" (in-between positions of the other cards); qa "the Corp's draw at the start of its turn…" (one `draw` flight from R&D); dev `s15-flights`; `r1-891x296-s15-3-after-draw.png` |
| Trashed/discarded → right pile, count goes up as it lands | PASS | qa Bank Job → Heap, accessed card trashed → Archives, end-of-turn discards both sides (count unchanged mid-flight, exact after); `r1-891x296-s15-3-bank-job-to-heap.png`, `r1-891x296-s15-3-access-trash-mid.png`, `r1-891x296-s15-3-{runner,corp}-discard-ripple.png` |
| Score / steal → score pile, points tick with a glow on landing | PASS | dev `s15-flights` (Corp score); qa steal (pile and points unchanged mid-flight, `score_tick`, exact points after); `r1-891x296-s15-3-access-steal-mid.png` |
| Several cards → quick ripple, ≤ ~0.5 s | PASS | qa end-of-turn discards (Runner and Corp) and ABT (3 cards): last card landed by ≤ 510 ms game time (10 ms steps); unit `s15-motion-leak` (every multi-card batch ≤ 500 ms); `r1-891x296-s15-3-abt-ripple.png` |

**S-15-4 Never slower than today: PASSED QA (4/4 automated; AC3 is a manual owner check)**
| AC | Result | Evidence |
|---|---|---|
| Tap while moving → movement ends at once, tap answered < 0.1 s (891×296, 844×390, 640×360, desktop) | PASS | qa real-time tap during a showcase (frozen only as a fallback on a busy runner) + real tap during a frozen install, all 4 sizes, ×3 repeats (cards in the air at pointerdown, none once handled, `motion_skipped`, state < 100 ms, the action happened); dev `s15-snappy`; 6× throttle runs above |
| Nothing stops play for more than 0.6 s | PASS | qa long tasks while moving all < 600 ms; every movement record ≤ 600 ms (qa + dev); unit `s15-motion-leak` budget |
| Owner's phone (891×296, browser and app): smooth, not slower than Sprint 14 | **MANUAL (owner)** | Cannot be judged on this machine (no GPU). Owner: play 2–3 turns in the phone browser and the Android app; watch draws, installs, Sure Gamble, end-of-turn discards. |
| Upright mid-movement → cards end up in place | PASS | qa upright mid-showcase (prompt shows, nothing left in the air, Heap exact, hand/rig = idle layout); dev `s15-snappy` rotate mid-draw; `r1-{844x390,640x360,891x296}-s15-4-upright-mid-movement.png`, `r1-*-s15-4-back-sideways.png` |
| Same movement in pass-the-phone and online (and the app) | PASS (app part manual) | qa "the same Corp install…" (identical flight on both screens in both modes). The Android app runs the same bundle (`android` project in CI); seeing it on the phone is part of the owner check above. |

**S-15-5 Play link and app download with a private repo: PASSED QA for what can be checked here (3 automated/inspected; 3 manual owner checks)**
| AC | Result | Evidence |
|---|---|---|
| Private repo: new play link loads on a phone, Play online works | **MANUAL (owner)** | https://overcloc.netlify.app cannot be reached from this sandbox, and it shows the new build only after the owner sets Netlify's production branch to `play` (the `site` job's soft check got 404 for `app/latest.json` on ace31ae: "did not show commit ace31ae within 90 s", a warning). What QA checked: the `play` branch holds the built game + `app/latest.json` + `netlify.toml`; the built page's CSP allows the real online service. |
| New push → reload shows the newest build incl. the sprint under review, with "Built …" | PASS (branch side) / MANUAL (live) | `play` = commit 70cecba "Play site: sprint-15 ace31ae, built 2026-11-20 18:47 UTC (run 44795848954)"; `latest.json` `{buildTime 2026-11-20 18:47 UTC, versionCode 125, branch sprint-15, commit ace31ae…}`; the bundle carries that build time. android runs on sprint-15 (9 pushes, ace31ae back to c489d8f): build/site/publish all success; site log: "play site OK … Published sprint-15 ace31ae". Live reload = owner check. |
| No GitHub account: Get the Android app → newest app downloads, installs over the old app, keeps decks/saves | PASS (download) / MANUAL (install) | Served `play` branch at 891×296: button shown, tap downloads the 3.45 MB APK (`r1-891x296-s15-5-play-branch-served-locally.png`); `netlify.toml` serves the APKs as `application/vnd.android.package-archive`, attachment, no-cache; build log: signer SHA-256 `5105…aa99` = the pinned key, `versionCode 125` checked; dev `s15-site` (shown with `latest.json`, hidden without, 44 px, covers nothing). Installing over the old app on a phone = owner check. |
| App's share link opens the new play link | PASS | The APK's bundle (`assets/public/assets/index-*.js`) contains `overcloc.netlify.app` and no `github.io`; `OVERCLOCK_WEB_URL` defaults to `https://overcloc.netlify.app/` in android.yml; `links.test` Netlify case |
| Private repo push → no check fails because the GitHub play link is off | PASS | `deploy.yml` (Pages) gone; workflows are android/ci/server only; no `pages`/`github.io` in `.github`; `check-workflows` (in `checks`) passes; ace31ae/b10ef43 checks all green (the `deploy` check is server.yml's Cloudflare deploy) |
| Sprint 15 demo notes: every link works without GitHub sign-in | **PENDING / MANUAL** | `docs/sprints/sprint-15-demo.md` does not exist yet. `check-workflows` will fail CI if it links github.io or Releases; the owner opens the links. |

### Definition of Done checks
- **Sizes:** QA tests pass at 891×296, 844×390, 640×360 and 1280×800; upright phone mid-movement shows "Turn your phone sideways".
- **Snappiness:** taps during movement answered < 100 ms; movement records ≤ 600 ms; long tasks < 600 ms; timing windows: no engine change this sprint (`RULES_VERSION` 5), the auto-pass rules are unchanged and covered by the existing specs in CI's full pass.
- **Hidden information:** checked on screen (pass-the-phone with the cover, online) and in the frames; plus the developers' 30-game unit check.
- **IP check:** real card names and text are allowed (owner, rule 3). Flights reuse the runtime-drawn card faces and backs; no images or logos added (no new image files in the client; the `play` branch has only the built game, favicon and APKs).

### Bugs
**QA-S15-1 (test infrastructure, engine-dev; blocks a green `checks`): `scripts/test/ci.test.mjs` › "fails if ci loses a test step, a required job name or the PR e2e run" times out on CI.**
- Repro: push any commit that adds a few MB under `docs/sprints/` (QA's 041e9a1 added 14 MB of screenshots), or just re-run `checks` a few times. CI job log: `× check-workflows > fails if ci loses a test step… 5899ms` → `Error: Test timed out in 5000ms`, `checks` = failure (both the push run 44802426296 and the manual run 44802486152 on 041e9a1).
- Cause: `copyWith()` copies the whole `docs/sprints` folder (≈ 290 MB of screenshots) into a temp dir **for every case**, and this test has 7 cases in one `it` (5 s default timeout). The same test already took 4,871 ms on ace31ae and 2,492 ms on becf5f8 in CI: it was a coin-flip before QA's commit and gets slower with every sprint's screenshots. Locally 2.9 s (fast disk).
- Expected: `checks` stays green regardless of how many screenshots the sprints add. Suggested fix (developer's call): copy only the `sprint-*-demo.md` files (the only `docs/sprints` files `check-workflows` reads), or give the test a longer timeout.
- QA trimmed its own screenshots to 5.8 MB to reduce the effect; that does not fix the test.

### Observations (not bugs)
0. In the first manual CI run (041e9a1) two older specs were flaky (passed on retry): `qa-sprint07` "drag latency … < 100 ms" (phone-small) and `s07-hand` "swiping browses the hand…" (desktop). Both touch the hand view that now slides; worth watching, not a failure (retry rule).
1. On this no-GPU test machine any animated frame takes ~100–250 ms (also a plain credit pop), and the browser holds a tap until the frame is out (one tap waited 434 ms in the queue). Real phones draw on the GPU; the owner's smoothness check covers it.
2. Pass-the-phone catch-up flies only the other player's installs and plays (their draws and discards are not replayed after the hand-over), while online the other phone's draws and discards also fly, as card backs (DECISIONS, U1–U6 (6), accepted by the architect). For the same move (an install) both modes show the same flight.

### Manual owner checks (not faked)
- In Netlify, set Production branch to `play`; then open https://overcloc.netlify.app on the phone: the game loads, "Built 2026-11-20 …" matches the newest build, **Play online** works.
- Tap **Get the Android app** on the phone: the app downloads and installs over the old one; decks and saved games are still there; share an online game code from the app: the link starts with https://overcloc.netlify.app.
- Play 2–3 turns at 891×296 in the browser and in the app: movement looks smooth and nothing feels slower than Sprint 14.
- Open every link in the Sprint 15 demo notes without being signed in to GitHub.

### CI result
- **096d799 (`096d799600dc7906f2653709903355b1f4008100`, QA's final test commit; product code = ace31ae): manual run 44808642199 — success.** `checks` success (the QA-S15-1 test took 2,602 ms this time), `guard-mutation` success, **`e2e shard 1/4`, `2/4`, `3/4`, `4/4` all success** (534 + 530 + 523 + 522 passed, 31 skipped; 2 flaky that passed on retry: `qa-sprint01` "longest turn change … Corp turn starts with its free draw" on phone, `s07-hand` "swiping browses the hand…" on desktop), `e2e` success. This is the round's full pass. The push run 44808593949 on the same commit shows `checks`/`e2e` failure only because QA's dispatch cancelled it (its `changes` job was cancelled, so `checks` reports "cancelled ≠ success" by design).
- 041e9a1 (QA's first commit): manual run 44802486152 — failure: `checks` failed on QA-S15-1 (5,899 ms); `e2e shard 1/4` failed on QA's own quick-tap test at 844×390 (fixed in 096d799, see Runs); shards 2–4 success (2 + 1 flaky: `qa-sprint07` drag latency phone-small, `s07-hand` swiping desktop, QA's real-time showcase tap phone-short — fixed).
- android workflow on ace31ae (run 44795848954): build, site, publish success; `play` = 70cecba. (QA's pushes publish `play` again with the same product code.)

## Round 2 (2026-11-20, branch head 975075d; product code unchanged since round 1 (= ace31ae))

Scope: verify the fix for QA-S15-1 and record the owner's report on the live site. Product code has not changed since QA's full manual CI pass on 096d799 (all 4 e2e shards green), so no new full screen-test run was made this round (TESTING.md; the demo PR runs the full suite again).

### QA-S15-1 fix (975075d, engine-dev): VERIFIED FIXED
- **No assertion removed:** `git show 975075d` changes only `scripts/test/ci.test.mjs` (+16/−3). `copyWith()` no longer copies all of `docs/sprints`; it copies only `sprint-NN-demo.md` files (the folder structure plus a `cpSync` filter). All existing `expect`s are kept (53 before, 55 after). The 2 new ones are in the new guard test "the test copy holds every file check-workflows reads": it checks that `linkFiles()` on the copy equals `linkFiles()` on the real repo, and that `checkWorkflows(copy)` is clean.
- **Fast:** `npm run test:scripts` locally gave 35/35 passed, `ci.test.mjs` (21 tests) in 358 ms, whole run 1.4 s. In CI (`checks` on 975075d) `ci.test.mjs` took 322 ms (it was 2.5–5.9 s before).
- **Guard test checked by mutation (QA, not committed):** `linkFiles()` reads demo notes only from sprint 15 on, and `sprint-15-demo.md` does not exist yet. So today the guard only compares the workflow and client files. QA first changed the filter to `/sprint-1\d-demo\.md$/` and the guard still passed, which is correct because sprint 15+ still matches. QA then added a temporary `docs/sprints/sprint-15-demo.md`. With the real filter it gave 35/35 passed. With the filter changed so it matches nothing, it gave **1 failed** ("the test copy holds every file check-workflows reads"). So the guard catches a filter that drops a demo note. QA reverted both changes, and the tree is clean.

### Owner information (from the owner in chat, 2026-11-20; owner-reported, not QA-verified)
- The owner set Netlify's production branch to `play`, opened the live site and said "looks good". **S-15-5 live play link: the owner confirmed the live site after switching the branch.** QA cannot reach https://overcloc.netlify.app from this sandbox and has not checked it.
- Note: the android `site` job on 975075d published `play` = 0014dcc (`latest.json`: commit 975075d, built 2026-11-20 20:38 UTC, versionCode 128). Its soft check still warned that "`https://overcloc.netlify.app/app/latest.json` did not show commit 975075d within 90 s". This is a warning only. Netlify may just have been slow to deploy. If a reload of the live link does not show "Built 2026-11-20 20:38" (or later), the owner should tell us.

### CI result (round 2)
- **975075d (`975075d6bea7fd02f8bf51985d82d971f7cca583`), push run 44812922568 (ci): success.** `changes` success, **`checks` success** (lint, typecheck, `npm test` incl. `scripts` 35/35), `e2e` success. `e2e shard N/4` and `guard-mutation` were skipped by the `changes` job because only a script test changed (no client/engine code). The full e2e pass for this product code is run 44808642199 on 096d799 (round 1, all 4 shards green).
- Same commit: android run 44812922716 success (build, site, publish); server run 44812922573 success (`deploy`).

### Final per-story result (Sprint 15)
| Story | Result |
|---|---|
| S-15-1 Cards lift and lean in your hand | **PASSED QA** (5/5) |
| S-15-2 Played cards fly to the board and land | **PASSED QA** (5/5) |
| S-15-3 Cards fly to and from the piles | **PASSED QA** (4/4) |
| S-15-4 Never slower than today | **PASSED QA** for all automated criteria (AC1, AC2, AC4, AC5). **AC3 (smooth on the owner's phone, browser and app) is still a manual owner check** |
| S-15-5 Play link and app download with a private repo | **PASSED QA** for everything checkable here (no failing check, play branch contents and download, app share link). **Live play link: owner confirmed after switching Netlify to `play` (owner-reported).** Still owner demo checks: installing the app over the old one with decks/saves kept, **Play online** on the live link, and the Sprint 15 demo-note links without GitHub sign-in (the demo notes do not exist yet) |

**Bugs open: none.** QA-S15-1 is fixed (975075d). The observations from round 1 still stand.

## Round 3 (2026-11-21, S-15-6 "Hold a card to play it"; product code at e6c4266, branch head fc13c14 adds only DECISIONS/STATE)

QA did not write the S-15-6 code. Every S-15-6 criterion was checked with QA's own tests (new section "QA S-15-6" in `apps/client/e2e/qa-sprint15.spec.ts`), which deliberately do **not** use the developers' `pickHand`/`pickCard` helpers: QA drives its own touch / mouse gestures through the browser (CDP), works out the lit places from the **card type and the board** (not from the game's own option list), compares every drop with the engine applying the same option directly, records every frame inside the page (held card, lit places, hand strip position, frame length) and times everything from the browser's own input stamps.

**Result: S-15-6 does NOT fully pass QA: 11 of 12 criteria pass (AC9 on intent, with a wording question for the PM); AC1 fails in one case (bug QA-S15-2: on a busy page a quick sideways flick can pick the card up and even play it). S-15-1..S-15-5 still pass where hold-to-play touched them.**

### QA's tests (new in this round, 22 tests x 4 sizes; in `SHORT_SPECS` so 891x296 runs too)
| Test (qa-sprint15.spec.ts › "QA S-15-6 …") | What it checks |
|---|---|
| AC1: sideways flicks in the hand view … | 5 flicks (flat left/right, rising 30° and 45°, falling 30°), stamped 25 ms apart: each browses (index moves), no frame ever shows a held card, lit place or dropped hand, no `card_lift`, game unchanged |
| QA-S15-2 repro (gated: `QA_REPRO=1`) | the bug below; skipped in CI until the fix |
| AC1/2: a sideways slide along the small hand … | no pick-up, nothing lit |
| AC2: held still … lifts at 0.25 s … | lift ≥ 245 ms after the browser's down stamp and on time (architect's frame rule); no frame held before 0.25 s; card stays under the finger at 3 spots; big view gone; every other hand card below the screen; `hand_minimize` ≤ 120 ms |
| AC2: an upward drag on the big card … | 25° off vertical, made 40 ms after the down: lifted on that move (< 100 ms after the page handled it) |
| AC2: straight up out of the small hand … | a still hold on the strip reads big and never picks up; straight up picks up, the hand view never opens, the rest of the hand drops off screen |
| AC3: every place … lights in the same frame … | 9 card types, Corp and Runner (upgrade, ICE, operation, asset, agenda, event, resource, hardware, program): the lit set equals QA's expectation from the type (ICE/upgrade: HQ, R&D, Archives, remotes, new server; asset/agenda: remotes + new server; programs/hardware/resources: the rig; events/operations: the table); all lit in the lift's first frame; all on screen; no two lit places overlap |
| AC4/5: over each lit place in turn … | Ice Wall with a remote on the board: over each of the 5 places only that one is strongly highlighted, off it none; `drag.arrow` null at every hover |
| AC6 (6 tests) | drop on a lit place = the engine applying the same option to the same deal (whole game view equal): Corp ICE onto R&D that already has ICE (−1 credit), asset to a new server, upgrade into HQ (dragged up in the hand view), Hedge Fund on the table (+4), Runner Gordian Blade on the rig (−4), Easy Mark on the table (+3); picked up 3 ways (strip, still hold, drag up); it flies and lands; hand back (`hand_restore` 120 ms); every record ≤ 600 ms |
| AC7 | let go on empty table, at the bottom edge where the hand was, on a dimmed place (R&D at 3 credits with 2), and a cancelled touch: game unchanged, glide home (`card_return`/`hand_return` 140 ms), hand back; the dimmed place says "Not enough credits" on release |
| AC8 | three real 80 ms taps on the big card: view stays on the card, "Hold to play" on screen, game unchanged; then a tap on the strip opens the view |
| AC9 (3 tests) + online | no clicks: "No clicks left"; Hedge Fund (5) with 4 credits: "Not enough credits"; Neural EMP before a run: "Only after the Runner made a run"; online Runner phone on the Corp's turn: "Not your turn". Each: lifts dimmed, nothing lit in any frame (also dragged over the table), the line shows < 100 ms after the lift, let go → game unchanged |
| AC10 (desktop) | mouse click on the big card = tip only; mouse press-and-hold lifts, drag to R&D, release installs; mouse drag-up from the strip, Hedge Fund on the table, +4 |
| AC11 pass-the-phone with the real cover | Corp holds and plays (Enigma on R&D), turn ends, cover comes up, real tap lifts it, Runner holds and plays (Armitage Codebusting on the rig) |
| AC11/AC9 online | Runner's phone: on the Corp's turn a held card is dimmed "Not your turn" and nothing is sent; on his turn he holds a card over the rig for 1 s: his phone sends no game frame and the Corp's phone receives none, the Corp's view is unchanged; on release exactly one action is sent and the Corp sees the card in the rig |
| AC12 timing | press reaction (< 100 ms after the page handled the press; drawn on the next frame), lift ≥ 245 ms and on time, card home and strip fully up ≤ 600 ms after letting go, picked up again at once (lift < 100 ms after the move), every record ≤ 600 ms, next tap answered < 100 ms, all long tasks < 600 ms |

### Runs
- `qa-sprint15.spec.ts` (whole file, rounds 1+3), `--retries=0`: **891x296 first: 39 passed, 2 skipped**; then 844x390 **39 passed, 2 skipped**, 640x360 **39 passed, 2 skipped**, desktop **37 passed, 4 skipped** (skips: the gated repro; AC10 runs on desktop only; round 1's touch-only tests on desktop).
- Developers' `s15-hold.spec.ts` at 891x296: 13/13 passed.
- **6x CPU throttle, hold timing only** (TESTING §3): QA's AC12 and AC2 still-hold, the developers' s15-hold still-hold and s15-snappy S-15-6 test, at all 4 sizes: **16/16 passed**. Raw lift after the down at 6x: 560–900 ms, with frames of 300–530 ms on this GPU-less machine; long tasks max 532 ms (desktop), all < 600 ms.
- Unthrottled raw numbers (this machine draws a frame in 200–300 ms while the card rises): press reaction 0.4–0.6 ms after the page handled it, drawn 17–31 ms after the finger (phones); lift 364–543 ms after the down; card home + strip up 148–219 ms after letting go; pick-up again 1 ms after the move; next tap state 2 ms. **Timer accuracy check** (scratch, not committed): with fast frames (844x390 at 1x pixels) 5 holds lifted at 250, 256, 268, 289, 369 ms — the game's 0.25 s is accurate; the extra on the test machine is frame time. The feel on the owner's phone is an owner check.
- `npm run lint` (eslint on the spec) and `npm run typecheck` (`tsc -b`) pass.

### S-15-6 per-criterion results
| AC | Result | Evidence |
|---|---|---|
| 1 Flick left/right in the hand view browses, nothing picked up | **FAIL (QA-S15-2)** | Normal case PASS: "AC1: sideways flicks…" and "AC1/2: a sideways slide…" at 4 sizes (flicks flat, rising to 45°, falling all browse; no held/lit frame). **Fails when the page is busy for a moment:** a quick flat flick made before 0.25 s but handled after the hold timer ran is picked up, and if let go over a lit place the card is **played and paid for** (repro test, 2/2 sizes; 3/3 in scratch runs). The sprint's own rule (S-15-6 risks: "a press is judged by its own start and end times") is not kept for sideways moves |
| 2 Still hold 0.25 s / drag up (hand view and straight up from the strip) lifts; under the finger; view fades; hand drops away | PASS | "AC2: held still…", "AC2: an upward drag…", "AC2: straight up out of the small hand…" at 4 sizes; dev s15-hold (strip hold-read then up); `r3-891x296-s15-6-held-ice-from-view.png`, `r3-{891x296,844x390,640x360,1280x800}-s15-6-held-from-strip.png` |
| 3 Every legal place lights at once; Corp servers + new server, Runner rig, events/operations the middle; can't-go places unlit/dimmed with reason | PASS | "AC3: every place…" (9 types, both sides, QA's own expectation, same frame, on screen, no overlaps; smallest lit place 56 px at 891x296 (rig 40 px tall), 69–83 px elsewhere); dimmed place with reason: AC7; `r3-891x296-s15-6-lit-{asset,event,program}.png` |
| 4 Over a lit place: strong highlight; off: plain lit | PASS | "AC4/5…" at 4 sizes; `r3-*-s15-6-hover-rd-no-arrow.png` |
| 5 Arrow only if it doesn't crowd 891x296, else highlight only | PASS (fallback chosen) | Decision: **no arrow, strong highlight only** (`ARROW = false`, DECISIONS 2026-11-21 U9: drawable at only 38.5 % of 270 hover points at 891x296, crossed faces/pills). QA: `drag.arrow` null at every hover over every lit place, 4 sizes; dev arrow on/off shots `docs/sprints/sprint-15-screens/s15-6-arrow-{on,off}-*.png`. The demo notes must say so with a screenshot (demo notes not written yet) |
| 6 Release on a lit place plays/installs there, same cost, flies and lands, hand comes back | PASS | 6 "AC6…" tests at 4 sizes: whole game view equal to the engine applying the same option (costs −1, 0, 0, +4, −4, +3 credits, −1 click); `install_flight`/`play_flight`+`showcase`, `land_settle`; `hand_restore` 120 ms |
| 7 Release elsewhere / on a dimmed place: nothing played or paid, glides back, hand up, dimmed place shows its reason | PASS | "AC7…" at 4 sizes (4 ways to let go, incl. a cancelled touch); `r3-891x296-s15-6-over-dimmed-place.png` |
| 8 Quick tap on the big card: not played, nothing lit, stays big, "Hold to play"; tap on the closed hand opens the view | PASS (see note) | "AC8…" at 4 sizes; `r3-891x296-s15-6-hold-to-play-tip.png`. Note: on this slow machine, when the page handled the tap's release only 0.4–0.85 s after the finger, a tap twice showed the held card and lit places for 1–2 frames before turning back into the tip (desktop); never played. Same cause as QA-S15-2 (timer runs before queued input); not seen when the release is handled in time |
| 9 Unplayable card lifts dimmed, nothing lit, short line says why, let go sends it back | PASS on intent; **wording flagged for PM** | 3 "AC9…" tests + online at 4 sizes (no clicks, not enough credits, needs a run, not your turn). **Wording:** the AC example says "Needs 5 credits"; the build says **"Not enough credits"** (Hedge Fund costing 5 with 4 credits; the architect's verdict notes this). It says *why* (the intent), not *how many*; the card's cost (5) is printed on the dimmed card. PM: accept, or ask for "Needs N credits". `r3-891x296-s15-6-dimmed-{c05,c01,c12}.png`, `r3-891x296-s15-6-online-not-your-turn.png` |
| 10 Mouse: press, hold and drag works like a finger; no tap-to-play | PASS | "AC10…" (desktop); AC2–AC9 tests also run with the mouse on desktop; `r3-1280x800-s15-6-mouse-hover-rd.png` |
| 11 Corp and Runner, pass-the-phone and online (and app); online the other phone sees nothing while held, only the played card | PASS (app: CI + owner) | "AC11 pass-the-phone with the real cover…", "AC11/AC9 online…" (Runner holding, frames counted both ways); dev s15-online (Corp holding: face-down card only); app bundle: dev `android.spec` "S-15-6 in the app bundle…" in CI's `android` project; `r3-891x296-s15-6-pass-cover.png` |
| 12 Reacts < 0.1 s, lifts at 0.25 s, nothing blocks > 0.6 s (891x296, 844x390, 640x360, computer) | PASS (by the agreed frame rule) | "AC12…" at 4 sizes + 6x throttle run (above). Raw lift times on this machine are 0.36–0.54 s because a frame takes 0.2–0.3 s here; with fast frames the lift is at 0.25 s. Phone feel = owner check |

### S-15-1..S-15-5 re-checked where hold-to-play changed things
- **S-15-1** AC1 (press rises < 0.1 s; quick tap leaves nothing enlarged, now with the "Hold to play" tip) and AC3 (glide home) — QA round-1 tests (updated by ui-dev for the tip; QA reviewed the diff: the checks were kept, only "a tap picks" became "a tap shows the tip") pass at 4 sizes. AC2/AC4/AC5 dev specs unchanged in behaviour: PASS.
- **S-15-2** AC1 (drop flies from where it was let go and settles) — QA round-1 test (now "a held install…") and QA AC6 pass. **AC4 ("from a button, e.g. on a computer") is now met by mouse hold-and-drag**: QA AC10 + AC6 on desktop (fly + land). AC2/3/5 round-1 tests pass: PASS.
- **S-15-3, S-15-4**: round-1 tests pass at 4 sizes; S-15-4 AC1 (tap during movement < 0.1 s) still passes; hold timing in AC12 above.
- **S-15-5**: no change in this round (client hold code only).

### Bugs
**QA-S15-2 (ui-dev; blocks S-15-6 AC1): a quick sideways flick on a busy page picks the card up — and can play it.**
- Repro (automated): `QA_REPRO=1 npx playwright test e2e/qa-sprint15.spec.ts --project=phone -g "QA-S15-2"` (from `apps/client`). Fails at 844x390 and 891x296 every time.
- Repro (by hand, what the test does): seed 4 board, tap Hedge Fund in the hand (hand view opens on it). Put a finger on the big card; while the page is busy (the test makes 4 frames of 350 ms), flick flat to the left (125 px) 70–110 ms after the finger went down and let go at 120 ms.
- Expected: by its own times this is a quick sideways flick: the view browses, nothing is lifted or played.
- Actual: `card_lift`, `hand_minimize`, then `play_flight`, `showcase`, `credit_pop`: **Hedge Fund is played (credits 5 → 9, one click spent)**. With Ice Wall the same flick installs it (`install_flight`).
- Cause (from reading `board.ts`): the 250 ms hold timer runs before the queued moves are handled and lifts the card; `onViewMove` then sees `this.lift` and treats the move as a drag (the swipe check by event time is skipped), and `onViewUp` only undoes a stalled lift when the press was a **tap**, not a swipe, so it calls `dropLift` at the release point. Suggested fix (dev's call): when a lift came from the timer, a move or release whose own time is before `HOLD_MS` and that left the 12 px circle sideways undoes the lift (as for the tap) and becomes the swipe. Remove the `QA_REPRO` skip with the fix.
- How likely on a phone: needs the page to be busy for ~0.15–0.25 s while the finger flicks (rare on a fast phone, more likely on a slow one). Its harm is high: credits and a click spent on a card the player only wanted to browse past.
- Related, minor (same cause, no fix needed if the above is fixed generally): on a very slow page a quick tap can flash the lit places for 1–2 frames before showing "Hold to play" (seen twice on desktop on this machine); never plays.

### Observations (not bugs)
1. The held card at 891x296 sits over part of the place under it (R&D's count is hidden while hovering), see `r3-891x296-s15-6-hover-rd-no-arrow.png`; the place's strong highlight and price pill stay visible. Owner feel check.
2. Flicks in the hand view sometimes move two cards at once (fast flick) — as before S-15-6, not part of this story.

### Manual owner checks (not faked)
- On the phone (891x296, browser and app): flick left/right through the hand quickly — it must never pick a card up; hold still and drag up from the hand view and from the small hand; arrow-or-no-arrow question; the "Not enough credits" wording.
- Smoothness of the lift, the hand dropping away and coming back on the phone.

### CI result (round 3)
- e6c4266 (developers' last code): PR run 44863759529 — `checks`, `guard-mutation`, `e2e shard 1/4`…`4/4` all success, 0 flaky (from the architect's review; confirmed by QA with `gh api …/commits/e6c4266/check-runs`).
- **7396b59 (`7396b5913ddd303029e9f03108638c4dde4283b2`, QA's round-3 tests + this report; product code = e6c4266): manual run 44872460701 — success.** `checks` success, `guard-mutation` success, **`e2e shard 1/4`, `2/4`, `3/4`, `4/4` all success** (571 + 566 + 561 + 557 passed; 3 + 8 + 13 + 14 skipped, incl. the gated QA-S15-2 repro at 4 sizes), `e2e` success. QA's 22 S-15-6 tests passed at all 4 sizes; the app-bundle case (`[android]` "S-15-6 in the app bundle…") passed. **2 flaky (passed on retry), both developer swipe tests at 891x296:** `s15-hand` "a press that moves on without a hold (a swipe) settles the big card back" and "swiping in the hand view slides the cards into place instead of jumping" — in both, a real-time sideways swipe in the hand view did not browse (timed out waiting for the view to move). No trace was kept (no artifacts), so QA cannot tell whether the runner was slow enough that the first move came after 0.25 s (a real hold) or this is QA-S15-2 (a move made before 0.25 s handled after the timer); both touch the same code path — ui-dev should re-run these two after the QA-S15-2 fix.
- The PR's own `pull_request` run did not start on QA's push: PR #34 is not mergeable (`mergeable_state: dirty`) because `docs/STATE.md` conflicts with `main` (already at fc13c14, before QA's commit; main's 5818caf "STATE: Sprint 15 reopened" vs the branch's STATE edits). QA therefore dispatched the one manual run above; the push run 44872204892 shows "cancelled" because the manual run replaced it (concurrency group). **Lead: resolve the STATE.md conflict so PR #34 runs its checks again.**

### Final per-story result (Sprint 15, round 3)
| Story | Result |
|---|---|
| S-15-1 Cards lift and lean in your hand | **PASSED QA** (5/5, re-checked with hold-to-play) |
| S-15-2 Played cards fly to the board and land | **PASSED QA** (5/5; AC4 now by mouse hold-and-drag) |
| S-15-3 Cards fly to and from the piles | **PASSED QA** (4/4) |
| S-15-4 Never slower than today | **PASSED QA** for AC1, AC2, AC4, AC5; AC3 phone smoothness = owner check |
| S-15-5 Play link and app download with a private repo | unchanged from round 2 (owner checks listed there) |
| S-15-6 Hold a card to play it | **NOT PASSED: 11/12 PASS (AC9 on intent, wording question for the PM), AC1 FAIL (QA-S15-2)** |

**Bugs open: QA-S15-2.**

## Round 4 (2026-11-21, re-check of QA-S15-2 fix; product code a32f502, branch head 548b107 adds only DECISIONS/STATE)

QA did not write the fix. Checked: ui-dev's fix in `apps/client/src/board.ts` (bb81b7e..a32f502: a late hold timer waits for two on-time frames in a row, max 6, before lifting; a timer-made lift is undone by a sideways move or release stamped before 0.25 s), the test changes, and the architect's notes (DECISIONS 2026-11-21).

**Result: QA-S15-2 is fixed. S-15-6 AC1 now PASSES; no regression in AC2–AC12. S-15-6 passes QA (AC9 on intent; its wording stays a PM/owner question).**

### Test changes reviewed (developers' edits to tests)
- QA's repro (`qa-sprint15.spec.ts` "QA-S15-2 repro…"): the diff only removes the `QA_REPRO` skip line and rewrites the comment ("(open)" → "(fixed)"). Gesture, timings and all 3 checks unchanged. OK.
- `s15-hand.spec.ts` "a press that moves on without a hold (a swipe)…" and "swiping in the hand view slides the cards…": `holdAt` → new `flickAt`, which sends the **same moves** but stamps each touch with when it was made (down now, each move 20 ms later, capped at "now"). On desktop it is still the plain `holdAt` mouse. All checks are the same as before. OK. This is a fair fix, not a looser test: a real touch screen stamps events, and the game judges by those stamps.
- New dev test `s15-hold` "QA-S15-2: a quick flick handed over only after the hold timer lifted the card…" tests the undo path on its own (it waits for the lift, then sends early-stamped moves).

### QA's new round-4 tests (`qa-sprint15.spec.ts`, describe "QA S-15-6 round 4: QA-S15-2 fix on busy pages", 11 tests)
| Test | What it checks |
|---|---|
| a quick flick on a busy page … (5 cases, touch) | Different busy patterns than the repro: Ice Wall flat right with 4 stalls of 350 ms; Hedge Fund rising 30° left with 2×600 ms; falling 30° left with 8×200 ms; Ice Wall flat left with one 900 ms stall; and a steadily slow page (20 frames of 150 ms). Each: nothing played or paid (whole game view equal), **no drawn frame** with a held card, lit place or dropped hand, and it browsed the way of the flick |
| a quick flick while the page is already busy … (2 cases, all 4 sizes incl. mouse) | Down, flick and release are all sent at their real times while the page is stalled (none waits for the page). Same checks |
| a quick tap on a busy page (touch) / a quick tap while the page is already busy (4 sizes) | The round-3 "tap flash" case: "Hold to play" shows, the card stays big, nothing played, no held or lit frame |
| a still hold on a busy page still lifts (4×350 ms; 30×150 ms) | A still finger still lifts (≥ 245 ms after the down), and letting go away from every place sends it home with nothing played |
| architect note: a move stamped before the finger went down … | See "Bad stamps" below |

Desktop skips (6): the "busy after the down" flick and tap tests are touch only. On this runner a CDP mouse press reaches the page about 0.2 s late, so those tests would send the mouse flick only after the hold timer had already run. A real mouse cannot do that, and in early runs those desktop cases showed a held card for 1 frame for this reason only. The "already busy" tests cover the mouse fairly (moves sent when made): they pass on desktop.

### Runs (local, `--retries=0`)
- **QA-S15-2 repro, now un-gated:** 891x296 / 844x390 / 640x360 **3/3 passed** (desktop skipped: touch). **10× repeat at the 3 touch sizes: 30/30 passed**. Records each time: `hand_press, carousel_slide, zoom_swap`, credits 5 → 5, hand 6 → 6 (round 3: `card_lift … play_flight`, credits 5 → 9).
- **Round-4 tests, final file:** 4 sizes **42 passed, 6 skipped, 0 failed**. Earlier runs of the same tests (repeated 2–3 times, while QA fixed its own test mistakes listed below): every busy-page touch flick (45 runs at the 3 touch sizes) **never played, never drew a held or lit frame**, and always browsed. In 3 of those 45 runs the game logged a `card_lift` that the flick undid **before any frame was drawn**, so a player can't see it. After QA's test fixes, every run of every round-4 test passed (the "already busy" flick 48 runs, the "already busy" tap 16 runs, the still hold 28 runs, bad stamp 26 runs, over 4 sizes).
- QA's own test mistakes, found and fixed during the round (not product bugs): (a) a 125 px flick is less than one browse step on the 1280×800 big card, so the flick is now scaled to 1.3 steps; (b) a fast flick at 891×296 can move 2 cards (round-3 observation 2), so the check is now "browsed in the flick's direction"; (c) the still-hold release was at the screen centre, where a lit place can be, so it now lets go away from every place; (d) the desktop timing artefact explained above.
- **6× CPU throttle, hold/flick specs only** (TESTING §3): QA's AC1 flicks, QA-S15-2 repro, AC2 still hold, AC12; dev `s15-hold` still-hold and QA-S15-2; dev `s15-hand` 2 swipe tests; `s15-snappy` S-15-6 test, at 4 sizes: **32 passed, 4 skipped (touch-only on desktop), 0 failed**. **Still-hold lift at 6×: QA AC2 543–733 ms, QA AC12 589–780 ms, dev s15-hold 348–770 ms**, against **560–900 ms in round 3**, so no slower. Long tasks max 516 ms (< 600).
- **Unthrottled lift (normal page):** AC2 345–459 ms, AC12 398–470 ms (round 3: 364–543). Press reaction 0.4–0.8 ms after the page handled it. **Timer check with fast frames** (scratch, 844x390 at 1x pixels, 6 holds): **357, 298, 250, 250, 250, 250 ms**, so the lift still comes at 0.25 s on a page drawing on time.
- `qa-sprint07` "drag latency" and `actions` "with 0 clicks…" were flaky in CI (below). Locally at 640x360 ×5 each: 10/10 passed. Both were flaky before this sprint (sprint-08 QA, sprint-15 round 2), so not caused by the fix.
- `npm run lint`, `npm run typecheck` pass (with QA's new tests).

### Bad stamps (architect's non-blocking note)
`onViewMove` uses a move's stamp as is. QA tested the case the architect called unsafe: a real still hold (the card lifted, about 0.45 s), then a sideways move whose stamp is **before** the finger went down. Result at 4 sizes: the lift is **undone and the view browses** (1 card). Nothing is played or paid. So a broken stamp can only turn a real hold into a browse (the player holds again). It can never play a card. Real browsers stamp moves after the down, so QA does not count this as a bug. The architect's note stands as a code-hygiene item.

### Observation (not a bug, for the PM): a still hold on a very slow page lifts later than before
The catch-up wait (up to 6 frames) delays a still hold only when the page is already late. On a normal page the lift is at 0.25 s (above). QA measured a busy page with the fix and with the code before the fix (691534a, swapped in locally then restored), 844x390:
- 4 stalls of 350 ms: 1.75–1.99 s after the down with the fix (before: 1.51–1.61 s).
- A steadily slow page (every frame blocked 150 ms, about 4 frames a second on this runner): 1.52–1.83 s with the fix (before: 0.90–1.09 s).

This is the bound the architect accepted: input is never blocked meanwhile, and drag-up still lifts at once. It matters only on a page far below 10 frames a second. Owner feel check on the phone.

### S-15-6 per-criterion results (round 4)
| AC | Result | Evidence |
|---|---|---|
| 1 Flick left/right browses, nothing picked up | **PASS** (was FAIL) | QA-S15-2 repro 3 sizes + 30/30 repeats + 6× throttle; round-4 busy-page flicks (5 patterns, 3 directions, 2 cards) and "already busy" flicks at 4 sizes incl. mouse; AC1 flicks and AC1/2 slide in CI; dev s15-hold QA-S15-2 + s15-hand swipe tests (also at 6×); `docs/sprints/sprint-15-qa/r3-{891x296,844x390,640x360}-s15-6-r4-busy-flick-browsed.png` (Ice Wall flicked on a stalled page: browsed, credits and clicks unchanged) |
| 2 Still hold 0.25 s / drag up lifts … | PASS | AC2 tests in CI (4 sizes); lift 345–459 ms here (frame time), 250 ms with fast frames; at 6× 543–733 ms; still hold on busy pages still lifts (round-4) |
| 3, 4, 5, 6, 7 | PASS | QA's round-3 tests, all green in CI on 548b107 (4 sizes) |
| 8 Quick tap: "Hold to play", nothing lit | PASS; **round-3 tap-flash note resolved** | AC8 in CI; round-4 busy-page taps: no held or lit frame in any run since the test fixes (touch and mouse) |
| 9 Unplayable card lifts dimmed with a reason | PASS on intent; **wording still flagged for PM/owner** ("Not enough credits" vs the AC's "Needs 5 credits") | AC9 tests in CI |
| 10 Mouse | PASS | AC10 in CI; "already busy" flick/tap tests on desktop |
| 11 Both sides, pass-the-phone, online, app | PASS (app: CI + owner) | AC11 tests and `[android]` in CI |
| 12 Timing | PASS | AC12 in CI and locally (lift 398–470 ms, press 0.4–0.8 ms after handled); 6× throttle 32/32; long tasks < 600 ms |

### CI result (round 4)
- **548b107 (`548b107b390752bcf7f074c4d67999703316eed9`, product code = a32f502): PR #34 run 44885399527 — success.** `checks` success, `guard-mutation` success, **`e2e shard 1/4`, `2/4`, `3/4`, `4/4` all success** (573 + 566 + 562 + 560 passed; 2 + 7 + 13 + 14 skipped), `e2e` success. The un-gated QA-S15-2 repro and the dev QA-S15-2 test ran and passed. 2 flaky (passed on retry), both 640x360 and both older specs flaky before this sprint: `actions.spec` "with 0 clicks, the runner's credits and deck do nothing…" and `qa-sprint07` "drag latency (QA measure)…". s15-hand's two swipe tests were **not** flaky this time (they were the 2 flaky in round 3).
- Earlier runs on 879382d / 20c944b / a32f502 were cancelled by newer pushes. That is why the record here is 548b107's.
- QA's push of this report + the 11 round-4 tests changes test code, so the PR's next run will run them in CI too.

### Final per-story result (Sprint 15, round 4)
| Story | Result |
|---|---|
| S-15-1 Cards lift and lean in your hand | **PASSED QA** (unchanged; s15-hand swipe tests green in CI and at 6×) |
| S-15-2 Played cards fly to the board and land | **PASSED QA** |
| S-15-3 Cards fly to and from the piles | **PASSED QA** |
| S-15-4 Never slower than today | **PASSED QA** for AC1, AC2, AC4, AC5; AC3 phone smoothness = owner check |
| S-15-5 Play link and app download with a private repo | unchanged from round 2 (owner checks listed there) |
| S-15-6 Hold a card to play it | **PASSED QA: 12/12** (AC9 on intent; wording question for the PM/owner) |

**Bugs open: none.** QA-S15-2: **fixed, verified.** Owner checks: as in round 3, plus quick flicks on the owner's phone, and how fast a still hold feels while the game is busy (observation above).

## Round 5 (2026-11-21, product code 02aad8c: AC12 texture cap + strip follow-up of QA-S15-2)

QA did not write either change. Checked: ui-dev's texture cap (`apps/client/src/gpuLimits.ts`, `main.ts`; d18222f's CI failed QA's AC12 test on desktop with long tasks of 602 / 633 ms), the strip follow-up (`input.ts`, merged in 5873ed1) and the comment clean-ups (`hand.ts`, `layout.ts`), and ui-dev's report that QA's AC2 test failed once on [phone].

**Result: the AC12 fix works and the strip fix works, but the texture cap makes dragging a card jerky on the 640×360 and 844×390 screens (new bug QA-S15-3). CI on 02aad8c is red for this reason only. S-15-6 stays PASSED QA (its 12 criteria all pass). S-15-4 ("never slower than today") is FAILED until QA-S15-3 is fixed.**

### Bug QA-S15-3 (ui-dev; blocks a green CI and S-15-4): with the texture cap, dragging a card stutters on phone sizes
- **What the player would see:** while a card is dragged across the board, every few moves it lags behind the finger by 0.1–0.17 s instead of under 0.035 s.
- **Failing test:** `apps/client/e2e/qa-sprint07.spec.ts:471` "drag latency (QA measure): a fast continuous drag, each move drawn under the finger in < 100 ms" (rule: every finger move is drawn under the finger within 0.1 s).
- **CI, 02aad8c, PR #34 run 44898452920:** failed on **both tries** in shard 1/4 [phone] (118 ms) and shard 2/4 [phone-small] (105 ms). In earlier rounds this test sometimes failed once and passed on its retry; now it fails both times.
- **Repro (local, `apps/client`):** `npx playwright test e2e/qa-sprint07.spec.ts -g "drag latency" --project=phone-small --repeat-each=5 --retries=0`
  - 02aad8c as is (cap 4): **4 of 5 failed**, slowest move drawn after 124 / 149 / 156 / 170 ms (one pass at 86). The slow moves keep coming back through the drag (many 65–170 ms gaps), so it is not a one-time start-up cost.
  - Same code, only the `capBatchTextures()` call in `main.ts` commented out: **5/5 passed**, slowest 33–36 ms. [phone] passes 5/5 either way here (max 32–35 ms); on CI it failed.
  - Hint for ui-dev (not a fix decision): with `MAX_BATCH_TEXTURES = 8` the same drag test passed 5/5 (slowest 33–35 ms) and QA's AC12 test passed 3/3 on desktop (longest task 195–220 ms). Measured once each, on this runner only.
- Product code was not changed by QA. Both trial edits were put back (`git status` clean for `src/`).

### (a) AC12 with the texture cap (QA's test `qa-sprint15.spec.ts` "AC12: the card reacts…", `--retries=0`)
| Run | Result | Longest task (limit 600 ms) | Lift after the finger went down |
|---|---|---|---|
| 4 sizes × 3, 2 workers | **12/12 passed** | 891x296 115 ms · 844x390 135 ms · 640x360 112 ms · 1280x800 **168 ms** | 253–263 ms |
| 6× CPU throttle, 1 worker, 4 sizes × 2 (with AC2 still hold, 16 tests) | **16/16 passed** | 891x296 172 ms · 844x390 247 ms · 640x360 194 ms · 1280x800 **283 ms** | AC12 279–470 ms, AC2 275–495 ms |
| Full `qa-sprint15.spec.ts`, 4 sizes (below) | passed | 1280x800 140 ms, phones 101–124 ms | — |

Compared with round 4: the longest task at 6× was up to 516 ms; now 283 ms. CI on 02aad8c: AC12 passed at all 4 sizes (shards 1–4).

### (b) Strip follow-up of QA-S15-2 (QA's new tests, describe "QA S-15-6 round 5: strip follow-up (QA-S15-2 on the small hand)", 5 tests × 4 sizes)
Setup for each test: the finger goes down on Ice Wall in the small hand (stamped with the time). The page then stalls for 0.7 s, so the hold-to-read (0.35 s) opens late, about 1 s after the down. Only then do the finger's moves reach the game, each stamped with the time it was really made (70–110 ms after the down), as when a busy phone runs its late timer before the queued moves.
| Test | Checks |
|---|---|
| quick flick rising 30° left / rising 30° right / rising 45° left (just outside the 40° pick-up cone), ending well above the strip's "pulled out while reading" line | the hold really opened late (> 0.4 s); **no `card_lift` at all; no drawn frame with a held card, a lit place or the hand dropped; whole game view unchanged (nothing played or paid)**; nothing held at the end; hand size unchanged |
| late-opened hold whose first move out is straight up | **still picks up** the pressed card (index and id), its places light; let go away from every place: nothing played |
| on-time hold-to-read, then pulled up out of the strip | picks up the card being read (unchanged behaviour); let go away from every place: nothing played |

- **Current code (02aad8c): 4 sizes × 3 = 60/60 passed. At 6× throttle (1 worker): 20/20 passed.**
- **The tests catch the bug:** with the old `input.ts` (d99eb5d) swapped in locally: **all 12 flick runs failed** (each picked up the card; **3 of them installed Ice Wall**: `install_flight`, `server_open`). The 8 pull-up runs passed there too, as expected. `input.ts` was put back afterwards.
- Screenshots: `docs/sprints/sprint-15-qa/r3-{891x296,844x390,640x360,1280x800}-s15-6-r5-strip-flick-no-pickup.png` (after the flick: nothing held, hand view open on the browsed card) and `…-r5-strip-late-pull-up.png` (Ice Wall picked up, HQ / R&D / Archives / New server lit).
- QA's own test mistake (fixed): the first version expected the reading view to close at the release. A hold on the small hand opens the hand view, and the hand view stays open after the release by design (board.ts `onLongPressEnd`), so that check was removed.
- Unit tests `test/input.test.ts` + `test/gpuLimits.test.ts`: 18/18 pass.

### (c) AC2 "nothing held before 0.25 s": a race in QA's own test, not an early lift
- **Cause:** QA's frame recorder stamped each frame with the frame's `requestAnimationFrame` time. That is when the frame *began*. The hold timer can lift the card a few ms later, before that same frame's callbacks run. The frame then shows the card held but carries a time from before the lift. Measured (4 sizes × 10, new annotation `first-held-frame`): the first held frame's stamp was **up to 6 ms before the lift** in 7 of 10 runs on [phone] (e.g. stamped 248.9 ms, lift 254.9 ms, read 263.1 ms after the down). If a frame begins before 245 ms and the timer lifts at about 250 ms, the old check fails, though nothing was early.
- **The product never lifted early:** the lift came 253.0–278.7 ms after the down in all 40 AC2 runs and 12 AC12 runs here, and on CI (the test also checks the lift time itself, ≥ 245 ms). **No QA-S15-3 for this; the QA-S15-3 number above is the drag bug.**
- **Fix (test only, rule unchanged):** the recorder now also notes when it read each frame's state (`now`). The test checks (1) the lift ≥ 245 ms after the down (unchanged), (2) every frame showing a held card was read after the lift, and (3) no frame read before 245 ms shows a held card. **After the fix: 40/40 passed (4 sizes × 10) and 8/8 at 6× throttle.** No frame was read before 245 ms with a held card (`stampedBefore245` = 0 in every run).

### (d) S-15-6 regression and visual check
- **Full `qa-sprint15.spec.ts` (all of S-15-1…S-15-6, incl. AC1–AC12 and the round-4/5 tests), 4 sizes, `--retries=0`: 219 passed, 13 skipped (touch-only on desktop), 0 failed.**
- **Visual (the texture cap must not change appearance):** new 891×296 screenshots compared pixel by pixel with the round-1/3/4 ones. Unchanged: `r3-…-r4-busy-flick-browsed`, `r1-…-cover-up`, `abt-ripple`, `access-steal-mid`, `access-trash-mid`, `bank-job-to-heap`, `upright-mid-movement`, `play-branch-served-locally` (0 pixels differ), `lit-event`, `lit-program`, `pass-cover` (0.00 %). Other differences, all explained: the rail help text changed in round 3 (S-15-6 wording), cards caught at a different moment of a movement (discard ripple, a reason line fading in), and the round-3 shots were saved at a lower pixel ratio. Side-by-side checks of `lit-asset` and `dimmed-c12` (`/tmp` comparisons, not kept): same colours, glows, card faces and text. **No wrong or missing textures anywhere.** Only the new round-5 screenshots were added to the repo.
- `npm run typecheck` passes; eslint on QA's spec passes.

### Observations (not caused by these changes)
- `s02-corp.spec.ts:62` "one agenda or asset per server; upgrades …" at 640x360 (flaky on CI shard 2, passed on retry) also fails locally 1–5 times in 10 **on every build tried**: round-4 product code (d99eb5d) 3/10, 02aad8c 5/10 then 2/5, 02aad8c without the cap 3/10, with the old `input.ts` 1/10. An extra server (`remote2`) shows up, so a tap probably installed a card twice or a cancel tap was taken as an install. It is an older flaky test, not from this round. Worth a look by ui-dev.
- `s07-hand.spec.ts:130` (flaky on CI desktop, shard 4): 5/5 passed locally.

### CI result (round 5)
- **02aad8c (`02aad8c969de70625a867d1f2d7b391b89f3f078`): PR #34 run 44898452920 — failure.** `checks` success, `guard-mutation` success, `e2e shard 3/4` success (568 passed, 19 skipped), `e2e shard 4/4` success (571 passed, 14 skipped, 1 flaky: `s07-hand:130` desktop), **`e2e shard 1/4` failure** (584 passed, 2 skipped, 1 failed: `qa-sprint07:471` drag latency [phone], both tries), **`e2e shard 2/4` failure** (578 passed, 7 skipped, 1 failed: the same test [phone-small], both tries; 1 flaky: `s02-corp:62`). All of QA's S-15-6 tests passed, including AC2 (`:1277`) and AC12 (`:1759`) at all 4 sizes. The failure is QA-S15-3.
- **987c403 (`987c4035b2f7eb664e5565e97f2ffcf48bfc72db`, QA's commit: round-5 tests + AC2 measurement fix; product code = 02aad8c): PR #34 run 44904390212 — failure, for the same reason.** `checks` success, `guard-mutation` success, `e2e shard 3/4` success (573 passed, 19 skipped), `e2e shard 4/4` success (576 passed, 14 skipped, 1 flaky: `s15-hand:187` "swiping in the hand view slides the cards…" [phone-short], one of the two swipe tests that were flaky in round 3), **`e2e shard 1/4` failure** (589 passed, 1 failed: `qa-sprint07:471` drag latency [phone], 128 / 123 ms on its two tries), **`e2e shard 2/4` failure** (583 passed, 1 failed: the same test [phone-small], 168 / 134 ms; 1 flaky: `s02-corp:62`). Every `qa-sprint15` test passed on CI, including the 20 new round-5 strip tests and the AC2 test with the new measurement. **The only failure is QA-S15-3.**
- This report update is docs-only. CI will run the full suite again on it, because the commit before did not pass. That run should fail the same way.

### Final per-story result (Sprint 15, round 5)
| Story | Result |
|---|---|
| S-15-1 Cards lift and lean in your hand | **PASSED QA** (unchanged) |
| S-15-2 Played cards fly to the board and land | **PASSED QA** (unchanged) |
| S-15-3 Cards fly to and from the piles | **PASSED QA** (unchanged) |
| S-15-4 Never slower than today | **FAILED (QA-S15-3)**: the texture cap makes a dragged card lag 0.1–0.17 s behind the finger at 640x360 (and on CI at 844x390). Was PASSED in round 4. AC3 phone smoothness is still an owner check. |
| S-15-5 Play link and app download with a private repo | unchanged from round 2 (owner checks listed there) |
| S-15-6 Hold a card to play it | **PASSED QA: 12/12** (AC12 now passes on CI at all sizes; strip follow-up verified; AC9 on intent, wording question for the PM/owner) |

**Bugs open: QA-S15-3** (ui-dev). QA-S15-2: fixed and its strip follow-up verified. AC2 one-off failure: a race in QA's own test, fixed in the test (rule unchanged).

## Round 6 (2026-11-21, product code 3c59df0: QA-S15-3 fix in the slow-frame gate)

QA did not write this change. ui-dev kept the texture cap at 4 and fixed the slow-frame gate in `apps/client/src/frameClock.ts`. The gate decides when to skip decorative movement on slow devices. The old rule ("slower than 50 ms") counted a frame of exactly 50.0 ms as quick, so the held card's lean stayed on and the dragged card fell behind the finger. Changes: `SLOW_FRAME_MS` 50 → 40, and decorative movement only comes back after `FAST_FRAMES_TO_RESUME` = 3 quick frames in a row. Also in this commit: a Pixi version tripwire (`VERIFIED_PIXI`), argument forwarding and test clean-up in `gpuLimits`, and a new real-browser check in `s15-snappy` that the batch shader uses 4 texture slots.

**Result: QA-S15-3 is fixed and verified. CI on 3c59df0 is fully green (all 4 e2e shards). S-15-4 goes back to PASSED QA.**

### Review of the diff (`git diff 0bcedb7..3c59df0`)
- No test check was loosened. The e2e change only adds a test (the `s15-snappy` shader check). The unit-test changes add checks:
  - 50 ms counts as slow, 33 ms does not;
  - one quick frame among slow ones does not switch movement back on;
  - arguments are forwarded;
  - the Pixi version tripwire.
- One existing unit expectation changed with the new rule: after `forceFrameSpeed('measured')` the measured answer stays "slow" until it is reset. This follows from the 3-quick-frames rule and is not a weaker check.
- lint, typecheck and unit tests all pass (engine 844, cards 816, client 95, ai 75, server 31).

### QA-S15-3 drag latency (QA's `qa-sprint07.spec.ts:471` "drag latency (QA measure)…"; every finger move must be drawn under the finger in < 100 ms)
| Run (`--retries=0`) | Result | Slowest move drawn |
|---|---|---|
| 844x390, 640x360, 1280x800 × 5, 2 workers | **15/15 passed** | all < 100 ms (line reporter, no per-run values) |
| 891x296 × 5 (scratch config: the `phone-short` device running this spec, which is not in `SHORT_SPECS`) | **5/5 passed** | 34.2–35.2 ms (median 23–28) |
| 6× CPU throttle, 1 worker: 844x390 / 640x360 / 1280x800 × 3 | **9/9 passed** | phone 49.4–50.9 · phone-small 47.8–53.3 · desktop 28.1–32.8 ms |
| 6× CPU throttle, 1 worker: 891x296 × 3 | **3/3 passed** | 47.3–51.2 ms |
| **Control: the old `frameClock.ts` (0bcedb7) swapped in, the rest = 3c59df0**, 640x360 × 5 | **5/5 failed** | 144–182 ms (median 27–30) |

The control run confirms ui-dev's root cause: on this build, the gate alone decides whether the test fails or passes. `frameClock.ts` was put back afterwards (`git status` clean for `src/`).

### The things the gate also controls still work (`--retries=0`, 2 workers unless noted)
- **S-05-3 carousel slide and S-15-1 lean/settle:** `s05-carousel`, `s05-carousel-timing` and `s15-hand` at 844x390, 640x360 and 1280x800, plus `s15-hand` at 891x296: **31 passed, 7 skipped** (desktop skips its touch-only tests; the "pointing at a hand card" test is skipped on phones by design), 0 failed.
- **QA's own S-15-1 tests, AC2, AC12, `s15-snappy` "S-15-4 never slower than today" and the new shader check**, 4 sizes: **41 passed, 3 skipped** (desktop touch-only), 0 failed.
  - AC12 longest task (limit 600 ms): 891x296 89 · 844x390 112 · 640x360 97 · 1280x800 191 ms. Lift 253–255 ms after the finger went down on phones, 352 ms on desktop.
  - Shader check: every batch shader built with 4 texture slots (`[4,4]`) at all 4 sizes.
- **6× CPU throttle, 1 worker, 4 sizes:** AC2 still-hold, AC1/2 sideways slide, AC12, and `s05-carousel-timing` (draw slide + carousel slide): **19/19 passed**.
  - AC12 longest task: 891x296 166 · 844x390 257 · 640x360 225 · 1280x800 306 ms.
  - Carousel: the new face is on screen 16–71 ms after the swipe.
  - AC2: no frame read before 245 ms showed a held card (`stampedBefore245` = 0).
- **Note:** the lean and carousel e2e tests pin frames to "fast" (`frameSpeed('fast')`), so they show that the movement still works. The new 40 ms / 3-frame rule itself is checked by the unit tests in `test/frameClock.test.ts`.

### Main flow screenshots (round 6)
- Board and a held card over its lit place, at 891x296: `docs/sprints/sprint-15-qa/r6-891x296-s15-board.png` and `r6-891x296-s15-6-held-card-lit.png`.
- 844x390, 640x360 and 1280x800 were also captured and look the same. They are not kept in the repo (QA-S15-1 repo-size rule).
- Nothing changes visually in this round, because only the movement timing changed.

### CI result (round 6)
- **3c59df0 (`3c59df01903f56d05fed8b8a7c38f456b53b7675`): PR #34 run 44909272693 — success.** `checks` success, `guard-mutation` success, `e2e` success.
- **All 4 e2e shards success:**
  - shard 1/4: 591 passed, 2 skipped, including drag latency [phone];
  - shard 2/4: 585 passed, 7 skipped, 1 flaky, including drag latency [phone-small];
  - shard 3/4: 574 passed, 19 skipped;
  - shard 4/4: 577 passed, 14 skipped, 1 flaky.
- The 2 flaky tests (passed on retry):
  - `s02-corp:82` [phone-small], "tapping the card again … cancels": the same older `s02-corp` flakiness noted in round 5;
  - `android.spec:73` [android], "S-07-6 in the app bundle … let go away and the hand view is back". The rail was not shaded again 0.5 s after letting go.
- **The `android.spec:73` flake is not caused by this change.** Locally, 10 repeats each: 3c59df0 **3/10 failed**, and the same with the old `frameClock.ts` **3/10 failed**, with the same error. Older flaky test, for ui-dev to look at (either the hand view comes back late in the app bundle, or 0.5 s is too short a wait on a busy machine). It does not block this sprint.
- The push run on the same commit: `checks` success; e2e not run, as expected on a push.

### Final per-story result (Sprint 15, round 6)
| Story | Result |
|---|---|
| S-15-1 Cards lift and lean in your hand | **PASSED QA** (lean/settle tests and QA's S-15-1 tests pass with the new gate) |
| S-15-2 Played cards fly to the board and land | **PASSED QA** (unchanged; green in CI on 3c59df0) |
| S-15-3 Cards fly to and from the piles | **PASSED QA** (unchanged; green in CI on 3c59df0) |
| S-15-4 Never slower than today | **PASSED QA** for AC1, AC2, AC4, AC5. QA-S15-3 is fixed: drag ≤ 35 ms at 891x296, all sizes pass ×5, ×3 at 6× throttle, and in CI. AC3 phone smoothness is still an owner check. |
| S-15-5 Play link and app download with a private repo | unchanged from round 2 (owner checks listed there) |
| S-15-6 Hold a card to play it | **PASSED QA: 12/12** (AC12 longest task ≤ 306 ms even at 6×; AC9 is checked on intent: the wording question for the PM/owner is still open) |

**Bugs open: none blocking.** QA-S15-3: **fixed and verified.** Flaky tests, not caused by this sprint's code: `android.spec:73` (3/10 locally on both gate versions) and `s02-corp` at 640x360. Both are for ui-dev to look at later.
