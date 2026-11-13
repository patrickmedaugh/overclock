# Sprint 3 — QA report, second independent pass

> Two scheduled runs did QA round 1 at the same time on 73eec24. The first report is `sprint-03-qa.md` (bugs QA-S3-1, QA-S3-2). This is the second pass; its bugs were renumbered QA-S3-3..QA-S3-6 so the ids don't clash. QA-S3-5 here is the same problem as QA-S3-2 there. Its tests and screenshots are `qa-sprint03-pass2.spec.ts`, `qa-sprint03-pass2.test.ts` and `sprint-03-qa-pass2/`.

QA date: 2026-11-12 · Branch `sprint-03` · **Round 1 verified at 73eec24** (team tip, CI green) plus QA's own tests (commits after it) · QA did not write the code under test. Owner defaults used: Q1 = A (Rez / Don't rez on the board), Q2 = A (Corp deck 17 cards / 9 points).

**Round 3 summary (2026-11-13, final, at 13ecbad): 31 of 31 acceptance criteria PASS (S-03-3 AC6 "clear enough to follow" is also an owner check at the demo), 0 FAIL, nothing carried over.** QA-S3-7 is fixed (ui-dev, 007a2d1), so S-03-6 AC2 (6× slowed) passes: 150/150. AC1 150/150 on a busy machine, AC3 mutation job still red for every broken guard. Full screen tests 536 passed / 6 skipped / 0 failed, no retries. Details in `sprint-03-qa.md` › Round 3 and "Round 3" at the end.

**Round 2 summary (2026-11-13, at 34ab59a + QA's test update): all four bugs from this report are fixed (QA-S3-3, QA-S3-4, QA-S3-5, QA-S3-6). Still 30 of 31 PASS, 1 FAIL: S-03-6 AC2 (6× slowed-down check) went red once in 150 runs, now for a different reason (QA-S3-7: a setup tap read as a "hold"; see `sprint-03-qa.md` Round 2). The CI failure on 49cb721 was QA's own test and is fixed. Full screen tests 512 passed / 6 skipped / 0 failed with no retries. Details in "Round 2" at the end.**

**Round 1 summary: 30 of 31 acceptance criteria PASS (one of them also needs an owner check at demo), 1 FAIL** (S-03-3 "each step is shown clearly enough to follow": the automated part passes, but whether it is clear enough is the owner's call). **The FAIL is S-03-6 AC2** (the slowed-down machine): 1 of 150 double-tap runs went red at 6× slow-down, because one of the two guard test files still times its second tap with the test machine's clock (QA-S3-5). **4 bugs found:** QA-S3-3 (minor: a run that gets into a server with nothing in it ends with no message at all), QA-S3-4 (minor, readability: long break buttons such as Enigma's "Break "The Runner loses 1 click, if able" · 1 credit" shrink to about 7-pixel text on a computer), QA-S3-5 (test-only, fails S-03-6 AC2: `guard-slow-frame.spec.ts` still times its second tap with the test machine's clock), QA-S3-6 (test-only, low: `turn.spec.ts` "a double tap on End turn ends only one turn" stays green when the guard is broken, and the mutation job doesn't cover it). The game rules themselves held up in every check QA ran. Lint, typecheck, unit tests, build and the team's full e2e all pass (e2e 431 passed / 3 intended skips, no retries). Snappiness budget met for every run step.

"P" = Playwright test (projects: `phone` 844×390 touch, `phone-small` 640×360 touch, `desktop` 1280×800 mouse). "E" = engine / match / cards Vitest test. "QA" = test written by QA: `apps/client/e2e/qa-sprint03-pass2.spec.ts` (situations found by QA's own game finder `e2e/qa-s03-scenarios.ts`, not the team's `planToStep`) and `packages/engine/test/qa-sprint03-pass2.test.ts`. Every QA e2e test passed on all three sizes (48/48 incl. the screenshot walk; QA-S3-3's bug test counts as an expected failure).

## Acceptance criteria

### S-03-1 Runner: run on a server and steal agendas

| Criterion (short) | Result | Evidence |
|---|---|---|
| Tap Run: every server lights; tap one starts the run, 1 click; tap Run again cancels, nothing spent | **PASS** | P `s03-runs.spec.ts` › "tapping Run lights every Corp server; tapping one starts the run and uses 1 click" (HQ, R&D, Archives, Server 1 lit, ≥ 44 px, click −1, credits same, snappy), "tapping Run again cancels: nothing is sent, nothing spent" (whole view unchanged; empty-board tap cancels too), "without clicks, Run says "No clicks left"". E `run.test.ts` › "S-03-1 AC1" group. Screenshots `*-01-runner-turn-run-button.png`, `*-02-run-servers-lit.png`. |
| No ICE: straight in; HQ = 1 random card, R&D = top card, Archives = all (face-down turn face up), remote = every card | **PASS** | P `s03-access.spec.ts` › HQ, R&D, Archives tests. **QA** `qa-sprint03-pass2` › "PAD Campaign in a remote…" (remote access in the UI, card drawn large "From Server 1"). E `run.test.ts` › "S-03-1 AC2" (HQ seeded pick, R&D top, Archives all face up for good, remote one at a time, empty remote, upgrade in a central server). Screenshots `*-03-access-rd-agenda-steal.png`, `*-05-access-hq-done.png`, `*-qa-01-remote-pad-campaign-trash-4.png`. |
| Steal: to the Runner's score area face up; both players see "Runner 2 points" | **PASS** | P `s03-access.spec.ts` › "R&D: the top card; an agenda offers only Steal…" (Runner and Corp seat both read "Runner 2 points"), "an agenda in Archives can be stolen: "Runner 1 point"". E `run.test.ts` › "S-03-1 AC3". **QA** engine random games: points always equal the agendas in the score areas on both views. Screenshot `*-04-runner-2-points.png`. |
| Asset/upgrade: "Trash · 4 credits" destroys it into Archives face up; Leave it puts it back | **PASS** | **QA** `qa-sprint03-pass2` › "PAD Campaign in a remote: "Trash · 4 credits" pays 4 and puts it face up in Archives for both players", "Leave it: PAD Campaign stays in its server, face down again for the Runner, nothing spent", "too few credits: Trash · 4 credits is dim and only says "Not enough credits"". P `s03-access.spec.ts` › "Trash · 3 credits" (Akitaro Watanabe), "Leave it puts the card back". E `run.test.ts` › "S-03-1 AC4". Screenshots `*-qa-01-…`, `*-qa-02-pad-campaign-trashed-to-archives.png`, `*-qa-03-pad-campaign-not-enough-credits.png`. |
| Operation / ICE in R&D or HQ: Done puts it back; hand and deck untouched | **PASS** | P `s03-access.spec.ts` › "HQ: … Done puts it back and the Corp's hand and deck are untouched" (hand, deck, Archives counts equal). E `run.test.ts` HQ test (hand exactly `['c01','c02','c04']` after), R&D test (deck order unchanged). |
| Jack out after passing ICE ends the run, nothing accessed; not before the first ICE | **PASS** | P `s03-runs.spec.ts` › "Don't rez: … Jack out ends the run with nothing accessed" (`run_ended jacked_out`). E `run.test.ts` › "S-03-1 AC6" (after an ICE, after the innermost, `wrong_phase` at approach/encounter/access). **QA** `qa-sprint03` Ninja test: no Jack out button at the first encounter; QA engine random games: Jack out is never legal at access, Continue/Jack out only after a piece of ICE. |
| Run ends: back on your turn with the clicks left, Corp's hidden cards hidden again; Runner side only receives names it accessed | **PASS** | P `s03-runs.spec.ts` › "a finished run leaves the Runner's turn as it was…", "Don't rez … Back on the Runner's turn with the clicks left". **QA** `qa-sprint03-pass2` › "Leave it…" (the left card is face down again, view JSON has no `c03`). E `hidden-info.test.ts` (60 games). **QA** `qa-sprint03-pass2.test.ts` › "hidden info, decision windows and the 7-point win hold at every step (150 games)": at every step of 150 random games (2,449 runs, 1,303 accesses, 220 rezzes) the Runner's view holds a Corp card id only for rezzed ICE, face-up Archives, score areas or the card being accessed right now, and its events only in public events or the current access. QA checked the test bites: making installed cards visible in `view.ts` turns it red at once. |

### S-03-2 Corp: advance and score agendas; 7 points wins

| Criterion (short) | Result | Evidence |
|---|---|---|
| Tap installed agenda: "Advance · 1 credit"; uses 1 click + 1 credit, adds a counter | **PASS** | P `s03-corp-score.spec.ts` › "tapping an installed agenda shows "Advance · 1 credit"…". **QA** `qa-sprint03-pass2` › "with 0 credits, Advance · 1 credit is dim and only says "Not enough credits"; nothing is spent", "tapping installed ICE or an asset as the Corp shows no Advance". E `advance-score.test.ts` › "S-03-2 AC1". Screenshot `*-12-corp-advance-1-credit.png`. |
| Counters on a face-down card: Runner sees the number, only the back | **PASS** | P `s03-corp-score.spec.ts` › "the Runner sees the counters on a face-down card, but only its back" (`counter`, `cardId: null`, view JSON has no id). E `advance-score.test.ts` › "AC2". |
| Enough counters: Score shows; no click; face up to the Corp's score area, points added | **PASS** | P `s03-corp-score.spec.ts` (Score next to Advance; clicks unchanged; "Corp N points"). E `advance-score.test.ts` › "S-03-2 AC3" (incl. 0 clicks). Screenshot `phone-844x390-13-corp-score-button.png`. |
| 7 points: game ends at once, "Corp wins" / "Runner wins", "7 agenda points" | **PASS** | P `s03-corp-score.spec.ts` › "scoring to 7 ends the game at once…", "stealing to 7…". E `advance-score.test.ts` › "S-03-2 AC4", `run.test.ts` steal-to-7. **QA** engine random games: whenever either side has ≥ 7 points the game is already over with that winner (58 points wins seen). Screenshot `*-14-runner-wins-7-points.png`. |
| Starter decks: 7 reachable by both sides (automated) | **PASS** | E `match/test/seven-points.test.ts` (seeds 1, 2, 12345, each side, real games through seat views, replayable). E `cards.test.ts` › "the Corp deck holds at least 7 agenda points (9)". Note for the demo: a Corp points win needs Priority Requisition, ~80% of seeds (DECISIONS). |

### S-03-3 ICE fights back: rez and subroutines

| Criterion (short) | Result | Evidence |
|---|---|---|
| Face-down ICE reached: "Rez [name] · [cost] credits?" / Don't rez (Q1 A); can't afford → skipped | **PASS** | P `s03-runs.spec.ts` › "reaching face-down ICE asks the Corp "Rez Enigma · 3 credits" / "Don't rez"…". **QA** `qa-sprint03-pass2` › "the Corp can't afford the rez: no question; the ICE is passed face down and the Runner decides" (events `run_started, ice_approached, ice_passed`, no Corp decision, Continue / Jack out). **QA** engine random games: the Corp is asked only for face-down ICE it can pay for, and then has exactly Rez and Don't rez. Screenshots `*-06-corp-rez-prompt.png`, `*-qa-04-corp-cannot-afford-rez-skipped.png`. |
| Don't rez: ICE stays face down, Runner moves on | **PASS** | P `s03-runs.spec.ts` › "Don't rez: the ICE stays face down, the Runner moves on…" (Corp credits same, "Passed face-down ICE"). E `run.test.ts`. Screenshot `*-07-dont-rez-continue-jack-out.png`. |
| Rez: face up for both (rest of the game), Corp pays | **PASS** | P `s03-runs.spec.ts` › "Rez: the Corp pays, the ICE flips face up…" (−3 credits). **QA** `qa-sprint03-pass2` › "rezzed ICE stays face up for both players on later turns" (Corp's next turn and the Runner's next turn; running there again goes straight to the encounter). |
| Let it through: End the run / lose 1 click / 3 net damage to the Heap | **PASS** | P `s03-encounter.spec.ts` › "Wall of Static let through…", "Enigma let through takes a click and ends the run". **QA** `qa-sprint03-pass2` › "Neural Katana let through: 3 net damage sends 3 random Grip cards face up to the Heap" (Grip −3, the 3 named cards on top of the Heap, Heap count on screen). E `encounter.test.ts` › "S-03-3 AC4/AC5" (seeded picks, "if able"). Screenshots `*-11-let-it-through-end-the-run-notice.png`, `*-qa-05-neural-katana-encounter.png`, `*-qa-06-neural-katana-3-net-damage.png`. |
| More net damage than cards: Corp wins at once ("Runner flatlined") | **PASS** | **QA** `qa-sprint03-pass2` › "Neural Katana against a Grip of fewer than 3 cards: the Corp wins at once, "Runner flatlined"" (UI game-over panel). E `encounter.test.ts` › "AC5", `run-cards.test.ts` Neural EMP vs empty Grip. Screenshot `*-qa-07-corp-wins-runner-flatlined.png`. |
| Run steps through each ICE outside-in, current ICE highlighted, clear enough to follow | **PASS (automated) / OWNER CHECK AT DEMO** | P `s03-runs.spec.ts` › "a run steps through each piece of ICE outside-in, highlighting the one met" (highlight = the ICE's box, then the server column). E `run.test.ts` › "AC6: several ICE are met outside-in". **QA** Gordian test walks two Enigmas outer then inner. Whether it is "clear enough to follow" is a judgement for the owner: QA found the tracker readable on both phones (`*-08…`, `*-10…`, `*-qa-10/11…`), but see QA-S3-3 (silent end) and QA-S3-4 (tiny button text on a computer). |

### S-03-4 Runner: break ICE with icebreakers

| Criterion (short) | Result | Evidence |
|---|---|---|
| Matching breaker: buttons with prices, e.g. "+1 strength · 1 credit", "Break "End the run" · 1 credit" | **PASS** | P `s03-encounter.spec.ts` › "a matching breaker shows its buttons with prices…" (Corroder). **QA** `qa-sprint03-pass2` › Ninja: "+5 strength · 3 credits", "Break "Do 3 net damage" · 1 credit"; Gordian Blade: "+1 strength · 1 credit" and one Break per Enigma subroutine. Screenshots `*-08-encounter-wall-of-static-break-dim.png`, `*-qa-08-ninja-vs-neural-katana.png`. |
| Weaker breaker: Break dimmed until raised; Corroder on Wall of Static = 2 credits | **PASS** | P `s03-encounter.spec.ts` › dim Break (`too_weak`), "a dim Break says "Raise strength first" and changes nothing", "Corroder on Wall of Static: 1 credit to raise, 1 to break" (−2 credits). **QA** Ninja: dim until +5, 4 credits in all. E `encounter.test.ts` › "AC1/AC2", "AC2/AC3". Screenshot `*-09-corroder-raised-break-lit.png`. |
| Break: crossed out, won't happen; all broken → ICE passed | **PASS** | P `s03-encounter.spec.ts` (subroutine `broken: true`, "Passed Wall of Static"). **QA** Ninja test (Katana's subroutine crossed out, Grip unchanged). E `encounter.test.ts` › "AC3: a broken subroutine does not fire…". Screenshots `*-10-subroutine-crossed-out-passed.png`, `*-qa-09-ninja-broke-katana.png`. |
| Wrong kind / no breaker: no break buttons, only Let it through | **PASS** | P `s03-encounter.spec.ts` › "a wrong-kind breaker shows no break buttons…", `s03-runs.spec.ts` Rez test (`['Let it through']`). E `encounter.test.ts` › "AC4". |
| Can't afford: only "Not enough credits", nothing changes | **PASS** | P `s03-encounter.spec.ts` › "can't afford to break…" (view equal, only the hint). E `encounter.test.ts` › "AC5". |
| Gordian Blade's raised strength lasts the run; Corroder's / Ninja's drop after each ICE (automated) | **PASS** | E `encounter.test.ts` › "AC6: Gordian Blade keeps raised strength…; Corroder/Ninja drop back after each ICE", "…drops back when the run ends by jack out too". **QA** `qa-sprint03-pass2` › "Gordian Blade's raised strength is still raised at the second code gate in the same run" (UI shows "Gordian Blade 3" at the second Enigma, both breaks lit without another raise); Ninja test: strength back to 0 after the Katana. Screenshots `*-qa-10-gordian-pumped-first-enigma.png`, `*-qa-11-gordian-still-3-at-second-enigma.png`. |

### S-03-5 The "Needs runs" cards come alive

| Criterion (short) | Result | Evidence |
|---|---|---|
| The Maker's Eye: run on R&D, access the top 3 one after another | **PASS** | P `s03-corp-score.spec.ts` › "The Maker's Eye: a run on R&D that accesses the top 3 cards one after another". E `run-cards.test.ts` › "S-03-5 AC1" (incl. steal card 1 then the original 2nd card, short R&D). Screenshot `*-15-makers-eye-first-of-3.png`. |
| Inside Job: pick a server; first rezzed ICE met is bypassed; unrezzed ICE doesn't count | **PASS** | P `s03-corp-score.spec.ts` › "Inside Job: pick a server; the first rezzed ICE met is bypassed…" (no subroutine fired, "Inside Job: ICE bypassed"). **QA** `qa-sprint03-pass2` › "Don't rez: the face-down ICE doesn't use up Inside Job's bypass" (`bypassPending` still true, tracker still says "Inside Job: next ICE bypassed"). E `run-cards.test.ts` › "S-03-5 AC2" (5 cases). |
| Neural EMP: after a run last turn, 1 net damage; otherwise "Only after the Runner made a run", nothing spent | **PASS** | P `s03-corp-score.spec.ts` › "Neural EMP before any run…" and the Inside Job test's second half (Grip −1, "1 net damage"). E `run-cards.test.ts` › "S-03-5 AC3" (two turns ago doesn't count, run event counts, empty Grip flatline). |
| No card says "Needs runs (coming soon)" (automated) | **PASS** | P `s03-corp-score.spec.ts` › "the chosen deals hold every card of both starter decks…" + four seed tests tapping every card. E `cards.test.ts` › "S-03-5 AC4", `run-cards.test.ts` › "S-03-5 AC4". QA: `grep -r "Needs runs" apps/client/src packages/*/src` finds nothing. |

### S-03-6 Make the End turn double-tap test sturdy

| Criterion (short) | Result | Evidence |
|---|---|---|
| Full screen tests 10× on one version: double-tap tests pass every time, checks not loosened | **PASS** | QA ran the guard tests (`qa-sprint01` "QA round 2: End turn double-tap guard" ×2, `guard-slow-frame` ×2, `turn.spec` "a double tap on End turn…") `--repeat-each=10 --retries=0 --workers=2` on phone, phone-small, desktop: **150/150 passed, 0 skipped** (6.1 min). Plus once more inside the full e2e run. Every `qa-sprint01` run recorded exactly 4 refused in-window End turn taps and an answered tap after the guard (60/60 runs). Checks are stricter than Sprint 2 (rerun loop gone, every tap's made-time asserted within 2 ms). Note: the full 434-test suite was run once, not 10 times (≈ 20 min per run on this 2-CPU machine); the 10 repeats ran under 2 parallel workers. See QA-S3-5: one in-guard test came within 31 ms of failing unthrottled (second tap made 269 ms after the first, limit 300). |
| 6× slower machine, 10 runs: every one actually tests a tap (none silently skip) | **FAIL** (QA-S3-5) | `E2E_CPU_THROTTLE=6`, same 5 tests × 3 sizes × 10: **149 passed, 1 failed, 0 skipped** (13.7 min). No test skipped silently, and the `qa-sprint01` tests tested 4 in-window taps in all 60 runs. But `guard-slow-frame.spec.ts` › "a second tap made inside the guard stays refused even when handled after it" failed on `phone` (repeat 1): "the second tap was made inside the 300ms guard: expected < 300, received 494.6". The test's precondition failed, so on that run it did not test the guard, and CI would have gone red with the game working fine (the very problem this story fixes). |
| Breaking the protection on purpose makes the tests fail | **PASS** (with QA-S3-6) | `npm run test:guard-mutation`: exit 0, "guard-mutation: ok (unbroken guard green; every broken guard red)". Baseline 12/12 green; each of the three breaks (guard 300→0 ms, judged by handling time, check removed) turned all 9 in-guard tests red on phone, phone-small and desktop (the 3 "control" tests stay green, as designed). With the check removed or judged by handling time, the tests fail on the behaviour itself ("tap made 50ms after the ending tap … accepted", a second turn ended); with 0 ms they fail on the guard-length check.. QA also checked by hand that `turn.spec.ts` "a double tap on End turn ends only one turn" stays green with the guard check removed (9/9 runs pass in a temporary copy with the check deleted) (QA-S3-6). |

Criterion count: S-03-1 ×7, S-03-2 ×5, S-03-3 ×6, S-03-4 ×6, S-03-5 ×4, S-03-6 ×3 = **31**. Result: **30 PASS (S-03-3 AC6 also an owner check at demo), 1 FAIL (S-03-6 AC2)**.

## Other required checks

| Check | Result | Evidence |
|---|---|---|
| `npm run lint` | PASS (exit 0) | at 73eec24 and with QA's files |
| `npm run typecheck` | PASS (exit 0) | same (covers `e2e/` via `tsconfig.node.json`) |
| `npm test` | PASS: **720** (ai 4, cards 24, engine 323 incl. QA's new test, match 61, client 308) | at 73eec24: ai 4, cards 24, engine 322, match 61, client 308 = 719; QA adds 1 engine test |
| `npm run build` | PASS | main bundle 456 kB (140 kB gzipped) |
| Full e2e `CI=1 npx playwright test --retries=0` | PASS | **431 passed, 3 skipped** (the intended ones: QA Sprint 2 upright check on 2 projects, one sideways-only hint test on desktop), 0 failed, 19.8 min, team tests only at 73eec24. QA's `qa-sprint03-pass2.spec.ts` separately: 48/48 (3 QA-S3-3 runs are expected failures). |
| Snappiness: taps < 100 ms | PASS | `expectSnappy` on every run tap in the team's s03 specs; **QA** "every run step answers within 100ms…" (+1 strength, Break, Continue tapped straight after each other without waiting for animations: state within 100 ms, next buttons already there), "the Corp rez prompt: Rez answers within 100ms and the Runner can act at once"; QA Ninja / PAD / Katana tests also call `expectSnappy`. |
| Snappiness: no animation blocks input > 600 ms | PASS | Every run animation is scheduled ≤ 300 ms (`ice_rez`, `sub_fired` 300, `clicks_lost` 260, `strength_pop` 220, `run_step` 200, `sub_broken` 180, `credit_pop` 300). The run notice ("Enigma: End the run", ~1.4 s) is a toast: QA tapped Run while it was still showing and the servers lit at once. |
| Empty timing windows auto-pass | PASS | **QA** `qa-sprint03-pass2.test.ts`: in 150 random games the Corp is only asked to rez when the ICE is face down and it can pay (then it has exactly Rez / Don't rez), approach never waits on the Runner, an encounter stop always has an unbroken subroutine and no pending Inside Job bypass, Continue only after a piece of ICE, an access stop always shows a card. `qa-no-empty-windows.test.ts` (250 games with runs) still passes. The deliberate single-button stops (Let it through with no breaker, Done) are what the criteria ask for. |
| Card art is our own; real names and text allowed | PASS | Owner rule 3 (2026-11-12) allows real names and text. `packages/cards/test/art.test.ts` passes (runtime glyph art only, no images/fonts). `git ls-files` shows no image files outside `docs/`. Every QA screenshot shows our neon glyphs and the "OC" back; no official logos or card pictures. The Sprint 3 card numbers QA checked (Corroder, Gordian Blade, Ninja, Wall of Static, Ice Wall, Enigma, Neural Katana, The Maker's Eye, Inside Job, Neural EMP, the agendas, PAD Campaign, Akitaro Watanabe) match the 2012 Core Set as far as QA knows. |
| Committed screenshots untouched by e2e | PASS after restore | The full e2e run rewrote 67 PNGs in `docs/sprints/sprint-02-qa/` and `sprint-02-screens/`; QA restored them with `git checkout`. QA's own Sprint 2 spec now writes only with `QA_SCREENS=1` (commit 203e27e); `s02-board.spec.ts` (team) still always writes `sprint-02-screens/` (see Observations). |

## Bugs found

### QA-S3-3 (minor, feedback): a run that gets into a server with nothing in it ends silently
- **What happens:** the Runner passes the last ICE and taps **Continue** into a server that holds only ICE (very common: the Corp often puts ICE in a new server first). The engine says the run was successful and ended (`run_successful`, `run_ended accessed`), but the screen shows no notice and no animation: the run panel just disappears and the hand comes back. Other run endings say why ("Jacked out", "Wall of Static: End the run", "Run ended"). The same happens for a run on an empty Archives.
- **Steps (any size):** `?seed=2`. Corp: install Wall of Static in a new server, keep 3+ credits, end the turn. Runner: install Corroder, Run → Server 1, Corp taps Rez, Runner taps "+1 strength · 1 credit", "Break "End the run" · 1 credit", then **Continue**. Fastest: the team's `wall_of_static_encounter` step (seed 2).
- **Evidence:** `qa-sprint03-pass2.spec.ts` › "QA-S3-3 … Continue into a server that holds only ICE: some notice says the run got in and found nothing" (marked `test.fail` on all three sizes; remove that line when fixed). QA's probe: anims after Continue = `[]`, `layout().hint` = null.
- **Likely area:** `apps/client/src/board.ts` `RUN_END` (only `jacked_out` and `ended_by_ice` have text) and `animateRunEvent` `run_ended` case: add a notice for `accessed` when nothing was accessed (e.g. "Server 1: nothing to access").

### QA-S3-4 (minor, readability): long break buttons shrink to unreadable text on a computer
- **What happens:** on desktop (1280×800) the run buttons share the narrow column next to the run panel. Enigma's first break button, **Break "The Runner loses 1 click, if able" · 1 credit**, wraps onto 5 lines of about 7-pixel text; "Break "Do 3 net damage" · 1 credit" and "+5 strength · 3 credits" are about 11 px. The run panel's lines (ICE strength, subroutines, "RUN ON HQ") are about 8–10 px too. Both phone sizes are fine (big buttons, readable).
- **Steps (desktop):** a run where Gordian Blade meets a rezzed Enigma (seed from QA's finder, `qa-sprint03` Gordian test), or any Enigma encounter with Gordian Blade installed.
- **Evidence:** `desktop-1280x800-qa-11-gordian-still-3-at-second-enigma.png`, `desktop-1280x800-qa-10-…`, `desktop-1280x800-qa-08-ninja-vs-neural-katana.png`. No automated check (the test hook doesn't report run-button text size; QA-S2-1 added `fontPx` for hints only).
- **Likely area:** `apps/client/src/layout.ts` desktop (column) run-button row widths and `board.ts` button label fit. Suggest wider buttons (the column has empty space on the right), two rows, or a shorter label (e.g. Break "Lose 1 click").

### QA-S3-5 (test-only, fails S-03-6 AC2): one guard test still times its second tap with the test machine's clock
- **What happens:** `apps/client/e2e/guard-slow-frame.spec.ts` sends the second tap after `setTimeout(secondMs)` in Node, with no `madeAt` stamp (only `qa-sprint01.spec.ts` was moved to timestamped taps). When the test machine is busy, the second tap is made later than planned. At 6× slow-down one run made it 494.6 ms after the first, so the test's own precondition ("made inside the 300ms guard") failed and the test went red although the game was fine. Unthrottled, the gap reached 269 ms in 30 runs (limit 300).
- **Repro:** `cd apps/client && E2E_CPU_THROTTLE=6 npx playwright test e2e/guard-slow-frame.spec.ts --project=phone --project=phone-small --project=desktop --repeat-each=10 --retries=0 --workers=2` (QA: 1 of 30 failed; gaps 66–495 ms).
- **Suggested direction:** stamp both taps with `sendTap(page, box, { touch: true, madeAt })` (first at t0, second at t0 + `secondMs`), sent once real time has passed the stamp, exactly as the `qa-sprint01` guard test does. The busy-page part (450 ms busy loop) stays.

### QA-S3-6 (test-only, low): `turn.spec.ts` "a double tap on End turn ends only one turn" does not catch a broken guard
- **What happens:** with the guard broken (guard 300 → 0 ms), this test still passes (QA: guard check deleted in a temporary copy, 9/9 runs green on phone, phone-small, desktop). It is not part of the mutation job (`guard-mutation.mjs` greps for "double-tap guard"), so nothing tells the team it checks less than its name says.
- **Why:** after the Runner's End turn, a second End turn by the Corp with 6 cards in HQ opens the hand-limit step, which leaves `activePlayer: 'corp'` and `turn: 3`, exactly what the test asserts.
- **Suggested direction:** also assert `phase === 'action'` and `pendingDiscard === 0` (as `guard-slow-frame` does), and add the test to the mutation job.

## Observations (not failures)
1. **Notices cover the run panel on phones.** On 640×360 the cyan notice (e.g. "Neural Katana: Do 3 net damage / 3 net damage", ~1.4 s) sits over the run panel's lines ("Next: Server 1", subroutines) while the Runner decides Continue / Jack out. It never blocks taps. The damage notice also says the damage twice. (`phone-640x360-qa-06-neural-katana-3-net-damage.png`)
2. **Stale notices in QA screenshots:** a few QA screenshots show a leftover notice ("Jacked out", "Ice Wall: End the run") from the setup moves replayed just before. That's an artifact of the fast setup, not something a player sees.
3. **Owner may find runs tap-heavy:** Let it through with no breaker, Done on every non-stealable card, and Continue after each ICE are all single-choice stops the criteria ask for. Worth asking at the demo (the proposal's risk note says so too).
4. **Known simplifications** (DECISIONS, for the demo notes): Akitaro Watanabe's rez discount isn't applied; only agendas can be advanced; emptied remotes stay on the table; the "can't afford, so no rez question" shortcut tells a watching Runner something about the ICE's cost (fine on one shared phone).
5. **Team e2e still rewrites committed screenshots:** `s02-board.spec.ts` writes `docs/sprints/sprint-02-screens/*.png` on every phone run (DECISIONS 2026-11-12 U6 notes it). Revert after full runs, or gate it like `s03-screens` (`SAVE_SCREENS=1`).

## Playthrough and screenshots (`docs/sprints/sprint-03-qa-pass2/`)

Generated by `apps/client/e2e/qa-sprint03-pass2.spec.ts` with `QA_SCREENS=1` (real taps: touch on phones, mouse on desktop), for `phone-844x390`, `phone-640x360` and `desktop-1280x800`:
- Main flow: `-01-runner-turn-run-button` · `-02-run-servers-lit` · `-03-access-rd-agenda-steal` · `-04-runner-2-points` · `-05-access-hq-done` · `-06-corp-rez-prompt` ("Rez Enigma · 3 credits" / "Don't rez") · `-07-dont-rez-continue-jack-out` · `-08-encounter-wall-of-static-break-dim` · `-09-corroder-raised-break-lit` · `-10-subroutine-crossed-out-passed` · `-11-let-it-through-end-the-run-notice` · `-12-corp-advance-1-credit` · `-13-corp-score-button` · `-14-runner-wins-7-points` · `-15-makers-eye-first-of-3`
- QA situations: `-qa-01-remote-pad-campaign-trash-4` · `-qa-02-pad-campaign-trashed-to-archives` · `-qa-03-pad-campaign-not-enough-credits` · `-qa-04-corp-cannot-afford-rez-skipped` · `-qa-05-neural-katana-encounter` · `-qa-06-neural-katana-3-net-damage` · `-qa-07-corp-wins-runner-flatlined` · `-qa-08-ninja-vs-neural-katana` · `-qa-09-ninja-broke-katana` · `-qa-10-gordian-pumped-first-enigma` · `-qa-11-gordian-still-3-at-second-enigma`

## Owner checks for the demo
1. **Can you follow a run?** Play one run past two pieces of ICE: is it clear which ICE you're meeting and what just happened (S-03-3 AC6)? Look out for QA-S3-3 (a run into an empty server ends with no message).
2. **Too many taps?** Let it through, Done and Continue are single-button stops. Tell us if a run feels slow.
3. On a computer, look at an Enigma encounter with Gordian Blade (QA-S3-4) and tell us if the small text bothers you.
4. The Corp can win on points only with Priority Requisition (3 points); in about 1 game in 5 it's buried too deep. Is the race to 7 fun as it is?

## Files added or changed by QA
- `apps/client/e2e/qa-sprint03-pass2.spec.ts`: QA's Sprint 3 e2e (remote access, rez skip, ICE stays rezzed, Neural Katana damage and flatline, Ninja, Gordian Blade, advance edge cases, Inside Job, snappiness, screenshot walk, QA-S3-3 known failure).
- `apps/client/e2e/qa-s03-scenarios.ts`: QA's game finder (seeded random games through `LocalMatch`, stops at a situation).
- `packages/engine/test/qa-sprint03-pass2.test.ts`: 150 random games with runs: hidden information, decision windows, points and the 7-point win.
- `apps/client/e2e/qa-sprint02.spec.ts`: screenshots only with `QA_SCREENS=1`.
- `docs/sprints/sprint-03-qa-pass2/`: screenshots above.

## Round 2 (2026-11-13)

Verified at **34ab59a** (fixes in 024c12f, 489211d, 7dc4848, ad9ef03, 49cb721) plus QA's test update below. QA did not write the fixes. QA-S3-1/QA-S3-2 and the new QA-S3-7 are written up in `sprint-03-qa.md` Round 2.

### QA's own test fixed first (CI red on 49cb721)
`qa-sprint03-pass2.spec.ts` › "QA snappiness: run steps › every run step answers within 100ms…" failed on all 3 sizes ("notice scheduled <= 600ms", got 1420). Cause: the QA-S3-3 fix now shows the toast "Nothing to access in Server 1" when Continue ends the run; a toast never blocks input, and the same file's rez-prompt test already left toasts out of the 600 ms rule. Change: toasts ('notice'/'hint') are left out of the 600 ms animation rule (every other animation still must be ≤ 600 ms and start < 100 ms; nothing else loosened); the Continue step must now show exactly the notice "Nothing to access in Server 1"; and **input is checked not to be blocked by the toast**: the very next tap (Run) is made while the toast is still showing (`tapAt` < toast end), is answered within 100 ms, and lights the servers. Stale comment replaced. 9/9 green on 3 sizes, and red on all 3 when the QA-S3-3 fix is taken out.

### Bugs

| Bug | Result | Evidence |
|---|---|---|
| QA-S3-3 a run with nothing to access ends silently | **FIXED, PASS** | `test.fail` removed (ad9ef03). QA tightened the test to check the words: "Continue into a server that holds only ICE…" now expects exactly `["Nothing to access in Server 1"]`, and QA added "a run on an empty Archives says "Nothing to access in Archives"" (real taps: Run → Archives at the start of the game). Both green on phone, phone-small, desktop. **Mutation:** with the fix taken out of `runText.ts` (throw-away copy), both tests and the snappiness test go red on all 3 sizes. Unit test `runText.test.ts` (runs that accessed cards stay quiet; jack out / ICE keep their notices). Screenshots `*-r2-01-nothing-to-access-server-1.png`, `*-r2-02-nothing-to-access-archives.png` (3 sizes). |
| QA-S3-4 long break buttons unreadable on desktop | **FIXED, PASS** | Fresh desktop screenshots: `desktop-1280x800-r2-05-gordian-pumped-first-enigma.png` (4 buttons incl. Break "The Runner loses 1 click, if able" · 1 credit, all on two to three lines of clearly readable text; panel lines readable, subroutines in a second column), `-r2-06-gordian-still-3-at-second-enigma.png`, `-r2-03-ninja-vs-neural-katana.png`, `-r2-04-ninja-broke-katana.png`. New team test `s03-run-readability.spec.ts`: desktop buttons and panel lines ≥ 12 px, phones not smaller than before; green on 3 sizes. **Mutation:** with the layout part of the fix taken out it goes red on desktop (first Break label 8.05 px, expected ≥ 12), so it really checks the bug. Phones unchanged. Note (not a bug): on desktop the run panel is now wider than the board column and sticks out left and right of it; it looks a little off-centre but covers nothing. |
| QA-S3-5 `guard-slow-frame.spec.ts` timed its second tap with the test machine's clock | **FIXED, PASS** | 489211d: both taps stamped with when they were made, plus a check the second was made within 2 ms of its stamp; no earlier assertion removed (diff read). At 6× slow-down its tests were **60/60 green** (round 1: 1 red at 494.6 ms); loaded 10×: 60/60. **Mutation (`npm run test:guard-mutation`, exit 0):** its in-guard test is red under all 3 broken guards on all 3 sizes, failing on the game's behaviour (a second turn ended); the control test stays green. |
| QA-S3-6 `turn.spec.ts` double-tap test passed with a broken guard | **FIXED, PASS** | 7dc4848: the second tap now really lands on the Corp's End turn inside the guard (stamped 120 ms after the first, delivered after the guard opens), and the test checks `phase === 'action'`, `pendingDiscard === 0`, Corp clicks 3. Added to the mutation job (15 tests per run now). **Mutation:** red on phone, phone-small, desktop under all 3 breaks: "guard 0 ms" fails the guard-length check, "judged by handling time" and "check removed" fail on the behaviour (`phase`, a second turn ended) — exactly what round 1 found missing. Green 30/30 in the loaded and 30/30 in the 6× runs. |

### Criteria re-checked

| Criterion | Round 1 | Round 2 | Evidence |
|---|---|---|---|
| S-03-6 AC1 (busy machine, 10×) | PASS | **PASS** | 5 guard tests × 3 sizes × 10, `--retries=0`, with a second Playwright run loading the machine: **150/150, 0 skipped, 0 flaky**. |
| S-03-6 AC2 (6× slower, 10×) | FAIL (QA-S3-5) | **FAIL** (QA-S3-7, new cause) | `E2E_CPU_THROTTLE=6`, same 150: **149 passed, 1 failed, 0 skipped**. QA-S3-5's test was green every time. The red one: `qa-sprint01.spec.ts` › "after a 4-card discard, extra taps on the Confirm / End turn spot…" on `phone` timed out because one of its 4 setup taps picking the discards was read as a hold, so Confirm stayed dim. Re-run of that test alone 20× × 3 sizes at 6×: 60/60. QA reproduced the cause on purpose: a 30 ms tap with a 600 ms page stall between finger down and up is not picked. Repro and suggested fix: `sprint-03-qa.md` › Round 2 › QA-S3-7. |
| S-03-6 AC3 (mutation) | PASS | **PASS** | `npm run test:guard-mutation` exit 0: baseline 15/15 green, each break 12/15 red (all in-guard tests, all sizes). |
| S-03-3 AC6 (clear enough to follow) | PASS / owner check | **PASS / owner check** | The silent end (QA-S3-3) and tiny desktop text (QA-S3-4) are fixed; whether a run is easy to follow is still the owner's call at the demo. |

### Other checks (Round 2)

| Check | Result |
|---|---|
| `npm run lint`, `npm run typecheck` | PASS (exit 0) |
| `npm test` | PASS: **729** (ai 4, cards 24, engine 323, match 61, client 317) |
| `npm run build` | PASS |
| Full e2e `CI=1 npx playwright test --retries=0` | PASS: **512 passed, 6 skipped, 0 failed, 0 flaky** (25.9 min); skips = the 3 intended ones + this file's screenshot walk ×3 (only with `QA_SCREENS=1`). Rewritten committed screenshots restored afterwards. |
| No `test.fail` left for fixed bugs | PASS (`grep test.fail apps/client/e2e` finds none) |
| Snappiness | PASS: run taps < 100 ms, step animations ≤ 600 ms, run-end toasts never block the next tap (QA snappiness tests) |
| Empty windows auto-pass, hidden info, IP | Unchanged since round 1, still green in `npm test` (incl. QA's 150-game engine test); new screenshots show only our own art |

**Round 2 criterion count: 31 = 30 PASS (S-03-3 AC6 also an owner check), 1 FAIL (S-03-6 AC2, QA-S3-7).**

### Files changed by QA in Round 2
- `apps/client/e2e/qa-sprint03-pass2.spec.ts`: snappiness test (toasts out of the 600 ms rule, notice text checked, next tap while the toast shows), QA-S3-3 test checks the words, new empty-Archives test, round-2 screenshots.
- `docs/sprints/sprint-03-qa-pass2/*-r2-*.png`, `docs/sprints/sprint-03-qa/*-r2-*.png`: new screenshots.
- This report and `sprint-03-qa.md` (Round 2 sections).

## Round 3 (2026-11-13, last round)

Verified at **13ecbad** (QA-S3-7 fix 007a2d1 by ui-dev; QA did not write it). Full evidence for QA-S3-7 is in `sprint-03-qa.md` › Round 3; this section records the criteria this report had open.

| Criterion | Round 2 | Round 3 | Evidence |
|---|---|---|---|
| S-03-6 AC1 (busy machine, 10×) | PASS | **PASS** | 5 guard tests × 3 sizes × 10, `--retries=0`, while a second Playwright run loaded the machine: **150/150, 0 skipped, 0 flaky**. |
| S-03-6 AC2 (6× slower, 10×) | FAIL (QA-S3-7) | **PASS** | `E2E_CPU_THROTTLE=6`, same 150: **150/150, 0 skipped, 0 flaky** (12.6 min). The round-2 red test ("after a 4-card discard, extra taps…") also ran 90 more times at 6×: 90/90. QA-S3-7 fixed: a 30 ms tap with a 600 or 1200 ms page freeze in the middle now picks the card (QA's own test `qa-sprint03-r3.spec.ts`, red on the old code). |
| S-03-6 AC3 (mutation) | PASS | **PASS** | `npm run test:guard-mutation` re-run with the fix: exit 0; baseline 0/15 red, each of the 3 breaks 12/15 red (all in-guard tests, all sizes). |
| S-03-3 AC6 (clear enough to follow) | PASS / owner check | **PASS / owner check** | Unchanged; still the owner's call at the demo. |

Other checks: lint, typecheck PASS; `npm test` **740** PASS; build PASS; full e2e `CI=1 --retries=0` **536 passed, 6 skipped, 0 failed, 0 flaky** (team 518 + 6 intended skips, QA's new spec 18); rewritten `sprint-02-screens/` restored. Bugs QA-S3-3..QA-S3-6 from this report stay fixed (their tests green in the full run).

**Round 3 criterion count: 31 = 31 PASS (S-03-3 AC6 also an owner check), 0 FAIL. Nothing carried over.**

Files changed by QA in Round 3: `apps/client/e2e/qa-sprint03-r3.spec.ts` (new), `docs/sprints/sprint-03-qa/*-r3-01-hold-zooms-in-discard-picker.png` (new, 3 sizes), this report and `sprint-03-qa.md`.
