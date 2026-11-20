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
