# Sprint 1 — QA report

QA date: 2026-11-12 · Branch `sprint-01` (verified at e2bd0ea plus the QA files, not yet committed) · QA did not write the code under test.

Summary: **20 of 21 acceptance criteria PASS. 1 is an OWNER CHECK AT DEMO** (S-01-6 "Add to Home Screen", a manual check on a real phone; the automated part is green). **1 minor snappiness bug** (QA-S1-1, End turn ignores taps for about 0.7 s after a 4-card discard), **1 cosmetic bug** (QA-S1-2). No IP problems. QA added 2 engine tests and 16 Playwright runs (8 checks × phone/desktop).

Criteria are the ones in `sprint-01-proposal.md` as updated by the owner's answers: no hand-over screen (the board shows the active player at the bottom), an End turn button with no automatic end, and ending the turn early is allowed.

"P" = Playwright test, run on the phone project (390×844, real touch taps) and the desktop project (1280×800, mouse). "E" = engine/match Vitest test. All the tests named below passed in the runs recorded at the end.

## Acceptance criteria

| Story | Criterion (short) | Result | Evidence |
|---|---|---|---|
| S-01-1 | New game: Corp's turn, 3 clicks, free card already drawn (6 in hand) | **PASS** | E `engine/test/turn.test.ts` › "Corp is active on turn 1 with 3 clicks and has taken its free draw (6 cards)". P `e2e/turn.spec.ts` › "a new game starts on the Corp turn with 3 clicks and 6 cards (free draw taken)" (banner "TURN 1 · CORP · 3 clicks left"). QA playthrough: same values on phone and desktop. Screenshots `phone-390x844-01-corp-turn-1-on-load.png`, `desktop-1280x800-01-corp-turn-1-on-load.png`. |
| S-01-1 | Corp ends: Runner has 4 clicks, no free card | **PASS** | E `turn.test.ts` › "Corp end_turn (hand <= 5) -> turn_ended, turn_started(runner, 2, 4); Runner draws nothing". P `turn.spec.ts` › "after the Corp ends, the Runner has 4 clicks and no free card" (real taps: End turn, pick, Confirm). QA playthrough: Runner hand stays 5, banner "TURN 2 · RUNNER · 4 clicks left". Screenshot `phone-390x844-11-runner-turn-2-board-flipped.png`. |
| S-01-1 | Runner ends: Corp gets 3 fresh clicks and draws again | **PASS** | E `turn.test.ts` › "Runner end_turn -> turn_ended, turn_started(corp, 3, 3), card_drawn(top of Corp deck)", "the Corp draws exactly once per Corp turn and the Runner never draws for free". P `turn.spec.ts` › "after the Runner ends, the Corp gets 3 fresh clicks and draws its free card". QA playthrough: Corp 5 → 6 cards, 3 clicks, "TURN 3". Screenshots `phone-390x844-14-corp-turn-3-free-draw.png`, `desktop-1280x800-05-corp-turn-3.png`. |
| S-01-1 | Obvious whose turn it is and how many clicks are left | **PASS** | P `turn.spec.ts` (banner text checked every turn) and `board.spec.ts` › `expectActiveAtBottom` (every counter equals the game state). QA looked at every screenshot: a large banner in the player's color ("TURN 2 · RUNNER · 4 clicks left"), the active player's row at the bottom in the same color, and a clicks counter. |
| S-01-1 | Corp deck empty at its draw: "Runner wins: the Corp ran out of cards" | **PASS** | E `engine/test/deck-out.test.ts` (6 tests: game over event, every action refused afterwards, a click-draw from an empty deck is only refused). P `turn.spec.ts` › "when the Corp must draw from an empty deck, the Runner wins" (exact banner text, End turn gone, a tap only shows "The game is over"). Screenshot `phone-390x844-15-game-over-runner-wins.png`. |
| S-01-2 | Tap your credits: +1 with a quick pop, one click used | **PASS** | P `e2e/actions.spec.ts` › "tapping the corp's credits adds 1 with a quick pop and uses one click" and the same for the runner. Game updated < 100 ms after release, `credit_pop` started < 100 ms after release and lasts ≤ 600 ms. E `engine/test/gain-credit.test.ts`. Screenshot `phone-390x844-02-corp-credit-pop.png`. |
| S-01-2 | Tap your deck: a card flies into your hand, one click used (Corp and Runner) | **PASS** | P `actions.spec.ts` › "tapping the corp's deck flies a card into the hand and uses one click" and the runner version (state < 100 ms, `draw_flight` ≤ 600 ms, card lands inside the hand area). E `engine/test/draw.test.ts`. Screenshots `phone-390x844-03-corp-draw-mid-flight.png`, `phone-390x844-12-runner-after-credit-and-draw.png`. |
| S-01-2 | 0 clicks: nothing happens except "No clicks left" | **PASS** | P `actions.spec.ts` › 'with 0 clicks, the corp's credits and deck do nothing but show "No clicks left"' (and runner): game state unchanged, only a hint animation, hint < 10% of the screen, inside the safe area, goes away by itself. E `draw.test.ts` / `gain-credit.test.ts` "0 clicks -> no_clicks, state unchanged". Screenshot `phone-390x844-05-no-clicks-hint.png`. |
| S-01-2 | Not your turn: tapping deck or credits does nothing | **PASS** | P `actions.spec.ts` › "it is not the opponent's turn: tapping the top row does nothing" (no state change, no events, no animation) and "the waiting player's actions are refused with "Not your turn"". E `engine/test/rules.test.ts` › "every action off-turn is not_your_turn, for both sides"; `match/test/local-match.test.ts` seat checks. QA playthrough: tapping the Corp's deck and credits on the Runner's turn changed nothing. |
| S-01-3 | End turn button is there; glows brighter once all clicks are used | **PASS** | P `turn.spec.ts` › "End turn is there and glows brighter once all clicks are used" (game's own flag). **Added by QA:** P `e2e/qa-sprint01.spec.ts` › "the End turn button is clearly brighter on screen once all clicks are used", which measures the real pixels: average brightness of the button goes from about 17 to about 99 (out of 255), and the share of bright pixels from 8% to 90%. Screenshots `phone-390x844-01…` (dim) vs `phone-390x844-04-corp-0-clicks-end-turn-glowing.png` (lit), `desktop-1280x800-02-corp-0-clicks-glow.png`. |
| S-01-3 | End turn with clicks left ends the turn anyway | **PASS** | P `turn.spec.ts` › "ending with clicks left ends the turn anyway (leftover clicks are lost)". E `turn.test.ts` › "Corp may end with clicks left", "Runner may end with all 4 clicks left". QA playthrough: Runner ended with 2 clicks left (it held 6 cards, so the discard step came first). Screenshot `phone-390x844-13-runner-ends-early-hand-limit-discard-1.png`. |
| S-01-3 | After the last click the turn does not end by itself | **PASS** | P `turn.spec.ts` › "the turn does not end by itself after the last click" (waits 1 s at 0 clicks: same turn, End turn glowing). E `turn.test.ts` › "spending the last click does not end the turn by itself". The engine property test below also confirms End turn is always offered and the turn never passes without it. |
| S-01-3 | Turn change in well under a second, no extra screens | **PASS** | P `turn.spec.ts` › "the turn change is fast, with no extra screen, and the next player can act at once" (new seat inside the same tap, no cover screen, picker or zoom; the next player's deck tap works at once) and "turn change with a 4-card discard is still scheduled within 600ms". **Added by QA:** `qa-sprint01.spec.ts` › "Runner discards 4, then the Corp turn starts with its free draw…": the board flips to the Corp without any tap in **310–440 ms** on this machine (worst case, 4 cards flying), and the Corp's deck tap then draws. See QA-S1-1 for a smaller problem with the End turn button in that same moment. |
| S-01-4 | Turn change: active player's side at the bottom, hand face up, no cover screen | **PASS** | P `e2e/board.spec.ts` › "Corp turn: Corp at the bottom with its hand, Runner on top as a count", "Runner turn: the board flips straight away, no cover screen" (and back to the Corp). Screenshots `phone-390x844-11…` (Runner at the bottom) and `phone-390x844-14…` (Corp at the bottom). |
| S-01-4 | You see how many cards your opponent holds, not what they are | **PASS** | E `engine/test/view.test.ts` › "shows the viewer their own hand and hides the opponent hand (count only)", "never exposes deck order…"; "hides cardId of opponent draws". P `board.spec.ts` (opponent hand is `null` in the view; top label reads "5 cards in hand"). The Corp's discards also reach the Runner face down (`phone-390x844-11…`, top row shows card backs). |
| S-01-5 | More than 5 cards at End turn: asks you to pick, shows how many ("Discard 2") | **PASS** | P `e2e/discard.spec.ts` › "ending with more than 5 cards asks you to pick, showing how many are left". E `engine/test/discard.test.ts` AC1 group. QA playthrough: 7 cards → "Discard 2". Screenshots `phone-390x844-06-discard-picker-discard-2.png`, `phone-390x844-13…` (Runner side). |
| S-01-5 | Tap marks, tap again un-marks; long-press still zooms | **PASS** | P `discard.spec.ts` › "tap marks a card, tap again un-marks it; you cannot pick more than asked", "long-press still zooms a card while picking, without marking it" (real touch hold on phone). Screenshots `phone-390x844-07-one-card-marked-discard-1.png` ("Discard 1", card shows a DISCARD tag), `phone-390x844-08-long-press-zoom-while-picking.png`, `desktop-1280x800-03-discard-picker-two-marked.png`. |
| S-01-5 | Confirm: cards fly to your discard pile, its count goes up, turn ends | **PASS** | P `discard.spec.ts` › "Confirm sends the picked cards to the discard pile and ends the turn", "the Runner's discards are face up to the Corp". **Added by QA:** `qa-sprint01.spec.ts` › "Confirm flies the picked cards to the actor's own discard pile, whose count then goes up" (the flight target is exactly the player's pile; count 0 → 2). E `discard.test.ts` AC3 group. Screenshot `phone-390x844-11…` (Corp's pile shows 2 after confirming 2). |
| S-01-5 | 5 or fewer cards: nothing asked, turn just ends | **PASS** | P `discard.spec.ts` › "with 5 or fewer cards nothing is asked and the turn just ends". E `discard.test.ts` AC4 group, plus the QA property test below (over 200 random games, the discard step appears exactly when the hand is over 5). |
| S-01-6 | Home-screen launch (full-screen): nothing under notch, status bar, gesture bar | **OWNER CHECK AT DEMO** (automated part PASS) | This needs a real phone, so the owner checks it at the demo. What QA could check: P `e2e/load.spec.ts` › "home-screen install: manifest (standalone) and iOS full-screen tags are present"; the built page has the manifest (`display: standalone`) and the full-screen tags; the layout reads the phone's real notch/bar sizes (`env(safe-area-inset-*)`, how phones report them), and the criterion below passes with simulated notches. |
| S-01-6 | Phone shapes with notch and gesture bar: board and End turn inside the safe area | **PASS** | P `e2e/safe-area.spec.ts` (iPhone notch 47/34 and Android bars 24/48: board, End turn, hand, picker, hints, game-over panel, also on a 360×640 phone). Client unit test `apps/client/test/layout.test.ts` (several phone shapes × insets). **Added by QA:** `qa-sprint01.spec.ts` › "nothing is drawn in the notch / gesture-bar bands, on the board and in the picker" (real pixels: 0 bright pixels in those bands) and "a long-press zoomed card stays inside the safe area". Screenshots `phone-390x844-16-safe-area-*.png`, `phone-390x844-17-safe-area-*-picker.png`, `phone-360x640-extra-picker-with-android-bars.png`. |

Criterion count: S-01-1 ×5, S-01-2 ×4, S-01-3 ×4, S-01-4 ×2, S-01-5 ×4, S-01-6 ×2 = 21. Result: **20 PASS, 1 OWNER CHECK AT DEMO**.

## Other required checks

| Check | Result | Evidence |
|---|---|---|
| Snappiness: taps respond in < 100 ms | **PASS** | `expectSnappy` in `actions.spec.ts` and `turn.spec.ts`: game state < 100 ms after release, animation started < 100 ms after release, on phone (touch) and desktop. |
| Snappiness: no animation blocks input > 600 ms | **FAIL (minor), see QA-S1-1** | Every animation is scheduled ≤ 600 ms and deck/credit taps never wait. But after a 4-card discard the next player's **End turn** answers only **650–755 ms** after Confirm (10 of 10 runs). Test: `qa-sprint01.spec.ts` › "after a 4-card discard, the next player's End turn answers within 600ms of Confirm" (marked as a known failure with `test.fail`, so the suite stays green until it's fixed). |
| Empty timing windows auto-pass | **PASS** (as far as Sprint 1 goes) | Sprint 1 has no response windows yet. **Added by QA:** `packages/engine/test/qa-no-empty-windows.test.ts`: over 200 random full games, the game never waits on a player with nothing to do, the waiting player is never asked for anything, End turn is always available, the hand-limit step appears exactly when the hand is over 5 (otherwise the turn just passes), and a finished game waits on nobody. Must be re-tested when runs and responses arrive. |
| Original IP only | **PASS** | `packages/cards/test/ip-check.test.ts` and `ip-art-and-ui.test.ts` pass. No card was added or changed this sprint (`packages/cards` untouched since Sprint 0). New on-screen words (End turn, Confirm, Discard N, hand limit, "Runner wins: the Corp ran out of cards", hints) are original. The manifest, page title and icon say "OVERCLOCK" and use plain shapes. The word "android" only appears inside the graphics library (phone detection) and in test comments about Android phones, never on screen. Note: the rules docs and code comments use the genre's zone words (Archives, heap, HQ, R&D); they are not shown on screen, the screen just says "DISCARD". |
| Phone 390×844 and desktop | **PASS** | Playthrough below, both e2e projects. |

## Bugs found

### QA-S1-1 (minor, snappiness): End turn ignores taps for about 0.7 s after a big discard
- **What happens:** right after a player confirms a 4-card discard, the next player's End turn button stays dead for 650–755 ms after the Confirm tap, with no feedback. The budget is "no animation blocks input for more than 600 ms". Deck and credits taps are fine.
- **Repro (phone or desktop, `?seed=1`):**
  1. Corp: tap End turn, pick 1 card, tap Confirm (the Runner's turn starts).
  2. Runner: tap your deck 4 times (9 cards), tap End turn. "Discard 4" appears.
  3. Tap 4 cards, then tap Confirm.
  4. Within about 0.7 s, tap End turn on the Corp's board. Nothing happens. A tap after about 0.75 s works (the Corp's "Discard 1" step opens).
  - Automated: `npx playwright test e2e/qa-sprint01.spec.ts -g "answers within 600ms"`. It is marked `test.fail`, so it currently shows as an expected failure. Each run records `endTurnFirstAnswerMs` (10 QA runs: 651, 654, 668, 681, 691, 727, 747, 747, 752, 755 ms; board flip at 309–410 ms).
- **Why:** `apps/client/src/board.ts` `rebuild()` sets `endTurnArmedAt = performance.now() + timing.endTurnGuard` (300 ms) when the flip happens, and `handoff()` delays the flip until the discard flight ends (`fx.after(discardMs, …)`, 295 ms for 4 cards, later when frames are slow). So the guard ends at about discard + frame delay + 300 ms. That is 595 ms on paper, and over 600 ms in practice.
- **Suggested direction (developer's call):** count the double-tap guard from the Confirm/End-turn tap rather than from the flip, or shorten it, so the next seat's End turn is usable ≤ 600 ms after the tap. When fixed, remove `test.fail` from that test.
- **Owner impact:** hardly noticeable on one shared phone (the other person rarely taps that fast), but it breaks the team's own budget and will matter more once each player has their own device.

### QA-S1-2 (cosmetic): count badge covers the top card's name on a face-up discard pile
- **What happens:** once a pile shows a face-up top card, its count badge (for example "10" or "1") sits on top of the card's name and type, which are then hard to read: "Mindshare Patent" in `phone-390x844-15-game-over-runner-wins.png`, "Rooftop Medic / RESOURCE" in `phone-390x844-14-corp-turn-3-free-draw.png`.
- **Repro:** play until a player has discarded (for example step 1 above). Look at that player's pile, face up to its owner and, for the Runner's pile, to both players.
- Not part of any criterion (each criterion only needs the count to go up, and it does). Suggest moving the badge below the card or making the top card smaller.

## Observations (not failures)

1. **Turn-change feel.** The board flips 0.3–0.44 s after End turn/Confirm on this machine (no GPU). The Corp's free-draw card then flies in, so the whole sequence can last up to about 0.7 s on desktop, but input already goes to the new player during it. Feels quick in the playthrough.
2. **Tapping during the discard flight only skips ahead.** By design (architect review), a deck/credits tap while the discards are still flying finishes the animation and shows the next player. It does not act for them. It's covered by `turn.spec.ts` › "a tap on the deck while the discards still fly away…".
3. **Runner's hand row sits lower than the Corp's** when it has 5 cards (one row): there's an empty band between the row of counters and the hand (`phone-390x844-11…`). Not overlapping, just a looks question for the demo.
4. **Hand reflow at the 6th card** (one row → two rows) is still there, as planned (backlog).
5. The game-over panel offers **New game**. Not asked for, harmless.
6. On a 360×640 phone with Android bars the picker and an 8-card hand fit (`phone-360x640-extra-picker-with-android-bars.png`).

## Definition of Done checklist

| Item | Result | Evidence |
|---|---|---|
| All acceptance criteria pass | 20/21 PASS, 1 owner check at demo | Table above |
| Engine logic has Vitest unit tests | PASS | `packages/engine/test/*` (107 tests incl. 2 QA), `packages/match/test` (8) |
| Every criterion has at least one automated test | PASS | Table above (S-01-6 home-screen: manifest test + safe-area tests; the rest is the owner's manual check) |
| `npm run lint` | PASS (exit 0) | local, with QA files |
| `npm run typecheck` | PASS (exit 0) | local, with QA files |
| `npm test` | PASS: 292 tests (ai 3, cards 36, engine 107 incl. 2 QA, match 8, client 138) | local |
| `npm run build` | PASS | main bundle 382 kB (117 kB gzipped); CSP meta tag and `manifest.webmanifest` present in `dist/` |
| `CI=1 npm run test:e2e` | PASS (exit 0): 112/112 (96 team + 16 QA; the 2 QA-S1-1 runs count as expected failures) | local. Before QA files: 96/96 |
| Works on 390×844 phone and desktop | PASS | e2e projects + playthrough screenshots |
| Snappiness budget | Partial: see QA-S1-1 | above |
| Original IP only | PASS | above |
| Demo notes | Not QA's item | PM, phase DEMO |

## Playthrough and screenshots (`docs/sprints/sprint-01-qa/`, 2× pixel density)

QA played one full cycle with real taps on a 390×844 phone (touch) and a 1280×800 desktop (mouse), seed 1: Corp credit → draw → credit (0 clicks, End turn lights up) → "No clicks left" → End turn → "Discard 2" → mark, zoom, mark → Confirm → Runner turn (board flips, Corp pile shows 2 face down) → Runner credit + draw → tap the Corp's deck (nothing) → End turn early with 2 clicks left → "Discard 1" → Confirm → Corp turn 3 with its free draw → played on to game over. Then repeated with simulated notches.

- `phone-390x844-01-corp-turn-1-on-load.png`: new game, Corp's turn, 3 clicks, 6 cards
- `phone-390x844-02-corp-credit-pop.png`: just after tapping credits
- `phone-390x844-03-corp-draw-mid-flight.png`: just after tapping the deck
- `phone-390x844-04-corp-0-clicks-end-turn-glowing.png`: 0 clicks, End turn lit
- `phone-390x844-05-no-clicks-hint.png`: "No clicks left"
- `phone-390x844-06-discard-picker-discard-2.png`: hand limit, "Discard 2", Confirm dimmed
- `phone-390x844-07-one-card-marked-discard-1.png`: one card marked, "Discard 1"
- `phone-390x844-08-long-press-zoom-while-picking.png`: long-press zoom while picking
- `phone-390x844-09-two-marked-confirm-ready.png`: two marked, Confirm lit
- `phone-390x844-10-discards-flying-after-confirm.png`: about 0.1 s after Confirm (the screenshot itself is slow, so the flip already shows)
- `phone-390x844-11-runner-turn-2-board-flipped.png`: Runner's turn, Runner at the bottom, Corp's pile 2 (face down)
- `phone-390x844-12-runner-after-credit-and-draw.png`
- `phone-390x844-13-runner-ends-early-hand-limit-discard-1.png`: Runner ended with clicks left, holding 6
- `phone-390x844-14-corp-turn-3-free-draw.png`: Corp's turn 3, 6 cards, Runner's pile face up
- `phone-390x844-15-game-over-runner-wins.png`: "Runner wins: the Corp ran out of cards"
- `phone-390x844-16-safe-area-iphone-notch-47-34.png`, `phone-390x844-16-safe-area-android-bars-24-48.png`: simulated notch/bars, board
- `phone-390x844-17-safe-area-iphone-notch-47-34-picker.png`, `phone-390x844-17-safe-area-android-bars-24-48-picker.png`: same, picker
- `phone-360x640-extra-picker-with-android-bars.png`: small phone, 8 cards, picker
- `desktop-1280x800-01-corp-turn-1-on-load.png`, `-02-corp-0-clicks-glow.png`, `-03-discard-picker-two-marked.png`, `-04-runner-turn-2.png`, `-05-corp-turn-3.png`

## Files added by QA

- `packages/engine/test/qa-no-empty-windows.test.ts`: no empty timing windows / hand-limit step only when needed (random full games).
- `apps/client/e2e/qa-sprint01.spec.ts`: End turn glow in real pixels; discard flight goes to the player's own pile; empty notch/gesture bands in real pixels; zoom inside the safe area; worst-case turn change timing; QA-S1-1 known-failure test.
- `docs/sprints/sprint-01-qa/`: screenshots above.
