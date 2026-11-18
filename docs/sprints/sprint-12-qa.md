# Sprint 12 QA report

## Round 3 (2026-11-18, ui-dev head cb1895c + QA commit)

QA re-checked ui-dev's fix for QA-S12-2 (cb1895c: the price label tries "1 credit (−4)" on one line, then "1 credit" / "(−4)" on two lines, then just "1 credit"; it never shrinks below 10 px; the pill may be as wide as the target, never wider).

**Result: QA-S12-2 is fixed. Every Modded price is 10 px or more at all 4 sizes, sits inside its own card, clear of every card name, targets at least 44 px. S-12-3 passes QA. All 6 stories passed QA. No open bugs.**

### Change to QA's own test file
`git diff e68d4e1..HEAD -- apps/client/e2e/qa-*`: one line removed, the `test.fail(... 'phone-short' ...)` mark on "QA-S12-2 seed 203: Modded price text >= 10 px". Nothing else in any qa-* file changed. The check itself (`>= 10`) is the same.

### What QA checked
1. `qa-sprint12.spec.ts` + `s12-runner.spec.ts` on all 4 sizes, `--retries=0`: **105 passed, 3 skipped (online at 891×296, as before), 0 failed**. This includes `QA-S12-2 seed 203` now passing on `phone-short` with no expected-failure mark, and `QA-S12-1 r2 seed 203 / 206 / 208` (inside own target, centred on own card, clear of every name, 44 px).
2. The layout hook's `label` keeps the full text ("1 credit (−4)") even when the screen shows less, so tests that read `label` don't prove what is drawn. QA added a **local, not committed** line to the hook to read the drawn text and its measured width/height, and probed **every lit Grip card for seeds 201–212** (34 cards per size, 136 in all). Then it removed the line (the committed code is ui-dev's, unchanged).

| Size | Target | Text size | What is drawn | Text inside pill | Pill inside target | Gap pill → name |
|---|---|---|---|---|---|---|
| 1280×800 | 81×113 | 10.0 px | "free (−n)" / "1 credit (−4)", one line, all 34 | yes, all | yes, all | 48.8 px |
| 844×390 | 55×77 | 11.0 px | "free (−n)" one line; "1 credit" / "(−4)" two lines; discount on all 34 | yes, all | yes, all | 14.2–26.2 px |
| 640×360 | 52×72 | 10.0 px | same as 844×390; discount on all 34 | yes, all | yes, all | 13.2–24.2 px |
| 891×296 | 44×56 | 10.0 px | **just the price ("free", "1 credit") on 29 of 34**; "free" / "(−n)" on 5 (Pipeline, Corroder, whose names are one line so there is more room) | yes, all | yes, all | 3.6–7.9 px |

0 of 136 cards break any rule (text < 10 px, text outside its pill, pill outside its target, pill touching the name, target < 44 px).

### The discount at 891×296: does S-12-3 AC3 still hold?
- AC3 says: "then it installs 3 credits cheaper (never below 0), with no extra click, and her own 1-credit discount still applies". It is about **what the install costs**, not about showing the discount. It does **not** require the "(−N)" to be on screen.
- What the screen shows at 891×296 is the **real price you pay** ("free", "1 credit"), and it is correct on every card QA probed (cost − 3 − Kate's 1, never below 0). The tests confirm the credits paid on a real tap (Magnum Opus 1 credit, Pipeline 0).
- So **AC3 PASS** at all sizes. The discount is shown at 844×390, 640×360 and 1280×800. At 891×296 only the price is shown on most cards.
- If the owner wants the "(−N)" visible on his phone as well, that is a new request, not a failed criterion (PM: ask at the demo).

### Which price is which
On every size each price is on its own card, above the card's name, with the name fully readable (`r3-modded-prices-*.png`). The pill covers the card's printed cost badge (noted in round 2), so on the phone there is just one number per card: what you'll pay. That's clear, but at 891×296 you can't see the printed cost to compare (hold the card to see it).

### Minor observations (no fix asked)
- At 891×296 the discount shows on some cards and not others in the same hand (seed 212: Pipeline "free / (−3)", the others "free"). This depends on whether the card's name takes one or two lines. A little uneven; nothing is wrong.
- Suggestion for the team: the layout hook could expose the drawn text (e.g. `shown`) so a committed test can check what is on screen, not the full label.

### Screenshots (drawn at seed 203 / 212; taken with QA's local hook line, which doesn't change drawing)
`docs/sprints/sprint-12-qa/r3-modded-prices-{phone-short-203,phone-short-212,phone-small-203,phone-203,desktop-203}.png` (phone-short = 891×296, phone-small = 640×360, phone = 844×390, desktop = 1280×800).

### Checks
- Local: the two Sprint 12 Modded specs above, all 4 sizes, `--retries=0`: 105 passed, 3 skipped.
- Full pass and regression: **CI on QA's round 3 commit 01087b1** (ui-dev's cb1895c code plus this report and screenshots only), `ci` run 44253971353: `checks` (lint, typecheck, unit) success, `guard-mutation` success, `e2e` success (shards 1/4, 2/4, 3/4, 4/4 all success). This is the round's full pass. The only commit after it adds this line to the report.

### Final per-story results (round 3)
| Story | Result |
|---|---|
| S-12-1 Accelerated Beta Test | PASSED QA |
| S-12-2 Archived Memories / Experiential Data | PASSED QA |
| S-12-3 The Toolbox and Modded | PASSED QA (QA-S12-1 and QA-S12-2 fixed) |
| S-12-4 Infiltration | PASSED QA |
| S-12-5 Full 45-card decks | PASSED QA |
| S-12-6 Melange "Click ×3" | PASSED QA |

### Needs the owner's phone (round 3)
1. **Modded on your phone (891×296):** pick Modded with a few programs in hand. Each card shows what you'll pay ("free", "1 credit"). Most cards don't show the "(−4)" part at this size. Is that fine, or do you want the discount shown too?

IP: no change (no new image or font files except QA screenshots).

### Round 3 re-check by a second QA pass (2026-11-18)
A second QA session went over round 3 again instead of trusting the section above.
- **QA's own file:** `git diff e68d4e1..cb1895c -- 'apps/client/e2e/qa-*'`: one line removed (the `test.fail(... 'phone-short' ...)` mark on "QA-S12-2 seed 203"). The `>= 10 px` check itself is unchanged. ui-dev's other test change: `s12-runner` `expectPricesClearOfNames` floor 8 → 10 px (tighter, fine).
- **Code read (`TargetMarker.set`, widgets.ts):** after trying the label options, `k = Math.max(k, minPx / base)` forces 10 px even when the last option doesn't fit, so in theory text could spill past its pill. The committed tests check the pill, not the drawn text, so QA measured the drawn text directly (below).
- **Specs:** `qa-sprint12` + `s12-runner`, 4 sizes, `--retries=0`: **105 passed, 3 skipped (online, 891×296), 0 failed**, same as above.
- **Drawn-text probe (temporary local hook line plus a scratch spec, both deleted afterwards; `board.ts` restored from git):** for every lit Grip card, the text on screen, its measured box, text inside pill, pill inside target, pill **and text** clear of every Grip card name, target ≥ 44 px.
  - Seeds 201–212, all 4 sizes: 136 cards, **0 failures**. Text 10 / 11 / 10 / 10 px (desktop / 844×390 / 640×360 / 891×296), same as the table above.
  - **Seeds 1–40 at 891×296 and 640×360** (to reach the widest price, The Toolbox "5 credits (−4)"): 131 cards per size, **0 failures**, all 10 px. At 891×296, "5 credits" (11 cards) fits inside its 44 px pill at 10 px. The costliest program or hardware is The Toolbox (9), so no price can be wider than "6 credits", which is the same width.
  - At 891×296 the "(−N)" shows only on Pipeline / Corroder (26 of 131); on the rest only the price shows. At 640×360 every card shows it.
  - Not reached in any real game probed: a **dimmed** Grip card with a reason (e.g. can't afford). The code drops the reason first and keeps the price at ≥ 10 px, the same price-only text measured above. This isn't part of S-12-3's acceptance criteria (AC4 is about Modded itself being dimmed, which `s12-runner` "no program or hardware in the Grip" covers and which passes).
- **Screenshots:** `docs/sprints/sprint-12-qa/r3b-modded-toolbox-{phone-short,phone-small}-3.png` (seed 3: The Toolbox "5 credits", which at 891×296 fills the card's whole width but stays readable and on its own card). QA also looked at seeds 203 and 212 at 891×296: every price is on its own card above a readable name.
- **S-12-3 AC3 judgement:** agree with the section above. AC3 is about what Modded charges (3 less, never below 0, Kate's 1 still applies, no extra click). Tests check that on real taps, and the price on screen is the real cost. Showing "(−N)" isn't required, so **PASS**. Whether the owner wants the discount visible on his 891×296 phone is an **owner phone check**, not a fail (already listed above).
- **Regression / full pass:** CI on `01087b1` (cb1895c code + QA report only): `checks`, `guard-mutation`, `e2e` (shards 1/4–4/4) all success. This round's CI result for the newest QA-report head is recorded in the commit that follows this one (see "CI on the final head" below).

**Result of the re-check: agrees with round 3. QA-S12-1 and QA-S12-2 fixed; S-12-3 passes QA; all 6 stories passed QA; no open bugs. One owner phone check (discount hidden on most cards at 891×296).**

### Final per-story results (round 3, after re-check)
| Story | Result |
|---|---|
| S-12-1 Accelerated Beta Test | PASSED QA |
| S-12-2 Archived Memories / Experiential Data | PASSED QA |
| S-12-3 The Toolbox and Modded | PASSED QA (QA-S12-1, QA-S12-2 fixed; owner phone check: "(−N)" hidden on most cards at 891×296) |
| S-12-4 Infiltration | PASSED QA |
| S-12-5 Full 45-card decks | PASSED QA |
| S-12-6 Melange "Click ×3" | PASSED QA |

### CI on the final head
`ci` run 44259561965 on **3d3b16e** (cb1895c code + QA report and screenshots only): `checks` (lint, typecheck, unit) success, `guard-mutation` success, `e2e` success (shards 1/4, 2/4, 3/4, 4/4 all success). This is the regression check for all of Sprint 12. The only later commit adds this line.

---

## Round 2 (2026-11-18, head 5d4dfef + QA commit)

QA re-checked ui-dev's fix for QA-S12-1 (5d4dfef: Modded's price label moved above the card name, split into price / discount on two lines, shrinks to fit).

**Result: QA-S12-1 is fixed (names readable, which price goes with which card is clear, targets at least 44 px), but the fix makes the price text too small at 891×296: about 8.3 px, under the project's 10 px floor for labels. New minor bug QA-S12-2.** S-12-3 AC3 stays PASS on what it does; the readability is still open at 891×296 only.

### What QA checked
New QA tests in `apps/client/e2e/qa-sprint12.spec.ts` (all 4 sizes, real game on the 45-card decks, planner goal `modded_ready`):
- `QA-S12-1 r2 seed 203 / 206 / 208` (seed 203 = the bug's repro: 2 Magnum Opus, Cyberfeeder, Gordian Blade, Corroder; 206 and 208 are QA's own extra seeds with Battering Ram, Akamatsu Mem Chip, Pipeline): for every lit Grip card, the price pill is drawn, sits inside its own target, its middle is on its own card and on no other card, it does not touch **any** Grip card's name, and the target is at least 44 px and on screen. **12/12 PASS.**
- `QA-S12-2 seed 203: Modded price text >= 10 px`: **PASS at 844×390, 640×360, 1280×800; FAILS at 891×296** (kept as an expected failure, `test.fail` on `phone-short` only, so CI stays green and the test flips red the moment the bug is fixed and someone forgets to remove the mark).
- Local run: `--retries=0`, 16 passed (the 891×296 floor test failed as expected).

Measured price text size (all lit Grip cards, seeds 201–212):

| Size | Target box | Price text |
|---|---|---|
| 844×390 | 55×77 | 11.0 px |
| 640×360 | 52×72 | 10.0 px |
| 1280×800 | 81×113 | 10.0 px |
| 891×296 | 44×56 | **8.28 px** on two-line pills ("1 credit (−4)", and "free (−n)" on Cyberfeeder, Gordian Blade, Akamatsu Mem Chip, Magnum Opus); 10.0 px only where the name sits lower (Corroder, Pipeline) |

(ui-dev said about 8.6 px; QA measured 8.28 px.)

### Judging 8.3 px against the floors
- The QA-S3-4 floors (14 / 11.5 / 12 px) and the Sprint 11 floors (14 / 12 / 11.5 px) are for **run panel buttons**. Price labels on the board were never held to them: before Sprint 12 they were already 10–11 px at every size. So QA does not count those floors here.
- But every label you tap or read in this project has a 10 px floor: the label's own code (`TargetMarker`, `Math.max(10, ...)`), the trace bid buttons (`qa-sprint09`, 10 px), toasts (architect ruling 2026-11-17, 10 px), notes (`qa-sprint10`, 10 px). The only lower floor is 8 px for numbers printed on card faces (`qa-sprint11`). A price is a button label, not printed card text.
- 8.28 px is below the 10 px floor, so QA reports it as a bug. ui-dev's own check (`s12-runner`, `pillFontPx >= 8`) uses the card-face floor; QA's test uses 10 and is not loosened.
- In the 891×296 screenshot (taken at the owner's phone's 2.625× pixel density) the prices are sharp and can be read, so this is minor. The floor still applies.

### Bugs
#### QA-S12-2 (minor, ui-dev): Modded's price text shrinks to 8.3 px at 891×296
- Steps: 891×296, a pass-the-phone game on the 45-card decks, seed 203 (planner goal `modded_ready`). Pick Modded. Read the layout hook: `targets[kind=grip].pillFontPx`.
- Expected: 10 px or more (the project's label floor), with names still clear.
- Actual: 8.28 px on "1 credit (−4)" (Magnum Opus ×2) and "free (−2)" / "free (−4)" (Cyberfeeder, Gordian Blade). `891x296-26-r2-modded-grip-prices.png`.
- Test: `qa-sprint12` "QA-S12-2 seed 203: Modded price text >= 10 px" (expected failure on `phone-short`; remove the `test.fail` line when fixed).
- Ideas (up to the team): let the pill cover the cost badge and the top of the art (it already does) with less padding; a shorter discount ("−4" with no brackets); or put the discount in a second, smaller line only when there's room.

#### Observation (no fix asked)
- On every size the pill covers part of the card's printed cost badge (the "2" / "4" in the corner). The pill shows the real price, so nothing is lost.

### Screenshots
`docs/sprints/sprint-12-qa/{844x390,640x360,1280x800,891x296}-26-r2-modded-grip-prices.png` (seed 203). Every name can be read on all four; at 891×296 "Cyberfeeder" is in the card's own small name type (that is the card face, not the label).

### Checks
- `npm run lint`, `npm run typecheck`: pass.
- Full e2e: CI on the QA round 2 commit fe75148: all green (see below).

### Round 2 re-check by a second QA pass (2026-11-18)
A second QA session went back over everything above rather than trusting it:
- Ran `qa-sprint12 -g "QA-S12-1 r2|QA-S12-2"` on all 4 sizes, `--retries=0`: **16 passed** (on 891×296 the 10 px test "passes" only because it is marked as an expected failure).
- Took the expected-failure mark off for one local run on `phone-short` (not committed): it **fails** with `"free (−2)" on Cyberfeeder: 8.28 px`. So the 8.28 px figure holds up; ui-dev's "about 8.6 px" is a little too high.
- Checked that `thumb()` really checks targets are at least 44 px on their short side and on screen (it does), and looked at the 891×296 screenshot: every price is on its own card, with the name below it, so which price belongs to which card is clear.
- Floors re-checked in the code and DECISIONS: 10 px is the established floor for labels you read or tap (QA-S3-4 run-panel text at 640×360, trace bid buttons, toasts in the architect's 2026-11-17 ruling, notes, captions, and `TargetMarker`'s own `Math.max(10, …)` starting size, which the new shrink-to-fit step then goes under). **8.28 px breaks it → QA-S12-2 stays open (FAIL for S-12-3 AC3 readability at 891×296).** What's needed: price text of at least 10 px at 891×296, with names still clear and targets still at least 44 px. Remove the `test.fail` line in `qa-sprint12` when it's fixed.
- There is a precedent: in Sprint 8 the architect accepted 8.3 px run-panel text at 640×360 as an **owner phone check** instead of a fix (DECISIONS 2026-11-16 (b)). QA can't grant that waiver. If the architect or lead wants the same here, it needs a DECISIONS entry and an owner question in the demo notes ("on your phone, can you read Modded's prices on the cards?"). Then QA-S12-2 can be closed as accepted-for-owner-check, not as a pass.
- **CI on fe75148** (ui-dev's 5d4dfef code plus QA test/report changes only): `checks` success, `e2e` success (shards 1–4 all success), `guard-mutation`, `build`, `deploy`, `publish` success. This is the round's full pass and the regression check for all of Sprint 12. (CI on 5d4dfef itself: shard 4 success, shards 1–3 cancelled when the next push replaced that run, so not used as evidence.)

### Final per-story results (round 2)
| Story | Result |
|---|---|
| S-12-1 Accelerated Beta Test | PASSED QA |
| S-12-2 Archived Memories / Experiential Data | PASSED QA |
| S-12-3 The Toolbox and Modded | AC1, AC2, AC4 PASS; AC3 rules PASS. **Not passed QA** until QA-S12-2 (price text 8.28 px < 10 px at 891×296) is fixed or formally accepted as an owner check |
| S-12-4 Infiltration | PASSED QA |
| S-12-5 Full 45-card decks | PASSED QA |
| S-12-6 Melange "Click ×3" | PASSED QA |

IP: no change since round 1 (real names and text allowed by owner rule 3; art is still drawn by the game at runtime).

---

# Round 1

QA did not write the Sprint 12 code. Checked on branch `sprint-12`, head 172e7cd (plus the QA commits).
Sizes: 844×390 (phone), 640×360 (phone-small), 891×296 (the owner's phone with Chrome's address bar, `phone-short`) and 1280×800 (desktop).
Screenshots: `docs/sprints/sprint-12-qa/<size>-NN-*.png` (all of 640×360 and 891×296, a few at 844×390 and 1280×800; palette PNGs, 3.7 MB).

## Result

**24 acceptance criteria: 23 pass, 0 fail, 1 passes in our test browsers but the owner should look at it on his phone** (Modded's price labels at 891×296, see QA-S12-1). One minor bug (readability, not rules). No IP problems.

| Story | Pass | Fail | Owner's phone check |
|---|---|---|---|
| S-12-1 Accelerated Beta Test | 5 | 0 | – |
| S-12-2 Archived Memories and Experiential Data | 4 | 0 | – |
| S-12-3 The Toolbox and Modded | 4 | 0 | 1 (AC3: price labels hide names at 891×296, QA-S12-1) |
| S-12-4 Infiltration | 3 | 0 | – |
| S-12-5 Full 45-card decks | 4 | 0 | – |
| S-12-6 Melange "Click ×3" | 2 | 0 | – |

(S-12-3 AC3 is counted under Pass; the phone check is about how easy it is to read, not about what it does.)

## QA tests (new)
- `apps/client/e2e/qa-sprint12.spec.ts`: real taps on the 45-card decks with **QA's own seeds 201–204** (the developers' specs use seeds 1–3), at all 4 sizes (added to `SHORT_SPECS`; the 3 online tests are skipped at 891×296 like the other online specs). Every tap that changes the game is timed in the page (state < 100 ms after the tap is handled, no blocking animation > 600 ms). Local run, `--retries=0`, `--workers=2`: **65 passed, 3 skipped**. (One test failed in the first local run because QA's own check treated the Corp's identity card as a hidden card. Identities are public; QA fixed its check and the test passed.)
- `packages/match/test/qa-sprint12.test.ts` (18 tests): deck lists against the proposal table and the official card list, legality counted by QA, a new game deals 45 cards a side, a Sprint 11 save loads as `outdated`, and every new card played on **real planned 45-card games** in `LocalMatch` (seeds 201–230). After every move it checks that both seats' views and events show the Runner nothing he shouldn't see (`runnerViewLeaks`, `runnerEventLeaks`). Also: Accelerated Beta Test with R&D of 2, 1 and 0 cards; Experiential Data on the same encounter while face up, face down and trashed.
- Card numbers: QA downloaded `netrunner-cards-json` `pack/core.json` (master) on 2026-11-18 and compared each new card by hand. Codes, costs, influence, advancement and points, trash cost, unique flag and text all match. The test pins them. The text matches the 2012 wording in our spelling ("ICE", "credits"); Modded reads "a program or piece of hardware", exactly as in core.json. The Toolbox leaves off "Limit 1 console per player." (architect ruling 2026-11-18: this is the only console in the card pool).

## Evidence per criterion

### S-12-1 Accelerated Beta Test
| AC | Result | Evidence |
|---|---|---|
| 1 Scored: Corp sees the top 3, picks which ICE to install and where, face up, free | PASS | e2e `seed 201, 2 ICE among 3`: real taps on the agenda and then Score. The sheet shows **the real top 3 of R&D** (checked against the engine state replayed outside the page). Only the 2 ICE are lit. Tap an ICE, and the servers light as "Install · free". QA put one ICE on R&D and the other on a **New server**. Each went in face up (rezzed), with no click spent and no credits paid (Haas-Bioroid's +1 at most). The unit test does the same on 2 more games: free, rezzed, the Corp's clicks unchanged. `*-01-abt-look-at-3.png`, `*-02-abt-servers-lit.png`, `*-03-abt-two-ice-in.png` |
| 2 After picking (or Skip) and confirming, the rest go to Archives; the Runner sees only what he may | PASS | Same e2e: "Trash 1 card". The leftover card goes to Archives in looked-at order. On the Runner's turn both new ICE are face up, the trashed card is a card back, and its name is nowhere on his screen. Unit: the Runner's view shows `looked` = [null, null, null], he gets no options, and his events carry no ids (`rd_cards_trashed{count}` only). Skip (Done right away) is checked online below. `*-04-abt-done-corp.png`, `*-05-abt-runner-sees.png` |
| 3 No ICE among the 3: Corp sees them, one tap to Archives | PASS | e2e `seed 202`: 3 dim cards, none of them ICE. The only target is "Trash 3 cards", and one tap sends all 3 face down. Unit: the only option is `pass`. `*-06-abt-no-ice.png` |
| 4 R&D under 3 cards: uses what's there, no loss for an empty R&D | PASS | Unit `R&D with 2, 1 or 0 cards` (a real game with R&D cut down): it looks at 2 or 1 cards, then Done empties R&D, and there is no result and no game over. With 0 cards there is no choice and no loss. The engine's own tests (2 and 0 cards) agree. The screen for fewer than 3 cards is ui-dev's stubbed check ("Trash 1 card"), which the architect accepted. |
| 5 Online: only the Corp's device shows the 3 | PASS | e2e online `seed 203` (the Runner hosts, the Corp joins with the code, real taps to Score): the Corp's phone shows the 3-card sheet. The Runner's phone has no sheet and `looked` = 3 nulls. The Corp then Skips (Done at once): all 3 go to Archives face down on the Runner's phone. **No frame the Runner's phone received** contains `cardIds` or any of the 3 ids (unless that card is public elsewhere). `640x360-21-online-abt-corp.png`, `640x360-22-online-abt-runner.png`. ui-dev's `s12-online` covers seed 1. |

### S-12-2 Archived Memories and Experiential Data
| AC | Result | Evidence |
|---|---|---|
| 1 Archives has cards: pick any card (face-down too), it goes to HQ | PASS | e2e `seed 203`: Play, and the sheet shows the Corp's whole Archives. QA tapped the **face-down** card and it went to HQ (HQ count back to the same total, Archives −1). Unit (2 games): the face-down card is offered, the playing copy is never offered, and the Runner's `card_returned_to_hand` carries no `cardId` for a face-down card. `*-07-archived-memories-sheet.png`, `*-08-archived-memories-taken.png` |
| 2 Archives empty: dimmed, says why | PASS | e2e `seed 202`: Play is dimmed with "Archives is empty". A tap shows the same words; no click is spent and no card is played. Unit: `condition_not_met`. `*-09-archived-memories-empty.png` |
| 3 Face-up Experiential Data: ICE shows +1, breakers must match | PASS | e2e `seed 202`: a red "3" / "Str 3" pill on Enigma (printed 2), and the run panel says "Strength 3". Gordian Blade's break buttons are dim with `too_weak`. A real tap on "+1 str" makes them lit, and a real tap breaks a subroutine (−1 credit). Unit (2 games): the same, with the engine refusing breaks at 2. `*-10-experiential-data-str3.png`, `*-11-experiential-data-broken.png` |
| 4 Face down or trashed: normal strength | PASS | Unit: the same real encounter with Experiential Data flipped face down, and with it removed: Enigma is back to 2 and the break is allowed. The engine's tests also cover a trash by access. The board shows no pill at printed strength (ui-dev's `s12-archives`). |

### S-12-3 The Toolbox and Modded
| AC | Result | Evidence |
|---|---|---|
| 1 Toolbox installed: memory +2, link +2, shows 2 credits | PASS | e2e `seed 204`: memory limit 6 ("2/6"), "Link 3" (Kate 1 + 2), "2" on The Toolbox. ui-dev's `s12-runner` checks the install itself through Modded. `640x360-15-toolbox-pays.png` |
| 2 Toolbox credits pay icebreakers only; refill at turn start | PASS | e2e `seed 204`: with Kate at **0 credits**, the Battering Ram buttons read "The Toolbox pays" (only breaker buttons do). A real tap spends The Toolbox's credit, and Kate's credits stay the same. Unit (2 games): paid from The Toolbox; no option other than the breaker's ever uses it; after the turns go round it is **back to 2, not more**. Engine tests: never for trash costs or installs. `*-16-toolbox-paid.png` |
| 3 Modded: 3 cheaper (never below 0), no extra click, Kate's discount still applies | PASS (owner look: QA-S12-1) | e2e `seed 203`: Magnum Opus (5) is lit as "1 credit (−4)" (3 + Kate's 1). A tap installs it for 1 credit and 1 click (Modded's own click). e2e `seed 202`: Pipeline (3) is "free (−3)", and installing it costs 0. Unit (3 games): every price = max(0, cost − 3 − 1 on Kate's first install); after it, a later install pays full price. **At 891×296 the price labels cover most of the card names** (QA-S12-1). `*-12-modded-grip-prices.png`, `*-13-modded-installed.png` |
| 4 No program or hardware: dimmed, says why | PASS | e2e `seed 201`: "No program or hardware in your Grip". `*-14-modded-no-target.png` |

### S-12-4 Infiltration
| AC | Result | Evidence |
|---|---|---|
| 1 Choice: Gain 2 credits or Expose 1 card | PASS | e2e `seed 201`: two buttons, "Gain 2 credits" and "Expose 1 card". e2e `seed 203`: one tap on Gain gives +2. `*-17-infiltration-two-choices.png` |
| 2 Expose: tap a face-down card; both see it until tapped away; stays face down | PASS | e2e `seed 201`: Expose lights exactly the face-down Corp cards. A tap shows Enigma big with "Exposed · tap to hide". The Runner's view of the Corp's cards is unchanged (still face down), a tap hides it, and on the Corp's next turn it is still unrezzed. On pass-the-phone, "both players" are the same screen. Unit (3 games): one public `card_exposed`, the same for both seats; the card stays unrezzed; nothing else changes. `640x360-18-infiltration-exposed.png` |
| 3 Online: both devices see it; nothing else revealed | PASS | e2e online `seed 202` (real taps on the Runner's phone; it exposes **Experiential Data**, an upgrade): both phones show it. Both views of the Corp's cards are unchanged. The only new Corp card id in anything the Runner's phone received is the exposed card. `640x360-23-online-exposed-runner.png`, `640x360-24-online-exposed-corp.png` |

### S-12-5 Full 45-card decks
| AC | Result | Evidence |
|---|---|---|
| 1 New game: each side has 45 cards as in the tables | PASS | Unit: the 45-card lists = the Sprint 11 decks + the proposal table's extra and new cards, card by card. e2e: "Play on this device" from the start screen gives Haas-Bioroid and Kate, deck + hand = 45 each. e2e online: a real game with a code gives 45 a side on **both** phones. Unit: by default and with online options, 5 in hand + 40 in the deck (the Corp's turn-1 draw makes 6 + 39). `*-19-new-game-45-cards.png` |
| 2 Both lists legal | PASS | Unit, counted by QA: 45 cards, ≤ 3 copies, influence Corp 8 / Runner 10 (limit 15), only Haas-Bioroid or neutral agendas, 21 agenda points, `checkDeck` = no problems. |
| 3 Hundreds of random games: cards work, nothing hidden leaks | PASS | engine-dev's `sprint12-properties.test.ts` (300 pass-the-phone games and 60 online games on the 45-card decks, with leak and card checks), which QA reviewed and which passes. Plus QA's unit test: every Sprint 12 planned path on QA seeds, with the leak checks after **every move**. |
| 4 A Sprint 11 save or online game shows the note | PASS | e2e: a real Sprint 11-style save (rules version 4, 30-card decks, 12 moves) shows "Continue game". Tapping it shows "That saved game can't continue on this new version of the game. Start a new game.", Continue goes away, and "Play on this device" starts turn 1 with 45 cards. Unit: version 4 loads as `outdated`. ui-dev's `s12-online` covers an online seat. `*-20-sprint11-save-note.png` |

### S-12-6 Melange "Click ×3"
| AC | Result | Evidence |
|---|---|---|
| 1 Table, hand, zoom: click symbol "×3" | PASS | e2e: Melange in a 45-card opening hand. The hand view shows the symbol and "×3: Gain 7 credits.", with no "click" word and no text off the card. ui-dev's `s12-melange` checks the table (both seats), the hand chip and the long-press zoom with pixel checks. `*-25-melange-x3-hand-view.png` |
| 2 Button "Gain 7 credits · 3 clicks" | PASS | ui-dev's `s12-melange` (exact label, real tap: +7 credits, 0 clicks) at 4 sizes, green in CI. QA reviewed it; QA's Sprint 8 test `qa-sprint08` checks the same button. |

## Bugs

### QA-S12-1 (minor, ui-dev): at 891×296, Modded's price labels hide the card names
- Steps: 891×296, a pass-the-phone game on the 45-card decks, seed 203 (planner goal `modded_ready`). Pick Modded.
- Expected: each lit Grip card shows its price and you can still tell which card it is (the ui-dev ruling of 2026-11-18 says the label shows "just the price … so the card name stays readable").
- Actual: the yellow price labels ("free (−2)", "1 credit (−4)") cover the name on Cyberfeeder and on both Magnum Opus. Only part of "Gordian Blade" and "Corroder" can be read (`891x296-12-modded-grip-prices.png`; compare `640x360-12-…`, where every name shows). Holding a card to read it still works, so nothing is blocked.
- Suggested fix: put the label above the card or along its top edge at this size, or shrink it to one line. Up to the team.

### Minor observations (no fix asked)
- The Archived Memories sheet does not mark which cards are face down (the architect logged this as the next engine story, `discardFaceUp`).
- Accelerated Beta Test always looks (no "Don't look" step). This is the architect's ruling, and the PM asks the owner about it at the demo.
- In the local run with 4 workers on this 2-core machine, a few older timing checks went over 100 ms (101–240 ms). Run again with 1 worker, all 8 passed. That was CPU contention on the test machine, not the game. CI is the evidence.

## Snappiness
- Every new tap QA made (Score, install a looked-at ICE, Trash N cards, Archived Memories Play and pick, +1 str and Break with Experiential Data, The Toolbox paying, Modded install, Expose, Gain 2) changed the state in < 100 ms after the tap was handled, and no blocking animation was scheduled over 600 ms, at all 4 sizes.
- Empty timing windows: the new choices wait only on the Corp (the Runner gets no options, so nothing is left hanging). Engine `qa-no-empty-windows.test.ts` and the property tests (liveness) pass.

## QA-owned spec updates (deck flag only, every check kept)
CI on 172e7cd was red only in QA-owned specs (qa-sprint08/09/09-r3/10, 101 failures): they opened seeded 30-card plans on the page default, which is now 45 cards. Each page now names its decks:
- `qa-sprint08` :572 `core(page, 11, 'play=here&decks=core')`
- `qa-sprint09` :43, `qa-sprint09-r3` :61, `qa-sprint10` :48 add `&decks=core`
- `qa-sprint11` :210 now always sends `decks=${goalDeckSet(goal)}` (before, it sent only `starter`. That happened to work, but it would break on the next default change).

Local run of these 5 files at all sizes, `--retries=0`: 231 passed, 8 skipped, 8 failed on timing under 4 workers; all 8 passed when run again with 1 worker (see above).

## Checks
- `npm run lint`, `npm run typecheck`: pass. `npm test`: all unit suites pass (2,528 tests across the 8 workspaces, including QA's new file).
- Full e2e on the QA commit 0e6ed89 (CI run 44237223897, all 4 shards, CI retries=1): **1,684 passed, 0 failed, 0 flaky, 17 skipped** (shards 419 / 420 / 425 / 420). `checks` (lint, typecheck, unit), `guard-mutation`, build and deploy: all green. QA used this CI run as the round's full pass instead of a local re-run (`docs/TESTING.md`). The only commit after it changes this report and nothing else.
- Before the QA commits, CI on 172e7cd (run 44229750102) was red only in QA-owned specs (see above).

## Needs the owner's phone
1. **Modded at 891×296 (QA-S12-1):** in a pass-the-phone game, when Kate has Modded and a few programs in hand, pick Modded and check whether you can tell which card each price belongs to.

## IP check
No new image or font files except QA screenshots. Card art is still drawn while the game runs. The six new cards use the real names and the 2012 text, which the owner's 2026-11-12 rule allows. Pass.
