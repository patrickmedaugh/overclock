# Sprint 5 — QA report

QA date: 2026-11-13 · Branch `sprint-05` · Code verified at **73984f6**, QA tests added in **e4d44e4**, **141d61b**, **c3957ce** (test time limit only) · QA did not write the code under test.

**Summary: 16 acceptance criteria. 15 PASS, 0 FAIL, 1 OWNER CHECK** (whether the carousel slide *feels* like flipping through cards can only be judged on a real phone; every automated part of it passes). No bugs found. QA-S4-1 (slow first zoom swap at 6× slow-down) is **fixed**: 150/150 timing runs at 6× slow-down, slowest 86 ms. All checks green: lint, typecheck, 988 unit tests + 2 QA engine tests; full screen-test suite in CI on c3957ce (includes QA's specs) **688 passed / 6 skipped / 0 failed / 0 flaky**; android build + publish green.

"P" = Playwright test (projects `phone` 844×390 touch, `phone-small` 640×360 touch, `desktop` 1280×800 mouse). "E" = engine / match / client / android Vitest test. "QA" = test written by QA: `apps/client/e2e/qa-sprint05.spec.ts` (3 sizes), `packages/engine/test/qa-sprint05.test.ts`. Screenshots: `docs/sprints/sprint-05-qa/` — names are `<project>-<size>-NN-<what>.png`.

## Acceptance criteria

### S-05-1 Read the cards you find on a run

| Criterion (short) | Result | Evidence |
|---|---|---|
| Hold a found card → it zooms big enough to read all its text; lift → same choices (Steal / Trash / Done) | **PASS** | P `s05-read-cards.spec.ts` › "a card found on a run zooms while held; lifting is back to Steal…" (R&D, then Steal still works). QA "Archives access with several cards…": all 6 cards of an Archives access held one by one on each size — zoom ≥ 60 % of the screen height, no text outside the card, buttons identical and the whole game view unchanged after each lift. QA "HQ run…": a Corp hand card held at access. Screenshot `*-01-access-hold-to-read.png`. |
| After the run, tap **Last run** (right side) → the cards show again; hold any to read it | **PASS** | P `s05-last-run.spec.ts` (button on the right half, ≥ 44 px, inside the safe area; strip shows the cards in access order; hold zooms; tap outside / Back / button again closes it; strip does not cover Last run, End turn or the hand). QA: Last run after the Archives run lists exactly the 6 accessed cards, each on screen and readable when held (`*-02-last-run-strip.png`, `*-03-last-run-hold.png`); after an HQ run it lists the HQ card. QA: starting another run hides Last run (button and strip) for the whole run. |
| Runner's turn ends → **Last run** goes away (Corp's hand cards don't stay on show) | **PASS** | P "after End turn it is gone, and the Corp seat never shows it". QA "HQ run…": after End turn the Corp seat has no button, no strip, `lastRun` null (`*-04-corp-seat-no-last-run.png`), and the Runner's *next* turn starts without it. E `sprint05-last-run.test.ts` (cleared at Runner turn end, also after a hand-size discard; Corp always null). QA engine: over 80 random games, the Runner's Last run always equals the cards accessed since the latest run start (rebuilt independently from the event stream), null during runs and after the Runner's turn end; the Corp's view never has one (≥ 200 shown, ≥ 50 cleared). |
| Hold a stolen agenda or a face-up Archives card → zooms like a hand card | **PASS** | P `s05-read-cards.spec.ts` › stolen agenda via the Runner's score (Corp's 0-point score does not zoom); face-up Archives card zooms, face-down one does not, a quick tap does nothing; hold never changes the game. |

### S-05-2 Say what the ICE does before and after you let it fire

| Criterion (short) | Result | Evidence |
|---|---|---|
| Button says what will happen ("Let it fire: run ends" / "…: take 3 damage"), no longer "Let it through" | **PASS** | P `s05-ice-says.spec.ts`: Enigma "Let it fire: lose 1 click, run ends", Neural Katana "Let it fire: take 3 damage", fatal Katana "Let it fire: take 3 damage, you flatline (Corp wins)". QA: Wall of Static "Let it fire: run ends", no "Let it through" button, all buttons inside the safe area on all 3 sizes (`*-05-let-it-fire-label.png`, `*-07-enigma-label.png`). E `sprint05-let-fire.test.ts` incl. a 150-game property test: the preview equals what `pass` really does at every Runner encounter and is always present when `pass` is offered against rezzed ICE (so the old "Let it through" fallback is never shown); the Corp never gets it; computing it changes nothing (state, RNG). E `runText.test.ts` (labels incl. "Continue", 0-size outcomes skipped). |
| After it fires, a message names the ICE and what it did; if the run ends it says so | **PASS** | P: "Enigma: you lost 1 click. Enigma ended your run.", "Neural Katana: you took 3 damage." (run goes on), "Neural Katana: you took 3 damage. You flatlined: the Corp wins." QA: "Wall of Static ended your run." (`*-06-ice-report.png`), Enigma and Katana messages on screen inside the safe area on all sizes (`*-08-enigma-report.png`, `*-09-katana-report.png`); after Katana's message the run carries on and its buttons work. E `sprint05-subroutine-resolved.test.ts`; QA engine: `subroutine_resolved` comes before `run_ended(ended_by_ice)`. |
| The message stays until you tap anywhere (owner answer A) | **PASS** | P: still there after 3.3 s. QA: checked every second for 5 s on all sizes, then closed by a tap. Back closes it too (P). On a flatline the game-over screen waits until the message is tapped away (P). |
| Tap → the game carries on straight away; nothing else makes you wait (automated) | **PASS** | P: the closing tap (on End turn) changes nothing; the next tap (+1 credit) passes the snappiness check (`expectSnappy`). QA: the closing tap lands on a playable hand card and picks nothing; the next tap picks it, lit on screen well under 0.1 s after the game handled it (all sizes). Sprint 3 QA snappiness spec (updated, see below) passes. |

### S-05-3 Hand carousel (owner answer A)

| Criterion (short) | Result | Evidence |
|---|---|---|
| Hold a hand card → the cards either side show smaller behind the zoomed card | **PASS** | P `s05-carousel.spec.ts` › "holding a hand card shows its neighbours…" (up to 2 each side, correct cards, smaller, further = smaller, partly visible beside the zoom, real faces drawn ahead, pixel check that they are on screen). QA screenshots `*-10-carousel.png` (all 3 sizes). |
| Slide → zoom moves on and the cards behind slide past, like flipping | **OWNER CHECK** | Automated part PASS: P "sliding moves the zoom on and the cards behind slide past with it" (with frames pinned fast: a slide animation ≤ 120 ms is started, the old card becomes the left neighbour, right neighbours move in and grow). QA mid-slide screenshot `*-11-carousel-sliding.png` shows the neighbours part-way. Note: by design the slide only animates when the phone draws frames quickly; on a slow frame the cards jump straight to their place (DECISIONS 2026-11-13). Whether it *feels* smooth needs your phone. |
| At the first / last card, the zoom stays on it | **PASS** | P "at the first or last card the zoom stays on it and only the cards that exist show" (finger to both screen edges). |
| Lift → zoom closes, nothing played or spent | **PASS** | P "lifting the finger closes the zoom and the carousel, with nothing played or spent" (whole view unchanged). QA timing test 2 also checks nothing is picked after a long back-and-forth slide. Sprint 4 QA "lifting over a server or End turn…" still passes. |
| Quick tap still picks the card (automated) | **PASS** | P "a quick tap on a hand card still picks it" (no zoom, card picked). |
| Slow phone: the zoom moves to the next card in under 0.1 s (automated, incl. the 6× Sprint 4 QA test) | **PASS** | Measured from the finger's move to the **frame on screen**. 10 repeats × 3 sizes at **6× CPU slow-down**, one test at a time: **150/150 pass**; slowest 86.4 ms; medians 40–46 ms phones, 21–26 ms desktop. Specs: dev `s05-carousel-timing` (30/30, max 86.4), Sprint 4 QA "zoom face on screen within 0.1 s" (30/30, max 80.1 — failed 5/60 in Sprint 4, QA-S4-1 now fixed), Sprint 4 `s04-hand-slide` "under 0.1 seconds" (30/30, max 48.9), QA "slide the moment the zoom opens" (no waiting for the pre-draw; 30/30, max 85.0, every face drawn ahead), QA "with the slide animation on, quick back-and-forth" (30/30, max 68.9). See the note on the 2-at-a-time run below. |

### S-05-4 App downloads that never go missing

| Criterion (short) | Result | Evidence |
|---|---|---|
| Two quick updates in a row → **app-sprint-05** always has an app file (automated) | **PASS** | E `apps/android/test/publish-release.test.mjs` (13 tests, in `npm test`): upload first → move tag → edit → delete old; a stop after any step leaves an APK; "two quick builds" ends with only the newest APK and always had one. QA mutation check: moving the upload after the delete makes 4 tests fail. **Real run:** QA pushed e4d44e4 and 141d61b 25 s apart: the first android build was cancelled (as designed, it touches nothing public), the second published (run 43502700433, log: `release view` → `upload --clobber` → tag PATCH to 141d61b → `release edit` → `delete-asset …1924-b13.1.apk` → "updated"). QA polled the release every 5 s for ~7.5 min during both runs: 91 samples, never without an APK (old file until 20:35:53, then the new one). Now: exactly one asset `overclock-sprint-05-20261113-2034-b15.1.apk`, prerelease, tag `app-sprint-05` at 141d61b. Earlier run on 73984f6 (43491762804) took the same update path; QA's third push c3957ce (run 43505470190) published again: one asset `overclock-sprint-05-20261113-2052-b16.1.apk`, tag at c3957ce. |
| GitHub trouble publishing → the build shows as failed, never silently (automated) | **PASS** | `publish-release.mjs`: every `gh` call checked, any non-zero exit throws and the script exits 1 with `::error::`; only "release not found" leads to create, any other `release view` error fails. No `|| true` or `2>/dev/null` in the script or the publish job (grep; the two `|| true` in `android.yml` are in the build job's SDK licence step and a diagnostic grep that still `exit 1`s). E tests: view error, upload / tag / edit / delete errors each fail. QA mutation check: ignoring `gh` exit codes makes 5 tests fail. Publish job has `cancel-in-progress: false`. |

Criterion count: S-05-1 ×4, S-05-2 ×4, S-05-3 ×6, S-05-4 ×2 = **16. Result: 15 PASS, 0 FAIL, 1 OWNER CHECK.**

## Bugs / findings

No bugs (no QA-S5-n issued).

### Notes (not bugs)
- **Timing under CPU contention:** QA's first 6× run used 2 test browsers at once on a 2-core machine: 123/150 passed, with occasional single spikes of 100–300 ms in all five timing specs (including Sprint 4's, which did not change). Re-run one at a time (the normal way to measure): 150/150. The spikes come from two slowed-down browsers sharing two cores, not from the game; recorded so nobody is surprised.
- The release's `target_commitish` field on GitHub still says 60e557f (the commit the release was first created at); the **tag** is moved to each new build (now 141d61b), which is what the Releases page links to. Harmless.
- If a subroutine does nothing and the other one is broken (e.g. Enigma with "End the run" broken and no clicks left), the button reads "Let it fire: nothing happens" and the message "Enigma: nothing happened." Correct, just a rare wording.
- "Continue" (every subroutine broken) is unit-tested only: the engine passes the ICE automatically then, so the button never shows (an empty timing window, auto-passed).

## Review of the developers' changes to QA-owned specs
- `qa-sprint03.spec.ts`: "Let it through" labels → the exact new labels ("Let it fire: lose 1 click, run ends", "Let it fire: run ends") or `/^Let it fire/`; flatline tests tap the message away before the game-over check. The Sprint 3 "notice is a toast that covers no button and the next tap answers at once" test is rewritten to the owner's Q2 A behaviour: message stays, the first tap only closes it, the next tap on Run lights the servers at once. The old "covers no button" check is replaced by "inside the safe area" — right, since the message is now meant to sit over the board until tapped. **Agree: intent kept.**
- `qa-sprint03-pass2.spec.ts`: same label changes; the snappiness test now expects an `ice_report` instead of a `notice`, still checks every step animation ≤ 600 ms and that Run answers in the same tap after the message is closed. The trash test now allows the trashed card's id only inside `lastRun` (and checks it is there); everything else in the view must still not name it. **Agree.**
- `qa-sprint04.spec.ts`: only adds `Let it fire` to the run-finishing regex. **Agree.**
- Engine `qa-sprint03-pass2.test.ts` and shared `hidden.ts`: `subroutine_resolved` is allowed only when its ICE is installed, rezzed and has that card id; `lastRun` must equal the engine's record exactly, only between runs; `letFire` may name only the current, rezzed ICE. Every other event and field is checked as before. Minor: the QA list does not repeat `hidden.ts`'s extra check that the outcome names no Corp card; outcomes only carry `op` and amounts, so nothing is lost. **Agree.**

## Snappiness and rules checks
- Message waiting for a tap is a player decision point, not an animation (DECISIONS 2026-11-13); it blocks nothing after the tap (P + QA). Carousel slide ≤ 120 ms and never holds up the next move (QA quick back-and-forth at 6×: max 68.9 ms).
- Empty timing windows auto-pass: all subroutines broken → ICE passed with no button (E, P note); unchanged Sprint 3/4 auto-pass tests green (`qa-no-empty-windows.test.ts`).
- Card names and text: real names allowed (owner decision 2026-11-12); no new cards this sprint. Art: runtime-drawn (`ip-art-and-ui.test.ts` green). **No IP violation.**

## Checks run
- `npm run lint`, `npm run typecheck`, `npm test` on 73984f6: pass — 988 unit tests (ai 6, cards 25, engine 417, android 13, match 160, client 367) + QA engine 2/2.
- QA spec locally, 3 sizes: 21/21, `--retries=0`.
- Timing (S-05-3 only): 10× at 6× slow-down, 5 specs × 3 sizes, one at a time: 150/150 (see above).
- Full suite: not re-run locally (docs/TESTING.md); CI on the QA commits — 141d61b: shards 2–4 green, shard 1 red only because QA's own Archives test hit the 30 s test limit on CI's slower runner (it does 12 holds; 172 others passed). Fixed in c3957ce (time limit 90 s; no check changed). **CI on c3957ce: all green** — e2e 4/4 shards **688 passed / 6 skipped / 0 failed / 0 flaky** (173/172/172/171), checks, guard-mutation, build, deploy success.
- Developers' CI on 73984f6: all green (e2e 4/4 shards, checks, guard-mutation, build, deploy, android build + publish).

## Owner checks at demo (on your Android phone)
1. Hold a card in your hand and slide slowly left and right: do the cards behind slide past smoothly, like flipping through a hand? (If they jump instead of slide, your phone drew a slow frame; tell us.)
2. Run Archives once it has a few cards, hold each found card to read it, then tap **Last run** and hold them again.
3. Let a piece of ICE fire: is the button's wording clear, and does the message stay until you tap?
4. Releases page: **app-sprint-05** has one app file; it installs over your Sprint 4 app.
