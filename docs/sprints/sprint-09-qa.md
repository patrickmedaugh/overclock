# Sprint 9: QA report

QA date: 2026-11-16 · Branch `sprint-09` · Code checked at **b0296fb** (the last code commit; 1bd89f9 after it only changes `docs/STATE.md`). QA did not write the code it checked. S-09-5 was dropped by the owner and is not checked.

**Summary: 25 acceptance criteria (S-09-1..4). 25 PASS, 0 FAIL.** QA found **2 low-severity screen problems** (QA-S9-1, QA-S9-2). Neither changes the rules or blocks play. No hidden card leaked in any check.

**What CI checked on b0296fb** (as `docs/TESTING.md` allows, this is the full-suite evidence; QA did not re-run the whole screen-test suite):
- `checks` passed: lint, typecheck, **1979 unit tests**.
- Full screen-test suite, all 4 parts: **1143 passed / 6 skipped / 0 failed** (parts: 285 / 286 / 287 / 285).
- `guard-mutation`, `android`, `deploy`, `server` passed.
- 1bd89f9 (STATE only) also passed `checks` and all 4 e2e parts.
- The "Workers Builds: overclock" check is ignored, as instructed (the owner's own Cloudflare connection).

QA's own tests (added in the QA commit, no product code changed) were run locally: lint and typecheck clean, all unit tests pass (**2041**), and QA's screen tests pass on all three sizes (18/18). CI's result on the QA commit is recorded at the end.

**How to read the Evidence column**

| Label | Meaning |
|---|---|
| P | A developer's screen test (Playwright) |
| E | A developer's unit test (Vitest) |
| QA | A test written by QA |

Sizes: `phone` 844×390 touch · `phone-small` 640×360 touch · `desktop` 1280×800 mouse.

**QA's tests:**
- `packages/engine/test/qa-sprint09.test.ts` (28 tests): QA's own table of the 4 new cards (2012 numbers and wording), QA's own deck arithmetic, rule edge cases on hand-built boards, and a **sweep of 120 random core-deck games (12,199 actions)** checked against QA's own bookkeeping: 288 traces (184 Corp bid screens, 79 Runner bid screens, 104 + 209 automatic 0 bids, 37 ties, 223 successes), 12 tags removed, 23 resources trashed for tags, 7 Private Security Force uses (4 of them flatlines on an empty Grip), 46 SEA Source traces. Hidden-information checks after every action.
- `packages/match/test/qa-sprint09.test.ts` (34 tests): longer real play from the planner's goals (seeds 3, 25, 60, 12345) through both seats, pass-the-phone **and** online rules; every update checked for leaks and for both seats getting the same trace/tag events.
- `apps/client/e2e/qa-sprint09.spec.ts` (6 tests × 3 sizes, real taps): uses the board `qa-sprint09-sea-runner-broke.json` (found by QA's random play; the match test checks it is still exactly that game).

Screenshots: `docs/sprints/sprint-09-qa/<size>-NN-<what>.png`. Every new tap in QA's screen tests was timed: the game changed **< 100 ms** after it handled the tap, and no blocking animation was longer than 600 ms (checked in the test, not by eye).

## Acceptance criteria

### S-09-1 Traces with Hunter

| Criterion (short) | Result | Evidence |
|---|---|---|
| Hunter fires: Corp's screen "Trace 3: add credits?", −/+ with Max, the total updates (3 + bid), **Bid** | **PASS** | QA e2e seed 3, real taps: "Trace 3: add credits?", the number starts at 0, "strength 3"; − at 0 stays 0; Max jumps to all 5 credits ("strength 8"); − steps down to 3 ("strength 6"); the button reads "Bid 3" (`*-02-hunter-corp-bid`). P `s09-cards`. |
| Corp bid 2 (strength 5): Runner sees "Trace strength 5 · your link 1 · spend 4 to stop it", picks his bid, taps Bid | **PASS** | QA e2e with other numbers: "Trace strength 6 · your link 1 · spend 5 to stop it" (`*-04`); the caption flips "link 5 · short" → "link 6 · escape" at the right bid. The exact "strength 5 … spend 4" text: P `s09-cards`, `s09-online`. |
| Result names both totals; both players' credits go down by their bids | **PASS** | QA e2e: Runner's report "Hunter: trace 6 vs link 5: you got 1 tag."; Corp −3, Runner −4 (`*-05`). Corp's screen: "SEA Source: trace 4 vs link 1: Runner tagged" (`*-09`). QA sweep: every bid paid exactly, right before its `trace_bid`. *Note:* on the Runner's own screen the words are "you got 1 tag" / "you escaped" rather than "Runner tagged" (the proposal's example); QA finds that clearer. |
| Tie (link + bid = strength): trace fails, no tag (automated) | **PASS** | QA engine: ties at strength 3, 4, 5, 6 all fail; one credit less always tags. QA sweep: 37 ties, all failed; `success ⇔ strength > link + bid` on all 288 traces. E `sprint09-trace`. |
| Pass-the-phone: cover hands the phone to the Corp, then back; no hand seen | **PASS** | QA e2e (cover on): "Pass to the Corp" cover (`*-01`), no hand on screen while the Corp bids, "Pass back" cover (`*-03`), then the Runner bids. P `s09-cards`. |
| 0 credits: the game bids 0 straight away, no hand-off (automated) | **PASS** | Corp at 0: P/E (dev). **Runner at 0 (QA's gap check):** QA e2e seed 25, SEA Source with the Runner at 0 credits: the Corp bids and the result shows at once, **no cover**, no Runner bid screen, toast "Runner bid 0" (`*-08`, `*-09`). QA engine: Runner at 0 in a run never gets a window; both at 0 resolves inside the let-it-fire tap. Also skipped when the bid cannot matter (hopeless Runner, link already ≥ strength). |
| Online: Corp bids on its device ("Corp is choosing its trace bid…" for the Runner), then the Runner; same result as pass-the-phone (automated) | **PASS** | QA e2e online seed 42: the Runner's phone shows "Corp is choosing its trace bid…" with no buttons (`*-15`); the Corp taps Max (`*-16`); the hopeless Runner is never asked; both phones equal a `LocalMatch` with the same moves; no Corp hand or face-down name in any frame the Runner's phone got. P `s09-online`. |
| 640×360: numbers readable, buttons easy to tap | **PASS** | QA e2e on all sizes: −, +, Max, Bid each ≥ 44 px, inside the screen, apart from each other and from the number; number ≥ 20 px, caption and labels ≥ 10 px (`phone-small-02`, `-04`, `-08`). *Owner check below.* |

### S-09-2 Tags

| Criterion (short) | Result | Evidence |
|---|---|---|
| "Tagged 1" by the Runner's credits on both screens | **PASS** | QA e2e: on the Runner's screen (`*-05`, `*-06`) and the Corp's (`*-09`, `*-12`). QA match: both seats always show the same tags and link. |
| Tagged, Armitage installed: Corp taps it → **Trash · 1 click + 2 credits** → Heap, with a message | **PASS** | P `s09-cards` (real tap, "Corp trashed Armitage Codebusting (Runner tagged)"), P `s09-online`. QA engine: −1 click −2 credits, the hosted credits go with it, the tag stays, only resources (not programs/hardware) get the button; trashing Access to Globalsec lowers link. QA sweep: 23 trashes, all resources, all while tagged. |
| Not tagged: no trash button (automated) | **PASS** | QA e2e: an untagged Runner's Access to Globalsec, tapped by the Corp: no Trash button (`*-14`). QA engine + sweep: no Corp option on any rig card while untagged. |
| Runner taps the marker: **Remove 1 tag · 1 click + 2 credits**, count −1; **dimmed with the reason** without credits / clicks | **PASS** | QA e2e seed 7: real taps remove the tag, marker goes. **Dimmed (QA's gap check):** after Hunter left him with 1 credit: dim, "Not enough credits", a tap changes nothing (`*-06`); after spending his clicks: dim, "No clicks left" (`*-07`). QA engine: also refused during a run. |
| Tags stay until removed (automated) | **PASS** | QA engine: 2 tags through 6 turns. QA match: 3 rounds × 4 seeds × both modes. |
| Online: trash / remove same as pass-the-phone (automated) | **PASS** | P `s09-online` (both), E `sprint09-parity`; QA match in online rules. |

### S-09-3 Private Security Force

| Criterion (short) | Result | Evidence |
|---|---|---|
| Scored + tagged: tap it → **Do 1 meat damage · 1 click** → 1 random Grip card to the Heap, message names it | **PASS** | QA e2e seed 3: the button (`*-10`); each tap's toast is "1 meat damage: <that card's name> to the Heap" and the card is on top of the Heap. |
| Works again once per click | **PASS** | QA e2e: 3 uses, then dim "No clicks left" (`*-11`). QA engine: the three lost cards are from his Grip, 3 clicks used. |
| Not tagged: dimmed "Runner isn't tagged" | **PASS** | **QA's gap check, real play:** the Runner removed his tag on his turn; on the Corp's next turn the button is dim with "Runner isn't tagged" and a tap only shows that hint (`*-13`). |
| Empty Grip + meat damage: flatline, Corp wins (automated) | **PASS** | **QA's gap check, real play:** 3 uses, a quiet Runner turn, 3 more: the 3rd hits an empty Grip → "Corp wins · Runner flatlined" (`*-12`). QA match (4 seeds × 2 modes), QA engine (1-card Grip lives, next use flatlines), QA sweep (4 flatlines). |
| Online: both devices show the same lost card face up in the Heap (automated) | **PASS** | P `s09-online`; QA match online mode: both seats' Heaps equal after every use. |

### S-09-4 Ichi 1.0, SEA Source, Access to Globalsec, deck changes

| Criterion (short) | Result | Evidence |
|---|---|---|
| Ichi: Corp picks a program twice (Construct can save one), then Trace 1: tag + brain damage | **PASS** | P `s09-cards` (seed 11, Construct save, then the trace report); E `sprint09-sea-ichi`. QA engine: with one program the first sub trashes it without asking and the second does nothing; tag comes before brain damage. |
| Successful run last turn: SEA Source (cost 2) starts Trace 3; success → 1 tag | **PASS** | QA e2e seed 25 (`*-08`, `*-09`). QA engine: costs 2, the Corp's max bid is what is left, the card lies face up in Archives. |
| No successful run last turn: dimmed "Runner made no successful run last turn" | **PASS** | P `s09-cards` (the text). QA engine: no run, a run ended by ICE, and a success **two** turns ago are all refused. |
| One Globalsec: link 2 (3 with two); the next trace uses it | **PASS** | QA engine: install one → 2, two → 3, on both views; the trace starts with link 3; trash one → back down. P `s09-cards`. QA sweep: link always = 1 + Globalsecs. |
| Decks: 30 cards each, Corp influence 8 / 15 points, Runner 10 (automated) | **PASS** | QA engine with QA's own pip table (not `checkDeck`): Corp 8, Runner 10, 15 points, ≤ 3 copies, HB/neutral agendas. |
| Every card works as the table says (automated) | **PASS** | QA engine: the 4 new cards' cost, strength, influence, link and **2012 wording** (no "core damage", no "Lose a click" line, "his or her"); the effects behind the text. QA sweep plays all of them. |

## Bugs

| ID | Severity | What | Repro |
|---|---|---|---|
| QA-S9-1 | Low | At 640×360 the automatic-bid note and the trace result are joined in one narrow bubble with no break: "Runner bid / 0 / SEA Source: trace 4 vs / link 1: / Runner / tagged". The "0" sits alone on a line, and it reads like one sentence. At 844×390 it fits on more lines but is still one run-on block. | `phone-small-09-sea-source-runner-broke-result.png`. Any trace with a skipped window, e.g. QA e2e "seed 25: SEA Source" on `phone-small`. |
| QA-S9-2 | Low | When Private Security Force flatlines the Runner, the "Do 1 meat damage" button stays on screen behind the game-over box ("The game is over"). On desktop the "1 meat damage" toast also lands on top of the title, so for a moment it reads "1 meat damage wins". | `desktop-12-psf-empty-grip-flatline.png`, `phone-small-12-…`. QA e2e "seed 3: three meat damage…": the last PSF tap. |

## Snappiness and auto-pass
- Timed taps (Let it fire, −, +, Max, Bid, the tag marker, Remove 1 tag, Private Security Force, Play SEA Source): state changed < 100 ms after the tap was handled on all three sizes; no blocking animation over 600 ms.
- Trace screens open only when the bid can change the result. Checked in QA's sweep on every trace: Corp asked ⇔ it has credits and they could beat the link; Runner asked ⇔ he is behind and can catch up. Toasts say "Corp bid 0" / "Runner bid 0" for skipped windows.

## Hidden information
- New events (`trace_started`, `trace_bid`, `trace_resolved`, `tags_changed`, `meat_damage`) carry only public numbers and face-up cards: QA sweep after every action (both seats), QA match on every update, QA online frames. Meat-damage cards are always face up in the Heap when named. No Corp hand on the Runner's side, no Runner Grip on the Corp's side, in any view.
- Pass-the-phone: no hand is drawn while the other seat bids (QA e2e, P).

## Review of other roles' edits to QA-owned files (DECISIONS 2026-11-16)
All **accepted**:
- `packages/engine/test/hidden.ts`, `packages/match/src/hidden-checks.ts`, `qa-sprint03-pass2.test.ts`: trace events may name a rezzed ICE or an operation face up in Archives; a scored agenda's `ability_triggered` names that agenda; a trace choice outside a run may name the operation on top of Archives. Each allows only a face-up card, which is public. QA's sweep also checks that trace events only ever name Hunter, Ichi or SEA Source.
- `apps/server/test/qa-sprint08.test.ts`: a rig card may carry exactly the Corp's `trash_resource` option while the Runner is tagged. *Note:* it does not check that the card is a resource. QA's sweep checks that, so no change is needed.
- `qa-sprint08.test.ts` (deck tables, influence 8/10, `RULES_VERSION` 3, PSF counted apart from Melange), `sprint08-properties.test.ts` (operation trace outside a run), `qa-sprint08.spec.ts` (Pipeline on Hunter, Construct seeds 11/16), `qa-sprint03.spec.ts` (`run!`), `qa-sprint07-android.spec.ts` (core decks on both builds): these follow the deck changes and loosen nothing. QA checked the new numbers on its own: Pipeline 1 → 4 is 3 pumps of 2, then 1 to break = 7.

## Owner checks (only a real phone can show these)
1. On your phone, held sideways, start a pass-the-phone game and let Hunter fire. Are the − / + / Max / Bid buttons easy to hit with a thumb, and is the big number easy to read?
2. Look at the red "Tagged 1" marker by the Runner's credits. Is it easy to notice, and easy to tap to get "Remove 1 tag"?
3. When a bid screen is skipped, does the short "Corp bid 0" / "Runner bid 0" note make sense to you, or does it feel like the game skipped your turn?
4. Online on two phones: do the waiting lines ("Corp is choosing its trace bid…") show quickly enough?

## CI on the QA commit
QA's tests and screenshots were added in **bed0ec6** (no product code changed). CI on bed0ec6:
- `checks` passed: lint, typecheck, **2041 unit tests**.
- Full screen-test suite, all 4 parts: **1160 passed / 6 skipped / 0 failed, 1 flaky** (parts: 290 / 291 / 289 + 1 flaky / 290). QA's 18 new screen tests passed first try.
- `guard-mutation`, `android`, `deploy`, `server` passed. ("Workers Builds" ignored, as instructed.)
- **The flaky test** is an old QA test, not Sprint 9: `qa-sprint06.spec.ts:229` "QA S-06-2 not your turn … real taps" on `desktop`. It failed once and passed on the retry. It expected the "Not your turn" hint 150 ms after a tap and saw no hint. Most likely the hint had not shown or had already faded on a slow CI runner. Logged as **QA-S9-3 (test-only, low)**: QA will make that check read the animation log instead of the live screen (as the Sprint 9 specs do). Not counted against Sprint 9.

This report's own commit only changes this file.

## Round 2 (2026-11-16)

Fixes checked: **fe56e3a** (ui-dev: QA-S9-1, QA-S9-2, QA-S9-3) and **eaed05e** (architect: 2-second cap on the qa-sprint06 wait). Code checked at **eaed05e**.

**Summary: the 25 criteria still PASS. QA-S9-1, QA-S9-2 and QA-S9-3 are fixed. Round 2 found 1 new low bug (QA-S9-4, desktop only) and 1 very small cosmetic note (QA-S9-5).**

**CI on eaed05e** (the full-suite evidence; QA did not re-run the whole suite):
- `checks` passed: lint, typecheck, **2041 unit tests**.
- e2e, all 4 parts: **1164 passed / 6 skipped / 0 failed / 0 flaky** (parts: 291 / 290 / 291 / 292).
- `guard-mutation`, `android`, `deploy`, `server` passed. ("Workers Builds" ignored.)
- No regression on S-09-1..4. Every developer and QA test behind the 25 criteria is in that run.

QA's own screen tests were re-run locally on all 3 sizes, with the stronger round-2 checks below: **21 passed, including the 1 expected failure for QA-S9-4**. QA also ran `qa-sprint06.spec.ts` locally on all 3 sizes: it passed. Screenshots `*-09` and `*-12` were refreshed, and `*-18` is new.

| Bug | Round 2 result | Evidence |
|---|---|---|
| QA-S9-1 skipped bid + result run together | **Fixed** | QA e2e seed 25, real play, all sizes: the toast is now the single sentence **"SEA Source: trace 4 vs link 1: Runner tagged (Runner bid 0)"**. There is no separate "Runner bid 0" line, the text is ≥ 12 px, it is at most 2 lines, and it stays inside the screen (`phone-small-09`, `phone-09`, `desktop-09`). |
| QA-S9-2 leftovers on the game-over box | **Fixed** | QA e2e seed 3, real play: after the flatlining tap there is no button, no picked card and no new toast. An earlier "1 meat damage: …" toast that is still fading sits clear of the box. "Corp wins · Runner flatlined" reads cleanly (`desktop-12`, `phone-small-12`). |
| QA-S9-3 flaky qa-sprint06 test | **Fixed; edits accepted** | See the review below. 0 flaky in CI on eaed05e. |

**Review of the edits to QA's `qa-sprint06.spec.ts` (lines marked "QA reviews"): accepted.**
- The "Not your turn" refusal comes back from the online service, so the old "hint visible 150 ms after the tap" check was really timing a network round trip on a shared CI runner. That is not the game's tap budget.
- The new check still asks for exactly one "Not your turn" hint per tap, read from the animation log. It also requires the answer within 2 s, well inside the client's 5 s wait. It still checks that nothing was sent and nothing changed.
- What it gives up is the "under 150 ms" timing. For online refusals QA thinks that is right. Local taps keep the < 100 ms budget, which QA's Sprint 9 tests measure.

**New in round 2:**

| ID | Severity | What | Repro |
|---|---|---|---|
| QA-S9-4 | Low | **Desktop only (1280×800):** the new wide trace toast is centred over the middle of the table, and its right end covers the left part of the Corp's **End turn** button (the toast spans x 431–849, End turn x 824–949). It is drawn on top of the button for as long as the toast shows. 844×390 and 640×360 are clear. | QA e2e "QA-S9-4: SEA Source result toast…" on `desktop`. It is marked "expected to fail" while open, so CI will report "unexpected pass" once fixed. Screenshot `desktop-18-qa-s9-4-toast-vs-end-turn.png` (also `desktop-09`). |
| QA-S9-5 | Very low (cosmetic) | Desktop: the small "Built 2026-11-16 …" date line shows inside the left edge of the "Corp wins" box. | `desktop-12-psf-empty-grip-flatline.png`. Not a Sprint 9 rule. Seen only because the box is now clean. |

**Round 2 totals: 25 / 25 criteria PASS.** QA-S9-1, 2 and 3 are fixed. QA-S9-4 (low) and QA-S9-5 (very low) are open; neither blocks the demo.

---

## Round 3 — owner's short-screen Score bug (2026-11-16)

**What was checked:** the fix for the owner's Galaxy S23 bug. In Chrome with the address bar showing, the screen is about 891×296, and the Score button was squashed to 25 px, so the owner could never score an agenda or reach Private Security Force (S-09-3). The fix is in commits f2efa19, ec07fa2, 437d555, 57c322b and a5108fc. QA checked commit **a5108fc**. QA did not write this fix.

**QA's own checks:**
- New QA spec `apps/client/e2e/qa-sprint09-r3.spec.ts`. It uses real taps, touch input and DPR 2.625 at 891×296, and also runs at 844×390, 640×360 and desktop. Local result: **6 passed**. The other 6 are skipped on purpose, because the short-screen tests run only once.
- **The test can catch the bug.** QA put back the old `layout.ts` and `board.ts` (from e95a432) and ran the short-screen tests again. C1 fails with "Score height" and C3 fails with "build date hidden". So these tests would have caught the owner's bug.
- **Layout comparison** (a one-off unit check, not committed): QA compared `computeLayout` at e95a432 and at a5108fc. At 844×390, 640×360, 1280×800, 1366×768, 1920×1080 and upright 390×844, with and without safe-area insets, for both Corp and Runner, the result is **identical**. At 891×296 the second button grows from **25 px to 44 px**. The credits pill stays **44 px**, the clicks pill slims to 40 px and End turn stays 44 px. Only the build date is hidden.

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | 891×296: on a Corp agenda with enough advancements, Advance and Score are both fully visible, at least 44 px, and not overlapped. Tapping Score scores the agenda. | **PASS** | QA test "C1: Advance + Score full size, Score scores" checks: inside the screen, ≥ 44 px, clear of every board element and target, and `expectCleanLayout`. Points go up by the agenda's points, and the game updates in under 100 ms. Screens: `sprint-09-qa/short-01-score.png`, `short-02-scored.png`. |
| 2 | 891×296: with PSF scored, the Runner tagged and the Corp's turn, tapping PSF shows "Do 1 meat damage · 1 click" in full. Tapping it sends a random Runner card to the Heap and shows the notice. | **PASS** | QA test "C2: PSF …" checks: the button is lit and full size with the label drawn. After the tap there is a `meat_damage` event, the grip is 1 smaller, the Heap is 1 bigger, the lost card is the top of the Heap, the Corp has 1 fewer click, and the notice "1 meat damage: Magnum Opus to the Heap" shows. The game updates in under 100 ms. Screens: `short-03-psf-button.png`, `short-04-psf-notice.png`. |
| 3 | 891×296: End turn and the credits pill are still visible and tappable. Nothing important is hidden except the build date. | **PASS** | QA test "C3: …" checks: End turn is 44 px and works (the turn passes). The credits pill is full size (44 px), and tapping it gives +1 credit in under 100 ms. The clicks and credits text are still drawn. The build date is the only thing hidden. Screens: `short-05-rail-idle.png`, `short-06-after-end-turn.png`. |
| 4 | 844×390, 640×360 and desktop look the same as before. | **PASS** | The layout is the same as before the fix at every size (see the layout comparison above). The QA test "C4: Score, PSF and rail flows" passed at all 3 sizes, and the build date still shows there. Screens `r3-{phone,phone-small,desktop}-01…06-*.png` match the earlier Sprint 9 screens; for example, `r3-phone-small-03-psf-button.png` and `phone-small-10-psf-button.png` have the same rail and positions. |
| 5 | CI on the head commit | **FAIL (red), not caused by this fix** | On a5108fc: `checks` passed (lint, typecheck, unit tests). `build`, `deploy`, `publish` and `guard-mutation` passed. e2e shards 1/2/3 passed (298 / 296 / 296). **Shard 4/4 failed: 296 passed, 1 failed (also failed on retry), 0 flaky.** All 8 `phone-short` `short-rail.spec.ts` tests passed in that shard, including 891×296. ("Workers Builds" was ignored as the owner asked.) |

**The CI failure is QA-S9-6, a new bug that was already in the code before this fix.**

| ID | Severity | What | Repro |
|---|---|---|---|
| QA-S9-6 | Low (desktop) | When the Corp flatlines the Runner with Private Security Force, the earlier "1 meat damage: Akamatsu Mem Chip to the Heap" notice can still be showing. It is drawn over the "Corp wins" title of the game-over box (toast x 399–748, y 292–324; box x 331–949, y 273–406). This is the QA-S9-2 symptom again, for a toast that was already showing. It depends on timing. CI passed this test on e95a432 but failed it twice on a5108fc. **Locally it fails every time, including on a clean checkout of e95a432 (before the fix)**, so the short-screen fix did not cause it. | `cd apps/client && npx playwright test e2e/qa-sprint09.spec.ts --project=desktop --retries=0 -g "seed 3: three meat"`. It fails at line 333, "toast off the game-over box". Screenshot: `sprint-09-qa/r3-desktop-07-toast-over-game-over.png`. Fix idea for the developers: clear or hide any notice that is still showing when the game-over box opens. |

**Round 3 totals: 4 / 5 criteria PASS. Criterion 5 (CI green) FAILS** because of QA-S9-6, which was already there before the fix. The owner's Score bug itself is fixed at 891×296. Before the CI criterion can pass, QA-S9-6 must be fixed (or ruled on) and CI must be green on the new head.

---

## Round 4 (2026-11-16)

**What was checked:** the fix for QA-S9-6 (a meat-damage notice drawn over the "Corp wins" box after a Private Security Force flatline). The fix is in commits 28a2f64 and d812957 (with DECISIONS entries 880b3a6 and 0db3a6f). QA checked head **0db3a6f**. QA did not write this fix.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | QA-S9-6: no notice over the "Corp wins" box after a PSF flatline | **PASS** | QA's own test `e2e/qa-sprint09.spec.ts -g "seed 3: three meat"`: desktop `--repeat-each=5 --retries=0` gave **5 / 5 passed**. In round 3 it failed every time locally. Phone and phone-small, run once each: **2 / 2 passed**. The test uses real taps for the 3 PSF uses that flatline the Runner. It checks that no button, picked card or new toast is left after the flatline, that any toast still showing sits clear of the game-over box, and that the box says "Corp wins / Runner flatlined". Screens: `sprint-09-qa/r4-desktop-psf-flatline-game-over.png`, `r4-phone-psf-flatline-game-over.png`, `r4-phone-small-psf-flatline-game-over.png`: the box is clean at all 3 sizes. The developers' own test `s09-ui.spec.ts` "QA-S9-6: …" also checks, on the frame the box opens, that the earlier notice is gone. It passed in CI (see row 3). |
| 2 | Round-3 Score fix still holds | **PASS** | `e2e/qa-sprint09-r3.spec.ts` on all projects, `--retries=0`: **6 passed, 6 skipped on purpose** (the short 891×296 tests run only under the phone project). |
| 3 | CI on the code head | **PASS** | On **0db3a6f8717eaac3bb79231b7628e0bf2929ef03**: `checks` (lint, typecheck, unit tests) success; `e2e` success, with **all 4 shards success**; `guard-mutation` success. ("Workers Builds" was ignored as the owner asked.) This counts as the round's full e2e pass, so QA did not re-run the full suite. QA's docs-only commit after this one starts a new CI run; the green result on 0db3a6f is the evidence. |

**Still open (both are on the backlog as Sprint 9 follow-ups):** QA-S9-5 (very low, cosmetic). On desktop the small "Built 2026-11-16 …" date line still shows inside the left edge of the "Corp wins" box (see `r4-desktop-psf-flatline-game-over.png`). This is unchanged from round 2 and does not block the demo. QA-S9-4 (low, desktop toast over End turn) is still open. Its test is still marked expected-fail and passed that way in CI.

**Round 4 totals: 3 / 3 checks PASS. QA-S9-6 is fixed and CI is green on 0db3a6f.** The Round 3 CI criterion (criterion 5) now passes. Sprint 9 is passed QA.
