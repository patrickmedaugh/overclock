# Sprint 12 QA report (round 1)

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
- Full e2e on the QA commit: see "CI on the QA head" below (QA uses CI as the round's full pass, `docs/TESTING.md`).

## Needs the owner's phone
1. **Modded at 891×296 (QA-S12-1):** in a pass-the-phone game, when Kate has Modded and a few programs in hand, pick Modded and check whether you can tell which card each price belongs to.

## IP check
No new image or font files except QA screenshots. Card art is still drawn while the game runs. The six new cards use the real names and the 2012 text, which the owner's 2026-11-12 rule allows. Pass.
