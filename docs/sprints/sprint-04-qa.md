# Sprint 4 — QA report

QA date: 2026-11-13 · Branch `sprint-04` · Code verified at **b8bc7a9**, QA tests added in **55e503a** · QA did not write the code under test.

**Summary: 20 acceptance criteria. 13 PASS, 0 FAIL, 7 OWNER CHECK (things only a real phone can show; every automated part of them passes).** One low-severity finding (QA-S4-1: the hand slide's zoom can take just over 0.1 s on a 6× slowed-down machine the first time each card is shown; at normal speed it is always well under). All checks green: lint, typecheck, 864 unit tests + 6 QA engine tests; full screen-test suite in CI on 55e503a (includes QA's new specs) **619 passed / 6 skipped / 0 failed / 0 flaky**; Android build run green with signature, package id, name, sideways lock and bundle checks; the released APK downloaded and inspected by QA.

"P" = Playwright test (projects `phone` 844×390 touch, `phone-small` 640×360 touch, `desktop` 1280×800 mouse, `android` = the app's own web bundle at 844×390). "E" = engine / match / client Vitest test. "QA" = test written by QA: `apps/client/e2e/qa-sprint04.spec.ts` (3 sizes), `apps/client/e2e/qa-sprint04-android.spec.ts` (app bundle, 844×390 and 640×360), `packages/engine/test/qa-sprint04.test.ts`. Screenshots: `docs/sprints/sprint-04-qa/` (QA) — names are `<project>-<size>-NN-<what>.png`.

## Acceptance criteria

### S-04-1 Install the game as an app on your phone

| Criterion (short) | Result | Evidence |
|---|---|---|
| Sprint/main build makes a new app file on the download page, with its date (automated) | **PASS** | Workflow `android` run 43454485788 on b8bc7a9: all steps green; log shows `overclock-sprint-04-20261113-1538.apk`, published to `releases/tag/app-sprint-04`. QA's push 55e503a triggered a new run: the release now reads **"OVERCLOCK app — sprint-04 — built 2026-11-13 15:56 UTC"**, prerelease, target 55e503a, asset `overclock-sprint-04-20261113-1556.apk` (checked via `gh api …/releases`). Release notes give plain install steps. Workflow triggers only on `main` and `sprint-NN` (read). |
| Install from the download page → **OVERCLOCK** icon in the apps | **OWNER CHECK** | Automated part PASS: CI `aapt2 dump badging` check (`package: name='app.overclock.game' versionCode='7'`, label OVERCLOCK enforced by the step's grep), APK has launcher icons in every density rendered from the team's own SVG (`apps/android/icon/foreground.svg`). The install itself needs the phone. |
| App fills the whole screen sideways, no browser bars, nothing under the notch / swipe bar | **OWNER CHECK** | Automated part PASS: `MainActivity` hides status + navigation bars on create, resume and focus, cutout mode `shortEdges` (read); SystemBars plugin `insetsHandling: css` in the APK's `capacitor.config.json`; `#safe-probe` takes the larger of `env()` and `--safe-area-inset-*` (read in the APK's `index.html`). P `s04-build-label`, `s04-back` with simulated notch insets: board and dialog inside the safe area. Whether the real WebView reports the notch is phone-only. |
| Turning the phone upright keeps the game sideways (no "Turn your phone sideways" in the app) | **OWNER CHECK** | Automated part PASS: CI orientation check (`screenOrientation=6`, sensorLandscape) passed on both runs; P `android.spec.ts` › "upright, the app still shows no rotate prompt"; QA grep of the APK bundle: no `Turn your phone` text and no `#rotate` element. |
| Installing a newer file updates in place | **OWNER CHECK** | Automated part PASS: every build is signed with the one committed key; CI pins its certificate (`Signer #1 certificate SHA-256 digest: 510531…aa99`, equal to `CERT_SHA256`); QA checked the keystore locally with `keytool` (same SHA-256, RSA 2048, valid to 2054). Same app id every build; versionCode = workflow run number, rising (7 → 8). |
| A small build date shows in a corner, matching the download page | **PASS** | APK downloaded by QA (asset 744179677, release "built 2026-11-13 15:38 UTC"): its bundle contains exactly `2026-11-13 15:38 UTC`. P `s04-build-label.spec.ts` (inside safe area, ≤ 24 px tall, clean layout on both turns, busy board, during a run; 3 sizes). QA "the build date in the corner …" (3 sizes). Screenshots `*-00-board-build-date.png`, `android-app-*-01-board.png` (date in the right rail). |

### S-04-2 The app behaves like a proper app

| Criterion (short) | Result | Evidence |
|---|---|---|
| Switch away and back: game exactly where it was, no blank cards | **OWNER CHECK** | Automated part PASS: P `s04-back.spec.ts` › "after a WebGL context loss and restore, the hand and the board are not blank" (pixel check, still playable). APK bundle wires the app `resume` event to a full redraw (QA grep: `addListener("resume",()=>l.redrawAll())`). Real background/resume is phone-only. |
| Back button: asks "Leave the game?" (Leave / Stay) (owner answer A) | **OWNER CHECK** | Automated part PASS: P `s04-back.spec.ts` (6 tests, 3 sizes: ask → Stay keeps the game unchanged, Back again / tap beside = Stay, Leave exits, zoom open → Back closes zoom only, game over → exits, dialog relaid out on resize). QA: Back during the Priority Requisition choice asks, Stay keeps the choice and it still works (`*-06-back-leave-dialog.png`). E `back.test.ts`. The APK bundle registers `backButton` (QA grep). Pressing the phone's own Back is phone-only (tech plan risk: Capacitor's inline bridge script vs our CSP — if Back does nothing on the phone, check this first). |
| Airplane mode: game works fully, no internet needed | **OWNER CHECK** | Automated part PASS: P `android.spec.ts` › zero requests to other sites, no CSP errors; "keeps running with the network switched off". QA `qa-sprint04-android.spec.ts`: taps, a hold and a slide in the app bundle at 844×390 and 640×360, zero requests leaving the app, no page errors. Only URLs in the APK bundle are non-fetched strings (pixijs.com in a comment/message, the SVG namespace). |
| The hidden test switches are not in the app (automated) | **PASS** | QA unzipped the released APK: `grep -r __overclock assets/public` finds nothing; `index.html` has no `#rotate`. CI step "web bundle inside the APK" (`check-android-bundle: OK (16 files)`). P `android.spec.ts` (`window.__overclock` undefined) and QA android spec (no loaded script contains `__overclock`). |
| Web demo link works as before (automated) | **PASS** | CI on 55e503a: `checks`, `build`, `deploy`, `guard-mutation` success; e2e 4 shards **619 passed, 6 skipped, 0 failed, 0 flaky** (shard logs: 156/154/155/154 passed). Same on b8bc7a9 (all green). |

### S-04-3 Hold a card and slide to read your whole hand

| Criterion (short) | Result | Evidence |
|---|---|---|
| Sliding moves the zoom to the next card and outlines it | **PASS** | P `s04-hand-slide.spec.ts` › "sliding moves the zoom…" (3 sizes, touch on phones). QA "crowded hand (9 cards): every card can be reached…" — every one of 9 overlapping cards on 640×360, finger alternately far above the hand (y ignored). Screenshot `*-01-slide-crowded-hand.png`, `android-app-*-02-hold-slide.png` (works in the app bundle too). |
| Past the first/last card the zoom stays on it | **PASS** | P "past the first or last card the zoom stays on it" (screen edges both ways). |
| Lifting closes the zoom; nothing played or spent (owner answer A) | **PASS** | P "lifting after a slide closes the zoom and picks or spends nothing" (whole view unchanged). QA "lifting over a server or End turn after sliding…": finger dragged over HQ and End turn and lifted there: nothing picked, view unchanged, and a quick tap right after still picks a card. |
| A quick tap still picks the card (automated) | **PASS** | P "a quick tap still picks the card to play"; QA test above. E `input.test.ts`. |
| The zoom changes in under 0.1 s (automated) | **PASS** (see QA-S4-1) | P "the zoom changes in under 0.1 seconds" (input time → swap). QA's stricter test measures input time → **the drawn frame** and checks the picture really changes. 10× repeat, normal speed: **60/60 pass**, to-frame max 41.7 ms (median 12 desktop, 28 phones). 10× at 6× CPU slow-down (stress, not part of the criterion): 55/60; see QA-S4-1. |

### S-04-4 Agendas' "when scored" bonuses

| Criterion (short) | Result | Evidence |
|---|---|---|
| Hostile Takeover scored: Corp +7 credits, 1 bad publicity shown by the Corp's credits | **PASS** | E `when-scored.test.ts` › AC1 group (events in card order, both views, stacking to 2, 7th point ends the game first). P `s04-bonuses.spec.ts` › "+7 … Bad publicity 1 by the Corp's credits, on both turns" (3 sizes). QA engine: scored with 0 credits → 7, clicks kept; QA e2e screenshot `*-03-bad-publicity-corp.png`. |
| Runner gets +1 per bad publicity for that run only ("+1 for this run"); left-overs vanish | **PASS** | E `bad-publicity.test.ts` (paid first, affordability, vanish at every kind of run end, 80-game property). P "a run shows "+1 for this run"…". QA engine: run credits can't pay for the run event that starts the run (Inside Job), 0 own credits + 2 bad publicity pays pump + break, left-overs never added on jack out. QA e2e `*-04-run-only-credits.png`; tag gone after the run. |
| Priority Requisition scored: tap a face-down ICE to rez it free, or Skip | **PASS** | E AC3 group (choice phase, wrong_phase / not_your_turn / bad_target, no window without face-down ICE = auto-pass, replay). P three tests (lit ICE + Skip + hint, rez free, Skip). QA engine: Runner view shows the wait but no ICE names until rezzed. QA e2e `*-05-free-rez-choice.png`. |
| Steal gives no bonus (automated) | **PASS** | E AC4 group (remote, HQ). QA engine: both Hostile Takeover and Priority Requisition stolen from R&D with The Maker's Eye (face-down ICE on the table): no credits, no bad publicity, no choice. |

Criterion count: S-04-1 ×6, S-04-2 ×5, S-04-3 ×5, S-04-4 ×4 = **20. Result: 13 PASS, 0 FAIL, 7 OWNER CHECK.**

## Bugs / findings

### QA-S4-1 (low, watch on a real phone): first zoom swap to a card can exceed 0.1 s on a slow machine
- **Steps:** `cd apps/client && E2E_CPU_THROTTLE=6 npx playwright test e2e/qa-sprint04.spec.ts e2e/s04-hand-slide.spec.ts -g "0.1 s|0.1 seconds" --project=phone --project=phone-small --project=desktop --repeat-each=10 --retries=0`
- **Expected:** every swap drawn < 100 ms after the finger moves.
- **Actual:** 55/60 pass. QA's to-frame test failed 4 times (phone 120.4, 101.9 ms; phone-small 128.0, 125.8 ms); the developers' handler test once (phone-small 103.7 ms). In every case it is the **first** swap to a card not yet zoomed in this hold (60–128 ms at 6×); swaps back to an already-drawn card stay 25–60 ms. At normal speed the same first swap takes 30–42 ms, so the criterion passes; the cost is drawing the zoom face on the fly.
- **Suggestion:** draw the zoom faces of the hand's cards while the hold timer runs (or right after the zoom opens), so a slide only swaps finished pictures. Owner: tell us if the slide feels sticky on your phone.

### Notes (not bugs)
- The CI "Check the APK" step prints only the first 5 lines of `aapt2 dump badging`, so the `application-label:'OVERCLOCK'` line is not visible in the log; it is still enforced (the step's grep would fail the job).
- `app-sprint-04-ui` prerelease (from a helper branch) is still on the Releases page; known, can't be deleted from team sessions. Use **app-sprint-04**.

## Snappiness and rules checks
- New animations on the skippable fx queue within budget: P checks `tag_pop` and `choice_open` scheduled ≤ 300 ms; free rez `ice_rez` + notice.
- Empty timing windows auto-pass: Priority Requisition opens no question when the Corp has no face-down ICE (E "no face-down ICE installed: no window, no event"); runs auto-pass using own + run-only credits (E). Liveness / hidden info / replay over 300 random games incl. the choice phase (E `sprint04-properties.test.ts`).
- Card names and text: real names allowed (owner decision 2026-11-12); Hostile Takeover / Priority Requisition text and numbers match the real cards (2/1, 5/3). Art: runtime-drawn; app icon from the team's own SVG; no raster files in the client (`ip-art-and-ui.test.ts` green). **No IP violation.**

## Checks run
- `npm run lint`, `npm run typecheck`, `npm test`: pass (864 unit tests: ai 6, cards 25, engine 385, match 104, client 344) + QA engine 6/6.
- Sprint 4 specs + QA specs locally, 4 projects: **81/81** passed (+ QA android spec 2/2), `--retries=0`.
- Timing specs only: 10× normal (60/60), 10× at 6× slow-down (55/60, QA-S4-1).
- Full suite: not re-run locally (docs/TESTING.md): CI e2e on 55e503a (contains QA's specs) green, 619 passed / 6 skipped / 0 failed / 0 flaky; b8bc7a9 also green.
- APK: workflow log (run 43454485788) and QA's own download + unzip of release asset 744179677.

## Owner checks at demo (on your Android phone)
1. Open the **app-sprint-04** release on the phone, tap the `.apk`, allow installs, install. **OVERCLOCK** shows with your apps, with our neon hexagon icon.
2. Open it: full screen sideways, no bars; nothing hidden under the camera or the bottom swipe bar.
3. Turn the phone upright: the game stays sideways.
4. The small date in the board's right-hand column matches the date in the release title.
5. Mid-game, switch to another app and back: game where you left it, no blank cards.
6. Press Back (or swipe back): "Leave the game?" — Stay keeps playing; Leave closes the app.
7. Airplane mode on, open the app: it plays normally.
8. Later, install a newer build over it: it updates without uninstalling.
9. Hold a hand card and slide: does the zoom keep up with your finger (QA-S4-1)?
