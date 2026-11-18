# Sprint 11 QA report (round 1)

QA did not write the Sprint 11 code. Checked on branch `sprint-11`, head e8b86b7 (plus this QA commit).
Sizes: 844×390 (phone), 640×360 (phone-small), 891×296 (the owner's phone with Chrome's address bar, `phone-short`) and 1280×800 (desktop).
Screenshots: `docs/sprints/sprint-11-qa/<size>-NN-*.png` (all of 640×360 and 891×296, a few at 844×390 and 1280×800; palette PNGs, 2.3 MB).

## Result

**21 acceptance criteria: 19 pass, 0 fail, 2 pass in our test browsers but need one check on the owner's phone** (a real Android app kill, and the Android phone font on the card numbers). No bugs found. No IP problems.

| Story | Pass | Fail | Owner's phone check |
|---|---|---|---|
| S-11-1 Break buttons name their card and the ICE type | 6 | 0 | – |
| S-11-2 No extra pick step with one subroutine | 4 | 0 | – |
| S-11-3 Save a game and continue later | 7 | 0 | 1 (AC2, real app kill) |
| S-11-4 Card numbers readable | 2 | 0 | 1 (AC1, Android font) |

## QA tests (new)
- `apps/client/e2e/qa-sprint11.spec.ts` — runs at all 4 sizes (added to `SHORT_SPECS` so it also runs at 891×296; the online test is skipped there like the other online specs). Local run, `--retries=0`: **47 passed, 1 skipped** (the online test at 891×296).
- `apps/client/test/qa-sprint11.test.ts` — labels on **real engine encounters**: every planner goal of every sprint, 3 seeds, played in `LocalMatch`; at each Runner encounter, each card button is checked against card data and the engine's options (Battering Ram, Corroder, Pipeline seen; Gordian Blade and Ninja are covered by the e2e below).
- `packages/match/test/qa-sprint11.test.ts` — save → JSON text → load **after every move** of 162 planned game paths (2,702 saves; 212 mid-run, 25 mid-encounter with breaker options, 30 mid-choice): full state, both seats' views and the save are identical, the restored Runner view leaks nothing (`runnerViewLeaks`), neither seat gets the other's hand, and the restored game answers the next moves exactly like the live one. Plus: a refused move is never saved; finished / older rules / newer rules / a move the rules now refuse / 10 kinds of broken input.

## Evidence per criterion

### S-11-1 Break buttons name their card and the ICE type
| AC | Result | Evidence |
|---|---|---|
| 1 Ice Wall + Battering Ram: names Battering Ram, says barrier, shows price | PASS | e2e `Ice Wall with Battering Ram (and Gordian Blade)…`: exact label "Battering Ram: break barrier sub · 2 credits", `source` r17, nothing shortened. `*-01-ice-wall-ram-gordian.png` |
| 2 Strength button names Battering Ram | PASS | same test: "Battering Ram: +1 str · 1 credit" |
| 3 Ram + Gordian both installed: each button alone says which card | PASS | same test (Gordian has nothing on Ice Wall and no button claims it); `qa-sprint03` Enigma vs Gordian ("Gordian Blade: break code gate sub … / +1 str"); unit test on real encounters (every card button starts with "Card name: ") |
| 4 Any other card button names its card | PASS | `qa-sprint07` / `qa-sprint10` "Bank Job: take credits" (`source` r10), Cyberfeeder "pays" labels in the unit test; Rez buttons already name the ICE |
| 5 Heimdall: "up to 2"; one subroutine: no "up to 2" | PASS | e2e Heimdall test: "Battering Ram: break up to 2 barrier subs · 2 credits"; on Ice Wall and with one Heimdall subroutine left: "break barrier sub". Unit test: "up to N" appears exactly when the engine offers a pick of N ≥ 2, never with one open subroutine. `*-03-heimdall-ram-up-to-2.png` |
| 6 Every label readable in full, thumb size, 4 sizes | PASS | `expectRunButtonsGood` at all 4 sizes (text ≥ 14 px at 844×390, ≥ 12 desktop, ≥ 11.5 at 640×360 / 891×296; ≥ 44 px; inside the screen; no overlaps; card name and price never cut). The QA-S3-4 checks in `qa-sprint03` still hold; at 640×360 Gordian's subroutine text is cut ("The…"), which the architect ruled acceptable (the panel lists it in full); QA now checks that only that text is cut. |

### S-11-2 No extra pick step when there's only one subroutine
| AC | Result | Evidence |
|---|---|---|
| 1 Ice Wall: one tap breaks it, 2 credits paid, no pick | PASS | same Ice Wall e2e: a real tap, answered < 100 ms, one `subroutine_broken`, −2 credits, no toggle / confirm / Back. `*-02-ice-wall-broken-no-pick.png` |
| 2 Heimdall: pick step, hint "Pick up to 2" | PASS | e2e Heimdall: real taps pump Ram, the pick shows 3 subroutines and a dim "Pick up to 2". `*-04-heimdall-pick-up-to-2.png` |
| 3 One unbroken subroutine left: broken directly | PASS | e2e: after "Break 2", the last one is a plain button carrying the engine's single option (`subs` = the open one), no pick. In QA's game Ram had no credits left to tap it, so the tap itself is covered by `qa-sprint03` (Gordian's last subroutine, one tap) and by ui-dev's 7-credit `s11-break` test. `*-05-heimdall-one-left-plain.png` |
| 4 Pick words match what you can pick | PASS | e2e: "Pick up to N" with N = the most subroutines in the engine's options; "Break 1 · 2 credits" after one pick; picking a third never holds more than N, and the picked set is an offered option; the broken subroutines are the picked ones. |

### S-11-3 Save a game and continue later
| AC | Result | Evidence |
|---|---|---|
| 1 Pass-the-phone: close tab, open: Continue game, same board, same turn | PASS | e2e `real taps are saved…`: two real taps saved, tab closed, a new tab shows "Continue game · On this device · Corp's turn"; Continue opens behind the Corp cover; after it, the view is identical, same hand, play goes on and keeps saving. `*-06-start-continue-game.png`, `*-07-restored-cover-corp.png`, `*-08-restored-board-corp.png` |
| 2 Android kills the app: Continue brings it back | PASS in test, **owner check** | ui-dev's `android.spec.ts` "the app killed and opened again" (Android bundle, a real tap saved, context reopened) — passes in CI. The architect's reasoning (the WebView's storage survives the process) is sound, but a real Android process kill can't be done in our tests. |
| 3 Online Leave for now: other player reads "The Corp/Runner left for now. The game is saved"; nothing lost | PASS | e2e (QA's own case: the Corp leaves **while its own rez decision is open**): the Runner reads "The Corp left for now. The game is saved"; the Runner's view is unchanged; the decision comes back. ui-dev's `s11-online` covers the Runner leaving. `640x360-12-online-runner-reads-corp-left.png` |
| 4 Continue game · CODE, back in the seat without typing | PASS | same test: "Continue game · CODE / Online · you play the Corp", no text box, the Corp's view is identical, Rez with a real tap reaches the Runner. `qa-sprint06` reload test now uses "Continue game · CODE". `*-13-online-corp-continue-code.png` |
| 5 Both back within a week: play goes on; then cleared | PASS | ui-dev's `s11-online` "both leave for now; both come back" (passes in CI); engine-dev's `sprint11-room.test.ts` (fake clock: still there after 6 d 23 h, gone at 7 days from the leave, the leave restarts the clock). QA reviewed these; no separate QA test. |
| 6 Finished game: no Continue | PASS | e2e: a game won by a Score, the save is deleted at once; closing on the game-over box and opening later shows no Continue. Online: `qa-sprint06` game-over test now checks no "Continue game" row. Unit: a finished save loads as `finished`. `*-15-game-over-hotseat.png` |
| 7 Save from before a rules update: plain note, start a new game | PASS | e2e for a newer rules version **and** for a move the rules now refuse: "That saved game can't continue on this new version of the game. Start a new game.", no game opens, Continue is gone, "Play on this device" starts turn 1. A broken save shows no Continue and nothing breaks. `*-10-outdated-note.png` |
| 8 Board, hands, credits, clicks, turn exact; no hidden cards to the wrong player | PASS | Unit sweep (2,702 saves, see above). e2e hidden-info test: two different games restored mid-run with the Corp's decision open: the cover goes to the Corp, and **the two cover screenshots are pixel-identical** (the cover shows nothing about the game). After it, no hand is drawn at all while the Corp decides (same as live play). `*-09-restored-cover-to-corp-mid-run.png` |

Also checked: a pass-the-phone save and an online seat on the same device show two Continue rows that fit at all 4 sizes (`*-11-start-two-continue-rows.png`).

### S-11-4 Card numbers readable (first to cut)
| AC | Result | Evidence |
|---|---|---|
| 1 Every number shows in full on your phone | PASS in Chromium, **owner check** | e2e sweep below; real long-press on Corroder shows "Strength 2", "Memory 1", no overflow (`*-14-zoom-corroder-stats.png`). The stat line now uses the UI font instead of the monospace font, which matches QA's Sprint 10 finding (Android cut the right end of a monospace line). Chromium never showed the bug, so only the owner's phone can confirm the fix. |
| 2 Small table cards: a label shows with its number | PASS | Small table cards draw no stat line at all (name and type only), so no label can show without its number; the smallest full faces (120 px, access view) are in the sweep below. |
| 3 Every card of both decks fits, 4 sizes | PASS | e2e `every card of both decks…`: all 40 cards (identities included) at widths 120, 140, 170, 210 px and the zoom size, at all 4 sizes: each stat is "Label N" with the right label and number from card data, full words at the zoom size, inside the card with 1 px to spare, ≥ 8 px, not overlapping. |

## Bugs
None found in this round.

### Minor observations (no fix asked)
- After a pass-the-phone game ends, the game-over button is "New game", which starts and saves a new game at once. If the owner taps it and then closes the app, the next start screen offers "Continue game" for that new, unplayed game. That is not the finished game, so AC6 holds.
- At 640×360 a long Gordian Blade subroutine is cut to `"The…"` on its button (architect ruling 2026-11-17; the run panel shows it in full). Readable, but the two Enigma buttons look alike at a glance until you read the panel.
- In the pass-the-phone pick step, after Ram's two breaks QA's game had no credits for the third (planner's credits). Not a bug.

## Snappiness
- Run taps (Break, +1 str, the pick, Break 2) answered < 100 ms (measured in the page).
- Online **Leave for now**: the dialog closes and "Saving…" shows 16–18 ms after the tap is handled; the start screen is there 311–362 ms later with the local service (cap 1.5 s, architect ruling). No animation blocks input.
- Empty timing windows are still auto-passed: engine `qa-no-empty-windows.test.ts` and the rest of the unit suite are green.

## QA-owned spec updates (labels only, every check kept)
All failures in CI on e8b86b7 (run 44143599428: 40 failures, all in QA-owned specs) were the new Sprint 11 words. Updated, no size floor or check loosened; where the drawn label may be cut, QA compares `fullLabel`:
- `qa-sprint03-pass2` :314 Ninja ("Ninja: break sentry sub · 1 credit", "Ninja: +5 str · 3 credits", `source` r06), :343 Gordian ("Gordian Blade: +1 str · 1 credit"; now also checks there are exactly 2 lit breaks at the second Enigma), :440 / :511 / :588 Corroder labels.
- `qa-sprint03` :183 Enigma vs Gordian: compares full labels, and a new `expectFairCut` checks that only the quoted subroutine text may be cut (name, "break code gate sub" and price whole); after one break, the plain "Gordian Blade: break code gate sub · 1 credit".
- `qa-sprint06` :222 no "Continue game" (or "Rejoin") after an online game over; :336/:345/:353 "Continue game · CODE".
- `qa-sprint07` :311 "Bank Job: take credits" (+ `source` r10); :354 Corroder labels on Ice Wall.
- `qa-sprint08` :388 Corroder on Heimdall (3 breaks with subroutine text, the last one plain), :433 Ram pump, :463 Pipeline on Hunter.
- `qa-sprint10` :511 / :564 "Bank Job: take credits".
Local re-run of exactly these tests at all sizes, `--retries=0`: 46 passed, 1 skipped (online at 891×296, by design).

## Checks
- `npm run lint`, `npm run typecheck`: pass. `npm test`: all unit suites pass (2,338 tests across the 8 workspaces, including the 2 new QA files).
- Full e2e on the QA commit bfd35a7 (CI run 44152755768, all 4 shards, CI retries=1): **1,543 passed, 0 failed, 0 flaky, 14 skipped** (shards 384 / 384 / 386 / 389). `checks` (lint, typecheck, unit), `guard-mutation`, build, Android and deploy: all green. QA used this CI run as the round's full pass instead of a local re-run (`docs/TESTING.md`).
- Before the QA commit, CI on e8b86b7 (run 44143599428) was red only because of the QA-owned specs listed above (40 failures in 13 tests, all old labels).

## Needs the owner's phone
1. **Card numbers (S-11-4 AC1):** open a big card for Wall of Static, Ichi 1.0 and Corroder in the hand view and check that "Strength 3", "Strength 4" and "Strength 2 · Memory 1" show in full.
2. **Real app kill (S-11-3 AC2):** in the Android app, start a pass-the-phone game, make a move, swipe the app away from recent apps, open it again: "Continue game" should bring the game back behind the cover.

## IP check
No new image or font files except QA screenshots. Card art is still drawn at runtime. Real card names and text are allowed by the owner's 2026-11-12 rule. Pass.
