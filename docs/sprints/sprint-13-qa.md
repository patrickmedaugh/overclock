# Sprint 13 QA report

## Round 1 (2026-11-18, code at 7c2e646; branch head a7dcebd adds only STATE.md)

QA did not write the Sprint 13 code. Every criterion below was checked by QA's own tests, which do everything **by taps from an empty device** (no decks written into storage first), the way the owner would: build a deck from empty, keep it, rename it, play it, edit it, delete it, Continue. The developers' specs (`s13-*`) mostly start from decks written straight into storage, so the two test sets overlap little.

**Result: 4 of 5 stories pass QA. S-13-4 fails one narrow case (QA-S13-1, minor): a new deck name typed but not confirmed is lost if the app closes right then.** Everything else passes at 891×296, 844×390, 640×360 and 1280×800.

### QA's tests (new in this round)
- `apps/client/e2e/qa-sprint13.spec.ts`: 11 tests, run on `phone` (844×390), `phone-small` (640×360), `desktop` (1280×800) and `phone-short` (891×296, added to `SHORT_SPECS` in `playwright.config.ts`). `QA_SCREENS=1` writes screenshots; `QA_THROTTLE=6` runs the timing test at 6× CPU slow-down.
- `apps/client/e2e/qa-sprint13-android.spec.ts`: the Android app's bundle (`android` project, no test hook).
- `packages/engine/test/qa-sprint13.test.ts`: 8 unit tests (the card pool, what dims a +, random tap-by-tap deck building where the editor's Ready = `checkDeck` = `isPlayableDeck` = `newGame` deals it, QA's 46-card deck dealt exactly).

### Runs
- `qa-sprint13.spec.ts`, 4 sizes, `--retries=0`: **43 passed, 1 skipped** (upright check, desktop: phones only). The QA-S13-1 test is marked `test.fail` (an expected failure, and it does fail); remove the mark when fixed.
- `qa-sprint13-android.spec.ts`, `android` project: **1 passed**.
- `qa-sprint13.test.ts`: **8 passed**.
- `npm run lint`, `npm run typecheck`, `npm test` with QA's tests added: all pass (every package's unit tests green).
- **Full e2e pass:** CI on **7c2e6467078ff9e75a948944fdbe079623096899** (the sprint's last code commit; head a7dcebd only changes STATE.md), from `gh api repos/patrickmedaugh/overclock/commits/7c2e646.../check-runs`: `checks` (lint, typecheck, unit) success, `guard-mutation` success, `e2e` success (shards 1/4, 2/4, 3/4, 4/4 all success), `build`/`deploy`/`publish` success. Per `docs/TESTING.md` this is the round's full pass; QA did not re-run the full suite. No product code changed after it (QA's commit adds tests, the config line and this report only).

### Per-criterion results

**S-13-1 The Decks screen: PASSED QA (5/5)**
| AC | Result | Evidence |
|---|---|---|
| Decks button next to Play on this device and Play online | PASS | qa "home: Decks next to…" (same row, 44 px, text ≥ 10 px, also fits with Continue game showing at 891×296); `r1-*-home.png`, `r1-891x296-home-continue.png` |
| First visit lists "Standard Corp deck (Haas-Bioroid)" / "Standard Runner deck (Kate)" with counts, New Corp deck / New Runner deck | PASS | qa "first visit…" (exact text "… 45 cards · ✓ Ready to play"); `r1-*-decks-first.png` |
| New deck → "Start from the standard deck" / "Start empty" → editor named "My Corp deck 1" | PASS | same test (empty → "My Corp deck 1" 0 cards; standard → "My Corp deck 2" 45 cards Ready; Runner numbered on its own); `r1-891x296-new-deck-choice.png`, `r1-*-editor-empty.png` |
| Standard deck readable, not changeable; Copy to edit makes a copy | PASS | same test (no +/−, no Delete, no name field; Copy to edit → "My Runner deck 2", editable); `r1-891x296-standard-read-only.png` |
| Back returns to the start screen | PASS | same test (editor → Decks → home) |

**S-13-2 Add and remove cards: PASSED QA (5/5)**
| AC | Result | Evidence |
|---|---|---|
| Every card listed (Corp 24 + identity on top; Runner 20), grouped, name / cost / influence dots / "n / 3" | PASS | qa "build a 46-card Corp deck…" (24 rows, groups Agendas/ICE/Assets/Upgrades/Operations, identity row); unit "QA S-13-2 the pool" (24 / 20, group order, no identity); dev `s13-editor` Runner 20 rows (CI) |
| + / − change the count and the bar at once; − stops at 0 | PASS | same e2e test; **tap → painted 22–46 ms on phones, 5–13 ms desktop; 34–57 ms at 6× CPU slow-down** (all < 100 ms) |
| Hold a card: full text readable; letting go returns | PASS | qa "hold the identity and a card" (Haas-Bioroid identity and Heimdall 1.0, game zoom face, nothing cut off, inside the screen, gone on release); `r1-*-zoom-c18.png`, `r1-891x296-zoom-c13.png` |
| Every card reachable by scrolling; + / − ≥ 44 px at all 4 sizes | PASS | QA check of every visible button ≥ 44×44 and inside the screen, all 4 sizes; dev `s13-editor` scrolls every row and measures (CI, all 4 sizes) |
| "In deck" switch hides 0-copy cards | PASS | qa test: switch on shows exactly the 16 kinds in QA's deck; `r1-891x296-editor-in-deck.png` |

**S-13-3 The real deck rules: PASSED QA (6/6)**
| AC | Result | Evidence |
|---|---|---|
| Bar shows "n / 45 cards", "Influence n / 15", Corp "Agenda points n (needs a–b)"; each part green/red | PASS | qa "build a 46-card…" (red/green checked on each part: empty, 46 Ready, 45 with 18 points "Agenda points 18 (needs 20–21)" red); `r1-*-editor-ready-46.png`, `r1-891x296-editor-agenda-short.png` |
| At 3 copies + is dimmed, tap says "Max 3 copies" | PASS | same test (Hedge Fund); `r1-891x296-editor-max3.png` |
| Hostile Takeover: + dimmed, "Haas-Bioroid can't use Weyland agendas" | PASS | same test (on the row and on tap; count stays 0 / 3); unit "a 4th copy… Hostile Takeover" |
| Over 15 influence: red "Influence 17 / 15", "2 influence over the limit"; removing fixes | PASS | qa "Runner: past 15 influence…" (+ never dimmed by influence); `r1-891x296-editor-influence-over.png` |
| Legal deck: "Ready to play" with a tick | PASS | qa tests ("✓ Ready to play") |
| Editor and game agree (automated) | PASS | unit "random tap walks" (24 walks × 80 taps, both sides, legal and illegal decks seen: Ready ≡ `checkDeck` ≡ `isPlayableDeck` ≡ `newGame` deals it); dev 300-deck property test (CI) |

**S-13-4 Your decks stay on your device: FAILED QA (4 of 5 pass; 1 fail, 1 manual owner check)**
| AC | Result | Evidence |
|---|---|---|
| A change is kept on leaving the editor or closing the app; no Save button | **FAIL (narrow, QA-S13-1)** | Card changes: PASS (no Save button; +/− kept after closing straight from the editor: qa "an unfinished deck is kept…", qa "build a 46-card…" store = QA's 46 cards after reload; Android bundle too). **A typed name not yet confirmed (no Done, no Back, no tap elsewhere) is lost when the page closes**: qa "a rename typed and left without Done or Back…" (marked `test.fail`) |
| Listed later, after closing the browser, with name, count, Ready tick or short red note ("4 cards short") | PASS | qa "an unfinished deck is kept…" ("41 cards", red "4 cards short"); `r1-891x296-decks-kept.png` |
| Tap the name to rename | PASS | qa "rename by typing then Done; rename then Back without Done" (both kept after reload) |
| Delete + confirm removes it; standard decks have no Delete | PASS | same test (asks "Delete "Glacier two"?", Keep keeps, Delete removes, gone after reload); `r1-891x296-delete-ask.png` |
| Android app keeps its own decks; browser keeps its own | PASS for what can be automated; **app close = manual owner check** | `qa-sprint13-android.spec.ts` (app bundle: deck made, reload, still listed "44 cards · 1 card short", in the picker dimmed). Closing the real Android app and reopening is not automated: **owner to check on the phone** (not marked pass by QA) |

**S-13-5 Pick your decks: PASSED QA (5/5)**
| AC | Result | Evidence |
|---|---|---|
| Play on this device → Corp deck / Runner deck choices (standard picked) and Start | PASS | qa "built by taps: pick it…"; `r1-*-picker.png` |
| Own legal Corp deck → R&D + HQ = exactly that deck (46); Runner gets his | PASS | same test: QA's deck built by 46 taps, dealt 46, card list equal to what was built, hand drawn from it; Runner standard 45. Unit: same deck, 5 seeds, exact card lists. Dev spec: 46 + Runner 48 (CI) |
| Not-Ready deck dimmed with red note, can't be picked | PASS | same test ("42 cards short", opacity < 0.8, tap leaves the standard deck picked, note shown) |
| Continue after editing and deleting the deck: same decks | PASS | same test (edit to 45 → Continue: still 46, same hand, credits kept; delete → Continue: same) |
| Play online uses standard decks and says "Online games use the standard decks for now." | PASS | qa "Play online screens…" (online, Start a game, Join with code); `r1-*-online-note.png`, `r1-891x296-online-{pick,join}-note.png`. Online itself unchanged: `s06-…s12-online` in CI |

**Definition of Done checks**
- Upright phone shows "Turn your phone sideways" over the Decks screen and the editor; turning back keeps the screen: PASS (qa test, 3 phone sizes; `r1-*-upright-decks.png`).
- Text ≥ 10 px on every Sprint 13 screen QA visited, all 4 sizes: PASS (smallest is 11 px, the card sub-line and dots).
- Buttons ≥ 44 px on home, Decks, New deck, editor, delete question, picker, online screens: PASS.
- Snappiness: taps < 100 ms (above); no animation blocks input; the toast never blocks a tap (pointer-events none).
- IP: no image, font or logo files added this sprint (`git diff --stat 483c58a..7c2e646`); cards keep the runtime-drawn art. Real card names are allowed by the owner's 2026-11-12 rule.

### Bugs

**QA-S13-1 (minor, S-13-4 AC1): a deck name typed but not confirmed is lost when the app closes.**
Repro (any size):
1. Start screen → Decks → New Corp deck → Start empty.
2. Tap the name "My Corp deck 1", type "Typed then closed". Do not press Done/Enter, do not tap Back or anywhere else.
3. Close the browser tab / app (test: page reload).
4. Open again → Decks: the deck is still called "My Corp deck 1".
Expected: the new name is kept, like card changes. Cause (code read): `decksScreen.ts` takes the name only on the field's `change`/`blur`; the `pagehide`/`hidden` flush in `main.ts` writes the library, which never got the typed name. Fix idea for ui-dev: also take the name on `input` (or have `close()`/the flush read the field). Test: `qa-sprint13.spec.ts` "a rename typed and left without Done or Back…" — remove its `test.fail` line when fixed.

### Observations (no fix asked; PM may want to mention them)
1. **The agenda range follows the deck's real size.** The proposal's example bar "41 / 45 cards · … · Agenda points 18 (needs 20–21)" doesn't appear as such: at 41 cards the bar says "Agenda points 18 (needs 18–19)" (green), because the real rule sets the range from the deck's own size. At 45 it says "(needs 20–21)" in red. The game and the editor agree (one formula), and this is the real rule (owner Q2 A), so not a bug; the owner may notice the difference from the proposal text.
2. The rename field is 40 px tall (the AC's 44 px is for + / −; the field is easy to hit at all sizes).
3. At 640×360 the rules bar takes two lines (the red note wraps under the numbers); still readable, the list scrolls below it (`r1-640x360-editor-empty.png`).
4. Two open browser tabs on the same device each keep their own copy in memory, so the last one to write wins. Not in any AC; unlikely for the owner.

### Needs the owner's phone
1. **Android app close:** in the app, make a deck (Decks → New Corp deck → Start from the standard deck, tap − once). Swipe the app away, open it again → Decks: "My Corp deck 1 · 44 cards · 1 card short" should still be there.

### Per-story results (round 1)
| Story | Criteria | Result |
|---|---|---|
| S-13-1 The Decks screen | 5/5 pass | PASSED QA |
| S-13-2 Add and remove cards | 5/5 pass | PASSED QA |
| S-13-3 The real deck rules | 6/6 pass | PASSED QA |
| S-13-4 Your decks stay on your device | 3 pass, 1 fail (QA-S13-1), 1 pass + manual owner check | FAILED QA (minor) |
| S-13-5 Pick your decks | 5/5 pass | PASSED QA |

### Screenshots
`docs/sprints/sprint-13-qa/r1-<size>-<name>.png`, size = 891x296 (the owner's phone, full set), 844x390, 640x360, 1280x800 (home, Decks, empty and Ready editor, picker, zoom, online note, upright, game dealt from an own deck).

## Round 2 (2026-11-18, code at 3010866)

**Result: all 5 stories pass QA. QA-S13-1 is fixed.** One item stays an owner check on the phone (Android app close, see round 1 "Needs the owner's phone").

### What changed
- 3010866 (ui-dev): the deck name is kept on every keystroke (`input`), through the same deferred write the page-close flush writes; an empty or spaces-only name falls back to the name it had when typing began.
- QA checked the QA test was not weakened: `git show 3010866 -- apps/client/e2e/qa-sprint13.spec.ts` only removes the `test.fail` line and rewords the comment; every action and assertion is unchanged.

### New QA tests (round 2, `qa-sprint13.spec.ts`, "QA S-13-4 kept on the device")
- "round 2: name cleared to empty (or spaces) and the browser closed: the deck keeps its name from before": rename to "Named once" + Done; reopen, type "Half typed", clear it all, close → listed as "Named once", not "Half typed", stored names exactly `["Named once"]`; spaces only then Back → still "Named once", also after a reload; cleared then Done → the field shows "Named once" again.
- "round 2: rename then the on-screen Back, then the browser closed: the new name is listed and kept": new Runner deck from the standard, typed "Back pressed", Back → listed (no "My Runner deck 1"), reload → still "Back pressed", "✓ Ready to play", one deck stored.

### Runs (all `--retries=0`)
- `qa-sprint13.spec.ts` + `s13-decks`, `s13-editor`, `s13-play`, `s13-rules`, 4 sizes (891×296, 844×390, 640×360, 1280×800): **170 passed, 2 skipped, 0 failed** (skips: upright check on desktop, phones only; thumb-swipe on desktop, touch only). The QA-S13-1 test now passes on all 4 sizes without the `test.fail` mark.
- `qa-sprint13-android.spec.ts` (app bundle): 1 passed.
- `npm run lint`: clean. `npm run typecheck`: clean. `npm test` (unit): 2635 passed, 0 failed (8 packages).
- Full screen-test suite: **CI on 3010866b78cbebb6cbcec7d0f509c3654bf8cdb9 passed**: `checks` success, `e2e` success (shards 1/4–4/4 all success), `guard-mutation`, `build`, `deploy`, `publish` success. Not re-run locally (docs/TESTING.md §2). QA's round-2 commit only adds tests, docs and screenshots.

### S-13-4 Your decks stay on your device: PASSED QA (5/5; AC5's real app close still an owner check)
| AC | Result | Evidence |
|---|---|---|
| A change is kept on leaving the editor or closing the app; no Save button | **PASS** (was FAIL) | qa "a rename typed and left without Done or Back, then the browser closed…" (passes, no `test.fail`); qa round-2 "name cleared to empty…" and "rename then the on-screen Back…"; card changes as round 1; `r2-<size>-name-cleared.png`, `r2-<size>-rename-back.png` |
| Listed later with name, count, Ready tick or short red note | PASS | as round 1 (re-run, passes 4 sizes) |
| Tap the name to rename | PASS | as round 1 + round-2 tests |
| Delete + confirm; standard decks have no Delete | PASS | as round 1 (re-run) |
| Android app keeps its own decks | PASS for the app bundle (re-run); **real app close = owner check** | `qa-sprint13-android.spec.ts` |

### Per-story results (final, round 2)
| Story | Criteria | Result |
|---|---|---|
| S-13-1 The Decks screen | 5/5 pass | PASSED QA |
| S-13-2 Add and remove cards | 5/5 pass | PASSED QA |
| S-13-3 The real deck rules | 6/6 pass | PASSED QA |
| S-13-4 Your decks stay on your device | 5/5 pass (Android app close: owner check on the phone) | PASSED QA |
| S-13-5 Pick your decks | 5/5 pass | PASSED QA |

Open bugs: none. Round-1 observations still stand (no fix asked).

### Screenshots (round 2)
`docs/sprints/sprint-13-qa/r2-<size>-name-cleared.png` (editor after clearing the name and Done: old name back) and `r2-<size>-rename-back.png` (Decks list after rename + Back + reload), size = 891x296, 844x390, 640x360, 1280x800.
