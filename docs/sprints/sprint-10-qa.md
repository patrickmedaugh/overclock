# Sprint 10 QA report (round 1)

QA did not write the Sprint 10 code. Checked on branch `sprint-10`, head 9fd8688 (plus this QA commit).
Sizes: 844×390 (phone), 640×360 (phone-small), 891×296 (the owner's phone with Chrome's address bar, `phone-short`) and 1280×800 (desktop).
Screenshots: `docs/sprints/sprint-10-qa/<size>-NN-*.png`.

## Result

**30 of 31 acceptance criteria pass. 1 fails (S-10-1 AC5 on the owner's phone size only).**
Two bugs found: QA-S10-1 (medium) and QA-S10-2 (medium). No IP problems.

| Story | Pass | Fail |
|---|---|---|
| S-10-1 Scored-agenda piles | 7 | 1 (AC5 at 891×296) |
| S-10-2 Link and Tagged next to memory | 6 | 0 |
| S-10-3 Advance stops at the limit, Bank Job amount | 9 | 0 |
| S-10-5 Archives lane, tap-to-open discard | 5 | 0 |
| S-10-6 Two screen fixes | 3 | 0 |

## Evidence per criterion

QA tests: `apps/client/e2e/qa-sprint10.spec.ts` (runs at all 4 sizes; added to `SHORT_SPECS` in `playwright.config.ts` so it also runs at 891×296) and `packages/engine/test/qa-sprint10.test.ts`.
Local run of `qa-sprint10.spec.ts` + `qa-sprint01.spec.ts`, `--retries=0`: 128 passed, 1 failed (a timing reading, see "Snappiness"), 5 skipped (the skips were the online test at 891×296, which is skipped on purpose, plus the steal case, which is now covered: 8/8 pass after QA picked a seed that steals).

### S-10-1 A scored-agenda pile for each side
| AC | Result | Evidence |
|---|---|---|
| 1 Corp pile "N agendas · N points", far right of his row, both screens | PASS | `AC1/AC8 real play` (real Score tap; the agenda flies onto the pile; Runner's screen shows the same pile). `*-02-corp-scored-pile.png`, `*-03-corp-pile-runner-screen.png` |
| 2 Runner pile at the far right of his row, same as the Corp's | PASS | `AC2 real play` (runner_two_stolen; the right edges of the two piles line up within 1 px). `*-04-runner-stolen-pile.png` |
| 3 Tap opens it big, slide to read, tap outside closes, hold still reads | PASS | `AC3 real play` (real finger slide both ways, tap outside sends nothing, hold zooms the top card; pile tap answers in under 100 ms). `*-05-pile-open.png`, `*-06-pile-slid.png`, `*-07-pile-hold-zoom.png` |
| 4 PSF from the pile: "Do 1 meat damage · 1 click" works | PASS | `AC4 real play` (psf_scored_tagged: a Runner card lost, Corp −1 click). `*-08-psf-from-pile.png` |
| 5 Unscored PSF: dimmed "Do 1 meat damage: score it first" next to Advance | **FAIL at 891×296** (PASS at 844×390, 640×360, desktop) | `AC5 drawn (QA-S10-2)` pixel check; `891x296-09-psf-score-it-first.png` shows no words under Advance. See QA-S10-2. |
| 6 No scored agendas: empty spot, no taps | PASS | `AC6` (tap and 700 ms hold on both empty spots open nothing). `*-10-empty-piles.png` |
| 7 Piles thumb size, cover nothing (4 sizes, rows full) | PASS | `AC7` (busy board with both piles filled through the test hook, Runner tagged; full overlap check). `*-11-busy-both-piles.png` |
| 8 Score labels still show points | PASS | `AC1/AC8` and `AC2` check "Corp N points" / "Runner N points". |

### S-10-2 Link and Tagged next to memory
| AC | Result | Evidence |
|---|---|---|
| 1 "Link 1" next to memory, nothing over Kate | PASS | `AC1`, `*-12-link-1.png` |
| 2 Install Access to Globalsec → Link 2 | PASS | `AC2 real taps` (the install is a real tap from the hand). `*-13-link-2-globalsec.png` |
| 3 Red "Tagged 1" next to Link, both screens, not by his name | PASS | `AC3/AC4/AC5` (Runner's screen) and `AC3: the Corp's screen`. `*-14-tagged-runner-screen.png`, `*-17-tagged-corp-screen.png` (red in the screenshots) |
| 4 Tap Tagged: "Remove 1 tag · 1 click + 2 credits" | PASS | same test, `*-15-remove-tag-button.png` |
| 5 Tags back to 0: Tagged goes, Link stays | PASS | same test (the Link box is identical before and after). `*-16-tag-removed.png` |
| 6 Tagged, Link, memory and cards never overlap (4 sizes, full rig) | PASS | `AC6 real play` (runner_tagged_full_rig). `*-18-tagged-full-rig.png`. Note: right after the trace, a notice covers a Corp card at 891×296. That is QA-S10-1, a separate bug. |

### S-10-3 Advance stops at the limit; Bank Job lets you choose
| AC | Result | Evidence |
|---|---|---|
| 1 At the requirement: only Score | PASS | e2e `AC1/AC2…` (and no "Advance" label drawn); engine `qa-sprint10.test.ts` Hostile Takeover and Priority Requisition. `*-19-only-score.png` |
| 2 One short: advance once, then only Score | PASS | same e2e (real taps); engine "one short" |
| 3 Advance at the limit refused | PASS | e2e `AC3` (hook dispatch → `condition_not_met`, counter unchanged); engine test checks state, credits and clicks are unchanged. A 120-game random core-deck sweep finds no agenda over its requirement and no Advance offered at the limit. Mutation check: removing `belowRequirement` makes 2 QA engine tests fail. |
| 4 Advanced Ice Wall still offers Advance | PASS | e2e `AC1/AC2…`, engine "Ice Wall … past any limit" (6 advances). `*-20-ice-wall-advance.png` |
| 5 Take credits, set 3, confirm: +3, 5 stay, nothing accessed | PASS | e2e `AC5/AC8` (real − / + taps); engine "take 3 of 8". `*-21-bank-job-choice.png`, `*-22-bank-job-amount-3.png`, `*-23-bank-job-5-left.png` |
| 6 Access cards instead: normal access, 8 stay | PASS | e2e `AC6`; engine "Access cards instead" |
| 7 Last credits taken: to the Heap | PASS | e2e `AC5/AC8`: a second run on a later turn opens at 5, "Take 5" sends it to the Heap. The engine checks the same, plus that bad amounts (missing, 0, −1, 9, 2.5, an amount on Armitage) are refused. |
| 8 Amount control thumb size and readable at 640×360 and 891×296 | PASS | `expectAmountControl` at all 4 sizes (every button ≥ 44 px, text ≥ 12 px, number ≥ 20 px, no overlaps, clear of the hand and End turn) |
| 9 Online: both devices show the same credits on Bank Job | PASS | e2e `AC9 online` (two browsers with the local service; the Runner takes 6; both show 2, with the same credits as a local replay), at 3 sizes. `844x390-24-online-corp-sees-2.png` |

### S-10-5 Archives stays put; discard opens with a tap
| AC | Result | Evidence |
|---|---|---|
| 1 New game: Archives has its own lane, even empty | PASS | `AC1`, `*-25-new-game-archives-lane.png` |
| 2 Single-card remote trashed or stolen: lane folds, others keep names and order | PASS | `AC2/AC3/AC5 (trash)` and `(steal)` (ids are in the same order minus the removed one; every label is unchanged; HQ, R&D and Archives boxes don't move). `*-26-*`, `*-28-*-folded.png` |
| 3 Trashed card flies into the Archives lane | PASS | trash variant: the flight box overlaps the Archives pile; `*-27-trash-mid-flight.png`. The steal variant flies onto the Runner's pile. |
| 4 Discard: tap the hand, it opens big, tap to mark, confirm, no holding | PASS | `AC4/AC5 (runner)` and `(corp)`: Confirm stays dim until the exact count is marked, unmarking dims it again, Confirm discards the marked cards. `*-29/30/31-*.png` |
| 5 Nothing overlaps, every button thumb size (fold and discard) | PASS | full overlap check after the fold and at the discard step; Confirm ≥ 44 px and clear of the big card |

### S-10-6 Two screen fixes
| AC | Result | Evidence |
|---|---|---|
| 1 Desktop: trace note doesn't cover End turn | PASS | `AC1/AC2` (SEA Source game) at 1280×800. `1280x800-32-trace-note.png` |
| 2 Same at 844×390, 640×360, 891×296 | PASS | same test at the other sizes (also checks every pill, Run, Last run, targets and piles; text ≥ 10 px) |
| 3 Game-over box never has "Built …" inside | PASS | `AC3 real play` (a real Score that wins), at all sizes; no "Built" text is drawn at all. `*-33-game-over.png` |

### Toasts (new behaviour)
- 10 px floor: a real refusal ("No clicks left" after a tap on the credits) is ≥ 10 px at all 4 sizes and clear of everything. `*-34-refusal-toast.png`
- Repeats collapse: four PAD Campaign payouts in one presentation show as **"PAD Campaign: +1 credit ×4"**, ≥ 10 px. At 891×296 it wraps onto two lines in the rail and reads fine. `*-35-pad-x4-toast.png`
- The fallback over the table can cover cards on the short screen: see QA-S10-1.

## Bugs

### QA-S10-1 (medium) A notice covers a Corp card on the owner's phone and makes CI red
On 891×296, a notice that doesn't fit the rail at 10 px now moves over the table (6296a1d / 9fd8688) and is drawn on top of a card. After Hunter's trace, "Hunter: Trace 3 – If successful, give the Runner 1 tag" sits over Server 1's ICE for about 1.4 s (`891x296-18a-notice-after-trace.png`). The long-standing rule (QA-S2-1, `expectCleanLayout`) is that a toast never covers a board element. The developers' own `s10-stats.spec.ts:129` fails on `phone-short` in CI on 9fd8688 for this reason; it passed on 11d437c.
- Repro: `?seed=1&play=here&cover=off`, plan `runner_tagged_full_rig` at 891×296, look at the board when it settles.
- Test: `qa-sprint10.spec.ts` "QA-S10-1 …", marked `test.fail` on `phone-short` (ui-dev removes the marker once fixed).

### QA-S10-2 (medium) "score it first" is not shown on the owner's phone
On 891×296, tapping an installed, unscored Private Security Force shows Advance, but the words "Do 1 meat damage: score it first" are not drawn. The test hook says they are there (`text.help`), but the rail has no room under Advance plus the (hidden) Score slot (`helpBox` height is 0). They do show at 844×390, 640×360 and on desktop. This is the owner's phone, which is exactly where he asked for the hint.
- Repro: core decks, seed 1, plan `psf_installed_unscored`, tap the PSF at 891×296. `891x296-09-psf-score-it-first.png`
- Test: `qa-sprint10.spec.ts` "AC5 drawn (QA-S10-2)" (pixel check under Advance), marked `test.fail` on `phone-short`.

### Minor observations (no fix asked)
- Each pile's count badge ("2 agendas · 3 points") sits over the top card's cost dot and name area. It is readable, and the card can be read with a tap or hold.
- At 844×390 the "score it first" words are in the rail under Advance, a little apart from the button. That reads as "next to Advance" well enough.
- Owner-reported card stat-line cut-off (backlog): I did not see it in these screens. The big card's bottom line ("Advance 5 · Points 3", "Memory 2") is fully visible at 891×296. Small table cards shorten long names ("Haas-Bioroid:…", "Kate…") at 891×296.

## Snappiness
- Taps measured under 100 ms (from the game handling the tap to the state change): Score, pile open, PSF, Remove tag, Take 3, Access cards, Trash/Steal, discard open, Confirm. No animation started by these taps is scheduled over 600 ms (toasts and notices don't block input and are exempt, as ruled before).
- One reading of 104 ms when opening the discard view at 640×360, during a 2-worker local run that was also building. Re-run alone with `--repeat-each=8` at 640×360 and 844×390: 32/32 pass. Recorded as machine load, not a bug.
- Empty timing windows are still auto-passed: engine `qa-no-empty-windows.test.ts` and the rest of the unit suite are green.

## QA-owned spec updates (by design, intent kept)
- `qa-sprint03-r3`: QA-S3-7 (a quick tap during a page stall is still a tap) is now checked on the new target. A 30 ms tap on the big card in the discard view marks it under 600 and 1200 ms stalls. A real hold, with or without a stall, never marks. A hold on a hand card opens the discard view.
- `qa-sprint06:448`: the cover flow discards through the discard view (marks the required count, Confirm in the view).
- `qa-sprint07:311`: Bank Job shows "Take credits" and "Access cards". Take credits opens at 8 and takes nothing yet. "Take 8" keeps every Sprint 7 check (+8, nothing accessed, to the Heap, the notice).
- `qa-sprint09-r3` C1/C4: Advance is checked full size on the first tap. Once the agenda is ready, only Score is shown, full size, and it scores.
- Engine `qa-sprint07`: Bank Job needs an amount (missing → `invalid_action`, 8 → take all). The 250-game sweep now allows 1..8 on Bank Job and is stricter: its credits only go down by the amount taken, the amount is always 1..held, and emptying it sends it to the Heap. 120 partial takes were seen.
- Engine `qa-sprint08`: `RULES_VERSION` 4.
- ui-dev's edit to `qa-sprint01.spec.ts` (marking steps only, through `markDiscard` / `closeDiscardView`): **approved**. Every check is unchanged, and the spec passes at 3 sizes.

## Checks
- `npm run lint`, `npm run typecheck`: pass. `npm test`: all unit suites pass (2,233 tests across the 8 workspaces, incl. the new QA engine file).
- Full e2e on 9fd8688 (CI run 44005195332): red, as expected. The only failures are the QA-owned specs listed above (fixed in this commit) and `s10-stats.spec.ts:129` on `phone-short`, which is QA-S10-1. Shard pass counts: 315 / 315 / 327 passed besides those.
- Full e2e on the QA commit ffb921f (CI run 44010952652, all 4 shards, CI retries=1): **1,415 passed, 1 failed, 13 skipped, 0 flaky.** The one failure is `s10-stats.spec.ts:129` on `phone-short` = QA-S10-1. QA's two `test.fail` checks (QA-S10-1, QA-S10-2) failed as expected on `phone-short`. `checks` (lint, typecheck, unit) and `guard-mutation`: green. QA used this CI run as the round's full pass instead of a local re-run (docs/TESTING.md).

## IP check
No new image files outside screenshots. Card art is still drawn at runtime (glyphs). Real card names and text are allowed by the owner's 2026-11-12 rule. Pass.

---

# Round 2 (fix ef61d82)

**Result: 31 of 31 acceptance criteria pass.** QA-S10-1 and QA-S10-2 are **fixed** and re-verified. No new bugs.

## Re-verified bugs
- **QA-S10-1 FIXED.** At 891×296 the "Hunter: Trace 3 – …" notice now sits in free board space between Server 1 and the Corp's pile. It covers no card, label or counter (`891x296-18a-notice-after-trace.png`). The QA test (no `test.fail` marker now) passes at all 4 sizes, and so does ui-dev's `s10-stats.spec.ts:129` at phone-short.
- **QA-S10-2 FIXED.** At 891×296 "Do 1 meat damage: score it first" is drawn right under Advance in the rail (`891x296-09-psf-score-it-first.png`). The pixel check passes at all 4 sizes.
- ui-dev removed only the two `test.fail` lines in `qa-sprint10.spec.ts`. I checked the diff and approve it.

## Regression run (local, `--retries=0`, all 4 sizes)
`qa-sprint10`, `s10-stats`, `s10-scored`, `s10-board`: **191 passed, 0 failed, 1 skipped** (the online test, which is skipped at 891×296 on purpose).

## The `qa-sprint10.spec.ts` refusal-toast failure ui-dev saw on 640×360
Judged correct: it was a test-timing problem, not a product bug. The refused tap ("No clicks left") also shakes the clicks pill as feedback: ±6 px for 260 ms. The test read the layout during the shake, so the pill box was 1 px past the screen edge. At rest it is inside.

Fix (not loosened): the test now lets the shake run, waits until the pill is back at its exact resting box, then does the full layout check. It also now requires that the toast is still showing at that point. The shake is a `ui` tween, so the usual "board idle" wait doesn't cover it. Repeated 5× at 640×360 and 5× at 891×296: 10/10 pass.

## Owner's stat-line screenshots (backlog item, not a Sprint 10 fix)
The owner's photos (`docs/sprints/sprint-10-owner/stats-*.jpg`, on main, Android Chrome, GitHub Pages build) show the bottom stat line of the big card in the hand view ending early:
- Wall of Static reads "Strength :"
- Ichi 1.0 reads "Strength ." (the Ice Wall side card too)
- Corroder reads "Strength 2 · Memory" with the 1 missing

What it is: **the line is clipped on the right, not truncated and not a missing glyph.** The letters before the cut are whole, and the last digit is sliced. The left edge of a "3" looks like ":", and of a "4" or "1" like ".". On Corroder the cut falls just after "Memory", so the 1 is gone. There is no "…" (it is not a deliberate shorten), and the digit is not replaced by a box (it is not a missing font character).

At the same size and pixel density in our test browser (Chromium on Linux, 891×296, DPR 2.625), the line draws in full on all three cards: "Strength 3", "Strength 4", "Strength 2 · Memory 1" (`891x296-r2-statline-wall-of-static.png`, `-ichi.png`, `-corroder.png`). The hook reports no text overflow. So it depends on the phone's fonts.

Likely cause, for the backlog: the stat line uses the mono font list `ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace` (`theme.monoFamily`, `cardFace.ts` `statsLine`). On Android only the generic `monospace` applies. The text image seems to be measured narrower than it is drawn with that font, so its right end is cut off.

Suggested fixes, for the team to pick:
- draw the stat line in the normal UI font, or
- give that text a little right padding, or
- measure it again once fonts are ready.

In every case, check on a real Android phone or an emulator; desktop Chromium does not reproduce it.

## CI on the head
Recorded in the next section, once CI has run on the round-2 QA commit.
