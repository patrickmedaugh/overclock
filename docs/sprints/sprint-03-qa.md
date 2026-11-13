# Sprint 3 — QA report

QA date: 2026-11-12 · Branch `sprint-03` · Verified at **73eec24** · QA did not write the code under test.

**Round 2 summary (2026-11-13, at 34ab59a + QA's test update): both bugs from this report are fixed (QA-S3-1, QA-S3-2), and S-03-6 AC1 now PASSES. Still 30 of 31 PASS, 1 FAIL: S-03-6 AC2 (the 6× slowed-down check) went red once in 150 runs for a new, different reason (QA-S3-7, see "Round 2" at the end). All other checks green: full screen tests 512 passed / 6 skipped / 0 failed with no retries.**

**Round 1 summary: 30 of 31 acceptance criteria PASS, 1 FAIL (S-03-6 AC1, a test-only problem), 0 OWNER CHECK.** The game itself passed everything QA threw at it: runs, rez, breaking, access, stealing, trashing, advancing, scoring, both kinds of win, flatline, and the three "Needs runs" cards. **2 bugs found:**
- **QA-S3-1 (minor, layout):** when Archives holds many cards (late game), the Runner sees them as one row of ever-smaller cards: 12 cards are 33 px wide on the small phone (names cut to "Private…", "Neural…") and 41 px on a computer, although there is plenty of empty room above and below.
- **QA-S3-2 (low, test only):** one of the two "End turn double tap" test files (`guard-slow-frame.spec.ts`) still times its second tap with a Node timer. On a busy test machine it went red once (its own check "the second tap was made inside the 300 ms guard" saw 337 ms instead of 150 ms). The game was fine. This is exactly the kind of false alarm S-03-6 is meant to remove, so S-03-6 AC1 is marked FAIL until it is fixed (a one-line fix, see below).

All required checks pass: lint, typecheck, **719 unit tests**, build, **full e2e 431 passed / 3 skipped / 0 failed with no retries**, plus QA's new spec (30 tests per run). Snappiness budget met. Hidden information holds in every check. Card art is our own runtime drawing.

"P" = Playwright test (projects: `phone` 844×390 touch, `phone-small` 640×360 touch, `desktop` 1280×800 mouse, `portrait` 390×844 for the rotate prompt). "E" = engine / match / client Vitest test. "QA" = test added by QA in `apps/client/e2e/qa-sprint03.spec.ts` (all pass on all 3 sizes unless noted). Screenshots are in `docs/sprints/sprint-03-qa/` (2× pixel density) and the team's `docs/sprints/sprint-03-screens/`.

## Acceptance criteria

### S-03-1 Runner: run on a server and steal agendas

| Criterion (short) | Result | Evidence |
|---|---|---|
| Tap Run: every Corp server lights up; tapping one starts the run, 1 click; tapping Run again cancels, nothing spent | **PASS** | P `s03-runs.spec.ts` › "tapping Run lights every Corp server…" (HQ, R&D, Archives, Server 1 lit, ≥ 44 px, −1 click, credits same, snappy), "tapping Run again cancels: nothing is sent, nothing spent" (whole view unchanged; empty-board tap cancels too), "without clicks, Run says "No clicks left"". E `run.test.ts` › S-03-1 AC1 group. Screenshot `sprint-03-screens/01-run-servers-lit-*.png`. |
| No ICE: straight in; HQ = 1 random card, R&D = top card, Archives = all (turn face up), remote = every card | **PASS** | P `s03-access.spec.ts` › HQ (Anonymous Tip, large), R&D (top card), "Archives: every card at once, turned face up for good". **QA:** Archives with 4 cards shown together, all inside the screen and clear of the buttons (`05-archives-four-cards`), and 12 cards (see QA-S3-1). Remote server: E `run.test.ts` › "a remote: every card in it, one at a time (agenda + upgrade)" (the P steal-to-win test also accesses a remote). E "HQ … (seeded)", "same seed and state: the same HQ card". |
| Steal: agenda to the Runner's score area face up, both see "Runner 2 points" | **PASS** | P `s03-access.spec.ts` › "R&D: … only Steal, which scores it and both players see "Runner 2 points"" (Corp's view checked after the turn passes), "an agenda in Archives can be stolen: "Runner 1 point"". **QA:** two agendas in Archives, each "Steal [name]", points add up. E S-03-1 AC3 group. Screenshot `sprint-03-screens/02-access-rd-steal-*.png`. |
| Asset/upgrade with trash cost: "Trash · N credits" destroys into Archives face up; "Leave it" puts it back | **PASS** | P `s03-access.spec.ts` › "a card with a trash cost: "Trash · 3 credits"…" (Akitaro Watanabe, −3 credits, top of Archives face up), "Leave it puts the card back where it was". E `run.test.ts` › "PAD Campaign: Trash · 4 credits sends it face up to Archives", "not enough credits: offered with no_credits…". Screenshot `sprint-03-screens/06-access-trash-or-leave-*.png`. |
| Can't steal/trash (operation, ICE): Done puts it back, Corp hand/deck untouched | **PASS** | P `s03-access.spec.ts` › HQ test (Anonymous Tip → Done; Corp hand, deck and Archives counts unchanged). QA screenshot `desktop-1280x800-11-access-hq-large-card.png`. |
| Jack out after passing ICE ends the run with nothing accessed; not possible before the first ICE | **PASS** | P `s03-runs.spec.ts` › "Don't rez: … Jack out ends the run with nothing accessed" (only `run_ended{jacked_out}`). Rez prompt and encounter show no Jack out button (P rez-prompt and encounter tests list the exact buttons). E S-03-1 AC6 group ("not before the first ICE…"). **QA:** "jack out shows a notice and leaves a clean board". |
| Run ends: back on your turn with clicks left, Corp's hidden cards hidden again; Runner side only receives names of accessed cards | **PASS** | P `s03-runs.spec.ts` › "a finished run leaves the Runner's turn as it was…". E `hidden-info.test.ts` › "hidden information, R&D privacy and liveness hold at every step (60 games)" (> 500 runs; Runner view/events never name a face-down Corp card except cards it is accessing or that were revealed). E `run-passthrough.test.ts`. **QA:** "the Runner seat never receives the name of an unrezzed ICE or any face-down Corp card, at any step" (Runner seat's view checked at the rez prompt, after Don't rez, Continue and each access; the ICE's id never appears; on screen its name appears only in the Corp's Rez button, as chosen in Q1 A). |

### S-03-2 Corp: advance and score agendas; 7 points wins

| Criterion (short) | Result | Evidence |
|---|---|---|
| Tap installed agenda: "Advance · 1 credit"; 1 click + 1 credit, adds a counter | **PASS** | P `s03-corp-score.spec.ts` › "tapping an installed agenda shows "Advance · 1 credit"…" (≥ 44 px, −1 click, −1 credit, counter drawn, snappy). **QA:** "after Advance the agenda is still picked: a second Advance is one tap; tapping it again drops the pick" (counters 1 → 2, Score offered only with enough counters). Screenshot `*-09-agenda-still-picked-after-advance.png`. |
| Runner sees the counters on a face-down card, only the back | **PASS** | P "the Runner sees the counters on a face-down card, but only its back" (`cardId` null, counter shown, view JSON has no id). E `advance-score.test.ts` › AC2. |
| Enough counters (HT 2, PSF 4, PR 5): Score button; no click; face up to Corp score area, points added | **PASS** | P same Advance test (Score appears after the last counter; scoring keeps clicks; "Corp N points"). E `advance-score.test.ts` › AC3 ("scoring takes no click: works with 0 clicks left"). Card data checked by QA: 2 / 4 / 5 counters, 1 / 2 / 3 points. Screenshot `sprint-03-screens/07-corp-advance-and-score-*.png`. |
| 7 points by steal or score: game ends at once, "Corp wins"/"Runner wins" + "7 agenda points" | **PASS** | P "scoring to 7 ends the game at once…", "stealing to 7 ends the game at once…". E `advance-score.test.ts` › AC4 ("6 points is not a win"), `run.test.ts` › "a steal reaching 7 points ends the game at once". Screenshot `sprint-03-screens/08-corp-wins-*.png`. |
| Starter decks: 7 reachable by both sides (automated) | **PASS** | E `packages/match/test/seven-points.test.ts` (seeds 1, 2, 12345: Corp scores to 7, Runner steals to 7, whole game replays). Corp deck: 17 cards, 9 agenda points (`cards.test.ts`). Note for the owner (DECISIONS 2026-11-12): a Corp points win needs Priority Requisition, so in ~1 game in 5 the Corp's deck runs out first; balance question for the demo. |

### S-03-3 ICE fights back: rez and subroutines

| Criterion (short) | Result | Evidence |
|---|---|---|
| Reaching face-down ICE: "Rez [name] · [cost] credits?" with Rez / Don't rez; skipped if the Corp can't afford it | **PASS** | P `s03-runs.spec.ts` › "reaching face-down ICE asks the Corp "Rez Enigma · 3 credits" / "Don't rez"; the ICE is highlighted". Skip: E `run.test.ts` › "the Corp cannot pay: no question, the ICE is passed face down", "already rezzed: no question". Screenshot `sprint-03-screens/03-corp-rez-prompt-*.png`, QA `*-01-two-ice-outer-approached.png`. |
| Don't rez: ICE stays face down, Runner moves on | **PASS** | P "Don't rez: the ICE stays face down, the Runner moves on…". **QA:** two-ICE test (both declined, both stay face down). |
| Rez: face up for both (stays), Corp pays | **PASS** | P "Rez: the Corp pays, the ICE flips face up for both players…" (−3 credits). E "Rez: … flips face up for both (and stays)". |
| Let it through: End the run / lose 1 click / 3 net damage happen in order | **PASS** | P `s03-encounter.spec.ts` › "Wall of Static let through: "End the run"…", "Enigma let through takes a click and ends the run" (events in order, −1 click). E `encounter.test.ts` › Enigma order, "if able" with 0 clicks, "Neural Katana: 3 net damage discards 3 random Grip cards face up to the Heap (seeded)". **QA:** Neural Katana let through in a real game (`07-neural-katana-encounter`). |
| More net damage than cards in hand: Corp wins at once ("Runner flatlined") | **PASS** | E `encounter.test.ts` › "AC5: more net damage than cards in the Grip: the Corp wins at once (flatline)", "net damage equal to the Grip discards it all, no flatline". **QA:** "Neural Katana let through with 2 cards in the Grip: "Corp wins" / "Runner flatlined"" with real taps (Run, Rez, Let it through) on all 3 sizes. Screenshot `*-08-corp-wins-runner-flatlined.png`. |
| Run steps through each ICE outside-in, met ICE highlighted | **PASS** | E `run.test.ts` › "AC6: several ICE are met outside-in, with a Continue stop after each". P `s03-runs.spec.ts` uses a one-ICE server only, so **QA added** "the outer ICE is approached first and highlighted, then the inner one, then the server" (Neural Katana outside Enigma on HQ; highlight box = outer ICE, then inner, then the HQ column; "Next: 1 more ICE" / "Next: HQ"). Screenshots `*-01-two-ice-outer-approached.png`, `*-02-two-ice-inner-approached.png`. |

### S-03-4 Runner: break ICE with icebreakers

| Criterion (short) | Result | Evidence |
|---|---|---|
| Matching breaker: buttons with prices ("+1 strength · 1 credit", "Break "End the run" · 1 credit") | **PASS** | P `s03-encounter.spec.ts` › "a matching breaker shows its buttons with prices…" (Corroder vs Wall of Static). **QA:** Enigma vs Gordian Blade, the most crowded encounter (4 buttons), clean on 640×360 with every button ≥ 44 px and clear of the info panel. Screenshot `phone-640x360-03-enigma-vs-gordian-4-buttons.png`. |
| Breaker weaker than ICE: Break dimmed until raised; Corroder on Wall of Static = 2 credits | **PASS** | P "a matching breaker shows its buttons…" (Break `too_weak`, dim), "a dim Break says "Raise strength first" and changes nothing", "Corroder on Wall of Static: 1 credit to raise, 1 to break…" (−2 credits). E `encounter.test.ts` › AC2/AC3. |
| Break: crossed out, won't happen; all broken → ICE passed | **PASS** | P Corroder test (subroutine `broken: true`, then Continue / Jack out). **QA:** Enigma: first subroutine crossed out (`*-04-enigma-one-sub-crossed-out.png`), second broken → "Passed Enigma", no click lost. E "a broken subroutine does not fire…". |
| Wrong kind or no breaker: no break buttons, only Let it through | **PASS** | P "a wrong-kind breaker shows no break buttons…" (Enigma, only "Let it through"). E AC4 test. |
| Can't afford: only "Not enough credits", nothing changes | **PASS** | P "can't afford to break: only "Not enough credits", nothing changes" (view unchanged, one hint). E AC5 test. |
| Gordian Blade's raise lasts the run; Corroder/Ninja drop back after each ICE (automated) | **PASS** | E `encounter.test.ts` › "AC6: Gordian Blade keeps raised strength for the rest of the run; Corroder/Ninja drop back after each ICE" (two Enigmas / Walls of Static / Katanas), "Gordian Blade raised during the run drops back when the run ends by jack out too". |

### S-03-5 The "Needs runs" cards come alive

| Criterion (short) | Result | Evidence |
|---|---|---|
| The Maker's Eye: run on R&D, access top 3 one after another | **PASS** | P `s03-corp-score.spec.ts` › "The Maker's Eye: a run on R&D that accesses the top 3 cards one after another". E `run-cards.test.ts` › AC1 group (short R&D, steal card 1 does not skip card 2). |
| Inside Job: pick a server; first rezzed ICE met is skipped; unrezzed ICE doesn't count | **PASS** | P "Inside Job: pick a server; the first rezzed ICE met is bypassed…" (servers lit "Play · 2 credits", rez → `ice_bypassed`, no subroutine fired, notice "Inside Job: ICE bypassed"). E `run-cards.test.ts` › "face-down ICE the Corp doesn't rez doesn't count", "only the first". |
| Neural EMP after a run: 1 net damage; otherwise "Only after the Runner made a run", nothing spent | **PASS** | P "Neural EMP before any run: …nothing spent", and the Inside Job test continues to the Corp's turn: EMP lit, −1 Grip card, notice "1 net damage". E AC3 group ("a run two turns ago does not count", "a run started by a run event counts too", empty Grip → flatline). |
| No card says "Needs runs (coming soon)" (automated) | **PASS** | P `s03-corp-score.spec.ts` › "the chosen deals hold every card of both starter decks…" plus one test per seed tapping every hand card (no "Needs runs" in hints or labels). E `run-cards.test.ts` › AC4. QA grep: the string no longer appears in `apps/client/src` or `packages/`. |

### S-03-6 Make the End turn double-tap test sturdy

| Criterion (short) | Result | Evidence |
|---|---|---|
| Full screen-test set run 10× on the same version: double-tap tests pass every time, without loosening | **FAIL** (QA-S3-2, test only) | `qa-sprint01.spec.ts` (the rewritten test): **240/240** in two loaded 10× runs (guard specs 10× while a second Playwright run of the s02/s03 specs ran on the same 2-CPU machine), plus 6/6 in the full run. `guard-slow-frame.spec.ts`: **1 failure in 120** in the first loaded 10× run ("the second tap was made inside the 300ms guard": 337.5 ms, expected < 300), 120/120 in the second. Not loosened: QA read the new test; it keeps every Sprint 2 assertion (guard ≥ 300 ms from the tap, every early tap refused, a tap after the guard answered) and adds more (each tap made within 2 ms of its stamp, ≥ 1 End turn tap made in [150 ms, armedAt), one tap made inside but handled after the guard). See "QA's judgment" below on 10× full suite. |
| CPU slowed 6×, run 10×: each test really tests a tap (no silent skip) | **PASS** | `E2E_CPU_THROTTLE=6 … -g "double-tap guard" --repeat-each=10 --retries=0` on phone, phone-small, desktop: **120/120 passed, 0 skipped, 0 flaky** (JSON report). Neither spec has a skip or an env-based exemption (read). |
| Break the protection on purpose: tests fail (automated) | **PASS** | `npm run test:guard-mutation` (CI job `guard-mutation` in `.github/workflows/ci.yml`): result in "Checks" below. Script read: three mutations (guard 0 ms, judged by `performance.now()`, check removed), each must turn every in-guard test red on all 3 projects; the baseline must be green; skips count as failure; test count is checked. |

Criterion count: S-03-1 ×7, S-03-2 ×5, S-03-3 ×6, S-03-4 ×6, S-03-5 ×4, S-03-6 ×3 = **31. Result: 30 PASS, 1 FAIL.**

### QA's judgment: is "guard specs 10× + full suite once" enough for S-03-6 AC1?

The AC asks for the double-tap tests to pass every time when the **full suite** runs 10×. The reason it says "full suite" is that Sprint 2's false alarm came from a **busy machine**, not from the test alone. Guard specs 10× on an idle machine does not recreate that, so on its own it does not meet the criterion. Running the whole suite 10× here would take about 3 hours (19 min per run on 2 CPUs), which is not practical for every sprint.

What QA did instead, and recommends as the standing check: run the guard specs 10× (`--repeat-each=10`) **while a second Playwright run loads the same machine** (separate port and `--output` folder), plus the full suite once. That reproduces the busy-machine condition with all 10 repetitions. It is what caught QA-S3-2. A further practical option for CI is to add the guard specs with `--repeat-each=10` as an extra step inside the existing e2e job, run in parallel with the main suite. QA does not require 10 literal full-suite runs.

## Other required checks

| Check | Result | Evidence |
|---|---|---|
| `npm run lint` | PASS (exit 0) | at 73eec24, and with QA's spec |
| `npm run typecheck` | PASS (exit 0) | same; QA spec also checked with `tsc -p tsconfig.node.json` |
| `npm test` | PASS: **719** (ai 4, cards 24, engine 322, match 61, client 308) | |
| `npm run build` | PASS | main bundle 456 kB (140 kB gzipped) |
| `CI=1 npx playwright test --retries=0` (full, team specs) | PASS: **431 passed, 3 skipped, 0 failed**, 19.3 min, 1 worker | skips: QA's upright check (1 project) and the sideways-only help-text check, as in Sprint 2 |
| QA spec `qa-sprint03.spec.ts` | PASS: 30/30 on 3 projects (2 are the QA-S3-1 known failures, marked `test.fail`) | also 129/129 for all `s03-*` + QA specs while the machine was loaded |
| Guard specs 10×, machine loaded | `qa-sprint01`: 240/240; `guard-slow-frame`: 239/240 (QA-S3-2) | two runs |
| Guard specs 10×, `E2E_CPU_THROTTLE=6` | PASS: 120/120, no skips | |
| `npm run test:guard-mutation` | see below | |
| Snappiness: taps < 100 ms | PASS | `expectSnappy` on every run tap in the team specs (Run, Rez, pump, Break, Let it through, Jack out, Steal, Trash, Advance, Score, Neural EMP) and QA's (Break ×2, Steal, Advance, Jack out); all in the full run |
| Snappiness: nothing blocks input > 600 ms | PASS | every run animation scheduled ≤ 600 ms (`expectSnappy`); run notices are toasts: **QA** "the "End the run" notice is a toast…": with the notice on screen, tapping Run lights the servers inside the same tap, and the notice covers no button, hand card or End turn |
| Empty timing windows auto-pass | PASS | Rez question skipped when the ICE is rezzed or the Corp can't pay (E tests above); no Continue stop before the first ICE or with no ICE; encounters end by themselves when everything is broken or bypassed. E `hidden-info.test.ts` liveness: outside game over exactly one side can act and `hasMeaningfulResponse` is true for it, every step of 60 random games; `qa-no-empty-windows.test.ts` (250 games). "Let it through" with no breaker and "Done" on an untakeable card are deliberate stops (architect, DECISIONS 2026-11-12: they show the player what happens, as the ACs ask) |
| Card art our own; real names/text allowed (charter rule 3) | PASS | no image/font files outside `docs/` except our own `favicon.svg` (hexagon); `art.test.ts` passes (every card art is a `glyph:` key); screenshots show our neon glyphs and an "OC" card back, no official art or logos. QA checked the Sprint 3 numbers against its knowledge of the 2012 Core Set: Corroder 2 / str 2, Gordian Blade 4 / str 2 (+1 for the run), Ninja 4 / str 0 (+5 for 3), Wall of Static 3/3, Ice Wall 1/1, Enigma 3/2, Neural Katana 4/3, Maker's Eye 2, Inside Job 2, Neural EMP 2: all match |
| Landscape 844×390, 640×360, desktop | PASS | playthrough below |

**Guard mutation result (`npm run test:guard-mutation`, exit 0):** baseline 0/12 red; guard 300→0 ms: 9/12 red; judged by handling time (`performance.now()`): 9/12 red; check removed: 9/12 red. In each broken build every in-guard test is red on phone, phone-small and desktop (the 3 green ones are the slow-frame "control" test, which taps after the guard and is meant to pass). Under "judged by handling time" the rewritten test fails at "tap made 50ms after the ending tap" (made inside, handled after), which is the Sprint 2 slow-phone bug. "guard 0 ms" fails on the "guarded ≥ 300 ms" check first.

## Developer focus points, checked

1. **Layout during a run.** The hand is put away and the decision buttons take its strip on every size; the run info sits in the rail (phones) or left of the buttons (desktop). Accessed cards are drawn large over both bands. On desktop they cover the banner and End turn; QA's test "during access, taps on whatever the large cards cover … change nothing" taps the old End turn, Run button and hand-card spots during an access on all 3 sizes: the run stays on, no click spent, the turn does not end. A sliver of the banner text shows beside a single large card on desktop (`desktop-1280x800-11-access-hq-large-card.png`, "TURN … left" peeking out); cosmetic, not a bug.
2. **Archives with several cards on 640×360:** 4 cards are large and clean (`phone-640x360-05-archives-four-cards.png`). 12 cards: see QA-S3-1.
3. **Most crowded encounter on 640×360** (Enigma + Gordian Blade = 4 buttons): fits, every button ≥ 44 px, no overlap. The first button's text wraps to 4 lines and fills its button ('Break "The Runner loses 1 click, if able" · 1 credit'); readable (`phone-640x360-03-…png`).
4. **Hidden info:** the Runner seat's view never contains the unrezzed ICE's id (QA test above, plus E property test).
5. **Agenda stays picked after Advance:** yes (QA test).
6. **Run notices toast:** yes, non-blocking and clear of buttons (QA test; `phone-844x390-10-end-the-run-notice.png`).
7. **Re-seeded `qa-sprint02.spec.ts` and `s02-qa-fixes.spec.ts`:** QA read the full diff. Nothing was weakened. Seeds changed only where the 17-card deck reshuffled the deals (the tests still pick the same named cards, so a wrong seed would fail, not pass). The two "Needs runs" checks were rightly replaced by Neural EMP's "Only after the Runner made a run" (a longer text, so the readability check is stricter) and by "Inside Job lights the servers". The hint-vs-Play-spot check now compares against the Corp's credits/label because the hint now shows on the Corp's turn; same check, other side.
8. **New guard test and CI mutation job:** read and run (S-03-6 rows above).

## Bugs found

### QA-S3-1 (minor, layout): a late-game Archives is shown as tiny cards
- **What happens:** all Archives cards are drawn in one row that shrinks to fit the width. With 12 cards each card is **33 px wide on 640×360** (names cut: "Private…", "Hostile…", "Neural…"; "OPERATION" spills past the card; the "From Archives" tags run into each other) and **41 px on desktop**, while most of the height above and below the row is empty. 844×390 just stays ≥ 44 px. Archives grows all game (discards, played operations, trashed cards), so this will be common late in a game.
- **Steps (any size, `?seed=1`):** Corp: draw 3 times, End turn, discard 4. Runner: End turn. Repeat twice more (Archives now holds 12). Runner: Run → Archives.
- **Evidence:** `phone-640x360-12-archives-twelve-cards.png`, `desktop-1280x800-12-archives-twelve-cards.png`. Automated: `qa-sprint03.spec.ts` › "twelve cards in Archives are all shown, each at least 44px wide, clear of the buttons" (marked `test.fail` on phone-small and desktop; remove that line when fixed).
- **Likely area:** `apps/client/src/layout.ts` `accessSlots()` (one row only). Suggest wrapping into more rows when the access area is taller than one row needs (or a minimum card width with a second row).
- **Owner impact:** you can still hold a card to read it, and you can still steal each agenda by its named button, but you can't read the pile at a glance.

### QA-S3-2 (low, test only): `guard-slow-frame.spec.ts` can still cry wolf on a busy machine
- **What happens:** its second tap is sent `setTimeout(150)` after the first (Node clock). On a loaded machine Node fired late and the tap was made 337.5 ms after the first, so the test's own setup check failed ("the second tap was made inside the 300ms guard"). The game behaved correctly.
- **Repro:** in one shell `cd apps/client && npx playwright test e2e/qa-sprint01.spec.ts e2e/guard-slow-frame.spec.ts -g "double-tap guard" --project=phone --project=phone-small --project=desktop --repeat-each=10 --retries=0 --output=/tmp/g`; 30 s later, in a second shell, `E2E_PORT=4510 npx playwright test e2e/s03-*.spec.ts --workers=1 --retries=0 --output=/tmp/l`. Seen once in 2 such runs (`[phone] guard-slow-frame.spec.ts:72`, repeat 5). Note: both runs need their own `--output`, otherwise they delete each other's trace files.
- **Suggested fix:** stamp the taps like the rewritten guard test does: `sendTap(page, spot, { touch: true, madeAt: t0 })` and `sendTap(page, next, { touch: true, madeAt: t0 + secondMs })` (sent once real time has passed the stamp). The test still keeps the page busy for 450 ms, so "made inside, handled after" stays covered. Then re-run the loaded 10× check.

## Observations (not failures)
1. During access on desktop the large card hides the banner ("whose turn"), End turn and the hand; that is by design and nothing behind it reacts to taps.
2. Every encounter without a matching breaker still stops on "Let it through", and an untakeable access stops on "Done" (architect ruling, so the player sees what happened). Watch at the demo whether runs feel like too many taps.
3. Several agendas in Archives must all be stolen before "Done" shows; each Steal button names its card ("Steal Hostile Takeover"), and the name is dropped when only one card is left to decide.
4. The skipped rez question tells a watching player the ICE costs more than the Corp's credits (architect noted, acceptable for one shared screen).

## Playthrough and screenshots (`docs/sprints/sprint-03-qa/`, 2× density)
Generated by `qa-sprint03.spec.ts` with real taps (touch on phones, mouse on desktop) for `phone-844x390`, `phone-640x360` and `desktop-1280x800`:
- `-01-two-ice-outer-approached` (Rez Neural Katana · 4 credits, outer ICE highlighted) · `-02-two-ice-inner-approached` (Rez Enigma · 3 credits, inner highlighted)
- `-03-enigma-vs-gordian-4-buttons` · `-04-enigma-one-sub-crossed-out`
- `-05-archives-four-cards` (two named Steal buttons) · `-06-archives-one-stolen`
- `-07-neural-katana-encounter` · `-08-corp-wins-runner-flatlined`
- `-09-agenda-still-picked-after-advance`
- `-10-end-the-run-notice` (cyan toast "Wall of Static: End the run")
- `-11-access-hq-large-card` · `-12-archives-twelve-cards` (QA-S3-1)

The team's screens (`docs/sprints/sprint-03-screens/`, Run, R&D steal, rez prompt, Wall of Static encounter, broken subroutine, trash, advance/score, Corp wins) were also looked at: clean.

## Owner checks for the demo
None required. Optional:
1. Play a few runs and say whether there are too many taps (Let it through / Done stops).
2. Late in a game, run on Archives on your phone and see whether the small cards bother you (QA-S3-1).
3. The Corp's 7-point win depends on drawing Priority Requisition in time; tell us if the Corp feels too weak.

## Files added by QA
- `apps/client/e2e/qa-sprint03.spec.ts`: hidden info through a run, two ICE outside-in, Enigma vs Gordian Blade, Archives with 4 and 12 cards, flatline with real taps, agenda stays picked, notices are toasts, taps behind the access cards do nothing, screenshots.
- `docs/sprints/sprint-03-qa/`: screenshots above.

## Second independent QA pass (same round, 73eec24)
A second scheduled run did its own QA round 1 at the same time: `docs/sprints/sprint-03-qa-pass2.md` (tests `apps/client/e2e/qa-sprint03-pass2.spec.ts`, `packages/engine/test/qa-sprint03-pass2.test.ts`; screenshots `docs/sprints/sprint-03-qa-pass2/`). It agreed on every rules criterion and found these further bugs:
- **QA-S3-3 (minor, feedback):** a run that gets into a server with nothing to access (a remote holding only ICE, or empty Archives) ends with no notice; the run panel just disappears. `board.ts` `RUN_END` has no text for `accessed` with nothing accessed. Known-failure test in `qa-sprint03-pass2.spec.ts` (`test.fail`).
- **QA-S3-4 (minor, readability, desktop):** long break buttons shrink to ~7 px text at 1280×800 (Enigma's "Break "The Runner loses 1 click, if able" · 1 credit"); run panel lines ~8–10 px. Phones fine.
- **QA-S3-5 = QA-S3-2 above** (seen at 6× slow-down: second tap made 494.6 ms after the first, 1 of 150). That pass counted it against S-03-6 AC2; together the two passes show it can fail both the loaded and the slowed check.
- **QA-S3-6 (test-only, low):** `turn.spec.ts` "a double tap on End turn ends only one turn" stays green with the guard removed (the second End turn only opens the Corp's hand-limit step). Not in the mutation job. Fix: also assert `phase === 'action'` and `pendingDiscard === 0`, and add it to `scripts/guard-mutation.mjs`.

## Round 2 (2026-11-13)

Verified at **34ab59a** (fixes in 024c12f, 489211d, 7dc4848, ad9ef03, 49cb721) plus QA's own test update below. QA did not write the fixes. Same machine (2 CPUs). The second report (`sprint-03-qa-pass2.md`) has a matching Round 2 section for QA-S3-3..QA-S3-6.

### Bugs

| Bug | Result | Evidence |
|---|---|---|
| QA-S3-1 late-game Archives shown as tiny cards | **FIXED, PASS** | `qa-sprint03.spec.ts` › "twelve cards in Archives are all shown, each at least 44px wide, clear of the buttons": the `test.fail` marker is gone (removed in 024c12f; QA checked no `test.fail` remains anywhere in `e2e/`), passes on phone, phone-small and desktop, in the full run. **Mutation check:** with the fix taken out (QA put the old one-row `accessSlots()` back in a throw-away copy), the test goes red on phone-small and desktop ("each Archives card at least 44px wide"), as in round 1. 12 cards now wrap into 2 rows on 640×360 and 3 rows on desktop with names readable. Unit test `accessSlots.test.ts` (1–17 cards, 3 sizes). Screenshots `sprint-03-qa/phone-640x360-r2-02-archives-twelve-cards.png`, `desktop-1280x800-r2-02-archives-twelve-cards.png`. |
| QA-S3-2 `guard-slow-frame.spec.ts` timed its second tap with a Node timer | **FIXED, PASS** | 489211d stamps both taps with the time they were made (`madeAt`) and adds a check that Chrome made the second tap within 2 ms of its stamp; every earlier assertion is kept (read). Loaded 10× run (below): `guard-slow-frame` 60/60 green; 6× slow-down: 60/60 green. The old failure ("second tap made 337 ms after the first") can no longer happen. **Mutation:** `npm run test:guard-mutation` exit 0; under all three broken guards its in-guard test is red on all 3 sizes and fails on the game's behaviour ("only one turn ends"), the control test stays green. |

### Criteria that failed or were re-checked

| Criterion | Round 1 | Round 2 | Evidence |
|---|---|---|---|
| S-03-6 AC1: guard tests pass every time on a busy machine, not loosened | FAIL | **PASS** | Guard tests (`qa-sprint01` ×2, `guard-slow-frame` ×2, `turn.spec` "a double tap on End turn ends only one turn") `--repeat-each=10 --retries=0` on phone, phone-small, desktop **while a second Playwright run of all `s03-*` and QA Sprint 3 specs loaded the machine** (separate port and output, as recommended in round 1): **150/150 passed, 0 skipped, 0 flaky** (11.4 min). Plus once in the full run. Not loosened (diffs read). |
| S-03-6 AC2: CPU slowed 6×, 10 runs, each test really tests a tap | PASS | **FAIL** (QA-S3-7, new) | `E2E_CPU_THROTTLE=6`, same 5 tests × 3 sizes × 10, `--retries=0`: **149 passed, 1 failed, 0 skipped** (15.0 min). The red one is **not** the fixed QA-S3-2 test: `qa-sprint01.spec.ts` › "after a 4-card discard, extra taps on the Confirm / End turn spot in the next 300ms do nothing" timed out on `phone` (repeat 2) because one of the 4 setup taps that pick the discards was not counted as a pick, so Confirm stayed dim and the test waited forever (trace screenshot: "Discard 1", 3 cards picked). A re-run of just that test 20× at 6× on 3 sizes: 60/60 green. So about 1 in 90 at 6×. The game's guard was never wrong; the test went red with the game working, which is exactly what S-03-6 is meant to stop. |
| S-03-6 AC3: breaking the guard makes the tests fail | PASS | **PASS** | `npm run test:guard-mutation`: exit 0, now 15 tests per run (turn.spec added, QA-S3-6). Baseline 15/15 green; each of the 3 breaks turns 12/15 red (every in-guard test on every size; the 3 "control" tests stay green by design). |

### QA-S3-7 (new, low, test-only but with a small game side): a quick tap on a very slow phone can be read as a hold
- **What happens:** "Hold a card to read it" is detected with a 350 ms page timer started when the finger goes down. If the page is stalled for longer than that between the finger going down and coming up (6× slowed CPU, a busy test machine, a slow phone), the timer fires first and the quick tap is treated as a hold, so the card is not picked.
- **Proof (QA experiment, phone 844×390):** in the discard picker, a 30 ms tap on a hand card (down and up stamped 30 ms apart) picks the card normally; the same tap with a 600 ms page stall between down and up does **not** pick it (picker stays "Discard 4"). Throw-away spec, not committed.
- **Steps to see the red test:** `cd apps/client && E2E_CPU_THROTTLE=6 npx playwright test e2e/qa-sprint01.spec.ts -g "after a 4-card discard" --project=phone --project=phone-small --project=desktop --repeat-each=30 --retries=0 --workers=2` (QA: 1 red in 90; the setup taps at line ~427 use `tap()`).
- **Suggested direction (team's call):** in `apps/client/src/input.ts` `attachPress`, judge a hold the same way the End turn guard judges taps, by when things were *made*: on release, if the release's event time is less than `longPress` after the press's event time, treat it as a tap (and close any zoom the late timer opened). That fixes the test and slow phones together. A test-only alternative is to make the 4 picks with stamped `sendTap` and assert each pick landed before going on, but that leaves the slow-phone case.
- **Owner impact:** small; only noticeable on a phone that freezes for over a third of a second mid-tap.

### Other checks (Round 2)

| Check | Result |
|---|---|
| `npm run lint` / `npm run typecheck` | PASS (exit 0), incl. QA's updated spec |
| `npm test` | PASS: **729** (ai 4, cards 24, engine 323, match 61, client 317) |
| `npm run build` | PASS (main bundle 457 kB, 141 kB gzipped) |
| Full e2e `CI=1 npx playwright test --retries=0` | PASS: **512 passed, 6 skipped, 0 failed, 0 flaky** (25.9 min). Skips: QA Sprint 2 upright check (2 projects), the sideways-only help-text check on desktop, and QA pass-2's screenshot walk (3 projects, only with `QA_SCREENS=1`). Screenshots rewritten by the run in `sprint-02-screens/` and `sprint-03-qa/` were restored with `git checkout`. |
| CI failure on 49cb721 (QA snappiness test) | FIXED by QA, see `sprint-03-qa-pass2.md` Round 2 |
| IP | PASS: no image files added; new screenshots show our own glyph art |

**Round 2 criterion count: 31 = 30 PASS, 1 FAIL (S-03-6 AC2, QA-S3-7).**

### Round 2 screenshots (`docs/sprints/sprint-03-qa/`)
- `phone-640x360-r2-02-archives-twelve-cards.png`, `desktop-1280x800-r2-02-archives-twelve-cards.png` (QA-S3-1 fixed: 2 / 3 rows, names readable)
- `phone-640x360-r2-01-enigma-vs-gordian-4-buttons.png`, `desktop-1280x800-r2-01-enigma-vs-gordian-4-buttons.png` (the crowded encounter after the QA-S3-4 fix; desktop buttons now readable)
