# Sprint 2 — QA report

QA date: 2026-11-12 · Branch `sprint-02` · Round 1 verified at f192f53; **Round 2 verified at 6113829** (fixes 8108050..d51f7d0, architect rulings 6113829) · QA did not write the code under test.

**Round 2 summary (current): 31 of 32 acceptance criteria PASS, 0 FAIL, 1 OWNER CHECK AT DEMO** (home screen opens sideways). **All 4 Round 1 bugs are fixed and re-verified**, and so is the new End turn double-tap bug from the overlapping run. No new bugs, no regressions. See "Round 2" at the end.

Round 1 summary (kept for history):

**Summary: 31 of 32 acceptance criteria PASS, 0 FAIL, 1 OWNER CHECK AT DEMO** (S-02-6 "home screen opens sideways" needs a real phone; its automated part passes). **4 bugs found, none blocks a criterion as written:** QA-S2-1 (minor: long hints like "Needs runs (coming soon)" are drawn at about 5-pixel text on the small 640×360 phone, too small to read), QA-S2-2 (minor: an upgrade installed in HQ covers the HQ pile and its card count on the small phone and on a computer), QA-S2-3 (cosmetic: "Private Security Force" runs into its card type on phone hand cards), QA-S2-4 (test-only: one rotate e2e test is flaky, 3 of 30 runs fail; the game itself is fine). All required checks pass: lint, typecheck, 476 unit tests, build, full e2e 281/281 (team), plus 21 QA runs. Snappiness budget met. Card art is our own runtime drawing; real names/text match the 2012 Core Set as far as QA can tell.

"P" = Playwright test (projects: `phone` 844×390 touch, `phone-small` 640×360 touch, `desktop` 1280×800 mouse, `portrait` 390×844 touch for the rotate prompt). "E" = engine / match / client Vitest test. "QA" = test added by QA in `apps/client/e2e/qa-sprint02.spec.ts`. Every test named passed in the runs at the end (QA's two bug tests are marked as known failures on the sizes where the bug shows).

## Acceptance criteria

### S-02-1 Corp: hide a card in a new server

| Criterion (short) | Result | Evidence |
|---|---|---|
| Tap agenda/asset/upgrade: places light up, including New server | **PASS** | P `s02-corp.spec.ts` › "tapping an agenda lights only New server…, with its price" (target ≥ 44 px, label "Install · free"); upgrade lights all 5 places in "one agenda or asset per server…". **QA:** "an asset can go into a remote that holds only an upgrade…" (PAD Campaign lights Server 1 + New server). Screenshots `*-02-agenda-picked-new-server-lit.png`, `*-05-upgrade-picked-every-server-lit.png`. |
| Tap New server: face down into "Server 1" (next "Server 2"), 1 click, 0 credits | **PASS** | P `s02-corp.spec.ts` › "tapping New server slides the card face down into "Server 1"…" (events `server_created`, `card_installed`; clicks −1; credits same; `install_flight` + `server_open` started < 100 ms; labels HQ, R&D, Archives, Server 1, Server 2). E `install-play.test.ts` › S-02-1 group. Screenshot `*-03-agenda-in-server-1-face-down.png`. |
| One agenda/asset per server; upgrades go anywhere incl. HQ/R&D/Archives | **PASS** | P `s02-corp.spec.ts` › "one agenda or asset per server; upgrades go in any server…" (installs into HQ). **QA:** after an asset joins an upgrade in Server 1, an agenda is offered only New server. E `install-play.test.ts` › "one agenda or asset per remote; never in a central server", "an upgrade can go into HQ, R&D or Archives". |
| Tap the card again / empty board: nothing installed, no click | **PASS** | P `s02-corp.spec.ts` › "tapping the card again, or an empty part of the board, cancels…" (whole view unchanged). QA's pick-speed test also cancels every card by tapping it again. |
| Hold a card in a server: zooms face up for the Corp | **PASS** | P `s02-corp.spec.ts` › "holding a card in a server zooms it face up for the Corp" (name and text). P `s02-board.spec.ts` busy-board test holds every installed card. Screenshot `*-04-corp-holds-own-installed-card-zoom.png`. |
| Runner's turn: installed Corp cards are backs; Runner's side never gets names | **PASS** | P `s02-corp.spec.ts` › "on the Runner's turn the Corp's installed cards are card backs…" (view JSON has no ids, holding shows a back). E `install-play.test.ts` › property test "random legal sequences: the Runner's view and events never contain a face-down Corp cardId" (40 games, > 100 Corp installs), "viewEvents: … Corp installs lose cardId". E `packages/match/test` projection test. Screenshots `*-09-runner-turn-corp-cards-are-backs.png`, `*-10-runner-holds-corp-card-sees-back.png`. |

### S-02-2 Corp: ICE in front of a server

| Criterion (short) | Result | Evidence |
|---|---|---|
| Tap ICE: every server lights up (built-in, opened, New server) with its price | **PASS** | P `s02-corp.spec.ts` › "tapping ICE lights every server and New server, each with its price" (no remotes yet). **QA:** "with remotes opened, ICE lights HQ, R&D, Archives, every remote and New server, each with its price" (Server 1 shows "Install · 1 credit"). Screenshot `*-qa-ice-priced-targets.png`. |
| No ICE yet: goes face down in front, 1 click, free | **PASS** | P `s02-corp.spec.ts` › "first ICE on a server is free…" (credits same, click −1, drawn sideways). E `install-play.test.ts` › "ICE on a new server is free and creates the server". |
| Already ICE: 1 credit per ICE there; new one outermost | **PASS** | P `s02-corp.spec.ts` (1 credit charged, label "2 credits" for the third). **QA:** third ICE really charged 2 credits and drawn outermost (`['c06','c04','c05']`). E `install-play.test.ts` › "costs 1 credit per ICE already on the server (0, 1, 2); the new one is outermost". Screenshot `*-qa-ice-two-on-server-1.png`. |
| Can't afford: only "Not enough credits", nothing changes | **PASS** | P `s02-corp.spec.ts` › "when you can't afford a server's price, only a small "Not enough credits" hint appears" (view equal before/after, only a hint animation). See QA-S2-1 for how small the hint gets on 640×360. |
| Runner's turn: how many ICE per server, only backs | **PASS** | P `s02-corp.spec.ts` › "on the Runner's turn you see how many ICE guard each server, only as backs". Screenshot `*-22-busy-board-runner-view.png`. |

### S-02-3 Runner: install programs, hardware and resources

| Criterion (short) | Result | Evidence |
|---|---|---|
| Tap program/hardware/resource: Install spot lights with price | **PASS** | P `s02-runner-play.spec.ts` › "tapping a program lights an Install spot…" ("Install · 2 credits", ≥ 44 px); "hardware and resources install too" ("Install · 1 credit"). Screenshot `*-11-runner-program-picked-install-4-credits.png`. |
| Enough credits: face up in your area, credits paid, 1 click | **PASS** | Same P test (events `credits_spent`, `card_installed`, −2 credits, −1 click, snappy). E `install-play.test.ts` › "pays the card cost, one click, face up in the rig". Screenshot `*-12-ninja-installed-memory-1-of-4.png`. |
| Not enough credits: only "Not enough credits", nothing changes | **PASS** | P `s02-runner-play.spec.ts` › "without enough credits, Install only shows "Not enough credits"…". Screenshot `*-15-runner-not-enough-credits.png`. |
| Memory counter ("Memory 2/4"), start with 4 | **PASS** | P same tests: "Memory 1/4", MEMORY label; programs only. E `install-play.test.ts` memory test (4/4). On screen the counter reads "MEMORY 1/4" with 4 pips. |
| Memory full: only "Not enough memory" | **PASS (unit tests only, as ruled by the architect)** | Cannot happen with the current Runner deck: it holds only 3 programs of 1 memory each (Corroder, Gordian Blade, Ninja), so at most 3/4. QA confirmed from `packages/cards/src/runner.ts`. E `install-play.test.ts` › "memory: 4 one-memory programs fit, the 5th is no_memory…" and "precedence: no_credits beats no_memory"; client `apps/client/test/hints.test.ts` › "the Sprint 2 hints read as the proposal says" (`no_memory` → "Not enough memory"). The client shows any refusal through the same path P-tested for `no_credits`. Demo notes should say the owner cannot trigger this yet. |
| Corp's turn: Runner's installed cards face up | **PASS** | P `s02-runner-play.spec.ts` › "on the Corp's turn the Runner's installed cards are face up". Screenshot `*-16-corp-turn-3-runner-rig-face-up.png`. |

### S-02-4 Play money and draw cards

| Criterion (short) | Result | Evidence |
|---|---|---|
| Play button with price: Hedge Fund 5, Anonymous Tip free, Easy Mark free, Diesel free | **PASS** | P `s02-runner-play.spec.ts` › "Play shows each card's price…" and the Runner test ("Play · free"). Card data checked by QA: costs 5/0/0/0, texts "Gain 9 credits." / "Draw 3 cards." / "Gain 3 credits." / "Draw 3 cards.". Screenshot `*-06-hedge-fund-play-5-credits.png`. |
| Play: credits/cards arrive with quick animations, 1 click, card face up on your discard pile for both | **PASS** | P "Hedge Fund: pay 5, gain 9, one click, and it lands face up on Archives for both players", "Anonymous Tip draws 3…", "Runner: Easy Mark gains 3; Diesel draws 3…". E S-02-4 group (Archives face up for the Runner too). Screenshots `*-07-hedge-fund-played-archives-face-up.png`, `*-09-…` (Runner sees Hedge Fund face up), `*-14-diesel-drew-3.png` (Heap shows Diesel). |
| Can't afford: only "Not enough credits" | **PASS** | P "can't afford Hedge Fund: Play only says "Not enough credits"". |
| Needs runs: "Needs runs (coming soon)", nothing spent | **PASS** | P "cards that need runs say "Needs runs (coming soon)" and spend nothing" (The Maker's Eye). **QA:** same for Neural EMP (Corp) and Inside Job (Runner). E "precedence: not_implemented beats no_credits". Screenshot `*-13-makers-eye-needs-runs.png` (see QA-S2-1: hard to read on 640×360). |
| Played card pushes hand over 5: hand-limit step at End turn | **PASS** | P Runner test above (Diesel → 6 cards → "Discard 1"). E "hand limit after Diesel: end turn asks for the discard". |

### S-02-5 A busy board fits on a phone, with real words and cards

| Criterion (short) | Result | Evidence |
|---|---|---|
| 3 servers × 2 ICE + 4 Runner cards at 844×390 and 640×360: nothing overlaps, every card tappable and holdable, nothing under notch/bar | **PASS** | P `s02-board.spec.ts` › "3 servers with 2 ICE each and 4 Runner cards…" (both views; no overlaps; inside safe area; ≥ 44×44; no page scroll; holds all ~28 cards). P `safe-area.spec.ts` › "the busy board stays inside the safe area on both sides" for notch left, notch right, swipe bar. Client `layout.test.ts` busy board × sizes × insets. QA screenshots `phone-*-20/22-busy-board-*.png`, `phone-*-24-busy-board-notch-left/right.png`. Note: QA-S2-2 is an overlap outside the busy-board setup (upgrade in HQ). |
| Install/play: answers < 0.1 s, animation done ≤ 0.6 s | **PASS** | P `s02-board.spec.ts` › "installs and plays answer in under 0.1s and animate within 0.6s"; every install/play test above calls `expectSnappy`. **QA:** picking a card lights its targets within 100 ms (every hand card, both sides, all 3 sizes). |
| Real words everywhere (ICE, HQ, R&D, Archives), same as glossary | **PASS** | P `s02-board.spec.ts` › "board labels use the real game's words on both sides" (HQ, R&D, Archives, Server 1, STACK, HEAP, MEMORY…; old "DISCARD"/"deck"/"in hand" gone). Client `terms.test.ts` (every screen term in GLOSSARY). QA read every screenshot: HQ, R&D, Archives, Server N, Stack, Heap, Grip, Memory, ICE type on zoomed ICE. |
| Every starter card is a real Core Set card with official name and text; none invented left | **PASS** | P `s02-board.spec.ts` › "held cards show real core-set names and text; long text fits the zoomed card". E `packages/cards/test/no-invented-names.test.ts` (24 retired names absent from cards, client, glossary), `cards.test.ts`. **QA spot-check of all 24 cards against its own knowledge of the 2012 Core Set: names, costs, strengths, memory, agenda numbers and texts all match** (symbols spelled as words). The engine developer took them from memory; the owner may want to glance at a few at the demo. |

### S-02-6 Phone board in landscape

| Criterion (short) | Result | Evidence |
|---|---|---|
| 844×390 and 640×360: whole board on one screen, no scrolling, everything big enough to tap | **PASS** | P `s02-board.spec.ts` busy-board test (scroll size = viewport, ≥ 44 px), "phones use the sideways layout…" (mode landscape). P `safe-area.spec.ts` › "a small 640x360 phone still fits everything…". All QA playthrough screenshots. |
| Notch left or right: nothing under notch or swipe bar | **PASS** (automated) / **OWNER CHECK optional** on his phone | P `safe-area.spec.ts` (notch left 47 + bar 21, notch right 47 + bar 21, bar only; board, picker, hints, game over, busy board). Screenshots `phone-*-24-busy-board-notch-*.png` (left 47 px band empty). |
| Upright phone: "Turn your phone sideways"; turning back restores the game | **PASS** | P `rotate.spec.ts` (portrait project): prompt covers the screen and takes taps, game runs underneath, rotating back gives an identical view and layout; desktop windows and tablets never show it. **QA:** same check with a game in progress. Screenshots `phone-390x844-upright-rotate-prompt.png`, `phone-844x390-after-rotating-back.png`. |
| Home screen opens sideways | **OWNER CHECK AT DEMO** (automated part PASS) | P `rotate.spec.ts` › "the web app manifest asks for landscape" (`orientation: landscape`). The real-phone check is on hold (question 3, "circle back later"). |
| Computer browser: looks and works as today | **PASS** | All Sprint 1 specs (actions, turn, discard, board, zoom, load, qa-sprint01) pass on `desktop`. P "the computer keeps the column, with servers and the Runner row in the middle". Screenshots `desktop-1280x800-*.png`: same column as Sprint 1, with servers and the Runner's row added in the middle. |
| Full Sprint 1 turn sideways (draw, credits, End turn, discard): works, as fast | **PASS** | P `s02-board.spec.ts` › "a full Sprint 1 turn sideways…" (`expectSnappy` on every tap). All Sprint 1 specs now also run on `phone` and `phone-small` (sideways) and pass. |

Criterion count: S-02-1 ×6, S-02-2 ×5, S-02-3 ×6, S-02-4 ×5, S-02-5 ×4, S-02-6 ×6 = 32. Result: **31 PASS, 1 OWNER CHECK AT DEMO** (home screen). Trying the notch on his own phone is optional for the owner; the automated check passes.

## Other required checks

| Check | Result | Evidence |
|---|---|---|
| `npm run lint` | PASS (exit 0) | at f192f53 and with QA's spec |
| `npm run typecheck` | PASS (exit 0) | same |
| `npm test` | PASS: **476** (ai 3, cards 18, engine 160, match 15, client 280) | |
| `npm run build` | PASS | main bundle 415 kB (128 kB gzipped) |
| `CI=1 npm run test:e2e` | PASS (exit 0) | Run 1 (team only, f192f53): **281/281**, no retries, 11.9 min on 2 CPUs. Run 2 (with QA's file): **305 passed, 2 skipped (QA's upright check runs on one project only), 1 flaky** (`rotate.spec.ts:39`, passed on its CI retry; see QA-S2-4), 13.7 min. QA's 3 known-failure runs (QA-S2-1 on phone-small, QA-S2-2 on phone-small and desktop) count as passed. |
| Snappiness: taps < 100 ms | PASS | `expectSnappy` on every install/play/draw/credit/End turn tap; QA pick-a-card test (all hand cards, both sides, 3 sizes) |
| Snappiness: no animation blocks input > 600 ms | PASS | every new animation (`install_flight`, `play_flight`, `server_open`) scheduled ≤ 600 ms; Sprint 1 guard tests (`qa-sprint01.spec.ts`, `turn.spec.ts`) green on all 3 projects |
| Empty timing windows auto-pass | PASS (as far as Sprint 2 goes) | No response windows exist yet. `packages/engine/test/qa-no-empty-windows.test.ts` (Sprint 1 QA) still passes with installs and plays in the random games. Re-test when runs arrive. |
| Card art is our own, real names/text allowed | PASS | `packages/cards/test/art.test.ts` (every card art is a `glyph:` key, all unique, no raster images/fonts/`<image>` in the client). `git ls-files`: no image or font files outside `docs/`. QA looked at every screenshot: art is our own neon line glyphs and an "OC" card back; no official logos, faction symbols or card pictures. |
| Landscape phones 844×390, 640×360, desktop; upright prompt | PASS | playthrough below |

## Bugs found

### QA-S2-1 (minor, readability): long hints shrink to unreadable size on the small phone
- **What happens:** the hint bubble is squeezed into a short slot in the right rail. Long hints wrap onto several lines and the whole bubble is then scaled down to fit the slot. On 640×360, "Needs runs (coming soon)" ends up as a 31×31 px bubble with 4 lines of about 5 px text, and "Not enough credits" 36×30 px with 3 lines. On 844×390 the same hints are readable but small (2 lines, about 10 px). Short hints ("No clicks left", "Not your turn") are fine. Desktop is fine.
- **Steps (640×360 phone held sideways):** Corp: End turn, discard 1, Confirm. Runner: tap The Maker's Eye (seed 2: `?seed=2`). The "Needs runs (coming soon)" bubble next to RUNNER is a tiny yellow square. Same for tapping Install on Corroder after installing Ninja ("Not enough credits").
- **Evidence:** `phone-640x360-13-makers-eye-needs-runs.png`, `phone-640x360-15-runner-not-enough-credits.png`; automated: `qa-sprint02.spec.ts` › "QA-S2-1 hints are readable" (marked as a known failure on `phone-small`; remove the `test.fail` line when fixed).
- **Likely area:** `apps/client/src/board.ts` hint toast (`fit = Math.min(1, …, (area.height - 6) / (h + 6))` scales the wrapped label down) and `apps/client/src/layout.ts` landscape `hintArea` (height `max(36, 42*s)` in the narrow rail, line ~408). Suggest a taller slot or letting the bubble grow upward / over the help text instead of shrinking.
- **Owner impact:** on a small phone you can't read why a tap was refused. The criteria only say "a small hint appears", which it does, so this is not a criterion FAIL.

### QA-S2-2 (minor, layout): an upgrade in HQ covers the HQ pile and its card count
- **What happens:** install an upgrade (Akitaro Watanabe) into HQ. On the 640×360 phone and on a computer, the upgrade's card is drawn 20–24 px to the right of the HQ pile, on top of it, so the HQ count number is hidden and the pile shows only a sliver. On 844×390 the HQ column widens and both sit side by side. Both views (Corp and Runner) are affected.
- **Steps:** `?seed=2`, Corp: tap Akitaro Watanabe, tap HQ. Look at the HQ column (640×360 or desktop).
- **Evidence:** `phone-640x360-07-hedge-fund-played-archives-face-up.png`, `phone-640x360-13-…png`, `desktop-1280x800-13-…png` (HQ column). Automated: `qa-sprint02.spec.ts` › "QA-S2-2 upgrade in HQ" (known failure on `phone-small` and `desktop`; e.g. 640×360 marker x 4–53, upgrade x 24–73).
- **Likely area:** `apps/client/src/layout.ts` server content row / fan rule for central servers (the HQ marker is counted as a card in the row and fanned); `apps/client/e2e/helpers.ts` `boardElements` deliberately ignores fanned rows, so the team's overlap checks do not catch it.
- **Owner impact:** the HQ count is still in the "N cards in HQ" label, so no information is lost, but the pile looks broken.

### QA-S2-3 (cosmetic): "Private Security Force" runs into its card type on phone hand cards
- **What happens:** on both sideways phone sizes the name wraps onto 3 lines and the last line ("Force") is drawn over "AGENDA". Other names fit in 2 lines. Desktop fits. The zoomed card is fine.
- **Steps:** `?seed=2` on a phone held sideways; look at the first hand card.
- **Evidence:** `phone-844x390-01-corp-turn-1.png`, `phone-640x360-01-corp-turn-1.png`. No automated test (the test hook reports text overflow only for the zoomed card).
- **Likely area:** small card face drawing in `apps/client/src` (card texture: name wrap / font shrink).

### QA-S2-4 (low, test only): the "rotating upright and back" e2e test is flaky
- **What happens:** `apps/client/e2e/rotate.spec.ts` › "rotating upright and back keeps the same game and restores the same board" failed once in the full run (passed on the CI retry) and **3 of 30** times with `--repeat-each=30 --retries=0`. The failure shows the upright layout (e.g. credits at y 710) being compared with the sideways one: the test reads the layout before the page has handled the resize back to 844×390.
- **Repro:** `cd apps/client && npx playwright test e2e/rotate.spec.ts -g "rotating upright" --project=portrait --repeat-each=30 --retries=0`.
- **Why (QA's reading):** `page.setViewportSize` returns before the page's `resize` event runs; `waitIdle` only waits for animations, so it can return the old layout. The game relays out synchronously on `resize` (`apps/client/src/main.ts` `relayout`), so players are not affected.
- **Suggested direction:** in the test, wait until `layout().viewport` equals the sideways size before comparing.

## Observations (not failures)
1. The Play target for operations/events appears in the right rail (on phones), not over the card. Easy to find in the playthrough.
2. Unaffordable targets are shown grey with their price, and tapping them gives the hint; the card stays picked so another spot can be chosen. Good.
3. The memory counter is a separate box on the right of the Runner's row with four small boxes, one filled per memory used.
4. Real-card cost changes from the swap (Hedge Fund 5, Ninja 4, etc.) make the Runner's opening tight: after Ninja the Runner has 1 credit. Expected, listed in DECISIONS.

## Playthrough and screenshots (`docs/sprints/sprint-02-qa/`, 2× pixel density)

Generated by `apps/client/e2e/qa-sprint02.spec.ts` (real taps: touch on phones, mouse on desktop), seed 2, for `phone-844x390`, `phone-640x360` and `desktop-1280x800`:
- `-01-corp-turn-1` new game · `-02-agenda-picked-new-server-lit` · `-03-agenda-in-server-1-face-down` · `-04-corp-holds-own-installed-card-zoom` · `-05-upgrade-picked-every-server-lit` · `-06-hedge-fund-play-5-credits` · `-07-hedge-fund-played-archives-face-up` (credits 9) · `-08-no-clicks-left` · `-09-runner-turn-corp-cards-are-backs` · `-10-runner-holds-corp-card-sees-back` · `-11-runner-program-picked-install-4-credits` · `-12-ninja-installed-memory-1-of-4` · `-13-makers-eye-needs-runs` · `-14-diesel-drew-3` · `-15-runner-not-enough-credits` · `-16-corp-turn-3-runner-rig-face-up`
- Busy board (seed 1): `-20-busy-board-corp-view`, `-21-busy-board-upgrade-picked`, `-22-busy-board-runner-view`, `-23-busy-board-hold-ice` (Runner sees "Face-down Corp card"), `-24-busy-board-notch-left`, `-24-busy-board-notch-right`
- ICE prices (seed 9): `-qa-ice-two-on-server-1`, `-qa-ice-priced-targets` ("Install · 2 credits")
- Upright phone: `phone-390x844-upright-rotate-prompt.png`, then `phone-844x390-after-rotating-back.png` (same game)

## Owner checks for the demo
1. **Home screen opens sideways** (when we circle back to question 3): add to home screen, open it, it should open sideways.
2. **Optional:** on your own phone held sideways, notch on the left and then the right: nothing you need is under it.
3. **"Not enough memory"** can't happen with the current Runner deck (only 3 small programs); it is tested by the team's automatic checks only.
4. Glance at a couple of real cards (hold to zoom) to confirm the text matches what you remember.
5. On a small phone, look at the yellow hints (QA-S2-1) and an upgrade in HQ (QA-S2-2) and tell us if they bother you.

## Files added by QA
- `apps/client/e2e/qa-sprint02.spec.ts`: asset/upgrade targets, ICE targets with remotes and the 2-credit charge, "needs runs" for Neural EMP and Inside Job, card-pick speed, playthrough screenshots, upright prompt, and the QA-S2-1 / QA-S2-2 bug tests (known failures where the bug shows).
- `docs/sprints/sprint-02-qa/`: screenshots above.

## Round 2 (2026-11-12, at 6113829)

Fixes checked: 8108050 (QA-S2-4), 78fe347 (QA-S2-1), 36923b2 (QA-S2-2), d40a215 (QA-S2-3), d51f7d0 (End turn guard judges taps by when they were made), plus the test changes in `helpers.ts`, `rotate.spec.ts`, `qa-sprint01.spec.ts` and the new `s02-qa-fixes.spec.ts` and `guard-slow-frame.spec.ts`. QA read every diff.

### Per bug
| Bug | Result | Evidence |
|---|---|---|
| QA-S2-1 hints unreadable on 640×360 | **FIXED** | Sideways, the hint now uses the help text's space in the rail (the help text hides while it shows) and wraps at full size. QA's test "QA-S2-1 hints are readable" passes on all 3 sizes with its `test.fail` removed (all four hints ≥ 80 sq px per character). **New QA test** "a hint shown while a card is picked never covers the lit Play / Install spot or End turn" passes on all 3 sizes. Screenshots: `phone-640x360-r2-needs-runs-hint-with-play-lit.png` ("Needs runs (coming soon)" in large readable text below the Play spot), `phone-640x360-13-…`, `phone-640x360-15-…`, `phone-844x390-13/15-…`, `desktop-1280x800-13-…` (desktop unchanged). |
| QA-S2-2 upgrade in HQ covers the HQ pile | **FIXED** | Central piles (HQ, R&D, Archives) are never covered; installed cards sit beside them. QA's test "QA-S2-2 upgrade in HQ" passes on all 3 sizes with `test.fail` removed. **New QA tests:** an upgrade in R&D and in Archives does not cover those piles either (both views), and the busy board plus an upgrade in HQ stays clean with every card ≥ 44 px (both views, all sizes; this is the architect's "shrink by at most 2 px" path). The team's overlap helper now always checks the HQ marker. Screenshots `*-r2-upgrade-in-rd.png`, `*-r2-upgrade-in-archives.png`, `*-r2-busy-board-upgrade-in-hq-{corp,runner}-view.png`, `phone-640x360-07/09/15-…`, `desktop-1280x800-13-…` (HQ count "3" visible). |
| QA-S2-3 "Private Security Force" over its type | **FIXED** | Name now fits above "AGENDA" on hand cards at both phone sizes (the art window gets a little shorter). Team test `s02-qa-fixes.spec.ts` › "every starter card name stays clear of its type label" checks all 24 cards at hand and installed size. QA checked visually: `phone-844x390-01-corp-turn-1.png`, `phone-640x360-r2-upgrade-in-rd.png` (one line at 640). |
| QA-S2-4 flaky rotate test | **FIXED** | The test now waits until the game has laid out for the sideways size. QA's old repro (`-g "rotating upright" --project=portrait --repeat-each=30 --retries=0`): **30/30** (was 27/30). `rotate.spec.ts` + `guard-slow-frame.spec.ts` with `--repeat-each=10 --retries=0`: **110/110**. |
| New: End turn double tap could end two turns on a slow phone | **FIXED** | `guard-slow-frame.spec.ts` (page kept busy 450 ms after the ending tap; second tap made 150 ms later) passes on all 3 projects, 10× each, and under 4× CPU throttle. **QA mutation check:** reverting the guard in `board.ts` to judge by handling time (`performance.now()`) makes the main test fail on all 3 projects while the control still passes; restored afterwards. Code read: `input.ts` `inputTime()` uses the tap's event time only while that tap's handler runs and falls back to the current time for odd stamps. |

### QA's judgment on the changed Sprint 1 guard test (`qa-sprint01.spec.ts`)
The guard length is now measured as `armedAt − madeAt` (from when the ending tap was made) instead of `armedAt − handledAt`. On its own this is a slightly looser number (made ≤ handled), but it now matches how the game judges every later tap (by when it was made), and the other assertions are unchanged: every extra tap that ended before `armedAt` must be refused, the synchronous tap inside the guard must exist, and a tap after the guard must be answered. The case the old number guarded against in spirit (a tap made inside the guard but handled after it) is now covered directly and more strictly by `guard-slow-frame.spec.ts`, which QA mutation-checked. **QA agrees it is legitimate, not a weakening.**

### Checks (Round 2)
| Check | Result |
|---|---|
| `npm run lint`, `npm run typecheck`, `npm run build` | PASS (exit 0); bundle 417 kB (129 kB gzipped) |
| `npm test` | PASS: **479** (ai 3, cards 18, engine 160, match 15, client 283) |
| `CI=1 npx playwright test --retries=0` (full) | PASS (exit 0): **323 passed, 3 skipped** (QA's upright check runs on one project; the team's "help text steps aside" check is sideways-only), 0 flaky, 14.6 min |
| QA spec incl. new Round 2 tests (`qa-sprint02.spec.ts`, after the full run) | PASS: 34 passed, 2 skipped (same upright check) |
| `rotate.spec.ts` + `guard-slow-frame.spec.ts` `--repeat-each=10 --retries=0` | PASS: 110/110 |
| Snappiness | PASS: every `expectSnappy` check in the full run; QA's pick-a-card test (< 100 ms); and under `E2E_CPU_THROTTLE=4`: "installs and plays answer in under 0.1s…", "a full Sprint 1 turn sideways…" and both guard-slow-frame tests, 12/12 on all 3 projects |
| Art / IP | unchanged: `art.test.ts` passes; the new card-face code only changes text layout and art window height |

### Criteria re-check
All 32 Sprint 2 criteria were re-run through the full e2e and unit suites at 6113829 with the fixes in: same results as Round 1, **31 PASS + 1 OWNER CHECK** (S-02-6 home screen opens sideways). All playthrough screenshots in `docs/sprints/sprint-02-qa/` were re-taken at 6113829 (2× density; 844×390, 640×360, 1280×800, upright 390×844), plus the new `*-r2-*.png` files.

### Remaining owner checks for the demo
1. Home screen opens sideways (when we come back to question 3).
2. Optional: notch on the left/right on your own phone.
3. "Not enough memory" can't be seen in play yet (tested automatically only).
4. Optional: glance at a few real cards (hold to zoom).

### Round 2 bugs
None found.

### Files changed by QA in Round 2
- `apps/client/e2e/qa-sprint02.spec.ts`: Round 2 tests (upgrade in R&D/Archives, busy board + upgrade in HQ, hint vs lit Play spot). The `test.fail` lines for QA-S2-1/2 were removed by the developers, which QA confirms is correct now.
- `docs/sprints/sprint-02-qa/`: all screenshots re-taken; new `*-r2-*.png`.
